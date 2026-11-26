import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
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
import { outboundCallsSupported, placeOutboundCall, subscribeToConnection } from '@/utils/outboundCall';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import CallItem from '@/components/calls/CallItem';
import NoteItem from '@/components/calls/NoteItem';
import SmsComposer from '@/components/calls/SmsComposer';
import SmsItem from '@/components/calls/SmsItem';
import TranscriptionModal from '@/components/calls/TranscriptionModal';
import RelatedConversationsButton from '@/components/calls/RelatedConversationsButton';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import { ICall, ICallComment, IConversation, ISmsMessage, TimelineItem } from '@/components/calls/types';
import { applyConversationRead, formatPhoneNumber, getCompanyPhone, getCustomerPhone, getEmployeeByPhone, getMatchedCompanyPhone, isSameDay, mergeCallIntoConversation, mergeSmsIntoConversation } from '@/components/calls/helpers';

const PAGE_SIZE = 15;

export default function ConversationScreen() {
  // item/comment: opened from a push or Mentions — jump to that call/SMS and its comment
  const { id, item: focusItem, comment: focusComment } = useLocalSearchParams<{ id: string; item?: string; comment?: string }>();
  const [focusType, focusId] = typeof focusItem === 'string' ? focusItem.split(':') : [];
  const focus = focusId && (focusType === 'call' || focusType === 'sms') ? { type: focusType as 'call' | 'sms', id: focusId, commentId: focusComment ?? null, key: `${focusItem}:${focusComment ?? ''}` } : null;
  const listRef = useRef<FlatList<TimelineItem>>(null);
  const scrolledToFocusRef = useRef<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user, companyPhones, companyEmployees } = useAuth();
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
  const [telephonyConnected, setTelephonyConnected] = useState(false);
  const [calling, setCalling] = useState(false);
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
        // The backend widens the first page down to this call/SMS, however old it is
        if (focusItem) params.set('focus', String(focusItem));
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
    [id, token, authHeaders, markRead, focusItem],
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
  const onMessageCommentsChange = (message: ISmsMessage, comments: ICallComment[]) => {
    setConversation((prev) => (prev ? { ...prev, messages: prev.messages?.map((x) => (x.id === message.id ? { ...x, comments } : x)) } : prev));
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
  // На линии может быть наш техник — тогда это не клиент: ни ссылки на карточку, ни «Create customer»
  const employee = getEmployeeByPhone(customerPhone, companyEmployees);
  const customer = employee ? null : conversation?.customer ?? null;
  const title = employee?.name || customer?.name || formatPhoneNumber(customerPhone) || 'Conversation';

  useEffect(() => subscribeToConnection(setTelephonyConnected), []);

  // Call back from the same company number as this conversation — only a number routed through
  // our telephony (provider set, same rule as the SMS field) that I'm allowed to use; iPhone only.
  const canCall = outboundCallsSupported && !!conversation && !!customerPhone && !!matched?.provider && matched.can_access !== false;
  const callCustomer = async () => {
    if (!matched || !customerPhone || calling) return;
    if (!telephonyConnected) return showToast({ message: 'Telephony is not connected', type: 'error' });
    setCalling(true);
    try {
      await placeOutboundCall(customerPhone, matched.phone, user?.id);
      router.push({ pathname: '/calls/active-call', params: { fromPhoneId: String(matched.id) } } as any);
    } catch (e: any) {
      showToast({ message: e?.message || 'Could not place the call', type: 'error' });
    } finally {
      setCalling(false);
    }
  };

  const copyPhone = () => {
    if (!customerPhone) return;
    Clipboard.setStringAsync(customerPhone);
    showToast({ message: 'Phone number copied', type: 'success' });
  };
  const openCustomer = () => customer && router.push(`/customer/${customer.id}` as any);
  const createCustomer = () => router.push({ pathname: '/customer/create', params: { phone: customerPhone } } as any);

  // Long-press menu on the title: "View customer" / "Create customer" + "Copy phone number"
  const openTitleMenu = () => {
    if (!conversation) return;
    const primary = customer ? { label: 'View customer', action: openCustomer } : { label: 'Create customer', action: createCustomer };
    const options = [primary, { label: 'Copy phone number', action: copyPhone }];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: formatPhoneNumber(customerPhone) || undefined, options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length },
        (i) => options[i]?.action(),
      );
    } else {
      Alert.alert(formatPhoneNumber(customerPhone) || 'Caller', undefined, [...options.map((o) => ({ text: o.label, onPress: o.action })), { text: 'Cancel', style: 'cancel' as const }]);
    }
  };

  const isFocused = (item: TimelineItem) => !!focus && item.type === focus.type && item.data.id === focus.id;

  // Once the timeline has the focused call/SMS, bring it to the middle of the screen (once per link)
  useEffect(() => {
    if (!focus || loading || scrolledToFocusRef.current === focus.key) return;
    const index = timeline.findIndex(isFocused);
    if (index < 0) return;
    scrolledToFocusRef.current = focus.key;
    // A beat for the comments panel to open before measuring
    const t = setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, loading, focus?.key]);

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
        {item.type === 'call' && (
          <CallItem
            call={item.data}
            isDark={isDark}
            onCommentsChange={onCommentsChange}
            onShowTranscription={setTranscriptionCallId}
            focusKey={isFocused(item) ? focus!.key : null}
            focusCommentId={isFocused(item) ? focus!.commentId : null}
          />
        )}
        {item.type === 'sms' && (
          <SmsItem
            message={item.data}
            isDark={isDark}
            onCommentsChange={onMessageCommentsChange}
            focusKey={isFocused(item) ? focus!.key : null}
            focusCommentId={isFocused(item) ? focus!.commentId : null}
          />
        )}
        {item.type === 'note' && <NoteItem note={item.data} isDark={isDark} onDeleted={onNoteDeleted} />}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ─── Header ─── */}
      <View style={[styles.convHeader, { paddingTop: insets.top + 6, backgroundColor: c.card, borderBottomColor: c.cardBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Всегда на вкладку Calls, а не «на шаг назад»: диалог открывают и с экрана
              идущего звонка, и оттуда нужен доступ к нижнему меню (Schedule и т. д.).
              К звонку возвращает зелёная плашка. */}
          <Pressable onPress={() => router.dismissTo('/(tabs)/calls' as any)} hitSlop={10} style={({ pressed }) => [styles.headerBackBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
            <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor={c.text} />
          </Pressable>
          {/* Tap: open the customer (when known). Long-press: context menu. Unknown caller: tap opens the menu too. */}
          <Pressable
            onPress={customer ? openCustomer : openTitleMenu}
            onLongPress={openTitleMenu}
            delayLongPress={350}
            disabled={!conversation}
            style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {!loading && employee && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: employee.color || '#888' }} />}
              <Text style={{ flexShrink: 1, fontSize: 18, fontWeight: '800', color: customer ? c.primary : c.text }} numberOfLines={1}>
                {loading ? 'Loading…' : title}
              </Text>
            </View>
            {/* A known customer / colleague: their number under the name (otherwise it's the title) */}
            {!!conversation && (customer || employee) && !!customerPhone && (
              <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>
                {formatPhoneNumber(customerPhone)}
              </Text>
            )}
            {/* The company number this conversation is on — always in sight; tap copies it */}
            {!!conversation && !!companyPhone && (
              <Pressable
                onPress={() => {
                  Clipboard.setStringAsync(companyPhone);
                  showToast({ message: 'Company number copied', type: 'success' });
                }}
                hitSlop={6}
                accessibilityLabel={`Company number ${formatPhoneNumber(companyPhone)}, tap to copy`}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, alignSelf: 'flex-start', maxWidth: '100%' }, pressed && { opacity: 0.6 }]}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: matched?.color || '#888' }} />
                <Text style={{ flexShrink: 1, fontSize: 13, fontWeight: '700', color: matched?.color || c.textSecondary }} numberOfLines={1}>
                  {matched?.description || 'Our number'}
                </Text>
                <Text style={{ fontSize: 13, color: c.textMuted }}>· {formatPhoneNumber(companyPhone)}</Text>
              </Pressable>
            )}
          </Pressable>
          <RelatedConversationsButton conversationId={conversation?.id} isDark={isDark} />
          {canCall && (
            <Pressable
              onPress={callCustomer}
              disabled={calling}
              hitSlop={8}
              accessibilityLabel={`Call ${title}`}
              style={({ pressed }) => [styles.headerIconBtn, { backgroundColor: '#22C55E' }, (pressed || calling) && { opacity: 0.6 }]}
            >
              {calling ? <ActivityIndicator size="small" color="#fff" /> : <SymbolView name={{ ios: 'phone.fill', android: 'call', web: 'call' }} size={18} tintColor="#fff" />}
            </Pressable>
          )}
        </View>

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
          ref={listRef}
          data={timeline}
          // Rows have different heights; jump near the target first, then retry exactly
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 120);
          }}
          inverted
          keyExtractor={(item) => `${item.type}-${item.data.id}`}
          renderItem={renderItem}
          // In an inverted list a short timeline hugs the bottom; flexGrow + flex-end pushes it
          // to the top of the screen while keeping the chronological order untouched.
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' }}
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

      {!loading && !error && !!conversation && (
        <SmsComposer
          isDark={isDark}
          conversationId={conversation.id}
          companyPhone={matched ?? null}
          recipientLabel={employee?.name || customer?.name || formatPhoneNumber(customerPhone) || undefined}
          onSent={(message) => setConversation((prev) => (prev ? mergeSmsIntoConversation(prev, message) : prev))}
        />
      )}

      <TranscriptionModal visible={!!transcriptionCallId} onClose={() => setTranscriptionCallId(null)} callId={transcriptionCallId} token={token} isDark={isDark} />
    </KeyboardAvoidingView>
  );
}
