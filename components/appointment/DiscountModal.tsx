import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { API_URL } from '@/constants/Config';
import { formatMoney, parseMoneyMask } from './MaterialModal';
import { palette, styles } from './styles';
import { IDiscount } from './types';

interface Props {
  visible: boolean;
  onClose: () => void;
  jobId: number;
  /** null — the job has no discount yet */
  discount: IDiscount | null;
  token: string | null;
  isDark: boolean;
  onSuccess: () => Promise<void> | void;
}

/** One discount per job: a fixed amount or a percentage of the subtotal. Same as the web. */
export default function DiscountModal({ visible, onClose, jobId, discount, token, isDark, onSuccess }: Props) {
  const c = isDark ? palette.dark : palette.light;
  const [type, setType] = useState<'amount' | 'percentage'>('amount');
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setType(discount?.type ?? 'amount');
    setAmount(discount ? Number(discount.amount) || 0 : 0);
  }, [visible, discount]);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };

  const switchType = (next: 'amount' | 'percentage') => {
    if (next === type) return;
    setType(next);
    // Percent is a whole number 0–100
    if (next === 'percentage') setAmount(Math.min(100, Math.round(amount)));
  };

  const onPercentChange = (raw: string) => {
    const display = `${amount}%`;
    let digits = raw.replace(/\D/g, '');
    // Backspace at the end erases the "%" — treat it as erasing the last digit
    if (!raw.includes('%') && raw.length < display.length) digits = digits.slice(0, -1);
    const val = parseInt(digits, 10) || 0;
    if (val > 100) return;
    setAmount(val);
  };

  const save = async () => {
    if (saving || !token) return;
    if (amount < 0) return Alert.alert('Error', 'Please enter a valid positive discount amount');
    if (type === 'percentage' && amount > 100) return Alert.alert('Error', 'Percentage discount cannot exceed 100%');
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/jobs/discounts/${jobId}`, { method: 'POST', headers, body: JSON.stringify({ amount, type }) });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.message || 'Something went wrong. Please try again later');
      }
      onClose();
      await onSuccess();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert('Delete Discount', 'Are you sure you want to delete this discount?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const r = await fetch(`${API_URL}/jobs/discounts/${jobId}`, { method: 'DELETE', headers });
            if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
            onClose();
            await onSuccess();
          } catch (err: any) {
            console.error(err);
            Alert.alert('Error', 'Something went wrong. Please try again later');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', width: '100%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>{discount ? 'Update Discount' : 'Add Discount'}</Text>
              <Pressable onPress={onClose} hitSlop={15} style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
              </Pressable>
            </View>

            <View style={{ gap: 14 }}>
              <View style={{ gap: 6 }}>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Discount Type</Text>
                <View style={{ flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: c.inputBg }}>
                  {(['amount', 'percentage'] as const).map((t) => {
                    const active = type === t;
                    return (
                      <Pressable key={t} onPress={() => switchType(t)} style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, backgroundColor: active ? (isDark ? '#334155' : '#FFFFFF') : 'transparent' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? c.primary : c.textMuted }}>{t === 'amount' ? 'Amount ($)' : 'Percentage (%)'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Discount Value</Text>
                <TextInput
                  key={type}
                  value={type === 'amount' ? formatMoney(amount) : `${amount}%`}
                  onChangeText={(v) => (type === 'amount' ? setAmount(parseMoneyMask(v)) : onPercentChange(v))}
                  keyboardType="number-pad"
                  autoFocus
                  selectTextOnFocus
                  style={[styles.formInput, { backgroundColor: c.inputBg, borderColor: c.cardBorder, color: c.text, paddingVertical: 12, borderRadius: 12, fontSize: 18, fontWeight: '700' }]}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              {discount ? (
                <Pressable onPress={remove} disabled={deleting} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.dangerMuted }, pressed && { opacity: 0.8 }]}>
                  {deleting ? <ActivityIndicator size="small" color={c.danger} /> : <Text style={{ fontSize: 14, fontWeight: '700', color: c.danger }}>Delete</Text>}
                </Pressable>
              ) : (
                <Pressable onPress={onClose} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.8 }]}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted }}>Cancel</Text>
                </Pressable>
              )}
              <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.primary, flex: 1.5 }, pressed && { opacity: 0.85 }]}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{discount ? 'Update' : 'Add Discount'}</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
