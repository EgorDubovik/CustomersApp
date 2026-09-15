import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useSocket, useSocketEvent } from '@/context/SocketContext';
import { useColorScheme } from '@/components/useColorScheme';
import ConversationItem from '@/components/calls/ConversationItem';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import { ICall, IConversation, ISmsMessage } from '@/components/calls/types';
import { applyConversationRead, isCallUnread, isMessageUnread, mergeCallIntoConversation, mergeSmsIntoConversation, sortByActivity } from '@/components/calls/helpers';

const PER_PAGE = 20;

export default function CallsScreen() {
  const { token, companyPhones } = useAuth();
  const { reconnectCount } = useSocket();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;

  const [conversations, setConversations] = useState<IConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const requestSeq = useRef(0);

  const fetchPage = useCallback(
    async (pageToLoad: number, searchPhone: string, mode: 'initial' | 'refresh' | 'more') => {
      if (!token) return;
      const seq = ++requestSeq.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      setError('');
      try {
        const params = new URLSearchParams({ page: String(pageToLoad), per_page: String(PER_PAGE), searchPhone });
        const response = await fetch(`${API_URL}/calls?${params}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        });
        if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
        const data = await response.json();
        if (seq !== requestSeq.current) return; // a newer request superseded this one
        const list: IConversation[] = data.data || [];
        setConversations((prev) => {
          if (mode !== 'more') return list;
          const known = new Set(prev.map((x) => x.id));
          return [...prev, ...list.filter((x) => !known.has(x.id))];
        });
        setLastPage(data.last_page || 1);
        setPage(pageToLoad);
      } catch (err: any) {
        console.error(err);
        if (seq === requestSeq.current) setError(err.message || 'Failed to load calls.');
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    if (token) fetchPage(1, appliedSearch, 'initial');
  }, [token, appliedSearch, fetchPage]);

  // Missed socket events after a disconnect → reload the first page silently
  useEffect(() => {
    if (reconnectCount > 0) fetchPage(1, appliedSearch, 'refresh');
  }, [reconnectCount]);

  // ─── Real-time ─────────────────────────────────────────────────────────────
  useSocketEvent<{ call: ICall; customer?: { id: number; name: string } | null }>('call.updated', ({ call, customer }) => {
    if (!call?.conversation_id) return;
    setConversations((prev) => {
      const idx = prev.findIndex((x) => x.id === call.conversation_id);
      if (idx !== -1) {
        const next = prev.slice();
        next[idx] = { ...mergeCallIntoConversation(prev[idx], call), customer: prev[idx].customer ?? customer ?? null };
        return sortByActivity(next);
      }
      if (appliedSearch) return prev; // a filtered list shouldn't grow with unrelated conversations
      const fresh: IConversation = {
        id: call.conversation_id,
        customer_name: customer?.name ?? '',
        customer_phone: call.direction === 'incoming' ? call.from_number : call.to_number,
        company_phone: call.direction === 'incoming' ? call.to_number : call.from_number,
        last_call_at: call.created_at,
        last_call: call,
        last_message: null,
        calls_count: 1,
        unread_count: isCallUnread(call) ? 1 : 0,
        customer: customer ?? null,
      };
      return [fresh, ...prev];
    });
  });

  useSocketEvent<{ message: ISmsMessage; customer?: { id: number; name: string } | null }>('sms.received', ({ message, customer }) => {
    if (!message?.conversation_id) return;
    setConversations((prev) => {
      const idx = prev.findIndex((x) => x.id === message.conversation_id);
      if (idx !== -1) {
        const next = prev.slice();
        next[idx] = { ...mergeSmsIntoConversation(prev[idx], message), customer: prev[idx].customer ?? customer ?? null };
        return sortByActivity(next);
      }
      if (appliedSearch) return prev;
      const fresh: IConversation = {
        id: message.conversation_id,
        customer_name: customer?.name ?? '',
        customer_phone: message.direction === 'inbound' ? message.from_number : message.to_number,
        company_phone: message.direction === 'inbound' ? message.to_number : message.from_number,
        last_call_at: message.created_at,
        last_call: null,
        last_message: message,
        calls_count: 0,
        unread_count: isMessageUnread(message) ? 1 : 0,
        customer: customer ?? null,
      };
      return [fresh, ...prev];
    });
  });

  useSocketEvent<{ conversationId: string; readAt: string }>('conversation.read', ({ conversationId, readAt }) => {
    setConversations((prev) => prev.map((x) => (x.id === conversationId ? applyConversationRead(x, readAt) : x)));
  });

  const submitSearch = () => setAppliedSearch(search.trim());
  const clearSearch = () => {
    setSearch('');
    setAppliedSearch('');
  };

  const loadMore = () => {
    if (loading || loadingMore || refreshing || page >= lastPage) return;
    fetchPage(page + 1, appliedSearch, 'more');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {/* Header + search */}
      <View style={styles.searchWrap}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: c.text, marginBottom: 10 }}>Calls</Text>
        <View style={[styles.searchInputRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={c.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={submitSearch}
            placeholder="Search by phone or name"
            placeholderTextColor={c.textFaint}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: c.text }]}
          />
          {search.length > 0 && (
            <Pressable onPress={clearSearch} hitSlop={8}>
              <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={16} tintColor={c.textMuted} />
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
          <Pressable onPress={() => fetchPage(1, appliedSearch, 'initial')} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: c.primary }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationItem conv={item} companyPhones={companyPhones} isDark={isDark} onPress={() => router.push(`/conversation/${item.id}` as any)} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPage(1, appliedSearch, 'refresh')} tintColor={c.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
              <SymbolView name={{ ios: 'phone.badge.waveform', android: 'call', web: 'call' }} size={36} tintColor={c.textFaint} />
              <Text style={{ color: c.textMuted, fontWeight: '600' }}>{appliedSearch ? 'No conversations match your search' : 'No calls yet'}</Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 12 }} color={c.primary} /> : null}
        />
      )}
    </View>
  );
}
