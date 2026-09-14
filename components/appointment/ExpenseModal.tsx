import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { API_URL } from '@/constants/Config';
import { useToast } from '@/context/ToastContext';
import { palette, styles } from './styles';

interface Props {
  visible: boolean;
  onClose: () => void;
  jobId: number;
  token: string | null;
  isDark: boolean;
  onSuccess: () => Promise<void> | void;
}

export default function ExpenseModal({ visible, onClose, jobId, token, isDark, onSuccess }: Props) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setAmount('');
    }
  }, [visible]);

  const parsedAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
  const canSave = title.trim().length > 0 && !isNaN(parsedAmount) && parsedAmount > 0;

  const save = async () => {
    if (saving || !canSave || !token) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/expenses/${jobId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ title: title.trim(), amount: parsedAmount }),
      });
      if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
      showToast({ message: 'Expense added', type: 'success' });
      onClose();
      await onSuccess();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to add expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', width: '100%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Add Expense</Text>
              <Pressable onPress={onClose} hitSlop={15} style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
              </Pressable>
            </View>

            <View style={{ gap: 14 }}>
              <View style={{ gap: 6 }}>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Part / item</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Capacitor 45/5 MFD"
                  placeholderTextColor={c.textMuted}
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={() => amountRef.current?.focus()}
                  blurOnSubmit={false}
                  style={[styles.formInput, { backgroundColor: c.inputBg, borderColor: c.cardBorder, color: c.text, paddingVertical: 12, borderRadius: 12 }]}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Cost</Text>
                <View style={[styles.formInput, { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.inputBg, borderColor: c.cardBorder, paddingVertical: 0, borderRadius: 12 }]}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.textMuted }}>$</Text>
                  <TextInput
                    ref={amountRef}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={c.textMuted}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={save}
                    style={{ flex: 1, fontSize: 16, fontWeight: '700', color: c.text, paddingVertical: 12 }}
                  />
                </View>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={onClose} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.8 }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={save}
                disabled={!canSave || saving}
                style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: canSave ? c.primary : c.inputBg, flex: 1.5 }, pressed && { opacity: 0.85 }]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: canSave ? '#fff' : c.textMuted }}>Add Expense</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
