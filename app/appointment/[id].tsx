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
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';

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
  name: string;
  price: string;
  is_active: boolean;
}

interface IPayment {
  id: number;
  amount: string;
  created_at: string;
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
    customer?: { name: string; email: string; phone: string; jobsCount: number };
  };
}

// ─── Drawing Pad State ────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

export default function AppointmentDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { token } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

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

  // Loading Indicator
  if (loading) {
    return (
      <View style={[styles.center, themeStyles.bg]}>
        <ActivityIndicator size="large" color={isDark ? '#805dca' : '#4361ee'} />
        <Text style={[styles.loadingText, themeStyles.textMuted]}>
          Loading details...
        </Text>
      </View>
    );
  }

  // Error Card
  if (error || !appointment) {
    return (
      <View style={[styles.center, themeStyles.bg, { paddingHorizontal: 24 }]}>
        <SymbolView
          name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
          size={50}
          tintColor="#e7515a"
          style={{ marginBottom: 16 }}
        />
        <Text style={styles.errorText}>{error || 'Appointment data is empty.'}</Text>
        <Pressable onPress={() => fetchDetails()} style={[styles.retryBtn, themeStyles.btnBorder]}>
          <Text style={[styles.retryText, themeStyles.textPrimary]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const isTimerRunning = appointment.timers?.some((t) => !t.stopped_at);
  const statusColors = ['#4361ee', '#00ab55', '#e2a03f']; // Blue, Green, Muted Gold
  const statusTexts = ['Scheduled', 'Active', 'Finished'];

  return (
    <ScrollView style={[styles.container, themeStyles.bg]} contentContainerStyle={styles.scrollContent}>
      <Stack.Screen options={{ title: `Job #${appointment.job.id}` }} />

      {/* ─── Header Buttons Row (Web matches Header.tsx toolbar) ──────────────── */}
      <View style={styles.actionToolbar}>
        {/* Button 1: Status Action */}
        <View style={styles.statusGroup}>
          <Pressable
            onPress={handleStatusPress}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: appointment.status === 2 ? '#888ea8' : '#4361ee',
                opacity: pressed || statusLoading ? 0.75 : 1,
              },
            ]}
            disabled={statusLoading}
          >
            {statusLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <SymbolView
                  name={
                    appointment.status === 0
                      ? { ios: 'car.fill', android: 'local_shipping', web: 'local_shipping' }
                      : appointment.status === 1
                      ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
                      : { ios: 'arrow.counterclockwise.circle.fill', android: 'replay', web: 'replay' }
                  }
                  size={16}
                  tintColor="#ffffff"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.btnTextWhite}>
                  {appointment.status === 0
                    ? 'On My Way'
                    : appointment.status === 1
                    ? 'Finish'
                    : 'Activate'}
                </Text>
              </>
            )}
          </Pressable>

          {/* Optional Timer button right next to status */}
          {appointment.status === 1 && (
            <Pressable
              onPress={handleToggleTimer}
              style={({ pressed }) => [
                styles.timerBtn,
                { backgroundColor: isTimerRunning ? '#e7515a' : '#00ab55' },
                (pressed || timerLoading) && { opacity: 0.75 },
              ]}
              disabled={timerLoading}
            >
              {timerLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <SymbolView
                  name={isTimerRunning ? { ios: 'pause.fill', android: 'pause', web: 'pause' } : { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                  size={18}
                  tintColor="#ffffff"
                />
              )}
            </Pressable>
          )}
        </View>

        {/* Button 2: Create Copy */}
        <Pressable
          onPress={() => {
            setCopyDate(new Date());
            setCopyModalVisible(true);
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            themeStyles.btnBgSec,
            pressed && { opacity: 0.8 },
          ]}
        >
          <SymbolView
            name={{ ios: 'doc.on.doc.fill', android: 'content_copy', web: 'content_copy' }}
            size={16}
            tintColor={isDark ? '#805dca' : '#4361ee'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.btnTextSecondary, themeStyles.textPrimary]}>Copy</Text>
        </Pressable>

        {/* Button 3: Pay */}
        <Pressable
          onPress={() => setPayModalVisible(true)}
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.payBtn,
            pressed && { opacity: 0.8 },
          ]}
        >
          <SymbolView
            name={{ ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }}
            size={16}
            tintColor="#ffffff"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.btnTextWhite}>Pay</Text>
        </Pressable>
      </View>

      {/* ─── Active Timer Banner (If running or has history) ──────────────────── */}
      <Pressable
        onPress={() => setHistoryModalVisible(true)}
        style={[styles.timerBanner, themeStyles.cardBg]}
      >
        <SymbolView
          name={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }}
          size={18}
          tintColor={isTimerRunning ? '#00ab55' : '#888ea8'}
          style={{ marginRight: 8 }}
        />
        <Text style={[styles.timerBannerText, isTimerRunning ? styles.timerRunningText : themeStyles.textMuted]}>
          Timer: {formatTime(elapsedSeconds)}
        </Text>
        <Text style={styles.timerHistoryLink}>History &gt;</Text>
      </Pressable>

      {/* ─── Appointment Basic Details Card ───────────────────────────────────── */}
      <View style={[styles.detailsCard, themeStyles.cardBg]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, themeStyles.textMain]}>Appointment Info</Text>
          <View style={[styles.badge, { backgroundColor: statusColors[appointment.status] }]}>
            <Text style={styles.badgeText}>{statusTexts[appointment.status]}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Scheduled Time</Text>
          <Text style={[styles.infoVal, themeStyles.textMain]}>
            {formatDate(appointment.start, 'MMM DD, YYYY')} at {formatDate(appointment.start, 'hh:mm A')}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>End Time</Text>
          <Text style={[styles.infoVal, themeStyles.textMain]}>
            {formatDate(appointment.end, 'MMM DD, YYYY')} at {formatDate(appointment.end, 'hh:mm A')}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Assigned Techs</Text>
          <Text style={[styles.infoVal, themeStyles.textMain]}>
            {appointment.techs?.map((t) => t.name).join(', ') || 'Unassigned'}
          </Text>
        </View>
      </View>

      {/* ─── Client Details Card ──────────────────────────────────────────────── */}
      <View style={[styles.detailsCard, themeStyles.cardBg]}>
        <Text style={[styles.cardTitle, themeStyles.textMain]}>Client Details</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name</Text>
          <Text style={[styles.infoVal, themeStyles.textMain, styles.boldText]}>
            {appointment.job.customer?.name || 'Unknown'}
          </Text>
        </View>

        {appointment.job.customer?.phone && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={[styles.infoVal, themeStyles.textMain]}>
              {appointment.job.customer.phone}
            </Text>
          </View>
        )}

        {appointment.job.customer?.email && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={[styles.infoVal, themeStyles.textMain]}>
              {appointment.job.customer.email}
            </Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total Jobs</Text>
          <Text style={[styles.infoVal, themeStyles.textMain]}>
            {appointment.job.customer?.jobsCount ?? 0} jobs
          </Text>
        </View>
      </View>

      {/* ─── Job / Services Card ──────────────────────────────────────────────── */}
      <View style={[styles.detailsCard, themeStyles.cardBg]}>
        <Text style={[styles.cardTitle, themeStyles.textMain]}>Job Details</Text>

        {appointment.job.address?.full && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={[styles.infoVal, themeStyles.textMain, { flex: 1.5 }]}>
              {appointment.job.address.full}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={[styles.cardSubtitle, themeStyles.textMain]}>Services</Text>
        {appointment.job.services?.length === 0 ? (
          <Text style={[styles.noItemsText, themeStyles.textMuted]}>No services listed.</Text>
        ) : (
          appointment.job.services?.map((svc) => (
            <View key={svc.id} style={styles.serviceItem}>
              <Text style={[styles.serviceName, themeStyles.textMain]}>{svc.name}</Text>
              <Text style={[styles.servicePrice, themeStyles.textMain]}>${parseFloat(svc.price).toFixed(2)}</Text>
            </View>
          ))
        )}

        <View style={styles.divider} />

        <View style={styles.totalsSummary}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.totalVal, themeStyles.textMain]}>${appointment.job.totalAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabelRemaining}>Remaining Balance</Text>
            <Text style={styles.totalValRemaining}>${appointment.job.remainingBalance.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {/* ─── MODAL 1: Create Copy Dialog ──────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={copyModalVisible}
        onRequestClose={() => setCopyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, themeStyles.cardBg]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.textMain]}>New Appointment Copy</Text>
              <Pressable onPress={() => setCopyModalVisible(false)} hitSlop={15}>
                <Text style={styles.closeModalCross}>×</Text>
              </Pressable>
            </View>

            {/* Tactile Date / Time Steppers */}
            <View style={styles.stepperContainer}>
              <Text style={[styles.stepperSectionTitle, themeStyles.textMain]}>Date Select</Text>
              <View style={styles.stepperRow}>
                <Pressable onPress={() => changeCopyDay(-1)} style={styles.stepperBtn}>
                  <Text style={styles.stepperBtnText}>-1 Day</Text>
                </Pressable>
                <Text style={[styles.stepperValText, themeStyles.textMain]}>
                  {formatDate(copyDate, 'MMM DD, YYYY')}
                </Text>
                <Pressable onPress={() => changeCopyDay(1)} style={styles.stepperBtn}>
                  <Text style={styles.stepperBtnText}>+1 Day</Text>
                </Pressable>
              </View>

              <Text style={[styles.stepperSectionTitle, themeStyles.textMain, { marginTop: 12 }]}>Time Select</Text>
              <View style={styles.stepperRow}>
                <Pressable onPress={() => changeCopyHour(-1)} style={styles.stepperBtn}>
                  <Text style={styles.stepperBtnText}>-1 Hour</Text>
                </Pressable>
                <Text style={[styles.stepperValText, themeStyles.textMain]}>
                  {formatDate(copyDate, 'hh:00 A')}
                </Text>
                <Pressable onPress={() => changeCopyHour(1)} style={styles.stepperBtn}>
                  <Text style={styles.stepperBtnText}>+1 Hour</Text>
                </Pressable>
              </View>

              <Text style={[styles.stepperSectionTitle, themeStyles.textMain, { marginTop: 12 }]}>Duration</Text>
              <View style={styles.stepperRow}>
                <Pressable onPress={() => setCopyDurationHours(h => Math.max(1, h - 1))} style={styles.stepperBtn}>
                  <Text style={styles.stepperBtnText}>-1 Hr</Text>
                </Pressable>
                <Text style={[styles.stepperValText, themeStyles.textMain]}>
                  {copyDurationHours} Hour{copyDurationHours > 1 ? 's' : ''}
                </Text>
                <Pressable onPress={() => setCopyDurationHours(h => h + 1)} style={styles.stepperBtn}>
                  <Text style={styles.stepperBtnText}>+1 Hr</Text>
                </Pressable>
              </View>
            </View>

            {/* Checkbox */}
            <Pressable
              onPress={() => setIsFinishCurrentAppointment(p => !p)}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkboxSquare, isFinishCurrentAppointment && styles.checkboxSquareChecked]}>
                {isFinishCurrentAppointment && <Text style={styles.checkmarkIcon}>✓</Text>}
              </View>
              <Text style={[styles.checkboxLabel, themeStyles.textMuted]}>Finish current appointment</Text>
            </Pressable>

            <View style={styles.modalActionButtons}>
              <Pressable
                onPress={() => setCopyModalVisible(false)}
                style={[styles.modalBtn, styles.modalDiscardBtn]}
              >
                <Text style={styles.discardBtnText}>Discard</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateCopy}
                style={[styles.modalBtn, styles.modalSubmitBtn]}
                disabled={copyLoading}
              >
                {copyLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 2: Payment Drawer ─────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={payModalVisible}
        onRequestClose={() => setPayModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, themeStyles.cardBg, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.textMain]}>Collect Payment</Text>
              <Pressable onPress={() => setPayModalVisible(false)} hitSlop={15}>
                <Text style={styles.closeModalCross}>×</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              <View style={styles.paymentsBalanceRow}>
                <Text style={styles.balDanger}>Remaining: ${appointment.job.remainingBalance.toFixed(2)}</Text>
                <Text style={styles.balSuccess}>Total: ${appointment.job.totalAmount.toFixed(2)}</Text>
              </View>

              {/* Amount input */}
              <View style={styles.paymentInputBlock}>
                <Text style={[styles.currencyLabel, themeStyles.textMain]}>$</Text>
                <TextInput
                  style={[styles.payValInput, themeStyles.textMain]}
                  keyboardType="numeric"
                  value={payAmount}
                  onChangeText={setPayAmount}
                />
              </View>

              {/* Quick Select Buttons */}
              <View style={styles.quickPayBtns}>
                <Pressable
                  onPress={() => setPayAmount('100')}
                  style={[styles.quickPayBtn, themeStyles.btnBorder]}
                >
                  <Text style={[styles.quickPayText, themeStyles.textPrimary]}>Deposit ($100)</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPayAmount(appointment.job.remainingBalance.toString())}
                  style={[styles.quickPayBtn, themeStyles.btnBorder]}
                >
                  <Text style={[styles.quickPayText, themeStyles.textPrimary]}>Full Amount</Text>
                </Pressable>
              </View>

              {/* Payment Methods switcher */}
              <View style={styles.methodSelector}>
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
                        styles.methodTabButton,
                        isSel ? styles.methodTabActive : themeStyles.btnBorder,
                      ]}
                    >
                      <Text style={[styles.methodTabText, isSel ? styles.methodTabTextActive : themeStyles.textMuted]}>
                        {type.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Credit card customer signature canvas */}
              {selectedPaymentType === 1 && (
                <View style={styles.sigContainer}>
                  <View style={styles.sigHeader}>
                    <Text style={[styles.sigLabel, themeStyles.textMain]}>Customer Signature</Text>
                    <Pressable onPress={() => setAllSignatureLines([])} style={styles.clearSigBtn}>
                      <Text style={styles.clearSigText}>Clear</Text>
                    </Pressable>
                  </View>
                  <View
                    style={styles.sigDrawingBox}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={onSignatureTouchStart}
                    onResponderMove={onSignatureTouchMove}
                    onResponderRelease={onSignatureTouchEnd}
                  >
                    {renderSignatureVectors()}
                    {allSignatureLines.length === 0 && currentSignatureLine.length === 0 && (
                      <View style={styles.sigPlaceholder} pointerEvents="none">
                        <Text style={styles.sigPlaceholderText}>Draw signature here</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Checkbox Invoice */}
              <Pressable
                onPress={() => setSendInvoice(p => !p)}
                style={styles.checkboxRow}
              >
                <View style={[styles.checkboxSquare, sendInvoice && styles.checkboxSquareChecked]}>
                  {sendInvoice && <Text style={styles.checkmarkIcon}>✓</Text>}
                </View>
                <Text style={[styles.checkboxLabel, themeStyles.textMuted]}>Send invoice automatically</Text>
              </Pressable>
            </ScrollView>

            <View style={styles.modalActionButtons}>
              <Pressable
                onPress={() => setPayModalVisible(false)}
                style={[styles.modalBtn, styles.modalDiscardBtn]}
              >
                <Text style={styles.discardBtnText}>Discard</Text>
              </Pressable>
              <Pressable
                onPress={handleAddPayment}
                style={[styles.modalBtn, styles.modalSubmitBtn]}
                disabled={payLoading}
              >
                {payLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>Pay Now</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL 3: Timer History ─────────────────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={historyModalVisible}
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, themeStyles.cardBg, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.textMain]}>Timer History</Text>
              <Pressable onPress={() => setHistoryModalVisible(false)} hitSlop={15}>
                <Text style={styles.closeModalCross}>×</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 10 }} showsVerticalScrollIndicator={false}>
              {appointment.timers?.length === 0 ? (
                <Text style={[styles.noTimersText, themeStyles.textMuted]}>No timer records found.</Text>
              ) : (
                appointment.timers?.map((t, idx) => {
                  const startMs = Date.parse(t.started_at);
                  const stopMs = t.stopped_at ? Date.parse(t.stopped_at) : Date.now();
                  const durationSecs = isNaN(startMs) ? 0 : Math.floor((stopMs - startMs) / 1000);

                  return (
                    <View key={t.id || idx} style={[styles.timerItem, themeStyles.timerItemBg]}>
                      <View>
                        <Text style={[styles.timerItemDate, themeStyles.textMain]}>
                          {formatDate(t.started_at, 'MMM DD, hh:mm A')} - {t.stopped_at ? formatDate(t.stopped_at, 'hh:mm A') : 'Running'}
                        </Text>
                        <Text style={[styles.timerItemActors, themeStyles.textMuted]}>
                          Started by: {t.started_by?.name || 'Unknown'}
                          {t.stopped_by?.name && ` • Stopped by: ${t.stopped_by.name}`}
                        </Text>
                      </View>
                      <Text style={[styles.timerDurationText, themeStyles.textPrimary]}>
                        {formatTimerText(durationSecs)}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <Pressable
              onPress={() => setHistoryModalVisible(false)}
              style={[styles.closeButton, themeStyles.closeButton, { marginTop: 12 }]}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// Convert seconds to readable timer format
const formatTime = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e7515a',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // action toolbar
  actionToolbar: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  statusGroup: {
    flex: 1.5,
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  timerBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtn: {
    backgroundColor: '#00ab55',
  },
  btnTextWhite: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnTextSecondary: {
    fontSize: 13,
    fontWeight: '700',
  },
  timerBanner: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  timerBannerText: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  timerRunningText: {
    color: '#00ab55',
  },
  timerHistoryLink: {
    color: '#4361ee',
    fontSize: 12,
    fontWeight: '700',
  },
  // cards
  detailsCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.15)',
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888ea8',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  boldText: {
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(128,128,128,0.15)',
    marginVertical: 4,
  },
  serviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 13,
    fontWeight: '600',
  },
  servicePrice: {
    fontSize: 13,
    fontWeight: '600',
  },
  noItemsText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  totalsSummary: {
    gap: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888ea8',
  },
  totalVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  totalLabelRemaining: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e7515a',
  },
  totalValRemaining: {
    fontSize: 14,
    fontWeight: '800',
    color: '#e7515a',
  },
  // modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.15)',
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeModalCross: {
    fontSize: 24,
    fontWeight: '300',
    color: '#888ea8',
    lineHeight: 24,
  },
  // steppers
  stepperContainer: {
    gap: 8,
    marginBottom: 16,
  },
  stepperSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#888ea8',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(128,128,128,0.06)',
    borderRadius: 8,
    padding: 4,
  },
  stepperBtn: {
    backgroundColor: 'rgba(128,128,128,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  stepperBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b3f5c',
  },
  stepperValText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: '#888ea8',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSquareChecked: {
    borderColor: '#4361ee',
    backgroundColor: '#4361ee',
  },
  checkmarkIcon: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  // payments modal specifics
  paymentsBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  balDanger: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e7515a',
  },
  balSuccess: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00ab55',
  },
  paymentInputBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#888ea8',
    paddingVertical: 8,
    marginBottom: 16,
  },
  currencyLabel: {
    fontSize: 32,
    fontWeight: '800',
    marginRight: 4,
  },
  payValInput: {
    fontSize: 32,
    fontWeight: '800',
    width: 150,
    textAlign: 'center',
    padding: 0,
  },
  quickPayBtns: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  quickPayBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  quickPayText: {
    fontSize: 11,
    fontWeight: '700',
  },
  methodSelector: {
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.06)',
    padding: 4,
    marginBottom: 16,
  },
  methodTabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodTabActive: {
    backgroundColor: '#4361ee',
  },
  methodTabText: {
    fontSize: 11,
    fontWeight: '700',
  },
  methodTabTextActive: {
    color: '#ffffff',
  },
  sigContainer: {
    gap: 8,
    marginBottom: 16,
  },
  sigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sigLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  clearSigBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  clearSigText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e7515a',
  },
  sigDrawingBox: {
    height: 120,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e6ed',
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
  sigPlaceholderText: {
    color: '#888ea8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  modalBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDiscardBtn: {
    borderWidth: 1,
    borderColor: '#e7515a',
    backgroundColor: 'transparent',
  },
  modalSubmitBtn: {
    backgroundColor: '#4361ee',
  },
  discardBtnText: {
    color: '#e7515a',
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  // timer history modal specifics
  noTimersText: {
    textAlign: 'center',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  timerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
  },
  timerItemDate: {
    fontSize: 12,
    fontWeight: '700',
  },
  timerItemActors: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  timerDurationText: {
    fontSize: 14,
    fontWeight: '800',
  },
  closeButton: {
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

const lightStyles = StyleSheet.create({
  bg: {
    backgroundColor: '#f6f8fa',
  },
  cardBg: {
    backgroundColor: '#ffffff',
    borderColor: '#e0e6ed',
  },
  textMain: {
    color: '#0e1726',
  },
  textMuted: {
    color: '#515365',
  },
  textPrimary: {
    color: '#4361ee',
  },
  btnBgSec: {
    backgroundColor: '#f1f2f3',
  },
  btnBorder: {
    borderColor: '#e0e6ed',
  },
  closeButton: {
    backgroundColor: '#4361ee',
  },
  timerItemBg: {
    backgroundColor: '#f1f2f3',
  },
});

const darkStyles = StyleSheet.create({
  bg: {
    backgroundColor: '#060818',
  },
  cardBg: {
    backgroundColor: '#0e1726',
    borderColor: '#191e3a',
  },
  textMain: {
    color: '#f1f2f3',
  },
  textMuted: {
    color: '#888ea8',
  },
  textPrimary: {
    color: '#805dca',
  },
  btnBgSec: {
    backgroundColor: '#1b2e4b',
  },
  btnBorder: {
    borderColor: '#191e3a',
  },
  closeButton: {
    backgroundColor: '#805dca',
  },
  timerItemBg: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
});
