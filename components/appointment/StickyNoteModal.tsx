import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SymbolView } from 'expo-symbols';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { palette, styles } from './styles';
import { IStickyNote } from './types';
import { getInitials } from './tabs/shared';

interface Props {
  visible: boolean;
  onClose: () => void;
  jobId: number;
  token: string | null;
  isDark: boolean;
  formatDate: (dateStr: string | Date, formatStr: string) => string;
  onSaved: (notes: IStickyNote[]) => void;
}

const QUICK_ADD: { label: string; apply: (d: Date) => Date }[] = [
  { label: '+ week', apply: (d) => new Date(d.setDate(d.getDate() + 7)) },
  { label: '+ month', apply: (d) => new Date(d.setMonth(d.getMonth() + 1)) },
  { label: '+ 6 months', apply: (d) => new Date(d.setMonth(d.getMonth() + 6)) },
  { label: '+ year', apply: (d) => new Date(d.setFullYear(d.getFullYear() + 1)) },
];

export default function StickyNoteModal({ visible, onClose, jobId, token, isDark, formatDate, onSaved }: Props) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();
  const { user, companyEmployees } = useAuth();

  const [text, setText] = useState('');
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setText('');
      setDate(new Date());
      setSelected(user?.id ? [user.id] : []);
      setShowPicker(Platform.OS === 'ios');
    }
  }, [visible, user?.id]);

  const employees = companyEmployees.filter((e) => e.active !== 0);

  const toggleEmployee = (id: number) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // at least one recipient
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const save = async () => {
    if (saving || !token) return;
    if (!text.trim()) {
      Alert.alert('Empty note', 'Please type what to remind about.');
      return;
    }
    if (selected.length === 0) {
      Alert.alert('No recipient', 'Pick at least one person to remind.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/sticky-notes/job/${jobId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ text: text.trim(), date: date.toISOString(), employees: selected }),
      });
      if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
      const data = await response.json();
      onSaved(data.stickyNotes || []);
      showToast({ message: 'Sticky note added', type: 'success' });
      onClose();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to save sticky note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '90%', width: '100%' }]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>New Sticky Note</Text>
            <Pressable onPress={onClose} hitSlop={15} style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="What should we remember about this job?"
              placeholderTextColor={c.textMuted}
              multiline
              autoFocus
              style={[styles.stickyTextArea, { backgroundColor: c.inputBg, borderColor: c.cardBorder, color: c.text }]}
            />

            {/* Remind on */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.formLabel, { color: c.textMuted }]}>Remind on</Text>
              <Pressable
                onPress={() => setShowPicker(true)}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.cardBorder },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <SymbolView name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }} size={14} tintColor={c.primary} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{formatDate(date, 'MMM DD, YYYY hh:mm A')}</Text>
              </Pressable>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {QUICK_ADD.map((q) => (
                  <Pressable
                    key={q.label}
                    onPress={() => setDate(q.apply(new Date(date)))}
                    style={({ pressed }) => [styles.stickyQuickChip, { borderColor: c.primary, backgroundColor: c.primaryMuted }, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>

              {showPicker && (
                <View style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.02)', borderRadius: 12, padding: Platform.OS === 'ios' ? 8 : 0 }}>
                  <DateTimePicker
                    value={date}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onValueChange={(_: any, d: Date) => {
                      if (Platform.OS !== 'ios') setShowPicker(false);
                      if (d) setDate(d);
                    }}
                    onDismiss={() => {
                      if (Platform.OS !== 'ios') setShowPicker(false);
                    }}
                    textColor={isDark ? '#F1F5F9' : '#1E293B'}
                    style={Platform.OS === 'ios' ? { height: 160, width: '100%' } : undefined}
                  />
                </View>
              )}
            </View>

            {/* Remind to */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.formLabel, { color: c.textMuted }]}>Remind to</Text>
              {employees.length === 0 ? (
                <Text style={{ fontSize: 13, color: c.textMuted, fontStyle: 'italic' }}>No employees found.</Text>
              ) : (
                <View style={{ gap: 2 }}>
                  {employees.map((emp) => {
                    const isSelected = selected.includes(emp.id);
                    return (
                      <Pressable
                        key={emp.id}
                        onPress={() => toggleEmployee(emp.id)}
                        style={({ pressed }) => [styles.techRow, isSelected && { backgroundColor: c.primaryMuted }, pressed && { opacity: 0.7 }]}
                      >
                        <View style={[styles.techAvatar, { backgroundColor: emp.color || c.primary, borderColor: 'transparent', width: 32, height: 32, borderRadius: 16 }]}>
                          <Text style={[styles.techAvatarText, { fontSize: 11 }]}>{getInitials(emp.name)}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.text }}>
                          {emp.name}
                          {emp.id === user?.id ? '  (you)' : ''}
                        </Text>
                        <View style={[styles.techCheck, { borderColor: isSelected ? c.primary : c.divider, backgroundColor: isSelected ? c.primary : 'transparent' }]}>
                          {isSelected && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor="#fff" />}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.8 }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.primary, flex: 1.5 }, pressed && { opacity: 0.85 }]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Add Reminder</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
