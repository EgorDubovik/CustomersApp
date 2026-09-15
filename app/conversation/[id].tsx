import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { setAudioModeAsync } from 'expo-audio';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useSocket, useSocketEvent } from '@/context/SocketContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import CallItem from '@/components/calls/CallItem';
import NoteItem from '@/components/calls/NoteItem';
import SmsItem from '@/components/calls/SmsItem';
import TranscriptionModal from '@/components/calls/TranscriptionModal';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import { ICall, ICallComment, IConversation, ISmsMessage, TimelineItem } from '@/components/calls/types';
import { applyConversationRead, formatPhoneNumber, getCompanyPhone, getCustomerPhone, getMatchedCompanyPhone, isSameDay, mergeCallIntoConversation, mergeSmsIntoConversation } from '@/components/calls/helpers';

const PAGE_SIZE = 15;

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, companyPhones } = useAuth();
  const { reconnectCount } = useSocket();
  const { showToast } = useToast();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;

  const [conversation, setConversation] = useState<IConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [transcriptionCallId, setTranscriptionCallId] = useState<string | null>(null);
  const conversationRef = useRef<IConversation | null>(null);
  conversationRef.current = conversation;

  // Recordings should be audible even with the iOS mute switch on
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const authHeaders = useMemo(() => ({ 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }), [token]);

  const markRead = useCallback(
    async (conversationId: string) => {
      setConversation((prev) => (prev ? applyConversationRead(prev, new Date().toISOString()) : prev));
      try {
        await fetch(`${API_URL}/calls/conversations/${conversationId}/read`, { method: 'POST', headers: authHeaders });
      } catch (err) {
        console.warn('Failed to mark conversation as read', err);
      }
    },
    [authHeaders],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!id || !token) return;
      if (!silent) setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ conversation_id: id, limit: String(PAGE_SIZE) });
        const r = await fetch(`${API_URL}/calls/conversation?${params}`, { headers: authHeaders });
        if (!r.ok) throw new Error(r.status === 404 ? 'Conversation not found' : `Server returned status code ${r.status}`);
        const data = await r.json();
        setConversation({ ...(data.conversation as IConversation), calls: data.calls ?? [], messages: data.messages ?? [], conversation_notes: data.notes ?? [] });
        setHasMore(!!data.has_more);
        // Opening a conversation reads it — for the whole company, like on the web
        void markRead(id);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load this conversation');
      } finally {
        setLoading(false);
      }
    },
    [id, token, authHeaders, markRead],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (reconnectCount > 0) load(true);
  }, [reconnectCount]);

  // Older page: cursor is the oldest loaded event of any type (the backend pages all three together)
  const loadOlder = async () => {
    const conv = conversationRef.current;
    if (!conv || !hasMore || loadingMore || !token) return;
    const dates = [...(conv.calls ?? []).map((x) => x.created_at), ...(conv.messages ?? []).map((x) => x.created_at), ...(conv.conversation_notes ?? []).map((x) => x.created_at)];
    if (dates.length === 0) return;
    const cursor = dates.reduce((oldest, at) => (new Date(at) < new Date(oldest) ? at : oldest), dates[0]);
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ conversation_id: conv.id, limit: String(PAGE_SIZE), before: cursor });
      const r = await fetch(`${API_URL}/calls/conversation?${params}`, { headers: authHeaders });
      if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
      const data = await r.json();
      setConversation((prev) => {
        if (!prev) return prev;
        const knownCalls = new Set((prev.calls ?? []).map((x) => x.id));
        const knownMsgs = new Set((prev.messages ?? []).map((x) => x.id));
        const knownNotes = new Set((prev.conversation_notes ?? []).map((x) => x.id));
        return {
          ...prev,
          calls: [...(data.calls ?? []).filter((x: ICall) => !knownCalls.has(x.id)), ...(prev.calls ?? [])],
          messages: [...(data.messages ?? []).filter((x: ISmsMessage) => !knownMsgs.has(x.id)), ...(prev.messages ?? [])],
          conversation_notes: [...(data.notes ?? []).filter((x: any) => !knownNotes.has(x.id)), ...(prev.conversation_notes ?? [])],
        };
      });
      setHasMore(!!data.has_more);
    } catch (err: any) {
      console.error(err);
      showToast({ message: 'Failed to load older history', type: 'error' });
    } finally {
      setLoadingMore(false);
    }
  };

  // ─── Real-time ─────────────────────────────────────────────────────────────
  useSocketEvent<{ call: ICall }>('call.updated', ({ call }) => {
    if (call?.conversation_id !== id) return;
    setConversation((prev) => (prev ? mergeCallIntoConversation(prev, call) : prev));
  });
  useSocketEvent<{ message: ISmsMessage }>('sms.received', ({ message }) => {
    if (message?.conversation_id !== id) return;
    setConversation((prev) => (prev ? mergeSmsIntoConversation(prev, message) : prev));
  });
  useSocketEvent<{ callId: string; summary: string; transcription: string }>('call.ai.updated', ({ callId, summary, transcription }) => {
    setConversation((prev) =>
      prev ? { ...prev, calls: prev.calls?.map((x) => (x.id === callId ? { ...x, ai_details: { ...(x.ai_details ?? {}), summary, transcription } } : x)) } : prev,
    );
  });
  useSocketEvent<{ conversationId: string; readAt: string }>('conversation.read', ({ conversationId, readAt }) => {
    if (conversationId !== id) return;
    setConversation((prev) => (prev ? applyConversationRead(prev, readAt) : prev));
  });

  const onCommentsChange = (call: ICall, comments: ICallComment[]) => {
    setConversation((prev) => (prev ? { ...prev, calls: prev.calls?.map((x) => (x.id === call.id ? { ...x, comments } : x)) } : prev));
  };
  const onNoteDeleted = (noteId: string) => {
    setConversation((prev) => (prev ? { ...prev, conversation_notes: prev.conversation_notes?.filter((x) => x.id !== noteId) } : prev));
  };

  // Newest first — the list is inverted so the latest event sits at the bottom
  const timeline: TimelineItem[] = useMemo(() => {
    if (!conversation) return [];
    const items: TimelineItem[] = [
      ...(conversation.calls ?? []).map((x) => ({ type: 'call' as const, data: x, created_at: x.created_at })),
      ...(conversation.messages ?? []).map((x) => ({ type: 'sms' as const, data: x, created_at: x.created_at })),
      ...(conversation.conversation_notes ?? []).map((x) => ({ type: 'note' as const, data: x, created_at: x.created_at })),
    ];
    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [conversation]);

  const customerPhone = getCustomerPhone(conversation);
  const companyPhone = getCompanyPhone(conversation);
  const matched = getMatchedCompanyPhone(companyPhone, companyPhones);
  const title = conversation?.customer?.name || formatPhoneNumber(customerPhone) || 'Conversation';

  const renderItem = ({ item, index }: { item: TimelineItem; index: number }) => {
    const older = timeline[index + 1];
    const showDivider = !older || !isSameDay(item.created_at, older.created_at);
    return (
      <View>
        {showDivider && (
          <View style={styles.dayDivider}>
            <View style={[styles.dayDividerLine, { backgroundColor: c.divider }]} />
            <Text style={[styles.dayDividerText, { color: c.textFaint }]}>{formatDate(item.created_at, 'MMM DD, YYYY')}</Text>
            <View style={[styles.dayDividerLine, { backgroundColor: c.divider }]} />
          </View>
        )}
        {item.type === 'call' && <CallItem call={item.data} isDark={isDark} onCommentsChange={onCommentsChange} onShowTranscription={setTranscriptionCallId} />}
        {item.type === 'sms' && <SmsItem message={item.data} isDark={isDark} />}
        {item.type === 'note' && <NoteItem note={item.data} isDark={isDark} onDeleted={onNoteDeleted} />}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ─── Header ─── */}
      <View style={[styles.convHeader, { paddingTop: insets.top + 6, backgroundColor: c.card, borderBottomColor: c.cardBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.headerBackBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
            <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor={c.text} />
          </Pressable>
          <Pressable
            onPress={() => conversation?.customer && router.push(`/customer/${conversation.customer.id}` as any)}
            disabled={!conversation?.customer}
            style={{ flex: 1 }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: conversation?.customer ? c.primary : c.text }} numberOfLines={1}>
              {loading ? 'Loading…' : title}
            </Text>
            {!!conversation && (
              <Text style={{ fontSize: 12, color: c.textMuted }}>
                {conversation.calls_count} {conversation.calls_count === 1 ? 'call' : 'calls'}
                {conversation.customer ? '  ·  View customer ›' : ''}
              </Text>
            )}
          </Pressable>
        </View>

        {!!conversation && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {!!customerPhone && (
              <View style={[styles.headerChip, { backgroundColor: c.bg, borderColor: c.cardBorder }]}>
                <Pressable onPress={() => Linking.openURL(`tel:${customerPhone}`)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SymbolView name={{ ios: 'phone.fill', android: 'call', web: 'call' }} size={12} tintColor={c.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{formatPhoneNumber(customerPhone)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Clipboard.setStringAsync(customerPhone);
                    showToast({ message: 'Phone number copied', type: 'success' });
                  }}
                  hitSlop={6}
                >
                  <SymbolView name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }} size={12} tintColor={c.textMuted} />
                </Pressable>
              </View>
            )}
            {!!companyPhone && (
              <View style={[styles.headerChip, { backgroundColor: c.bg, borderColor: c.cardBorder }]}>
                <Text style={{ fontSize: 11, color: c.textFaint }}>via</Text>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: matched?.color || '#888' }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: matched?.color || c.textSecondary }} numberOfLines={1}>{matched?.description || 'Our number'}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted }}>{formatPhoneNumber(companyPhone)}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ─── Timeline ─── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} size={40} tintColor={c.danger} />
          <Text style={{ color: c.textMuted, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={() => load()} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: c.primary }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={timeline}
          inverted
          keyExtractor={(item) => `${item.type}-${item.data.id}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onEndReached={loadOlder}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            // Sits at the top of the inverted list: spinner while loading, button as a fallback
            hasMore ? (
              loadingMore ? (
                <ActivityIndicator style={{ marginVertical: 12 }} color={c.primary} />
              ) : (
                <Pressable onPress={loadOlder} style={({ pressed }) => [styles.loadOlderBtn, { borderColor: c.primary, backgroundColor: c.primaryMuted }, pressed && { opacity: 0.7 }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>Load older history</Text>
                </Pressable>
              )
            ) : null
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 60, transform: [{ scaleY: -1 }] }}>
              <Text style={{ color: c.textMuted }}>No calls or messages yet.</Text>
            </View>
          }
        />
      )}

      <TranscriptionModal visible={!!transcriptionCallId} onClose={() => setTranscriptionCallId(null)} callId={transcriptionCallId} token={token} isDark={isDark} />
    </View>
  );
}
