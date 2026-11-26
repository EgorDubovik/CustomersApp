import React from 'react';
import { Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { callsPalette } from './styles';

/**
 * "💬 2" next to an SMS / call time — shown only when there are comments, so the timeline
 * stays clean; a tap opens / hides them. Adding the first comment is in the long-press menu.
 */
export default function CommentsBadge({ count, active, c, onPress }: { count: number; active: boolean; c: (typeof callsPalette)['light']; onPress: () => void }) {
  if (count <= 0) return null;
  const color = active ? c.primary : c.warning;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={`${count} comment${count === 1 ? '' : 's'}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: pressed ? 0.6 : 1 })}
    >
      <SymbolView name={{ ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' }} size={11} tintColor={color} />
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{count}</Text>
    </Pressable>
  );
}
