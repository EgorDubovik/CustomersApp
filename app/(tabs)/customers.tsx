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
} from 'react-native';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';

interface ICustomer {
  id: number;
  name: string;
  phone: string;
  email: string;
  addresses?: any[];
}

export default function CustomersScreen() {
  const { token } = useAuth();
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

  const renderItem = ({ item }: { item: ICustomer }) => (
    <View style={[styles.card, themeStyles.cardBg]}>
      <Text style={[styles.cardTitle, themeStyles.textTitle]}>{item.name}</Text>
      {item.phone ? (
        <View style={styles.infoRow}>
          <SymbolView name={{ ios: 'phone.fill', android: 'phone', web: 'phone' }} size={16} tintColor={isDark ? '#888ea8' : '#515365'} />
          <Text style={[styles.infoText, themeStyles.textMuted]}>{item.phone}</Text>
        </View>
      ) : null}
      {item.email ? (
        <View style={styles.infoRow}>
          <SymbolView name={{ ios: 'envelope.fill', android: 'email', web: 'email' }} size={16} tintColor={isDark ? '#888ea8' : '#515365'} />
          <Text style={[styles.infoText, themeStyles.textMuted]}>{item.email}</Text>
        </View>
      ) : null}
      {item.addresses && item.addresses.length > 0 && item.addresses[0]?.full ? (
        <View style={styles.infoRow}>
          <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} size={16} tintColor={isDark ? '#888ea8' : '#515365'} />
          <Text style={[styles.infoText, themeStyles.textMuted]}>{item.addresses[0].full}</Text>
        </View>
      ) : null}
    </View>
  );

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
        }}
      />

      <View style={styles.listContainer}>
        {loading && customers.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={isDark ? '#805dca' : '#4361ee'} />
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

      <View style={[styles.searchContainer, themeStyles.searchBg]}>
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
            <ActivityIndicator size="small" color={isDark ? '#805dca' : '#4361ee'} style={styles.searchLoading} />
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  infoText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  searchContainer: {
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
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
    height: 44,
    borderRadius: 22,
    paddingLeft: 40,
    paddingRight: 40,
    fontSize: 16,
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
    fontSize: 16,
  },
});

const lightStyles = StyleSheet.create({
  bg: { backgroundColor: '#f6f8fa' },
  cardBg: { backgroundColor: '#ffffff' },
  searchBg: { backgroundColor: '#ffffff' },
  inputBg: { backgroundColor: '#f1f2f3' },
  textTitle: { color: '#0e1726' },
  textMuted: { color: '#515365' },
});

const darkStyles = StyleSheet.create({
  bg: { backgroundColor: '#060818' },
  cardBg: { backgroundColor: '#0e1726' },
  searchBg: { backgroundColor: '#0e1726' },
  inputBg: { backgroundColor: '#1b2e4b' },
  textTitle: { color: '#bfc9d4' },
  textMuted: { color: '#888ea8' },
});
