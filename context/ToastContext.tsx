import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number; // ms, default 1500
}

interface ToastContextValue {
  showToast: (config: ToastConfig) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

// ─── Style Config ─────────────────────────────────────────────────────────────

const toastColors: Record<ToastType, { bg: string; text: string; icon: string }> = {
  success: { bg: '#10B981', text: '#ffffff', icon: '✓' },
  error: { bg: '#EF4444', text: '#ffffff', icon: '✕' },
  info: { bg: '#6366F1', text: '#ffffff', icon: 'ℹ' },
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastConfig | null>(null);
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const hideToast = useCallback(() => {
    translateY.value = withTiming(100, { duration: 250, easing: Easing.inOut(Easing.ease) });
    opacity.value = withTiming(0, { duration: 250, easing: Easing.inOut(Easing.ease) }, () => {
      runOnJS(clearToast)();
    });
  }, []);

  const showToast = useCallback((config: ToastConfig) => {
    // Clear any existing timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    setToast(config);

    // Animate in
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.back(1.2)) });
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });

    // Schedule auto-hide
    const duration = config.duration ?? 1500;
    hideTimeoutRef.current = setTimeout(() => {
      hideToast();
    }, duration);
  }, [hideToast]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const type = toast?.type ?? 'success';
  const colors = toastColors[type];
  const bottomOffset = Math.max(insets.bottom, 12) + 8;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast overlay — rendered above everything */}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            { bottom: bottomOffset },
            animatedStyle,
          ]}
          pointerEvents="none"
        >
          <View style={[styles.toastBody, { backgroundColor: colors.bg }]}>
            <View style={styles.toastIconWrap}>
              <Text style={styles.toastIcon}>{colors.icon}</Text>
            </View>
            <Text style={[styles.toastText, { color: colors.text }]} numberOfLines={1}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  toastBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    maxWidth: 400,
    width: '100%',
  },
  toastIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastIcon: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});
