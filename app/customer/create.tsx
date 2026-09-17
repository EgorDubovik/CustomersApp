import React, { useEffect, useRef, useState } from 'react';
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
  KeyboardTypeOptions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
import AiParseModal, { AiParsedFields, PulsingOrb } from '@/components/customer/AiParseModal';

type FormKey = 'name' | 'phone' | 'email' | 'line1' | 'line2' | 'city' | 'state' | 'zip';

export default function CreateCustomerScreen() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;
  // Pre-filled when coming from a conversation with an unknown caller
  const { phone: presetPhone } = useLocalSearchParams<{ phone?: string }>();

  const [dataForm, setDataForm] = useState({
    name: '',
    phone: presetPhone ? String(presetPhone).replace(/\D/g, '').replace(/^1(\d{10})$/, '$1') : '',
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

  // ─── AI helper ───
  const [aiOpen, setAiOpen] = useState(false);
  // Timestamp per field of the last AI fill — each row glows when its stamp changes
  const [aiFilledAt, setAiFilledAt] = useState<Partial<Record<FormKey, number>>>({});
  const fillTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => fillTimers.current.forEach(clearTimeout), []);

  // Fields land one after another so it reads like the assistant typing them in
  const applyAiFields = (fields: AiParsedFields) => {
    setAiOpen(false);
    fillTimers.current.forEach(clearTimeout);
    fillTimers.current = [];
    const entries = Object.entries(fields) as [FormKey, string][];
    entries.forEach(([key, value], i) => {
      fillTimers.current.push(
        setTimeout(() => {
          const clean = key === 'phone' ? value.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1') : value.trim();
          setDataForm((prev) => ({ ...prev, [key]: clean }));
          setAiFilledAt((prev) => ({ ...prev, [key]: Date.now() }));
          if (key === 'phone') setPhoneError(false);
          if (key === 'line1') setAddressError(false);
        }, 250 + i * 140),
      );
    });
    fillTimers.current.push(setTimeout(() => showToast({ message: `AI filled ${entries.length} field${entries.length === 1 ? '' : 's'}`, type: 'success' }), 250 + entries.length * 140));
  };

  const inputProps = (key: FormKey) => ({
    value: dataForm[key],
    onChangeText: (text: string) => handleChange(key, text),
    highlightAt: aiFilledAt[key],
    isDark,
  });

  return (
    <KeyboardAvoidingView
      style={[styles.container, themeStyles.bg]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: 'Create Customer',
          headerTitleStyle: {
            fontWeight: '700',
          },
          // Chevron only — the previous route's name ("(tabs)") is noise
          headerBackButtonDisplayMode: 'minimal',
          headerBackTitle: '',
          headerRight: () => (
            <TouchableOpacity onPress={() => setAiOpen(true)} style={styles.headerAiBtn} hitSlop={8} activeOpacity={0.7}>
              <PulsingOrb size={30} iconSize={14} active={false} />
            </TouchableOpacity>
          ),
        }}
      />
      <AiParseModal visible={aiOpen} onClose={() => setAiOpen(false)} onParsed={applyAiFields} isDark={isDark} />
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
          <FormRow label="Name" placeholder="Required" autoCorrect={false} {...inputProps('name')} />

          <View style={[styles.separator, themeStyles.separatorColor]} />

          <FormRow label="Phone" placeholder="Required (10+ digits)" keyboardType="phone-pad" autoCorrect={false} error={phoneError} {...inputProps('phone')} />

          <View style={[styles.separator, themeStyles.separatorColor]} />

          <FormRow label="Email" placeholder="Optional" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} {...inputProps('email')} />
        </View>

        {phoneError && <Text style={styles.errorHelper}>Phone number must be at least 10 digits</Text>}

        <Text style={styles.sectionHeader}>Address</Text>

        <View style={[styles.groupContainer, themeStyles.cardBg, themeStyles.cardBorder]}>
          <FormRow label="Street" placeholder="Required (5+ chars)" error={addressError} {...inputProps('line1')} />

          <View style={[styles.separator, themeStyles.separatorColor]} />

          <FormRow label="Street 2" placeholder="Apt, suite, unit (optional)" {...inputProps('line2')} />

          <View style={[styles.separator, themeStyles.separatorColor]} />

          <FormRow label="City" placeholder="Optional" {...inputProps('city')} />

          <View style={[styles.separator, themeStyles.separatorColor]} />

          <FormRow label="State" placeholder="Optional" {...inputProps('state')} />

          <View style={[styles.separator, themeStyles.separatorColor]} />

          <FormRow label="Zip Code" placeholder="Optional" keyboardType="number-pad" {...inputProps('zip')} />
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

/** One settings-style row; flashes a soft green tint whenever the AI fills it (highlightAt changes) */
function FormRow({
  label,
  placeholder,
  value,
  onChangeText,
  highlightAt,
  error,
  isDark,
  ...inputProps
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  highlightAt?: number;
  error?: boolean;
  isDark: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}) {
  const themeStyles = isDark ? darkStyles : lightStyles;
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!highlightAt) return;
    glow.value = 0;
    glow.value = withSequence(withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }), withDelay(1400, withTiming(0, { duration: 900 })));
  }, [highlightAt]);
  const glowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(glow.value, [0, 1], ['rgba(52,211,153,0)', isDark ? 'rgba(52,211,153,0.22)' : 'rgba(52,211,153,0.16)']),
  }));

  return (
    <Animated.View style={[styles.rowInput, glowStyle]}>
      <Text style={[styles.rowLabel, themeStyles.textTitle, error && styles.labelError]}>{label}</Text>
      <TextInput
        style={[styles.input, themeStyles.textTitle]}
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
        value={value}
        onChangeText={onChangeText}
        {...inputProps}
      />
    </Animated.View>
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
  headerAiBtn: {
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
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
