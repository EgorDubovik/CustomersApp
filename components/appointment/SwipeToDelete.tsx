import React, { useRef } from 'react';
import { ActivityIndicator, PanResponder, Pressable, View, ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const ACTION_WIDTH = 72;
const SNAP_OPEN = -ACTION_WIDTH;

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  /** Shows a spinner in the action area instead of the trash icon */
  deleting?: boolean;
  /** When false the row is not swipeable at all */
  enabled?: boolean;
  /** Lets the row pause the parent ScrollView while a horizontal swipe is in progress */
  setScrollEnabled?: (enabled: boolean) => void;
  dangerColor: string;
  /** Applied to the sliding foreground (background color, radius, …) */
  style?: ViewStyle;
  borderRadius?: number;
}

/**
 * iOS-style "swipe left to reveal Delete" row. The foreground slides over a red
 * action area; tapping the action fires onDelete and the row snaps back.
 */
export default function SwipeToDelete({
  children,
  onDelete,
  deleting = false,
  enabled = true,
  setScrollEnabled,
  dangerColor,
  style,
  borderRadius = 10,
}: Props) {
  const translateX = useSharedValue(0);
  const isOpen = useSharedValue(false);

  const close = () => {
    translateX.value = withTiming(0, { duration: 180 });
    isOpen.value = false;
  };

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture once it is clearly horizontal, so taps and vertical scroll pass through
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => setScrollEnabled?.(false),
      onPanResponderMove: (_, g) => {
        let next = (isOpen.value ? SNAP_OPEN : 0) + g.dx;
        if (next > 0) next = 0;
        if (next < SNAP_OPEN * 1.4) next = SNAP_OPEN * 1.4; // small rubber-band past the button
        translateX.value = next;
      },
      onPanResponderRelease: (_, g) => {
        setScrollEnabled?.(true);
        const shouldOpen = translateX.value < SNAP_OPEN / 2 || g.vx < -0.5;
        translateX.value = withTiming(shouldOpen ? SNAP_OPEN : 0, { duration: 180 });
        isOpen.value = shouldOpen;
      },
      onPanResponderTerminate: () => {
        setScrollEnabled?.(true);
        close();
      },
      onPanResponderTerminationRequest: (_, g) => Math.abs(g.dy) > Math.abs(g.dx),
    }),
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!enabled) {
    return <View style={[{ borderRadius }, style]}>{children}</View>;
  }

  return (
    <View style={{ position: 'relative', borderRadius, overflow: 'hidden' }}>
      {/* Action area revealed behind the row */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: ACTION_WIDTH * 1.4,
          backgroundColor: dangerColor,
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <Pressable
          onPress={() => {
            onDelete();
            close();
          }}
          disabled={deleting}
          style={({ pressed }) => [{ width: ACTION_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7 }]}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <SymbolView name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }} size={20} tintColor="#fff" />
          )}
        </Pressable>
      </View>

      <Animated.View {...panResponder.panHandlers} style={[animatedStyle, { borderRadius }, style]}>
        {/* Tapping an opened row closes it instead of triggering the row's own action */}
        <Pressable
          onPress={() => {
            if (isOpen.value) close();
          }}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}
