import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { API_URL } from '@/constants/Config';
import { useToast } from '@/context/ToastContext';
import { palette, styles } from '../styles';
import { IAppointmentDetails, IImage } from '../types';
import { SectionCard, HeaderIconButton } from './shared';

interface Props {
  appointment: IAppointmentDetails;
  token: string | null;
  isDark: boolean;
  onRefresh: () => Promise<void> | void;
}

type UploadStatus = 'preparing' | 'uploading' | 'processing' | 'failed';

type UploadingImage = {
  localId: string;
  uri: string;
  status: UploadStatus;
  progress: number; // 0..100, never goes backwards within one attempt
  attempt: number; // 1-based, > 1 means we're retrying after a dropped connection
  error?: string;
};

type PreparedFile = { uri: string; name: string; type: string };

class UploadError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const CARD_PADDING = 18;
const SCREEN_PADDING = 16;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const TILE_SIZE = Math.floor((SCREEN_W - SCREEN_PADDING * 2 - CARD_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

// The server shrinks every photo to 1200px wide anyway, so sending a 12MP original over
// a weak cell signal only makes uploads slow and fragile. 1600px on the long side keeps
// portrait shots at >= 1200px wide after the server resize.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
const MAX_ATTEMPTS = 3;
const UPLOAD_TIMEOUT_MS = 120_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function prepareImage(asset: ImagePicker.ImagePickerAsset): Promise<PreparedFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const { width, height } = asset;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      context.resize(width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
    }
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
      return { uri: saved.uri, name: `photo-${Date.now()}.jpg`, type: 'image/jpeg' };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}

function describeHttpError(status: number, body: string): UploadError {
  let serverMessage = '';
  try {
    const parsed = JSON.parse(body);
    serverMessage = Array.isArray(parsed?.message) ? parsed.message.join(', ') : parsed?.message || '';
  } catch {}

  if (status === 401) return new UploadError('Your session has expired. Please sign in again.', false);
  if (status === 403) return new UploadError('You are not allowed to upload photos for this job.', false);
  if (status === 413) return new UploadError('The photo is too large for the server.', false);
  if (status === 408 || status === 429 || status >= 500) {
    return new UploadError(`Server error (${status})${serverMessage ? `: ${serverMessage}` : ''}`, true);
  }
  return new UploadError(serverMessage || `Upload failed (status ${status})`, false);
}

export default function PhotosTab({ appointment, token, isDark, onRefresh }: Props) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();

  const [uploading, setUploading] = useState<UploadingImage[]>([]);
  // Photos the server already accepted but the appointment hasn't been refetched with yet.
  // Swapping the progress tile for one of these in the same render is what keeps the grid
  // from flashing an empty slot or showing the photo twice.
  const [recent, setRecent] = useState<IImage[]>([]);
  // Local file for freshly uploaded photos so the tile doesn't blink while the S3 copy downloads
  const [localPreviews, setLocalPreviews] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const serverImages = appointment.job.images;
  const images = useMemo(() => {
    const list = serverImages || [];
    const ids = new Set(list.map((i) => i.id));
    return [...list, ...recent.filter((i) => !ids.has(i.id))];
  }, [serverImages, recent]);

  // Once a refetch includes a photo, the server list is the source of truth for it again
  useEffect(() => {
    const ids = new Set((serverImages || []).map((i) => i.id));
    setRecent((prev) => (prev.some((i) => ids.has(i.id)) ? prev.filter((i) => !ids.has(i.id)) : prev));
  }, [serverImages]);

  // One queue for the whole tab, so picking more photos mid-upload doesn't start a second
  // parallel loop that fights over the same connection
  const assetsRef = useRef(new Map<string, ImagePicker.ImagePickerAsset>());
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);

  const patchUpload = (localId: string, patch: Partial<UploadingImage>) =>
    setUploading((prev) => prev.map((u) => (u.localId === localId ? { ...u, ...patch } : u)));

  // ─── Upload ────────────────────────────────────────────────────────────────
  const pickAndUpload = async (source: 'camera' | 'library') => {
    if (!token) return;

    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access needed', 'Allow camera access in Settings to take job photos.');
        return;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photos access needed', 'Allow photo library access in Settings to attach job photos.');
        return;
      }
    }

    // Full quality here — the single compression pass happens in prepareImage
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: 10 });

    if (result.canceled || !result.assets?.length) return;

    const batch: UploadingImage[] = result.assets.map((asset, i) => {
      const localId = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      assetsRef.current.set(localId, asset);
      return { localId, uri: asset.uri, status: 'preparing', progress: 0, attempt: 1 };
    });
    setUploading((prev) => [...prev, ...batch]);
    enqueue(batch.map((u) => u.localId));
  };

  const enqueue = (localIds: string[]) => {
    queueRef.current.push(...localIds);
    void runQueue();
  };

  const runQueue = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    let uploadedAny = false;
    try {
      // Sequential so a 10-photo burst doesn't split a weak uplink ten ways
      while (queueRef.current.length) {
        const localId = queueRef.current.shift()!;
        if (await processOne(localId)) uploadedAny = true;
      }
    } finally {
      runningRef.current = false;
    }
    if (uploadedAny) await onRefresh();
  };

  const processOne = async (localId: string): Promise<boolean> => {
    const asset = assetsRef.current.get(localId);
    if (!asset) return false;

    patchUpload(localId, { status: 'preparing', progress: 0, attempt: 1, error: undefined });
    let file: PreparedFile;
    try {
      file = await prepareImage(asset);
    } catch (err) {
      console.warn('Photo compression failed, uploading the original', err);
      file = { uri: asset.uri, name: asset.fileName || `photo-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' };
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      patchUpload(localId, { status: 'uploading', progress: 0, attempt });
      try {
        const image = await sendImage(file, localId);
        if (image) {
          setRecent((prev) => [...prev, image]);
          setLocalPreviews((prev) => ({ ...prev, [image.id]: file.uri }));
        }
        setUploading((prev) => prev.filter((u) => u.localId !== localId));
        assetsRef.current.delete(localId);
        return true;
      } catch (err) {
        const error = err instanceof UploadError ? err : new UploadError(String((err as any)?.message || err), true);
        console.warn(`Photo upload attempt ${attempt} failed:`, error.message);
        if (!error.retryable || attempt === MAX_ATTEMPTS) {
          patchUpload(localId, { status: 'failed', error: error.message });
          showToast({ message: `Photo upload failed: ${error.message}`, type: 'error' });
          return false;
        }
        await wait(1500 * attempt);
      }
    }
    return false;
  };

  // XMLHttpRequest instead of fetch so we can show per-photo upload progress.
  // The X-Upload-Id lets the server recognise a retry of a photo it already saved —
  // a connection that drops after the body was sent would otherwise leave a duplicate.
  const sendImage = (file: PreparedFile, localId: string) =>
    new Promise<IImage | null>((resolve, reject) => {
      const form = new FormData();
      form.append('image', file as any);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/jobs/${appointment.job.id}/images`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-Upload-Id', localId);
      xhr.timeout = UPLOAD_TIMEOUT_MS;

      let lastPct = 0;
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable || !e.total) return;
        // Android can report progress out of order — only ever move forward
        const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
        if (pct <= lastPct) return;
        lastPct = pct;
        // Body fully sent: the server is still resizing and copying to storage
        patchUpload(localId, pct >= 100 ? { status: 'processing', progress: 100 } : { progress: pct });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText)?.image ?? null);
          } catch {
            resolve(null);
          }
        } else {
          reject(describeHttpError(xhr.status, xhr.responseText));
        }
      };
      xhr.onerror = () => reject(new UploadError('Connection lost while uploading', true));
      xhr.ontimeout = () => reject(new UploadError('Upload timed out — the connection is too slow', true));
      xhr.send(form);
    });

  const discardUpload = (localId: string) => {
    assetsRef.current.delete(localId);
    setUploading((prev) => prev.filter((u) => u.localId !== localId));
  };

  const showFailedUpload = (u: UploadingImage) => {
    Alert.alert('Upload failed', u.error || 'The photo could not be uploaded.', [
      { text: 'Remove', style: 'destructive', onPress: () => discardUpload(u.localId) },
      { text: 'Retry', onPress: () => enqueue([u.localId]) },
    ]);
  };

  const openAddSheet = () => {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: () => pickAndUpload('camera') },
      { text: 'Choose from Library', onPress: () => pickAndUpload('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ─── Delete ────────────────────────────────────────────────────────────────
  const deleteImage = (image: IImage) => {
    if (!token) return;
    Alert.alert('Delete Photo', 'This photo will be removed from the job.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(image.id);
          try {
            const response = await fetch(`${API_URL}/jobs/${appointment.job.id}/images/${image.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            });
            if (!response.ok && response.status !== 404) {
              if (response.status === 403) throw new Error('You are not allowed to delete this photo');
              throw new Error(`Server returned status code ${response.status}`);
            }
            setViewerIndex(null);
            setRecent((prev) => prev.filter((i) => i.id !== image.id));
            await onRefresh();
          } catch (err: any) {
            console.error(err);
            Alert.alert('Error', err.message || 'Failed to delete photo.');
          } finally {
            setDeletingId(0);
          }
        },
      },
    ]);
  };

  return (
    <Animated.View entering={FadeInDown.duration(350)}>
      <SectionCard
        title="Photos"
        icon={{ ios: 'photo.on.rectangle.angled', android: 'photo_library', web: 'photo_library' }}
        iconColor={c.primary}
        iconBg={c.primaryMuted}
        c={c}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted }}>{images.length}</Text>
            <HeaderIconButton icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={openAddSheet} c={c} />
          </View>
        }
      >
        <View style={styles.photoGrid}>
          {images.map((img, idx) => (
            <Pressable
              key={img.id}
              onPress={() => setViewerIndex(idx)}
              onLongPress={() => deleteImage(img)}
              style={({ pressed }) => [styles.photoTile, { width: TILE_SIZE, height: TILE_SIZE }, pressed && { opacity: 0.8 }]}
            >
              <Image source={{ uri: localPreviews[img.id] || img.path }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              {deletingId === img.id && (
                <View style={styles.photoTileOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </Pressable>
          ))}

          {uploading.map((u) => (
            <UploadTile key={u.localId} item={u} onFailedPress={() => showFailedUpload(u)} />
          ))}

          {/* Add tile — always last so the grid has one obvious "+" affordance */}
          <Pressable
            onPress={openAddSheet}
            style={({ pressed }) => [
              styles.photoAddTile,
              {
                width: TILE_SIZE,
                height: TILE_SIZE,
                borderColor: isDark ? 'rgba(129,140,248,0.4)' : 'rgba(99,102,241,0.35)',
                backgroundColor: isDark ? 'rgba(129,140,248,0.08)' : 'rgba(99,102,241,0.05)',
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} size={22} tintColor={c.primary} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: c.primary }}>Add</Text>
          </Pressable>
        </View>

        {images.length === 0 && uploading.length === 0 && (
          <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', paddingTop: 10 }}>
            Before / after photos help with invoices and disputes.
          </Text>
        )}
      </SectionCard>

      <PhotoViewer
        images={images}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onDelete={deleteImage}
        deletingId={deletingId}
      />
    </Animated.View>
  );
}

// ─── Upload tile ─────────────────────────────────────────────────────────────

function UploadTile({ item, onFailedPress }: { item: UploadingImage; onFailedPress: () => void }) {
  const failed = item.status === 'failed';
  const label =
    item.status === 'preparing' ? 'Preparing…'
    : item.status === 'processing' ? 'Saving…'
    : failed ? 'Tap to retry'
    : item.attempt > 1 ? `Retry ${item.attempt}/${MAX_ATTEMPTS}`
    : null;

  return (
    <Pressable
      onPress={failed ? onFailedPress : undefined}
      disabled={!failed}
      style={({ pressed }) => [styles.photoTile, { width: TILE_SIZE, height: TILE_SIZE }, pressed && { opacity: 0.8 }]}
    >
      <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <View style={[styles.photoTileOverlay, failed && { backgroundColor: 'rgba(127,29,29,0.6)' }]}>
        {failed ? (
          <SymbolView name={{ ios: 'arrow.clockwise.circle.fill', android: 'refresh', web: 'refresh' }} size={26} tintColor="#FCA5A5" />
        ) : item.status === 'uploading' ? (
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{item.progress}%</Text>
        ) : (
          <ActivityIndicator color="#fff" />
        )}
        {label && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 4 }}>{label}</Text>}
      </View>
      {!failed && (
        <View style={{ position: 'absolute', left: 6, right: 6, bottom: 6, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
          <View style={{ width: `${item.status === 'preparing' ? 0 : item.progress}%`, height: '100%', borderRadius: 2, backgroundColor: '#fff' }} />
        </View>
      )}
    </Pressable>
  );
}

// ─── Fullscreen viewer ───────────────────────────────────────────────────────

function PhotoViewer({
  images,
  index,
  onClose,
  onDelete,
  deletingId,
}: {
  images: IImage[];
  index: number | null;
  onClose: () => void;
  onDelete: (img: IImage) => void;
  deletingId: number;
}) {
  const [current, setCurrent] = useState(index ?? 0);
  const listRef = useRef<FlatList<IImage>>(null);
  const visible = index !== null && images.length > 0;
  const initialIndex = useMemo(() => Math.min(index ?? 0, Math.max(0, images.length - 1)), [index, images.length]);

  React.useEffect(() => {
    if (visible) setCurrent(initialIndex);
  }, [visible, initialIndex]);

  if (!visible) return null;
  const currentImage = images[current];

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={styles.photoViewerTopBar}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.photoViewerBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor="#fff" />
          </Pressable>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
            {current + 1} / {images.length}
          </Text>
          <Pressable
            onPress={() => currentImage && onDelete(currentImage)}
            disabled={!currentImage || deletingId === currentImage.id}
            style={({ pressed }) => [styles.photoViewerBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            {currentImage && deletingId === currentImage.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={18} tintColor="#FCA5A5" />
            )}
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          keyExtractor={(item) => String(item.id)}
          onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
          renderItem={({ item }) => (
            <Animated.View entering={FadeIn.duration(200)} style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: 'center' }}>
              <Image source={{ uri: item.path }} style={{ width: SCREEN_W, height: SCREEN_H * 0.8 }} resizeMode="contain" />
            </Animated.View>
          )}
        />
      </View>
    </Modal>
  );
}
