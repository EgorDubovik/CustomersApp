import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Key for a `<RefreshControl>` on a list screen.
 *
 * iOS bug: the native UIRefreshControl can be left frozen at the top of the list
 * (not spinning, list pushed down, `refreshing` already false) until the user pulls
 * again. It happens when its state changes while the screen is not on screen:
 *  - the tab was left and opened again;
 *  - the phone went to sleep — iOS drops running animations in the background, and
 *    a reload started on wake-up (socket reconnect) can flip `refreshing` before the
 *    app is active again.
 *
 * Giving the control a new key whenever the screen loses focus or the app leaves
 * the foreground makes React create a fresh native control while it's hidden, so
 * the user comes back to a clean list.
 *
 * Only on iOS: on Android RefreshControl wraps the whole ScrollView, and a new key
 * would remount the list and lose its scroll position.
 *
 * Background reloads must not set `refreshing` at all — it is only for the user's own
 * pull. A programmatic `refreshing = true` makes iOS shift the list down by the
 * spinner's height, again on every call.
 */
export function useRefreshControlKey(): string | undefined {
  const [generation, setGeneration] = useState(0);

  useFocusEffect(
    useCallback(() => {
      return () => setGeneration((g) => g + 1);
    }, []),
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', (state) => {
      // background — уже не видно; active — на случай, если до фона не дошло (короткий inactive)
      if (state === 'background' || state === 'active') setGeneration((g) => g + 1);
    });
    return () => sub.remove();
  }, []);

  return Platform.OS === 'ios' ? `refresh-${generation}` : undefined;
}
