import React, { useMemo, useRef, useState } from 'react';
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

type UploadingImage = {
  localId: string;
  uri: string;
  progress: number; // 0..100
  failed?: boolean;
};

const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const CARD_PADDING = 18;
const SCREEN_PADDING = 16;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const TILE_SIZE = Math.floor((SCREEN_W - SCREEN_PADDING * 2 - CARD_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

export default function PhotosTab({ appointment, token, isDark, onRefresh }: Props) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();

  const [uploading, setUploading] = useState<UploadingImage[]>([]);
  const [deletingId, setDeletingId] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const images: IImage[] = appointment.job.images || [];

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

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: true, selectionLimit: 10 });

    if (result.canceled || !result.assets?.length) return;

    const queue: UploadingImage[] = result.assets.map((a, i) => ({
      localId: `${Date.now()}-${i}`,
      uri: a.uri,
      progress: 0,
    }));
    setUploading((prev) => [...prev, ...queue]);

    // Upload sequentially so the API and the network aren't hammered by a 10-photo burst
    for (let i = 0; i < queue.length; i++) {
      const asset = result.assets[i];
      const item = queue[i];
      try {
        await uploadOne(asset, item.localId);
        setUploading((prev) => prev.filter((u) => u.localId !== item.localId));
      } catch (err: any) {
        console.error(err);
        setUploading((prev) => prev.map((u) => (u.localId === item.localId ? { ...u, failed: true } : u)));
        showToast({ message: err.message || 'Upload failed', type: 'error' });
      }
    }
    await onRefresh();
  };

  // XMLHttpRequest instead of fetch so we can show per-photo upload progress
  const uploadOne = (asset: ImagePicker.ImagePickerAsset, localId: string) =>
    new Promise<void>((resolve, reject) => {
      const form = new FormData();
      const name = asset.fileName || `photo-${Date.now()}.jpg`;
      const type = asset.mimeType || 'image/jpeg';
      form.append('image', { uri: asset.uri, name, type } as any);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/jobs/${appointment.job.id}/images`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploading((prev) => prev.map((u) => (u.localId === localId ? { ...u, progress: pct } : u)));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else if (xhr.status === 403) reject(new Error('You are not allowed to upload photos for this job'));
        else reject(new Error(`Upload failed (status ${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(form);
    });

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
              <Image source={{ uri: img.path }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              {deletingId === img.id && (
                <View style={styles.photoTileOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </Pressable>
          ))}

          {uploading.map((u) => (
            <View key={u.localId} style={[styles.photoTile, { width: TILE_SIZE, height: TILE_SIZE }]}>
              <Image source={{ uri: u.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={styles.photoTileOverlay}>
                {u.failed ? (
                  <Pressable onPress={() => setUploading((prev) => prev.filter((x) => x.localId !== u.localId))} hitSlop={8}>
                    <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} size={20} tintColor="#FCA5A5" />
                  </Pressable>
                ) : (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 4 }}>{u.progress}%</Text>
                  </>
                )}
              </View>
            </View>
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
