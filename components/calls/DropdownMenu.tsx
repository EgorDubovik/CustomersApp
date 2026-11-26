import React, { useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { callsPalette } from './styles';

export interface DropdownItem {
  key: string;
  label: string;
  /** Second, smaller line — e.g. a number */
  sublabel?: string;
  icon?: SymbolViewProps['name'];
  /** A colour dot instead of an icon (company lines) */
  dot?: string;
  /** Label colour, e.g. the line's colour */
  color?: string;
  /** Show a chevron — the row leads somewhere */
  chevron?: boolean;
  onPress: () => void;
}

interface Props {
  /** Screen Y of the menu's top edge (usually right under the button that opened it) */
  top: number;
  /** Which screen edge it hangs from, 12px in; grows from that corner */
  align: 'left' | 'right';
  title?: string;
  items: DropdownItem[];
  isDark: boolean;
  onClose: () => void;
  width?: number;
}

/**
 * Our drop-down menu for the conversation header: a card that falls out under the button
 * over a light dim. A tap outside closes it; a tap on a row closes it and then runs the row —
 * after the menu's Modal is gone, since iOS won't show another Modal while one is closing.
 */
export default function DropdownMenu({ top, align, title, items, isDark, onClose, width = 270 }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { width: screenW } = useWindowDimensions();
  const progress = useSharedValue(0);
  const closing = useRef(false);

  useEffect(() => {
    progress.value = withSpring(1, { damping: 18, stiffness: 260, mass: 0.6 });
  }, [progress]);

  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    progress.value = withTiming(0, { duration: 120 });
    setTimeout(() => {
      onClose();
      // A row that opens a Modal / screen waits a beat more for this Modal to be dismissed (iOS)
      if (after) setTimeout(after, Platform.OS === 'ios' ? 80 : 0);
    }, 120);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value) }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [{ translateY: -8 * (1 - progress.value) }, { scale: 0.9 + 0.1 * progress.value }],
  }));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(15,23,42,0.15)' }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top,
            [align]: 12,
            width: Math.min(width, screenW - 24),
            borderRadius: 14,
            paddingVertical: 6,
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
        {!!title && <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: c.textMuted, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}>{title}</Text>}
        {items.map((item, i) => (
          <Pressable
            key={item.key}
            onPress={() => close(item.onPress)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 14,
              paddingVertical: item.sublabel ? 10 : 12,
              backgroundColor: pressed ? c.inputBg : 'transparent',
              borderTopWidth: i === 0 && !title ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: c.cardBorder,
            })}
          >
            {item.dot ? (
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: item.dot }} />
            ) : item.icon ? (
              <SymbolView name={item.icon} size={18} tintColor={c.textMuted} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: item.sublabel ? '700' : '600', color: item.color || c.text }} numberOfLines={1}>
                {item.label}
              </Text>
              {!!item.sublabel && (
                <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }} numberOfLines={1}>
                  {item.sublabel}
                </Text>
              )}
            </View>
            {item.chevron && <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={12} tintColor={c.textFaint} />}
          </Pressable>
        ))}
      </Animated.View>
    </Modal>
  );
}
