import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useChat } from '@/context/ChatContext';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import { APPOINTMENT_STATUS, timeOfDay } from './helpers';
import { seedChatCard } from './useChatCard';
import type { ChatAppointmentCard, ChatCustomerCard, ChatEntityRef, ChatEntitySearchResult } from './types';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

type Row = { kind: 'header'; title: string } | { kind: 'customer'; data: ChatCustomerCard } | { kind: 'appointment'; data: ChatAppointmentCard };

/** Search a customer or appointment to attach as a card: by name, phone, address or #number. */
export default function AttachEntitySheet({ visible, onClose, onPick, c }: { visible: boolean; onClose: () => void; onPick: (entity: ChatEntityRef) => void; c: (typeof callsPalette)['light'] }) {
  const { api } = useChat();
  const [q, setQ] = useState('');
  const [result, setResult] = useState<ChatEntitySearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!visible) {
      setQ('');
      setResult(null);
    }
  }, [visible]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_QUERY) {
      setResult(null);
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .searchEntities(query)
        .then((r) => id === seq.current && setResult(r))
        .catch(() => id === seq.current && setResult({ customers: [], appointments: [] }))
        .finally(() => id === seq.current && setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, api]);

  const pick = (row: Row) => {
    if (row.kind === 'header') return;
    seedChatCard({ type: row.kind, data: row.data } as any);
    onPick({ type: row.kind, id: row.data.id });
  };

  const rows: Row[] = [];
  if (result?.appointments.length) rows.push({ kind: 'header', title: 'APPOINTMENTS' }, ...result.appointments.map((data) => ({ kind: 'appointment' as const, data })));
  if (result?.customers.length) rows.push({ kind: 'header', title: 'CUSTOMERS' }, ...result.customers.map((data) => ({ kind: 'customer' as const, data })));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 6 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>Attach a card</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ fontSize: 16, color: c.primary, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
        <View style={[styles.searchInputRow, { backgroundColor: c.card, borderColor: c.cardBorder, marginHorizontal: 16, marginVertical: 8 }]}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={c.textMuted} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Name, phone, address or #number" placeholderTextColor={c.textFaint} style={[styles.searchInput, { color: c.text }]} />
          {loading && <ActivityIndicator size="small" color={c.primary} />}
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r, i) => (r.kind === 'header' ? `h-${r.title}` : `${r.kind}-${r.data.id}`) + i}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: c.textMuted, paddingVertical: 32, paddingHorizontal: 24 }}>
              {q.trim().length < MIN_QUERY ? `Type at least ${MIN_QUERY} characters` : loading ? '' : 'Nothing found'}
            </Text>
          }
          renderItem={({ item }) => {
            if (item.kind === 'header') return <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: c.textMuted, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>{item.title}</Text>;
            const isAppt = item.kind === 'appointment';
            const status = isAppt ? APPOINTMENT_STATUS[item.data.status] : undefined;
            const title = isAppt ? `#${item.data.id} · ${(item.data as ChatAppointmentCard).customer?.name ?? 'No customer'}` : (item.data as ChatCustomerCard).name;
            const sub = isAppt
              ? `${new Date((item.data as ChatAppointmentCard).start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${timeOfDay((item.data as ChatAppointmentCard).start)}`
              : [(item.data as ChatCustomerCard).phone, (item.data as ChatCustomerCard).address?.line1].filter(Boolean).join(' · ');
            return (
              <Pressable onPress={() => pick(item)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? c.inputBg : 'transparent' })}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
                  <SymbolView name={isAppt ? { ios: 'calendar', android: 'event', web: 'event' } : { ios: 'person.fill', android: 'person', web: 'person' }} size={16} tintColor={c.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }} numberOfLines={1}>
                    {title}
                  </Text>
                  {!!sub && (
                    <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>
                      {sub}
                    </Text>
                  )}
                </View>
                {status && <Text style={{ fontSize: 11, fontWeight: '700', color: status.color }}>{status.label}</Text>}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
