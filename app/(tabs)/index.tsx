import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  ActivityIndicator,
  View,
  Text,
  Pressable,
} from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
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

// ─── Main Screen Component ───────────────────────────────────────────────────

export default function TabOneScreen() {
  const { token, logout } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

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
        <ActivityIndicator size="large" color={isDark ? '#805dca' : '#4361ee'} />
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
              onPress={logout}
              style={({ pressed }) => [
                styles.logoutBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              hitSlop={15}
            >
              <SymbolView
                name={{
                  ios: 'rectangle.portrait.and.arrow.right',
                  android: 'logout',
                  web: 'logout',
                }}
                size={22}
                tintColor={isDark ? '#805dca' : '#4361ee'}
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
        startTime="06:00"
        endTime="20:00"
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
          // Show completed appointments (status 2) on mobile as requested, colored differently
          return true;
        }}
      />
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
    backgroundColor: '#f6f8fa',
  },
  textMuted: {
    color: '#515365',
  },
  textPrimary: {
    color: '#4361ee',
  },
  btnBorder: {
    borderColor: '#4361ee',
  },
});

const darkStyles = StyleSheet.create({
  bg: {
    backgroundColor: '#060818',
  },
  textMuted: {
    color: '#888ea8',
  },
  textPrimary: {
    color: '#805dca',
  },
  btnBorder: {
    borderColor: '#805dca',
  },
});
