import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { SwipeableNote } from '../AppointmentUI';
import { palette, styles } from '../styles';
import { IAppointmentDetails, INote, IStickyNote } from '../types';
import StickyNoteModal from '../StickyNoteModal';
import { EmptyText, HeaderIconButton, SectionCard, getInitials } from './shared';

interface Props {
  appointment: IAppointmentDetails;
  token: string | null;
  isDark: boolean;
  formatDate: (dateStr: string | Date, formatStr: string) => string;
  onOpenNotesChat: (focusInput: boolean) => void;
  onRemoveNote: (noteId: number) => void;
  loadingRemoveNote: number;
  setScrollEnabled: (enabled: boolean) => void;
  /** Called when the sticky note list changes so the parent can update the tab badge */
  onStickyCountChange?: (count: number) => void;
}

export default function NotesTab({
  appointment,
  token,
  isDark,
  formatDate,
  onOpenNotesChat,
  onRemoveNote,
  loadingRemoveNote,
  setScrollEnabled,
  onStickyCountChange,
}: Props) {
  const c = isDark ? palette.dark : palette.light;
  const { user } = useAuth();

  const notes = appointment.job.notes || [];
  const lastNote = notes.length > 0 ? notes[notes.length - 1] : null;

  const canDeleteNote = (note: INote) => !!user && user.id === note.creator?.id;

  return (
    <View style={{ gap: 12 }}>
      {/* ═══ NOTES (chat) ═══ */}
      <Animated.View entering={FadeInDown.duration(350)}>
        <SectionCard
          title="Notes"
          icon={{ ios: 'note.text', android: 'note', web: 'note' }}
          iconColor={c.primary}
          iconBg={c.primaryMuted}
          c={c}
          right={`${notes.length} ${notes.length === 1 ? 'message' : 'messages'}`}
        >
          {notes.length > 1 && (
            <Pressable onPress={() => onOpenNotesChat(false)} style={({ pressed }) => [styles.moreNotesBtn, pressed && { opacity: 0.7 }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>More messages</Text>
            </Pressable>
          )}

          {!lastNote ? (
            <EmptyText text="No notes added yet." c={c} />
          ) : (
            <View style={styles.notesList}>
              <SwipeableNote
                note={lastNote}
                isSelf={lastNote.creator?.id === user?.id && user?.id !== undefined}
                canDelete={canDeleteNote(lastNote)}
                onDelete={onRemoveNote}
                loadingRemove={loadingRemoveNote === lastNote.id}
                c={c}
                isDark={isDark}
                formatDate={formatDate}
                setScrollEnabled={setScrollEnabled}
              />
            </View>
          )}

          <Pressable
            onPress={() => onOpenNotesChat(true)}
            style={({ pressed }) => [styles.mockNoteInput, { backgroundColor: c.inputBg, borderColor: c.cardBorder }, pressed && { opacity: 0.8 }]}
          >
            <Text style={{ color: c.textMuted, fontSize: 13, flex: 1 }}>Type note here...</Text>
            <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={14} tintColor={c.textMuted} />
          </Pressable>
        </SectionCard>
      </Animated.View>

      {/* ═══ STICKY NOTES (reminders) ═══ */}
      <Animated.View entering={FadeInDown.duration(350).delay(80)}>
        <StickyNotesCard
          jobId={appointment.job.id}
          token={token}
          isDark={isDark}
          formatDate={formatDate}
          onCountChange={onStickyCountChange}
        />
      </Animated.View>
    </View>
  );
}

// ─── Sticky notes ────────────────────────────────────────────────────────────

function StickyNotesCard({
  jobId,
  token,
  isDark,
  formatDate,
  onCountChange,
}: {
  jobId: number;
  token: string | null;
  isDark: boolean;
  formatDate: (dateStr: string | Date, formatStr: string) => string;
  onCountChange?: (count: number) => void;
}) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();
  const { user } = useAuth();

  const [notes, setNotes] = useState<IStickyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [updatingId, setUpdatingId] = useState(0);
  const [removingId, setRemovingId] = useState(0);

  const applyNotes = useCallback(
    (list: IStickyNote[]) => {
      setNotes(list);
      onCountChange?.(list.filter((n) => n.status === 0).length);
    },
    [onCountChange],
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/sticky-notes/job/${jobId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
      const data = await response.json();
      applyNotes(data.stickyNotes || []);
    } catch (err: any) {
      console.error(err);
      showToast({ message: 'Failed to load sticky notes', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [jobId, token, applyNotes]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (note: IStickyNote) => {
    if (!token || updatingId) return;
    setUpdatingId(note.id);
    try {
      const response = await fetch(`${API_URL}/sticky-notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      if (!response.ok) {
        if (response.status === 403) throw new Error('You are not allowed to update this note');
        throw new Error(`Server returned status code ${response.status}`);
      }
      const data = await response.json();
      applyNotes(notes.map((n) => (n.id === note.id ? { ...n, ...data.updatedNote } : n)));
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to update note.');
    } finally {
      setUpdatingId(0);
    }
  };

  const remove = (note: IStickyNote) => {
    if (!token) return;
    Alert.alert('Delete Sticky Note', 'Are you sure you want to delete this reminder?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setRemovingId(note.id);
          try {
            const response = await fetch(`${API_URL}/sticky-notes/${note.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            });
            if (!response.ok) {
              if (response.status === 403) throw new Error('You are not allowed to delete this note');
              throw new Error(`Server returned status code ${response.status}`);
            }
            applyNotes(notes.filter((n) => n.id !== note.id));
          } catch (err: any) {
            console.error(err);
            Alert.alert('Error', err.message || 'Failed to delete note.');
          } finally {
            setRemovingId(0);
          }
        },
      },
    ]);
  };

  const upcoming = notes.filter((n) => n.status === 0);
  const completed = notes.filter((n) => n.status === 1);

  const noteDate = (d: string) => {
    const date = new Date(d);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return formatDate(date, sameYear ? 'MMM DD' : 'MMM DD, YYYY');
  };

  const renderNote = (note: IStickyNote) => {
    const done = note.status === 1;
    const overdue = !done && new Date(note.date).getTime() < Date.now();
    const canDelete = !!user && user.id === note.creator_id;
    return (
      <View
        key={note.id}
        style={[
          styles.stickyNote,
          { backgroundColor: c.stickyNoteBg, borderColor: c.stickyNoteBorder, opacity: done || removingId === note.id ? 0.55 : 1 },
        ]}
      >
        <View style={styles.stickyNoteTop}>
          <Pressable onPress={() => toggleStatus(note)} hitSlop={8} disabled={updatingId === note.id}>
            {updatingId === note.id ? (
              <ActivityIndicator size="small" color={c.success} />
            ) : (
              <View style={[styles.stickyCheck, { borderColor: done ? c.success : c.textMuted, backgroundColor: done ? c.success : 'transparent' }]}>
                {done && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor="#fff" />}
              </View>
            )}
          </Pressable>
          <Text style={{ flex: 1, fontSize: 13, color: c.text, lineHeight: 18, textDecorationLine: done ? 'line-through' : 'none' }}>
            {note.text}
          </Text>
          {canDelete && (
            <Pressable onPress={() => remove(note)} hitSlop={8} disabled={removingId === note.id}>
              {removingId === note.id ? (
                <ActivityIndicator size="small" color={c.danger} />
              ) : (
                <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={15} tintColor={c.danger} />
              )}
            </Pressable>
          )}
        </View>
        <View style={styles.stickyNoteMeta}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SymbolView
              name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
              size={11}
              tintColor={overdue ? c.danger : c.textMuted}
            />
            <Text style={{ fontSize: 11, fontWeight: '700', color: overdue ? c.danger : c.textMuted }}>{noteDate(note.date)}</Text>
          </View>
          {note.employee && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{note.employee.name}</Text>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: note.employee.color || c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 8, fontWeight: '800', color: '#fff' }}>{getInitials(note.employee.name)}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SectionCard
      title="Sticky Notes"
      icon={{ ios: 'pin.fill', android: 'push_pin', web: 'push_pin' }}
      iconColor={c.warning}
      iconBg={c.warningMuted}
      c={c}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!loading && <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted }}>{upcoming.length} open</Text>}
          <HeaderIconButton icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={() => setModalVisible(true)} c={c} />
        </View>
      }
    >
      {loading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : notes.length === 0 ? (
        <EmptyText text="No reminders for this job." c={c} />
      ) : (
        <View style={{ gap: 8, paddingTop: 4 }}>
          {upcoming.map(renderNote)}
          {completed.length > 0 && (
            <>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 }}>
                Completed
              </Text>
              {completed.map(renderNote)}
            </>
          )}
        </View>
      )}

      <StickyNoteModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        jobId={jobId}
        token={token}
        isDark={isDark}
        formatDate={formatDate}
        onSaved={(list) => applyNotes(list)}
      />
    </SectionCard>
  );
}
