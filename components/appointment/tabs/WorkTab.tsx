import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { API_URL } from '@/constants/Config';
import { useToast } from '@/context/ToastContext';
import { PaymentProgressBar } from '../AppointmentUI';
import ExpenseModal from '../ExpenseModal';
import SwipeToDelete from '../SwipeToDelete';
import SendInvoiceModal from '../SendInvoiceModal';
import { palette, styles } from '../styles';
import { IAppointmentDetails, IExpense, IInvoice, IPayment, IService } from '../types';
import { AddRowButton, EmptyText, HeaderIconButton, SectionCard } from './shared';

interface Props {
  appointment: IAppointmentDetails;
  token: string | null;
  isDark: boolean;
  formatDate: (dateStr: string | Date, formatStr: string) => string;
  onAddService: () => void;
  onEditService: (svc: IService) => void;
  onRefresh: () => Promise<void> | void;
  setScrollEnabled: (enabled: boolean) => void;
}

export default function WorkTab({ appointment, token, isDark, formatDate, onAddService, onEditService, onRefresh, setScrollEnabled }: Props) {
  const c = isDark ? palette.dark : palette.light;

  const services = appointment.job.services || [];
  const subtotal = services.reduce((sum, s) => sum + parseFloat(s.price || '0'), 0);
  const taxableSubtotal = services.reduce((sum, s) => sum + (s.taxable ? parseFloat(s.price || '0') : 0), 0);
  const taxAmount = Math.max(0, appointment.job.totalAmount - subtotal);
  const taxRatePct = taxableSubtotal > 0 ? (taxAmount / taxableSubtotal) * 100 : 0;

  return (
    <View style={{ gap: 12 }}>
      {/* ═══ SERVICES ═══ */}
      <Animated.View entering={FadeInDown.duration(350)}>
        <SectionCard
          title="Services"
          icon={{ ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' }}
          iconColor={c.success}
          iconBg={c.successMuted}
          c={c}
          right={`${services.length} items`}
        >
          {services.length === 0 ? (
            <EmptyText text="No services listed." c={c} />
          ) : (
            services.map((svc, idx) => (
              <Pressable
                key={svc.id}
                onPress={() => onEditService(svc)}
                style={({ pressed }) => [
                  styles.serviceItem,
                  {
                    backgroundColor: idx % 2 === 0 ? c.inputBg : 'transparent',
                    alignItems: svc.description ? 'flex-start' : 'center',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>
                    {svc.title || svc.name || 'Unnamed Service'}
                  </Text>
                  {svc.description ? (
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{svc.description}</Text>
                  ) : null}
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, marginTop: svc.description ? 1 : 0 }}>
                  ${parseFloat(svc.price).toFixed(2)}
                </Text>
              </Pressable>
            ))
          )}

          <AddRowButton label="Add Service" onPress={onAddService} isDark={isDark} c={c} />

          <View style={[styles.divider, { backgroundColor: c.divider, marginTop: 4 }]} />

          {/* Totals */}
          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted }}>Subtotal</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>${subtotal.toFixed(2)}</Text>
            </View>
            {taxAmount > 0 && (
              <View style={styles.totalRow}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted }}>
                  Tax {taxRatePct > 0 ? `(${taxRatePct.toFixed(1)}%)` : ''}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>${taxAmount.toFixed(2)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, { marginTop: 4 }]}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>Total</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>
                ${appointment.job.totalAmount.toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: c.divider, marginVertical: 12 }]} />

          <PaymentProgressBar total={appointment.job.totalAmount} remaining={appointment.job.remainingBalance} isDark={isDark} />

          {/* Payments History */}
          {appointment.job.payments && appointment.job.payments.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: c.divider, marginVertical: 12 }]} />
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Payment History
                </Text>
                {appointment.job.payments.map((payment: IPayment, idx: number) => {
                  const amountVal = parseFloat(payment.amount);
                  const isNegative = amountVal < 0;
                  return (
                    <View key={payment.id} style={[styles.paymentRow, { backgroundColor: idx % 2 === 0 ? c.inputBg : 'transparent' }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{payment.type_text || 'Payment'}</Text>
                        <Text style={{ fontSize: 11, color: c.textMuted }}>
                          {formatDate(payment.created_at, 'MMM DD, YYYY hh:mm A')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: isNegative ? c.danger : c.success }}>
                        {isNegative ? '-' : '+'}${Math.abs(amountVal).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </SectionCard>
      </Animated.View>

      {/* ═══ INVOICES ═══ */}
      <Animated.View entering={FadeInDown.duration(350).delay(80)}>
        <InvoicesCard appointment={appointment} token={token} isDark={isDark} formatDate={formatDate} onRefresh={onRefresh} />
      </Animated.View>

      {/* ═══ EXPENSES ═══ */}
      <Animated.View entering={FadeInDown.duration(350).delay(160)}>
        <ExpensesCard appointment={appointment} token={token} isDark={isDark} onRefresh={onRefresh} setScrollEnabled={setScrollEnabled} />
      </Animated.View>
    </View>
  );
}

// ─── Expenses ────────────────────────────────────────────────────────────────

function ExpensesCard({
  appointment,
  token,
  isDark,
  onRefresh,
  setScrollEnabled,
}: {
  appointment: IAppointmentDetails;
  token: string | null;
  isDark: boolean;
  onRefresh: () => Promise<void> | void;
  setScrollEnabled: (enabled: boolean) => void;
}) {
  const c = isDark ? palette.dark : palette.light;

  const [modalVisible, setModalVisible] = useState(false);
  const [removingId, setRemovingId] = useState(0);

  const expenses = appointment.job.expenses || [];
  const total = expenses.reduce((sum, e) => sum + parseFloat(String(e.amount || 0)), 0);

  const removeExpense = (expense: IExpense) => {
    if (!token) return;
    Alert.alert('Delete Expense', `Remove "${expense.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setRemovingId(expense.id);
          try {
            const response = await fetch(`${API_URL}/expenses/${expense.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            });
            if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
            await onRefresh();
          } catch (err: any) {
            console.error(err);
            Alert.alert('Error', err.message || 'Failed to delete expense.');
          } finally {
            setRemovingId(0);
          }
        },
      },
    ]);
  };

  return (
    <SectionCard
      title="Expenses"
      icon={{ ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' }}
      iconColor={c.warning}
      iconBg={c.warningMuted}
      c={c}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {total > 0 && <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted }}>${total.toFixed(2)}</Text>}
          <HeaderIconButton icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={() => setModalVisible(true)} c={c} />
        </View>
      }
    >
      {expenses.length === 0 ? (
        <EmptyText text="No expenses added yet." c={c} />
      ) : (
        <View style={{ gap: 4 }}>
          {expenses.map((exp, idx) => (
            <SwipeToDelete
              key={exp.id}
              onDelete={() => removeExpense(exp)}
              deleting={removingId === exp.id}
              dangerColor={c.danger}
              setScrollEnabled={setScrollEnabled}
              // Opaque colors: the palette's translucent card/inputBg would let the red action area bleed through
              style={{ backgroundColor: idx % 2 === 0 ? (isDark ? '#243247' : '#F4F5F7') : (isDark ? '#1E293B' : '#FFFFFF') }}
            >
              <View style={[styles.expenseRow, { opacity: removingId === exp.id ? 0.5 : 1 }]}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: c.text }} numberOfLines={2}>
                  {exp.title}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
                  ${parseFloat(String(exp.amount || 0)).toFixed(2)}
                </Text>
              </View>
            </SwipeToDelete>
          ))}
        </View>
      )}

      <ExpenseModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        jobId={appointment.job.id}
        token={token}
        isDark={isDark}
        onSuccess={onRefresh}
      />
    </SectionCard>
  );
}

// ─── Invoices ────────────────────────────────────────────────────────────────

const isCancelled = (inv: IInvoice) => inv.status === 2 || String(inv.status_text).toLowerCase() === 'cancelled';

function InvoicesCard({
  appointment,
  token,
  isDark,
  formatDate,
  onRefresh,
}: {
  appointment: IAppointmentDetails;
  token: string | null;
  isDark: boolean;
  formatDate: (dateStr: string | Date, formatStr: string) => string;
  onRefresh: () => Promise<void> | void;
}) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();

  const [modalVisible, setModalVisible] = useState(false);
  const [resendTarget, setResendTarget] = useState<IInvoice | null>(null);

  const invoices = (appointment.job.invoices || []).filter((inv) => !isCancelled(inv));

  const openNew = () => {
    setResendTarget(null);
    setModalVisible(true);
  };
  const openResend = (inv: IInvoice) => {
    setResendTarget(inv);
    setModalVisible(true);
  };
  const openPdf = async (inv: IInvoice) => {
    const url = inv.pdf_url || inv.pdf_path;
    if (!url) {
      showToast({ message: 'PDF is not ready yet', type: 'info' });
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open the PDF.');
    }
  };

  const statusBadge = (inv: IInvoice) => {
    const s = inv.status;
    if (s === 0) return { label: 'Draft', color: c.textMuted };
    if (s === 1) return { label: inv.is_delivered ? 'Delivered' : 'Sent', color: c.primary };
    if (s === 3) return { label: 'Failed', color: c.danger };
    return { label: inv.status_text || 'Unknown', color: c.textMuted };
  };
  const balanceBadge = (inv: IInvoice) => {
    const b = inv.balance_status;
    if (b === 2) return { label: 'Paid', color: c.success };
    if (b === 1) return { label: 'Partially Paid', color: c.warning };
    return { label: 'Unpaid', color: c.danger };
  };

  return (
    <SectionCard
      title="Invoices"
      icon={{ ios: 'doc.text.fill', android: 'description', web: 'description' }}
      iconColor={c.warning}
      iconBg={c.warningMuted}
      c={c}
      right={
        <Pressable
          onPress={openNew}
          hitSlop={6}
          style={({ pressed }) => [styles.sendInvoiceBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        >
          <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={12} tintColor="#fff" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Send Invoice</Text>
        </Pressable>
      }
    >
      {invoices.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 4, paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary }}>No invoices for this job yet</Text>
          <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>Tap "Send Invoice" to bill the customer.</Text>
        </View>
      ) : (
        <View style={{ gap: 8, paddingTop: 4 }}>
          {invoices.map((inv) => {
            const st = statusBadge(inv);
            const bl = balanceBadge(inv);
            const recipient = inv.recipient_emails?.[0] || inv.recipients?.[0] || inv.email;
            const dateStr = inv.created_at || inv.sent_at;
            return (
              <View key={inv.id} style={[styles.invoiceRow, { backgroundColor: c.inputBg, borderColor: c.cardBorder }]}>
                <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: c.text }}>#{inv.id}</Text>
                    <View style={[styles.invoiceBadge, { borderColor: st.color }]}>
                      <Text style={[styles.invoiceBadgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                    <View style={[styles.invoiceBadge, { borderColor: bl.color, backgroundColor: `${bl.color}1A` }]}>
                      <Text style={[styles.invoiceBadgeText, { color: bl.color }]}>{bl.label}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: c.textMuted }} numberOfLines={1}>
                    {dateStr ? formatDate(dateStr, 'MMM DD, YYYY') : ''}
                    {recipient ? `  ·  ${recipient}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => openPdf(inv)} hitSlop={6} style={({ pressed }) => [styles.invoiceIconBtn, { backgroundColor: c.card }, pressed && { opacity: 0.6 }]}>
                  <SymbolView name={{ ios: 'doc.richtext', android: 'picture_as_pdf', web: 'picture_as_pdf' }} size={15} tintColor={c.textSecondary} />
                </Pressable>
                <Pressable onPress={() => openResend(inv)} hitSlop={6} style={({ pressed }) => [styles.invoiceIconBtn, { backgroundColor: c.successMuted }, pressed && { opacity: 0.6 }]}>
                  <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={14} tintColor={c.success} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <SendInvoiceModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        appointment={appointment}
        resendInvoice={resendTarget}
        token={token}
        isDark={isDark}
        onSuccess={onRefresh}
      />
    </SectionCard>
  );
}
