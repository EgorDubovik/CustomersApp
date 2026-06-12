import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';

const { width, height: screenHeight } = Dimensions.get('screen');

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { login } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [securePassword, setSecurePassword] = useState(true);

  const isDark = colorScheme === 'dark';

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${API_URL}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.status === 200 || response.status === 201) {
        if (data.success?.token) {
          await login(data.success.token, {
            name: data.user?.name || 'User',
            email: data.user?.email || email,
          });
        } else {
          setErrorMessage('Login succeeded but token was not returned.');
        }
      } else {
        setErrorMessage(data.message || data.error || 'Authentication failed. Please try again.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err.message === 'Network request failed'
          ? 'Network error. Please ensure NestJS backend is running and reachable.'
          : 'An error occurred. Please try again later.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { height: screenHeight }]}>
      {/* Background Gradient */}
      <Image
        source={require('../assets/images/auth/bg-gradient.png')}
        style={[StyleSheet.absoluteFill, { height: screenHeight }]}
        resizeMode="stretch"
      />

      {/* Map Overlay */}
      <Image
        source={require('../assets/images/auth/map.png')}
        style={[StyleSheet.absoluteFill, { height: screenHeight, opacity: isDark ? 0.15 : 0.4 }]}
        resizeMode="stretch"
      />

      {/* Floating Objects - Premium Design */}
      <Image
        source={require('../assets/images/auth/coming-soon-object1.png')}
        style={styles.floatingObj1}
        resizeMode="contain"
      />
      <Image
        source={require('../assets/images/auth/coming-soon-object2.png')}
        style={styles.floatingObj2}
        resizeMode="contain"
      />
      <Image
        source={require('../assets/images/auth/coming-soon-object3.png')}
        style={styles.floatingObj3}
        resizeMode="contain"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Glassmorphic Login Card */}
          <View
            style={[
              styles.card,
              isDark ? styles.cardDark : styles.cardLight,
              { shadowColor: isDark ? '#000' : '#4361ee' },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>SIGN IN</Text>
              <Text style={styles.subtitle}>Enter your email and password to login</Text>
            </View>

            {/* Error Message */}
            {!!errorMessage && (
              <View style={[styles.errorContainer, isDark ? styles.errorDark : styles.errorLight]}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            {/* Form Fields */}
            <View style={styles.form}>
              {/* Email Field */}
              <View style={styles.inputWrapper}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>Email</Text>
                <View
                  style={[
                    styles.inputContainer,
                    isDark ? styles.inputContainerDark : styles.inputContainerLight,
                  ]}
                >
                  <SymbolView
                    name={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
                    size={20}
                    tintColor="#888ea8"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, isDark ? styles.inputDarkText : styles.inputLightText]}
                    placeholder="Enter Email"
                    placeholderTextColor="#888ea8"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Password Field */}
              <View style={styles.inputWrapper}>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>Password</Text>
                <View
                  style={[
                    styles.inputContainer,
                    isDark ? styles.inputContainerDark : styles.inputContainerLight,
                  ]}
                >
                  <SymbolView
                    name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
                    size={20}
                    tintColor="#888ea8"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, isDark ? styles.inputDarkText : styles.inputLightText]}
                    placeholder="Enter Password"
                    placeholderTextColor="#888ea8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={securePassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setSecurePassword(!securePassword)}
                    style={styles.eyeIcon}
                  >
                    <SymbolView
                      name={
                        securePassword
                          ? { ios: 'eye.slash.fill', android: 'visibility_off', web: 'visibility_off' }
                          : { ios: 'eye.fill', android: 'visibility', web: 'visibility' }
                      }
                      size={20}
                      tintColor="#888ea8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign In Button */}
              <TouchableOpacity
                style={styles.buttonWrapper}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#4361ee', '#805dca']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.button}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>SIGN IN</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.footer}>
                <Text style={[styles.footerText, isDark ? styles.textDark : styles.textLight]}>
                  Don't have an account ?{' '}
                </Text>
                <TouchableOpacity>
                  <Text style={styles.signUpLink}>SIGN UP</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060818',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  // Floating design items matching web layout
  floatingObj1: {
    position: 'absolute',
    left: -50,
    top: '30%',
    width: 150,
    height: 300,
    opacity: 0.7,
  },
  floatingObj2: {
    position: 'absolute',
    left: '10%',
    top: -30,
    width: 120,
    height: 120,
    opacity: 0.5,
  },
  floatingObj3: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 200,
    height: 200,
    opacity: 0.6,
  },
  // Card styles
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    // Shadow for iOS/Android
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  cardLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  cardDark: {
    backgroundColor: 'rgba(14, 23, 38, 0.75)',
    borderColor: 'rgba(14, 23, 38, 0.4)',
  },
  header: {
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#4361ee',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888ea8',
    marginTop: 6,
  },
  // Error Box
  errorContainer: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    borderWidth: 1,
    width: '100%',
  },
  errorLight: {
    backgroundColor: '#fff5f5',
    borderColor: 'rgba(231, 81, 90, 0.25)',
  },
  errorDark: {
    backgroundColor: 'rgba(231, 81, 90, 0.15)',
    borderColor: 'rgba(231, 81, 90, 0.3)',
  },
  errorText: {
    color: '#e7515a',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputWrapper: {
    marginBottom: 20,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  textLight: {
    color: '#3b3f5c',
  },
  textDark: {
    color: '#e0e6ed',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    height: 48,
    paddingHorizontal: 12,
    position: 'relative',
  },
  inputContainerLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e0e6ed',
  },
  inputContainerDark: {
    backgroundColor: '#1b2e4b',
    borderColor: '#253b5c',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
  },
  inputLightText: {
    color: '#0e1726',
  },
  inputDarkText: {
    color: '#f1f2f3',
  },
  eyeIcon: {
    padding: 6,
  },
  // Button
  buttonWrapper: {
    marginTop: 10,
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#4361ee',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  button: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
  },
  signUpLink: {
    color: '#4361ee',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
