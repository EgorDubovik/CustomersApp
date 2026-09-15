import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/context/ToastContext';
import { callsPalette, callsStyles as styles } from './styles';

interface Props {
  isDark: boolean;
  /** Shown next to the field so the dispatcher sees who the text goes to */
  recipientLabel?: string;
}

// GSM-7 single segment; longer texts are split by the carrier. Shown only once the
// message gets close to the limit so the counter doesn't add noise to short texts.
const SMS_SEGMENT = 160;

/**
 * SMS composer pinned to the bottom of the conversation. Design only for now — sending,
 * photo attachments and the AI assistant are wired up later, so the buttons just toast.
 */
export default function SmsComposer({ isDark, recipientLabel }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const canSend = text.trim().length > 0;
  const showCounter = text.length > SMS_SEGMENT * 0.75;
  const segments = Math.max(1, Math.ceil(text.length / SMS_SEGMENT));

  const notReady = (what: string) => showToast({ message: `${what} — coming soon`, type: 'info' });

  return (
    <View style={[styles.composerWrap, { backgroundColor: c.card, borderTopColor: c.cardBorder, paddingBottom: Math.max(insets.bottom, 10) }]}>
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
        <Pressable onPress={() => notReady('Photo attachments')} hitSlop={6} style={({ pressed }) => [styles.composerIconBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.6 }]}>
          <SymbolView name={{ ios: 'photo.on.rectangle', android: 'add_photo_alternate', web: 'add_photo_alternate' }} size={18} tintColor={c.textMuted} />
        </Pressable>

        {/* Field with the AI helper inside its trailing edge */}
        <View style={[styles.composerField, { backgroundColor: c.inputBg, borderColor: focused ? c.primary : c.cardBorder }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Message"
            placeholderTextColor={c.textFaint}
            multiline
            style={[styles.composerInput, { color: c.text }]}
          />
          <Pressable onPress={() => notReady('AI assistant')} hitSlop={6} style={({ pressed }) => [styles.composerAiBtn, pressed && { opacity: 0.7 }]}>
            <LinearGradient colors={['#818CF8', '#C084FC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.composerAiGradient}>
              <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={14} tintColor="#fff" />
            </LinearGradient>
          </Pressable>
        </View>

        {/* Send */}
        <Pressable
          onPress={() => notReady('Sending SMS')}
          disabled={!canSend}
          hitSlop={6}
          style={({ pressed }) => [styles.composerSendBtn, { backgroundColor: canSend ? c.primary : c.inputBg }, pressed && canSend && { transform: [{ scale: 0.94 }], opacity: 0.9 }]}
        >
          <SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={18} tintColor={canSend ? '#fff' : c.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}
