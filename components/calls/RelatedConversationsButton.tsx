import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { formatPhoneNumber, getMatchedCompanyPhone } from './helpers';
import DropdownMenu from './DropdownMenu';
import { callsPalette } from './styles';
import { IRelatedConversation } from './types';

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
        <DropdownMenu
          top={menuTop}
          align="right"
          title="ALSO CALLED YOUR OTHER NUMBERS"
          isDark={isDark}
          onClose={() => setMenuTop(null)}
          items={related.map((conv) => {
            const line = getMatchedCompanyPhone(conv.company_phone, companyPhones);
            return {
              key: conv.id,
              label: line?.description || 'Our number',
              sublabel: `${formatPhoneNumber(conv.company_phone)} · ${conv.calls_count} ${conv.calls_count === 1 ? 'call' : 'calls'}${conv.last_call_at ? ` · ${formatDate(conv.last_call_at, 'MMM DD')}` : ''}`,
              dot: line?.color || '#888',
              color: line?.color,
              chevron: true,
              onPress: () => router.replace(`/conversation/${conv.id}` as any),
            };
          })}
        />
      )}
    </>
  );
}
