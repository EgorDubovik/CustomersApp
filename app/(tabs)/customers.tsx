import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  ActivityIndicator,
  View,
  Text,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Linking,
} from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

interface ICustomer {
  id: number;
  name: string;
  phone: string;
  email: string;
  addresses?: any[];
  created_at?: string;
  createdAt?: string;
}

const getAvatarGradient = (name: string, isDark: boolean): [string, string] => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % 5;
  
  const gradientsLight: [string, string][] = [
    ['#818CF8', '#A78BFA'], // Indigo -> Purple
    ['#34D399', '#2DD4BF'], // Emerald -> Teal
    ['#FB7185', '#F472B6'], // Rose -> Pink
    ['#FBBF24', '#F97316'], // Amber -> Orange
    ['#38BDF8', '#60A5FA'], // Sky -> Blue
  ];
  
  const gradientsDark: [string, string][] = [
    ['#4F46E5', '#7C3AED'],
    ['#059669', '#0D9488'],
    ['#E11D48', '#DB2777'],
    ['#D97706', '#EA580C'],
    ['#0284C7', '#2563EB'],
  ];
  
  return isDark ? gradientsDark[index] : gradientsLight[index];
};

const getRelativeTime = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years}y ago`;
  }
};

export default function CustomersScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [customers, setCustomers] = useState<ICustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCustomers = useCallback(async (search: string = '') => {
    if (!token) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError('');

    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '?limit=50';
      const response = await fetch(`${API_URL}/customers${query}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      const data = await response.json();
      setCustomers(data.data || data || []);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error(err);
        setError(err.message || 'An error occurred while fetching customers.');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (searchQuery.trim().length > 0 && searchQuery.trim().length < 3) {
      // Do nothing if search query is 1 or 2 characters
      return;
    }

    const handler = setTimeout(() => {
      fetchCustomers(searchQuery.trim());
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery, fetchCustomers]);

  const renderItem = ({ item }: { item: ICustomer }) => {
    const initials = item.name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

    const avatarGradient = getAvatarGradient(item.name, isDark);
    const dateStr = item.created_at || item.createdAt;
    const relativeTime = getRelativeTime(dateStr);

    return (
      <Pressable
        onPress={() => router.push(`/customer/${item.id}`)}
        style={({ pressed }) => [
          styles.card,
          themeStyles.cardBg,
          themeStyles.cardBorder,
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
        ]}
      >
        <View style={styles.cardHeader}>
          <LinearGradient
            colors={avatarGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </LinearGradient>
          
          <View style={styles.headerInfo}>
            <Text style={[styles.cardTitle, themeStyles.textTitle]} numberOfLines={1} ellipsizeMode="tail">
              {item.name}
            </Text>
            
            {item.phone ? (
              <View style={styles.infoRow}>
                <SymbolView 
                  name={{ ios: 'phone.fill', android: 'phone', web: 'phone' }} 
                  size={12} 
                  tintColor={isDark ? '#888ea8' : '#515365'} 
                />
                <Text style={[styles.infoText, themeStyles.textMuted]} numberOfLines={1}>
                  {item.phone}
                </Text>
              </View>
            ) : null}

            {item.email ? (
              <View style={styles.infoRow}>
                <SymbolView 
                  name={{ ios: 'envelope.fill', android: 'email', web: 'email' }} 
                  size={12} 
                  tintColor={isDark ? '#888ea8' : '#515365'} 
                />
                <Text style={[styles.infoText, themeStyles.textMuted]} numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {item.addresses && item.addresses.length > 0 && item.addresses[0]?.full ? (
          <View style={styles.addressContainer}>
            <SymbolView 
              name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} 
              size={12} 
              tintColor={isDark ? '#888ea8' : '#515365'} 
            />
            <Text style={[styles.addressText, themeStyles.textMuted]} numberOfLines={2}>
              {item.addresses[0].full}
            </Text>
          </View>
        ) : null}

        {relativeTime ? (
          <View style={styles.cardFooter}>
            <Text style={[styles.timeText, themeStyles.textTimeMuted]}>
              Created {relativeTime.toLowerCase()}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, themeStyles.bg]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Tabs.Screen
        options={{
          title: 'Customers',
          headerTitleStyle: {
            fontWeight: '800',
            fontSize: 18,
          },
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/customer/create')}
              style={({ pressed }) => [{ marginRight: 16, opacity: pressed ? 0.6 : 1 }]}
            >
              <SymbolView
                name={{ ios: 'plus', android: 'add', web: 'add' }}
                size={24}
                tintColor={Colors[colorScheme].tint}
              />
            </Pressable>
          ),
        }}
      />

      <View style={styles.listContainer}>
        {loading && customers.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <SymbolView
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
              size={50}
              tintColor="#e7515a"
              style={{ marginBottom: 16 }}
            />
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={[styles.errorSubtitle, themeStyles.textMuted]}>{error}</Text>
          </View>
        ) : customers.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={[styles.emptyText, themeStyles.textMuted]}>No customers found.</Text>
          </View>
        ) : (
          <FlatList
            data={customers}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.flatListContent}
            keyboardDismissMode="on-drag"
          />
        )}
      </View>

      <View style={[styles.searchContainer, themeStyles.searchBg, themeStyles.searchBorder]}>
        <View style={styles.inputWrapper}>
          <SymbolView 
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} 
            size={20} 
            tintColor={isDark ? '#888ea8' : '#515365'} 
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, themeStyles.textTitle, themeStyles.inputBg]}
            placeholder="Search customers..."
            placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {loading && searchQuery.length > 0 && (
            <ActivityIndicator size="small" color={Colors[colorScheme].tint} style={styles.searchLoading} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  flatListContent: {
    padding: 16,
    paddingBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  infoText: {
    fontSize: 13,
    marginLeft: 6,
    flex: 1,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 2,
  },
  addressText: {
    fontSize: 13,
    marginLeft: 6,
    flex: 1,
  },
  searchContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    paddingLeft: 38,
    paddingRight: 38,
    fontSize: 15,
  },
  searchLoading: {
    position: 'absolute',
    right: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e7515a',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
  },
});

const lightStyles = StyleSheet.create({
  bg: { backgroundColor: '#f8fafc' },
  cardBg: { backgroundColor: '#ffffff' },
  cardBorder: { borderWidth: 1, borderColor: '#e2e8f0' },
  searchBg: { backgroundColor: '#ffffff' },
  searchBorder: { borderColor: '#e2e8f0' },
  inputBg: { backgroundColor: '#f1f5f9' },
  textTitle: { color: '#0f172a' },
  textMuted: { color: '#64748b' },
  textTimeMuted: { color: '#94a3b8' },
});

const darkStyles = StyleSheet.create({
  bg: { backgroundColor: '#09090b' },
  cardBg: { backgroundColor: '#18181b' },
  cardBorder: { borderWidth: 1, borderColor: '#27272a' },
  searchBg: { backgroundColor: '#18181b' },
  searchBorder: { borderColor: '#27272a' },
  inputBg: { backgroundColor: '#27272a' },
  textTitle: { color: '#f4f4f5' },
  textMuted: { color: '#a1a1aa' },
  textTimeMuted: { color: '#71717a' },
});
