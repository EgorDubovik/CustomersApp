import React, { useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useColorScheme } from '@/components/useColorScheme';
import { useRefreshControlKey } from '@/hooks/useRefreshControlKey';
import ChatAvatar from '@/components/chat/ChatAvatar';
import { conversationTitle, listTime, makeNameLookup, messagePreview } from '@/components/chat/helpers';
import { sortConversations } from '@/components/chat/reducer';
import type { ChatConversation } from '@/components/chat/types';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';

/** The Chat tab: every conversation of mine, newest activity first. */
export default function ChatListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { companyEmployees } = useAuth();
  const { state, myUserId, api, upsertConversation } = useChat();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const refreshKey = useRefreshControlKey();

  const conversations = useMemo(() => {
    const all = sortConversations(state.conversations);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((conv) => conversationTitle(conv, myUserId).toLowerCase().includes(q) || conv.members.some((m) => m.name.toLowerCase().includes(q)));
  }, [state.conversations, search, myUserId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      (await api.listConversations()).forEach(upsertConversation);
    } catch {
      // The list stays as it was; the socket reconnect reloads it anyway
    } finally {
      setRefreshing(false);
    }
  };

  const newChat = () => {
    const go = (mode: 'direct' | 'group') => router.push({ pathname: '/chat/new', params: { mode } } as any);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: ['New message', 'New group', 'Cancel'], cancelButtonIndex: 2 }, (i) => {
        if (i === 0) go('direct');
        if (i === 1) go('group');
      });
    } else {
      Alert.alert('New chat', undefined, [
        { text: 'New message', onPress: () => go('direct') },
        { text: 'New group', onPress: () => go('group') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const renderItem = ({ item }: { item: ChatConversation }) => {
    const name = makeNameLookup(item.members, companyEmployees, myUserId);
    const last = item.last_message;
    const author = item.type === 'group' && last && last.type !== 'system' && last.sender_id != null ? `${name(last.sender_id)}: ` : last?.sender_id === myUserId ? 'You: ' : '';
    const unread = item.unread_count > 0;
    return (
      <Pressable
        onPress={() => router.push(`/chat/${item.id}` as any)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? c.inputBg : 'transparent' })}
      >
        <ChatAvatar conversation={item} myUserId={myUserId} tint={c.primary} />
        <View style={{ flex: 1, minWidth: 0, borderBottomWidth: 1, borderBottomColor: c.divider, paddingBottom: 10, marginBottom: -10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: unread ? '800' : '700', color: c.text }} numberOfLines={1}>
              {conversationTitle(item, myUserId)}
            </Text>
            {item.muted && <SymbolView name={{ ios: 'bell.slash.fill', android: 'notifications_off', web: 'notifications_off' }} size={12} tintColor={c.textFaint} />}
            <Text style={{ fontSize: 12, color: unread ? c.primary : c.textFaint }}>{listTime(item.last_message_at ?? item.created_at)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text style={{ flex: 1, fontSize: 14, color: unread ? c.textSecondary : c.textMuted }} numberOfLines={1}>
              {last ? `${last.type === 'system' ? '' : author}${messagePreview(last, name)}` : 'No messages yet'}
            </Text>
            {unread && (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: item.muted ? c.textFaint : c.danger }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={styles.searchWrap}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: c.text }}>Chat</Text>
          <Pressable onPress={newChat} hitSlop={8} accessibilityLabel="New chat" style={({ pressed }) => [styles.headerIconBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.6 }]}>
            <SymbolView name={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }} size={18} tintColor="#fff" />
          </Pressable>
        </View>
        <View style={[styles.searchInputRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={c.textMuted} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search chats" placeholderTextColor={c.textFaint} style={[styles.searchInput, { color: c.text }]} clearButtonMode="while-editing" />
        </View>
      </View>

      {state.listStatus !== 'success' && conversations.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {state.listStatus === 'error' ? <Text style={{ color: c.textMuted }}>Failed to load chats. Pull to retry.</Text> : <ActivityIndicator size="large" color={c.primary} />}
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl key={refreshKey} refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} />}
          contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 8 }}>
              <SymbolView name={{ ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }} size={40} tintColor={c.textFaint} />
              <Text style={{ color: c.textMuted, textAlign: 'center' }}>{search ? 'No chats match your search.' : 'No chats yet. Start one with a colleague.'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
