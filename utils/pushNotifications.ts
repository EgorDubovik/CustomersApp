import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { API_URL } from '../constants/Config';
import * as storage from './storage';

/**
 * Push notifications: permission, Expo push token, and its registration on the
 * backend (POST/DELETE /push-tokens in nestjs/src/push-notifications).
 *
 * The backend sends the same payload the web gets as a toast, with
 * `data: { event, link }`, where `link` is a *web* path. `routeForNotification`
 * translates it into a screen of this app.
 */

/** The token we last registered, so sign-out can remove exactly that one. */
const STORAGE_KEY = 'push_token';

/** Remote push doesn't exist on web; the app's web build simply skips all of it. */
export const isPushSupported = Platform.OS === 'ios' || Platform.OS === 'android';

// Show notifications while the app is in the foreground too: a missed call
// shouldn't go unnoticed just because the dispatcher has another screen open.
// Without a handler iOS drops foreground notifications silently.
if (isPushSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Asks for permission (once — iOS never shows the prompt again after a "no")
 * and returns the Expo push token, or null when there is none to get:
 * permission denied, simulator without APNs, no network.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!isPushSupported) return null;

  try {
    // Android 13+ shows the permission prompt only once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) {
      ({ granted } = await Notifications.requestPermissionsAsync());
    }
    if (!granted) return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });

    return data;
  } catch (e) {
    console.warn('[push] Could not get Expo push token', e);
    return null;
  }
}

/** Ties this device to the signed-in user. Safe to call on every app start. */
export async function registerPushToken(authToken: string): Promise<void> {
  const pushToken = await getExpoPushToken();
  if (!pushToken) return;

  try {
    const response = await fetch(`${API_URL}/push-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: pushToken,
        platform: Platform.OS,
        device_name: Constants.deviceName ?? undefined,
      }),
    });

    if (!response.ok) {
      console.warn(`[push] Token registration failed: HTTP ${response.status}`);
      return;
    }

    await storage.setItem(STORAGE_KEY, pushToken);
  } catch (e) {
    console.warn('[push] Token registration failed', e);
  }
}

/**
 * Called on sign-out, while the auth token is still valid: otherwise the next
 * person to use this phone — or nobody — keeps getting the previous user's
 * notifications. Best effort: sign-out must not hang on a dead network.
 */
export async function unregisterPushToken(authToken: string): Promise<void> {
  const pushToken = await storage.getItem(STORAGE_KEY);
  if (!pushToken) return;

  await storage.removeItem(STORAGE_KEY);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(`${API_URL}/push-tokens/${encodeURIComponent(pushToken)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch (e) {
    console.warn('[push] Token removal failed', e);
  }
}

/** Session already dead on the server: just drop the local copy of the token. */
export async function forgetPushToken(): Promise<void> {
  await storage.removeItem(STORAGE_KEY);
}

/**
 * Screen to open for a tapped notification. The backend speaks in web paths
 * (`/calls/<conversationId>`); this is the only place that knows how they map
 * onto the app. Unknown link → null, the tap just brings the app forward.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  const link = typeof data?.link === 'string' ? data.link : null;
  if (!link) return null;

  const conversation = link.match(/^\/calls\/([^/?#]+)/);
  if (conversation) return `/conversation/${conversation[1]}`;

  // New job / rescheduled job — the app has the same path for the appointment screen
  const appointment = link.match(/^\/appointment\/(\d+)/);
  if (appointment) return `/appointment/${appointment[1]}`;

  return null;
}
