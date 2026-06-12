import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  GestureResponderEvent,
  Dimensions,
  Linking,
  Platform,
  PanResponder,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, CompanyService } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as storage from '@/utils/storage';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ITech {
  id: number;
  name: string;
  color: string;
}

interface ITimer {
  id: number;
  started_at: string;
  stopped_at: string | null;
  started_by?: { name: string };
  stopped_by?: { name: string };
}

interface IService {
  id: number;
  name?: string;
  title?: string;
  description?: string;
  price: string;
  taxable?: boolean;
  is_active: boolean;
}

interface IPayment {
  id: number;
  amount: string;
  created_at: string;
  type_text?: string;
}

interface IAppointmentDetails {
  id: number;
  status: number;
  start: string;
  end: string;
  timers: ITimer[];
  techs: ITech[];
  job: {
    id: number;
    totalAmount: number;
    remainingBalance: number;
    services: IService[];
    payments: IPayment[];
    address?: { full: string };
    customer?: { id: number; name: string; email: string; phone: string; jobsCount: number; addresses?: { full: string }[] };
    appointments?: { id: number; status: number; start: string; end: string; techs?: { id: number; name: string; color: string }[] }[];
  };
}

// ─── Drawing Pad State ────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

// ─── Color Palette ────────────────────────────────────────────────────────────

const palette = {
  light: {
    bg: '#F0F2F5',
    card: 'rgba(255,255,255,0.92)',
    cardBorder: 'rgba(0,0,0,0.06)',
    primary: '#6366F1',
    primaryMuted: 'rgba(99,102,241,0.12)',
    success: '#10B981',
    successMuted: 'rgba(16,185,129,0.12)',
    warning: '#F59E0B',
    warningMuted: 'rgba(245,158,11,0.12)',
    danger: '#EF4444',
    dangerMuted: 'rgba(239,68,68,0.10)',
    text: '#1E293B',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    divider: 'rgba(0,0,0,0.06)',
    inputBg: 'rgba(0,0,0,0.03)',
    timerItemBg: 'rgba(0,0,0,0.03)',
    heroGradient: ['#6366F1', '#818CF8'] as [string, string],
    heroGradientSuccess: ['#059669', '#10B981'] as [string, string],
    heroGradientWarning: ['#D97706', '#F59E0B'] as [string, string],
    shadow: '#000',
  },
  dark: {
    bg: '#0F172A',
    card: 'rgba(30,41,59,0.85)',
    cardBorder: 'rgba(255,255,255,0.06)',
    primary: '#818CF8',
    primaryMuted: 'rgba(129,140,248,0.15)',
    success: '#34D399',
    successMuted: 'rgba(52,211,153,0.15)',
    warning: '#FBBF24',
    warningMuted: 'rgba(251,191,36,0.15)',
    danger: '#F87171',
    dangerMuted: 'rgba(248,113,113,0.12)',
    text: '#F1F5F9',
    textSecondary: '#CBD5E1',
    textMuted: '#64748B',
    divider: 'rgba(255,255,255,0.06)',
    inputBg: 'rgba(255,255,255,0.05)',
    timerItemBg: 'rgba(255,255,255,0.04)',
    heroGradient: ['#4338CA', '#6366F1'] as [string, string],
    heroGradientSuccess: ['#047857', '#059669'] as [string, string],
    heroGradientWarning: ['#B45309', '#D97706'] as [string, string],
    shadow: '#000',
  },
};

// ─── Pulsing Dot Component ────────────────────────────────────────────────────

function PulsingDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: color,
          },
          animStyle,
        ]}
      />
    </View>
  );
}

// ─── Avatar Initials Component ────────────────────────────────────────────────

function AvatarInitials({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <LinearGradient
      colors={['#6366F1', '#A78BFA']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '800', letterSpacing: 1 }}>
        {initials}
      </Text>
    </LinearGradient>
  );
}

// ─── Progress Bar Component ───────────────────────────────────────────────────

function PaymentProgressBar({ total, remaining, isDark }: { total: number; remaining: number; isDark: boolean }) {
  const paid = total - remaining;
  const pct = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0;
  const c = isDark ? palette.dark : palette.light;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: c.success }}>
          Paid: ${paid.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: c.danger }}>
          Due: ${remaining.toFixed(2)}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.inputBg, overflow: 'hidden' }}>
        <LinearGradient
          colors={isDark ? ['#34D399', '#6EE7B7'] : ['#10B981', '#34D399']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 6, borderRadius: 3, width: `${pct * 100}%` as any }}
        />
      </View>
    </View>
  );
}

// ─── Info Row with Icon ───────────────────────────────────────────────────────

function InfoRowIcon({
  icon,
  label,
  value,
  isDark,
  valueStyle,
}: {
  icon: any;
  label: string;
  value: string;
  isDark: boolean;
  valueStyle?: any;
}) {
  const c = isDark ? palette.dark : palette.light;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: c.primaryMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SymbolView name={icon} size={16} tintColor={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
        <Text style={[{ fontSize: 14, fontWeight: '600', color: c.text }, valueStyle]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Screen Component ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export default function AppointmentDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const { token, companySettings, companyServices } = useAuth();

  const createSwipePanResponder = (onClose: () => void) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 60 || gestureState.vy > 0.4) {
          onClose();
        }
      },
    });
  };

  const panCopy = useRef(createSwipePanResponder(() => setCopyModalVisible(false))).current;
  const panPay = useRef(createSwipePanResponder(() => setPayModalVisible(false))).current;
  const panHistory = useRef(createSwipePanResponder(() => setHistoryModalVisible(false))).current;
  const panJobHistory = useRef(createSwipePanResponder(() => setJobHistoryModalVisible(false))).current;
  const { showToast } = useToast();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? palette.dark : palette.light;

  // State
  const [appointment, setAppointment] = useState<IAppointmentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Loading sub-states
  const [statusLoading, setStatusLoading] = useState(false);
  const [timerLoading, setTimerLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);

  // Modals Visibility
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [jobHistoryModalVisible, setJobHistoryModalVisible] = useState(false);

  // Active Timer Elapsed state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Copy Modal Selection States
  const [copyDate, setCopyDate] = useState<Date>(new Date());
  const [copyDurationHours, setCopyDurationHours] = useState<number>(2);
  const [isFinishCurrentAppointment, setIsFinishCurrentAppointment] = useState(true);

  // Pay Modal States
  const [payAmount, setPayAmount] = useState('0');
  const [selectedPaymentType, setSelectedPaymentType] = useState<number>(1); // 1 = Credit, 2 = Cash, 3 = Check, 4 = Transfer
  const [sendInvoice, setSendInvoice] = useState(true);
  const [allSignatureLines, setAllSignatureLines] = useState<Point[][]>([]);
  const [currentSignatureLine, setCurrentSignatureLine] = useState<Point[]>([]);

  // Timer reference interval
  const timerIntervalRef = useRef<any>(null);

  // Service Modal States
  const [serviceModalVisible, setServiceModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<IService | null>(null);
  const [serviceTitle, setServiceTitle] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceTaxable, setServiceTaxable] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [serviceFormLoading, setServiceFormLoading] = useState(false);

  const panService = useRef(createSwipePanResponder(() => setServiceModalVisible(false))).current;

  // AI Description Generator states
  const [aiStatus, setAiStatus] = useState<'none' | 'loading' | 'success' | 'error'>('none');
  const [aiDots, setAiDots] = useState('.');
  const aiAnim = useSharedValue(0);

  useEffect(() => {
    if (aiStatus === 'loading') {
      aiAnim.value = withRepeat(
        withTiming(1, { duration: 1000, easing: Easing.linear }),
        -1,
        true
      );
    } else {
      aiAnim.value = 0;
    }
  }, [aiStatus]);

  useEffect(() => {
    let interval: any;
    if (aiStatus === 'loading') {
      setAiDots('.');
      interval = setInterval(() => {
        setAiDots((prev) => {
          if (prev === '.') return '..';
          if (prev === '..') return '...';
          return '.';
        });
      }, 400);
    } else {
      setAiDots('.');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [aiStatus]);

  const aiAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: aiStatus === 'loading'
            ? withTiming(1.06 + 0.04 * Math.sin(aiAnim.value * Math.PI * 2), { duration: 100 })
            : withTiming(1, { duration: 200 })
        }
      ],
      opacity: aiStatus === 'loading'
        ? withTiming(0.6 + 0.4 * Math.sin(aiAnim.value * Math.PI * 2), { duration: 100 })
        : withTiming(1, { duration: 200 })
    };
  });

  // Caching default taxable setting
  const [defaultTaxable, setDefaultTaxable] = useState(true);

  useEffect(() => {
    const loadDefaultTaxable = async () => {
      try {
        const val = await storage.getItem('last_taxable_setting');
        if (val !== null) {
          setDefaultTaxable(val === 'true');
        }
      } catch (e) {
        console.error('Failed to load default taxable setting', e);
      }
    };
    loadDefaultTaxable();
  }, []);

  // Fetch Appointment Details
  const fetchDetails = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${API_URL}/appointments/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      const data = await response.json();
      setAppointment(data);
      setPayAmount((data.job?.remainingBalance || 0).toString());
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load appointment details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id && token) {
      fetchDetails();
    }
  }, [id, token]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (id && token) {
        fetchDetails(true);
      }
    });
    return unsubscribe;
  }, [navigation, id, token]);

  // Timer history accumulator & ticking effect
  useEffect(() => {
    if (!appointment) return;

    const timers = appointment.timers || [];
    const activeTimer = timers.find((t) => !t.stopped_at);

    // Compute base completed seconds
    let baseSeconds = 0;
    timers.forEach((t) => {
      if (t.stopped_at) {
        const startMs = Date.parse(t.started_at);
        const stopMs = Date.parse(t.stopped_at);
        if (!isNaN(startMs) && !isNaN(stopMs)) {
          baseSeconds += Math.max(0, Math.floor((stopMs - startMs) / 1000));
        }
      }
    });

    if (activeTimer) {
      const startMs = Date.parse(activeTimer.started_at);
      const updateTicking = () => {
        const diffMs = Date.now() - startMs;
        setElapsedSeconds(baseSeconds + Math.max(0, Math.floor(diffMs / 1000)));
      };
      updateTicking();
      timerIntervalRef.current = setInterval(updateTicking, 1000);
    } else {
      setElapsedSeconds(baseSeconds);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [appointment]);

  // Format dynamic elapsed time: HH:MM:SS
  const formatTimerText = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ─── Header Button Actions ──────────────────────────────────────────────────

  // 1. Status Update Flow
  const updateAppointmentStatus = async (withSms: boolean) => {
    if (statusLoading || !appointment) return;
    setStatusLoading(true);
    try {
      const response = await fetch(`${API_URL}/appointments/status/${appointment.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ send_text: withSms ? 1 : 0 }),
      });

      if (!response.ok) {
        throw new Error('Status update failed');
      }

      await fetchDetails(true);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to update status.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleStatusPress = () => {
    if (!appointment) return;
    if (appointment.status === 0) {
      // Prompt for SMS
      Alert.alert(
        'On My Way',
        'Do you want to send a text notification to the client?',
        [
          { text: 'Send SMS', onPress: () => updateAppointmentStatus(true) },
          { text: 'Just Update Status', onPress: () => updateAppointmentStatus(false) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      updateAppointmentStatus(false);
    }
  };

  // 2. Timer Toggle Flow
  const handleToggleTimer = async () => {
    if (timerLoading || !appointment) return;
    const timers = appointment.timers || [];
    const isRunning = timers.some((t) => !t.stopped_at);

    setTimerLoading(true);
    try {
      const response = await fetch(`${API_URL}/appointments/${appointment.id}/timer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: isRunning ? 'stop' : 'start' }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle timer');
      }

      await fetchDetails(true);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Action failed.');
    } finally {
      setTimerLoading(false);
    }
  };

  // 3. Create Copy Flow
  const handleCreateCopy = async () => {
    if (copyLoading || !appointment) return;
    setCopyLoading(true);

    const timeFromStr = copyDate.toISOString();
    const timeToStr = new Date(copyDate.getTime() + copyDurationHours * 3600_000).toISOString();

    try {
      const response = await fetch(`${API_URL}/appointments/copy/${appointment.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeFrom: timeFromStr,
          timeTo: timeToStr,
          isFinishCurrentAppointment,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to copy appointment');
      }

      const resData = await response.json();
      setCopyModalVisible(false);
      Alert.alert('Success', 'New appointment created successfully.');
      router.push(`/appointment/${resData.appointment.id}` as any);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to create copy.');
    } finally {
      setCopyLoading(false);
    }
  };

  // 4. Payment Submission Flow
  const handleAddPayment = async () => {
    if (payLoading || !appointment) return;
    const finalAmount = parseFloat(payAmount);

    if (isNaN(finalAmount) || finalAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to pay.');
      return;
    }

    if (selectedPaymentType === 1 && allSignatureLines.length === 0) {
      Alert.alert('Signature Required', 'Please draw a signature for Credit Card payment.');
      return;
    }

    setPayLoading(true);

    // Tiny transparent PNG to satisfy backend buffer processes
    const mockSignatureBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const payload: any = {
      amount: finalAmount,
      payment_type: selectedPaymentType,
      send_invoice: sendInvoice,
      appointment_id: appointment.id,
    };

    if (selectedPaymentType === 1) {
      payload.signature = mockSignatureBase64;
    }

    try {
      const response = await fetch(`${API_URL}/payments/job/${appointment.job.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Payment request failed');
      }

      const resData = await response.json();
      if (resData.info) {
        Alert.alert('Info', resData.info);
      } else {
        Alert.alert('Success', 'Payment saved successfully.');
      }
      setPayModalVisible(false);
      setAllSignatureLines([]);
      await fetchDetails(true);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Payment submission failed.');
    } finally {
      setPayLoading(false);
    }
  };

  // ─── Services CRUD & Autocomplete Handlers ─────────────────────────
  const handleOpenAddService = () => {
    setEditingService(null);
    setServiceTitle('');
    setServicePrice('');
    setServiceDescription('');
    setServiceTaxable(defaultTaxable);
    setShowSuggestions(false);
    setServiceModalVisible(true);
  };

  const handleToggleTaxable = async (value: boolean) => {
    setServiceTaxable(value);
    if (!editingService) {
      setDefaultTaxable(value);
      try {
        await storage.setItem('last_taxable_setting', value.toString());
      } catch (e) {
        console.error('Failed to save taxable setting', e);
      }
    }
  };

  const handleAI = async () => {
    if (aiStatus === 'loading') return;

    if (!serviceDescription.trim()) {
      Alert.alert('Required Field', 'Please fill in description field');
      setAiStatus('error');
      setTimeout(() => {
        setAiStatus('none');
      }, 2000);
      return;
    }

    setAiStatus('loading');
    try {
      const response = await fetch(`${API_URL}/jobs/generate-report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: serviceTitle,
          description: serviceDescription,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI generation request failed: status ${response.status}`);
      }

      const resData = await response.json();
      if (resData.report) {
        setServiceDescription(resData.report);
        setAiStatus('success');
        setTimeout(() => {
          setAiStatus('none');
        }, 2000);
      } else {
        throw new Error('AI response is missing the report field');
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'AI failed to generate answer');
      setAiStatus('none');
    }
  };

  const handleOpenEditService = (svc: IService) => {
    setEditingService(svc);
    setServiceTitle(svc.title || svc.name || '');
    setServicePrice(parseFloat(svc.price).toString());
    setServiceDescription(svc.description || '');
    setServiceTaxable(svc.taxable || false);
    setShowSuggestions(false);
    setServiceModalVisible(true);
  };

  const handleSaveService = async () => {
    if (serviceFormLoading || !appointment) return;

    if (!serviceTitle.trim()) {
      Alert.alert('Required Field', 'Please enter a service title.');
      return;
    }

    const priceNum = parseFloat(servicePrice);
    if (isNaN(priceNum) || priceNum < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }

    setServiceFormLoading(true);

    const isEdit = !!editingService;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit
      ? `${API_URL}/jobs/services/${appointment.job.id}/${editingService.id}`
      : `${API_URL}/jobs/services/${appointment.job.id}`;

    const payload = {
      title: serviceTitle,
      price: priceNum,
      description: serviceDescription,
      taxable: serviceTaxable,
      is_active: true,
    };

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to save service: status ${response.status}`);
      }

      await fetchDetails(true);
      setServiceModalVisible(false);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Something went wrong while saving.');
    } finally {
      setServiceFormLoading(false);
    }
  };

  const handleDeleteService = () => {
    if (!editingService || !appointment) return;

    Alert.alert(
      'Delete Service',
      `Are you sure you want to delete "${serviceTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setServiceFormLoading(true);
            try {
              const response = await fetch(
                `${API_URL}/jobs/services/${appointment.job.id}/${editingService.id}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                  },
                }
              );

              if (!response.ok) {
                if (response.status === 403) {
                  throw new Error('You are not allowed to delete this service');
                }
                throw new Error(`Failed to delete service: status ${response.status}`);
              }

              await fetchDetails(true);
              setServiceModalVisible(false);
            } catch (err: any) {
              console.error(err);
              Alert.alert('Error', err.message || 'Something went wrong while deleting.');
            } finally {
              setServiceFormLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSelectCompanyService = (item: CompanyService) => {
    setServiceTitle(item.title);
    setServicePrice(parseFloat(item.price).toString());
    setServiceDescription(item.description || '');
    setShowSuggestions(false);
  };

  // Stepper handlers for copy modal Date/Time
  const changeCopyDay = (amount: number) => {
    setCopyDate(prev => {
      const newD = new Date(prev.getTime());
      newD.setDate(newD.getDate() + amount);
      return newD;
    });
  };

  const changeCopyHour = (amount: number) => {
    setCopyDate(prev => {
      const newD = new Date(prev.getTime());
      newD.setHours(newD.getHours() + amount);
      return newD;
    });
  };

  // ─── Touch Signature Canvas Handlers ────────────────────────────────────────

  const onSignatureTouchStart = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    setCurrentSignatureLine([{ x: locationX, y: locationY }]);
  };

  const onSignatureTouchMove = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    setCurrentSignatureLine(prev => [...prev, { x: locationX, y: locationY }]);
  };

  const onSignatureTouchEnd = () => {
    if (currentSignatureLine.length > 0) {
      setAllSignatureLines(prev => [...prev, currentSignatureLine]);
      setCurrentSignatureLine([]);
    }
  };

  // Segment drawing logic converting points to absolutely positioned Views
  const renderSignatureVectors = () => {
    const vectors: React.ReactNode[] = [];
    const lines = [...allSignatureLines, currentSignatureLine];

    lines.forEach((line, lineIdx) => {
      for (let i = 0; i < line.length - 1; i++) {
        const p1 = line[i];
        const p2 = line[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        if (length < 0.5) continue;

        vectors.push(
          <View
            key={`vec-${lineIdx}-${i}`}
            style={{
              position: 'absolute',
              left: (p1.x + p2.x) / 2 - length / 2,
              top: (p1.y + p2.y) / 2,
              width: length,
              height: 2.5,
              backgroundColor: '#000000',
              transform: [{ rotate: `${angle}rad` }],
            }}
          />
        );
      }
    });

    return vectors;
  };

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ alignItems: 'center', gap: 16 }}>
          <View style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.primaryMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <ActivityIndicator size="large" color={c.primary} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.textMuted }}>
            Loading details...
          </Text>
        </View>
      </View>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────────

  if (error || !appointment) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg, paddingHorizontal: 32 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{
          alignItems: 'center',
          gap: 16,
          padding: 32,
          backgroundColor: c.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: c.cardBorder,
        }}>
          <View style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.dangerMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <SymbolView
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
              size={28}
              tintColor={c.danger}
            />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center' }}>
            {error || 'Appointment data is empty.'}
          </Text>
          <Pressable
            onPress={() => fetchDetails()}
            style={({ pressed }) => ({
              backgroundColor: c.primary,
              paddingVertical: 12,
              paddingHorizontal: 32,
              borderRadius: 12,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Computed Values ────────────────────────────────────────────────────────

  const isTimerRunning = appointment.timers?.some((t) => !t.stopped_at);
  const statusConfig = [
    { label: 'Scheduled', color: c.primary, gradient: c.heroGradient, icon: { ios: 'car.fill', android: 'local_shipping', web: 'local_shipping' } as const, action: 'On My Way' },
    { label: 'Active', color: c.success, gradient: c.heroGradientSuccess, icon: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } as const, action: 'Finish' },
    { label: 'Finished', color: c.warning, gradient: c.heroGradientWarning, icon: { ios: 'arrow.counterclockwise.circle.fill', android: 'replay', web: 'replay' } as const, action: 'Reactivate' },
  ];
  const currentStatus = statusConfig[appointment.status] || statusConfig[0];
  const customerName = appointment.job.customer?.name || 'Unknown Client';
  const clientAddress = appointment.job.customer?.addresses?.[0]?.full || appointment.job.address?.full || '';

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── RENDER ─────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ═══ HERO SECTION ═══════════════════════════════════════════════════════ */}
      <Animated.View entering={FadeInDown.duration(500)}>
        <LinearGradient
          colors={currentStatus.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.heroBackBtn, pressed && { opacity: 0.7 }]}
            hitSlop={12}
          >
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={18}
              tintColor="#ffffff"
            />
          </Pressable>

          {/* Customer Name */}
          <Text style={styles.heroCustomerName}>{customerName}</Text>

          {/* Address — tap opens maps, copy button copies to clipboard */}
          {appointment.job.address?.full && (
            <Pressable
              onPress={() => {
                const address = encodeURIComponent(appointment.job.address!.full);
                const url = Platform.select({
                  ios: `maps://app?daddr=${address}`,
                  android: `google.navigation:q=${address}`,
                  default: `https://www.google.com/maps/dir/?api=1&destination=${address}`,
                });
                Linking.openURL(url);
              }}
              style={({ pressed }) => [styles.heroAddressRow, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.heroAddressIconWrap}>
                <SymbolView
                  name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
                  size={16}
                  tintColor="#ffffff"
                />
              </View>
              <Text style={styles.heroAddressText} numberOfLines={2}>
                {appointment.job.address.full}
              </Text>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  Clipboard.setStringAsync(appointment.job.address!.full);
                  showToast({ message: 'Address copied to clipboard', type: 'success' });
                }}
                style={({ pressed }) => [styles.heroCopyBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.35)' }]}
                hitSlop={6}
              >
                <SymbolView
                  name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
                  size={14}
                  tintColor="#ffffff"
                />
              </Pressable>
            </Pressable>
          )}

          {/* Date & Time */}
          <Pressable
            onPress={() => setJobHistoryModalVisible(true)}
            style={({ pressed }) => [styles.heroTimeRow, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.heroTimePill}>
              <SymbolView
                name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                size={12}
                tintColor="rgba(255,255,255,0.9)"
              />
              <Text style={styles.heroTimeText}>
                {formatDate(appointment.start, 'MMM DD, YYYY')}
              </Text>
            </View>
            <View style={styles.heroTimePill}>
              <SymbolView
                name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                size={12}
                tintColor="rgba(255,255,255,0.9)"
              />
              <Text style={styles.heroTimeText}>
                {formatDate(appointment.start, 'hh:mm A')} — {formatDate(appointment.end, 'hh:mm A')}
              </Text>
            </View>
          </Pressable>
        </LinearGradient>
      </Animated.View>

      {/* ═══ ACTION BUTTONS ═══════════════════════════════════════════════════ */}
      <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.actionRow}>
        {/* Status Action Button */}
        <Pressable
          onPress={handleStatusPress}
          disabled={statusLoading}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: appointment.status === 2 ? c.warningMuted : c.primaryMuted,
              borderColor: appointment.status === 2 ? c.warning : c.primary,
            },
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          {statusLoading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <>
              <SymbolView name={currentStatus.icon} size={16} tintColor={appointment.status === 2 ? c.warning : c.primary} />
              <Text style={[styles.actionBtnText, { color: appointment.status === 2 ? c.warning : c.primary }]}>
                {currentStatus.action}
              </Text>
            </>
          )}
        </Pressable>

        {/* Timer Button (only when active) */}
        {appointment.status === 1 && companySettings?.timerEnabled === 'true' && (
          <Pressable
            onPress={handleToggleTimer}
            disabled={timerLoading}
            style={({ pressed }) => [
              styles.actionBtnCircle,
              {
                backgroundColor: isTimerRunning ? c.dangerMuted : c.successMuted,
                borderColor: isTimerRunning ? c.danger : c.success,
              },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            {timerLoading ? (
              <ActivityIndicator size="small" color={isTimerRunning ? c.danger : c.success} />
            ) : (
              <SymbolView
                name={isTimerRunning ? { ios: 'pause.fill', android: 'pause', web: 'pause' } : { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                size={18}
                tintColor={isTimerRunning ? c.danger : c.success}
              />
            )}
          </Pressable>
        )}

        {/* Copy Button */}
        <Pressable
          onPress={() => { setCopyDate(new Date()); setCopyModalVisible(true); }}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: c.card, borderColor: c.cardBorder },
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <SymbolView
            name={{ ios: 'doc.on.doc.fill', android: 'content_copy', web: 'content_copy' }}
            size={14}
            tintColor={c.primary}
          />
          <Text style={[styles.actionBtnText, { color: c.primary }]}>Copy</Text>
        </Pressable>

        {/* Pay Button */}
        <Pressable
          onPress={() => setPayModalVisible(true)}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: c.success, borderColor: c.success },
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <SymbolView
            name={{ ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }}
            size={14}
            tintColor="#ffffff"
          />
          <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>Pay</Text>
        </Pressable>
      </Animated.View>

      {/* ═══ TIMER BANNER ══════════════════════════════════════════════════════ */}
      {companySettings?.timerEnabled === 'true' && (
        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={{ paddingHorizontal: 16 }}>
          <Pressable
            onPress={() => setHistoryModalVisible(true)}
            style={({ pressed }) => [
              styles.timerBanner,
              {
                backgroundColor: c.card,
                borderColor: isTimerRunning ? c.success : c.cardBorder,
                borderWidth: isTimerRunning ? 1.5 : 1,
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              {isTimerRunning ? (
                <PulsingDot color={c.success} />
              ) : (
                <SymbolView
                  name={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }}
                  size={18}
                  tintColor={c.textMuted}
                />
              )}
              <Text style={[
                styles.timerText,
                { color: isTimerRunning ? c.success : c.textMuted, fontVariant: ['tabular-nums'] },
              ]}>
                {formatTime(elapsedSeconds)}
              </Text>
            </View>
            <View style={[styles.timerHistoryBtn, { backgroundColor: c.primaryMuted }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.primary }}>History</Text>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={10}
                tintColor={c.primary}
              />
            </View>
          </Pressable>
        </Animated.View>
      )}


      {/* ═══ CLIENT DETAILS CARD ═══════════════════════════════════════════════ */}
      <Animated.View entering={FadeInDown.duration(500).delay(400)} style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          {/* Client profile row */}
          <View style={styles.clientProfileRow}>
            <AvatarInitials name={customerName} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: c.text, flex: 1 }} numberOfLines={1}>
                  {customerName}
                </Text>
                {appointment.job.customer && (
                  <Pressable
                    onPress={() => {
                      router.push({
                        pathname: '/customer/edit',
                        params: {
                          id: appointment.job.customer!.id,
                          name: appointment.job.customer!.name,
                          phone: appointment.job.customer!.phone || '',
                          email: appointment.job.customer!.email || '',
                        },
                      });
                    }}
                    style={({ pressed }) => [styles.clientEditBtn, pressed && { opacity: 0.6 }]}
                    hitSlop={8}
                  >
                    <SymbolView
                      name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }}
                      size={18}
                      tintColor={c.primary}
                    />
                  </Pressable>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.miniChip, { backgroundColor: c.primaryMuted }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: c.primary }}>
                    {appointment.job.customer?.jobsCount ?? 0} jobs
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Client Details (Phone, Email, Address) */}
          {appointment.job.customer?.phone ? (
            <View style={[styles.contactRow, { backgroundColor: c.inputBg }]}>
              <View style={styles.contactRowInfo}>
                <SymbolView
                  name={{ ios: 'phone.fill', android: 'phone', web: 'phone' }}
                  size={14}
                  tintColor={c.primary}
                />
                <Text style={[styles.contactRowText, { color: c.text }]} numberOfLines={1}>
                  {appointment.job.customer.phone}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Clipboard.setStringAsync(appointment.job.customer!.phone);
                  showToast({ message: 'Phone number copied to clipboard', type: 'success' });
                }}
                style={({ pressed }) => [styles.contactCopyBtn, pressed && { opacity: 0.6 }]}
                hitSlop={8}
              >
                <SymbolView
                  name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
                  size={14}
                  tintColor={c.primary}
                />
              </Pressable>
            </View>
          ) : null}

          {appointment.job.customer ? (
            appointment.job.customer.email ? (
              <View style={[styles.contactRow, { backgroundColor: c.inputBg }]}>
                <View style={styles.contactRowInfo}>
                  <SymbolView
                    name={{ ios: 'envelope.fill', android: 'email', web: 'email' }}
                    size={14}
                    tintColor={c.primary}
                  />
                  <Text style={[styles.contactRowText, { color: c.text }]} numberOfLines={1}>
                    {appointment.job.customer.email}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Clipboard.setStringAsync(appointment.job.customer!.email);
                    showToast({ message: 'Email copied to clipboard', type: 'success' });
                  }}
                  style={({ pressed }) => [styles.contactCopyBtn, pressed && { opacity: 0.6 }]}
                  hitSlop={8}
                >
                  <SymbolView
                    name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
                    size={14}
                    tintColor={c.primary}
                  />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  router.push({
                    pathname: '/customer/edit',
                    params: {
                      id: appointment.job.customer!.id,
                      name: appointment.job.customer!.name,
                      phone: appointment.job.customer!.phone || '',
                      email: '',
                    },
                  });
                }}
                style={({ pressed }) => [
                  styles.contactRow,
                  { backgroundColor: c.inputBg },
                  pressed && { opacity: 0.6 }
                ]}
              >
                <View style={styles.contactRowInfo}>
                  <SymbolView
                    name={{ ios: 'envelope', android: 'email', web: 'email' }}
                    size={14}
                    tintColor={c.textMuted}
                  />
                  <Text style={[styles.contactRowText, { color: c.textMuted }]} numberOfLines={1}>
                    Add customer email
                  </Text>
                </View>
                <SymbolView
                  name={{ ios: 'plus', android: 'add', web: 'add' }}
                  size={14}
                  tintColor={c.textMuted}
                />
              </Pressable>
            )
          ) : null}

          {clientAddress ? (
            <View style={[styles.contactRow, { backgroundColor: c.inputBg }]}>
              <View style={styles.contactRowInfo}>
                <SymbolView
                  name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
                  size={14}
                  tintColor={c.primary}
                />
                <Text style={[styles.contactRowText, { color: c.text }]} numberOfLines={2}>
                  {clientAddress}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Clipboard.setStringAsync(clientAddress);
                  showToast({ message: 'Address copied to clipboard', type: 'success' });
                }}
                style={({ pressed }) => [styles.contactCopyBtn, pressed && { opacity: 0.6 }]}
                hitSlop={8}
              >
                <SymbolView
                  name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
                  size={14}
                  tintColor={c.primary}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Animated.View>

      {/* ═══ JOB / SERVICES CARD ══════════════════════════════════════════════ */}
      <Animated.View entering={FadeInDown.duration(500).delay(500)} style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: c.successMuted }]}>
                <SymbolView
                  name={{ ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' }}
                  size={14}
                  tintColor={c.success}
                />
              </View>
              <Text style={[styles.cardTitle, { color: c.text }]}>Services</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted }}>
              {appointment.job.services?.length || 0} items
            </Text>
          </View>

          {/* Services list */}
          {appointment.job.services?.length === 0 ? (
            <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 8 }}>
              No services listed.
            </Text>
          ) : (
            appointment.job.services?.map((svc, idx) => (
              <Pressable
                key={svc.id}
                onPress={() => handleOpenEditService(svc)}
                style={({ pressed }) => [
                  styles.serviceItem,
                  {
                    backgroundColor: idx % 2 === 0 ? c.inputBg : 'transparent',
                    alignItems: svc.description ? 'flex-start' : 'center',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>
                    {svc.title || svc.name || 'Unnamed Service'}
                  </Text>
                  {svc.description ? (
                    <Text style={{ fontSize: 12, color: c.textMuted }}>
                      {svc.description}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, marginTop: svc.description ? 1 : 0 }}>
                  ${parseFloat(svc.price).toFixed(2)}
                </Text>
              </Pressable>
            ))
          )}

          <Pressable
            onPress={handleOpenAddService}
            style={({ pressed }) => [
              styles.addServiceBtn,
              {
                borderColor: c.primaryMuted,
                backgroundColor: c.inputBg,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <SymbolView
              name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add' }}
              size={14}
              tintColor={c.primary}
            />
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.primary }}>Add Service</Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: c.divider, marginTop: 4 }]} />

          {/* Totals */}
          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.textMuted }}>Total</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>
                ${appointment.job.totalAmount.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Payment Progress */}
          <PaymentProgressBar
            total={appointment.job.totalAmount}
            remaining={appointment.job.remainingBalance}
            isDark={isDark}
          />

          {/* Payments History */}
          {appointment.job.payments && appointment.job.payments.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: c.divider, marginVertical: 12 }]} />
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Payment History
                </Text>
                {appointment.job.payments.map((payment: IPayment, idx: number) => (
                  <View
                    key={payment.id}
                    style={[
                      styles.paymentRow,
                      {
                        backgroundColor: idx % 2 === 0 ? c.inputBg : 'transparent',
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>
                        {payment.type_text || 'Payment'}
                      </Text>
                      <Text style={{ fontSize: 11, color: c.textMuted }}>
                        {formatDate(payment.created_at, 'MMM DD, YYYY hh:mm A')}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.success }}>
                      +${parseFloat(payment.amount).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </Animated.View>

      {/* ═══ MODAL 1: Create Copy ═════════════════════════════════════════════ */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={copyModalVisible}
        onRequestClose={() => setCopyModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCopyModalVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', width: '100%' }]}>
            {/* Drag Handle */}
            <View {...panCopy.panHandlers} style={styles.modalDragArea}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>New Appointment</Text>
              <Pressable
                onPress={() => setCopyModalVisible(false)}
                hitSlop={15}
                style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}
              >
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  tintColor={c.textMuted}
                />
              </Pressable>
            </View>

            {/* Date Stepper */}
            <View style={{ gap: 16 }}>
              <View style={{ gap: 6 }}>
                <Text style={[styles.stepperLabel, { color: c.textMuted }]}>Date</Text>
                <View style={[styles.stepperRow, { backgroundColor: c.inputBg }]}>
                  <Pressable
                    onPress={() => changeCopyDay(-1)}
                    style={({ pressed }) => [styles.stepperBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.stepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={[styles.stepperValText, { color: c.text }]}>
                    {formatDate(copyDate, 'MMM DD, YYYY')}
                  </Text>
                  <Pressable
                    onPress={() => changeCopyDay(1)}
                    style={({ pressed }) => [styles.stepperBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={[styles.stepperLabel, { color: c.textMuted }]}>Time</Text>
                <View style={[styles.stepperRow, { backgroundColor: c.inputBg }]}>
                  <Pressable
                    onPress={() => changeCopyHour(-1)}
                    style={({ pressed }) => [styles.stepperBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.stepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={[styles.stepperValText, { color: c.text }]}>
                    {formatDate(copyDate, 'hh:00 A')}
                  </Text>
                  <Pressable
                    onPress={() => changeCopyHour(1)}
                    style={({ pressed }) => [styles.stepperBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={[styles.stepperLabel, { color: c.textMuted }]}>Duration</Text>
                <View style={[styles.stepperRow, { backgroundColor: c.inputBg }]}>
                  <Pressable
                    onPress={() => setCopyDurationHours(h => Math.max(1, h - 1))}
                    style={({ pressed }) => [styles.stepperBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.stepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={[styles.stepperValText, { color: c.text }]}>
                    {copyDurationHours} Hour{copyDurationHours > 1 ? 's' : ''}
                  </Text>
                  <Pressable
                    onPress={() => setCopyDurationHours(h => h + 1)}
                    style={({ pressed }) => [styles.stepperBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Toggle */}
            <Pressable
              onPress={() => setIsFinishCurrentAppointment(p => !p)}
              style={styles.toggleRow}
            >
              <View
                style={[
                  styles.toggleTrack,
                  { backgroundColor: isFinishCurrentAppointment ? c.primary : c.inputBg },
                ]}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    { transform: [{ translateX: isFinishCurrentAppointment ? 18 : 2 }] },
                  ]}
                />
              </View>
              <Text style={[styles.toggleLabel, { color: c.textSecondary }]}>Finish current appointment</Text>
            </Pressable>

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setCopyModalVisible(false)}
                style={({ pressed }) => [
                  styles.modalActionBtn,
                  { backgroundColor: c.inputBg },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateCopy}
                disabled={copyLoading}
                style={({ pressed }) => [
                  styles.modalActionBtn,
                  { backgroundColor: c.primary, flex: 1.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {copyLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Create</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ MODAL 2: Payment ═════════════════════════════════════════════════ */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={payModalVisible}
        onRequestClose={() => setPayModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPayModalVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '90%', width: '100%' }]}>
            {/* Drag Handle */}
            <View {...panPay.panHandlers} style={styles.modalDragArea}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Collect Payment</Text>
              <Pressable
                onPress={() => setPayModalVisible(false)}
                hitSlop={15}
                style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}
              >
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  tintColor={c.textMuted}
                />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {/* Balance summary */}
              <View style={styles.payBalanceRow}>
                <View style={[styles.payBalanceChip, { backgroundColor: c.dangerMuted }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: c.danger }}>
                    Due: ${appointment.job.remainingBalance.toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.payBalanceChip, { backgroundColor: c.successMuted }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: c.success }}>
                    Total: ${appointment.job.totalAmount.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Amount Input */}
              <View style={[styles.payInputBlock, { borderBottomColor: c.primary }]}>
                <Text style={{ fontSize: 36, fontWeight: '800', color: c.primary }}>$</Text>
                <TextInput
                  style={[styles.payAmountInput, { color: c.text }]}
                  keyboardType="numeric"
                  value={payAmount}
                  onChangeText={setPayAmount}
                />
              </View>

              {/* Quick Select */}
              <View style={styles.quickPayRow}>
                <Pressable
                  onPress={() => setPayAmount('100')}
                  style={({ pressed }) => [
                    styles.quickPayChip,
                    { backgroundColor: c.primaryMuted, borderColor: c.primary },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>Deposit $100</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPayAmount(appointment.job.remainingBalance.toString())}
                  style={({ pressed }) => [
                    styles.quickPayChip,
                    { backgroundColor: c.successMuted, borderColor: c.success },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.success }}>Full Amount</Text>
                </Pressable>
              </View>

              {/* Payment Method Selector */}
              <View style={[styles.methodSelector, { backgroundColor: c.inputBg }]}>
                {[
                  { id: 1, name: 'Credit' },
                  { id: 2, name: 'Cash' },
                  { id: 3, name: 'Check' },
                  { id: 4, name: 'Transfer' },
                ].map((type) => {
                  const isSel = selectedPaymentType === type.id;
                  return (
                    <Pressable
                      key={type.id}
                      onPress={() => setSelectedPaymentType(type.id)}
                      style={[
                        styles.methodTab,
                        isSel && { backgroundColor: c.primary },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: isSel ? '#ffffff' : c.textMuted,
                        }}
                      >
                        {type.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Credit card signature */}
              {selectedPaymentType === 1 && (
                <View style={{ gap: 8, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>Customer Signature</Text>
                    <Pressable onPress={() => setAllSignatureLines([])} style={{ paddingVertical: 2, paddingHorizontal: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: c.danger }}>Clear</Text>
                    </Pressable>
                  </View>
                  <View
                    style={[styles.sigBox, { borderColor: c.cardBorder }]}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={onSignatureTouchStart}
                    onResponderMove={onSignatureTouchMove}
                    onResponderRelease={onSignatureTouchEnd}
                  >
                    {renderSignatureVectors()}
                    {allSignatureLines.length === 0 && currentSignatureLine.length === 0 && (
                      <View style={styles.sigPlaceholder} pointerEvents="none">
                        <Text style={{ color: c.textMuted, fontSize: 12, fontStyle: 'italic' }}>
                          Draw signature here
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Invoice Toggle */}
              <Pressable onPress={() => setSendInvoice(p => !p)} style={styles.toggleRow}>
                <View
                  style={[
                    styles.toggleTrack,
                    { backgroundColor: sendInvoice ? c.primary : c.inputBg },
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      { transform: [{ translateX: sendInvoice ? 18 : 2 }] },
                    ]}
                  />
                </View>
                <Text style={[styles.toggleLabel, { color: c.textSecondary }]}>Send invoice automatically</Text>
              </Pressable>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setPayModalVisible(false)}
                style={({ pressed }) => [
                  styles.modalActionBtn,
                  { backgroundColor: c.inputBg },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textMuted }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAddPayment}
                disabled={payLoading}
                style={({ pressed }) => [
                  styles.modalActionBtn,
                  { backgroundColor: c.success, flex: 1.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {payLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Pay Now</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ MODAL 3: Timer History ═══════════════════════════════════════════ */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={historyModalVisible}
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setHistoryModalVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '80%', width: '100%' }]}>
            {/* Drag Handle */}
            <View {...panHistory.panHandlers} style={styles.modalDragArea}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Timer History</Text>
              <Pressable
                onPress={() => setHistoryModalVisible(false)}
                hitSlop={15}
                style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}
              >
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  tintColor={c.textMuted}
                />
              </Pressable>
            </View>

            {/* Total elapsed */}
            <View style={[styles.timerTotalBanner, { backgroundColor: c.primaryMuted }]}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Total Time
              </Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: c.primary, fontVariant: ['tabular-nums'] }}>
                {formatTime(elapsedSeconds)}
              </Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 8, gap: 8 }} showsVerticalScrollIndicator={false}>
              {appointment.timers?.length === 0 ? (
                <Text style={{ textAlign: 'center', fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 20 }}>
                  No timer records found.
                </Text>
              ) : (
                appointment.timers?.map((t, idx) => {
                  const startMs = Date.parse(t.started_at);
                  const stopMs = t.stopped_at ? Date.parse(t.stopped_at) : Date.now();
                  const durationSecs = isNaN(startMs) ? 0 : Math.floor((stopMs - startMs) / 1000);
                  const isActive = !t.stopped_at;

                  return (
                    <View
                      key={t.id || idx}
                      style={[
                        styles.timerHistoryItem,
                        {
                          backgroundColor: c.timerItemBg,
                          borderLeftColor: isActive ? c.success : c.primary,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                          {formatDate(t.started_at, 'MMM DD, hh:mm A')} — {t.stopped_at ? formatDate(t.stopped_at, 'hh:mm A') : 'Running'}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: '500', color: c.textMuted }}>
                          Started by: {t.started_by?.name || 'Unknown'}
                          {t.stopped_by?.name && ` · Stopped by: ${t.stopped_by.name}`}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: isActive ? c.success : c.primary, fontVariant: ['tabular-nums'] }}>
                          {formatTimerText(durationSecs)}
                        </Text>
                        {isActive && (
                          <View style={[styles.miniChip, { backgroundColor: c.successMuted }]}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: c.success }}>LIVE</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <Pressable
              onPress={() => setHistoryModalVisible(false)}
              style={({ pressed }) => [
                styles.modalActionBtn,
                { backgroundColor: c.primary, marginTop: 12 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ MODAL 4: Job Appointments History ═════════════════════════════════════ */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={jobHistoryModalVisible}
        onRequestClose={() => setJobHistoryModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setJobHistoryModalVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '80%', width: '100%' }]}>
            {/* Drag Handle */}
            <View {...panJobHistory.panHandlers} style={styles.modalDragArea}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Job History</Text>
              <Pressable
                onPress={() => setJobHistoryModalVisible(false)}
                hitSlop={15}
                style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}
              >
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  tintColor={c.textMuted}
                />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 8, gap: 8 }} showsVerticalScrollIndicator={false}>
              {!appointment.job.appointments || appointment.job.appointments.length === 0 ? (
                <Text style={{ textAlign: 'center', fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 20 }}>
                  No other appointments found for this job.
                </Text>
              ) : (
                appointment.job.appointments.map((appt, idx) => {
                  const statusConf = statusConfig[appt.status] || statusConfig[0];
                  const borderColor = getMixedColor(appt.techs);
                  const isCurrent = appt.id === appointment.id;

                  return (
                    <Pressable
                      key={appt.id || idx}
                      onPress={() => {
                        if (isCurrent) return;
                        setJobHistoryModalVisible(false);
                        router.push(`/appointment/${appt.id}` as any);
                      }}
                      style={({ pressed }) => [
                        styles.timerHistoryItem,
                        {
                          backgroundColor: isCurrent ? c.primaryMuted : c.timerItemBg,
                          borderLeftColor: borderColor,
                        },
                        pressed && !isCurrent && { opacity: 0.7 },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                          {formatDate(appt.start, 'MMM DD, YYYY')}
                          {isCurrent && <Text style={{ color: c.primary, fontSize: 11, fontStyle: 'italic' }}>  (Current)</Text>}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: '500', color: c.textMuted }}>
                          {formatDate(appt.start, 'hh:mm A')} — {formatDate(appt.end, 'hh:mm A')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <View style={[styles.miniChip, { backgroundColor: statusConf.color + '20' }]}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: statusConf.color }}>
                            {statusConf.label}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <Pressable
              onPress={() => setJobHistoryModalVisible(false)}
              style={({ pressed }) => [
                styles.modalActionBtn,
                { backgroundColor: c.primary, marginTop: 12 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ MODAL 5: Add/Edit Service ══════════════════════════════════════════ */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={serviceModalVisible}
        onRequestClose={() => setServiceModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setServiceModalVisible(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '85%', width: '100%' }]}
          >
            {/* Drag Handle */}
            <View {...panService.panHandlers} style={styles.modalDragArea}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.text }]}>
                {editingService ? 'Edit Service' : 'Add Service'}
              </Text>
              <Pressable
                onPress={() => setServiceModalVisible(false)}
                hitSlop={15}
                style={({ pressed }) => [styles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}
              >
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  tintColor={c.textMuted}
                />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: 24, gap: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title input & Autocomplete */}
              <View style={{ zIndex: 10 }}>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Service Title</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: c.inputBg, color: c.text, borderColor: c.cardBorder }]}
                  placeholder="Enter service title..."
                  placeholderTextColor={c.textMuted}
                  value={serviceTitle}
                  onChangeText={(text) => {
                    setServiceTitle(text);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />

                {/* Autocomplete suggestions */}
                {showSuggestions && (() => {
                  const filtered = (companyServices || []).filter(s =>
                    s.title.toLowerCase().includes(serviceTitle.toLowerCase())
                  );
                  if (filtered.length === 0) return null;
                  return (
                    <View style={[styles.suggestionsContainer, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: c.cardBorder }]}>
                      <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                        {filtered.map((item) => (
                          <Pressable
                            key={item.id}
                            onPress={() => handleSelectCompanyService(item)}
                            style={({ pressed }) => [
                              styles.suggestionItem,
                              { borderBottomColor: c.divider },
                              pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }
                            ]}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.title}</Text>
                            <Text style={{ fontSize: 12, color: c.textMuted }}>${parseFloat(item.price).toFixed(2)}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  );
                })()}
              </View>

              {/* Price input */}
              <View>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Price ($)</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: c.inputBg, color: c.text, borderColor: c.cardBorder }]}
                  placeholder="0.00"
                  placeholderTextColor={c.textMuted}
                  keyboardType="numeric"
                  value={servicePrice}
                  onChangeText={setServicePrice}
                />
              </View>

              {/* Description input */}
              <View>
                <Text style={[styles.formLabel, { color: c.textMuted }]}>Description</Text>
                <TextInput
                  style={[
                    styles.formInput,
                    {
                      backgroundColor: aiStatus === 'success'
                        ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)')
                        : c.inputBg,
                      color: c.text,
                      borderColor: aiStatus === 'success'
                        ? '#10B981'
                        : c.cardBorder,
                      height: 80,
                      textAlignVertical: 'top',
                    },
                  ]}
                  placeholder="Enter service description..."
                  placeholderTextColor={c.textMuted}
                  multiline={true}
                  value={serviceDescription}
                  onChangeText={setServiceDescription}
                />

                {/* AI Generate Button (Below description, styled like the photo) */}
                <Pressable
                  onPress={handleAI}
                  disabled={aiStatus === 'loading'}
                  style={({ pressed }) => [
                    styles.aiButtonContainer,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Animated.View style={[styles.aiButtonGlow, aiAnimatedStyle]}>
                    <LinearGradient
                      colors={['#3B82F6', '#8B5CF6', '#D946EF']} // vibrant blue-to-purple gradient matching the photo
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.aiButtonGradient}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <SymbolView
                          name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
                          size={16}
                          tintColor="#ffffff"
                        />
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>
                            {aiStatus === 'loading' ? 'Generating' : 'AI Generate'}
                          </Text>
                          {aiStatus === 'loading' && (
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff', width: 24, marginLeft: 2 }}>
                              {aiDots}
                            </Text>
                          )}
                        </View>
                      </View>
                    </LinearGradient>
                  </Animated.View>
                </Pressable>
              </View>

              {/* Taxable switch row */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>Taxable</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>Apply tax rate to this service</Text>
                </View>
                <Switch
                  value={serviceTaxable}
                  onValueChange={handleToggleTaxable}
                  trackColor={{ false: '#767577', true: c.primary }}
                  thumbColor={Platform.OS === 'android' ? (serviceTaxable ? '#ffffff' : '#f4f3f4') : undefined}
                />
              </View>
            </ScrollView>

            {/* Buttons Row */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              {editingService ? (
                <>
                  <Pressable
                    onPress={handleDeleteService}
                    disabled={serviceFormLoading}
                    style={({ pressed }) => [
                      styles.modalActionBtn,
                      { backgroundColor: c.danger, flex: 1 },
                      (pressed || serviceFormLoading) && { opacity: 0.8 },
                    ]}
                  >
                    {serviceFormLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Delete</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={handleSaveService}
                    disabled={serviceFormLoading}
                    style={({ pressed }) => [
                      styles.modalActionBtn,
                      { backgroundColor: c.primary, flex: 1 },
                      (pressed || serviceFormLoading) && { opacity: 0.8 },
                    ]}
                  >
                    {serviceFormLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Save</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => setServiceModalVisible(false)}
                    disabled={serviceFormLoading}
                    style={({ pressed }) => [
                      styles.modalActionBtn,
                      { backgroundColor: c.inputBg, flex: 1 },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveService}
                    disabled={serviceFormLoading}
                    style={({ pressed }) => [
                      styles.modalActionBtn,
                      { backgroundColor: c.primary, flex: 1 },
                      (pressed || serviceFormLoading) && { opacity: 0.8 },
                    ]}
                  >
                    {serviceFormLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Save</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Helpers ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const getMixedColor = (techs?: { color?: string }[]) => {
  if (!techs || techs.length === 0) return '#cccccc';
  if (techs.length === 1) return techs[0].color || '#cccccc';

  let r = 0, g = 0, b = 0, count = 0;
  for (const tech of techs) {
    if (tech.color) {
      const hex = tech.color.replace('#', '');
      if (hex.length === 6) {
        r += parseInt(hex.substring(0, 2), 16);
        g += parseInt(hex.substring(2, 4), 16);
        b += parseInt(hex.substring(4, 6), 16);
        count++;
      }
    }
  }

  if (count === 0) return '#cccccc';
  r = Math.round(r / count);
  g = Math.round(g / count);
  b = Math.round(b / count);

  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
};

const formatTime = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Styles ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Hero ─────────────────────────────────────────────────────────
  heroSection: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    gap: 8,
  },
  heroBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroJobId: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  heroStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  heroStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  heroStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  heroCustomerName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 4,
  },
  heroAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  heroAddressIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAddressText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  heroCopyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTimeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  heroTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },

  // ─── Action Row ───────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
  },
  actionBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── Timer Banner ─────────────────────────────────────────────────
  timerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  timerText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },

  // ─── Cards ────────────────────────────────────────────────────────
  card: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.08)',
    marginBottom: 6,
  },
  cardHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },

  // ─── Client ───────────────────────────────────────────────────────
  clientProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
  },
  clientEditBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    marginTop: 6,
    gap: 10,
  },
  contactRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  contactRowText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  contactCopyBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Services ─────────────────────────────────────────────────────
  serviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  totalsBlock: {
    gap: 6,
    paddingTop: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // ─── Modals ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
  },
  modalDragArea: {
    paddingTop: 12,
    paddingBottom: 4,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Steppers ─────────────────────────────────────────────────────
  stepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 4,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  stepperValText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ─── Toggle ───────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 14,
  },
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // ─── Payment Modal ────────────────────────────────────────────────
  payBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  payBalanceChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  payInputBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    paddingVertical: 8,
    marginBottom: 16,
  },
  payAmountInput: {
    fontSize: 36,
    fontWeight: '800',
    width: 160,
    textAlign: 'center',
    padding: 0,
  },
  quickPayRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 20,
  },
  quickPayChip: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  methodSelector: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  methodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigBox: {
    height: 120,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  sigPlaceholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Timer History Modal ──────────────────────────────────────────
  timerTotalBanner: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    gap: 4,
  },
  timerHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  // ─── Service Form & Autocomplete ───────────────────────────────────
  addServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    width: '100%',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginTop: 4,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 66,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiButtonContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'flex-end',
  },
  aiButtonGlow: {
    borderRadius: 12,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  aiButtonGradient: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
