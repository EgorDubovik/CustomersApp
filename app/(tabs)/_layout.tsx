import { SymbolView } from 'expo-symbols';
import { Link, Tabs } from 'expo-router';
import { Platform, Pressable } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useAuth } from '@/context/AuthContext';
import { useSocketEvent } from '@/context/SocketContext';
import { useChat } from '@/context/ChatContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isStaff, callsUnread, setCallsUnread, mentionsUnread, setMentionsUnread } = useAuth();
  const { unread: chatUnread } = useChat();

  // Backend pushes the company-wide total whenever something is read or arrives
  useSocketEvent<{ total: number }>('conversation.unread', ({ total }) => {
    if (typeof total === 'number') setCallsUnread(total);
  });
  // My own unread comment mentions — added to the Calls badge, like the web menu
  useSocketEvent<{ total: number }>('comment.mentions_unread', ({ total }) => {
    if (typeof total === 'number') setMentionsUnread(total);
  });
  const callsBadge = callsUnread + mentionsUnread;
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
        name="chat"
        options={{
          title: 'Chat',
          // Own header with the search and the "new chat" button
          headerShown: false,
          tabBarBadge: chatUnread > 0 ? (chatUnread > 99 ? '99+' : chatUnread) : undefined,
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{
                ios: focused ? 'bubble.left.and.bubble.right.fill' : 'bubble.left.and.bubble.right',
                android: 'forum',
                web: 'forum',
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: 'Calls',
          // Technicians don't handle the phone line — hide the tab (and its route) for them
          href: isStaff ? undefined : null,
          headerShown: false,
          tabBarBadge: callsBadge > 0 ? (callsBadge > 99 ? '99+' : callsBadge) : undefined,
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{
                ios: focused ? 'phone.fill' : 'phone',
                android: 'call',
                web: 'call',
              }}
              tintColor={color}
              size={24}
            />
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

