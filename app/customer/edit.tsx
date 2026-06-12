import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';

export default function EditCustomerScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { id, name: routeName, phone: routePhone, email: routeEmail } = useLocalSearchParams<{
    id: string;
    name?: string;
    phone?: string;
    email?: string;
  }>();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [dataForm, setDataForm] = useState({
    name: routeName || '',
    phone: routePhone || '',
    email: routeEmail || '',
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState(false);

  // Safely fetch latest details from server
  useEffect(() => {
    const fetchCustomer = async () => {
      if (!id || !token) return;
      setFetching(true);
      try {
        const response = await fetch(`${API_URL}/customers/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          setDataForm({
            name: data.name || '',
            phone: data.phone || '',
            email: data.email || '',
          });
        }
      } catch (err) {
        console.error('Failed to fetch customer details:', err);
      } finally {
        setFetching(false);
      }
    };
    fetchCustomer();
  }, [id, token]);

  const validateForm = () => {
    let isValid = true;
    if (dataForm.phone.length < 10) {
      setPhoneError(true);
      isValid = false;
    } else {
      setPhoneError(false);
    }
    return isValid;
  };

  const updateCustomer = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/customers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          name: dataForm.name,
          phone: dataForm.phone,
          email: dataForm.email,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      router.back();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while updating the customer.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (name: string, value: string) => {
    if (name === 'phone') setPhoneError(false);
    setDataForm({ ...dataForm, [name]: value });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, themeStyles.bg]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen 
        options={{ 
          title: 'Edit Customer',
          headerTitleStyle: {
            fontWeight: '700',
          },
          headerRight: () => (
            <TouchableOpacity onPress={updateCustomer} disabled={loading || fetching} style={styles.headerSaveBtn}>
              {loading ? (
                <ActivityIndicator size="small" color={isDark ? '#818CF8' : '#6366F1'} />
              ) : (
                <Text style={[styles.headerSaveText, { color: isDark ? '#818CF8' : '#6366F1' }]}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          )
        }} 
      />
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {fetching ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color={isDark ? '#818CF8' : '#6366F1'} />
        ) : (
          <>
            <Text style={styles.sectionHeader}>Personal Info</Text>
            
            <View style={[styles.groupContainer, themeStyles.cardBg, themeStyles.cardBorder]}>
              {/* Name Row */}
              <View style={styles.rowInput}>
                <Text style={[styles.rowLabel, themeStyles.textTitle]}>Name</Text>
                <TextInput
                  style={[styles.input, themeStyles.textTitle]}
                  placeholder="Required"
                  placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                  value={dataForm.name}
                  onChangeText={(text) => handleChange('name', text)}
                  autoCorrect={false}
                />
              </View>
              
              <View style={[styles.separator, themeStyles.separatorColor]} />
              
              {/* Phone Row */}
              <View style={styles.rowInput}>
                <Text style={[styles.rowLabel, themeStyles.textTitle, phoneError && styles.labelError]}>Phone</Text>
                <TextInput
                  style={[styles.input, themeStyles.textTitle]}
                  placeholder="Required (10+ digits)"
                  placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                  keyboardType="phone-pad"
                  value={dataForm.phone}
                  onChangeText={(text) => handleChange('phone', text)}
                  autoCorrect={false}
                />
              </View>
              
              <View style={[styles.separator, themeStyles.separatorColor]} />
              
              {/* Email Row */}
              <View style={styles.rowInput}>
                <Text style={[styles.rowLabel, themeStyles.textTitle]}>Email</Text>
                <TextInput
                  style={[styles.input, themeStyles.textTitle]}
                  placeholder="Optional"
                  placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={dataForm.email}
                  onChangeText={(text) => handleChange('email', text)}
                  autoCorrect={false}
                />
              </View>
            </View>
            
            {phoneError && <Text style={styles.errorHelper}>Phone number must be at least 10 digits</Text>}

            <TouchableOpacity
              style={[styles.primaryButton, themeStyles.btnPrimary]}
              onPress={updateCustomer}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  headerSaveBtn: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSaveText: {
    fontSize: 17,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textTransform: 'uppercase',
    marginLeft: 16,
    marginBottom: 8,
    marginTop: 16,
  },
  groupContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  rowInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
  },
  rowLabel: {
    width: 90,
    fontSize: 16,
    fontWeight: '500',
  },
  labelError: {
    color: '#ff3b30',
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    paddingVertical: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  errorHelper: {
    color: '#ff3b30',
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

const lightStyles = StyleSheet.create({
  bg: { backgroundColor: '#f2f2f7' },
  cardBg: { backgroundColor: '#ffffff' },
  cardBorder: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
  textTitle: { color: '#000000' },
  separatorColor: { backgroundColor: 'rgba(0,0,0,0.08)' },
  btnPrimary: { backgroundColor: '#007aff' },
});

const darkStyles = StyleSheet.create({
  bg: { backgroundColor: '#000000' },
  cardBg: { backgroundColor: '#1c1c1e' },
  cardBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  textTitle: { color: '#ffffff' },
  separatorColor: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnPrimary: { backgroundColor: '#0A84FF' },
});
