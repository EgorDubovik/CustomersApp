import React, { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChat } from '@/context/ChatContext';
import { useToast } from '@/context/ToastContext';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import AttachEntitySheet from './AttachEntitySheet';
import { entityLabel, messagePreview, NameLookup } from './helpers';
import type { ChatAttachment, ChatEntityRef, ChatMessage } from './types';

/** Same limit as the backend (SendMessageDto.attachment_ids). */
const MAX_PHOTOS = 10;
const MAX_LENGTH = 4000;
// The backend re-compresses anyway; a smaller file uploads faster over cellular
const MAX_DIMENSION = 1600;

interface Upload {
  key: string;
  localUri: string;
  progress: number;
  attachment?: ChatAttachment;
  error?: boolean;
}

async function prepareImage(asset: ImagePicker.ImagePickerAsset) {
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const { width, height } = asset;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) context.resize(width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
      return { uri: saved.uri, name: `chat-${Date.now()}.jpg`, type: 'image/jpeg' };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}

interface Props {
  conversationId: number;
  c: (typeof callsPalette)['light'];
  name: NameLookup;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  /** Composer is locked: the direct chat's colleague was deactivated */
  disabledReason?: string;
}

/**
 * Message field at the bottom of a chat: text, photos (camera or library, uploaded right
 * away so sending is instant), an appointment / customer card and a reply quote.
 */
export default function ChatComposer({ conversationId, c, name, replyTo, onCancelReply, disabledReason }: Props) {
  const insets = useSafeAreaInsets();
  const { api, send, emitTyping } = useChat();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [entity, setEntity] = useState<ChatEntityRef | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [picking, setPicking] = useState(false);
  const [cardSheet, setCardSheet] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  // Photos uploaded but never sent are thrown away when leaving the chat
  useEffect(
    () => () => {
      uploadsRef.current.forEach((u) => u.attachment && api.discardAttachment(u.attachment.id).catch(() => {}));
    },
    [conversationId, api],
  );

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  if (disabledReason) {
    return (
      <View style={[styles.composerWrap, { backgroundColor: c.card, borderTopColor: c.cardBorder, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Text style={{ textAlign: 'center', color: c.textMuted, paddingVertical: 10 }}>{disabledReason}</Text>
      </View>
    );
  }

  const uploading = uploads.some((u) => !u.attachment && !u.error);
  const ready = uploads.filter((u) => u.attachment).map((u) => u.attachment!);
  const canSend = (text.trim().length > 0 || ready.length > 0 || !!entity) && !uploading;

  const update = (key: string, patch: Partial<Upload>) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const upload = async (key: string, asset: ImagePicker.ImagePickerAsset) => {
    try {
      const file = await prepareImage(asset);
      const attachment = await api.uploadAttachment(conversationId, file, (progress) => update(key, { progress }));
      update(key, { attachment, progress: 100 });
    } catch (e: any) {
      update(key, { error: true });
      showToast({ message: e.message || 'Failed to upload the photo', type: 'error' });
    }
  };

  const pickPhotos = async (source: 'camera' | 'library') => {
    const free = MAX_PHOTOS - uploads.length;
    if (free <= 0) {
      showToast({ message: `Up to ${MAX_PHOTOS} photos per message`, type: 'info' });
      return;
    }
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({ message: source === 'camera' ? 'Camera access is needed to take a photo' : 'Photo library access is needed to attach photos', type: 'error' });
      return;
    }
    setPicking(true);
    try {
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: free > 1, selectionLimit: free });
      if (result.canceled || !result.assets?.length) return;
      const added = result.assets.slice(0, free).map((asset, i) => ({ asset, key: `${Date.now()}-${i}` }));
      setUploads((prev) => [...prev, ...added.map(({ asset, key }) => ({ key, localUri: asset.uri, progress: 0 }))]);
      added.forEach(({ asset, key }) => upload(key, asset));
    } finally {
      setPicking(false);
    }
  };

  const attachMenu = () => {
    const actions = [
      { label: 'Take Photo', run: () => pickPhotos('camera') },
      { label: 'Photo Library', run: () => pickPhotos('library') },
      { label: 'Appointment or customer', run: () => setCardSheet(true) },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...actions.map((a) => a.label), 'Cancel'], cancelButtonIndex: actions.length }, (i) => actions[i]?.run());
    } else {
      Alert.alert('Attach', undefined, [...actions.map((a) => ({ text: a.label, onPress: a.run })), { text: 'Cancel', style: 'cancel' as const }]);
    }
  };

  const removeUpload = (u: Upload) => {
    setUploads((prev) => prev.filter((x) => x.key !== u.key));
    if (u.attachment) api.discardAttachment(u.attachment.id).catch(() => {});
  };

  const submit = () => {
    if (!canSend) return;
    void send({ conversationId, body: text, entity: entity ?? undefined, attachments: ready, replyTo });
    setText('');
    setEntity(null);
    setUploads([]);
    onCancelReply();
  };

  return (
    <View style={[styles.composerWrap, { backgroundColor: c.card, borderTopColor: c.cardBorder, paddingBottom: Math.max(insets.bottom, 10) }]}>
      {replyTo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingTop: 4 }}>
          <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: c.primary, paddingLeft: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>Reply to {name(replyTo.sender_id)}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>
              {messagePreview(replyTo, name)}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={10}>
            <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={18} tintColor={c.textFaint} />
          </Pressable>
        </View>
      )}

      {entity && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4, marginTop: 4, padding: 8, borderRadius: 10, backgroundColor: c.primaryMuted }}>
          <SymbolView name={entity.type === 'appointment' ? { ios: 'calendar', android: 'event', web: 'event' } : { ios: 'person.fill', android: 'person', web: 'person' }} size={14} tintColor={c.primary} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: c.primary }}>{entityLabel(entity)}</Text>
          <Pressable onPress={() => setEntity(null)} hitSlop={10}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={12} tintColor={c.primary} />
          </Pressable>
        </View>
      )}

      {uploads.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 4, paddingTop: 8 }}>
          {uploads.map((u) => (
            <View key={u.key}>
              <Image source={{ uri: u.localUri }} style={{ width: 60, height: 60, borderRadius: 10, backgroundColor: c.inputBg, opacity: u.attachment ? 1 : 0.5 }} />
              {!u.attachment && (
                <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                  {u.error ? (
                    <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' }} size={18} tintColor={c.danger} />
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{u.progress ? `${u.progress}%` : ''}</Text>
                  )}
                </View>
              )}
              <Pressable
                onPress={() => removeUpload(u)}
                hitSlop={8}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}
              >
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={9} tintColor="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.composerRow}>
        <Pressable onPress={attachMenu} disabled={picking} hitSlop={6} style={({ pressed }) => [styles.composerIconBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.6 }]}>
          {picking ? <ActivityIndicator size="small" color={c.primary} /> : <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={c.textMuted} />}
        </Pressable>

        <View style={[styles.composerField, { backgroundColor: c.inputBg, borderColor: c.cardBorder }]}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (v.trim()) emitTyping(conversationId);
            }}
            placeholder="Message"
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={MAX_LENGTH}
            style={[styles.composerInput, { color: c.text }]}
          />
        </View>

        <Pressable
          onPress={submit}
          disabled={!canSend}
          hitSlop={6}
          style={({ pressed }) => [styles.composerSendBtn, { backgroundColor: canSend ? c.primary : c.inputBg }, pressed && canSend && { transform: [{ scale: 0.94 }], opacity: 0.9 }]}
        >
          {uploading ? <ActivityIndicator color={c.primary} size="small" /> : <SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={18} tintColor={canSend ? '#fff' : c.textFaint} />}
        </Pressable>
      </View>

      <AttachEntitySheet
        visible={cardSheet}
        c={c}
        onClose={() => setCardSheet(false)}
        onPick={(e) => {
          setEntity(e);
          setCardSheet(false);
        }}
      />
    </View>
  );
}
