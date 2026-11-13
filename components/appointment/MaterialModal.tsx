import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { API_URL } from '@/constants/Config';
import { palette, styles } from './styles';
import { IMaterial } from './types';

interface Props {
  visible: boolean;
  onClose: () => void;
  jobId: number;
  /** null — adding a new one */
  material: IMaterial | null;
  token: string | null;
  isDark: boolean;
  onSuccess: () => Promise<void> | void;
}

/** Cents mask, like the web: digits fill from the right ($0.05 → $0.52 → $5.21) */
export const parseMoneyMask = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) / 100 : 0;
};
export const formatMoney = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A material on the job (part, item) — title, quantity × price, taxable. Same as the web's Materials. */
export default function MaterialModal({ visible, onClose, jobId, material, token, isDark, onSuccess }: Props) {
  const c = isDark ? palette.dark : palette.light;
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState(0);
  const [taxable, setTaxable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(material?.title ?? '');
    setQuantity(material ? String(material.quantity) : '');
    setPrice(material ? Number(material.price) || 0 : 0);
    setTaxable(!!material?.is_taxble);
  }, [visible, material]);

  const canSave = title.trim().length > 0;
  const qty = parseInt(quantity, 10) || 1;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };

  const save = async () => {
    if (saving || !canSave || !token) return;
    setSaving(true);
    try {
      const url = material ? `${API_URL}/jobs/materials/${jobId}/${material.id}` : `${API_URL}/jobs/materials/${jobId}`;
      const r = await fetch(url, {
        method: material ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify({ title: title.trim(), quantity: qty, price, is_taxble: taxable }),
      });
      if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
      onClose();
      await onSuccess();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Something went wrong. Please try again later');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!material || !token) return;
    Alert.alert('Delete Material', `Are you sure you want to delete "${material.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const r = await fetch(`${API_URL}/jobs/materials/${jobId}/${material.id}`, { method: 'DELETE', headers });
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

  const inputStyle = [styles.formInput, { backgroundColor: c.inputBg, borderColor: c.cardBorder, color: c.text, paddingVertical: 12, borderRadius: 12 }];

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Closing only via the buttons, as on the web — a stray tap shouldn't lose what was typed */}
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', width: '100%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>{material ? 'Update Material' : 'Add Material'}</Text>
              <Pressable onPress={onClose} hitSlop={15} style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
              </Pressable>
            </View>

            <View style={{ gap: 14 }}>
              <View style={{ gap: 6 }}>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Title</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Copper pipe 3/4" placeholderTextColor={c.textMuted} autoFocus={!material} style={inputStyle} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[styles.formLabel, { color: c.textMuted }]}>Quantity</Text>
                  <TextInput value={quantity} onChangeText={(v) => setQuantity(v.replace(/\D/g, ''))} placeholder="1" placeholderTextColor={c.textMuted} keyboardType="number-pad" style={inputStyle} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[styles.formLabel, { color: c.textMuted }]}>Price</Text>
                  <TextInput value={formatMoney(price)} onChangeText={(v) => setPrice(parseMoneyMask(v))} keyboardType="number-pad" selectTextOnFocus style={[inputStyle, { fontWeight: '700' }]} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>Taxable</Text>
                <Switch value={taxable} onValueChange={setTaxable} trackColor={{ true: c.primary, false: undefined }} />
              </View>
              {price > 0 && (
                <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>
                  {qty} × {formatMoney(price)} = <Text style={{ fontWeight: '800', color: c.text }}>{formatMoney(qty * price)}</Text>
                </Text>
              )}
            </View>

            <View style={styles.modalActions}>
              {material ? (
                <Pressable onPress={remove} disabled={deleting} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.dangerMuted }, pressed && { opacity: 0.8 }]}>
                  {deleting ? <ActivityIndicator size="small" color={c.danger} /> : <Text style={{ fontSize: 14, fontWeight: '700', color: c.danger }}>Delete</Text>}
                </Pressable>
              ) : (
                <Pressable onPress={onClose} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.8 }]}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted }}>Discard</Text>
                </Pressable>
              )}
              <Pressable
                onPress={save}
                disabled={!canSave || saving}
                style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: canSave ? c.primary : c.inputBg, flex: 1.5 }, pressed && { opacity: 0.85 }]}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: canSave ? '#fff' : c.textMuted }}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
