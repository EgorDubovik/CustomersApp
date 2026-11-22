import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useSocket, useSocketEvent } from '@/context/SocketContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import AppointmentsScheduler from '@/components/scheduler/AppointmentsScheduler';
import AppointmentListItem from '@/components/scheduler/components/AppointmentListItem';
import { ViewType } from '@/components/scheduler/types';
import {
  getWeekRangeAround,
  getWeeksBounds,
  groupConsecutiveWeeks,
  weekKeysBetween,
  parseLocalDateTime,
} from '@/components/scheduler/utils/weeks';
import { useListPaging } from '@/hooks/useListPaging';

interface ITech {
  id: number;
  name: string;
  color: string;
}

interface ITag {
  id: number;
  title: string;
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
  // 0 — scheduled, 1 — on my way, 2 — done
  status?: number;
  address?: string | null;
  paymentPending?: boolean;
  tags?: ITag[];
  job?: {
    id?: number;
    services?: { title: string }[];
    tags?: ITag[];
  } | null;
}

/** Склеивает списки по id: аппоинтмент на стыке недель приходит в обоих запросах */
const mergeById = (prev: IAppointment[], incoming: IAppointment[]) => {
  const map = new Map(prev.map((a) => [a.id, a] as const));
  incoming.forEach((a) => map.set(a.id, a));
  return Array.from(map.values());
};

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

const ROLE_ADMIN = 1;
const ROLE_DISPATCHER = 3;

export default function TabOneScreen() {
  const { token, user } = useAuth();
  const { reconnectCount } = useSocket();
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Ошибка догрузки недели, когда что-то уже показано: не валим экран, а даём повторить
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // ─── Недельная подгрузка (как на вебе) ─────────────────────────────────────
  // Что сейчас смотрят: шедулер сообщает дату и вид через onRangeChange.
  const [viewState, setViewState] = useState<{ date: Date; view: ViewType }>(() => ({ date: initialDate, view: 'day' }));
  const [loadedWeeks, setLoadedWeeks] = useState<string[]>([]);
  const fetchingWeeksRef = useRef<Set<string>>(new Set());

  const loadWeeks = async (weekKeys: string[]): Promise<IAppointment[]> => {
    const { start, end } = getWeeksBounds(weekKeys);
    const params = `startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`;
    const response = await fetch(`${API_URL}/appointments?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Server returned status code ${response.status}`);
    }
    const data = await response.json();
    return data.appointments || [];
  };

  const describeError = (err: any) =>
    err?.message === 'Network request failed'
      ? 'Network error. Please make sure the NestJS backend is running and reachable.'
      : err?.message || 'An error occurred while fetching appointments.';

  // Недели вокруг даты — для Day/Week (List грузится сам, пачками)
  const requiredWeekKeys = useMemo(() => {
    const { start, end } = getWeekRangeAround(viewState.date);
    return weekKeysBetween(start, end);
  }, [viewState]);

  useEffect(() => {
    if (!token) return;
    const weeksToLoad = requiredWeekKeys.filter((key) => !loadedWeeks.includes(key) && !fetchingWeeksRef.current.has(key));
    if (weeksToLoad.length === 0) return;

    weeksToLoad.forEach((key) => fetchingWeeksRef.current.add(key));
    const isFirstLoad = loadedWeeks.length === 0;

    // Подряд идущие недели — одним запросом
    Promise.all(
      groupConsecutiveWeeks(weeksToLoad).map(async (weekKeys) => {
        try {
          return { weekKeys, appointments: await loadWeeks(weekKeys), error: null };
        } catch (err) {
          return { weekKeys, appointments: [] as IAppointment[], error: err };
        } finally {
          weekKeys.forEach((key) => fetchingWeeksRef.current.delete(key));
        }
      })
    ).then((results) => {
      const ok = results.filter((r) => !r.error);
      const failed = results.find((r) => r.error);

      if (ok.length > 0) {
        setAppointments((prev) => mergeById(prev, ok.flatMap((r) => r.appointments)));
        setLoadedWeeks((prev) => [...prev, ...ok.flatMap((r) => r.weekKeys)]);
        setError('');
      }
      if (failed) {
        console.error(failed.error);
        if (isFirstLoad && ok.length === 0) setError(describeError(failed.error));
        else setLoadMoreFailed(true);
      }
    });
  }, [requiredWeekKeys, loadedWeeks, token, retryTick]);

  const retryLoading = () => {
    setLoadMoreFailed(false);
    setError('');
    setRetryTick((n) => n + 1);
  };

  // Pull-to-refresh и реконнект сокета: перечитываем все уже загруженные недели.
  // Внутри перечитанных диапазонов заменяем данные целиком (так пропадут и удалённые).
  const refreshLoadedWeeks = async (showSpinner: boolean) => {
    if (loadedWeeks.length === 0) {
      retryLoading();
      return;
    }
    if (showSpinner) setRefreshing(true);
    try {
      // List перечитывает свой загруженный кусок целиком — позиция в списке не сбрасывается
      if (viewState.view === 'list') await list.refresh();
      const groups = groupConsecutiveWeeks(loadedWeeks);
      const results = await Promise.all(groups.map((weekKeys) => loadWeeks(weekKeys)));
      const ranges = groups.map(getWeeksBounds);
      const inRefreshed = (a: IAppointment) => {
        const s = new Date(a.start).getTime();
        const e = new Date(a.end).getTime();
        return ranges.some((r) => e >= r.start.getTime() && s <= r.end.getTime());
      };
      setAppointments((prev) => mergeById(prev.filter((a) => !inRefreshed(a)), results.flat()));
      setLoadMoreFailed(false);
      setError('');
    } catch (err: any) {
      console.error(err);
      if (showSpinner) Alert.alert('Error', describeError(err));
    } finally {
      setRefreshing(false);
      // Заодно повторяем недели, которые раньше не загрузились
      setRetryTick((n) => n + 1);
    }
  };

  // Events emitted while the socket was down (background, no network) are gone for good,
  // so every reconnect is followed by a silent reload of the loaded weeks.
  useEffect(() => {
    if (reconnectCount > 0 && token) refreshLoadedWeeks(false);
  }, [reconnectCount]);

  // ─── List: keyset-пагинация в обе стороны (hooks/useListPaging) ─────────────
  const mergeAppointments = useCallback((items: IAppointment[]) => {
    setAppointments((prev) => mergeById(prev, items));
  }, []);
  const replaceRange = useCallback((from: Date | null, to: Date | null, items: IAppointment[]) => {
    setAppointments((prev) => {
      const inRange = (a: IAppointment) => {
        const t = parseLocalDateTime(a.start).getTime();
        return (!from || t >= from.getTime()) && (!to || t <= to.getTime());
      };
      return mergeById(prev.filter((a) => !inRange(a)), items);
    });
  }, []);
  const list = useListPaging<IAppointment>({
    token,
    active: viewState.view === 'list',
    date: viewState.date,
    mergeAppointments,
    replaceRange,
  });

  const onRangeChange = useCallback((selectedDate: Date, _start: Date, _end: Date, view: ViewType) => {
    setViewState((prev) =>
      prev.view === view && prev.date.getTime() === selectedDate.getTime() ? prev : { date: new Date(selectedDate), view }
    );
  }, []);

  const renderListItem = useCallback(
    (event: any) => (
      <AppointmentListItem event={event} onPress={() => router.push(`/appointment/${event.id}` as any)} />
    ),
    [router]
  );

  // ─── Real-time updates ─────────────────────────────────────────────────────
  // The payload mirrors one item of GET /appointments (customer & address hoisted to the
  // top level), so it can be dropped straight into the list.
  const isStaff = !!user?.roles_ids?.some((r) => r === ROLE_ADMIN || r === ROLE_DISPATCHER);

  useSocketEvent<IAppointment & { techs?: ITech[] }>('appointment.updated', (incoming) => {
    if (!incoming?.id) return;
    // A technician only sees appointments they're assigned to: if they were just taken off
    // this one, drop it instead of upserting it.
    const assignedToMe = !!incoming.techs?.some((t) => t.id === user?.id);
    setAppointments((prev) => {
      const idx = prev.findIndex((a) => a.id === incoming.id);
      if (!isStaff && !assignedToMe) {
        return idx === -1 ? prev : prev.filter((a) => a.id !== incoming.id);
      }
      if (idx === -1) return [incoming, ...prev];
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...incoming };
      return next;
    });
  });

  useSocketEvent<{ appointmentId: number }>('appointment.deleted', ({ appointmentId }) => {
    setAppointments((prev) => prev.filter((a) => a.id !== appointmentId));
  });

  const mappedEvents = useMemo(
    () =>
      appointments.map((app) => ({
        id: app.id,
        start: app.start,
        end: app.end,
        title: app.customer?.name || 'Unknown Client',
        color: getAppointmentColor(app),
        opacity: 0.8,
        data: app,
      })),
    [appointments]
  );

  const loading = loadedWeeks.length === 0 && !error;
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
          onPress={retryLoading}
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
        onRefresh={() => refreshLoadedWeeks(true)}
        onRangeChange={onRangeChange}
        onClickHandler={(event) => {
          router.push(`/appointment/${event.id}` as any);
        }}
        filterEvent={list.filterEvent}
        renderListItem={renderListItem}
        listLoading={list.loading}
        listReached={list.reached}
        listLoadError={loadMoreFailed || list.loadError}
        onListLoadMore={list.loadMore}
        onListRetry={() => {
          retryLoading();
          list.retry();
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
