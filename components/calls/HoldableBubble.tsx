import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { callsPalette } from './styles';

export interface BubbleAction {
  key: string;
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  destructive?: boolean;
}

interface Props {
  /**
   * Draws the bubble. Called twice: in the timeline and as the lifted copy above the menu.
   * `onLongPress` is for pressable bits inside the bubble (links) so holding them opens the menu too.
   */
  renderBubble: (onLongPress: () => void) => React.ReactNode;
  actions: BubbleAction[];
  /** Which edge the menu lines up with — the bubble's side of the timeline. */
  align: 'left' | 'right';
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
}

const HOLD_MS = 380;
const PRESSED_SCALE = 0.96;
const ROW_HEIGHT = 46;
const MENU_PADDING = 6;
const MENU_WIDTH = 230;
const GAP = 8;

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * A timeline bubble (SMS / call) with its own context menu on a long press:
 * while the finger is held the bubble sinks a little, so it's clear something is about
 * to happen; then the screen dims and blurs, the bubble is lifted above it in place,
 * and a menu card appears under it (or above, when there's no room).
 */
export default function HoldableBubble({ renderBubble, actions, align, isDark, style }: Props) {
  const ref = useRef<View>(null);
  const size = useRef({ width: 0, height: 0 });
  const pressScale = useSharedValue(1);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const open = useCallback(() => {
    if (!actions.length) return;
    ref.current?.measureInWindow((x, y, w, h) => {
      // The bubble is scaled down right now; the copy must have its real size, centred the same way.
      const width = size.current.width || w;
      const height = size.current.height || h;
      setAnchor({ x: x + (w - width) / 2, y: y + (h - height) / 2, width, height });
    });
  }, [actions.length]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));

  return (
    <>
      <Animated.View
        ref={ref}
        collapsable={false}
        onLayout={(e) => (size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        // The original hides while its lifted copy is shown over the dimmed screen.
        style={[style, pressStyle, anchor && { opacity: 0 }]}
      >
        <Pressable
          onPressIn={() => {
            // A short delay so just scrolling past doesn't make bubbles twitch.
            pressScale.value = withDelay(90, withTiming(PRESSED_SCALE, { duration: HOLD_MS - 90, easing: Easing.out(Easing.quad) }));
          }}
          onPressOut={() => {
            pressScale.value = withSpring(1, { damping: 14, stiffness: 260, mass: 0.6 });
          }}
          onLongPress={open}
          delayLongPress={HOLD_MS}
        >
          {renderBubble(open)}
        </Pressable>
      </Animated.View>

      {anchor && <BubbleMenu anchor={anchor} align={align} actions={actions} isDark={isDark} bubble={renderBubble(() => {})} onClosed={() => setAnchor(null)} />}
    </>
  );
}

function BubbleMenu({
  anchor,
  align,
  actions,
  isDark,
  bubble,
  onClosed,
}: {
  anchor: Anchor;
  align: 'left' | 'right';
  actions: BubbleAction[];
  isDark: boolean;
  bubble: React.ReactNode;
  onClosed: () => void;
}) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const progress = useSharedValue(0);
  const closing = useRef(false);

  // ─── Where everything goes: the bubble stays where it was unless the menu doesn't fit ───
  const menuH = actions.length * ROW_HEIGHT + MENU_PADDING * 2;
  const topLimit = insets.top + 12;
  const bottomLimit = screenH - insets.bottom - 12;
  const previewH = Math.min(anchor.height, Math.max(80, bottomLimit - topLimit - menuH - GAP));
  let top = anchor.y;
  if (top + previewH + GAP + menuH > bottomLimit) top = bottomLimit - menuH - GAP - previewH;
  if (top < topLimit) top = topLimit;
  const menuTop = top + previewH + GAP;
  const menuW = Math.min(MENU_WIDTH, screenW - 24);
  const menuX = align === 'right' ? Math.min(screenW - 12 - menuW, anchor.x + anchor.width - menuW) : Math.max(12, anchor.x);
  const shiftY = anchor.y - top; // how far the bubble moves to make room

  useEffect(() => {
    progress.value = withSpring(1, { damping: 18, stiffness: 220, mass: 0.7 });
  }, [progress]);

  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    progress.value = withTiming(0, { duration: 160 }, (finished) => {
      if (finished) runOnJS(onClosed)();
    });
    // Copy / open comments right away — the menu fades out on its own.
    after?.();
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value) }));
  const previewStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: shiftY * (1 - progress.value) }, { scale: PRESSED_SCALE + (1 - PRESSED_SCALE) * progress.value }],
  }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [{ translateY: -10 * (1 - progress.value) }, { scale: 0.85 + 0.15 * progress.value }],
  }));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close menu">
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <BlurView intensity={22} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.28)' }]} />
        </Animated.View>
      </Pressable>

      {/* The lifted bubble — just a picture of it, taps go to the backdrop */}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top, left: anchor.x, width: anchor.width, height: previewH, overflow: 'hidden' }, previewStyle]}
      >
        {bubble}
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: menuTop,
            left: menuX,
            width: menuW,
            paddingVertical: MENU_PADDING,
            borderRadius: 14,
            backgroundColor: c.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.cardBorder,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
            transformOrigin: align === 'right' ? 'top right' : 'top left',
          },
          menuStyle,
        ]}
      >
        {actions.map((a, i) => (
          <Pressable
            key={a.key}
            onPress={() => close(a.onPress)}
            style={({ pressed }) => ({
              height: ROW_HEIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 14,
              backgroundColor: pressed ? c.inputBg : 'transparent',
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: c.cardBorder,
            })}
          >
            <SymbolView name={a.icon} size={18} tintColor={a.destructive ? c.danger : c.textMuted} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: a.destructive ? c.danger : c.text }}>{a.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </Modal>
  );
}
