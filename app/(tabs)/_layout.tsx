import { SymbolView } from 'expo-symbols';
import { Link, Tabs } from 'expo-router';
import { Platform, Pressable } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const activeColor = Colors[colorScheme].tint;
  const inactiveColor = Colors[colorScheme].tabIconDefault;
  const cardBg = Colors[colorScheme].card;
  const border = Colors[colorScheme].border;
  const headerBg = Colors[colorScheme].background;
  const textColor = Colors[colorScheme].text;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        headerShown: useClientOnlyValue(false, true),
        headerStyle: {
          backgroundColor: headerBg,
          borderBottomWidth: 1,
          borderBottomColor: border,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 20,
          color: textColor,
        },
        tabBarStyle: {
          backgroundColor: cardBg,
          borderTopWidth: 1,
          borderTopColor: border,
          elevation: 0,
          shadowOpacity: 0,
          ...Platform.select({
            ios: {
              height: 88,
              paddingBottom: 30,
            },
            android: {
              height: 64,
              paddingBottom: 10,
            },
          }),
        },
      }}>
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{
                ios: focused ? 'person.3.fill' : 'person.3',
                android: 'people',
                web: 'people',
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{
                ios: focused ? 'calendar.badge.clock' : 'calendar',
                android: 'calendar_today',
                web: 'calendar_today',
              }}
              tintColor={color}
              size={24}
            />
          ),
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable style={{ marginRight: 15 }}>
                {({ pressed }) => (
                  <SymbolView
                    name={{ ios: 'info.circle', android: 'info', web: 'info' }}
                    size={22}
                    tintColor={textColor}
                    style={{ opacity: pressed ? 0.6 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{
                ios: focused ? 'gearshape.fill' : 'gearshape',
                android: 'settings',
                web: 'settings',
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}

