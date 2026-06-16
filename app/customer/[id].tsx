import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';

interface IAddress {
  id?: number;
  full: string;
  lat?: number;
  lon?: number;
}

interface IAppointment {
  id: number;
  status: number;
  start: string;
  end: string;
  techs?: { id: number; name: string; color: string }[];
}

interface IJob {
  id: number;
  remainingBalance: number;
  totalPaid: number;
  services: { id: number; title?: string; name?: string; description?: string; price: string }[];
  appointments: IAppointment[];
}

interface ICustomerDetails {
  id: number;
  name: string;
  phone: string;
  email: string;
  addresses: IAddress[];
  jobs: IJob[];
}

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
    shadow: '#000',
  },
};

function AvatarInitials({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

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

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { token } = useAuth();
  const { showToast } = useToast();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = isDark ? palette.dark : palette.light;

  const [customer, setCustomer] = useState<ICustomerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limitViewJobs, setLimitViewJobs] = useState(3);

  const fetchCustomer = async (silent = false) => {
    if (!id || !token) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/customers/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      const data = await response.json();
      setCustomer(data);
    } catch (err: any) {
      console.error(err);
      if (!silent) setError(err.message || 'Failed to fetch customer details.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomer();
  }, [id, token]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (id && token) {
        fetchCustomer(true);
      }
    });
    return unsubscribe;
  }, [navigation, id, token]);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    Clipboard.setStringAsync(text);
    showToast({ message: `${label} copied to clipboard`, type: 'success' });
  };

  const copyAllCustomerInfo = () => {
    if (!customer) return;
    const lines = [customer.name];
    if (customer.phone) lines.push(customer.phone);
    if (customer.email) lines.push(customer.email);
    if (customer.addresses && customer.addresses.length > 0) {
      customer.addresses.forEach((addr) => {
        if (addr.full) lines.push(addr.full);
      });
    }
    Clipboard.setStringAsync(lines.join('\n'));
    showToast({ message: 'Customer info copied to clipboard', type: 'success' });
  };

  const handleRemoveJob = (jobId: number) => {
    Alert.alert(
      'Remove Job',
      'Are you sure you want to remove this job?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/jobs/${jobId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Failed to delete job: status ${response.status}`);
              }

              showToast({ message: 'Job removed successfully', type: 'success' });
              fetchCustomer(true);
            } catch (err: any) {
              console.error(err);
              Alert.alert('Error', err.message || 'Failed to remove job.');
            }
          },
        },
      ]
    );
  };

  const viewCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
  };

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

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: 'Customer Details' }} />
        <View style={{ alignItems: 'center', gap: 16 }}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.textMuted }}>
            Loading details...
          </Text>
        </View>
      </View>
    );
  }

  if (error || !customer) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg, paddingHorizontal: 32 }]}>
        <Stack.Screen options={{ title: 'Customer Details' }} />
        <View style={[styles.errorCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <SymbolView
            name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
            size={36}
            tintColor={c.danger}
          />
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center', marginTop: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', marginTop: 4 }}>
            {error || 'Customer data is empty.'}
          </Text>
          <Pressable
            onPress={() => fetchCustomer()}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: c.primary },
              pressed && { opacity: 0.85 }
            ]}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const sortedJobs = [...(customer.jobs || [])].sort((a, b) => b.id - a.id);
  const displayedJobs = sortedJobs.slice(0, limitViewJobs);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Stack.Screen
        options={{
          title: 'Customer Details',
          headerTitleStyle: {
            fontWeight: '700',
          },
          headerRight: () => (
            <Pressable
              onPress={() => {
                router.push({
                  pathname: '/customer/edit',
                  params: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone || '',
                    email: customer.email || '',
                  },
                });
              }}
              style={({ pressed }) => [styles.headerEditBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Edit</Text>
            </Pressable>
          ),
        }}
      />

      {/* ─── Profile Header ─── */}
      <View style={styles.profileHeader}>
        <AvatarInitials name={customer.name} size={64} />
        <View style={styles.profileHeaderInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.profileName, { color: c.text }]} numberOfLines={1}>
              {customer.name}
            </Text>
            <Pressable
              onPress={copyAllCustomerInfo}
              style={({ pressed }) => [styles.miniCopyBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <SymbolView
                name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
                size={14}
                tintColor={c.primary}
              />
            </Pressable>
          </View>
          <Text style={[styles.jobsCountText, { color: c.textMuted }]}>
            {customer.jobs?.length || 0} job{customer.jobs?.length === 1 ? '' : 's'} history
          </Text>
        </View>
      </View>

      {/* ─── Details Card ─── */}
      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          
          {/* Phone */}
          {customer.phone ? (
            <View style={[styles.contactRow, { backgroundColor: c.inputBg }]}>
              <Pressable
                onPress={() => Linking.openURL(`tel:${customer.phone}`)}
                style={({ pressed }) => [styles.contactRowInfo, { flex: 1 }, pressed && { opacity: 0.7 }]}
              >
                <SymbolView
                  name={{ ios: 'phone.fill', android: 'phone', web: 'phone' }}
                  size={14}
                  tintColor={c.primary}
                />
                <Text style={[styles.contactRowText, { color: c.text }]} numberOfLines={1}>
                  {customer.phone}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => copyToClipboard(customer.phone, 'Phone number')}
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

          {/* Email */}
          {customer.email ? (
            <View style={[styles.contactRow, { backgroundColor: c.inputBg }]}>
              <Pressable
                onPress={() => Linking.openURL(`mailto:${customer.email}`)}
                style={({ pressed }) => [styles.contactRowInfo, { flex: 1 }, pressed && { opacity: 0.7 }]}
              >
                <SymbolView
                  name={{ ios: 'envelope.fill', android: 'email', web: 'email' }}
                  size={14}
                  tintColor={c.primary}
                />
                <Text style={[styles.contactRowText, { color: c.text }]} numberOfLines={1}>
                  {customer.email}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => copyToClipboard(customer.email, 'Email')}
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
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone || '',
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
          )}

          {/* Addresses */}
          {customer.addresses && customer.addresses.length > 0 ? (
            customer.addresses.map((address, idx) => (
              <View key={address.id || idx} style={[styles.contactRow, { backgroundColor: c.inputBg }]}>
                <Pressable
                  onPress={() => {
                    const addressQuery = encodeURIComponent(address.full);
                    const url = Platform.select({
                      ios: `maps://app?daddr=${addressQuery}`,
                      android: `google.navigation:q=${addressQuery}`,
                      default: `https://www.google.com/maps/dir/?api=1&destination=${addressQuery}`,
                    }) || '';
                    Linking.openURL(url);
                  }}
                  style={({ pressed }) => [styles.contactRowInfo, { flex: 1 }, pressed && { opacity: 0.7 }]}
                >
                  <SymbolView
                    name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
                    size={14}
                    tintColor={c.primary}
                  />
                  <Text style={[styles.contactRowText, { color: c.text }]} numberOfLines={2}>
                    {address.full}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => copyToClipboard(address.full, 'Address')}
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
            ))
          ) : null}

        </View>
      </View>

      {/* ─── Jobs History Section ─── */}
      <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Jobs History</Text>
          <View style={[styles.badgeCount, { backgroundColor: c.primaryMuted }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>
              {sortedJobs.length}
            </Text>
          </View>
        </View>

        {sortedJobs.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <SymbolView
              name={{ ios: 'wrench.and.screwdriver', android: 'build', web: 'build' }}
              size={28}
              tintColor={c.textMuted}
            />
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 8, fontStyle: 'italic' }}>
              No jobs listed for this customer.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {displayedJobs.map((job) => {
              const hasAppts = job.appointments && job.appointments.length > 0;
              const mainAppt = hasAppts ? job.appointments[0] : null;
              const leftBorderColor = mainAppt ? getMixedColor(mainAppt.techs) : '#6b7280';
              const jobTitle = job.services?.[0]?.title || job.services?.[0]?.name || 'Unnamed Service';
              const hasMoreServices = job.services && job.services.length > 1;

              const JobItemContent = () => (
                <View style={[styles.jobCard, { backgroundColor: c.card, borderColor: c.cardBorder, borderLeftColor: leftBorderColor }]}>
                  <View style={styles.jobCardHeader}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.jobTitleText, { color: c.text }]} numberOfLines={1}>
                        {jobTitle}
                        {hasMoreServices && (
                          <Text style={{ fontWeight: '500', fontSize: 12, color: c.textMuted }}>
                            {' '}... +{job.services.length - 1} more
                          </Text>
                        )}
                      </Text>
                      {job.services?.[0]?.description ? (
                        <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }} numberOfLines={1}>
                          {job.services[0].description}
                        </Text>
                      ) : null}
                    </View>

                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '800',
                        color: job.remainingBalance > 0 ? c.danger : c.success,
                      }}
                    >
                      {viewCurrency(job.remainingBalance > 0 ? job.remainingBalance : job.totalPaid)}
                    </Text>
                  </View>

                  <View style={styles.jobCardFooter}>
                    {mainAppt ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <SymbolView
                          name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                          size={12}
                          tintColor={c.textMuted}
                        />
                        <Text style={{ fontSize: 12, color: c.textMuted }}>
                          {formatDate(mainAppt.start, 'MMM DD, YYYY')}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <SymbolView
                          name={{ ios: 'calendar.badge.exclamationmark', android: 'calendar_today', web: 'calendar_today' }}
                          size={12}
                          tintColor={c.textMuted}
                        />
                        <Text style={{ fontSize: 12, color: c.textMuted, fontStyle: 'italic' }}>
                          No appointments scheduled
                        </Text>
                      </View>
                    )}

                    {hasAppts ? (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: c.textSecondary }}>
                        {job.appointments.length} Visit{job.appointments.length === 1 ? '' : 's'}
                      </Text>
                    ) : (
                      <Pressable
                        onPress={() => handleRemoveJob(job.id)}
                        style={({ pressed }) => [
                          styles.removeJobBtn,
                          pressed && { opacity: 0.6 }
                        ]}
                        hitSlop={8}
                      >
                        <SymbolView
                          name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                          size={12}
                          tintColor={c.danger}
                        />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: c.danger, marginLeft: 4 }}>
                          Remove Job
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );

              if (mainAppt) {
                return (
                  <Pressable
                    key={job.id}
                    onPress={() => router.push(`/appointment/${mainAppt.id}`)}
                    style={({ pressed }) => [pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 }]}
                  >
                    <JobItemContent />
                  </Pressable>
                );
              }

              return (
                <View key={job.id}>
                  <JobItemContent />
                </View>
              );
            })}

            {sortedJobs.length > limitViewJobs && (
              <Pressable
                onPress={() => setLimitViewJobs(sortedJobs.length)}
                style={({ pressed }) => [
                  styles.viewAllBtn,
                  { borderColor: c.cardBorder, backgroundColor: c.card },
                  pressed && { opacity: 0.8 }
                ]}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>
                  View All {sortedJobs.length} Jobs
                </Text>
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  size={12}
                  tintColor={c.primary}
                  style={{ marginLeft: 4 }}
                />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    width: '100%',
  },
  retryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 20,
  },
  headerEditBtn: {
    paddingHorizontal: 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 16,
  },
  profileHeaderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    flexShrink: 1,
  },
  miniCopyBtn: {
    padding: 4,
  },
  jobsCountText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  contactRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contactRowText: {
    fontSize: 14,
    fontWeight: '600',
  },
  contactCopyBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  badgeCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  emptyContainer: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 6,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  jobCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  jobTitleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  jobCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  removeJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
});
