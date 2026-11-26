import React from 'react';
import { Linking, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Finds links in plain text (chat, SMS, notes, comments) and makes them tappable.
 * Same rules as the web (frontend/src/helpers/linkify.tsx):
 *  - http:// and https:// URLs;
 *  - www.example.com without a scheme;
 *  - bare domains with a known TLD (example.com/path) — customers often text like that;
 *  - e-mails → mailto:.
 */

export type LinkSegment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const TLDS =
  'com|net|org|io|co|us|app|dev|info|biz|me|ly|gl|gg|ai|tv|ru|ua|ca|uk|de|fr|es|it|nl|pl|eu|au|in|site|online|store|shop|link|page|xyz|tech|cloud|pro';

// Order matters: e-mail before domains, otherwise "john@site.com" would split into text + link.
const LINK_RE = new RegExp(
  [
    String.raw`([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})`,
    String.raw`(https?:\/\/[^\s<>"']+)`,
    String.raw`(www\.[^\s<>"']+)`,
    String.raw`((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:${TLDS})(?![A-Za-z0-9-])(?:[/?#][^\s<>"']*)?)`,
  ].join('|'),
  'gi',
);

/** Drops trailing punctuation ("see google.com." → no dot). Keeps ")" when "(" is inside the link. */
function trimTrailing(url: string): string {
  let result = url;
  for (;;) {
    const last = result.slice(-1);
    if (/[.,;:!?'"»…]/.test(last)) result = result.slice(0, -1);
    else if (last === ')' && (result.match(/\)/g)?.length ?? 0) > (result.match(/\(/g)?.length ?? 0)) result = result.slice(0, -1);
    else if (last === ']' && (result.match(/\]/g)?.length ?? 0) > (result.match(/\[/g)?.length ?? 0)) result = result.slice(0, -1);
    else return result;
  }
}

export function splitLinks(text: string): LinkSegment[] {
  const source = text ?? '';
  const segments: LinkSegment[] = [];
  let last = 0;

  for (const match of source.matchAll(LINK_RE)) {
    const start = match.index ?? 0;
    // A letter/digit/@ right before the match means it's part of a word, not a link.
    if (start > 0 && /[A-Za-z0-9@_/.-]/.test(source[start - 1])) continue;

    const [, email, http, www, bare] = match;
    const raw = trimTrailing(match[0]);
    if (!raw) continue;

    let href: string;
    if (email) href = `mailto:${raw}`;
    else if (http) href = raw;
    else if (www || bare) href = `https://${raw}`;
    else continue;

    if (start > last) segments.push({ kind: 'text', text: source.slice(last, start) });
    segments.push({ kind: 'link', text: raw, href });
    last = start + raw.length;
  }

  if (last < source.length) segments.push({ kind: 'text', text: source.slice(last) });
  return segments;
}

export function openLink(href: string) {
  if (/^https?:\/\//i.test(href)) {
    WebBrowser.openBrowserAsync(href).catch(() => Linking.openURL(href).catch(() => {}));
  } else {
    Linking.openURL(href).catch(() => {});
  }
}

/**
 * Text with tappable links, to put inside a <Text>. The link keeps the text colour
 * (readable in both the outgoing and incoming bubble) and is underlined. `onLongPress`
 * lets a long press on the link still open the bubble's menu.
 */
export function linkify(text: string, keyPrefix = 'l', onLongPress?: () => void): React.ReactNode {
  const segments = splitLinks(text);
  if (segments.length === 1 && segments[0].kind === 'text') return text;
  return segments.map((segment, i) =>
    segment.kind === 'text' ? (
      <React.Fragment key={`${keyPrefix}${i}`}>{segment.text}</React.Fragment>
    ) : (
      <Text key={`${keyPrefix}${i}`} suppressHighlighting={false} style={{ textDecorationLine: 'underline' }} onPress={() => openLink(segment.href)} onLongPress={onLongPress}>
        {segment.text}
      </Text>
    ),
  );
}
