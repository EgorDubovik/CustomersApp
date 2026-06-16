import React, { useEffect, useState, useRef } from 'react';
import {
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
import { useSettings } from '@/context/SettingsContext';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import Animated, { FadeInDown } from 'react-native-reanimated';

// Subcomponents and Assets
import {
  AvatarInitials,
  PulsingDot,
  PaymentProgressBar,
  InfoRowIcon,
  SwipeableNote,
} from '@/components/appointment/AppointmentUI';
import CopyModal from '@/components/appointment/CopyModal';
import PaymentModal from '@/components/appointment/PaymentModal';
import TimerHistoryModal from '@/components/appointment/TimerHistoryModal';
import JobHistoryModal from '@/components/appointment/JobHistoryModal';
import ServiceModal from '@/components/appointment/ServiceModal';
import NotesChatModal from '@/components/appointment/NotesChatModal';
import EditTimeModal from '@/components/appointment/EditTimeModal';

import { styles, palette } from '@/components/appointment/styles';
import { IAppointmentDetails, IService, IPayment, INote } from '@/components/appointment/types';

export default function AppointmentDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const { token, user, companySettings, companyServices } = useAuth();
  const { showToast } = useToast();
  const colorScheme = useColorScheme();
  const { navigationMap } = useSettings();
  const isDark = colorScheme === 'dark';
  const c = isDark ? palette.dark : palette.light;

  // Base Data States
  const [appointment, setAppointment] = useState<IAppointmentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Local Loading States
  const [statusLoading, setStatusLoading] = useState(false);
  const [timerLoading, setTimerLoading] = useState(false);

  // Modals Visibility
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [jobHistoryModalVisible, setJobHistoryModalVisible] = useState(false);
  const [editTimeModalVisible, setEditTimeModalVisible] = useState(false);
  const [serviceModalVisible, setServiceModalVisible] = useState(false);
  const [notesModalVisible, setNotesModalVisible] = useState(false);

  // Active Timer State
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerIntervalRef = useRef<any>(null);

  // Service Modal Edit State
  const [editingService, setEditingService] = useState<IService | null>(null);

  // Notes States
  const [loadingRemoveNote, setLoadingRemoveNote] = useState<number>(0);
  const [focusNotesInput, setFocusNotesInput] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

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

  // Timer accumulation & ticking effect
  useEffect(() => {
    if (!appointment) return;

    const timers = appointment.timers || [];
    const activeTimer = timers.find((t) => !t.stopped_at);

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

  // Status Update Flow
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

  // Timer Toggle Flow
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

  const handleOpenEditTimeModal = () => {
    setEditTimeModalVisible(true);
  };

  // Service CRUD handlers
  const handleOpenAddService = () => {
    setEditingService(null);
    setServiceModalVisible(true);
  };

  const handleOpenEditService = (svc: IService) => {
    setEditingService(svc);
    setServiceModalVisible(true);
  };

  // Note Handlers
  const canDeleteNote = (note: INote) => {
    if (!user) return false;
    return user.id === note.creator?.id;
  };

  const handleRemoveNote = (noteId: number) => {
    if (!token) return;

    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoadingRemoveNote(noteId);
            try {
              const response = await fetch(`${API_URL}/jobs/notes/${noteId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json',
                },
              });

              if (!response.ok) {
                if (response.status === 403) {
                  throw new Error('You are not allowed to delete this note');
                }
                throw new Error(`Failed to delete note: status ${response.status}`);
              }

              await fetchDetails(true);
              showToast({ message: 'Note deleted successfully', type: 'success' });
            } catch (err: any) {
              console.error(err);
              Alert.alert('Error', err.message || 'Something went wrong while deleting note.');
            } finally {
              setLoadingRemoveNote(0);
            }
          },
        },
      ]
    );
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

  const services = appointment.job.services || [];
  const subtotal = services.reduce((sum, s) => sum + parseFloat(s.price || '0'), 0);
  const taxableSubtotal = services.reduce((sum, s) => sum + (s.taxable ? parseFloat(s.price || '0') : 0), 0);
  const taxAmount = Math.max(0, appointment.job.totalAmount - subtotal);
  const taxRatePct = taxableSubtotal > 0 ? (taxAmount / taxableSubtotal) * 100 : 0;

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        scrollEnabled={scrollEnabled}
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
                  let url = '';
                  if (navigationMap === 'google') {
                    url = `https://www.google.com/maps/dir/?api=1&destination=${address}`;
                  } else {
                    url = Platform.select({
                      ios: `maps://app?daddr=${address}`,
                      android: `google.navigation:q=${address}`,
                      default: `https://www.google.com/maps/dir/?api=1&destination=${address}`,
                    }) || '';
                  }
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
            <View style={styles.heroTimeRow}>
              <Pressable
                onPress={() => setJobHistoryModalVisible(true)}
                style={({ pressed }) => [styles.heroTimePill, pressed && { opacity: 0.75 }]}
              >
                <SymbolView
                  name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                  size={12}
                  tintColor="rgba(255,255,255,0.9)"
                />
                <Text style={styles.heroTimeText}>
                  {formatDate(appointment.start, 'MMM DD, YYYY')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setJobHistoryModalVisible(true)}
                style={({ pressed }) => [styles.heroTimePill, pressed && { opacity: 0.75 }]}
              >
                <SymbolView
                  name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                  size={12}
                  tintColor="rgba(255,255,255,0.9)"
                />
                <Text style={styles.heroTimeText}>
                  {formatDate(appointment.start, 'hh:mm A')} — {formatDate(appointment.end, 'hh:mm A')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleOpenEditTimeModal}
                style={({ pressed }) => [
                  styles.heroTimePill,
                  { backgroundColor: 'rgba(255,255,255,0.3)' },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <SymbolView
                  name={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                  size={12}
                  tintColor="#ffffff"
                />
                <Text style={styles.heroTimeText}>Edit</Text>
              </Pressable>
            </View>
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
                backgroundColor: appointment.status === 2 ? c.inputBg : c.primaryMuted,
                borderColor: appointment.status === 2 ? c.divider : c.primary,
              },
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            {statusLoading ? (
              <ActivityIndicator size="small" color={appointment.status === 2 ? c.textMuted : c.primary} />
            ) : (
              <>
                <SymbolView name={currentStatus.icon} size={16} tintColor={appointment.status === 2 ? c.textMuted : c.primary} />
                <Text style={[styles.actionBtnText, { color: appointment.status === 2 ? c.textMuted : c.primary }]}>
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
            onPress={() => setCopyModalVisible(true)}
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
              {appointment.job.customer ? (
                <Pressable
                  onPress={() => router.push(`/customer/${appointment.job.customer!.id}` as any)}
                  style={({ pressed }) => [
                    { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
                    pressed && { opacity: 0.75 }
                  ]}
                >
                  <AvatarInitials name={customerName} size={48} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }} numberOfLines={1}>
                      {customerName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[styles.miniChip, { backgroundColor: c.primaryMuted }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: c.primary }}>
                          {appointment.job.customer?.jobsCount ?? 0} jobs
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                  <AvatarInitials name={customerName} size={48} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }} numberOfLines={1}>
                      {customerName}
                    </Text>
                  </View>
                </View>
              )}
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
                  borderColor: isDark ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.3)',
                  backgroundColor: isDark ? 'rgba(129, 140, 248, 0.12)' : 'rgba(99, 102, 241, 0.08)',
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
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted }}>Subtotal</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                  ${subtotal.toFixed(2)}
                </Text>
              </View>
              {taxAmount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted }}>
                    Tax {taxRatePct > 0 ? `(${taxRatePct.toFixed(1)}%)` : ''}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                    ${taxAmount.toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={[styles.totalRow, { marginTop: 4 }]}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>Total</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>
                  ${appointment.job.totalAmount.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: c.divider, marginVertical: 12 }]} />

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

        {/* ═══ JOB NOTES CARD ════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.duration(500).delay(600)} style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <View style={styles.cardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: c.primaryMuted }]}>
                  <SymbolView
                    name={{ ios: 'note.text', android: 'note', web: 'note' }}
                    size={14}
                    tintColor={c.primary}
                  />
                </View>
                <Text style={[styles.cardTitle, { color: c.text }]}>Notes</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted }}>
                {appointment.job.notes?.length || 0} {appointment.job.notes?.length === 1 ? 'message' : 'messages'}
              </Text>
            </View>

            {/* More messages button */}
            {(appointment.job.notes && appointment.job.notes.length > 1) && (
              <Pressable
                onPress={() => {
                  setFocusNotesInput(false);
                  setNotesModalVisible(true);
                }}
                style={({ pressed }) => [
                  styles.moreNotesBtn,
                  pressed && { opacity: 0.7 }
                ]}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>More messages</Text>
              </Pressable>
            )}

            {/* Notes list - showing only the last message */}
            {(!appointment.job.notes || appointment.job.notes.length === 0) ? (
              <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 8 }}>
                No notes added yet.
              </Text>
            ) : (
              <View style={styles.notesList}>
                {(() => {
                  const note = appointment.job.notes[appointment.job.notes.length - 1];
                  const isSelf = note.creator?.id === user?.id && user?.id !== undefined;
                  return (
                    <SwipeableNote
                      note={note}
                      isSelf={isSelf}
                      canDelete={canDeleteNote(note)}
                      onDelete={handleRemoveNote}
                      loadingRemove={loadingRemoveNote === note.id}
                      c={c}
                      isDark={isDark}
                      formatDate={formatDate}
                      setScrollEnabled={setScrollEnabled}
                    />
                  );
                })()}
              </View>
            )}

            {/* Note Mock Input */}
            <Pressable
              onPress={() => {
                setFocusNotesInput(true);
                setNotesModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.mockNoteInput,
                {
                  backgroundColor: c.inputBg,
                  borderColor: c.cardBorder,
                },
                pressed && { opacity: 0.8 }
              ]}
            >
              <Text style={{ color: c.textMuted, fontSize: 13, flex: 1 }}>
                Type note here...
              </Text>
              <SymbolView
                name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
                size={14}
                tintColor={c.textMuted}
              />
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ═══ MODAL COMPONENTS ══════════════════════════════════════════════════ */}
      
      {/* MODAL 1: Create Copy */}
      <CopyModal
        visible={copyModalVisible}
        onClose={() => setCopyModalVisible(false)}
        appointment={appointment}
        token={token}
        isDark={isDark}
      />

      {/* MODAL 2: Payment */}
      <PaymentModal
        visible={payModalVisible}
        onClose={() => setPayModalVisible(false)}
        appointment={appointment}
        token={token}
        isDark={isDark}
        onSuccess={() => fetchDetails(true)}
      />

      {/* MODAL 3: Timer History */}
      <TimerHistoryModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
        appointment={appointment}
        isDark={isDark}
        formatDate={formatDate}
        elapsedSeconds={elapsedSeconds}
      />

      {/* MODAL 4: Job Appointments History */}
      <JobHistoryModal
        visible={jobHistoryModalVisible}
        onClose={() => setJobHistoryModalVisible(false)}
        appointment={appointment}
        isDark={isDark}
        formatDate={formatDate}
      />

      {/* MODAL 5: Add/Edit Service */}
      <ServiceModal
        visible={serviceModalVisible}
        onClose={() => setServiceModalVisible(false)}
        editingService={editingService}
        appointment={appointment}
        token={token}
        companyServices={companyServices || []}
        isDark={isDark}
        onSuccess={() => fetchDetails(true)}
      />

      {/* MODAL 6: Notes Chat */}
      <NotesChatModal
        visible={notesModalVisible}
        onClose={() => setNotesModalVisible(false)}
        appointment={appointment}
        token={token}
        user={user}
        isDark={isDark}
        formatDate={formatDate}
        onSuccess={() => fetchDetails(true)}
        autoFocusInput={focusNotesInput}
      />

      {/* MODAL: Edit Time */}
      <EditTimeModal
        visible={editTimeModalVisible}
        onClose={() => setEditTimeModalVisible(false)}
        appointment={appointment}
        token={token}
        isDark={isDark}
        formatDate={formatDate}
        onSuccess={() => fetchDetails(true)}
      />
    </View>
  );
}
