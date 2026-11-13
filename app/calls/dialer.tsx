import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/constants/Config';
import { CompanyEmployee, CompanyPhone, useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import { formatPhoneNumber } from '@/components/calls/helpers';
import { placeOutboundCall, subscribeToConnection } from '@/utils/outboundCall';
import * as storage from '@/utils/storage';

/** Тот же ключ смысла, что в вебе: диспетчер обычно звонит с одного номера — помним выбор. */
const FROM_NUMBER_KEY = 'dialer_from_number';

const KEYPAD: { digit: string; letters: string }[] = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

/** (954) 997-86 — номер форматируется по мере набора, как в веб-диалере. */
function formatProgressive(input: string): string {
  const d = input.replace(/\D/g, '');
  if (!d) return input;
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

/**
 * Что вставили или набрали — к цифрам номера: «+1 (754) 226-4666», «754.226.4666»
 * и «17542264666» дают одно и то же. * и # оставляем, остальное выбрасываем.
 */
function normalizeTyped(text: string): string {
  const kept = text.replace(/[^\d*#]/g, '');
  const digitsOnly = kept.replace(/\D/g, '');
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1') && kept === digitsOnly) return digitsOnly.slice(1);
  return /^[\d]+$/.test(kept) ? kept.slice(0, 10) : kept;
}

/**
 * Набор номера — повторяет веб-диалер: выбор номера компании, с которого звоним,
 * клавиатура, звонок, переход к SMS с набранным номером и звонок коллеге из списка.
 * Звонить могут только админы и диспетчеры: экран открывается с вкладки Calls,
 * которой у техников нет.
 */
export default function DialerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user, companyPhones, companyEmployees } = useAuth();
  const { showToast } = useToast();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;

  const [number, setNumber] = useState('');
  const [connected, setConnected] = useState(false);
  const [calling, setCalling] = useState(false);
  const [openingSms, setOpeningSms] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showEmployees, setShowEmployees] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Номера без провайдера остались от старой версии — звонить с них нельзя (как в вебе)
  const callableNumbers = useMemo(() => companyPhones.filter((p) => !!p.provider), [companyPhones]);
  const [fromId, setFromId] = useState<number | null>(null);

  useEffect(() => {
    storage
      .getItem(FROM_NUMBER_KEY)
      .then((raw) => raw && setFromId(Number(raw)))
      .catch(() => {});
  }, []);

  // Считаем, а не храним: сохранённый номер могли удалить — тогда тихо берём основной
  const fromNumber: CompanyPhone | null =
    callableNumbers.find((p) => p.id === fromId) ?? callableNumbers.find((p) => p.is_primary) ?? callableNumbers[0] ?? null;

  const selectFrom = (id: number) => {
    setFromId(id);
    setPickerOpen(false);
    storage.setItem(FROM_NUMBER_KEY, String(id)).catch(() => {});
  };

  useEffect(() => subscribeToConnection(setConnected), []);

  const digits = number.replace(/\D/g, '');
  const canCall = digits.length >= 10 && connected && !!fromNumber && !calling;
  const canOpenSms = digits.length >= 3 && !!fromNumber && !openingSms;

  const press = (key: string) => {
    if (/\d/.test(key) && digits.length >= 10) return;
    setNumber((prev) => prev + key);
  };

  const call = async (target: string) => {
    if (!fromNumber) return;
    setCalling(true);
    try {
      await placeOutboundCall(target, fromNumber.phone, user?.id);
      router.replace({ pathname: '/calls/active-call', params: { fromPhoneId: String(fromNumber.id) } } as any);
    } catch (e: any) {
      showToast({ message: e?.message || 'Could not place the call', type: 'error' });
    } finally {
      setCalling(false);
    }
  };

  const callEmployee = (emp: CompanyEmployee) => {
    if (!emp.phone) return showToast({ message: `No phone number for ${emp.name}`, type: 'error' });
    if (!connected) return showToast({ message: 'Telephony is not connected', type: 'error' });
    call(emp.phone);
  };

  // Диалог пары «набранный номер ↔ выбранный номер компании»: бэкенд найдёт его
  // или заведёт новый, а написать SMS можно уже на экране диалога.
  const openSms = async () => {
    if (!canOpenSms || !fromNumber || !token) return;
    setOpeningSms(true);
    try {
      const response = await fetch(`${API_URL}/calls/conversation/open`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_phone: number, company_phone_id: fromNumber.id }),
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      router.replace(`/conversation/${body.conversation_id}` as any);
    } catch {
      showToast({ message: 'Failed to open conversation', type: 'error' });
    } finally {
      setOpeningSms(false);
    }
  };

  const employees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return companyEmployees.filter((e) => e.id !== user?.id && e.active !== 0 && (!q || e.name.toLowerCase().startsWith(q)));
  }, [companyEmployees, employeeSearch, user?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ─── Header: back + outbound number ─── */}
      <View style={[styles.convHeader, { paddingTop: insets.top + 6, backgroundColor: c.card, borderBottomColor: c.cardBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.headerBackBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
            <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor={c.text} />
          </Pressable>

          {callableNumbers.length === 0 ? (
            <Text style={{ color: c.danger, fontWeight: '600' }}>No outbound numbers</Text>
          ) : (
            <Pressable
              onPress={() => callableNumbers.length > 1 && setPickerOpen((v) => !v)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: c.inputBg, flexShrink: 1 },
                pressed && callableNumbers.length > 1 && { opacity: 0.7 },
              ]}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fromNumber?.color || c.success }} />
              <Text numberOfLines={1} style={{ color: c.text, fontWeight: '600', flexShrink: 1 }}>
                {fromNumber?.description || formatPhoneNumber(fromNumber?.phone)}
                {fromNumber?.description ? <Text style={{ color: c.textMuted, fontWeight: '400' }}>{'  ' + formatPhoneNumber(fromNumber.phone)}</Text> : null}
              </Text>
              {callableNumbers.length > 1 && (
                <SymbolView name={{ ios: pickerOpen ? 'chevron.up' : 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={12} tintColor={c.textMuted} />
              )}
            </Pressable>
          )}
        </View>

        {pickerOpen && (
          <View style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden', backgroundColor: c.bg }}>
            {callableNumbers.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => selectFrom(p.id)}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }, pressed && { opacity: 0.6 }]}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color || c.success }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600' }}>{p.description || formatPhoneNumber(p.phone)}</Text>
                  {p.description ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{formatPhoneNumber(p.phone)}</Text> : null}
                </View>
                {p.id === fromNumber?.id && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={16} tintColor={c.success} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ─── Number display / employee search ───
          В режиме клавиатуры поле занимает всё место между шапкой и клавиатурой
          и стоит по его центру. */}
      <View style={[{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: showEmployees ? 20 : 6 }, showEmployees ? { minHeight: 84 } : { flex: 1 }]}>
        {showEmployees ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
            <View style={[styles.searchInputRow, { flex: 1, backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={c.textMuted} />
              <TextInput
                value={employeeSearch}
                onChangeText={setEmployeeSearch}
                placeholder="Search employee..."
                placeholderTextColor={c.textFaint}
                autoFocus
                autoCorrect={false}
                style={[styles.searchInput, { color: c.text }]}
              />
            </View>
            <Pressable onPress={() => setShowEmployees(false)} hitSlop={8} style={({ pressed }) => [styles.headerIconBtn, { backgroundColor: c.card }, pressed && { opacity: 0.6 }]}>
              <SymbolView name={{ ios: 'circle.grid.3x3.fill', android: 'dialpad', web: 'dialpad' }} size={18} tintColor={c.textMuted} />
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
            {/* Пустое место слева той же ширины, что кнопка справа, — чтобы номер стоял ровно по центру */}
            <View style={{ width: 36 }} />
            {/* Настоящее поле ввода, но без системной клавиатуры — набирают своей.
                Ради стандартного меню iOS «Вставить»: нажатие на поле с курсором его
                показывает, и вставка не спрашивает разрешения на доступ к буферу. */}
            <TextInput
              value={number ? formatProgressive(number) : ''}
              onChangeText={(text) => setNumber(normalizeTyped(text))}
              placeholder="Enter number..."
              placeholderTextColor={c.textFaint}
              showSoftInputOnFocus={false}
              autoFocus
              autoCorrect={false}
              spellCheck={false}
              textAlign="center"
              selectionColor={c.primary}
              // Полный номер чуть мельче, чтобы «(754) 226-4666» целиком влезал и на узком экране
              style={{ flex: 1, fontSize: !number ? 32 : number.length >= 10 ? 34 : 38, fontWeight: '300', color: c.text, paddingVertical: 8, paddingHorizontal: 0 }}
            />
            {number ? (
              <Pressable onPress={() => setNumber('')} hitSlop={10} style={{ width: 36, alignItems: 'center' }}>
                <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={22} tintColor={c.textFaint} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setShowEmployees(true)}
                hitSlop={10}
                style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card }, pressed && { opacity: 0.6 }]}
              >
                <SymbolView name={{ ios: 'person.2.fill', android: 'group', web: 'group' }} size={22} tintColor={c.textMuted} />
              </Pressable>
            )}
          </View>
        )}
        {!connected && !showEmployees && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <ActivityIndicator size="small" color={c.textMuted} />
            <Text style={{ color: c.textMuted, fontSize: 12 }}>Connecting to telephony…</Text>
          </View>
        )}
      </View>

      {showEmployees ? (
        <FlatList
          data={employees}
          keyExtractor={(e) => String(e.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 8 }}
          ListEmptyComponent={
            <Text style={{ color: c.textMuted, textAlign: 'center', marginTop: 40 }}>{employeeSearch ? 'No employees matching search' : 'No other employees found'}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => callEmployee(item)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: item.color || c.primary }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{item.name.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 13 }}>{item.phone ? formatPhoneNumber(item.phone) : 'No phone'}</Text>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: item.phone ? 'rgba(16,185,129,0.15)' : c.inputBg }}>
                <SymbolView name={{ ios: 'phone.fill', android: 'call', web: 'call' }} size={15} tintColor={item.phone ? c.success : c.textFaint} />
              </View>
            </Pressable>
          )}
        />
      ) : (
        <View style={{ paddingBottom: insets.bottom + 20 }}>
          {/* ─── Keypad ─── */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 30, rowGap: 14 }}>
            {KEYPAD.map(({ digit, letters }) => (
              <View key={digit} style={{ width: '33.33%', alignItems: 'center' }}>
                <Pressable
                  onPress={() => press(digit)}
                  style={({ pressed }) => [
                    { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.inputBg : c.card },
                  ]}
                >
                  <Text style={{ fontSize: 30, fontWeight: '300', color: c.text, lineHeight: 34 }}>{digit}</Text>
                  <Text style={{ fontSize: 10, letterSpacing: 2, color: c.textMuted, height: 12 }}>{letters}</Text>
                </Pressable>
              </View>
            ))}
          </View>

          {/* ─── SMS · Call · Backspace ─── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 48, marginTop: 22 }}>
            <Pressable
              onPress={openSms}
              disabled={!canOpenSms}
              style={({ pressed }) => [
                { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card, opacity: canOpenSms ? 1 : 0.4 },
                pressed && { opacity: 0.6 },
              ]}
            >
              {openingSms ? (
                <ActivityIndicator color={c.text} />
              ) : (
                <SymbolView name={{ ios: 'message.fill', android: 'sms', web: 'sms' }} size={22} tintColor={c.text} />
              )}
            </Pressable>

            <Pressable
              onPress={() => call(number)}
              disabled={!canCall}
              style={({ pressed }) => [
                { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E', opacity: canCall ? 1 : 0.4 },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              {calling ? <ActivityIndicator color="#fff" /> : <SymbolView name={{ ios: 'phone.fill', android: 'call', web: 'call' }} size={30} tintColor="#fff" />}
            </Pressable>

            {/* Ширина как у SMS — чтобы кнопка звонка оставалась по центру */}
            <View style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
              {number ? (
                <Pressable onPress={() => setNumber((prev) => prev.slice(0, -1))} onLongPress={() => setNumber('')} hitSlop={10}>
                  <SymbolView name={{ ios: 'delete.left.fill', android: 'backspace', web: 'backspace' }} size={26} tintColor={c.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
