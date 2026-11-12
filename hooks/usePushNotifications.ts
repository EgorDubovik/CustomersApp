import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { isPushSupported, registerPushToken, routeForNotification } from '../utils/pushNotifications';

/**
 * Wires push notifications into the signed-in app:
 * - registers this device's token after sign-in and on every start (the backend
 *   upserts, and `updated_at` tells it the device is still alive);
 * - opens the right screen when a notification is tapped, including the tap
 *   that cold-started the app.
 *
 * Mount once, inside the navigator and below AuthProvider.
 */
export function usePushNotifications() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!isPushSupported || !token) return;

    // Once per sign-in / app start. No addPushTokenListener here: fetching the
    // Expo token fires that listener itself, so re-registering from it loops
    // forever. A rotated token is picked up on the next start instead.
    registerPushToken(token);
  }, [token]);

  useEffect(() => {
    // `undefined` — not known yet; wait for auth too, or the login redirect
    // would immediately replace the screen we navigate to.
    if (!isPushSupported || !lastResponse || isLoading || !token) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    // The hook keeps returning the same response across re-renders.
    const id = lastResponse.notification.request.identifier;
    if (handledResponseId.current === id) return;
    handledResponseId.current = id;

    const route = routeForNotification(lastResponse.notification.request.content.data);
    if (route) router.push(route as any);
  }, [lastResponse, isLoading, token]);
}
