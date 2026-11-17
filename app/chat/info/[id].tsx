import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useChat } from '@/context/ChatContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import ChatHeader from '@/components/chat/ChatHeader';
import { PersonAvatar } from '@/components/chat/ChatAvatar';
import EmployeePicker from '@/components/chat/EmployeePicker';
import { callsPalette } from '@/components/calls/styles';

/**
 * Group settings — same rights as on the web: the owner renames, adds and removes
 * members; anyone can mute the group or leave it.
 */
export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { state, myUserId, api, upsertConversation, removeConversation, loadConversation } = useChat();
  const { showToast } = useToast();
  const conversation = state.conversations[conversationId];

  const [title, setTitle] = useState(conversation?.title ?? '');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<number[]>([]);

  useEffect(() => {
    setTitle(conversation?.title ?? '');
  }, [conversation?.title]);

  if (!conversation) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ChatHeader c={c} title="Group" />
        <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
      </View>
    );
  }

  const isOwner = conversation.members.find((m) => m.id === myUserId)?.role === 'owner';
  const titleChanged = title.trim().length > 0 && title.trim() !== conversation.title;

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e: any) {
      showToast({ message: e.message || failure, type: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rename = () => run(async () => upsertConversation(await api.renameGroup(conversationId, title.trim())), 'Could not rename the group');

  const addMembers = async () => {
    const ok = await run(async () => upsertConversation(await api.addMembers(conversationId, toAdd)), 'Could not add members');
    if (ok) {
      setAdding(false);
      setToAdd([]);
    }
  };

  const removeMember = (userId: number, memberName: string) =>
    Alert.alert(`Remove ${memberName}?`, 'They will no longer see this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await api.removeMember(conversationId, userId);
            await loadConversation(conversationId);
          }, 'Could not remove the member'),
      },
    ]);

  const leave = () =>
    Alert.alert('Leave group?', 'You will stop receiving its messages. Someone in the group can add you back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const ok = await run(() => api.removeMember(conversationId, myUserId), 'Could not leave the group');
          if (ok) {
            removeConversation(conversationId);
            router.dismissTo('/(tabs)/chat' as any);
          }
        },
      },
    ]);

  const toggleMute = (muted: boolean) => run(async () => upsertConversation(await api.setMuted(conversationId, muted)), 'Failed to change notifications');

  const section = { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.cardBorder, padding: 14, gap: 10 } as const;
  const caption = { fontSize: 12, fontWeight: '700', color: c.textMuted } as const;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatHeader c={c} title={conversation.title || 'Group'} subtitle={`${conversation.members.length} members`} right={busy ? <ActivityIndicator color={c.primary} /> : undefined} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={section}>
          <Text style={caption}>GROUP NAME</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              editable={isOwner && !busy}
              maxLength={120}
              style={{ flex: 1, fontSize: 16, color: c.text, backgroundColor: c.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}
            />
            {isOwner && (
              <Pressable onPress={rename} disabled={!titleChanged || busy} style={{ paddingHorizontal: 14, justifyContent: 'center', borderRadius: 10, backgroundColor: titleChanged ? c.primary : c.inputBg }}>
                <Text style={{ fontWeight: '700', color: titleChanged ? '#fff' : c.textFaint }}>Save</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={[section, { flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={{ flex: 1, fontSize: 15, color: c.text }}>Mute notifications</Text>
          <Switch value={conversation.muted} onValueChange={(v) => void toggleMute(v)} disabled={busy} />
        </View>

        <View style={section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={caption}>MEMBERS</Text>
            {isOwner && (
              <Pressable onPress={() => setAdding(true)} hitSlop={8}>
                <Text style={{ fontWeight: '700', color: c.primary }}>+ Add</Text>
              </Pressable>
            )}
          </View>
          {conversation.members.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PersonAvatar name={m.name} color={m.color} size={34} />
              <Text style={{ flex: 1, fontSize: 15, color: m.active ? c.text : c.textFaint }} numberOfLines={1}>
                {m.name}
                {m.id === myUserId ? ' (you)' : ''}
              </Text>
              {m.role === 'owner' && <Text style={{ fontSize: 11, fontWeight: '700', color: c.primary }}>owner</Text>}
              {isOwner && m.id !== myUserId && (
                <Pressable onPress={() => removeMember(m.id, m.name)} hitSlop={8} disabled={busy}>
                  <Text style={{ fontSize: 13, color: c.danger }}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <Pressable onPress={leave} disabled={busy} style={({ pressed }) => [section, { alignItems: 'center', opacity: pressed ? 0.6 : 1 }]}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.danger }}>Leave group</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={adding} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAdding(false)}>
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
            <Pressable onPress={() => setAdding(false)} hitSlop={10}>
              <Text style={{ fontSize: 16, color: c.primary }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>Add members</Text>
            <Pressable onPress={addMembers} disabled={!toAdd.length || busy} hitSlop={10}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: toAdd.length ? c.primary : c.textFaint }}>Add{toAdd.length ? ` (${toAdd.length})` : ''}</Text>
            </Pressable>
          </View>
          <EmployeePicker
            c={c}
            multiple
            selected={toAdd}
            exclude={conversation.members.map((m) => m.id)}
            onPick={(uid) => setToAdd((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]))}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
