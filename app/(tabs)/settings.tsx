import React from 'react';
import { ScrollView, StyleSheet, Pressable, Platform } from 'react-native';
import { Text, View } from '@/components/Themed';
import { SymbolView } from 'expo-symbols';
import { useSettings, AppTheme, NavigationMap } from '@/context/SettingsContext';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

interface SegmentedControlProps<T> {
  options: { label: string; value: T }[];
  selectedValue: T;
  onSelect: (value: T) => void;
}

function SegmentedControl<T>({ options, selectedValue, onSelect }: SegmentedControlProps<T>) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const containerBg = isDark ? '#27272a' : '#f1f5f9';
  const activeBg = isDark ? '#3f3f46' : '#ffffff';
  const activeText = isDark ? '#f4f4f5' : '#0f172a';
  const inactiveText = isDark ? '#71717a' : '#64748b';

  return (
    <View style={[styles.segmentContainer, { backgroundColor: containerBg }]} lightColor="transparent" darkColor="transparent">
      {options.map((option) => {
        const isActive = option.value === selectedValue;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onSelect(option.value)}
            style={[
              styles.segmentButton,
              isActive && [styles.segmentButtonActive, { backgroundColor: activeBg }],
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: isActive ? activeText : inactiveText, fontWeight: isActive ? '600' : '400' },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingRow({
  iconName,
  title,
  rightElement,
}: {
  iconName: any;
  title: string;
  rightElement: React.ReactNode;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.row} lightColor="#ffffff" darkColor="#18181b">
      <View style={styles.rowLeft} lightColor="transparent" darkColor="transparent">
        <View
          style={styles.iconContainer}
          lightColor={isDark ? '#27272a' : '#f1f5f9'}
          darkColor={isDark ? '#27272a' : '#f1f5f9'}
        >
          <SymbolView
            name={iconName}
            size={18}
            tintColor={Colors[colorScheme].tint}
          />
        </View>
        <Text style={[styles.rowTitle, { color: Colors[colorScheme].text }]}>{title}</Text>
      </View>
      <View style={styles.rowRight} lightColor="transparent" darkColor="transparent">
        {rightElement}
      </View>
    </View>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.section} lightColor="transparent" darkColor="transparent">
      <Text style={[styles.sectionHeader, { color: isDark ? '#71717a' : '#64748b' }]}>{title}</Text>
      <View
        style={[styles.sectionCard, { borderColor: isDark ? '#27272a' : '#e2e8f0', borderWidth: 1 }]}
        lightColor="#ffffff"
        darkColor="#18181b"
      >
        {React.Children.map(children, (child, index) => {
          const isLast = index === React.Children.count(children) - 1;
          return (
            <View key={index} lightColor="transparent" darkColor="transparent">
              {child}
              {!isLast && (
                <View
                  style={styles.rowSeparator}
                  lightColor="#e2e8f0"
                  darkColor="#27272a"
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { theme, setTheme, navigationMap, setNavigationMap } = useSettings();
  const colorScheme = useColorScheme();
  const bg = Colors[colorScheme].background;

  const themeOptions: { label: string; value: AppTheme }[] = [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ];

  const mapOptions: { label: string; value: NavigationMap }[] = [
    { label: 'Apple', value: 'apple' },
    { label: 'Google', value: 'google' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: bg }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <SettingSection title="Appearance">
        <SettingRow
          iconName={{
            ios: 'paintbrush',
            android: 'palette',
            web: 'palette',
          }}
          title="App Theme"
          rightElement={
            <SegmentedControl
              options={themeOptions}
              selectedValue={theme}
              onSelect={setTheme}
            />
          }
        />
      </SettingSection>

      <SettingSection title="Navigation">
        <SettingRow
          iconName={{
            ios: 'map',
            android: 'map',
            web: 'map',
          }}
          title="Preferred Maps"
          rightElement={
            <SegmentedControl
              options={mapOptions}
              selectedValue={navigationMap}
              onSelect={setNavigationMap}
            />
          }
        />
      </SettingSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  sectionCard: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: '#e5e5ea',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    alignItems: 'center',
  },
  segmentButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentButtonActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 1.0,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      },
    }),
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
