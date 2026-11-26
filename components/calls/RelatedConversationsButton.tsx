import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { formatPhoneNumber, getMatchedCompanyPhone } from './helpers';
import { callsPalette } from './styles';
import { IRelatedConversation } from './types';

const MENU_WIDTH = 270;

/**
 * The same customer number also has conversations on our other company numbers.
 * A small "⇄ 2 · other lines" button in the header; a tap drops down the list
 * (line name, number, calls, last call) and opens the picked conversation.
 * Secondary data: loaded on its own, errors stay silent, nothing shows when there's none.
 */
export default function RelatedConversationsButton({ conversationId, isDark }: { conversationId: string | undefined; isDark: boolean }) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const router = useRouter();
  const { token, companyPhones } = useAuth();
  const [related, setRelated] = useState<IRelatedConversation[]>([]);
  const [menuTop, setMenuTop] = useState<number | null>(null);
  const ref = useRef<View>(null);

  useEffect(() => {
    setRelated([]);
    if (!conversationId || !token) return;
    let cancelled = false; // a quick switch must not show the previous conversation's answer
    fetch(`${API_URL}/calls/conversation/related?conversation_id=${encodeURIComponent(conversationId)}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => !cancelled && setRelated(Array.isArray(data) ? data : []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId, token]);

  if (!related.length) return null;

  const open = () => ref.current?.measureInWindow((_x, y, _w, h) => setMenuTop(y + h + 6));

  return (
    <>
      <Pressable
        ref={ref}
        onPress={open}
        hitSlop={6}
        accessibilityLabel={`${related.length} conversation${related.length === 1 ? '' : 's'} on other company numbers`}
        style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: c.primaryMuted }}>
          <SymbolView name={{ ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' }} size={13} tintColor={c.primary} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: c.primary }}>{related.length}</Text>
        </View>
        <Text style={{ fontSize: 9, fontWeight: '600', color: c.textFaint, marginTop: 2 }}>other lines</Text>
      </Pressable>

      {menuTop !== null && (
        <RelatedMenu
          top={menuTop}
          related={related}
          c={c}
          isDark={isDark}
          companyPhones={companyPhones}
          onClose={() => setMenuTop(null)}
          onPick={(id) => {
            setMenuTop(null);
            router.replace(`/conversation/${id}` as any);
          }}
        />
      )}
    </>
  );
}

function RelatedMenu({
  top,
  related,
  c,
  isDark,
  companyPhones,
  onClose,
  onPick,
}: {
  top: number;
  related: IRelatedConversation[];
  c: (typeof callsPalette)['light'];
  isDark: boolean;
  companyPhones: ReturnType<typeof useAuth>['companyPhones'];
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const { width: screenW } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(1, { damping: 18, stiffness: 260, mass: 0.6 });
  }, [progress]);

  const close = (after: () => void) => {
    progress.value = withTiming(0, { duration: 120 });
    setTimeout(after, 120);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value) }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [{ translateY: -8 * (1 - progress.value) }, { scale: 0.9 + 0.1 * progress.value }],
  }));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close(onClose)}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(15,23,42,0.15)' }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(onClose)} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top,
            right: 12,
            width: Math.min(MENU_WIDTH, screenW - 24),
            borderRadius: 14,
            paddingVertical: 6,
            backgroundColor: c.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.cardBorder,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
            transformOrigin: 'top right',
          },
          menuStyle,
        ]}
      >
        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: c.textMuted, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}>ALSO CALLED YOUR OTHER NUMBERS</Text>
        {related.map((conv, i) => {
          const line = getMatchedCompanyPhone(conv.company_phone, companyPhones);
          return (
            <Pressable
              key={conv.id}
              onPress={() => close(() => onPick(conv.id))}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: pressed ? c.inputBg : 'transparent',
                borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: c.cardBorder,
              })}
            >
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: line?.color || '#888' }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: line?.color || c.text }} numberOfLines={1}>
                  {line?.description || 'Our number'}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }} numberOfLines={1}>
                  {formatPhoneNumber(conv.company_phone)} · {conv.calls_count} {conv.calls_count === 1 ? 'call' : 'calls'}
                  {conv.last_call_at ? ` · ${formatDate(conv.last_call_at, 'MMM DD')}` : ''}
                </Text>
              </View>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={12} tintColor={c.textFaint} />
            </Pressable>
          );
        })}
      </Animated.View>
    </Modal>
  );
}
