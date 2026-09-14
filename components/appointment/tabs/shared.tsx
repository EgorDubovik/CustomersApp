import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { palette, styles } from '../styles';

type Palette = typeof palette.light;

export interface SectionCardProps {
  title: string;
  icon: SymbolViewProps['name'];
  iconColor: string;
  iconBg: string;
  c: Palette;
  /** Text or node rendered on the right side of the header (count, action button, …) */
  right?: React.ReactNode;
  children: React.ReactNode;
}

/** Card with the standard icon + title header used by every section of the appointment screen. */
export function SectionCard({ title, icon, iconColor, iconBg, c, right, children }: SectionCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.cardHeaderIcon, { backgroundColor: iconBg }]}>
            <SymbolView name={icon} size={14} tintColor={iconColor} />
          </View>
          <Text style={[styles.cardTitle, { color: c.text }]}>{title}</Text>
        </View>
        {typeof right === 'string' ? (
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted }}>{right}</Text>
        ) : (
          right
        )}
      </View>
      {children}
    </View>
  );
}

/** Small round icon button used in card headers (e.g. "+" to add). */
export function HeaderIconButton({
  icon,
  onPress,
  c,
  color,
  bg,
}: {
  icon: SymbolViewProps['name'];
  onPress: () => void;
  c: Palette;
  color?: string;
  bg?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerIconBtn,
        { backgroundColor: bg ?? c.primaryMuted },
        pressed && { opacity: 0.6 },
      ]}
    >
      <SymbolView name={icon} size={14} tintColor={color ?? c.primary} />
    </Pressable>
  );
}

/** Dashed "Add …" button used at the bottom of list sections. */
export function AddRowButton({ label, onPress, isDark, c }: { label: string; onPress: () => void; isDark: boolean; c: Palette }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.addServiceBtn,
        {
          borderColor: isDark ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.3)',
          backgroundColor: isDark ? 'rgba(129, 140, 248, 0.12)' : 'rgba(99, 102, 241, 0.08)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <SymbolView name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add' }} size={14} tintColor={c.primary} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: c.primary }}>{label}</Text>
    </Pressable>
  );
}

export function EmptyText({ text, c }: { text: string; c: Palette }) {
  return (
    <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 8 }}>{text}</Text>
  );
}

export const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
