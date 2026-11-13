import React, { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/constants/Config';
import { CompanyPhone, useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { callsPalette, callsStyles as styles } from './styles';
import { ISmsMedia, ISmsMessage } from './types';

interface Props {
  isDark: boolean;
  conversationId: string;
  /** Our number the conversation runs on — the carriers check this exact number against 10DLC */
  companyPhone: CompanyPhone | null;
  /** Shown next to the field so the dispatcher sees who the text goes to */
  recipientLabel?: string;
  /** The sent message, straight into the timeline — the delivery status arrives later by socket */
  onSent: (message: ISmsMessage) => void;
}

// GSM-7 single segment; longer texts are split by the carrier. Shown only once the
// message gets close to the limit so the counter doesn't add noise to short texts.
const SMS_SEGMENT = 160;
/** Same limit as the backend: beyond this it's a broadcast, not a conversation */
const SMS_MAX_LENGTH = 1600;
/** Pictures per message; the backend accepts the same — carriers cap the total weight */
const MMS_MAX_ATTACHMENTS = 3;
// The backend re-compresses anyway; a smaller file just uploads faster over cellular
const MAX_DIMENSION = 1600;

const DLC_REQUIRED = '10DLC registration required to send messages';
const PHONE_STATUS_HINT: Record<string, string> = {
  NOT_ASSIGNED: 'This number is not linked to your 10DLC campaign yet',
  PENDING: 'This number is being linked to your 10DLC campaign — SMS will unlock once carriers confirm',
  FAILED: 'Carriers refused to link this number to your 10DLC campaign — SMS cannot be sent from it',
};

async function errorMessage(r: Response, fallback: string): Promise<string> {
  try {
    const body = await r.json();
    const m = body?.message;
    return (Array.isArray(m) ? m.join(', ') : m) || fallback;
  } catch {
    return fallback;
  }
}

async function prepareImage(asset: ImagePicker.ImagePickerAsset) {
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const { width, height } = asset;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      context.resize(width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
    }
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
      return { uri: saved.uri, name: `mms-${Date.now()}.jpg`, type: 'image/jpeg' };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}

/**
 * SMS composer pinned to the bottom of the conversation — the same rules as on the web:
 * - a number not routed through our telephony (OpenPhone, provider = null) can't text: no composer;
 * - our number texts only after 10DLC is approved and the number is linked to the campaign;
 * - up to 3 pictures (MMS) and AI reply suggestions.
 */
export default function SmsComposer({ isDark, conversationId, companyPhone, recipientLabel, onSent }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const insets = useSafeAreaInsets();
  const { token, smsDlcApproved } = useAuth();
  const { showToast } = useToast();
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  // Pictures go to storage right away: by the time of sending the carrier needs their links
  const [attachments, setAttachments] = useState<ISmsMedia[]>([]);
  const [uploading, setUploading] = useState(0);

  useEffect(() => {
    setText('');
    setSuggestions([]);
    setAttachments([]);
  }, [conversationId]);

  // Not our line (OpenPhone) — texts from it don't go through us at all
  if (!companyPhone?.provider) return null;

  const phoneStatus = companyPhone.sms_status ?? 'NOT_ASSIGNED';
  const canSendSms = smsDlcApproved && phoneStatus === 'ASSIGNED';
  // A company without registration sees the general text: the number's state means nothing to it yet
  const blockedHint = !smsDlcApproved ? DLC_REQUIRED : PHONE_STATUS_HINT[phoneStatus] ?? DLC_REQUIRED;

  const wrapStyle = [styles.composerWrap, { backgroundColor: c.card, borderTopColor: c.cardBorder, paddingBottom: Math.max(insets.bottom, 10) }];

  if (!canSendSms) {
    return (
      <View style={wrapStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: c.inputBg }}>
          <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} size={15} tintColor={c.warning} />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: c.textMuted }}>{blockedHint}</Text>
        </View>
      </View>
    );
  }

  const authHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const canSend = hasContent && !sending && uploading === 0;
  const showCounter = text.length > SMS_SEGMENT * 0.75;
  const segments = Math.max(1, Math.ceil(text.length / SMS_SEGMENT));

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/telephony/sms/send`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, text: text.trim(), media_urls: attachments.map((m) => m.url) }),
      });
      // The backend answers in user-facing words: why not (registration, number) or carrier down
      if (!r.ok) throw new Error(await errorMessage(r, 'Failed to send the message'));
      onSent((await r.json()) as ISmsMessage);
      setText('');
      setSuggestions([]);
      setAttachments([]);
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to send the message', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  /**
   * Three replies from the AI. The typed text goes along: it may be a command
   * ("say we're running late") or a draft to rewrite — the model sorts out which.
   */
  const suggest = async () => {
    if (suggesting) return;
    setSuggesting(true);
    setSuggestions([]);
    try {
      const r = await fetch(`${API_URL}/telephony/sms/suggest`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, draft: text.trim() }),
      });
      if (!r.ok) throw new Error(await errorMessage(r, 'Failed to get AI suggestions'));
      const data = await r.json();
      if (!data?.replies?.length) {
        showToast({ message: 'AI has no suggestions for this conversation', type: 'info' });
        return;
      }
      setSuggestions(data.replies);
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to get AI suggestions', type: 'error' });
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = (reply: string) => {
    setText(reply);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const upload = async (asset: ImagePicker.ImagePickerAsset) => {
    const file = await prepareImage(asset);
    const form = new FormData();
    form.append('image', file as any);
    // XMLHttpRequest, not fetch: the global fetch here is expo/fetch, which can't send a
    // { uri, name, type } file in FormData ("Unsupported FormData value format")
    return new Promise<ISmsMedia>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/telephony/sms/media`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = 120_000;
      xhr.onload = () => {
        let body: any = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && body?.url) return resolve(body as ISmsMedia);
        const m = body?.message;
        reject(new Error((Array.isArray(m) ? m.join(', ') : m) || `Failed to attach the image (status ${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error while attaching the image'));
      xhr.ontimeout = () => reject(new Error('Attaching the image timed out'));
      xhr.send(form);
    });
  };

  const pickFrom = async (source: 'camera' | 'library') => {
    const free = MMS_MAX_ATTACHMENTS - attachments.length;
    if (free <= 0) {
      showToast({ message: `Up to ${MMS_MAX_ATTACHMENTS} images per message`, type: 'info' });
      return;
    }
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({ message: source === 'camera' ? 'Camera access is needed to take a photo' : 'Photo library access is needed to attach images', type: 'error' });
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: free > 1, selectionLimit: free });
    if (result.canceled || !result.assets?.length) return;

    const assets = result.assets.slice(0, free);
    setUploading((n) => n + assets.length);
    for (const asset of assets) {
      try {
        const media = await upload(asset);
        setAttachments((prev) => (prev.length < MMS_MAX_ATTACHMENTS ? [...prev, media] : prev));
      } catch (err: any) {
        showToast({ message: err.message || 'Failed to attach the image', type: 'error' });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const attach = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: ['Take Photo', 'Choose from Library', 'Cancel'], cancelButtonIndex: 2 }, (i) => {
        if (i === 0) pickFrom('camera');
        if (i === 1) pickFrom('library');
      });
    } else {
      Alert.alert('Attach image', undefined, [
        { text: 'Take Photo', onPress: () => pickFrom('camera') },
        { text: 'Choose from Library', onPress: () => pickFrom('library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const attachFull = attachments.length + uploading >= MMS_MAX_ATTACHMENTS;

  return (
    <View style={wrapStyle}>
      {/* AI replies above the field: read top to bottom, ending on the field the pick lands in */}
      {(suggesting || suggestions.length > 0) && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.primary + '55', backgroundColor: c.primaryMuted, padding: 8, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: c.primary }}>AI SUGGESTIONS</Text>
            {!suggesting && (
              <Pressable onPress={() => setSuggestions([])} hitSlop={10}>
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={12} tintColor={c.textFaint} />
              </Pressable>
            )}
          </View>
          {suggesting
            ? [0, 1, 2].map((i) => (
                <View key={i} style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder, gap: 6 }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: c.inputBg }} />
                  <View style={{ height: 8, borderRadius: 4, width: '66%', backgroundColor: c.inputBg }} />
                </View>
              ))
            : suggestions.map((reply, i) => (
                <Pressable
                  key={i}
                  onPress={() => applySuggestion(reply)}
                  style={({ pressed }) => ({ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: c.card, borderWidth: 1, borderColor: pressed ? c.primary : c.cardBorder })}
                >
                  <Text style={{ fontSize: 14, lineHeight: 19, color: c.text }}>{reply}</Text>
                </Pressable>
              ))}
        </View>
      )}

      {/* What will go out — and a way to take it back */}
      {(attachments.length > 0 || uploading > 0) && (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 4, paddingTop: 6 }}>
          {attachments.map((m) => (
            <View key={m.url}>
              <Image source={{ uri: m.url }} style={{ width: 60, height: 60, borderRadius: 10, backgroundColor: c.inputBg }} />
              <Pressable
                onPress={() => setAttachments((prev) => prev.filter((x) => x.url !== m.url))}
                hitSlop={8}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}
              >
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={9} tintColor="#fff" />
              </Pressable>
            </View>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <View key={`up-${i}`} style={{ width: 60, height: 60, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.cardBorder, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={c.primary} />
            </View>
          ))}
        </View>
      )}

      {(recipientLabel || showCounter) && (
        <View style={styles.composerMetaRow}>
          <Text style={{ fontSize: 11, color: c.textFaint }} numberOfLines={1}>
            {recipientLabel ? `SMS to ${recipientLabel}` : ''}
          </Text>
          {showCounter && (
            <Text style={{ fontSize: 11, fontVariant: ['tabular-nums'], color: text.length > SMS_SEGMENT ? c.warning : c.textFaint }}>
              {text.length}/{SMS_SEGMENT}
              {segments > 1 ? ` · ${segments} parts` : ''}
            </Text>
          )}
        </View>
      )}

      <View style={styles.composerRow}>
        {/* Attach photo */}
        <Pressable
          onPress={attach}
          disabled={attachFull}
          hitSlop={6}
          style={({ pressed }) => [styles.composerIconBtn, { backgroundColor: c.inputBg, opacity: attachFull ? 0.4 : 1 }, pressed && { opacity: 0.6 }]}
        >
          <SymbolView name={{ ios: 'photo.on.rectangle', android: 'add_photo_alternate', web: 'add_photo_alternate' }} size={18} tintColor={c.textMuted} />
        </Pressable>

        {/* Field with the AI helper inside its trailing edge */}
        <View style={[styles.composerField, { backgroundColor: c.inputBg, borderColor: focused ? c.primary : c.cardBorder }]}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Message"
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={SMS_MAX_LENGTH}
            style={[styles.composerInput, { color: c.text }]}
          />
          <Pressable onPress={suggest} disabled={suggesting} hitSlop={6} style={({ pressed }) => [styles.composerAiBtn, (pressed || suggesting) && { opacity: 0.6 }]}>
            <LinearGradient colors={['#818CF8', '#C084FC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.composerAiGradient}>
              <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={14} tintColor="#fff" />
            </LinearGradient>
          </Pressable>
        </View>

        {/* Send */}
        <Pressable
          onPress={send}
          disabled={!canSend}
          hitSlop={6}
          style={({ pressed }) => [styles.composerSendBtn, { backgroundColor: canSend ? c.primary : c.inputBg }, pressed && canSend && { transform: [{ scale: 0.94 }], opacity: 0.9 }]}
        >
          {sending ? (
            <ActivityIndicator color={c.primary} size="small" />
          ) : (
            <SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={18} tintColor={canSend ? '#fff' : c.textFaint} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
