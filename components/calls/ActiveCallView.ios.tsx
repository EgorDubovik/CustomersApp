import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TelnyxCallState, VoicePnBridge, type Call } from '@telnyx/react-voice-commons-sdk';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/components/useColorScheme';
import { callsPalette } from '@/components/calls/styles';
import { formatClock } from '@/components/calls/helpers';
import { customerNumberOf, findCustomerName, formatPhoneForDisplay } from '@/utils/callerLabel.ios';
import { voipClient } from '@/utils/voipCalls.ios';

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

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
 * компании звоним, таймер и кнопки «без звука», «динамик», тоновый набор, «завершить».
 */
export default function ActiveCallView({ fromPhoneId }: { fromPhoneId?: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, companyPhones } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? callsPalette.dark : callsPalette.light;

  const [call, setCall] = useState<Call | null>(voipClient.currentActiveCall);
  const [state, setState] = useState<TelnyxCallState | null>(call?.currentState ?? null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dtmf, setDtmf] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const hadCall = useRef(!!call);

  useEffect(() => {
    const sub = voipClient.activeCall$.subscribe((next) => {
      if (next) hadCall.current = true;
      setCall(next);
    });
    return () => sub.unsubscribe();
  }, []);

  // Звонок закончился — показываем «Call ended» и через секунду возвращаемся назад
  useEffect(() => {
    if (call || !hadCall.current) return;
    setState(TelnyxCallState.ENDED);
    const t = setTimeout(() => router.back(), 1000);
    return () => clearTimeout(t);
  }, [call, router]);

  useEffect(() => {
    if (!call) return;
    const subs = [call.callState$.subscribe(setState), call.isMuted$.subscribe(setMuted)];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [call]);

  useEffect(() => {
    if (state !== TelnyxCallState.ACTIVE) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

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

  const fromPhone = companyPhones.find((p) => p.id === fromPhoneId);
  const ended = state === TelnyxCallState.ENDED || state === TelnyxCallState.FAILED;

  const toggleSpeaker = async () => {
    const next = !speaker;
    const ok = await VoicePnBridge.setSpeakerEnabled(next).catch(() => false);
    if (ok) setSpeaker(next);
  };

  const sendDtmf = (key: string) => {
    setDtmf((prev) => (prev + key).slice(-20));
    call?.dtmf(key).catch(() => {});
  };

  const control = (icon: string, label: string, active: boolean, onPress: () => void, androidIcon: string) => (
    <View style={{ alignItems: 'center', gap: 8, width: 90 }}>
      <Pressable
        onPress={onPress}
        disabled={!call || ended}
        style={({ pressed }) => [
          { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.text : c.card },
          pressed && { opacity: 0.7 },
        ]}
      >
        <SymbolView name={{ ios: icon as any, android: androidIcon as any, web: androidIcon as any }} size={26} tintColor={active ? c.bg : c.text} />
      </Pressable>
      <Text style={{ color: c.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );

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
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {control(muted ? 'mic.slash.fill' : 'mic.slash', 'Mute', muted, () => call?.toggleMute().catch(() => {}), 'mic_off')}
            {control('speaker.wave.2.fill', 'Speaker', speaker, toggleSpeaker, 'volume_up')}
            {control('circle.grid.3x3.fill', 'Keypad', false, () => setShowKeypad(true), 'dialpad')}
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
