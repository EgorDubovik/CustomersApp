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
      <Stack.Screen options={{ title: 'Create Customer' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.sectionTitle, themeStyles.textTitle]}>Enter customer information</Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <Text style={[styles.label, themeStyles.textTitle]}>Customer name</Text>
          <TextInput
            style={[styles.input, themeStyles.inputBg, themeStyles.textTitle]}
            placeholder="Name"
            placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
            value={dataForm.name}
            onChangeText={(text) => handleChange('name', text)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, themeStyles.textTitle]}>Customer number</Text>
          <TextInput
            style={[
              styles.input,
              themeStyles.inputBg,
              themeStyles.textTitle,
              phoneError && styles.inputError
            ]}
            placeholder="Phone"
            placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
            keyboardType="phone-pad"
            value={dataForm.phone}
            onChangeText={(text) => handleChange('phone', text)}
          />
          {phoneError && <Text style={styles.errorHelper}>Phone number must be at least 10 digits</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, themeStyles.textTitle]}>Customer Email</Text>
          <TextInput
            style={[styles.input, themeStyles.inputBg, themeStyles.textTitle]}
            placeholder="Email"
            placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
            keyboardType="email-address"
            autoCapitalize="none"
            value={dataForm.email}
            onChangeText={(text) => handleChange('email', text)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, themeStyles.textTitle]}>Address</Text>
          <TextInput
            style={[
              styles.input,
              themeStyles.inputBg,
              themeStyles.textTitle,
              addressError && styles.inputError
            ]}
            placeholder="1234 Main St"
            placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
            value={dataForm.line1}
            onChangeText={(text) => handleChange('line1', text)}
          />
          {addressError && <Text style={styles.errorHelper}>Address must be at least 5 characters</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, themeStyles.textTitle]}>Address2</Text>
          <TextInput
            style={[styles.input, themeStyles.inputBg, themeStyles.textTitle]}
            placeholder="Apartment, studio, or floor"
            placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
            value={dataForm.line2}
            onChangeText={(text) => handleChange('line2', text)}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 2, marginRight: 8 }]}>
            <Text style={[styles.label, themeStyles.textTitle]}>City</Text>
            <TextInput
              style={[styles.input, themeStyles.inputBg, themeStyles.textTitle]}
              placeholder="Enter City"
              placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
              value={dataForm.city}
              onChangeText={(text) => handleChange('city', text)}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={[styles.label, themeStyles.textTitle]}>State</Text>
            <TextInput
              style={[styles.input, themeStyles.inputBg, themeStyles.textTitle]}
              placeholder="State"
              placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
              value={dataForm.state}
              onChangeText={(text) => handleChange('state', text)}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={[styles.label, themeStyles.textTitle]}>Zip</Text>
            <TextInput
              style={[styles.input, themeStyles.inputBg, themeStyles.textTitle]}
              placeholder="Zip"
              placeholderTextColor={isDark ? '#888ea8' : '#888ea8'}
              value={dataForm.zip}
              onChangeText={(text) => handleChange('zip', text)}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, themeStyles.btnPrimary]}
          onPress={storeCustomer}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create</Text>
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
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  errorContainer: {
    backgroundColor: '#ffe5e6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#e7515a',
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputError: {
    borderColor: '#e7515a',
    borderWidth: 1,
  },
  errorHelper: {
    color: '#e7515a',
    fontSize: 12,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

const lightStyles = StyleSheet.create({
  bg: { backgroundColor: '#f6f8fa' },
  inputBg: { backgroundColor: '#ffffff', borderColor: '#e0e6ed' },
  textTitle: { color: '#0e1726' },
  btnPrimary: { backgroundColor: '#4361ee' },
});

const darkStyles = StyleSheet.create({
  bg: { backgroundColor: '#060818' },
  inputBg: { backgroundColor: '#0e1726', borderColor: '#1b2e4b' },
  textTitle: { color: '#bfc9d4' },
  btnPrimary: { backgroundColor: '#805dca' },
});
