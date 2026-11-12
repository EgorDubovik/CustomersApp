import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createCredentialConfig,
  createTelnyxVoipClient,
  TelnyxConnectionState,
  TelnyxVoipClient,
  VoicePnBridge,
} from '@telnyx/react-voice-commons-sdk';
import Constants from 'expo-constants';
import { API_URL } from '../constants/Config';
import * as storage from './storage';

/**
 * Входящие звонки на iPhone: телефон входит в Telnyx своим SIP-логином
 * (`?device=mobile`), отдельным от софтфона в браузере, а сценарий звонит сразу
 * на оба. Отдельный — потому что, пока у логина есть живая сессия во вкладке,
 * Telnyx шлёт вызов только в неё и спящий телефон пушем не будит (проверено,
 * `pushWhenActive` не помогает). Экран звонка (CallKit) показывает нативная часть SDK.
 *
 * Android сюда не входит: там push нужен через FCM, это отдельная задача
 * (см. voipCalls.ts — заглушка для остальных платформ).
 */
export const voipClient = createTelnyxVoipClient({ enableAppStateManagement: true, debug: __DEV__ });

/** Наш VoIP-токен, отданный бэкенду: по нему же и удаляем при выходе. */
const VOIP_TOKEN_KEY = 'voip_push_token';

/** Где SDK хранит вход для пробуждения пушем. Своего «забыть» у SDK нет. */
const TELNYX_STORED_KEYS = ['@telnyx_username', '@telnyx_password', '@credential_token', '@push_token'];
const TELNYX_STORED_USERNAME = '@telnyx_username';

/** Ждём подключения к Telnyx, но не дольше `timeoutMs`: выход не должен виснуть без сети. */
function waitForConnected(timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const subscription = voipClient.connectionState$.subscribe((state) => {
      if (state === TelnyxConnectionState.CONNECTED) finish(true);
    });
  });
}

/**
 * PushKit выдаёт токен асинхронно после старта, и при первом запуске он может
 * прийти позже, чем JS дойдёт до входа. Без токена Telnyx не узнает, куда слать
 * пуш, поэтому немного ждём.
 */
async function waitForVoipToken(attempts = 10, delayMs = 1000): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const token = await VoicePnBridge.getVoipToken().catch(() => null);
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

async function fetchSipCredentials(authToken: string): Promise<{ sip_username: string; password: string } | null> {
  const response = await fetch(`${API_URL}/telephony/webrtc-credentials?device=mobile`, {
    headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    console.warn(`[voip] SIP credentials request failed: HTTP ${response.status}`);
    return null;
  }
  return response.json();
}

async function registerVoipToken(authToken: string, voipToken: string): Promise<void> {
  const response = await fetch(`${API_URL}/push-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: voipToken,
      type: 'voip',
      platform: 'ios',
      device_name: Constants.deviceName ?? undefined,
    }),
  });
  if (!response.ok) {
    console.warn(`[voip] VoIP token registration failed: HTTP ${response.status}`);
    return;
  }
  await storage.setItem(VOIP_TOKEN_KEY, voipToken);
}

/**
 * Включает приём звонков на этом телефоне. Вызывается после входа и на каждом
 * старте приложения.
 *
 * Если приложение разбудил пуш звонка, SDK уже входит сам по сохранённым данным;
 * второй вход параллельно сорвал бы звонок, поэтому тогда только обновляем токен.
 */
export async function startVoipCalls(authToken: string): Promise<void> {
  const voipToken = await waitForVoipToken();
  if (!voipToken) console.warn('[voip] No PushKit token yet: calls will ring only while the app is open');

  if (!(await TelnyxVoipClient.isLaunchedFromPushNotification())) {
    const credentials = await fetchSipCredentials(authToken);
    if (!credentials) return;

    // Раньше телефон входил браузерным логином (или здесь был другой сотрудник):
    // снимаем пуши со старого логина, иначе Telnyx будил бы телефон и его звонками.
    const previous = await AsyncStorage.getItem(TELNYX_STORED_USERNAME).catch(() => null);
    if (previous && previous !== credentials.sip_username) await disconnectFromTelnyx();

    await voipClient.login(
      createCredentialConfig(credentials.sip_username, credentials.password, {
        debug: __DEV__,
        pushNotificationDeviceToken: voipToken ?? undefined,
        // Пуш и тогда, когда сессия самого телефона ещё жива (приложение только
        // что свернули): иначе такой звонок мог бы потеряться.
        pushWhenActive: true,
      }),
    );
  }

  if (voipToken) await registerVoipToken(authToken, voipToken);
}

/**
 * Отключает телефон от Telnyx и стирает сохранённый вход, чтобы пуш не разбудил
 * телефон звонком чужого (или прежнего) логина.
 *
 * Снять пуши можно только через живое соединение, а в фоне SDK отключается сам —
 * поэтому сначала, если нужно, подключаемся по сохранённому входу.
 */
async function disconnectFromTelnyx(): Promise<void> {
  try {
    const connected =
      voipClient.currentConnectionState === TelnyxConnectionState.CONNECTED ||
      ((await voipClient.loginFromStoredConfig().catch(() => false)) && (await waitForConnected()));
    if (connected) voipClient.disablePushNotifications();
    else console.warn('[voip] Not connected to Telnyx: pushes stay enabled for the previous login');
  } catch (e) {
    console.warn('[voip] Could not disable Telnyx pushes', e);
  }
  await voipClient.logout().catch((e) => console.warn('[voip] Telnyx logout failed', e));
  await AsyncStorage.multiRemove(TELNYX_STORED_KEYS).catch(() => undefined);
}

/** Выход из приложения, пока сессия ещё жива: снимаем и VoIP-токен с бэкенда. */
export async function stopVoipCalls(authToken: string): Promise<void> {
  await disconnectFromTelnyx();

  const voipToken = await storage.getItem(VOIP_TOKEN_KEY);
  if (!voipToken) return;
  await storage.removeItem(VOIP_TOKEN_KEY);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(`${API_URL}/push-tokens/${encodeURIComponent(voipToken)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch (e) {
    console.warn('[voip] VoIP token removal failed', e);
  }
}

/** Сессию уже отклонил сервер: отключаемся от Telnyx, бэкенд перепривяжет токен при следующем входе. */
export async function forgetVoipCalls(): Promise<void> {
  await disconnectFromTelnyx();
  await storage.removeItem(VOIP_TOKEN_KEY);
}
