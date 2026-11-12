import { TelnyxVoiceApp } from '@telnyx/react-voice-commons-sdk';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
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

  useEffect(() => {
    if (!token || !isStaff) return;
    startVoipCalls(token).catch((e) => console.warn('[voip] Could not enable incoming calls', e));
  }, [token, isStaff]);

  return (
    <TelnyxVoiceApp voipClient={voipClient} debug={__DEV__}>
      {children}
    </TelnyxVoiceApp>
  );
}
