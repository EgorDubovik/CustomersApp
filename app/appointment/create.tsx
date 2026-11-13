import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import ServiceModal from '@/components/appointment/ServiceModal';
import { IService } from '@/components/appointment/types';
import { palette } from '@/components/appointment/styles';

interface IAddress {
  id: number;
  full: string;
  label?: string | null;
}

interface ICustomerInfo {
  id: number;
  name: string;
  phone?: string;
  addresses?: IAddress[];
}

/** A service drafted here; it goes to the server together with the appointment */
interface DraftService {
  key: number;
  title: string;
  price: number;
  description: string;
  taxable: boolean;
  is_active: boolean;
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/** Next round half hour — the web starts there too */
function defaultStart(param?: string): Date {
  if (param) {
    const d = new Date(param);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}

/** Local wall-clock time with a "Z" — the format the backend expects (same as the web's manualIsoString) */
function wallClockIso(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}Z`;
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

/**
 * New appointment, the same flow as the web's "Create appointment": customer and
 * address, From/To, services, technicians, then tags and notes under "Additional information".
 * Opened right after a customer is created (customerId param), or empty to search for one.
 */
export default function CreateAppointmentScreen() {
  const params = useLocalSearchParams<{ customerId?: string; startTime?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user, companyEmployees, companyServices, companyTags } = useAuth();
  const { showToast } = useToast();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? palette.dark : palette.light;

  const [customerId, setCustomerId] = useState<number | null>(params.customerId ? Number(params.customerId) : null);
  const [customer, setCustomer] = useState<ICustomerInfo | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [address, setAddress] = useState<IAddress | null>(null);
  const [addressesOpen, setAddressesOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ICustomerInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [timeFrom, setTimeFrom] = useState(() => defaultStart(params.startTime));
  const [timeTo, setTimeTo] = useState(() => new Date(defaultStart(params.startTime).getTime() + DEFAULT_DURATION_MS));
  const [timeToTouched, setTimeToTouched] = useState(false);
  const [editingTime, setEditingTime] = useState<'from' | 'to'>('from');

  const [services, setServices] = useState<DraftService[]>([]);
  const [serviceModal, setServiceModal] = useState<{ open: boolean; editing: DraftService | null }>({ open: false, editing: null });
  const nextKey = useRef(1);

  const [techIds, setTechIds] = useState<number[]>(user?.id ? [user.id] : []);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, Accept: 'application/json' }), [token]);

  // Load the chosen customer; the newest address is picked, like on the web
  useEffect(() => {
    if (!customerId || !token) {
      setCustomer(null);
      setAddress(null);
      return;
    }
    let cancelled = false;
    setLoadingCustomer(true);
    fetch(`${API_URL}/customers/${customerId}`, { headers: authHeaders })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const info: ICustomerInfo = { id: data.id, name: data.name, phone: data.phone, addresses: data.addresses ?? [] };
        setCustomer(info);
        setAddress(info.addresses?.length ? info.addresses[info.addresses.length - 1] : null);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) showToast({ message: 'Failed to load the customer', type: 'error' });
      })
      .finally(() => !cancelled && setLoadingCustomer(false));
    return () => {
      cancelled = true;
    };
  }, [customerId, token]);

  const onSearch = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API_URL}/customers?search=${encodeURIComponent(q)}`, { headers: authHeaders });
        const data = await r.json();
        setResults(data.data || data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const chooseCustomer = (id: number) => {
    setSearch('');
    setResults([]);
    setCustomerId(id);
  };

  const changeCustomer = () => {
    setCustomerId(null);
    setAddressesOpen(false);
  };

  const onTimeChange = (date?: Date) => {
    if (!date) return;
    if (editingTime === 'from') {
      setTimeFrom(date);
      // "To" follows "From" until it was set by hand
      if (!timeToTouched) setTimeTo(new Date(date.getTime() + DEFAULT_DURATION_MS));
    } else {
      setTimeToTouched(true);
      setTimeTo(date);
    }
  };

  const toggleTech = (id: number) => setTechIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleTag = (id: number) => setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Stable object: the modal re-fills its fields whenever this changes
  const editing = serviceModal.editing;
  const editingService = useMemo<IService | null>(
    () => (editing ? { id: editing.key, title: editing.title, price: String(editing.price), description: editing.description, taxable: editing.taxable, is_active: true } : null),
    [editing],
  );

  const total = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const activeEmployees = companyEmployees.filter((e) => e.active === undefined || !!e.active || techIds.includes(e.id));

  const create = async () => {
    if (creating) return;
    if (!customerId) return showToast({ message: 'Choose a customer', type: 'error' });
    if (!address) return showToast({ message: 'No address selected', type: 'error' });
    if (timeTo <= timeFrom) return showToast({ message: '"To" must be later than "From"', type: 'error' });
    setCreating(true);
    try {
      const r = await fetch(`${API_URL}/appointments`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeFrom: wallClockIso(timeFrom),
          timeTo: wallClockIso(timeTo),
          services: services.map(({ key, ...s }) => s),
          techs: techIds,
          customerId,
          addressId: address.id,
          tags: tagIds,
          notes,
        }),
      });
      if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
      const data = await r.json();
      const id = data?.appointment?.id;
      if (!id) throw new Error('Unexpected server response');
      // Replace, so Back from the new appointment doesn't land on this form again
      router.replace(`/appointment/${id}` as any);
    } catch (err: any) {
      console.error(err);
      showToast({ message: 'Error, please try again', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const card = { backgroundColor: c.card, borderColor: c.cardBorder, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 } as const;
  const sectionTitle = { fontSize: 13, fontWeight: '800' as const, color: c.textSecondary, letterSpacing: 0.4, marginBottom: 10 };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: 'Create Appointment', headerTitleStyle: { fontWeight: '700' }, headerBackButtonDisplayMode: 'minimal', headerBackTitle: '' }} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* ─── Customer & address ─── */}
        <View style={card}>
          {loadingCustomer ? (
            <ActivityIndicator color={c.primary} />
          ) : customer ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: c.text }} numberOfLines={1}>{customer.name}</Text>
                <Pressable onPress={changeCustomer} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.danger }}>Change</Text>
                </Pressable>
              </View>
              <Text style={{ marginTop: 10, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: c.textMuted }}>APPOINTMENT ADDRESS</Text>
              <Pressable
                onPress={() => setAddressesOpen((v) => !v)}
                style={({ pressed }) => ({ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: c.inputBg, opacity: pressed ? 0.7 : 1 })}
              >
                <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} size={16} tintColor={c.primary} />
                <View style={{ flex: 1 }}>
                  {!!address?.label && <Text style={{ fontSize: 12, color: c.primary }}>{address.label}</Text>}
                  <Text style={{ fontSize: 14, color: address ? c.text : c.danger }}>{address?.full || 'No address in customer profile'}</Text>
                </View>
                {(customer.addresses?.length ?? 0) > 1 && (
                  <SymbolView name={{ ios: addressesOpen ? 'chevron.up' : 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={13} tintColor={c.textMuted} />
                )}
              </Pressable>
              {addressesOpen &&
                (customer.addresses ?? []).map((a) => {
                  const selected = a.id === address?.id;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => {
                        setAddress(a);
                        setAddressesOpen(false);
                      }}
                      style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: selected ? c.primary : c.cardBorder, backgroundColor: selected ? c.primaryMuted : 'transparent' }}
                    >
                      <View style={{ flex: 1 }}>
                        {!!a.label && <Text style={{ fontSize: 12, color: c.primary }}>{a.label}</Text>}
                        <Text style={{ fontSize: 14, color: c.text }}>{a.full}</Text>
                      </View>
                      {selected && <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={18} tintColor={c.primary} />}
                    </Pressable>
                  );
                })}
            </>
          ) : (
            <>
              <Text style={sectionTitle}>CHOOSE CUSTOMER</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.inputBg }}>
                <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={c.textMuted} />
                <TextInput
                  value={search}
                  onChangeText={onSearch}
                  placeholder="Search by name or phone…"
                  placeholderTextColor={c.textMuted}
                  autoCorrect={false}
                  style={{ flex: 1, height: 42, fontSize: 15, color: c.text }}
                />
                {searching && <ActivityIndicator size="small" color={c.primary} />}
              </View>
              {results.map((r) => (
                <Pressable key={r.id} onPress={() => chooseCustomer(r.id)} style={({ pressed }) => ({ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider, opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{r.name}</Text>
                  {!!r.phone && <Text style={{ fontSize: 12, color: c.textMuted }}>{r.phone}</Text>}
                  {!!r.addresses?.[0]?.full && <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>{r.addresses[0].full}</Text>}
                </Pressable>
              ))}
              {search.trim().length >= 3 && !searching && results.length === 0 && (
                <Pressable onPress={() => router.push('/customer/create' as any)} style={{ paddingTop: 12, alignItems: 'center' }}>
                  <Text style={{ color: c.textMuted }}>
                    No customers found. <Text style={{ color: c.primary, fontWeight: '700' }}>Add new customer</Text>
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* ─── Time ─── */}
        <View style={card}>
          <View style={{ flexDirection: 'row', gap: 8, padding: 4, borderRadius: 12, backgroundColor: c.inputBg }}>
            {(['from', 'to'] as const).map((which) => {
              const active = editingTime === which;
              const d = which === 'from' ? timeFrom : timeTo;
              return (
                <Pressable key={which} onPress={() => setEditingTime(which)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: active ? c.card : 'transparent' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: active ? c.primary : c.textMuted }}>{which === 'from' ? 'FROM' : 'TO'}</Text>
                  <Text style={{ fontSize: 14, fontWeight: active ? '800' : '600', color: c.text }}>{fmtDay(d)}</Text>
                  <Text style={{ fontSize: 14, fontWeight: active ? '800' : '600', color: c.text }}>{fmtTime(d)}</Text>
                </Pressable>
              );
            })}
          </View>
          <DateTimePicker
            key={editingTime}
            value={editingTime === 'from' ? timeFrom : timeTo}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minuteInterval={5}
            onValueChange={(_, date) => onTimeChange(date)}
            textColor={c.text}
            style={{ height: 200, width: '100%' }}
          />
        </View>

        {/* ─── Services ─── */}
        <View style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={[sectionTitle, { flex: 1, marginBottom: 0 }]}>SERVICES</Text>
            {services.length > 0 && <Text style={{ fontSize: 14, fontWeight: '800', color: c.text }}>${total.toFixed(2)}</Text>}
          </View>
          {services.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setServiceModal({ open: true, editing: s })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider, opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{s.title}</Text>
                {!!s.description && <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={2}>{s.description}</Text>}
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>${Number(s.price).toFixed(2)}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setServiceModal({ open: true, editing: null })}
            style={({ pressed }) => ({ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary, opacity: pressed ? 0.6 : 1 })}
          >
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={14} tintColor={c.primary} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.primary }}>Add service</Text>
          </Pressable>
        </View>

        {/* ─── Technicians ─── */}
        <View style={card}>
          <Text style={sectionTitle}>TECHNICIANS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {activeEmployees.map((e) => {
              const selected = techIds.includes(e.id);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => toggleTech(e.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: selected ? e.color || c.primary : c.cardBorder, backgroundColor: selected ? (e.color || c.primary) + '22' : 'transparent' }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: e.color || c.primary }} />
                  <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '500', color: c.text }}>{e.name}</Text>
                  {selected && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={11} tintColor={c.text} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ─── Additional information ─── */}
        <Pressable
          onPress={() => setMoreOpen((v) => !v)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: c.inputBg, marginBottom: 14, opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: c.textSecondary }}>Additional information</Text>
          <SymbolView name={{ ios: moreOpen ? 'chevron.up' : 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={12} tintColor={c.textSecondary} />
        </Pressable>
        {moreOpen && (
          <View style={card}>
            {companyTags.length > 0 && (
              <>
                <Text style={sectionTitle}>TAGS</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {companyTags.map((t) => {
                    const selected = tagIds.includes(t.id);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => toggleTag(t.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 2, borderColor: selected ? c.text : t.color, backgroundColor: t.color }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>{t.title}</Text>
                        {selected && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={11} tintColor="#111" />}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            <Text style={sectionTitle}>NOTES</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Type note here..."
              placeholderTextColor={c.textMuted}
              multiline
              style={{ minHeight: 80, padding: 10, borderRadius: 12, backgroundColor: c.inputBg, color: c.text, fontSize: 15, textAlignVertical: 'top' }}
            />
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: c.cardBorder, backgroundColor: c.card }}>
        <Pressable
          onPress={create}
          disabled={!customerId || creating}
          style={({ pressed }) => ({ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, opacity: !customerId ? 0.5 : pressed ? 0.85 : 1 })}
        >
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Create appointment</Text>}
        </Pressable>
      </View>

      <ServiceModal
        visible={serviceModal.open}
        onClose={() => setServiceModal({ open: false, editing: null })}
        editingService={editingService}
        appointment={null}
        token={token}
        companyServices={companyServices}
        isDark={isDark}
        onSuccess={() => {}}
        onLocalSave={(s) => {
          const editing = serviceModal.editing;
          if (editing) setServices((prev) => prev.map((x) => (x.key === editing.key ? { ...x, ...s } : x)));
          else setServices((prev) => [...prev, { key: nextKey.current++, ...s }]);
        }}
        onLocalDelete={() => {
          const editing = serviceModal.editing;
          if (editing) setServices((prev) => prev.filter((x) => x.key !== editing.key));
        }}
      />
    </KeyboardAvoidingView>
  );
}
