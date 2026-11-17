import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSocket, useSocketEvent } from './SocketContext';
import { createChatApi, ChatApi } from '@/components/chat/api';
import { makeClientId } from '@/components/chat/helpers';
import { ChatState, chatReducer, initialChatState, isPending, unreadTotal } from '@/components/chat/reducer';
import type { ChatAttachment, ChatConversation, ChatConversationShared, ChatEntityRef, ChatMessage, ChatReply } from '@/components/chat/types';
import { setActiveChatConversation } from '@/utils/pushNotifications';

/** Client-side throttle for "typing" — the server drops anything more frequent anyway. */
const TYPING_EMIT_MS = 2000;
const PAGE_SIZE = 40;

interface SendArgs {
  conversationId: number;
  body?: string;
  entity?: ChatEntityRef;
  attachments?: ChatAttachment[];
  replyTo?: ChatMessage | ChatReply | null;
  /** Retry of a failed send — same id, so the server won't duplicate it. */
  clientId?: string;
}

interface ChatContextType {
  state: ChatState;
  api: ChatApi;
  myUserId: number;
  /** Unread across all chats except muted ones — the Chat tab badge. */
  unread: number;
  setActive: (id: number | null) => void;
  loadConversation: (id: number) => Promise<ChatConversation | null>;
  loadMessages: (id: number, older?: boolean) => Promise<void>;
  send: (args: SendArgs) => Promise<ChatMessage | null>;
  discardPending: (conversationId: number, clientId: string) => void;
  markRead: (conversationId: number) => void;
  deleteMessage: (messageId: number) => Promise<void>;
  emitTyping: (conversationId: number) => void;
  /** Applies a conversation the API returned (mute, rename, members, open direct…). */
  upsertConversation: (conversation: ChatConversation) => void;
  removeConversation: (id: number) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

/**
 * Internal staff chat for the whole app: keeps the conversation list and open threads,
 * listens to `chat:*` socket events (same as the web SocketProvider) and exposes the
 * actions screens use. Screens read from here and never subscribe to chat events themselves.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const { socket, connected, reconnectCount } = useSocket();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const myUserId = Number(user?.id ?? 0);
  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;

  const api = useMemo(() => createChatApi(token), [token]);
  const apiRef = useRef(api);
  apiRef.current = api;

  // Signed out (or someone else signed in) — drop everything of the previous user.
  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [token]);

  const loadList = useCallback(async () => {
    dispatch({ type: 'listLoading' });
    try {
      dispatch({ type: 'listLoaded', conversations: await apiRef.current.listConversations() });
    } catch (e) {
      console.warn('[chat] Failed to load conversations', e);
      dispatch({ type: 'listFailed' });
    }
  }, []);

  const loadMessages = useCallback(async (id: number, older = false) => {
    const thread = stateRef.current.threads[id];
    const before = older ? thread?.items.find((m) => !isPending(m))?.id : undefined;
    if (older && (!before || thread?.loadingOlder || !thread?.hasMore)) return;
    dispatch({ type: 'threadLoading', conversationId: id, older });
    try {
      const page = await apiRef.current.listMessages(id, before, PAGE_SIZE);
      dispatch({ type: 'threadLoaded', conversationId: id, older, messages: page.messages, hasMore: page.has_more });
    } catch (e) {
      console.warn('[chat] Failed to load messages', e);
      dispatch({ type: 'threadFailed', conversationId: id, older });
    }
  }, []);

  // Events emitted while the socket was down are lost: reload the list and the open thread
  // on every (re)connect, like the web does.
  useEffect(() => {
    if (!token || !connected) return;
    void loadList();
    const active = stateRef.current.activeConversationId;
    if (active) void loadMessages(active);
  }, [token, connected, reconnectCount, loadList, loadMessages]);

  const loadConversation = useCallback(async (id: number) => {
    try {
      const conversation = await apiRef.current.getConversation(id);
      dispatch({ type: 'conversationUpserted', conversation });
      return conversation;
    } catch (e) {
      console.warn('[chat] Failed to load conversation', e);
      return null;
    }
  }, []);

  // ─── Socket ─────────────────────────────────────────────────────────────────
  useSocketEvent<{ conversation_id: number; message: ChatMessage }>('chat:message', ({ conversation_id, message }) => {
    dispatch({ type: 'messageReceived', message, myUserId: myUserIdRef.current });
    // First message of a new direct chat: the chat itself isn't in our list yet.
    if (!stateRef.current.conversations[conversation_id]) void loadConversation(conversation_id);
  });
  useSocketEvent<{ message: ChatMessage }>('chat:message_updated', ({ message }) => {
    dispatch({ type: 'messageReceived', message, myUserId: myUserIdRef.current });
  });
  useSocketEvent<{ conversation_id: number; user_id: number; message_id: number }>('chat:read', ({ conversation_id, user_id, message_id }) => {
    dispatch({ type: 'readReceived', conversationId: conversation_id, userId: user_id, messageId: message_id, myUserId: myUserIdRef.current });
  });
  useSocketEvent<{ conversation: ChatConversationShared }>('chat:conversation_updated', ({ conversation }) => {
    dispatch({ type: 'conversationUpserted', conversation });
  });
  useSocketEvent<{ conversation_id: number }>('chat:conversation_removed', ({ conversation_id }) => {
    dispatch({ type: 'conversationRemoved', id: conversation_id });
  });
  useSocketEvent<{ conversation_id: number; user_id: number }>('chat:typing', ({ conversation_id, user_id }) => {
    if (user_id === myUserIdRef.current) return;
    dispatch({ type: 'typingReceived', conversationId: conversation_id, userId: user_id, at: Date.now() });
  });

  const lastTypingEmit = useRef<Record<number, number>>({});
  const emitTyping = useCallback(
    (conversationId: number) => {
      const now = Date.now();
      if (!socket || now - (lastTypingEmit.current[conversationId] ?? 0) < TYPING_EMIT_MS) return;
      lastTypingEmit.current[conversationId] = now;
      socket.emit('chat:typing', { conversation_id: conversationId });
    },
    [socket],
  );

  // ─── Actions ────────────────────────────────────────────────────────────────
  const setActive = useCallback((id: number | null) => {
    dispatch({ type: 'setActive', id });
    // A push for the chat on screen shouldn't show a banner (see pushNotifications).
    setActiveChatConversation(id);
  }, []);

  /**
   * Optimistic send: the message shows up right away, and `client_id` ties it to the
   * server reply and to the socket event that may arrive before that reply.
   */
  const send = useCallback(async (args: SendArgs) => {
    const me = myUserIdRef.current;
    const clientId = args.clientId ?? makeClientId();
    const body = args.body?.trim() || undefined;
    const reply = args.replyTo;

    dispatch({
      type: 'messageReceived',
      myUserId: me,
      message: {
        id: -Date.now(),
        conversation_id: args.conversationId,
        sender_id: me,
        type: args.entity ? 'entity' : 'text',
        body: body ?? null,
        entity: args.entity ?? null,
        attachments: args.attachments ?? [],
        reply_to: reply
          ? {
              id: reply.id,
              sender_id: reply.sender_id,
              type: reply.type,
              body: reply.body,
              entity: reply.entity,
              attachments_count: 'attachments' in reply ? reply.attachments.length : reply.attachments_count,
              deleted: reply.deleted,
            }
          : null,
        client_id: clientId,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted: false,
        send_status: 'sending',
      },
    });

    try {
      const saved = await apiRef.current.sendMessage(args.conversationId, {
        body,
        entity: args.entity,
        attachment_ids: args.attachments?.map((a) => a.id),
        reply_to_id: reply?.id,
        client_id: clientId,
      });
      dispatch({ type: 'messageReceived', message: saved, myUserId: me });
      return saved;
    } catch (e) {
      console.warn('[chat] Send failed', e);
      dispatch({ type: 'messageFailed', conversationId: args.conversationId, clientId });
      return null;
    }
  }, []);

  const discardPending = useCallback((conversationId: number, clientId: string) => {
    dispatch({ type: 'pendingDiscarded', conversationId, clientId });
  }, []);

  /** Read up to the last confirmed message; no request if it's already read. */
  const markRead = useCallback((conversationId: number) => {
    const s = stateRef.current;
    const me = myUserIdRef.current;
    const conversation = s.conversations[conversationId];
    const ids = s.threads[conversationId]?.items.filter((m) => !isPending(m)).map((m) => m.id) ?? [];
    const lastId = Math.max(conversation?.last_message?.id ?? 0, ...ids, 0);
    const myRead = conversation?.members.find((m) => m.id === me)?.last_read_message_id ?? 0;
    if (!conversation || lastId <= 0 || (lastId <= myRead && conversation.unread_count === 0)) return;

    dispatch({ type: 'readReceived', conversationId, userId: me, messageId: lastId, myUserId: me });
    apiRef.current.markRead(conversationId, lastId).catch((e) => console.warn('[chat] Mark read failed', e));
  }, []);

  const deleteMessage = useCallback(async (messageId: number) => {
    const message = await apiRef.current.deleteMessage(messageId);
    dispatch({ type: 'messageReceived', message, myUserId: myUserIdRef.current });
  }, []);

  const upsertConversation = useCallback((conversation: ChatConversation) => dispatch({ type: 'conversationUpserted', conversation }), []);
  const removeConversation = useCallback((id: number) => dispatch({ type: 'conversationRemoved', id }), []);

  const unread = useMemo(() => unreadTotal(state.conversations), [state.conversations]);

  const value = useMemo<ChatContextType>(
    () => ({
      state,
      api,
      myUserId,
      unread,
      setActive,
      loadConversation,
      loadMessages,
      send,
      discardPending,
      markRead,
      deleteMessage,
      emitTyping,
      upsertConversation,
      removeConversation,
    }),
    [state, api, myUserId, unread, setActive, loadConversation, loadMessages, send, discardPending, markRead, deleteMessage, emitTyping, upsertConversation, removeConversation],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within ChatProvider');
  return context;
}
