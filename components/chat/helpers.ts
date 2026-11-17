import type { ChatConversation, ChatMember, ChatMessage, ChatReply, ChatSystemEvent } from './types';

/**
 * Same rules as the web chat (frontend/src/pages/Chat/helpers.ts) — titles, previews,
 * system lines and message grouping must read identically on both.
 */

/** Name by id: chat members first, then all employees — someone who left a group isn't a member anymore. */
export type NameLookup = (userId: number | null) => string;

export function makeNameLookup(members: ChatMember[], employees: { id: number; name: string }[], myUserId: number): NameLookup {
  return (userId) => {
    if (userId == null) return '';
    if (Number(userId) === myUserId) return 'You';
    return members.find((m) => m.id === Number(userId))?.name ?? employees.find((e) => Number(e.id) === Number(userId))?.name ?? 'Former employee';
  };
}

/** The other person in a direct chat. */
export function directPeer(conversation: ChatConversation, myUserId: number): ChatMember | undefined {
  return conversation.members.find((m) => m.id !== myUserId) ?? conversation.members[0];
}

export function conversationTitle(conversation: ChatConversation, myUserId: number): string {
  if (conversation.type === 'group') return conversation.title || 'Group';
  return directPeer(conversation, myUserId)?.name ?? 'Direct message';
}

export function parseSystemEvent(body: string | null): ChatSystemEvent | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as ChatSystemEvent;
  } catch {
    return null;
  }
}

const joinNames = (ids: number[], name: NameLookup) => ids.map((id) => name(id)).join(', ');

export function systemText(body: string | null, name: NameLookup): string {
  const event = parseSystemEvent(body);
  if (!event) return '';
  const actor = name(event.actor_id);
  switch (event.action) {
    case 'group_created':
      return `${actor} created the group`;
    case 'group_renamed':
      return `${actor} renamed the group to “${event.title}”`;
    case 'members_added':
      return `${actor} added ${joinNames(event.user_ids, name)}`;
    case 'member_removed':
      return `${actor} removed ${joinNames(event.user_ids, name)}`;
    case 'member_left':
      return `${actor} left the group`;
    default:
      return '';
  }
}

export function entityLabel(entity: { type: string; id: number }): string {
  return entity.type === 'appointment' ? `Appointment #${entity.id}` : `Customer #${entity.id}`;
}

/** One line for the chat list and reply quotes. */
export function messagePreview(message: ChatMessage | ChatReply | null, name: NameLookup): string {
  if (!message) return '';
  if (message.deleted) return 'Message deleted';
  if (message.type === 'system') return systemText(message.body, name);
  const text = message.body?.replace(/\s+/g, ' ').trim();
  if (message.entity) return text ? `${entityLabel(message.entity)} · ${text}` : entityLabel(message.entity);
  const photos = 'attachments' in message ? message.attachments.length : message.attachments_count;
  if (photos) {
    const label = photos > 1 ? `📷 ${photos} photos` : '📷 Photo';
    return text ? `${label} · ${text}` : label;
  }
  return text ?? '';
}

// ─── Dates (no dayjs in the app — plain Date + Intl) ─────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Chat list time: today — hours, this week — weekday, older — date. */
export function listTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (days === 0) return timeOfDay(iso);
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Messages from one author within a few minutes are grouped: name and avatar only on the first. */
export const GROUP_GAP_MINUTES = 5;

export function startsNewRun(prev: ChatMessage | undefined, current: ChatMessage): boolean {
  if (!prev || prev.type === 'system' || current.type === 'system') return true;
  if (prev.sender_id !== current.sender_id) return true;
  if (!isSameDay(prev.created_at, current.created_at)) return true;
  return new Date(current.created_at).getTime() - new Date(prev.created_at).getTime() >= GROUP_GAP_MINUTES * 60 * 1000;
}

/** My message was read by the other person (direct chats only — groups show no ticks). */
export function isReadByPeer(conversation: ChatConversation, message: ChatMessage, myUserId: number): boolean {
  const peer = directPeer(conversation, myUserId);
  return !!peer && peer.id !== myUserId && (peer.last_read_message_id ?? 0) >= message.id;
}

/** Initials for an avatar: "Nick Smith" → "NS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Random id for idempotent sends (the server dedupes by sender + client_id). */
export function makeClientId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Appointment status labels — AppointmentStatus on the backend. */
export const APPOINTMENT_STATUS: Record<number, { label: string; color: string }> = {
  0: { label: 'Scheduled', color: '#6366F1' },
  1: { label: 'On the way', color: '#F59E0B' },
  2: { label: 'Done', color: '#10B981' },
};
