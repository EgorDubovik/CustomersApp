import { useEffect, useState } from 'react';
import { useChat } from '@/context/ChatContext';
import type { ChatApi } from './api';
import type { ChatAppointmentCard, ChatCustomerCard, ChatEntityRef } from './types';

/**
 * Live cards: a message stores only "appointment #12", the current data is fetched when
 * the card is shown. Cards on one screen are fetched in a single request (a short batch
 * window), and kept for a few minutes so scrolling back doesn't refetch them.
 */
const STALE_MS = 5 * 60 * 1000;
const BATCH_MS = 30;

type Card = { type: 'customer'; data: ChatCustomerCard } | { type: 'appointment'; data: ChatAppointmentCard };
export type CardState = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | ({ status: 'ready' } & Card);

interface Entry {
  state: CardState;
  at: number;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (e: ChatEntityRef) => `${e.type}:${e.id}`;

function set(key: string, state: CardState) {
  cache.set(key, { state, at: Date.now() });
  listeners.get(key)?.forEach((fn) => fn());
}

async function flush(api: ChatApi) {
  timer = null;
  const keys = [...queue];
  queue.clear();
  const ids = (type: string) => keys.filter((k) => k.startsWith(`${type}:`)).map((k) => Number(k.split(':')[1]));
  try {
    const res = await api.cards(ids('customer'), ids('appointment'));
    for (const key of keys) {
      const [type, raw] = key.split(':');
      const id = Number(raw);
      const data = type === 'customer' ? res.customers[id] : res.appointments[id];
      // Not returned → deleted or not visible to me
      set(key, data ? ({ status: 'ready', type, data } as CardState) : { status: 'missing' });
    }
  } catch {
    keys.forEach((key) => set(key, { status: 'error' }));
  }
}

function request(api: ChatApi, entity: ChatEntityRef, force = false) {
  const key = keyOf(entity);
  const entry = cache.get(key);
  if (!force && entry && (entry.state.status === 'loading' || Date.now() - entry.at < STALE_MS)) return;
  // Keep showing the old data while refreshing
  if (!entry || entry.state.status !== 'ready') set(key, { status: 'loading' });
  queue.add(key);
  if (!timer) timer = setTimeout(() => flush(api), BATCH_MS);
}

/** Cache a card fetched elsewhere (entity search) so it shows without a request. */
export function seedChatCard(card: Card) {
  set(`${card.type}:${card.data.id}`, { status: 'ready', ...card } as CardState);
}

export function useChatCard(entity: ChatEntityRef): { card: CardState; reload: () => void } {
  const { api } = useChat();
  const key = keyOf(entity);
  const [, rerender] = useState(0);

  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
    request(api, entity);
    return () => {
      listeners.get(key)?.delete(fn);
    };
  }, [key, api]);

  return { card: cache.get(key)?.state ?? { status: 'loading' }, reload: () => request(api, entity, true) };
}
