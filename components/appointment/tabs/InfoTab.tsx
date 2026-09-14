import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { AvatarInitials } from '../AppointmentUI';
import { palette, styles } from '../styles';
import { IAppointmentDetails } from '../types';
import { EmptyText, HeaderIconButton, SectionCard, getInitials } from './shared';

interface Props {
  appointment: IAppointmentDetails;
  token: string | null;
  isDark: boolean;
  onRefresh: () => Promise<void> | void;
}

export default function InfoTab({ appointment, token, isDark, onRefresh }: Props) {
  return (
    <View style={{ gap: 12 }}>
      <Animated.View entering={FadeInDown.duration(350)}>
        <CustomerCard appointment={appointment} isDark={isDark} />
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(350).delay(80)}>
        <TechniciansCard appointment={appointment} token={token} isDark={isDark} onRefresh={onRefresh} />
      </Animated.View>
    </View>
  );
}

// ─── Customer ────────────────────────────────────────────────────────────────

function CustomerCard({ appointment, isDark }: { appointment: IAppointmentDetails; isDark: boolean }) {
  const c = isDark ? palette.dark : palette.light;
  const router = useRouter();
  const { showToast } = useToast();

  const customer = appointment.job.customer;
  const customerName = customer?.name || 'Unknown Client';
  const clientAddress = customer?.addresses?.[0]?.full || appointment.job.address?.full || '';

  const goEdit = (email = customer?.email || '') => {
    if (!customer) return;
    router.push({
      pathname: '/customer/edit',
      params: { id: customer.id, name: customer.name, phone: customer.phone || '', email },
    });
  };

  const copy = (value: string, label: string) => {
    Clipboard.setStringAsync(value);
    showToast({ message: `${label} copied to clipboard`, type: 'success' });
  };

  const rows: React.ReactNode[] = [];

  if (customer?.phone) {
    rows.push(
      <ContactRow
        key="phone"
        icon={{ ios: 'phone.fill', android: 'phone', web: 'phone' }}
        text={customer.phone}
        c={c}
        onPress={() => Linking.openURL(`tel:${customer.phone}`)}
        actions={[
          { icon: { ios: 'message.fill', android: 'sms', web: 'sms' }, onPress: () => Linking.openURL(`sms:${customer.phone}`) },
          { icon: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }, onPress: () => copy(customer.phone, 'Phone number') },
        ]}
      />,
    );
  }

  if (customer) {
    if (customer.email) {
      rows.push(
        <ContactRow
          key="email"
          icon={{ ios: 'envelope.fill', android: 'email', web: 'email' }}
          text={customer.email}
          c={c}
          onPress={() => Linking.openURL(`mailto:${customer.email}`)}
          actions={[{ icon: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }, onPress: () => copy(customer.email, 'Email') }]}
        />,
      );
    } else {
      rows.push(
        <ContactRow
          key="add-email"
          icon={{ ios: 'envelope', android: 'email', web: 'email' }}
          text="Add customer email"
          muted
          c={c}
          onPress={() => goEdit('')}
          actions={[{ icon: { ios: 'plus', android: 'add', web: 'add' }, onPress: () => goEdit(''), muted: true }]}
        />,
      );
    }
  }

  if (clientAddress) {
    rows.push(
      <ContactRow
        key="address"
        icon={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
        text={clientAddress}
        lines={2}
        c={c}
        actions={[{ icon: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }, onPress: () => copy(clientAddress, 'Address') }]}
      />,
    );
  }

  return (
    <SectionCard
      title="Customer"
      icon={{ ios: 'person.fill', android: 'person', web: 'person' }}
      iconColor={c.primary}
      iconBg={c.primaryMuted}
      c={c}
      right={
        customer ? (
          <HeaderIconButton icon={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }} onPress={() => goEdit()} c={c} />
        ) : undefined
      }
    >
      <View style={styles.clientProfileRow}>
        <Pressable
          onPress={() => customer && router.push(`/customer/${customer.id}` as any)}
          disabled={!customer}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }, pressed && { opacity: 0.75 }]}
        >
          <AvatarInitials name={customerName} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }} numberOfLines={1}>
              {customerName}
            </Text>
            {customer && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.miniChip, { backgroundColor: c.primaryMuted }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: c.primary }}>{customer.jobsCount ?? 0} jobs</Text>
                </View>
                <Text style={{ fontSize: 11, color: c.textMuted }}>View profile ›</Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {rows.map((row, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <View style={[styles.divider, { backgroundColor: c.divider, marginVertical: 2 }]} />}
          {row}
        </React.Fragment>
      ))}
    </SectionCard>
  );
}

function ContactRow({
  icon,
  text,
  c,
  onPress,
  actions,
  muted,
  lines = 1,
}: {
  icon: SymbolViewProps['name'];
  text: string;
  c: typeof palette.light;
  onPress?: () => void;
  actions: { icon: SymbolViewProps['name']; onPress: () => void; muted?: boolean }[];
  muted?: boolean;
  lines?: number;
}) {
  const color = muted ? c.textMuted : c.primary;
  return (
    <View style={[styles.contactRow, { backgroundColor: 'transparent', paddingHorizontal: 4, paddingVertical: 6, marginTop: 2 }]}>
      <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.contactRowInfo, pressed && { opacity: 0.6 }]}>
        <SymbolView name={icon} size={14} tintColor={color} />
        <Text style={[styles.contactRowText, { color: muted ? c.textMuted : c.text }]} numberOfLines={lines}>
          {text}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {actions.map((a, i) => (
          <Pressable key={i} onPress={a.onPress} hitSlop={8} style={({ pressed }) => [styles.contactCopyBtn, pressed && { opacity: 0.6 }]}>
            <SymbolView name={a.icon} size={14} tintColor={a.muted ? c.textMuted : c.primary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Technicians ─────────────────────────────────────────────────────────────

function TechniciansCard({
  appointment,
  token,
  isDark,
  onRefresh,
}: {
  appointment: IAppointmentDetails;
  token: string | null;
  isDark: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const c = isDark ? palette.dark : palette.light;
  const { companyEmployees } = useAuth();
  const { showToast } = useToast();

  const assigned = appointment.techs || [];
  const savedIds = assigned.map((t) => t.id);

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number[]>(savedIds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setSelected(savedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.techs, editing]);

  // Deactivated employees are hidden unless already assigned — otherwise old jobs would lose their tech
  const selectable = companyEmployees.filter((e) => e.active !== 0 || savedIds.includes(e.id));
  const isChanged = JSON.stringify([...selected].sort()) !== JSON.stringify([...savedIds].sort());

  const toggle = (id: number) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // keep at least one technician on the job
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const save = async () => {
    if (saving || !isChanged || !token) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/appointments/tech/${appointment.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ techs: selected }),
      });
      if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
      await onRefresh();
      setEditing(false);
      showToast({ message: 'Technicians updated', type: 'success' });
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to update technicians.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Technicians"
      icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
      iconColor={c.success}
      iconBg={c.successMuted}
      c={c}
      right={
        editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => setEditing(false)} hitSlop={8} disabled={saving}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!isChanged || saving}
              style={({ pressed }) => [
                { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: isChanged ? c.primary : c.inputBg },
                pressed && { opacity: 0.8 },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '700', color: isChanged ? '#fff' : c.textMuted }}>Save</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <HeaderIconButton icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }} onPress={() => setEditing(true)} c={c} />
        )
      }
    >
      {!editing ? (
        assigned.length === 0 ? (
          <EmptyText text="No technicians assigned." c={c} />
        ) : (
          <View style={{ gap: 2 }}>
            {assigned.map((tech) => (
              <View key={tech.id} style={styles.techRow}>
                <View style={[styles.techAvatar, { backgroundColor: tech.color || c.primary, borderColor: 'transparent' }]}>
                  <Text style={styles.techAvatarText}>{getInitials(tech.name)}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.text }}>{tech.name}</Text>
              </View>
            ))}
          </View>
        )
      ) : selectable.length === 0 ? (
        <EmptyText text="No employees found." c={c} />
      ) : (
        <View style={{ gap: 2 }}>
          {selectable.map((emp) => {
            const isSelected = selected.includes(emp.id);
            return (
              <Pressable
                key={emp.id}
                onPress={() => toggle(emp.id)}
                style={({ pressed }) => [styles.techRow, isSelected && { backgroundColor: c.primaryMuted }, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.techAvatar, { backgroundColor: emp.color || c.primary, borderColor: 'transparent' }]}>
                  <Text style={styles.techAvatarText}>{getInitials(emp.name)}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: c.text }}>{emp.name}</Text>
                <View style={[styles.techCheck, { borderColor: isSelected ? c.primary : c.divider, backgroundColor: isSelected ? c.primary : 'transparent' }]}>
                  {isSelected && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </SectionCard>
  );
}
