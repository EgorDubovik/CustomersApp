import React from 'react';
import { Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { directPeer, initials } from './helpers';
import type { ChatConversation } from './types';

const FALLBACK_COLOR = '#94A3B8';

/** A colleague: initials on their employee colour — the same colour as in the schedule. */
export function PersonAvatar({ name, color, size = 44 }: { name: string; color?: string | null; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color || FALLBACK_COLOR, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

/** A chat: the other person in a direct chat, a group icon otherwise. */
export default function ChatAvatar({ conversation, myUserId, size = 44, tint }: { conversation: ChatConversation; myUserId: number; size?: number; tint: string }) {
  if (conversation.type === 'direct') {
    const peer = directPeer(conversation, myUserId);
    return <PersonAvatar name={peer?.name ?? '?'} color={peer?.color} size={size} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }} size={size * 0.45} tintColor={tint} />
    </View>
  );
}
