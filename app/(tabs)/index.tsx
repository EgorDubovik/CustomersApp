import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  ActivityIndicator,
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Tabs, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import AppointmentsScheduler from '@/components/scheduler/AppointmentsScheduler';

interface ITech {
  id: number;
  name: string;
  color: string;
}

interface IAppointment {
  id: number | string;
  start: string | Date;
  end: string | Date;
  customer?: {
    name: string;
  };
  techs?: ITech[];
  status?: number;
}

// ─── Color Helper Utilities ──────────────────────────────────────────────────

const hexToRgb = (hex: string) => {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const bigint = parseInt(cleanHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) => {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
};

const mixHexColors = (hexColors: string[]) => {
  if (hexColors.length === 0) return '#4361ee';
  const total = hexColors.length;
  const rgbValues = hexColors.map(hexToRgb);

  const average = rgbValues.reduce(
    (acc, { r, g, b }) => {
      acc.r += r;
      acc.g += g;
      acc.b += b;
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );

  average.r = Math.round(average.r / total);
  average.g = Math.round(average.g / total);
  average.b = Math.round(average.b / total);

  return rgbToHex(average);
};

const getAppointmentColor = (appointment: IAppointment) => {
  if (!appointment.techs || appointment.techs.length === 0) {
    return '#4361ee';
  }
  const colors = appointment.techs.map((tech) => tech.color).filter(Boolean);
  if (colors.length === 0) return '#4361ee';
  return mixHexColors(colors);
};

// ─── Scheduler Hours Options ─────────────────────────────────────────────────

const START_HOURS_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const hour = i;
  const label = hour === 0 ? '12:00 AM' : `${String(hour).padStart(2, '0')}:00 AM`;
  const value = `${String(hour).padStart(2, '0')}:00`;
  return { label, value };
});

const END_HOURS_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const hour = i + 12;
  const label = hour === 12 ? '12:00 PM' : `${String(hour - 12).padStart(2, '0')}:00 PM`;
  const value = `${String(hour).padStart(2, '0')}:00`;
  return { label, value };
});

// ─── Main Screen Component ───────────────────────────────────────────────────

export default function TabOneScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('20:00');
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const [selectedStart, setSelectedStart] = useState('06:00');
  const [selectedEnd, setSelectedEnd] = useState('20:00');

  useEffect(() => {
    async function loadSettings() {
      try {
        const savedStart = await SecureStore.getItemAsync('scheduler_start_time');
        const savedEnd = await SecureStore.getItemAsync('scheduler_end_time');
        if (savedStart) {
          setStartTime(savedStart);
          setSelectedStart(savedStart);
        }
        if (savedEnd) {
          setEndTime(savedEnd);
          setSelectedEnd(savedEnd);
        }
      } catch (err) {
        console.error('Failed to load scheduler hours', err);
      }
    }
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
    const [startH] = selectedStart.split(':').map(Number);
    const [endH] = selectedEnd.split(':').map(Number);
    if (startH >= endH) {
      Alert.alert('Invalid Range', 'Calendar start hour must be earlier than the end hour.');
      return;
    }

    try {
      await SecureStore.setItemAsync('scheduler_start_time', selectedStart);
      await SecureStore.setItemAsync('scheduler_end_time', selectedEnd);
      setStartTime(selectedStart);
      setEndTime(selectedEnd);
      setSettingsModalVisible(false);
    } catch (err) {
      console.error('Failed to save scheduler hours', err);
      Alert.alert('Error', 'Failed to save settings.');
    }
  };

  const handleOpenSettings = () => {
    setSelectedStart(startTime);
    setSelectedEnd(endTime);
    setSettingsModalVisible(true);
  };

  const [initialDate] = useState(() => new Date());
  const [appointments, setAppointments] = useState<IAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchAppointments = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await fetch(`${API_URL}/appointments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      const data = await response.json();
      setAppointments(data.appointments || []);
    } catch (err: any) {
      console.error(err);
      setError(
        err.message === 'Network request failed'
          ? 'Network error. Please make sure the NestJS backend is running and reachable.'
          : err.message || 'An error occurred while fetching appointments.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAppointments();
    }
  }, [token]);

  const mappedEvents = appointments.map((app) => ({
    id: app.id,
    start: app.start,
    end: app.end,
    title: app.customer?.name || 'Unknown Client',
    color: getAppointmentColor(app),
    opacity: 0.8,
    data: app,
  }));

  // Render Loading spinner
  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, themeStyles.bg]}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        <Text style={[styles.loadingText, themeStyles.textMuted]}>
          Loading schedule...
        </Text>
      </View>
    );
  }

  // Render Error card
  if (error && !refreshing) {
    return (
      <View style={[styles.centerContainer, themeStyles.bg, { paddingHorizontal: 30 }]}>
        <SymbolView
          name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
          size={50}
          tintColor="#e7515a"
          style={{ marginBottom: 16 }}
        />
        <Text style={styles.errorTitle}>Oops! Something went wrong</Text>
        <Text style={[styles.errorSubtitle, themeStyles.textMuted]}>{error}</Text>
        <Pressable
          onPress={() => fetchAppointments(false)}
          style={[styles.retryBtn, themeStyles.btnBorder]}
        >
          <Text style={[styles.retryText, themeStyles.textPrimary]}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, themeStyles.bg]}>
      <Tabs.Screen
        options={{
          title: 'Schedule',
          headerRight: () => (
            <Pressable
              onPress={handleOpenSettings}
              style={({ pressed }) => [
                styles.logoutBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              hitSlop={15}
            >
              <SymbolView
                name={{
                  ios: 'gearshape',
                  android: 'settings',
                  web: 'settings',
                }}
                size={22}
                tintColor={Colors[colorScheme].tint}
              />
            </Pressable>
          ),
          headerTitleStyle: {
            fontWeight: '800',
            fontSize: 18,
          },
        }}
      />

      <AppointmentsScheduler
        startTime={startTime}
        endTime={endTime}
        blockHeight={50}
        showCurrentTimeLine={true}
        currentDate={initialDate}
        defaultViewType="day"
        events={mappedEvents}
        refreshing={refreshing}
        onRefresh={() => fetchAppointments(true)}
        onClickHandler={(event) => {
          router.push(`/appointment/${event.id}` as any);
        }}
        filterEvent={(event) => {
          // Show only active appointments (status !== 2) in list view
          return event.data?.status !== 2;
        }}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={settingsModalVisible}
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <Pressable style={modalStyles.overlay} onPress={() => setSettingsModalVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[modalStyles.card, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            {/* Drag Handle */}
            <View style={modalStyles.dragArea}>
              <View style={modalStyles.dragHandle} />
            </View>

            <View style={modalStyles.header}>
              <Text style={[modalStyles.title, { color: isDark ? '#f8fafc' : '#0f172a' }]}>Schedule Settings</Text>
              <Pressable
                onPress={() => setSettingsModalVisible(false)}
                hitSlop={15}
                style={({ pressed }) => [modalStyles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }, pressed && { opacity: 0.7 }]}
              >
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  tintColor={isDark ? '#94a3b8' : '#64748b'}
                />
              </Pressable>
            </View>

            <View style={modalStyles.content}>
              <Text style={[modalStyles.sectionTitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                Calendar Starts
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={modalStyles.chipsScroll} contentContainerStyle={{ paddingRight: 16 }}>
                {START_HOURS_OPTIONS.map((opt) => {
                  const isSelected = selectedStart === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setSelectedStart(opt.value)}
                      style={[
                        modalStyles.chipBtn,
                        {
                          backgroundColor: isSelected
                            ? (isDark ? '#818cf8' : '#6366f1')
                            : (isDark ? '#27272a' : '#f1f5f9'),
                          borderColor: isSelected
                            ? (isDark ? '#818cf8' : '#6366f1')
                            : (isDark ? '#3f3f46' : '#e2e8f0'),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          modalStyles.chipText,
                          {
                            color: isSelected ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569'),
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={[modalStyles.sectionTitle, { color: isDark ? '#94a3b8' : '#64748b', marginTop: 20 }]}>
                Calendar Ends
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={modalStyles.chipsScroll} contentContainerStyle={{ paddingRight: 16 }}>
                {END_HOURS_OPTIONS.map((opt) => {
                  const isSelected = selectedEnd === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setSelectedEnd(opt.value)}
                      style={[
                        modalStyles.chipBtn,
                        {
                          backgroundColor: isSelected
                            ? (isDark ? '#818cf8' : '#6366f1')
                            : (isDark ? '#27272a' : '#f1f5f9'),
                          borderColor: isSelected
                            ? (isDark ? '#818cf8' : '#6366f1')
                            : (isDark ? '#3f3f46' : '#e2e8f0'),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          modalStyles.chipText,
                          {
                            color: isSelected ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569'),
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={modalStyles.actions}>
              <Pressable
                onPress={() => setSettingsModalVisible(false)}
                style={({ pressed }) => [
                  modalStyles.actionBtn,
                  { backgroundColor: isDark ? '#27272a' : '#f1f5f9' },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#cbd5e1' : '#475569' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveSettings}
                style={({ pressed }) => [
                  modalStyles.actionBtn,
                  { backgroundColor: isDark ? '#818cf8' : '#6366f1', flex: 1.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Save Settings</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e7515a',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
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
  logoutBtn: {
    marginRight: 16,
    padding: 4,
  },
});

const lightStyles = StyleSheet.create({
  bg: {
    backgroundColor: '#f8fafc',
  },
  textMuted: {
    color: '#64748b',
  },
  textPrimary: {
    color: '#4f46e5',
  },
  btnBorder: {
    borderColor: '#e2e8f0',
  },
});

const darkStyles = StyleSheet.create({
  bg: {
    backgroundColor: '#09090b',
  },
  textMuted: {
    color: '#a1a1aa',
  },
  textPrimary: {
    color: '#818cf8',
  },
  btnBorder: {
    borderColor: '#27272a',
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
  },
  dragArea: {
    paddingTop: 4,
    paddingBottom: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipsScroll: {
    marginTop: 6,
    flexDirection: 'row',
  },
  chipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
