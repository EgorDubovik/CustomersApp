import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { CompanyPhone } from '@/context/AuthContext';
import { ICall, IConversation, ISmsMessage } from './types';

export const formatPhoneNumber = (phone: string | null | undefined): string => {
  if (!phone) return '';
  const cleaned = String(phone).replace(/\D/g, '');
  const ten = cleaned.length === 10 ? cleaned : cleaned.length > 10 ? cleaned.slice(-10) : null;
  if (!ten) return String(phone);
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
};

/** "1:05 sec"-style duration used across the calls UI on the web */
export const formatCallDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** m:ss, or h:mm:ss after an hour — for the live-call timer and the player */
export const formatClock = (totalSeconds: number): string => {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mmss = `${h > 0 ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
};

export const getCustomerPhoneFromCall = (call: ICall | null | undefined) =>
  !call ? '' : call.direction === 'incoming' ? call.from_number : call.to_number;

export const getBusinessNumberFromCall = (call: ICall | null | undefined) =>
  !call ? '' : call.direction === 'incoming' ? call.to_number : call.from_number;

export const getCustomerPhone = (conv: IConversation | null | undefined) => {
  if (!conv) return '';
  if (conv.customer_phone) return conv.customer_phone;
  return getCustomerPhoneFromCall(conv.calls?.[0] ?? conv.last_call);
};

export const getCompanyPhone = (conv: IConversation | null | undefined) => {
  if (!conv) return '';
  return conv.company_phone || getBusinessNumberFromCall(conv.calls?.[0]) || getBusinessNumberFromCall(conv.last_call);
};

export const getMatchedCompanyPhone = (raw: string, companyPhones: CompanyPhone[]): CompanyPhone | null => {
  if (!raw) return null;
  const clean = raw.replace(/\D/g, '');
  return companyPhones.find((p) => {
    const pc = (p.phone || '').replace(/\D/g, '');
    return pc === clean || pc.slice(-10) === clean.slice(-10);
  }) ?? null;
};

/** The conversation may have ended with a text rather than a call — then the row shows the text */
export const getLastSmsIfNewer = (conv: IConversation | null | undefined): ISmsMessage | null => {
  const lastMessage = conv?.last_message;
  if (!lastMessage) return null;
  const lastCall = conv?.last_call;
  if (!lastCall) return lastMessage;
  return new Date(lastMessage.created_at) > new Date(lastCall.created_at) ? lastMessage : null;
};

/** Today: "10:30 AM" · yesterday: "Yesterday 10:30 AM" · this year: "Sep 26" · else "Sep 26, 2025" */
export const formatConversationDate = (input: string | null | undefined): string => {
  if (!input) return '';
  const date = new Date(input);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, now)) return formatDate(date, 'hh:mm A');
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return `Yesterday ${formatDate(date, 'hh:mm A')}`;
  if (date.getFullYear() === now.getFullYear()) return formatDate(date, 'MMM DD');
  return formatDate(date, 'MMM DD, YYYY');
};

export const isSameDay = (a: string, b: string) => {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
};

/**
 * Unread call = finished and never picked up. Same rule as the backend (calls/unread-call.ts):
 * an incoming call has no read_at while it is still ringing, and that is not "unread".
 */
export const isCallUnread = (call: Pick<ICall, 'read_at' | 'status' | 'completed_at'>) =>
  !call.read_at && (Boolean(call.completed_at) || call.status === 'no-answer' || call.status === 'completed');

export const isMessageUnread = (m: Pick<ISmsMessage, 'read_at'>) => !m.read_at;

export const unreadDelta = <T,>(previous: T | null | undefined, next: T, isUnread: (item: T) => boolean): number => {
  const was = previous ? isUnread(previous) : false;
  const now = isUnread(next);
  if (was === now) return 0;
  return now ? 1 : -1;
};

export const applyConversationRead = (conv: IConversation, readAt: string): IConversation => ({
  ...conv,
  unread_count: 0,
  calls: conv.calls?.map((c) => (c.read_at ? c : { ...c, read_at: readAt })),
  messages: conv.messages?.map((m) => (m.read_at ? m : { ...m, read_at: readAt })),
  last_call: conv.last_call && !conv.last_call.read_at ? { ...conv.last_call, read_at: readAt } : conv.last_call,
  last_message: conv.last_message && !conv.last_message.read_at ? { ...conv.last_message, read_at: readAt } : conv.last_message,
});

/** Merge a socket `call.updated` payload into a conversation (list row or open conversation) */
export const mergeCallIntoConversation = (conv: IConversation, call: ICall): IConversation => {
  const inCalls = conv.calls?.some((c) => c.id === call.id) ?? false;
  const previous = conv.calls?.find((c) => c.id === call.id) ?? (conv.last_call?.id === call.id ? conv.last_call : null);
  const isNew = !inCalls && conv.last_call?.id !== call.id;
  const calls = conv.calls ? (inCalls ? conv.calls.map((c) => (c.id === call.id ? { ...c, ...call } : c)) : [...conv.calls, call]) : conv.calls;
  const lastCall = conv.last_call && new Date(conv.last_call.created_at) > new Date(call.created_at) ? conv.last_call : call;
  return {
    ...conv,
    calls,
    last_call: lastCall,
    calls_count: isNew ? (conv.calls_count ?? 0) + 1 : conv.calls_count,
    unread_count: Math.max(0, (conv.unread_count ?? 0) + unreadDelta(previous, call, isCallUnread)),
    last_call_at: new Date(call.created_at) > new Date(conv.last_call_at || 0) ? call.created_at : conv.last_call_at,
  };
};

export const mergeSmsIntoConversation = (conv: IConversation, message: ISmsMessage): IConversation => {
  const already = conv.messages?.some((m) => m.id === message.id);
  const previous = conv.messages?.find((m) => m.id === message.id) ?? (conv.last_message?.id === message.id ? conv.last_message : null);
  const messages = conv.messages ? (already ? conv.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)) : [...conv.messages, message]) : conv.messages;
  return {
    ...conv,
    messages,
    last_message: message,
    unread_count: Math.max(0, (conv.unread_count ?? 0) + unreadDelta(previous, message, isMessageUnread)),
    last_call_at: new Date(message.created_at) > new Date(conv.last_call_at || 0) ? message.created_at : conv.last_call_at,
  };
};

export const sortByActivity = (list: IConversation[]) =>
  [...list].sort((a, b) => new Date(b.last_call_at).getTime() - new Date(a.last_call_at).getTime());
