import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { useColorScheme } from '@/components/useColorScheme';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Image,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

// Subcomponents and Assets
import { PulsingDot } from '@/components/appointment/AppointmentUI';
import AppointmentTabBar, { TabDef } from '@/components/appointment/tabs/AppointmentTabBar';
import InfoTab from '@/components/appointment/tabs/InfoTab';
import NotesTab from '@/components/appointment/tabs/NotesTab';
import PhotosTab from '@/components/appointment/tabs/PhotosTab';
import WorkTab from '@/components/appointment/tabs/WorkTab';
import CopyModal from '@/components/appointment/CopyModal';
import EditTimeModal from '@/components/appointment/EditTimeModal';
import JobHistoryModal from '@/components/appointment/JobHistoryModal';
import NotesChatModal from '@/components/appointment/NotesChatModal';
import PaymentModal from '@/components/appointment/PaymentModal';
import ServiceModal from '@/components/appointment/ServiceModal';
import TimerHistoryModal from '@/components/appointment/TimerHistoryModal';

import { palette, styles } from '@/components/appointment/styles';
import { AppointmentTabKey, IAppointmentDetails, IService } from '@/components/appointment/types';
import { buildStaticMapUrl } from '@/components/appointment/staticMap';

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

  // Tabs — rendered as a horizontal pager so the user can swipe between them.
  // All pages stay mounted; the pager's height follows the active page.
  const TAB_ORDER: AppointmentTabKey[] = ['work', 'photos', 'notes', 'info'];
  const { width: pageWidth, height: screenHeight } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const [activeTab, setActiveTab] = useState<AppointmentTabKey>('work');
  // Height follows `settledTab`, which only changes once a swipe has finished, so the
  // outgoing page isn't clipped mid-gesture; the tab highlight (`activeTab`) updates live.
  const [settledTab, setSettledTab] = useState<AppointmentTabKey>('work');
  const [pageHeights, setPageHeights] = useState<Partial<Record<AppointmentTabKey, number>>>({});
  const [openStickyCount, setOpenStickyCount] = useState<number | null>(null);

  // Hero map: a fixed layer behind the ScrollView, taller than the hero by half a screen.
  // A pan gesture (same on iOS and Android — native bounce is disabled) lets the user pull
  // the whole content down by up to half a screen; the map layer follows at half speed so
  // the visible window grows symmetrically around the address pin.
  const [heroHeight, setHeroHeight] = useState(0);
  const [heroMapLoaded, setHeroMapLoaded] = useState(false);
  const maxPull = screenHeight / 2;
  const mapHeight = heroHeight + maxPull;
  const scrollY = useSharedValue(0);
  const pullY = useSharedValue(0);
  const touchStart = useSharedValue({ x: 0, y: 0 });

  const onVerticalScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const pullGesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e) => {
          const t = e.allTouches[0];
          if (t) touchStart.value = { x: t.x, y: t.y };
        })
        .onTouchesMove((e, state) => {
          const t = e.allTouches[0];
          if (!t) return;
          const dx = t.x - touchStart.value.x;
          const dy = t.y - touchStart.value.y;
          // Horizontal → the tab pager / swipe-to-delete rows own it
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
            state.fail();
            return;
          }
          // Upward, or not at the top → the ScrollView owns it
          if (dy < -4 || (dy > 8 && scrollY.value > 0)) {
            state.fail();
            return;
          }
          if (dy > 8 && scrollY.value <= 0) state.activate();
        })
        .onUpdate((e) => {
          const t = Math.max(0, e.translationY);
          // Progressive resistance that asymptotically approaches maxPull
          pullY.value = t / (1 + t / maxPull);
        })
        .onFinalize(() => {
          pullY.value = withSpring(0, { damping: 18, stiffness: 170, mass: 0.6 });
        }),
    [maxPull],
  );

  const pulledContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pullY.value }],
  }));
  const mapLayerStyle = useAnimatedStyle(() => {
    const base = -(mapHeight - heroHeight) / 2; // centre the tall image on the hero
    // Follow the hero while scrolling; open up at half speed while pulling
    return { transform: [{ translateY: base - scrollY.value + pullY.value / 2 }] };
  });
  // The scrim thins out as the map opens so the revealed area reads as a map, not a dimmed banner
  const heroScrimStyle = useAnimatedStyle(() => ({
    opacity: 1 - (pullY.value / maxPull) * 0.7,
  }));

  const switchTab = (key: AppointmentTabKey) => {
    setActiveTab(key);
    setSettledTab(key);
    pagerRef.current?.scrollTo({ x: TAB_ORDER.indexOf(key) * pageWidth, animated: true });
  };

  const tabAtOffset = (x: number) => TAB_ORDER[Math.max(0, Math.min(TAB_ORDER.length - 1, Math.round(x / pageWidth)))];

  const onPagerScroll = (x: number) => {
    const key = tabAtOffset(x);
    if (key !== activeTab) setActiveTab(key);
  };

  const onPagerSettled = (x: number) => {
    const key = tabAtOffset(x);
    setActiveTab(key);
    setSettledTab(key);
  };

  const onPageLayout = (key: AppointmentTabKey, height: number) => {
    setPageHeights((prev) => (prev[key] === height ? prev : { ...prev, [key]: height }));
  };

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

  const heroMapUrl = heroHeight
    ? buildStaticMapUrl({
        lat: appointment.job.address?.lat,
        lon: appointment.job.address?.lon,
        width: pageWidth,
        height: mapHeight,
        isDark,
        markerColor: currentStatus.color,
      })
    : null;

  const tabs: TabDef[] = [
    { key: 'work', label: 'Work', icon: { ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' } },
    { key: 'photos', label: 'Photos', icon: { ios: 'photo.fill', android: 'photo', web: 'photo' }, badge: appointment.job.images?.length },
    {
      key: 'notes',
      label: 'Notes',
      icon: { ios: 'note.text', android: 'note', web: 'note' },
      badge: (appointment.job.notes?.length || 0) + (openStickyCount || 0),
    },
    { key: 'info', label: 'Info', icon: { ios: 'info.circle.fill', android: 'info', web: 'info' } },
  ];

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      {/* ═══ FIXED MAP LAYER (behind the ScrollView) ═══════════════════════════ */}
      {/* Gradient fills the whole area as the fallback; the map image is centred on the hero */}
      <View pointerEvents="none" style={[styles.heroFixedBg, { height: mapHeight + screenHeight / 2 }]}>
        <LinearGradient colors={currentStatus.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroLayer} />
        {heroMapUrl && (
          <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: mapHeight }, mapLayerStyle]}>
            <Image
              source={{ uri: heroMapUrl }}
              style={[styles.heroLayer, { opacity: heroMapLoaded ? 1 : 0 }]}
              resizeMode="cover"
              onLoad={() => setHeroMapLoaded(true)}
              onError={() => setHeroMapLoaded(false)}
            />
          </Animated.View>
        )}
      </View>

      <GestureDetector gesture={pullGesture}>
        <Animated.View style={[{ flex: 1 }, pulledContentStyle]}>
          <Animated.ScrollView
            scrollEnabled={scrollEnabled}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[1]}
            onScroll={onVerticalScroll}
            scrollEventThrottle={16}
            bounces={false}
            overScrollMode="never"
          >
            {/* Child 0: hero + actions + timer. Child 1: sticky tab bar. Child 2: tab content. */}
            <View>
              {/* ═══ HERO SECTION (transparent — the fixed map layer shows through) ═════ */}
              <Animated.View entering={FadeInDown.duration(500)}>
                <View style={styles.heroSection} onLayout={(e) => setHeroHeight(Math.round(e.nativeEvent.layout.height))}>
                  {/* Scrim so white text stays readable over the map; scrolls with the hero text */}
                  {heroMapUrl && heroMapLoaded && (
                    <Animated.View style={[styles.heroLayer, heroScrimStyle]}>
                      <LinearGradient
                        colors={['rgba(2,6,23,0.20)', 'rgba(2,6,23,0.45)', 'rgba(2,6,23,0.80)']}
                        locations={[0, 0.45, 1]}
                        style={styles.heroLayer}
                      />
                    </Animated.View>
                  )}

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
                </View>
              </Animated.View>

              <View style={{ backgroundColor: c.bg }}>
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

              </View>
            </View>

            {/* ═══ TAB BAR (sticky) ═════════════════════════════════════════════════ */}
            <AppointmentTabBar tabs={tabs} active={activeTab} onChange={switchTab} isDark={isDark} />

            {/* ═══ TAB CONTENT (horizontal pager) ══════════════════════════════════ */}
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              scrollEnabled={scrollEnabled}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => onPagerScroll(e.nativeEvent.contentOffset.x)}
              onMomentumScrollEnd={(e) => onPagerSettled(e.nativeEvent.contentOffset.x)}
              contentContainerStyle={{ alignItems: 'flex-start' }}
              style={{ height: pageHeights[settledTab], overflow: 'hidden', backgroundColor: c.bg }}
            >
              <View style={{ width: pageWidth }} onLayout={(e) => onPageLayout('work', e.nativeEvent.layout.height)}>
                <View style={styles.tabPage}>
                  <WorkTab
                    appointment={appointment}
                    token={token}
                    isDark={isDark}
                    formatDate={formatDate}
                    onAddService={handleOpenAddService}
                    onEditService={handleOpenEditService}
                    onRefresh={() => fetchDetails(true)}
                    setScrollEnabled={setScrollEnabled}
                  />
                </View>
              </View>
              <View style={{ width: pageWidth }} onLayout={(e) => onPageLayout('photos', e.nativeEvent.layout.height)}>
                <View style={styles.tabPage}>
                  <PhotosTab appointment={appointment} token={token} isDark={isDark} onRefresh={() => fetchDetails(true)} />
                </View>
              </View>
              <View style={{ width: pageWidth }} onLayout={(e) => onPageLayout('notes', e.nativeEvent.layout.height)}>
                <View style={styles.tabPage}>
                  <NotesTab
                    appointment={appointment}
                    token={token}
                    isDark={isDark}
                    formatDate={formatDate}
                    onOpenNotesChat={(focusInput) => {
                      setFocusNotesInput(focusInput);
                      setNotesModalVisible(true);
                    }}
                    onRemoveNote={handleRemoveNote}
                    loadingRemoveNote={loadingRemoveNote}
                    setScrollEnabled={setScrollEnabled}
                    onStickyCountChange={setOpenStickyCount}
                  />
                </View>
              </View>
              <View style={{ width: pageWidth }} onLayout={(e) => onPageLayout('info', e.nativeEvent.layout.height)}>
                <View style={styles.tabPage}>
                  <InfoTab appointment={appointment} token={token} isDark={isDark} onRefresh={() => fetchDetails(true)} />
                </View>
              </View>
            </ScrollView>
          </Animated.ScrollView>
        </Animated.View>
      </GestureDetector>

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
