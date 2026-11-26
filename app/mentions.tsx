import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/components/useColorScheme';
import { useRefreshControlKey } from '@/hooks/useRefreshControlKey';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { getInitials } from '@/components/appointment/tabs/shared';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import { formatPhoneNumber } from '@/components/calls/helpers';
import { renderMentions } from '@/utils/mentions';

const PAGE_SIZE = 30;

interface MentionItem {
  id: number;
  reason: 'mention' | 'reply';
  item_type: 'call' | 'sms';
  item_id: string;
  comment_id: number;
  conversation_id: string;
  read_at: string | null;
  created_at: string;
  /** null — the comment was deleted */
  comment: string | null;
  author: { id: number; name: string; color?: string } | null;
  conversation: { customer_name: string | null; customer_phone: string } | null;
}

/**
 * Comments on calls and SMS that concern me: I was @mentioned, or someone replied
 * in a thread I wrote in. Newest first, unread highlighted; a tap opens the
 * conversation right at that comment. Same list as Mentions on the web Calls page.
 */
export default function MentionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { token, user, mentionsUnread, setMentionsUnread } = useAuth();
  const refreshKey = useRefreshControlKey();

  const [items, setItems] = useState<MentionItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const headers = useMemo(() => ({ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }), [token]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      if (!token) return;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      setError('');
      try {
        const r = await fetch(`${API_URL}/calls/mentions?limit=${PAGE_SIZE}`, { headers });
        if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
        const data = await r.json();
        setItems(data.items ?? []);
        setHasMore(!!data.has_more);
        if (typeof data.unread === 'number') setMentionsUnread(data.unread);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load mentions');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, headers, setMentionsUnread],
  );

  useEffect(() => {
    load('initial');
  }, [load]);

  // A new mention arrived while the screen is open (the counter grew) → refresh quietly
  useEffect(() => {
    if (!loading) load('silent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionsUnread]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !items.length || !token) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`${API_URL}/calls/mentions?limit=${PAGE_SIZE}&before=${items[items.length - 1].id}`, { headers });
      if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
      const data = await r.json();
      setItems((prev) => [...prev, ...(data.items ?? []).filter((i: MentionItem) => !prev.some((p) => p.id === i.id))]);
      setHasMore(!!data.has_more);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (body: { ids?: number[]; all?: boolean }) => {
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((i) => (body.all || body.ids?.includes(i.id) ? { ...i, read_at: i.read_at ?? readAt } : i)));
    try {
      const r = await fetch(`${API_URL}/calls/mentions/read`, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = r.ok ? await r.json() : null;
      if (typeof data?.total === 'number') setMentionsUnread(data.total);
    } catch {
      // Not fatal: opening the thread marks it read again
    }
  };

  const open = (item: MentionItem) => {
    if (!item.read_at) void markRead({ ids: [item.id] });
    router.push({ pathname: '/conversation/[id]', params: { id: item.conversation_id, item: `${item.item_type}:${item.item_id}`, comment: String(item.comment_id) } } as any);
  };

  const renderItem = ({ item }: { item: MentionItem }) => {
    const unread = !item.read_at;
    const customer = item.conversation?.customer_name || formatPhoneNumber(item.conversation?.customer_phone) || 'Conversation';
    return (
      <Pressable
        onPress={() => open(item)}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            gap: 12,
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderLeftWidth: 4,
            borderColor: c.cardBorder,
            borderLeftColor: unread ? c.primary : c.cardBorder,
            backgroundColor: unread ? c.primaryMuted : c.card,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: item.author?.color || c.primary }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{getInitials(item.author?.name || 'U')}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 14, color: c.text }} numberOfLines={1}>
              <Text style={{ fontWeight: unread ? '800' : '700' }}>{item.author?.name || 'Someone'}</Text>
              <Text style={{ color: c.textMuted }}>{item.reason === 'mention' ? ' mentioned you' : ' replied'}</Text>
            </Text>
            <Text style={{ fontSize: 11, color: c.textFaint }}>{formatDate(item.created_at, 'MMM DD, h:mm A')}</Text>
          </View>
          <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>
            {customer} · on {item.item_type === 'sms' ? 'SMS' : 'call'}
          </Text>
          <Text style={{ fontSize: 13, color: unread ? c.text : c.textSecondary, marginTop: 2 }} numberOfLines={2}>
            {item.comment === null ? <Text style={{ fontStyle: 'italic', color: c.textFaint }}>Comment was deleted</Text> : renderMentions(item.comment, c.primary, user?.id, { links: false })}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.convHeader, { paddingTop: insets.top + 6, backgroundColor: c.card, borderBottomColor: c.cardBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.headerBackBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
            <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor={c.text} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: c.text }}>Mentions</Text>
          {mentionsUnread > 0 && (
            <Pressable onPress={() => markRead({ all: true })} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>Mark all read</Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} size={40} tintColor={c.danger} />
          <Text style={{ color: c.textMuted, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={() => load('initial')} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: c.primary }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl key={refreshKey} refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={c.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 12 }} color={c.primary} /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 24 }}>
              <SymbolView name={{ ios: 'at', android: 'alternate_email', web: 'alternate_email' }} size={36} tintColor={c.textFaint} />
              <Text style={{ color: c.textMuted, fontWeight: '600', textAlign: 'center' }}>
                No mentions yet. When someone mentions you with @ or replies in a thread you commented on, it shows up here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
