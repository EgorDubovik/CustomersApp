import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import ChatAvatar, { PersonAvatar } from './ChatAvatar';
import { conversationTitle, entityLabel, listTime } from './helpers';
import { sortConversations } from './reducer';
import type { ChatEntityRef, ChatMention } from './types';

const ADMIN = 1;
const TECHNICIAN = 2;
const DISPATCHER = 3;
const RECENT_LIMIT = 6;

type Target = { kind: 'conversation' | 'user'; id: number; label: string };

interface Props {
  entity: ChatEntityRef;
  /** Offered first — e.g. this appointment's techs. */
  suggestedUserIds?: number[];
  /** Icon colour on the screen's own header */
  tint: string;
  /** Background of the round button (matches the screen header buttons) */
  background?: string;
}

/**
 * Chat icon in the appointment / customer header with the number of chats this record
 * was discussed in. Opens a sheet: "Send to chat" and the "Discussed in" list — a tap
 * there opens the chat on the message with the card.
 */
export default function ChatEntityButton({ entity, suggestedUserIds = [], tint, background }: Props) {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { api, state, myUserId, send, upsertConversation } = useChat();
  const { companyEmployees, user } = useAuth();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'main' | 'send'>('main');
  const [mentions, setMentions] = useState<ChatMention[] | null>(null);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const loadMentions = useCallback(() => {
    if (entity.id <= 0) return;
    api
      .mentions(entity.type, entity.id)
      .then(setMentions)
      .catch(() => setMentions([]));
  }, [api, entity.type, entity.id]);

  useEffect(loadMentions, [loadMentions]);

  const close = () => {
    setOpen(false);
    setMode('main');
    setTarget(null);
    setComment('');
    setQuery('');
  };

  // ─── Who to offer ──────────────────────────────────────────────────────────
  const colleagues = useMemo(() => companyEmployees.filter((e) => e.id !== myUserId && e.active !== 0), [companyEmployees, myUserId]);
  const suggested = useMemo(() => {
    const roles = user?.roles_ids ?? [];
    // A tech mostly sends to the office; the office — to the techs on this job
    const iAmTech = roles.includes(TECHNICIAN) && !roles.includes(DISPATCHER) && !roles.includes(ADMIN);
    const ids = new Set(suggestedUserIds.filter((id) => id !== myUserId));
    if (iAmTech) colleagues.filter((e) => e.roles_ids?.includes(DISPATCHER)).forEach((e) => ids.add(e.id));
    return colleagues.filter((e) => ids.has(e.id));
  }, [colleagues, suggestedUserIds, user?.roles_ids, myUserId]);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const recent = sortConversations(state.conversations)
    .filter((conv) => matches(conversationTitle(conv, myUserId)))
    .slice(0, q ? 20 : RECENT_LIMIT);
  const people = colleagues.filter((e) => matches(e.name) && !suggested.includes(e)).sort((a, b) => a.name.localeCompare(b.name));

  const doSend = async () => {
    if (!target || sending) return;
    setSending(true);
    try {
      let conversationId = target.id;
      if (target.kind === 'user') {
        const conversation = await api.openDirect(target.id);
        upsertConversation(conversation);
        conversationId = conversation.id;
      }
      const saved = await send({ conversationId, entity, body: comment.trim() || undefined });
      if (!saved) throw new Error('Could not send. Try again.');
      showToast({ message: `Sent to ${target.label}`, type: 'success' });
      close();
      loadMentions();
    } catch (e: any) {
      showToast({ message: e.message || 'Could not send. Try again.', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const option = (key: string, selected: boolean, onPress: () => void, avatar: React.ReactNode, label: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: selected ? c.primaryMuted : pressed ? c.inputBg : 'transparent',
      })}
    >
      {avatar}
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text }} numberOfLines={1}>
        {label}
      </Text>
      {selected && <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={20} tintColor={c.primary} />}
    </Pressable>
  );

  const caption = (text: string) => <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: c.textMuted, marginTop: 14, marginBottom: 4, paddingHorizontal: 12 }}>{text}</Text>;
  const count = mentions?.length ?? 0;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="Chat"
        style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: background, opacity: pressed ? 0.6 : 1 })}
      >
        <SymbolView name={{ ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }} size={18} tintColor={tint} />
        {count > 0 && (
          <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{count}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 }}>
            {mode === 'send' ? (
              <Pressable onPress={() => setMode('main')} hitSlop={10}>
                <Text style={{ fontSize: 16, color: c.primary }}>Back</Text>
              </Pressable>
            ) : (
              <View style={{ width: 40 }} />
            )}
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>{mode === 'send' ? 'Send to chat' : entityLabel(entity)}</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Text style={{ fontSize: 16, color: c.primary, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>

          {mode === 'main' ? (
            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 6 }}>
              <Pressable
                onPress={() => setMode('send')}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12, backgroundColor: c.primary, opacity: pressed ? 0.8 : 1 })}
              >
                <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={16} tintColor="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Send to chat</Text>
              </Pressable>

              {mentions === null ? (
                <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} />
              ) : mentions.length === 0 ? (
                <Text style={{ color: c.textMuted, textAlign: 'center', marginTop: 20 }}>Not discussed yet. Send it to a colleague to talk about it.</Text>
              ) : (
                <>
                  {caption('DISCUSSED IN')}
                  {mentions.map((m) =>
                    option(
                      `m-${m.conversation.id}`,
                      false,
                      () => {
                        close();
                        router.push({ pathname: '/chat/[id]', params: { id: String(m.conversation.id), m: String(m.last_message_id) } } as any);
                      },
                      <ChatAvatar conversation={m.conversation} myUserId={myUserId} size={36} tint={c.primary} />,
                      `${conversationTitle(m.conversation, myUserId)}${m.mentions_count > 1 ? `  ×${m.mentions_count}` : ''}  ·  ${listTime(m.last_mentioned_at)}`,
                    ),
                  )}
                </>
              )}
            </ScrollView>
          ) : (
            <>
              <View style={[styles.searchInputRow, { backgroundColor: c.card, borderColor: c.cardBorder, marginHorizontal: 16, marginBottom: 4 }]}>
                <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={c.textMuted} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Search chats and colleagues" placeholderTextColor={c.textFaint} style={[styles.searchInput, { color: c.text }]} />
              </View>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
                {suggested.filter((e) => matches(e.name)).length > 0 && caption('SUGGESTED')}
                {suggested
                  .filter((e) => matches(e.name))
                  .map((e) => option(`s-${e.id}`, target?.kind === 'user' && target.id === e.id, () => setTarget({ kind: 'user', id: e.id, label: e.name }), <PersonAvatar name={e.name} color={e.color} size={36} />, e.name))}
                {recent.length > 0 && caption('RECENT CHATS')}
                {recent.map((conv) => {
                  const label = conversationTitle(conv, myUserId);
                  return option(`c-${conv.id}`, target?.kind === 'conversation' && target.id === conv.id, () => setTarget({ kind: 'conversation', id: conv.id, label }), <ChatAvatar conversation={conv} myUserId={myUserId} size={36} tint={c.primary} />, label);
                })}
                {people.length > 0 && caption('COLLEAGUES')}
                {people.map((e) => option(`u-${e.id}`, target?.kind === 'user' && target.id === e.id, () => setTarget({ kind: 'user', id: e.id, label: e.name }), <PersonAvatar name={e.name} color={e.color} size={36} />, e.name))}
              </ScrollView>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: c.cardBorder, backgroundColor: c.card }}>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder={target ? `Comment for ${target.label} (optional)` : 'Pick a chat or colleague'}
                  placeholderTextColor={c.textFaint}
                  multiline
                  style={{ flex: 1, maxHeight: 100, fontSize: 15, color: c.text, backgroundColor: c.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}
                />
                <Pressable onPress={doSend} disabled={!target || sending} style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: target ? c.primary : c.inputBg }}>
                  {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: '700', color: target ? '#fff' : c.textFaint }}>Send</Text>}
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
