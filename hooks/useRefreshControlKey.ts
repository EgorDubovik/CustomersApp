import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Key for a `<RefreshControl>` on a tab screen.
 *
 * iOS bug: when a tab is left and opened again, the native UIRefreshControl can
 * show up frozen at the top of the list (not spinning, `refreshing` is already
 * false) until the user pulls again. Giving the control a new key every time the
 * screen loses focus makes React create a fresh native control while the screen
 * is hidden, so the user comes back to a clean list.
 *
 * Only on iOS: on Android RefreshControl wraps the whole ScrollView, and a new key
 * would remount the list and lose its scroll position.
 */
export function useRefreshControlKey(): string | undefined {
  const [generation, setGeneration] = useState(0);

  useFocusEffect(
    useCallback(() => {
      return () => setGeneration((g) => g + 1);
    }, []),
  );

  return Platform.OS === 'ios' ? `refresh-${generation}` : undefined;
}
