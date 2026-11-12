import { TelnyxVoiceApp } from '@telnyx/react-voice-commons-sdk';
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { labelIncomingCall } from '../utils/callerLabel.ios';
import { startVoipCalls, voipClient } from '../utils/voipCalls.ios';

/**
 * Подключает телефон к телефонии Telnyx, чтобы входящие звонки приходили
 * экраном CallKit, даже когда приложение закрыто.
 *
 * Только для админов и диспетчеров — тех же, кому в вебе доступен софтфон
 * (canUseTelephony). Техникам звонки клиентов не идут.
 *
 * TelnyxVoiceApp держит соединение в такт жизни приложения: в фоне отключается
 * (звонок тогда приходит пушем), на переднем плане подключается снова.
 */
export function VoipCallsProvider({ children }: { children: React.ReactNode }) {
  const { token, isStaff } = useAuth();
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!token || !isStaff) return;
    startVoipCalls(token).catch((e) => console.warn('[voip] Could not enable incoming calls', e));
  }, [token, isStaff]);

  // Входящий дошёл до приложения — подписываем его на экране звонка (номер в
  // привычном виде, имя клиента из CRM). activeCall$ повторяет тот же звонок при
  // каждой смене состояния, поэтому каждый подписываем один раз.
  const labelled = useRef(new Set<string>());
  useEffect(() => {
    const subscription = voipClient.activeCall$.subscribe((call) => {
      if (!call?.isIncoming || labelled.current.has(call.callId)) return;
      labelled.current.add(call.callId);
      labelIncomingCall(call, tokenRef.current).catch((e) => console.warn('[voip] Could not label the call', e));
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <TelnyxVoiceApp voipClient={voipClient} debug={__DEV__}>
      {children}
    </TelnyxVoiceApp>
  );
}
