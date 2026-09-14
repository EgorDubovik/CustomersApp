import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { palette, styles } from '../styles';
import { AppointmentTabKey } from '../types';

export interface TabDef {
  key: AppointmentTabKey;
  label: string;
  icon: SymbolViewProps['name'];
  /** Count badge shown next to the label (hidden when 0/undefined) */
  badge?: number;
}

interface Props {
  tabs: TabDef[];
  active: AppointmentTabKey;
  onChange: (key: AppointmentTabKey) => void;
  isDark: boolean;
}

/**
 * Segmented tab bar shown under the action buttons. Rendered as a sticky header of the
 * screen ScrollView so it stays reachable while the tab content scrolls.
 */
export default function AppointmentTabBar({ tabs, active, onChange, isDark }: Props) {
  const c = isDark ? palette.dark : palette.light;

  return (
    <View style={[styles.tabBarWrap, { backgroundColor: c.bg }]}>
      <View style={[styles.tabBar, { backgroundColor: c.tabBarBg, borderColor: c.cardBorder }]}>
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          const tint = isActive ? c.primary : c.textMuted;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={({ pressed }) => [
                styles.tabItem,
                isActive && { backgroundColor: c.tabActiveBg, shadowOpacity: isDark ? 0 : 0.08 },
                pressed && !isActive && { opacity: 0.6 },
              ]}
            >
              <SymbolView name={tab.icon} size={14} tintColor={tint} />
              <Text style={[styles.tabItemText, { color: isActive ? c.text : c.textMuted }]} numberOfLines={1}>
                {tab.label}
              </Text>
              {!!tab.badge && tab.badge > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: isActive ? c.primary : c.tabBadgeBg }]}>
                  <Text style={[styles.tabBadgeText, { color: isActive ? '#fff' : c.textSecondary }]}>
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
