/** Internal staff chat API shapes — mirror of nestjs/src/chat/chat.views.ts and frontend/src/pages/Chat/types.ts. */

export type ChatConversationType = 'direct' | 'group';
export type ChatMessageType = 'text' | 'entity' | 'system';
export type ChatEntityType = 'customer' | 'appointment';

export interface ChatEntityRef {
  type: ChatEntityType;
  id: number;
}

export interface ChatMember {
  id: number;
  name: string;
  color: string | null;
  active: boolean;
  role: 'owner' | 'member';
  last_read_message_id: number | null;
}

export interface ChatAttachment {
  id: number;
  url: string;
  width: number | null;
  height: number | null;
}

export interface ChatReply {
  id: number;
  sender_id: number | null;
  type: ChatMessageType;
  body: string | null;
  entity: ChatEntityRef | null;
  attachments_count: number;
  deleted: boolean;
}

/** Состояние отправки — только у своих сообщений, которые ещё не подтвердил сервер. */
export type ChatSendStatus = 'sending' | 'failed';

export interface ChatMessage {
  /** У неподтверждённого своего сообщения — отрицательный временный id. */
  id: number;
  conversation_id: number;
  sender_id: number | null;
  type: ChatMessageType;
  body: string | null;
  entity: ChatEntityRef | null;
  attachments: ChatAttachment[];
  reply_to: ChatReply | null;
  client_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  send_status?: ChatSendStatus;
}

export interface ChatConversation {
  id: number;
  type: ChatConversationType;
  title: string | null;
  created_by: number;
  created_at: string;
  last_message_at: string | null;
  last_message: ChatMessage | null;
  unread_count: number;
  muted: boolean;
  members: ChatMember[];
}

/** То же, что приходит в `chat:conversation_updated`: без личных полей получателя. */
export type ChatConversationShared = Omit<ChatConversation, 'unread_count' | 'muted'> & Partial<Pick<ChatConversation, 'unread_count' | 'muted'>>;

export interface ChatMention {
  conversation: ChatConversation;
  last_message_id: number;
  mentions_count: number;
  last_mentioned_at: string;
}

export type ChatSystemEvent =
  | { action: 'group_created'; actor_id: number }
  | { action: 'group_renamed'; actor_id: number; title: string }
  | { action: 'members_added' | 'member_removed' | 'member_left'; actor_id: number; user_ids: number[] };

export interface SendMessagePayload {
  body?: string;
  entity?: ChatEntityRef;
  attachment_ids?: number[];
  reply_to_id?: number;
  client_id: string;
}

// ─── Живые карточки ─────────────────────────────────────────────────────────

export interface ChatCardAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
}

export interface ChatCustomerCard {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: ChatCardAddress | null;
}

/** status: 0 — запланирован, 1 — техник в пути, 2 — выполнен (AppointmentStatus на бэкенде). */
export interface ChatAppointmentCard {
  id: number;
  job_id: number;
  status: number;
  start: string;
  end: string;
  customer: { id: number; name: string; phone: string | null } | null;
  address: ChatCardAddress | null;
  techs: { id: number; name: string; color: string | null }[];
}

export interface ChatCardsResponse {
  customers: Record<number, ChatCustomerCard>;
  appointments: Record<number, ChatAppointmentCard>;
}

export interface ChatEntitySearchResult {
  customers: ChatCustomerCard[];
  appointments: ChatAppointmentCard[];
}
