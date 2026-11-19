import React from 'react';
import { Text } from 'react-native';

/**
 * Comment mentions are stored as `@[Name](user:ID)` — the same markup the web
 * (frontend/src/helpers/mentions.tsx) and the backend (nestjs/src/calls/mention-markup.ts)
 * use; the backend reads the IDs to notify people. On screen it's just "@Name".
 */
const MENTION_RE = /@\[([^\]\n]{1,100})\]\(user:(\d{1,10})\)/g;

export interface MentionUser {
  id: number;
  name: string;
  color?: string;
}

export type MentionSegment = { kind: 'text'; text: string } | { kind: 'mention'; text: string; id: number };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Markup → what the person sees, plus the people mentioned. */
export function markupToDisplay(markup: string): { display: string; mentions: MentionUser[] } {
  const mentions: MentionUser[] = [];
  const display = (markup ?? '').replace(MENTION_RE, (_, name: string, id: string) => {
    if (!mentions.some((m) => m.id === Number(id))) mentions.push({ id: Number(id), name });
    return `@${name}`;
  });
  return { display, mentions };
}

/**
 * Finds "@Name" of known mentions in plain text. Longer names first, so "@Roma"
 * doesn't swallow the start of "@Roma Smith"; no letter may follow the name —
 * "@Romanov" is not a mention of "Roma".
 */
function displayMentionRe(mentions: MentionUser[]): RegExp | null {
  const names = [...new Set(mentions.map((m) => m.name))].sort((a, b) => b.length - a.length);
  if (!names.length) return null;
  // Explicit letter ranges (Latin, Latin-1/Extended, Cyrillic) instead of \p{L}: safer on Hermes
  return new RegExp(`@(${names.map(escapeRegExp).join('|')})(?![A-Za-z0-9_\\u00C0-\\u024F\\u0400-\\u04FF])`, 'g');
}

/** Visible text → markup. A broken mention ("@Rom Smith") stays plain text. */
export function displayToMarkup(display: string, mentions: MentionUser[]): string {
  const re = displayMentionRe(mentions);
  if (!re) return display;
  return display.replace(re, (whole, name: string) => {
    const user = mentions.find((m) => m.name === name);
    return user ? `@[${user.name}](user:${user.id})` : whole;
  });
}

/** Visible text split into pieces — to colour mentions inside the input. */
export function splitDisplay(display: string, mentions: MentionUser[]): MentionSegment[] {
  const re = displayMentionRe(mentions);
  if (!re) return [{ kind: 'text', text: display }];
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of display.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ kind: 'text', text: display.slice(last, start) });
    segments.push({ kind: 'mention', text: match[0], id: mentions.find((m) => m.name === match[1])?.id ?? 0 });
    last = start + match[0].length;
  }
  if (last < display.length) segments.push({ kind: 'text', text: display.slice(last) });
  return segments;
}

/** Where each "@Name" sits in the visible text — Backspace removes a mention whole. */
export function mentionRanges(display: string, mentions: MentionUser[]): { start: number; end: number }[] {
  const re = displayMentionRe(mentions);
  if (!re) return [];
  return [...display.matchAll(re)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

/** Text without markup — for previews. */
export function mentionsToPlainText(markup: string): string {
  return markupToDisplay(markup).display;
}

/** A comment for display: mentions coloured, your own one also tinted so "this is for me" stands out. */
export function renderMentions(text: string, highlightColor: string, myUserId?: number | string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of (text ?? '').matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const isMe = myUserId !== undefined && Number(myUserId) === Number(match[2]);
    parts.push(
      <Text key={start} style={{ color: highlightColor, fontWeight: '700', backgroundColor: isMe ? `${highlightColor}26` : undefined }}>
        @{match[1]}
      </Text>,
    );
    last = start + match[0].length;
  }
  if (last < (text ?? '').length) parts.push(text.slice(last));
  return parts;
}
