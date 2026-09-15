import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { callsPalette, callsStyles as styles } from './styles';
import { IConversationNote } from './types';

const ROLE_ADMIN = 1;

/** Dispatcher note in the timeline: a full-width quiet strip between calls and texts */
export default function NoteItem({ note, isDark, onDeleted }: { note: IConversationNote; isDark: boolean; onDeleted: (noteId: string) => void }) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { token, user } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const canDelete = !!user && (user.roles_ids?.includes(ROLE_ADMIN) || String(user.id) === String(note.user?.id));

  const remove = () => {
    if (!token) return;
    Alert.alert('Delete note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const r = await fetch(`${API_URL}/calls/conversation/note/${note.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
            if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
            onDeleted(note.id);
          } catch (err: any) {
            console.error(err);
            Alert.alert('Error', err.message || 'Failed to delete note.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.noteRow, { backgroundColor: c.noteBg }]}>
      <SymbolView name={{ ios: 'note.text', android: 'sticky_note_2', web: 'sticky_note_2' }} size={14} tintColor={c.textFaint} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: note.user?.color || c.textFaint }} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: c.textMuted }} numberOfLines={1}>{note.user?.name || 'Dispatcher'}</Text>
          <Text style={{ fontSize: 11, color: c.textFaint }}>· {formatDate(note.created_at, 'hh:mm A')}</Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: c.text }}>{note.note}</Text>
      </View>
      {canDelete && (
        <Pressable onPress={remove} hitSlop={8} disabled={deleting}>
          {deleting ? <ActivityIndicator size="small" color={c.danger} /> : <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={14} tintColor={c.textFaint} />}
        </Pressable>
      )}
    </View>
  );
}
