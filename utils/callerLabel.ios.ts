import { CallKit, callKitCoordinator, type Call } from '@telnyx/react-voice-commons-sdk';
import { API_URL } from '../constants/Config';

/**
 * Что показать на системном экране входящего (CallKit).
 *
 * Сразу из пуша там номер в виде `+1 954-997-8606`: Telnyx не пропускает скобки
 * в имени звонящего, а показать экран iOS требует до загрузки JS. Как только
 * звонок дошёл до приложения, переписываем экран: номер в привычном виде
 * `+1 (954) 997-8606`, а если звонящий есть в CRM — его имя, как в вебе.
 */

/** `+1 (954) 997-8606` для североамериканских номеров, остальные — как пришли. */
export function formatPhoneForDisplay(number: string): string {
  const digits = number.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.length === 10 ? digits : null;
  if (!national) return number;
  return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/** Номер звонящего: бэкенд кладёт его в X-Customer-Number, как и для веб-софтфона. */
function customerNumberOf(call: Call): string | null {
  const header = call.inviteCustomHeaders?.find((h) => h.name.toLowerCase() === 'x-customer-number');
  return header?.value || call.callerNumber || null;
}

/**
 * CallKit UUID звонка. Связь «звонок ↔ экран» SDK заводит чуть позже, чем звонок
 * появляется в activeCall$, поэтому немного ждём.
 */
async function callKitUuidOf(call: Call, attempts = 10, delayMs = 200): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const uuid = callKitCoordinator.getCallKitUUID(call.telnyxCall);
    if (uuid) return uuid;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

/** Имя клиента по номеру — тот же поиск, что делает веб-софтфон при входящем. */
async function findCustomerName(number: string, authToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/customers?search=${encodeURIComponent(number)}`, {
      headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const body = await response.json();
    const customer = (body?.data ?? body ?? [])[0];
    if (!customer) return null;

    const name = customer.name || `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim();
    return name || null;
  } catch (e) {
    console.warn('[voip] Caller lookup failed', e);
    return null;
  }
}

/**
 * Подписывает входящий на экране звонка. Номер форматируется всегда; имя ищется,
 * только если есть сессия: если приложение разбудил пуш при заблокированном
 * телефоне, хранилище с токеном может быть ещё недоступно — тогда останется номер.
 */
export async function labelIncomingCall(call: Call, authToken: string | null): Promise<void> {
  const number = customerNumberOf(call);
  if (!number) return;

  const uuid = await callKitUuidOf(call);
  if (!uuid) return;

  const formatted = formatPhoneForDisplay(number);
  await CallKit.updateCall(uuid, formatted, formatted).catch(() => false);

  if (!authToken) return;

  const name = await findCustomerName(number, authToken);
  // Звонок мог закончиться, пока искали: обновлять уже нечего.
  if (name && callKitCoordinator.getWebRTCCall(uuid)) {
    await CallKit.updateCall(uuid, name, formatted).catch(() => false);
  }
}
