import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '@/constants/Config';
import { CompanyPhone, useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import { formatPhoneNumber } from '@/components/calls/helpers';

interface CallFlowOption {
  id: string;
  name: string;
}
interface PhoneCallFlowAssignment {
  phoneId: string;
  flowId: string;
}

/**
 * Per-number settings. The number is picked from the chips on top; everything below
 * is a section list so more settings can be added per line later without reshaping
 * the screen. Only the call flow section exists for now.
 */
export default function PhoneSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, companyPhones } = useAuth();
  const { showToast } = useToast();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;

  // Primary line first — that's what the dispatcher usually means by "our number"
  const orderedPhones = useMemo(() => [...companyPhones].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary)), [companyPhones]);
  const [selectedId, setSelectedId] = useState<number | null>(orderedPhones[0]?.id ?? null);
  const phone: CompanyPhone | undefined = orderedPhones.find((p) => p.id === selectedId) ?? orderedPhones[0];

  const [flows, setFlows] = useState<CallFlowOption[]>([]);
  const [assignments, setAssignments] = useState<PhoneCallFlowAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draftFlowId, setDraftFlowId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const headers = useMemo(() => ({ 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }), [token]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [flowsRes, assignRes] = await Promise.all([fetch(`${API_URL}/call-flows`, { headers }), fetch(`${API_URL}/call-flows/assignments`, { headers })]);
      if (!flowsRes.ok || !assignRes.ok) throw new Error(`Server returned status code ${flowsRes.ok ? assignRes.status : flowsRes.status}`);
      setFlows(await flowsRes.json());
      setAssignments(await assignRes.json());
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load call flows.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  // Switching numbers resets the draft to what the server has for that line
  const savedFlowId = phone ? assignments.find((a) => a.phoneId === String(phone.id))?.flowId ?? '' : '';
  useEffect(() => {
    setDraftFlowId(savedFlowId);
  }, [savedFlowId, phone?.id]);

  // A number without a provider isn't routed through our telephony — a flow would never run
  const managed = !!phone?.provider;
  const isDirty = draftFlowId !== savedFlowId;

  const save = async () => {
    if (!phone || !token || saving || !isDirty) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/call-flows/assignments/${phone.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId: draftFlowId || null }),
      });
      if (!r.ok) {
        let message = `Server returned status code ${r.status}`;
        try {
          const data = await r.json();
          if (data?.message) message = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        } catch {}
        throw new Error(message);
      }
      setAssignments(await r.json());
      showToast({ message: 'Call flow updated', type: 'success' });
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to update call flow.');
    } finally {
      setSaving(false);
    }
  };

  const currentFlowName = flows.find((f) => f.id === savedFlowId)?.name;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ─── Header ─── */}
      <View style={[styles.convHeader, { paddingTop: insets.top + 6, backgroundColor: c.card, borderBottomColor: c.cardBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.headerBackBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
            <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor={c.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>Phone Settings</Text>
            <Text style={{ fontSize: 12, color: c.textMuted }}>Per-line configuration</Text>
          </View>
        </View>

        {/* Number picker */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 4 }}>
          {orderedPhones.map((p) => {
            const active = p.id === phone?.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setSelectedId(p.id)}
                style={({ pressed }) => [
                  styles.phoneChip,
                  { backgroundColor: active ? c.primary : c.bg, borderColor: active ? c.primary : c.cardBorder },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color || '#888', borderWidth: active ? 1 : 0, borderColor: '#fff' }} />
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : c.text }} numberOfLines={1}>
                    {p.description || 'Company number'}
                    {p.is_primary ? ' ★' : ''}
                  </Text>
                  <Text style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.8)' : c.textMuted }}>{formatPhoneNumber(p.phone)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── Sections ─── */}
      {!phone ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: c.textMuted }}>No company numbers configured.</Text>
        </View>
      ) : loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <Text style={{ color: c.textMuted, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={load} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: c.primary }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
          {/* ═══ Call flow ═══ */}
          <View style={[styles.settingsCard, { backgroundColor: c.card, borderColor: c.cardBorder, opacity: managed ? 1 : 0.55 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <View style={[styles.settingsIcon, { backgroundColor: c.primaryMuted }]}>
                <SymbolView name={{ ios: 'arrow.triangle.branch', android: 'account_tree', web: 'account_tree' }} size={15} tintColor={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>Call Flow</Text>
                <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={2}>
                  {managed
                    ? currentFlowName
                      ? `Answering with “${currentFlowName}”`
                      : 'No call flow assigned — calls ring straight through'
                    : 'Not available: this number isn’t managed by our telephony, so call flows don’t apply.'}
                </Text>
              </View>
            </View>

            {managed && (
              <>
                <View style={{ height: 1, backgroundColor: c.divider, marginVertical: 8 }} />
                {flows.length === 0 ? (
                  <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 6 }}>
                    No call flows yet — create one in the web app under Calls → Settings.
                  </Text>
                ) : (
                  <View style={{ gap: 2 }}>
                    {flows.map((f) => (
                      <FlowRow key={f.id} label={f.name} selected={draftFlowId === f.id} onPress={() => setDraftFlowId(f.id)} c={c} />
                    ))}
                    {/* "None" is an opt-out, not a flow — centred and faded so it reads as a secondary choice */}
                    <Pressable
                      onPress={() => setDraftFlowId('')}
                      style={({ pressed }) => [
                        styles.phoneFilterRow,
                        { justifyContent: 'center', marginTop: 4, opacity: draftFlowId === '' ? 0.85 : 0.5, borderWidth: 1, borderStyle: 'dashed', borderColor: draftFlowId === '' ? c.primary : c.divider },
                        pressed && { opacity: 0.4 },
                      ]}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: draftFlowId === '' ? c.primary : c.textMuted }}>
                        {draftFlowId === '' ? '✓  ' : ''}No call flow — ring the line directly
                      </Text>
                    </Pressable>
                  </View>
                )}

                <Pressable
                  onPress={save}
                  disabled={!isDirty || saving}
                  style={({ pressed }) => [styles.settingsSaveBtn, { backgroundColor: isDirty ? c.primary : c.inputBg }, pressed && isDirty && { opacity: 0.85 }]}
                >
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: isDirty ? '#fff' : c.textFaint }}>{isDirty ? 'Save changes' : 'Saved'}</Text>}
                </Pressable>
              </>
            )}
          </View>

          {/* Future per-number sections (recording, greeting, business hours, …) go here */}
        </ScrollView>
      )}
    </View>
  );
}

function FlowRow({ label, hint, selected, onPress, c }: { label: string; hint?: string; selected: boolean; onPress: () => void; c: typeof callsPalette.light }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.phoneFilterRow, selected && { backgroundColor: c.primaryMuted }, pressed && { opacity: 0.7 }]}>
      <View style={[styles.radio, { borderColor: selected ? c.primary : c.divider }]}>{selected && <View style={[styles.radioDot, { backgroundColor: c.primary }]} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '600', color: c.text }} numberOfLines={1}>{label}</Text>
        {!!hint && <Text style={{ fontSize: 12, color: c.textMuted }}>{hint}</Text>}
      </View>
    </Pressable>
  );
}
