import type { ChatConversation, ChatConversationShared, ChatMessage } from './types';

/**
 * Chat state — a plain-reducer port of the web store (frontend/src/store/chatSlice.ts),
 * same rules: the server is the source of truth, the list is reloaded on every socket
 * (re)connect, and `chat:*` events keep it fresh in between.
 */

export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ChatThreadState {
  /** Confirmed messages by ascending id, then my own unsent ones. */
  items: ChatMessage[];
  hasMore: boolean;
  status: LoadStatus;
  loadingOlder: boolean;
}

export interface ChatState {
  conversations: Record<number, ChatConversation>;
  listStatus: LoadStatus;
  threads: Record<number, ChatThreadState>;
  /** conversationId → userId → when the last "typing" arrived. */
  typing: Record<number, Record<number, number>>;
  /** The chat on screen right now: messages into it don't count as unread. */
  activeConversationId: number | null;
}

/** How long "typing…" stays after the last event. The server sends them at most every 2 s. */
export const TYPING_VISIBLE_MS = 4000;

export const initialChatState: ChatState = {
  conversations: {},
  listStatus: 'idle',
  threads: {},
  typing: {},
  activeConversationId: null,
};

export type ChatAction =
  | { type: 'reset' }
  | { type: 'setActive'; id: number | null }
  | { type: 'listLoading' }
  | { type: 'listLoaded'; conversations: ChatConversation[] }
  | { type: 'listFailed' }
  | { type: 'conversationUpserted'; conversation: ChatConversationShared }
  | { type: 'conversationRemoved'; id: number }
  | { type: 'threadLoading'; conversationId: number; older: boolean }
  | { type: 'threadLoaded'; conversationId: number; older: boolean; messages: ChatMessage[]; hasMore: boolean }
  | { type: 'threadFailed'; conversationId: number; older: boolean }
  | { type: 'messageReceived'; message: ChatMessage; myUserId: number }
  | { type: 'messageFailed'; conversationId: number; clientId: string }
  | { type: 'pendingDiscarded'; conversationId: number; clientId: string }
  | { type: 'readReceived'; conversationId: number; userId: number; messageId: number; myUserId: number }
  | { type: 'typingReceived'; conversationId: number; userId: number; at: number };

const emptyThread = (): ChatThreadState => ({ items: [], hasMore: false, status: 'idle', loadingOlder: false });

export const isPending = (m: ChatMessage) => m.id < 0;

/** Inserts or replaces a message keeping the order; recognises my unsent one by client_id. */
export function upsertMessage(items: ChatMessage[], message: ChatMessage): { items: ChatMessage[]; isNew: boolean } {
  const byId = items.findIndex((m) => m.id === message.id);
  if (byId !== -1) {
    const next = items.slice();
    next[byId] = message;
    return { items: next, isNew: false };
  }

  const confirmed = items.filter((m) => !isPending(m));
  const pending = items.filter((m) => isPending(m) && !(message.client_id && m.client_id === message.client_id));
  const wasPending = pending.length !== items.length - confirmed.length;

  if (isPending(message)) return { items: [...confirmed, ...pending, message], isNew: true };

  let at = confirmed.length;
  while (at > 0 && confirmed[at - 1].id > message.id) at--;
  confirmed.splice(at, 0, message);
  return { items: [...confirmed, ...pending], isNew: !wasPending };
}

function withRead(conversation: ChatConversation, userId: number, messageId: number, myUserId: number): ChatConversation {
  const members = conversation.members.map((m) => (m.id === userId && (m.last_read_message_id ?? 0) < messageId ? { ...m, last_read_message_id: messageId } : m));
  // I read it myself (here or on another device): everything up to the last message is read.
  const unread_count = userId === myUserId && messageId >= (conversation.last_message?.id ?? 0) ? 0 : conversation.unread_count;
  return { ...conversation, members, unread_count };
}

function setConversation(state: ChatState, c: ChatConversation): ChatState {
  return { ...state, conversations: { ...state.conversations, [c.id]: c } };
}

function setThread(state: ChatState, id: number, thread: ChatThreadState): ChatState {
  return { ...state, threads: { ...state.threads, [id]: thread } };
}

function omit<T>(record: Record<number, T>, id: number): Record<number, T> {
  if (!(id in record)) return record;
  const next = { ...record };
  delete next[id];
  return next;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'reset':
      return initialChatState;

    case 'setActive':
      return { ...state, activeConversationId: action.id };

    case 'listLoading':
      // A reload after reconnect must not flash a spinner over the list.
      return state.listStatus === 'success' ? state : { ...state, listStatus: 'loading' };

    case 'listLoaded':
      return { ...state, listStatus: 'success', conversations: Object.fromEntries(action.conversations.map((c) => [c.id, c])) };

    case 'listFailed':
      return state.listStatus === 'success' ? state : { ...state, listStatus: 'error' };

    case 'conversationUpserted': {
      // Socket events don't carry the recipient's own fields (unread, muted) — keep ours.
      const incoming = action.conversation;
      const existing = state.conversations[incoming.id];
      const keepOldLast = !!existing?.last_message && (incoming.last_message?.id ?? 0) < existing.last_message.id;
      let next = setConversation(state, {
        ...incoming,
        unread_count: incoming.unread_count ?? existing?.unread_count ?? 0,
        muted: incoming.muted ?? existing?.muted ?? false,
        last_message: keepOldLast ? existing!.last_message : incoming.last_message,
        last_message_at: keepOldLast ? existing!.last_message_at : incoming.last_message_at,
      });

      // System lines ("added", "renamed") come only as the last message of the updated chat.
      const thread = state.threads[incoming.id];
      const last = incoming.last_message;
      if (thread && last && last.id > 0 && !thread.items.some((m) => m.id === last.id)) {
        const newestKnown = Math.max(0, ...thread.items.filter((m) => !isPending(m)).map((m) => m.id));
        if (last.id > newestKnown) next = setThread(next, incoming.id, { ...thread, items: upsertMessage(thread.items, last).items });
      }
      return next;
    }

    case 'conversationRemoved':
      return {
        ...state,
        conversations: omit(state.conversations, action.id),
        threads: omit(state.threads, action.id),
        typing: omit(state.typing, action.id),
        activeConversationId: state.activeConversationId === action.id ? null : state.activeConversationId,
      };

    case 'threadLoading': {
      const thread = state.threads[action.conversationId] ?? emptyThread();
      if (action.older) return setThread(state, action.conversationId, { ...thread, loadingOlder: true });
      return setThread(state, action.conversationId, thread.status === 'success' ? thread : { ...thread, status: 'loading' });
    }

    case 'threadLoaded': {
      const thread = state.threads[action.conversationId] ?? emptyThread();
      const pending = thread.items.filter(isPending);
      const { messages } = action;

      if (action.older) {
        const known = new Set(thread.items.map((m) => m.id));
        return setThread(state, action.conversationId, {
          ...thread,
          items: [...messages.filter((m) => !known.has(m.id)), ...thread.items],
          loadingOlder: false,
          hasMore: action.hasMore,
        });
      }
      // A fresh page replaces the tail; older pages already loaded stay.
      const oldestFresh = messages[0]?.id ?? Infinity;
      const older = thread.items.filter((m) => !isPending(m) && m.id < oldestFresh);
      return setThread(state, action.conversationId, {
        ...thread,
        items: [...older, ...messages, ...pending.filter((p) => !messages.some((m) => m.client_id && m.client_id === p.client_id))],
        hasMore: older.length ? thread.hasMore : action.hasMore,
        status: 'success',
      });
    }

    case 'threadFailed': {
      const thread = state.threads[action.conversationId];
      if (!thread) return state;
      if (action.older) return setThread(state, action.conversationId, { ...thread, loadingOlder: false });
      return thread.status === 'success' ? state : setThread(state, action.conversationId, { ...thread, status: 'error' });
    }

    case 'messageReceived': {
      const { message, myUserId } = action;
      const conversationId = message.conversation_id;
      let next = state;

      let isNew = true;
      const thread = state.threads[conversationId];
      if (thread) {
        const result = upsertMessage(thread.items, message);
        isNew = result.isNew;
        next = setThread(next, conversationId, { ...thread, items: result.items });
      }

      const conversation = state.conversations[conversationId];
      if (conversation && !isPending(message)) {
        const prevLastId = conversation.last_message?.id ?? 0;
        let c = conversation;
        if (message.id >= prevLastId) c = { ...c, last_message: message, last_message_at: message.created_at };
        const fromOther = message.sender_id !== myUserId && message.type !== 'system';
        if (fromOther && isNew && message.id > prevLastId && state.activeConversationId !== conversationId) c = { ...c, unread_count: c.unread_count + 1 };
        if (message.sender_id === myUserId) c = withRead(c, myUserId, message.id, myUserId);
        next = setConversation(next, c);
      }

      const typing = state.typing[conversationId];
      if (message.sender_id != null && typing?.[message.sender_id]) {
        const rest = { ...typing };
        delete rest[message.sender_id];
        next = { ...next, typing: { ...next.typing, [conversationId]: rest } };
      }
      return next;
    }

    case 'messageFailed':
    case 'pendingDiscarded': {
      const thread = state.threads[action.conversationId];
      if (!thread) return state;
      const match = (m: ChatMessage) => isPending(m) && m.client_id === action.clientId;
      const items =
        action.type === 'messageFailed' ? thread.items.map((m) => (match(m) ? { ...m, send_status: 'failed' as const } : m)) : thread.items.filter((m) => !match(m));
      return setThread(state, action.conversationId, { ...thread, items });
    }

    case 'readReceived': {
      const conversation = state.conversations[action.conversationId];
      return conversation ? setConversation(state, withRead(conversation, action.userId, action.messageId, action.myUserId)) : state;
    }

    case 'typingReceived':
      return { ...state, typing: { ...state.typing, [action.conversationId]: { ...state.typing[action.conversationId], [action.userId]: action.at } } };

    default:
      return state;
  }
}

// ─── Selectors ──────────────────────────────────────────────────────────────

const activityAt = (c: ChatConversation) => c.last_message_at ?? c.created_at;

export function sortConversations(conversations: Record<number, ChatConversation>): ChatConversation[] {
  return Object.values(conversations).sort((a, b) => (activityAt(a) < activityAt(b) ? 1 : activityAt(a) > activityAt(b) ? -1 : b.id - a.id));
}

/** For the tab badge: muted chats don't count. */
export function unreadTotal(conversations: Record<number, ChatConversation>): number {
  return Object.values(conversations).reduce((sum, c) => sum + (c.muted ? 0 : c.unread_count), 0);
}
