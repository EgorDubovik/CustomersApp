import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import ChatAvatar from '@/components/chat/ChatAvatar';
import ChatComposer from '@/components/chat/ChatComposer';
import ChatHeader from '@/components/chat/ChatHeader';
import MessageItem from '@/components/chat/MessageItem';
import PhotoViewer from '@/components/chat/PhotoViewer';
import { conversationTitle, dayLabel, directPeer, isSameDay, makeNameLookup, startsNewRun } from '@/components/chat/helpers';
import { TYPING_VISIBLE_MS } from '@/components/chat/reducer';
import type { ChatAttachment, ChatMessage } from '@/components/chat/types';
import { callsPalette } from '@/components/calls/styles';

/** How many older pages we pull looking for a linked message (`?m=`). */
const JUMP_MAX_PAGES = 5;
const HIGHLIGHT_MS = 2500;

/** Who is typing right now; re-renders every second while somebody is, to drop stale marks. */
function useTypingUsers(typing: Record<number, number> | undefined): number[] {
  const [now, setNow] = useState(() => Date.now());
  const hasRecent = !!typing && Object.values(typing).some((at) => Date.now() - at < TYPING_VISIBLE_MS);
  useEffect(() => {
    setNow(Date.now());
    if (!hasRecent) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [typing, hasRecent]);
  return typing ? Object.entries(typing).filter(([, at]) => now - at < TYPING_VISIBLE_MS).map(([id]) => Number(id)) : [];
}

export default function ChatThreadScreen() {
  const params = useLocalSearchParams<{ id: string; m?: string }>();
  const conversationId = Number(params.id);
  const jumpTo = params.m ? Number(params.m) : null;
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { companyEmployees } = useAuth();
  const { showToast } = useToast();
  const { state, myUserId, api, setActive, loadConversation, loadMessages, markRead, send, discardPending, deleteMessage, upsertConversation } = useChat();

  const conversation = state.conversations[conversationId];
  const thread = state.threads[conversationId];
  const [missing, setMissing] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<{ photos: ChatAttachment[]; index: number } | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [focused, setFocused] = useState(true);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // The chat on screen: its messages don't pile up as unread and its pushes don't show a banner
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setActive(conversationId);
      return () => {
        setFocused(false);
        setActive(null);
      };
    }, [conversationId, setActive]),
  );

  useEffect(() => {
    if (!conversation) loadConversation(conversationId).then((conv) => !conv && setMissing(true));
    void loadMessages(conversationId);
  }, [conversationId]);

  // Read whatever arrives while the chat is in front of you
  const lastId = thread?.items.length ? thread.items[thread.items.length - 1].id : 0;
  useEffect(() => {
    if (focused && thread?.status === 'success' && AppState.currentState === 'active') markRead(conversationId);
  }, [focused, lastId, thread?.status, conversationId, markRead]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && focused && markRead(conversationId));
    return () => sub.remove();
  }, [focused, conversationId, markRead]);

  const name = useMemo(() => makeNameLookup(conversation?.members ?? [], companyEmployees, myUserId), [conversation?.members, companyEmployees, myUserId]);
  const typingIds = useTypingUsers(state.typing[conversationId]);

  // Newest first — the list is inverted so the latest message sits at the bottom
  const items = useMemo(() => (thread?.items ?? []).slice().reverse(), [thread?.items]);

  // ─── Jump to a linked message (from "Discussed in") ─────────────────────────
  const jumpPages = useRef(0);
  const jumped = useRef(false);
  useEffect(() => {
    if (!jumpTo || jumped.current || thread?.status !== 'success') return;
    const index = items.findIndex((m) => m.id === jumpTo);
    if (index === -1) {
      if (thread.hasMore && !thread.loadingOlder && jumpPages.current < JUMP_MAX_PAGES) {
        jumpPages.current += 1;
        void loadMessages(conversationId, true);
      }
      return;
    }
    jumped.current = true;
    setHighlightId(jumpTo);
    setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 250);
    setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  }, [jumpTo, items, thread?.status, thread?.hasMore, thread?.loadingOlder]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const confirmDelete = (message: ChatMessage) => {
    Alert.alert('Delete message?', 'It will be deleted for everyone in this chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMessage(message.id).catch((e) => showToast({ message: e.message || 'Failed to delete the message', type: 'error' })),
      },
    ]);
  };

  const onLongPress = useCallback(
    (message: ChatMessage) => {
      if (message.deleted || message.send_status) return;
      const actions: { label: string; run: () => void; destructive?: boolean }[] = [{ label: 'Reply', run: () => setReplyTo(message) }];
      if (message.body) actions.push({ label: 'Copy text', run: () => Clipboard.setStringAsync(message.body ?? '') });
      if (message.sender_id === myUserId) actions.push({ label: 'Delete', run: () => confirmDelete(message), destructive: true });
      if (Platform.OS === 'ios') {
        const destructive = actions.findIndex((a) => a.destructive);
        ActionSheetIOS.showActionSheetWithOptions(
          { options: [...actions.map((a) => a.label), 'Cancel'], cancelButtonIndex: actions.length, destructiveButtonIndex: destructive === -1 ? undefined : destructive },
          (i) => actions[i]?.run(),
        );
      } else {
        Alert.alert('Message', undefined, [...actions.map((a) => ({ text: a.label, onPress: a.run, style: a.destructive ? ('destructive' as const) : undefined })), { text: 'Cancel', style: 'cancel' as const }]);
      }
    },
    [myUserId],
  );

  const onRetry = useCallback(
    (m: ChatMessage) => {
      if (!m.client_id) return;
      discardPending(conversationId, m.client_id);
      void send({ conversationId, body: m.body ?? undefined, entity: m.entity ?? undefined, attachments: m.attachments, replyTo: m.reply_to, clientId: m.client_id });
    },
    [conversationId, send, discardPending],
  );
  const onDiscard = useCallback((m: ChatMessage) => m.client_id && discardPending(conversationId, m.client_id), [conversationId, discardPending]);
  const onOpenPhoto = useCallback((photos: ChatAttachment[], index: number) => setViewer({ photos, index }), []);

  const toggleMute = async () => {
    if (!conversation) return;
    try {
      upsertConversation(await api.setMuted(conversationId, !conversation.muted));
    } catch (e: any) {
      showToast({ message: e.message || 'Failed to change notifications', type: 'error' });
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (missing && !conversation) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ChatHeader c={c} title="Chat" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: c.textMuted, textAlign: 'center' }}>This chat is not available. You may have been removed from it.</Text>
        </View>
      </View>
    );
  }

  const peer = conversation?.type === 'direct' ? directPeer(conversation, myUserId) : undefined;
  const typingText = typingIds.length
    ? conversation?.type === 'group'
      ? `${typingIds.map((id) => name(id)).join(', ')} ${typingIds.length > 1 ? 'are' : 'is'} typing…`
      : 'typing…'
    : '';
  const subtitle = typingText || (conversation?.type === 'group' ? `${conversation.members.length} members` : peer && !peer.active ? 'deactivated' : '');
  const disabledReason = peer && !peer.active ? 'You can no longer write here' : undefined;

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const older = items[index + 1];
    const showDay = !older || !isSameDay(item.created_at, older.created_at);
    return (
      <View>
        {showDay && (
          <View style={{ alignItems: 'center', marginVertical: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.textMuted, backgroundColor: c.card, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' }}>
              {dayLabel(item.created_at)}
            </Text>
          </View>
        )}
        <MessageItem
          message={item}
          conversation={conversation!}
          myUserId={myUserId}
          name={name}
          startsRun={startsNewRun(older, item)}
          highlighted={item.id === highlightId}
          c={c}
          onLongPress={onLongPress}
          onOpenPhoto={onOpenPhoto}
          onRetry={onRetry}
          onDiscard={onDiscard}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatHeader
        c={c}
        title={conversation ? conversationTitle(conversation, myUserId) : 'Loading…'}
        subtitle={subtitle}
        leading={conversation ? <ChatAvatar conversation={conversation} myUserId={myUserId} size={34} tint={c.primary} /> : undefined}
        onTitlePress={conversation?.type === 'group' ? () => router.push(`/chat/info/${conversationId}` as any) : undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chat' as any))}
        right={
          conversation ? (
            <Pressable onPress={toggleMute} hitSlop={10} accessibilityLabel={conversation.muted ? 'Unmute' : 'Mute'} style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.6 : 1 })}>
              <SymbolView
                name={conversation.muted ? { ios: 'bell.slash.fill', android: 'notifications_off', web: 'notifications_off' } : { ios: 'bell', android: 'notifications', web: 'notifications' }}
                size={20}
                tintColor={conversation.muted ? c.textFaint : c.textMuted}
              />
            </Pressable>
          ) : undefined
        }
      />

      {!conversation || !thread || (thread.status !== 'success' && thread.items.length === 0) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {thread?.status === 'error' ? (
            <>
              <Text style={{ color: c.textMuted }}>Failed to load messages</Text>
              <Pressable onPress={() => loadMessages(conversationId)} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: c.primary }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator size="large" color={c.primary} />
          )}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          inverted
          keyExtractor={(m) => (m.client_id && m.id < 0 ? `p-${m.client_id}` : String(m.id))}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onEndReached={() => loadMessages(conversationId, true)}
          onEndReachedThreshold={0.5}
          onScrollToIndexFailed={({ index }) => setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5 }), 300)}
          ListFooterComponent={thread.loadingOlder ? <ActivityIndicator style={{ marginVertical: 12 }} color={c.primary} /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 60, transform: [{ scaleY: -1 }] }}>
              <Text style={{ color: c.textMuted }}>No messages yet. Say hi 👋</Text>
            </View>
          }
        />
      )}

      {!!conversation && (
        <ChatComposer conversationId={conversationId} c={c} name={name} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} disabledReason={disabledReason} />
      )}

      <PhotoViewer photos={viewer?.photos ?? []} index={viewer?.index ?? null} onClose={() => setViewer(null)} />
    </KeyboardAvoidingView>
  );
}
