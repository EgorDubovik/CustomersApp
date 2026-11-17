import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { callsStyles as styles } from '@/components/calls/styles';

interface Props {
  c: { card: string; cardBorder: string; inputBg: string; text: string; textMuted: string };
  title: string;
  subtitle?: string;
  /** Avatar or icon before the title */
  leading?: React.ReactNode;
  onTitlePress?: () => void;
  right?: React.ReactNode;
  /** Defaults to router.back(); the chat thread goes to the Chat tab instead. */
  onBack?: () => void;
}

/** Header of the chat screens — same look as the SMS conversation header. */
export default function ChatHeader({ c, title, subtitle, leading, onTitlePress, right, onBack }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.convHeader, { paddingTop: insets.top + 6, backgroundColor: c.card, borderBottomColor: c.cardBorder }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chat' as any)))}
          hitSlop={10}
          style={({ pressed }) => [styles.headerBackBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}
        >
          <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor={c.text} />
        </Pressable>
        <Pressable onPress={onTitlePress} disabled={!onTitlePress} style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, pressed && { opacity: 0.6 }]}>
          {leading}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }} numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </Pressable>
        {right}
      </View>
    </View>
  );
}
