import React from 'react';
import { Text } from 'react-native';

/**
 * Comment mentions are stored as `@[Name](user:ID)` (same markup as the web and
 * the backend). The app does not write mentions yet — it only shows them as a
 * highlighted "@Name" instead of the raw markup.
 */
const MENTION_RE = /@\[([^\]\n]{1,100})\]\(user:(\d{1,10})\)/g;

export function renderMentions(text: string, highlightColor: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of (text ?? '').matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <Text key={start} style={{ color: highlightColor, fontWeight: '600' }}>
        @{match[1]}
      </Text>,
    );
    last = start + match[0].length;
  }
  if (last < (text ?? '').length) parts.push(text.slice(last));
  return parts;
}
