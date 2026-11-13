import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TelnyxCallState, VoicePnBridge, type Call } from '@telnyx/react-voice-commons-sdk';
import { API_URL } from '@/constants/Config';
import { CompanyPhone, useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useColorScheme } from '@/components/useColorScheme';
import { callsPalette } from '@/components/calls/styles';
import { formatClock } from '@/components/calls/helpers';
import { customerNumberOf, findCustomerName, formatPhoneForDisplay } from '@/utils/callerLabel.ios';
import { useActiveCall, useCallSeconds } from '@/hooks/useActiveCall.ios';

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/** Диалог для только что начатого звонка бэкенд может ещё не завести — как в вебе, ждём и пробуем снова. */
const CONVERSATION_LOOKUP_ATTEMPTS = 4;
const CONVERSATION_LOOKUP_DELAY_MS = 1200;

const last10 = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '').slice(-10);

/** Наш номер во входящем: бэкенд кладёт его в X-Company-Number, как и для веб-софтфона. */
function companyNumberOf(call: Call): string | null {
  return call.inviteCustomHeaders?.find((h) => h.name.toLowerCase() === 'x-company-number')?.value ?? null;
}

function statusText(state: TelnyxCallState | null, seconds: number): string {
  switch (state) {
    case TelnyxCallState.ACTIVE:
      return formatClock(seconds);
    case TelnyxCallState.HELD:
      return 'On hold';
    case TelnyxCallState.CONNECTING:
      return 'Connecting…';
    case TelnyxCallState.ENDED:
    case TelnyxCallState.FAILED:
      return 'Call ended';
    default:
      return 'Calling…';
  }
}

/**
 * Экран идущего разговора. Для исходящего VoIP-звонка iOS полноэкранного
 * системного экрана не показывает, поэтому свой: кто на линии, с какого номера
 * компании звоним, таймер и кнопки «без звука», «динамик», тоновый набор, запись,
 * переход к диалогу с этим номером и «завершить» — как виджет звонка в вебе.
 */
export default function ActiveCallView({ fromPhoneId }: { fromPhoneId?: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, companyPhones } = useAuth();
  const { showToast } = useToast();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;

  // Звонок и его состояние — общие для всего приложения: экран закрывают и
  // открывают посреди разговора (плашка «вернуться к звонку»), а таймер считает
  // от начала разговора, а не от открытия экрана.
  const { call, state: liveState } = useActiveCall();
  const seconds = useCallSeconds(call, liveState);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dtmf, setDtmf] = useState('');
  const [name, setName] = useState<string | null>(null);
  const hadCall = useRef(!!call);
  if (call) hadCall.current = true;
  const state = !call && hadCall.current ? TelnyxCallState.ENDED : liveState;

  // Звонок закончился — показываем «Call ended» и через секунду возвращаемся назад
  useEffect(() => {
    if (call || !hadCall.current) return;
    const t = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/calls' as any)), 1000);
    return () => clearTimeout(t);
  }, [call, router]);

  useEffect(() => {
    if (!call) return;
    const sub = call.isMuted$.subscribe(setMuted);
    return () => sub.unsubscribe();
  }, [call]);

  // Маршрут звука может смениться и в обход кнопки (системное меню, наушники) —
  // кнопка «Speaker» показывает то, что есть на самом деле.
  useEffect(() => {
    VoicePnBridge.isSpeakerEnabled().then(setSpeaker).catch(() => {});
    return VoicePnBridge.addSpeakerStateListener(setSpeaker);
  }, []);

  const number = call ? (call.isIncoming ? customerNumberOf(call) : call.destination) : null;

  // Имя клиента — тем же поиском, что веб и экран входящего
  useEffect(() => {
    if (!number || !token) return;
    let cancelled = false;
    findCustomerName(number, token).then((n) => !cancelled && setName(n));
    return () => {
      cancelled = true;
    };
  }, [number, token]);

  // Линия звонка: для исходящего — номер, выбранный в диалере, для входящего — тот, на который звонили
  const headerLine = call?.isIncoming ? last10(companyNumberOf(call)) : '';
  const fromPhone: CompanyPhone | undefined =
    companyPhones.find((p) => p.id === fromPhoneId) ?? (headerLine ? companyPhones.find((p) => last10(p.phone) === headerLine) : undefined);
  const ended = state === TelnyxCallState.ENDED || state === TelnyxCallState.FAILED;

  // ID звонка в Call Control: у исходящего Telnyx присылает его в момент ответа,
  // у входящего — сразу в приглашении. Без него записью не управлять.
  const callControlId: string | null = (call?.telnyxCall as any)?.telnyxCallControlId ?? null;

  // У номера с автозаписью разговор пишется сам — кнопка просто загорается, чтобы
  // было видно, что идёт запись; нажатием её можно выключить (как в вебе).
  const autoRecord = !!fromPhone?.auto_record_calls;
  const [recording, setRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  useEffect(() => {
    if (callControlId) setRecording(autoRecord);
  }, [autoRecord, callControlId]);

  const toggleRecording = async () => {
    if (!callControlId || !token || recordingBusy) return;
    const next = !recording;
    setRecordingBusy(true);
    try {
      const response = await fetch(`${API_URL}/telephony/recording/${next ? 'start' : 'stop'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ callControlId }),
      });
      if (!response.ok) throw new Error();
      setRecording(next);
      showToast({ message: next ? 'Recording started' : 'Recording stopped', type: 'success' });
    } catch {
      showToast({ message: 'Failed to toggle recording', type: 'error' });
    } finally {
      setRecordingBusy(false);
    }
  };

  // Диалог этого клиента на этой же нашей линии. Открывается поверх экрана
  // разговора: звонок идёт дальше, «назад» возвращает к нему.
  const [openingConversation, setOpeningConversation] = useState(false);
  const openConversation = async () => {
    if (openingConversation || !token) return;
    if (!number || !fromPhone) {
      showToast({ message: 'Cannot open conversation: phone number is missing', type: 'error' });
      return;
    }
    setOpeningConversation(true);
    try {
      const query = `customer_phone=${encodeURIComponent(number)}&company_phone=${encodeURIComponent(fromPhone.phone)}`;
      for (let attempt = 0; attempt < CONVERSATION_LOOKUP_ATTEMPTS; attempt++) {
        const response = await fetch(`${API_URL}/calls/conversation/lookup?${query}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (response.ok) {
          const body = await response.json();
          if (body?.conversation_id) {
            router.push(`/conversation/${body.conversation_id}` as any);
            return;
          }
        } else if (response.status !== 404) {
          throw new Error();
        }
        // 404 — диалог ещё не создан: ждём и пробуем снова
        if (attempt < CONVERSATION_LOOKUP_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, CONVERSATION_LOOKUP_DELAY_MS));
      }
      showToast({ message: 'This call is still being registered. Try again in a few seconds.', type: 'error' });
    } catch {
      showToast({ message: 'Failed to open conversation', type: 'error' });
    } finally {
      setOpeningConversation(false);
    }
  };

  // Кнопку переключаем сразу, а потом сверяемся с реальным маршрутом звука:
  // при выключении нативная часть возвращает «не удалось», хотя звук уже ушёл
  // в разговорный динамик, — по её ответу кнопка оставалась бы гореть.
  const toggleSpeaker = async () => {
    const next = !speaker;
    setSpeaker(next);
    await VoicePnBridge.setSpeakerEnabled(next).catch(() => false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const actual = await VoicePnBridge.isSpeakerEnabled().catch(() => next);
    setSpeaker(actual);
  };

  const sendDtmf = (key: string) => {
    setDtmf((prev) => (prev + key).slice(-20));
    call?.dtmf(key).catch(() => {});
  };

  const control = (
    icon: string,
    label: string,
    active: boolean,
    onPress: () => void,
    androidIcon: string,
    opts: { disabled?: boolean; busy?: boolean; activeColor?: string } = {},
  ) => {
    const disabled = !call || ended || !!opts.disabled;
    const activeBg = opts.activeColor ?? c.text;
    return (
      <View style={{ alignItems: 'center', gap: 8, width: 90 }}>
        <Pressable
          onPress={onPress}
          disabled={disabled || opts.busy}
          style={({ pressed }) => [
            { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? activeBg : c.card, opacity: disabled ? 0.4 : 1 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {opts.busy ? (
            <ActivityIndicator color={active ? '#fff' : c.text} />
          ) : (
            <SymbolView
              name={{ ios: icon as any, android: androidIcon as any, web: androidIcon as any }}
              size={26}
              tintColor={active ? (opts.activeColor ? '#fff' : c.bg) : c.text}
            />
          )}
        </Pressable>
        <Text style={{ color: c.textMuted, fontSize: 12 }}>{label}</Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30, alignItems: 'center' }}>
      {/* ─── Who ─── */}
      <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 30, fontWeight: '600', color: c.text, textAlign: 'center' }} numberOfLines={2}>
          {name || (number ? formatPhoneForDisplay(number) : '')}
        </Text>
        {name && number ? <Text style={{ fontSize: 16, color: c.textMuted }}>{formatPhoneForDisplay(number)}</Text> : null}
        <Text style={{ fontSize: 18, color: c.textSecondary, marginTop: 6, fontVariant: ['tabular-nums'] }}>{statusText(state, seconds)}</Text>
        {fromPhone && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fromPhone.color || c.success }} />
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{fromPhone.description || formatPhoneForDisplay(fromPhone.phone)}</Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, justifyContent: 'center', width: '100%' }}>
        {showKeypad ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: c.text, fontSize: 24, height: 32, marginBottom: 8 }}>{dtmf}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 270, rowGap: 12 }}>
              {DTMF_KEYS.map((k) => (
                <View key={k} style={{ width: 90, alignItems: 'center' }}>
                  <Pressable
                    onPress={() => sendDtmf(k)}
                    style={({ pressed }) => [{ width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.inputBg : c.card }]}
                  >
                    <Text style={{ fontSize: 28, fontWeight: '300', color: c.text }}>{k}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={{ gap: 22 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {control(muted ? 'mic.slash.fill' : 'mic.slash', 'Mute', muted, () => call?.toggleMute().catch(() => {}), 'mic_off')}
              {control('speaker.wave.2.fill', 'Speaker', speaker, toggleSpeaker, 'volume_up')}
              {control('circle.grid.3x3.fill', 'Keypad', false, () => setShowKeypad(true), 'dialpad')}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {/* Записью можно управлять, только когда у звонка есть ID в Call Control — после ответа */}
              {control('record.circle', recording ? 'Recording' : 'Record', recording, toggleRecording, 'fiber_manual_record', {
                disabled: !callControlId,
                busy: recordingBusy,
                activeColor: c.danger,
              })}
              {control('bubble.left.and.bubble.right.fill', 'Conversation', false, openConversation, 'forum', {
                disabled: !fromPhone || !number,
                busy: openingConversation,
              })}
            </View>
          </View>
        )}
      </View>

      {/* ─── End / hide keypad ─── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <Pressable
          onPress={() => (call && !ended ? call.hangup().catch(() => {}) : router.back())}
          style={({ pressed }) => [
            { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444' },
            pressed && { transform: [{ scale: 0.95 }] },
          ]}
        >
          <SymbolView name={{ ios: 'phone.down.fill', android: 'call_end', web: 'call_end' }} size={32} tintColor="#fff" />
        </Pressable>
        {showKeypad && (
          <Pressable onPress={() => setShowKeypad(false)} hitSlop={10} style={{ position: 'absolute', right: 48 }}>
            <Text style={{ color: c.text, fontSize: 16 }}>Hide</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
