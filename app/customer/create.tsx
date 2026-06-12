import React, { useState } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';

export default function CreateCustomerScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [dataForm, setDataForm] = useState({
    name: '',
    phone: '',
    email: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState(false);
  const [addressError, setAddressError] = useState(false);

  const validateForm = () => {
    let isValid = true;
    if (dataForm.phone.length < 10) {
      setPhoneError(true);
      isValid = false;
    } else {
      setPhoneError(false);
    }

    if (dataForm.line1.length < 5) {
      setAddressError(true);
      isValid = false;
    } else {
      setAddressError(false);
    }

    return isValid;
  };

  const storeCustomer = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(dataForm),
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      router.back();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while creating the customer.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (name: string, value: string) => {
    if (name === 'phone') setPhoneError(false);
    if (name === 'line1') setAddressError(false);
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
          title: 'New Customer',
          headerTitleStyle: {
            fontWeight: '700',
          },
          headerRight: () => (
            <TouchableOpacity onPress={storeCustomer} disabled={loading} style={styles.headerSaveBtn}>
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

        <Text style={styles.sectionHeader}>Address</Text>
        
        <View style={[styles.groupContainer, themeStyles.cardBg, themeStyles.cardBorder]}>
          {/* Address Line 1 */}
          <View style={styles.rowInput}>
            <Text style={[styles.rowLabel, themeStyles.textTitle, addressError && styles.labelError]}>Street</Text>
            <TextInput
              style={[styles.input, themeStyles.textTitle]}
              placeholder="Required (5+ chars)"
              placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
              value={dataForm.line1}
              onChangeText={(text) => handleChange('line1', text)}
            />
          </View>
          
          <View style={[styles.separator, themeStyles.separatorColor]} />
          
          {/* Address Line 2 */}
          <View style={styles.rowInput}>
            <Text style={[styles.rowLabel, themeStyles.textTitle]}>Street 2</Text>
            <TextInput
              style={[styles.input, themeStyles.textTitle]}
              placeholder="Apt, suite, unit (optional)"
              placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
              value={dataForm.line2}
              onChangeText={(text) => handleChange('line2', text)}
            />
          </View>
          
          <View style={[styles.separator, themeStyles.separatorColor]} />
          
          {/* City */}
          <View style={styles.rowInput}>
            <Text style={[styles.rowLabel, themeStyles.textTitle]}>City</Text>
            <TextInput
              style={[styles.input, themeStyles.textTitle]}
              placeholder="Optional"
              placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
              value={dataForm.city}
              onChangeText={(text) => handleChange('city', text)}
            />
          </View>
          
          <View style={[styles.separator, themeStyles.separatorColor]} />
          
          {/* State */}
          <View style={styles.rowInput}>
            <Text style={[styles.rowLabel, themeStyles.textTitle]}>State</Text>
            <TextInput
              style={[styles.input, themeStyles.textTitle]}
              placeholder="Optional"
              placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
              value={dataForm.state}
              onChangeText={(text) => handleChange('state', text)}
            />
          </View>
          
          <View style={[styles.separator, themeStyles.separatorColor]} />
          
          {/* Zip */}
          <View style={styles.rowInput}>
            <Text style={[styles.rowLabel, themeStyles.textTitle]}>Zip Code</Text>
            <TextInput
              style={[styles.input, themeStyles.textTitle]}
              placeholder="Optional"
              placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
              keyboardType="number-pad"
              value={dataForm.zip}
              onChangeText={(text) => handleChange('zip', text)}
            />
          </View>
        </View>
        
        {addressError && <Text style={styles.errorHelper}>Address must be at least 5 characters</Text>}

        <TouchableOpacity
          style={[styles.primaryButton, themeStyles.btnPrimary]}
          onPress={storeCustomer}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Create Customer</Text>
          )}
        </TouchableOpacity>
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
  bg: { backgroundColor: '#f2f2f7' }, // iOS Grouped Background Light
  cardBg: { backgroundColor: '#ffffff' },
  cardBorder: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
  textTitle: { color: '#000000' },
  separatorColor: { backgroundColor: 'rgba(0,0,0,0.08)' },
  btnPrimary: { backgroundColor: '#007aff' }, // iOS System Blue
});

const darkStyles = StyleSheet.create({
  bg: { backgroundColor: '#000000' }, // iOS Grouped Background Dark
  cardBg: { backgroundColor: '#1c1c1e' }, // iOS System Gray 6 Dark
  cardBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  textTitle: { color: '#ffffff' },
  separatorColor: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnPrimary: { backgroundColor: '#0A84FF' }, // iOS System Blue Dark
});
