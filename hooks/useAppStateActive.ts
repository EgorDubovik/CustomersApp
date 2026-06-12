import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '../context/AuthContext';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function useAppStateActive() {
  const { token, fetchInitialData } = useAuth();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    // Reset the update timer when the token changes (e.g. login, logout, app start)
    lastUpdateRef.current = Date.now();
  }, [token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      const isTransitioningToActive =
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active';

      if (isTransitioningToActive && token) {
        const now = Date.now();
        if (now - lastUpdateRef.current >= FIVE_MINUTES_MS) {
          console.log('[useAppStateActive] App transitioned to active state. Refreshing initial data.');
          // Update timestamp immediately before request completes to prevent race conditions / duplicate triggers
          lastUpdateRef.current = now;
          await fetchInitialData(token);
        } else {
          const minutesRemaining = ((FIVE_MINUTES_MS - (now - lastUpdateRef.current)) / 60000).toFixed(1);
          console.log(`[useAppStateActive] App transitioned to active state, but throttle active. Skip update (next update allowed in ${minutesRemaining}m).`);
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [token, fetchInitialData]);
}
