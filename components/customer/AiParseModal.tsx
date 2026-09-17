import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

/** Fields the AI can fill in — same keys as the create form */
export type AiParsedFields = Partial<Record<'name' | 'phone' | 'line1' | 'line2' | 'city' | 'state' | 'zip', string>>;

interface Props {
  visible: boolean;
  onClose: () => void;
  onParsed: (fields: AiParsedFields) => void;
  isDark: boolean;
}

// Below this the model has nothing to work with; also what counts as a "paste" in one change
const MIN_TEXT = 10;

const AI_GRADIENT = ['#818CF8', '#C084FC'] as const;

/**
 * Bottom sheet with a text box + screenshot upload. Text pasted in is sent to the server
 * right away (same /customers/parse-text and /customers/parse-image endpoints as the web app);
 * the server answers with { name, phone, address: { street1, street2, city, state, zip_code } }.
 */
export default function AiParseModal({ visible, onClose, onParsed, isDark }: Props) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { showToast } = useToast();
  const c = isDark ? palette.dark : palette.light;

  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'text' | 'image'>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!visible) {
      setText('');
      setPhase('idle');
      setImageUri(null);
      requestId.current++;
    }
  }, [visible]);

  const request = async (endpoint: 'parse-text' | 'parse-image', message: string) => {
    const id = ++requestId.current;
    setPhase(endpoint === 'parse-text' ? 'text' : 'image');
    try {
      const r = await fetch(`${API_URL}/customers/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
      const ai = (await r.json()) ?? {};
      if (id !== requestId.current) return; // modal closed / newer request started

      const raw: AiParsedFields = {
        name: ai.name,
        phone: ai.phone,
        line1: ai.address?.street1,
        line2: ai.address?.street2,
        city: ai.address?.city,
        state: ai.address?.state,
        zip: ai.address?.zip_code,
      };
      const fields = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as AiParsedFields;
      if (Object.keys(fields).length === 0) {
        showToast({ message: 'AI found no customer details', type: 'info' });
        setPhase('idle');
        return;
      }
      onParsed(fields);
    } catch (err: any) {
      console.error(err);
      if (id !== requestId.current) return;
      showToast({ message: 'AI failed to read that', type: 'error' });
      setPhase('idle');
    }
  };

  const analyzeText = () => {
    const value = text.trim();
    if (value.length < MIN_TEXT || phase !== 'idle') return;
    request('parse-text', value);
  };

  // A paste lands as one big change; typed text grows a character at a time
  const onChangeText = (next: string) => {
    const pasted = next.length - text.length >= MIN_TEXT;
    setText(next);
    if (pasted && next.trim().length >= MIN_TEXT && phase === 'idle') request('parse-text', next.trim());
  };

  const pickImage = async () => {
    if (phase !== 'idle') return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ message: 'Photo library access is required', type: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
    const asset = result.canceled ? undefined : result.assets?.[0];
    const base64 = asset?.base64;
    if (!asset || !base64) return;
    // The picker re-encodes when quality < 1, so sniff the real type from the bytes
    const mime = base64.startsWith('iVBOR') ? 'image/png' : base64.startsWith('R0lGOD') ? 'image/gif' : 'image/jpeg';
    setImageUri(asset.uri);
    request('parse-image', `data:${mime};base64,${base64}`);
  };

  const busy = phase !== 'idle';
  const canAnalyze = text.trim().length >= MIN_TEXT && !busy;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.card, { backgroundColor: c.modalBg, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[styles.dragHandle, { backgroundColor: c.divider }]} />

            {/* Header */}
            <View style={styles.header}>
              <PulsingOrb size={36} iconSize={16} active={busy} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: c.text }]}>AI helper</Text>
                <Text style={{ fontSize: 12, color: c.textMuted }}>Paste a message or upload a screenshot</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={15} style={({ pressed }) => [styles.closeBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
              </Pressable>
            </View>

            {busy ? (
              <ThinkingState c={c} phase={phase} imageUri={imageUri} />
            ) : (
              <Animated.View entering={FadeIn.duration(200)}>
                <View style={[styles.inputWrap, { backgroundColor: c.inputBg, borderColor: c.cardBorder }]}>
                  <TextInput
                    value={text}
                    onChangeText={onChangeText}
                    placeholder={'Paste anything with the customer’s details —\na text, an email, notes from a call…'}
                    placeholderTextColor={c.textFaint}
                    multiline
                    autoFocus
                    textAlignVertical="top"
                    style={[styles.input, { color: c.text }]}
                  />
                </View>
                <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 6, marginLeft: 4 }}>Pasted text is analyzed automatically</Text>

                <View style={styles.actions}>
                  <Pressable onPress={pickImage} style={({ pressed }) => [styles.secondaryBtn, { backgroundColor: c.inputBg, borderColor: c.cardBorder }, pressed && { opacity: 0.7 }]}>
                    <SymbolView name={{ ios: 'photo.on.rectangle', android: 'add_photo_alternate', web: 'add_photo_alternate' }} size={18} tintColor={c.primary} />
                    <Text style={[styles.btnText, { color: c.text }]}>Screenshot</Text>
                  </Pressable>
                  <Pressable onPress={analyzeText} disabled={!canAnalyze} style={({ pressed }) => [styles.primaryBtn, !canAnalyze && { opacity: 0.45 }, pressed && canAnalyze && { opacity: 0.85 }]}>
                    <LinearGradient colors={[...AI_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryGradient}>
                      <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={16} tintColor="#fff" />
                      <Text style={[styles.btnText, { color: '#fff' }]}>Analyze</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </Animated.View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Gradient sparkles disc; breathes and spins slowly while a request is running */
export function PulsingOrb({ size, iconSize, active }: { size: number; iconSize: number; active: boolean }) {
  const pulse = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (active) {
      pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
      spin.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(pulse);
      cancelAnimation(spin);
      pulse.value = withTiming(0, { duration: 200 });
      spin.value = withTiming(0, { duration: 200 });
    }
  }, [active]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.12 }, { rotate: `${spin.value * 360}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: active ? 0.25 + pulse.value * 0.35 : 0,
    transform: [{ scale: 1 + pulse.value * 0.6 }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: '#A78BFA' }, haloStyle]} />
      <Animated.View style={orbStyle}>
        <LinearGradient colors={[...AI_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
          <SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={iconSize} tintColor="#fff" />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

/** Replaces the form while the model works: a big orb, a rotating status line and shimmer rows */
function ThinkingState({ c, phase, imageUri }: { c: typeof palette.light; phase: 'text' | 'image'; imageUri: string | null }) {
  const lines = phase === 'image' ? ['Looking at the screenshot…', 'Reading the conversation…', 'Picking out contact details…', 'Almost there…'] : ['Reading the message…', 'Finding name and phone…', 'Working out the address…', 'Almost there…'];
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLineIdx((i) => Math.min(i + 1, lines.length - 1)), 1500);
    return () => clearInterval(t);
  }, [phase]);

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.thinking}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {imageUri ? (
          <View style={[styles.thumb, { borderColor: c.cardBorder }]}>
            <Animated.Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            <ScanLine />
          </View>
        ) : (
          <PulsingOrb size={56} iconSize={24} active />
        )}
        <View style={{ flex: 1, gap: 10 }}>
          <Animated.Text key={lineIdx} entering={FadeIn.duration(300)} style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
            {lines[lineIdx]}
          </Animated.Text>
          <Shimmer c={c} width="90%" delay={0} />
          <Shimmer c={c} width="65%" delay={150} />
          <Shimmer c={c} width="78%" delay={300} />
        </View>
      </View>
    </Animated.View>
  );
}

function Shimmer({ c, width, delay }: { c: typeof palette.light; width: `${number}%`; delay: number }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, false));
    return () => cancelAnimation(x);
  }, []);
  // Bar starts fully off the left edge and sweeps past the right one
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: (x.value + 1) * 240 }] }));
  return (
    <View style={[styles.shimmerTrack, { width, backgroundColor: c.inputBg }]}>
      <Animated.View style={[styles.shimmerBar, style]}>
        <LinearGradient colors={['rgba(167,139,250,0)', 'rgba(167,139,250,0.55)', 'rgba(167,139,250,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

/** Thin bright line sweeping down the thumbnail — "scanning" the screenshot */
function ScanLine() {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withSequence(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.ease) })), -1, false);
    return () => cancelAnimation(y);
  }, []);
  const style = useAnimatedStyle(() => ({ top: `${y.value * 96}%` }));
  return <Animated.View style={[styles.scanLine, style]} />;
}

const palette = {
  light: { modalBg: '#FFFFFF', text: '#0F172A', textMuted: '#64748B', textFaint: '#94A3B8', inputBg: '#F1F5F9', cardBorder: '#E2E8F0', divider: '#E2E8F0', primary: '#6366F1' },
  dark: { modalBg: '#1E293B', text: '#F8FAFC', textMuted: '#94A3B8', textFaint: '#64748B', inputBg: '#0F172A', cardBorder: '#334155', divider: '#334155', primary: '#818CF8' },
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
  },
  dragHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { borderRadius: 14, borderWidth: 1, padding: 12, minHeight: 130, maxHeight: 220 },
  input: { fontSize: 15, lineHeight: 21, minHeight: 100, paddingVertical: 0 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtn: { flex: 1.3, height: 48, borderRadius: 14, overflow: 'hidden' },
  primaryGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontSize: 15, fontWeight: '700' },
  thinking: { minHeight: 130, justifyContent: 'center', paddingVertical: 12 },
  thumb: { width: 64, height: 88, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: '#C084FC', shadowColor: '#C084FC', shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  shimmerTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  shimmerBar: { position: 'absolute', top: 0, bottom: 0, width: 160, left: -160 },
});
