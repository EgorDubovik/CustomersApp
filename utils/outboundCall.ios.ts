import { TelnyxConnectionState } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from './voipCalls.ios';

/**
 * Исходящий звонок с номера компании — как в веб-софтфоне: звонит сам SIP-клиент
 * (мобильный логин сотрудника), Telnyx подставляет выбранный номер компании как
 * номер звонящего. Бэкенд в исходящем только ведёт журнал и запись, а кто звонит,
 * узнаёт из заголовка X-Dispatcher-Id — в вебхуке есть одни номера.
 */

export const outboundCallsSupported = true;

/** E.164 для номера, набранного на клавиатуре (до 10 цифр, США), — как в вебе. */
export function toDialableNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+1${digits.slice(-10)}`;
}

/** Номера компании лежат в разных форматах; Telnyx примет только E.164. */
export function toCallerId(companyPhone: string): string {
  return `+1${companyPhone.replace(/\D/g, '').slice(-10)}`;
}

/** Подключён ли телефон к Telnyx прямо сейчас — без этого позвонить нельзя. */
export function subscribeToConnection(onChange: (connected: boolean) => void): () => void {
  const subscription = voipClient.connectionState$.subscribe((state) => onChange(state === TelnyxConnectionState.CONNECTED));
  return () => subscription.unsubscribe();
}

export async function placeOutboundCall(destination: string, companyPhone: string, userId: number | undefined): Promise<void> {
  await voipClient.newCall(
    toDialableNumber(destination),
    undefined,
    toCallerId(companyPhone),
    userId ? { 'X-Dispatcher-Id': String(userId) } : undefined,
  );
}
