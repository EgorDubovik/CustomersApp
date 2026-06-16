import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height: screenHeight } = Dimensions.get('screen');

const headerBgSource = require('../assets/images/auth/login-header-bg.png');
const resolvedBgAsset = Image.resolveAssetSource(headerBgSource);
const bgAspectRatio = resolvedBgAsset ? resolvedBgAsset.height / resolvedBgAsset.width : 2.0;
const scaledBgHeight = width * bgAspectRatio;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [securePassword, setSecurePassword] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);

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
    <View style={styles.container}>
      {/* Background Floating Objects */}
      <Image
        source={require('../assets/images/auth/coming-soon-object3.png')}
        style={styles.bgObjectBottomRight}
        resizeMode="contain"
      />
      <Image
        source={require('../assets/images/auth/coming-soon-object1.png')}
        style={styles.bgObjectMiddleLeft}
        resizeMode="contain"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section with 3D Ribbons Background */}
          <View style={styles.headerSection}>
            <Image
              source={headerBgSource}
              style={styles.headerBg}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', '#030712']}
              style={styles.headerGradient}
            />
            <View style={[styles.headerTextContainer, { paddingTop: insets.top + 65 }]}>
              <Text style={styles.title}>LOGIN TO</Text>
              <Text style={styles.title}>YOUR ACCOUNT</Text>
            </View>
          </View>

          {/* Form Content */}
          <BlurView
            intensity={35}
            tint="dark"
            style={styles.formContainer}
          >
            <Text style={styles.subtitle}>Enter your login information</Text>

            {/* Error Message */}
            {!!errorMessage && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <SymbolView
                name={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
                size={20}
                tintColor="#64748b"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <SymbolView
                name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
                size={20}
                tintColor="#64748b"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#475569"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={securePassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setSecurePassword(!securePassword)}
                style={styles.eyeIcon}
                activeOpacity={0.7}
              >
                <SymbolView
                  name={
                    securePassword
                      ? { ios: 'eye.slash.fill', android: 'visibility_off', web: 'visibility_off' }
                      : { ios: 'eye.fill', android: 'visibility', web: 'visibility' }
                  }
                  size={20}
                  tintColor="#64748b"
                />
              </TouchableOpacity>
            </View>

            {/* Remember Me & Forgot Password */}
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setRememberMe(!rememberMe)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                  {rememberMe && (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                      size={12}
                      tintColor="#ffffff"
                    />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>Remember me</Text>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.forgotPasswordText}>Forgot password</Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.loginButtonText}>LOGIN</Text>
              )}
            </TouchableOpacity>

            {/* Footer Sign Up */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.signUpLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712', // deep slate/black
  },
  bgObjectBottomRight: {
    position: 'absolute',
    bottom: -40,
    right: -40,
    width: 260,
    height: 260,
    opacity: 0.35, // subtle glow behind the form
  },
  bgObjectMiddleLeft: {
    position: 'absolute',
    top: '35%',
    left: -50,
    width: 200,
    height: 200,
    opacity: 0.25, // subtle glow
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: 'transparent', // transparent to let background objects show through
    paddingBottom: 40,
  },
  headerSection: {
    height: 380, // Taller header section to push ribbons down naturally
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBg: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: width,
    height: scaledBgHeight,
  },
  headerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: Math.max(380, scaledBgHeight - 150), // Position gradient at bottom of container or bottom of image, whichever is larger
    height: 150,
  },
  headerTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '600', // Made less bold/fat as requested
    color: '#ffffff',
    letterSpacing: 1.5,
    textAlign: 'center',
    lineHeight: 38,
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 40,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(3, 7, 18, 0.45)', // dark glass backplate
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 28,
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    height: 56,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#f8fafc',
    fontSize: 16,
  },
  eyeIcon: {
    padding: 6,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: '#475569',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: 'transparent',
  },
  checkboxActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkboxLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  forgotPasswordText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: '#2563eb',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 28,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  footerText: {
    color: '#64748b',
    fontSize: 14,
  },
  signUpLink: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
});
