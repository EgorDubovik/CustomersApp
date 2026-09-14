import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { API_URL } from '@/constants/Config';
import { useToast } from '@/context/ToastContext';
import { palette, styles } from './styles';
import { IAppointmentDetails, IInvoice } from './types';

interface Props {
  visible: boolean;
  onClose: () => void;
  appointment: IAppointmentDetails;
  /** When set the modal resends this invoice instead of creating a new one */
  resendInvoice?: IInvoice | null;
  token: string | null;
  isDark: boolean;
  onSuccess: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SendInvoiceModal({ visible, onClose, appointment, resendInvoice, token, isDark, onSuccess }: Props) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();

  const [emailsText, setEmailsText] = useState('');
  const [attachPhotos, setAttachPhotos] = useState(false);
  const [sending, setSending] = useState(false);

  const isResend = !!resendInvoice;
  const images = appointment.job.images || [];

  useEffect(() => {
    if (!visible) return;
    const preset = isResend
      ? resendInvoice?.recipient_emails?.length
        ? resendInvoice.recipient_emails
        : resendInvoice?.recipients?.length
          ? resendInvoice.recipients
          : resendInvoice?.email
            ? [resendInvoice.email]
            : []
      : appointment.job.customer?.email
        ? [appointment.job.customer.email]
        : [];
    setEmailsText(preset.join(', '));
    setAttachPhotos(false);
  }, [visible, isResend, resendInvoice, appointment.job.customer?.email]);

  const emails = emailsText
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  const canSend = emails.length > 0 && invalid.length === 0 && !sending;

  const send = async () => {
    if (!canSend || !token) return;
    setSending(true);
    try {
      const url = isResend ? `${API_URL}/invoices/${resendInvoice!.id}/resend` : `${API_URL}/invoices/send/${appointment.job.id}`;
      const body = isResend ? { emails } : { emails, imageIds: attachPhotos ? images.map((i) => i.id) : [] };
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        let message = `Server returned status code ${response.status}`;
        try {
          const data = await response.json();
          if (data?.message) message = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        } catch {}
        throw new Error(message);
      }
      showToast({ message: isResend ? 'Invoice resent' : 'Invoice sent', type: 'success' });
      onClose();
      onSuccess();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to send invoice.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '85%', width: '100%' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>{isResend ? `Resend Invoice #${resendInvoice!.id}` : 'Send Invoice'}</Text>
            <Pressable onPress={onClose} hitSlop={15} style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Amount summary */}
            <View style={[styles.payBalanceRow, { backgroundColor: c.inputBg, borderRadius: 12, padding: 14, marginBottom: 0 }]}>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Job total</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>${appointment.job.totalAmount.toFixed(2)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Balance due</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: appointment.job.remainingBalance > 0 ? c.danger : c.success }}>
                  ${appointment.job.remainingBalance.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.formLabel, { color: c.textMuted }]}>Send to</Text>
              <TextInput
                value={emailsText}
                onChangeText={setEmailsText}
                placeholder="customer@email.com, second@email.com"
                placeholderTextColor={c.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.formInput, { backgroundColor: c.inputBg, borderColor: invalid.length ? c.danger : c.cardBorder, color: c.text }]}
              />
              <Text style={{ fontSize: 11, color: invalid.length ? c.danger : c.textMuted }}>
                {invalid.length ? `Invalid: ${invalid.join(', ')}` : 'Separate multiple addresses with a comma.'}
              </Text>
            </View>

            {!isResend && images.length > 0 && (
              <Pressable onPress={() => setAttachPhotos((v) => !v)} style={({ pressed }) => [styles.switchRow, pressed && { opacity: 0.8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>Attach job photos</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>
                    {images.length} {images.length === 1 ? 'photo' : 'photos'} will be included in the invoice
                  </Text>
                </View>
                <View style={[styles.toggleTrack, { backgroundColor: attachPhotos ? c.primary : c.inputBg }]}>
                  <View style={[styles.toggleThumb, { transform: [{ translateX: attachPhotos ? 18 : 2 }] }]} />
                </View>
              </Pressable>
            )}
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.8 }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={send}
              disabled={!canSend}
              style={({ pressed }) => [styles.modalActionBtn, { backgroundColor: canSend ? c.primary : c.inputBg, flex: 1.5 }, pressed && { opacity: 0.85 }]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={14} tintColor={canSend ? '#fff' : c.textMuted} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: canSend ? '#fff' : c.textMuted }}>{isResend ? 'Resend' : 'Send Invoice'}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
