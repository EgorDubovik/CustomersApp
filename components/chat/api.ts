import { API_URL } from '@/constants/Config';
import type { ChatAttachment, ChatCardsResponse, ChatConversation, ChatEntitySearchResult, ChatEntityType, ChatMention, ChatMessage, SendMessagePayload } from './types';

/**
 * REST of the internal chat (nestjs/src/chat/chat.controller.ts). Sending goes here;
 * the socket only delivers events. One client per auth token.
 */
export class ChatApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function createChatApi(token: string | null) {
  const headers = (json = false): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await fetch(`${API_URL}${path}`, { method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {}
    if (!r.ok) {
      const m = data?.message;
      throw new ChatApiError((Array.isArray(m) ? m.join(', ') : m) || `Server returned status code ${r.status}`, r.status);
    }
    return data as T;
  }

  const query = (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  return {
    listConversations: () => request<ChatConversation[]>('GET', '/chat/conversations'),
    getConversation: (id: number) => request<ChatConversation>('GET', `/chat/conversations/${id}`),
    openDirect: (userId: number) => request<ChatConversation>('POST', '/chat/conversations/direct', { user_id: userId }),
    createGroup: (title: string, memberIds: number[]) => request<ChatConversation>('POST', '/chat/conversations/group', { title, member_ids: memberIds }),
    renameGroup: (id: number, title: string) => request<ChatConversation>('PATCH', `/chat/conversations/${id}`, { title }),
    addMembers: (id: number, userIds: number[]) => request<ChatConversation>('POST', `/chat/conversations/${id}/members`, { user_ids: userIds }),
    removeMember: (id: number, userId: number) => request<void>('DELETE', `/chat/conversations/${id}/members/${userId}`),
    listMessages: (id: number, before?: number, limit?: number) =>
      request<{ messages: ChatMessage[]; has_more: boolean }>('GET', `/chat/conversations/${id}/messages${query({ before, limit })}`),
    sendMessage: (id: number, payload: SendMessagePayload) => request<ChatMessage>('POST', `/chat/conversations/${id}/messages`, payload),
    markRead: (id: number, messageId: number) => request<void>('POST', `/chat/conversations/${id}/read`, { message_id: messageId }),
    deleteMessage: (messageId: number) => request<ChatMessage>('DELETE', `/chat/messages/${messageId}`),
    setMuted: (id: number, muted: boolean) => request<ChatConversation>('POST', `/chat/conversations/${id}/mute`, { muted }),
    mentions: (entityType: ChatEntityType, entityId: number) => request<ChatMention[]>('GET', `/chat/mentions${query({ entity_type: entityType, entity_id: entityId })}`),
    cards: (customerIds: number[], appointmentIds: number[]) => request<ChatCardsResponse>('POST', '/chat/cards', { customer_ids: customerIds, appointment_ids: appointmentIds }),
    searchEntities: (q: string) => request<ChatEntitySearchResult>('GET', `/chat/entity-search${query({ q })}`),
    discardAttachment: (attachmentId: number) => request<void>('DELETE', `/chat/attachments/${attachmentId}`),

    /**
     * Photo goes up before the message is sent. XMLHttpRequest, not fetch: the global
     * fetch here is expo/fetch, which can't send a { uri, name, type } file in FormData.
     */
    uploadAttachment: (conversationId: number, file: { uri: string; name: string; type: string }, onProgress?: (percent: number) => void) =>
      new Promise<ChatAttachment>((resolve, reject) => {
        const form = new FormData();
        form.append('file', file as any);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/chat/conversations/${conversationId}/attachments`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.timeout = 120_000;
        if (onProgress) xhr.upload.onprogress = (e) => e.total && onProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => {
          let body: any = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {}
          if (xhr.status >= 200 && xhr.status < 300 && body?.id) return resolve(body as ChatAttachment);
          const m = body?.message;
          reject(new Error((Array.isArray(m) ? m.join(', ') : m) || `Failed to upload the photo (status ${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error while uploading the photo'));
        xhr.ontimeout = () => reject(new Error('Uploading the photo timed out'));
        xhr.send(form);
      }),
  };
}

export type ChatApi = ReturnType<typeof createChatApi>;
