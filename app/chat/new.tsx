import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useChat } from '@/context/ChatContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import ChatHeader from '@/components/chat/ChatHeader';
import EmployeePicker from '@/components/chat/EmployeePicker';
import { callsPalette } from '@/components/calls/styles';

/** New direct message (one tap on a colleague) or new group (name + members). */
export default function NewChatScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isGroup = mode === 'group';
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { api, upsertConversation } = useChat();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const open = (id: number) => router.replace(`/chat/${id}` as any);

  const startDirect = async (userId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const conversation = await api.openDirect(userId);
      upsertConversation(conversation);
      open(conversation.id);
    } catch (e: any) {
      showToast({ message: e.message || 'Failed to open the chat', type: 'error' });
      setBusy(false);
    }
  };

  const canCreate = title.trim().length > 0 && members.length > 0 && !busy;
  const createGroup = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const conversation = await api.createGroup(title.trim(), members);
      upsertConversation(conversation);
      open(conversation.id);
    } catch (e: any) {
      showToast({ message: e.message || 'Failed to create the group', type: 'error' });
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatHeader
        c={c}
        title={isGroup ? 'New group' : 'New message'}
        subtitle={isGroup ? (members.length ? `${members.length} selected` : 'Pick the members') : 'Pick a colleague'}
        right={
          isGroup ? (
            <Pressable onPress={createGroup} disabled={!canCreate} hitSlop={8} style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: canCreate ? c.primary : c.inputBg, opacity: pressed ? 0.7 : 1 })}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontWeight: '700', color: canCreate ? '#fff' : c.textFaint }}>Create</Text>}
            </Pressable>
          ) : busy ? (
            <ActivityIndicator color={c.primary} />
          ) : undefined
        }
      />
      <EmployeePicker
        c={c}
        multiple={isGroup}
        selected={members}
        onPick={(id) => (isGroup ? setMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])) : startDirect(id))}
        header={
          isGroup ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 6 }}>GROUP NAME</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Plumbing crew"
                placeholderTextColor={c.textFaint}
                maxLength={120}
                autoFocus
                style={{ fontSize: 16, color: c.text, backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
              />
            </View>
          ) : undefined
        }
      />
    </KeyboardAvoidingView>
  );
}
