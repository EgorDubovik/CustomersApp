import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TelnyxCallState } from '@telnyx/react-voice-commons-sdk';
import { useAuth } from '../context/AuthContext';
import { formatClock } from './calls/helpers';
import { ACTIVE_CALL_ROUTE, useActiveCall, useCallSeconds } from '../hooks/useActiveCall.ios';
import { customerNumberOf, findCustomerName, formatPhoneForDisplay } from '../utils/callerLabel.ios';

/**
 * Зелёная плашка «вернуться к звонку» поверх всех экранов, пока идёт разговор и
 * открыт не экран разговора: во время звонка смотрят карточку клиента, историю,
 * расписание — и одним нажатием возвращаются к звонку.
 */
export function ActiveCallBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { call, state } = useActiveCall();
  const seconds = useCallSeconds(call, state);
  const [name, setName] = useState<string | null>(null);

  const number = call ? (call.isIncoming ? customerNumberOf(call) : call.destination) : null;

  useEffect(() => {
    setName(null);
    if (!number || !token) return;
    let cancelled = false;
    findCustomerName(number, token).then((n) => !cancelled && setName(n));
    return () => {
      cancelled = true;
    };
  }, [number, token]);

  const live = state === TelnyxCallState.ACTIVE || state === TelnyxCallState.HELD || state === TelnyxCallState.RINGING;
  if (!call || !live || pathname === ACTIVE_CALL_ROUTE) return null;

  const status = state === TelnyxCallState.ACTIVE ? formatClock(seconds) : state === TelnyxCallState.HELD ? 'On hold' : 'Calling…';

  return (
    <Pressable
      onPress={() => router.push(ACTIVE_CALL_ROUTE as any)}
      style={({ pressed }) => ({
        position: 'absolute',
        // Внизу, над панелью вкладок: сверху плашка закрывала бы шапку и кнопку «Назад»
        bottom: insets.bottom + 58,
        left: 12,
        right: 12,
        zIndex: 1000,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: '#16A34A',
        opacity: pressed ? 0.85 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      })}
    >
      <SymbolView name={{ ios: 'phone.fill', android: 'call', web: 'call' }} size={16} tintColor="#fff" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>
          {name || (number ? formatPhoneForDisplay(number) : 'Call')}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>Tap to return to call</Text>
      </View>
      <Text style={{ color: '#fff', fontWeight: '600', fontVariant: ['tabular-nums'] }}>{status}</Text>
    </Pressable>
  );
}
