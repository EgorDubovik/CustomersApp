import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import { API_URL } from '@/constants/Config';
import { useToast } from '@/context/ToastContext';
import { styles as appStyles } from '@/components/appointment/styles';
import { callsPalette } from './styles';

interface Props {
  visible: boolean;
  onClose: () => void;
  callId: string | null;
  token: string | null;
  isDark: boolean;
}

interface DialogueTurn {
  id: number;
  speaker: string;
  role: 'dispatcher' | 'customer' | 'other';
  text: string;
}

// Same parser as the web ChatItem: splits "Dispatcher: … Customer: …" into turns
const parseTranscription = (raw: string | null): DialogueTurn[] => {
  if (!raw) return [];
  const text = raw.trim();
  if (!text) return [];
  const pattern = /(?:^|\s+|\n)(Dispatcher|Agent|Operator|Customer|Caller|Client|User|Speaker\s*\d+):\s*/gi;
  const matches: { index: number; rawSpeaker: string; textStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    matches.push({ index: m.index, rawSpeaker: m[1], textStart: m.index + m[0].length });
  }
  if (matches.length === 0) return [{ id: 0, speaker: 'Transcript', role: 'other', text }];

  const turns: DialogueTurn[] = [];
  if (matches[0].index > 0) {
    const prefix = text.substring(0, matches[0].index).trim();
    if (prefix) turns.push({ id: 0, speaker: 'Transcript', role: 'other', text: prefix });
  }
  matches.forEach((cur, i) => {
    const next = matches[i + 1];
    const turnText = text.substring(cur.textStart, next ? next.index : text.length).trim();
    if (!turnText) return;
    const lower = cur.rawSpeaker.toLowerCase();
    const role: DialogueTurn['role'] =
      lower.includes('dispatch') || lower.includes('agent') || lower.includes('operator')
        ? 'dispatcher'
        : lower.includes('custom') || lower.includes('call') || lower.includes('client') || lower.includes('user')
          ? 'customer'
          : 'other';
    turns.push({ id: turns.length, speaker: role === 'dispatcher' ? 'Dispatcher' : role === 'customer' ? 'Customer' : cur.rawSpeaker, role, text: turnText });
  });
  return turns;
};

export default function TranscriptionModal({ visible, onClose, callId, token, isDark }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !callId || !token) return;
    let cancelled = false;
    setLoading(true);
    setTranscription(null);
    fetch(`${API_URL}/calls/transcription/${callId}`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
        const data = await r.json();
        if (!cancelled) setTranscription(data?.transcription || null);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) showToast({ message: 'Failed to load transcription', type: 'error' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, callId, token]);

  const turns = useMemo(() => parseTranscription(transcription), [transcription]);

  const copy = () => {
    if (!transcription) return;
    Clipboard.setStringAsync(turns.length ? turns.map((t) => `${t.speaker}: ${t.text}`).join('\n\n') : transcription);
    showToast({ message: 'Transcription copied', type: 'success' });
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={appStyles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[appStyles.modalCard, { backgroundColor: c.modalBg, maxHeight: '85%', width: '100%' }]}>
          <View style={appStyles.modalHeader}>
            <Text style={[appStyles.modalTitle, { color: c.text }]}>Call Transcription</Text>
            <Pressable onPress={onClose} hitSlop={15} style={({ pressed }) => [appStyles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator style={{ paddingVertical: 32 }} color={c.primary} />
            ) : !transcription ? (
              <Text style={{ textAlign: 'center', paddingVertical: 32, fontStyle: 'italic', color: c.textMuted }}>No transcription available.</Text>
            ) : (
              turns.map((t) => (
                <View key={t.id}>
                  <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: t.role === 'dispatcher' ? c.primary : t.role === 'customer' ? c.success : c.textFaint, marginBottom: 2 }}>
                    {t.speaker.toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: c.text }}>{t.text}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={appStyles.modalActions}>
            <Pressable onPress={copy} disabled={!transcription || loading} style={({ pressed }) => [appStyles.modalActionBtn, { backgroundColor: c.inputBg, flexDirection: 'row', gap: 6 }, pressed && { opacity: 0.8 }]}>
              <SymbolView name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }} size={14} tintColor={c.primary} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.primary }}>Copy text</Text>
            </Pressable>
            <Pressable onPress={onClose} style={({ pressed }) => [appStyles.modalActionBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.85 }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
