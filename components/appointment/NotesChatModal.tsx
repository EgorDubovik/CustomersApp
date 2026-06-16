import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { API_URL } from '@/constants/Config';
import { useToast } from '@/context/ToastContext';
import { SwipeableNote } from './AppointmentUI';
import { IAppointmentDetails, INote } from './types';
import { palette, styles } from './styles';

interface NotesChatModalProps {
  visible: boolean;
  onClose: () => void;
  appointment: IAppointmentDetails | null;
  token: string | null;
  user: any;
  isDark: boolean;
  formatDate: (dateStr: string, formatStr: string) => string;
  onSuccess: () => void;
  autoFocusInput: boolean;
}

export default function NotesChatModal({
  visible,
  onClose,
  appointment,
  token,
  user,
  isDark,
  formatDate,
  onSuccess,
  autoFocusInput,
}: NotesChatModalProps) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();
  const scrollViewRef = useRef<ScrollView>(null);

  // Local States
  const [newNote, setNewNote] = useState('');
  const [loadingSaveNote, setLoadingSaveNote] = useState(false);
  const [loadingRemoveNote, setLoadingRemoveNote] = useState<number>(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Scroll to bottom when modal opens or notes change
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [visible, appointment?.job?.notes]);

  const canDeleteNote = (note: INote) => {
    if (!user) return false;
    return user.id === note.creator?.id;
  };

  const handleSaveNote = async () => {
    if (!newNote.trim() || !appointment || !token) return;

    setLoadingSaveNote(true);
    try {
      const response = await fetch(`${API_URL}/jobs/notes/${appointment.job.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ text: newNote.trim() }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save note: status ${response.status}`);
      }

      setNewNote('');
      onSuccess();
      showToast({ message: 'Note added successfully', type: 'success' });
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Something went wrong while saving note.');
    } finally {
      setLoadingSaveNote(false);
    }
  };

  const handleRemoveNote = (noteId: number) => {
    if (!token) return;

    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoadingRemoveNote(noteId);
            try {
              const response = await fetch(`${API_URL}/jobs/notes/${noteId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json',
                },
              });

              if (!response.ok) {
                if (response.status === 403) {
                  throw new Error('You are not allowed to delete this note');
                }
                throw new Error(`Failed to delete note: status ${response.status}`);
              }

              onSuccess();
              showToast({ message: 'Note deleted successfully', type: 'success' });
            } catch (err: any) {
              console.error(err);
              Alert.alert('Error', err.message || 'Something went wrong while deleting note.');
            } finally {
              setLoadingRemoveNote(0);
            }
          },
        },
      ]
    );
  };

  if (!appointment) return null;

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {/* Status bar spacer */}
        <View style={{ height: Platform.OS === 'ios' ? 50 : 20 }} />

        {/* Modal Header */}
        <View style={styles.chatModalHeader}>
          <Pressable
            onPress={onClose}
            hitSlop={15}
            style={({ pressed }) => [styles.chatCloseBtn, pressed && { opacity: 0.7 }]}
          >
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={22}
              tintColor={c.text}
            />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>Notes</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.textMuted }}>
              {appointment.job?.notes?.length || 0} {appointment.job?.notes?.length === 1 ? 'message' : 'messages'}
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: c.divider }]} />

        {/* Keyboard avoiding wrapper for the scroll view and input */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Scrollable list of ALL notes */}
          <ScrollView
            ref={scrollViewRef}
            scrollEnabled={scrollEnabled}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1, paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingVertical: 12, gap: 10 }}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {(!appointment.job?.notes || appointment.job.notes.length === 0) ? (
              <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textMuted, alignSelf: 'center', marginTop: 20 }}>
                No notes added yet.
              </Text>
            ) : (
              appointment.job.notes.map((note) => {
                const isSelf = note.creator?.id === user?.id && user?.id !== undefined;
                return (
                  <SwipeableNote
                    key={note.id}
                    note={note}
                    isSelf={isSelf}
                    canDelete={canDeleteNote(note)}
                    onDelete={handleRemoveNote}
                    loadingRemove={loadingRemoveNote === note.id}
                    c={c}
                    isDark={isDark}
                    formatDate={formatDate}
                    setScrollEnabled={setScrollEnabled}
                  />
                );
              })
            )}
          </ScrollView>

          {/* Input row at bottom */}
          <View
            style={[
              styles.modalInputContainer,
              {
                borderTopColor: c.divider,
                backgroundColor: c.card,
                paddingBottom: Platform.OS === 'ios' ? 24 : 12,
              }
            ]}
          >
            <TextInput
              value={newNote}
              onChangeText={setNewNote}
              placeholder="Type note here..."
              placeholderTextColor={c.textMuted}
              multiline
              autoFocus={autoFocusInput}
              style={[
                styles.noteInput,
                {
                  backgroundColor: c.inputBg,
                  borderColor: c.cardBorder,
                  color: c.text,
                }
              ]}
            />
            <Pressable
              onPress={handleSaveNote}
              disabled={loadingSaveNote || !newNote.trim()}
              style={({ pressed }) => [
                styles.noteSendBtn,
                {
                  backgroundColor: newNote.trim() ? c.primary : c.inputBg,
                },
                pressed && { opacity: 0.8 }
              ]}
            >
              {loadingSaveNote ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <SymbolView
                  name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
                  size={16}
                  tintColor={newNote.trim() ? '#ffffff' : c.textMuted}
                />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
