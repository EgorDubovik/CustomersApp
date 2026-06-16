import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  Pressable,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/constants/Config';
import { useColorScheme } from '@/components/useColorScheme';

interface IAddress {
  id: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  full?: string;
}

export default function EditCustomerScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { id, name: routeName, phone: routePhone, email: routeEmail } = useLocalSearchParams<{
    id: string;
    name?: string;
    phone?: string;
    email?: string;
  }>();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;
  const c = {
    primary: isDark ? '#818CF8' : '#007aff',
  };

  // Refactored state to hold full customer details (matching web version)
  const [customer, setCustomer] = useState<{
    name: string;
    phone: string;
    email: string;
    addresses: IAddress[];
  }>({
    name: routeName || '',
    phone: routePhone || '',
    email: routeEmail || '',
    addresses: [],
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState(false);

  // Address Modal States
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [dataAddress, setDataAddress] = useState<IAddress>({
    id: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
  });
  const [addressFormLoading, setAddressFormLoading] = useState(false);
  const [removeAddressLoading, setRemoveAddressLoading] = useState<string | null>(null);
  const [addressError, setAddressError] = useState(false);

  // Safely fetch latest details from server
  useEffect(() => {
    const fetchCustomer = async () => {
      if (!id || !token) return;
      setFetching(true);
      try {
        const response = await fetch(`${API_URL}/customers/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          setCustomer({
            name: data.name || '',
            phone: data.phone || '',
            email: data.email || '',
            addresses: data.addresses || [],
          });
        }
      } catch (err) {
        console.error('Failed to fetch customer details:', err);
      } finally {
        setFetching(false);
      }
    };
    fetchCustomer();
  }, [id, token]);

  const validateForm = () => {
    let isValid = true;
    if (customer.phone.length < 10) {
      setPhoneError(true);
      isValid = false;
    } else {
      setPhoneError(false);
    }
    return isValid;
  };

  const updateCustomer = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/customers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      router.back();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while updating the customer.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (name: string, value: string) => {
    if (name === 'phone') setPhoneError(false);
    let finalVal = value;
    if (name === 'email') finalVal = value.toLowerCase();
    setCustomer(prev => ({ ...prev, [name]: finalVal }));
  };

  // Address CRUD Logic
  const handleAddAddress = () => {
    setDataAddress({
      id: '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      zip: '',
    });
    setAddressError(false);
    setAddressModalVisible(true);
  };

  const handleEditAddress = (address: IAddress) => {
    setDataAddress({
      id: address.id || '',
      line1: address.line1 || '',
      line2: address.line2 || '',
      city: address.city || '',
      state: address.state || '',
      zip: address.zip || '',
    });
    setAddressError(false);
    setAddressModalVisible(true);
  };

  const validateAddressForm = () => {
    if (dataAddress.line1.length < 5) {
      setAddressError(true);
      return false;
    }
    setAddressError(false);
    return true;
  };

  const handleSaveAddress = async () => {
    if (!validateAddressForm()) return;
    if (!token) return;

    setAddressFormLoading(true);
    const method = dataAddress.id ? 'PUT' : 'POST';
    const url = dataAddress.id
      ? `${API_URL}/customers/${id}/address/${dataAddress.id}`
      : `${API_URL}/customers/${id}/address`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(dataAddress),
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      const resData = await response.json();
      const updatedCustomer = resData.customer || resData;
      if (updatedCustomer) {
        setCustomer(prev => ({
          ...prev,
          addresses: updatedCustomer.addresses || prev.addresses,
        }));
      }
      setAddressModalVisible(false);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to save address.');
    } finally {
      setAddressFormLoading(false);
    }
  };

  const handleRemoveAddress = (addressId: string) => {
    if (!token) return;
    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setRemoveAddressLoading(addressId);
            try {
              const response = await fetch(`${API_URL}/customers/${id}/address/${addressId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error(`Server returned status code ${response.status}`);
              }

              setCustomer(prev => ({
                ...prev,
                addresses: prev.addresses.filter(addr => addr.id !== addressId),
              }));
              setAddressModalVisible(false);
            } catch (err: any) {
              console.error(err);
              Alert.alert('Error', err.message || 'Failed to delete address.');
            } finally {
              setRemoveAddressLoading(null);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, themeStyles.bg]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: 'Edit Customer',
          headerTitleStyle: {
            fontWeight: '700',
          },
          headerRight: () => (
            <TouchableOpacity onPress={updateCustomer} disabled={loading || fetching} style={styles.headerSaveBtn}>
              {loading ? (
                <ActivityIndicator size="small" color={isDark ? '#818CF8' : '#6366F1'} />
              ) : (
                <Text style={[styles.headerSaveText, { color: isDark ? '#818CF8' : '#6366F1' }]}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          )
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {fetching ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color={isDark ? '#818CF8' : '#6366F1'} />
        ) : (
          <>
            <Text style={styles.sectionHeader}>Personal Info</Text>

            <View style={[styles.groupContainer, themeStyles.cardBg, themeStyles.cardBorder]}>
              {/* Name Row */}
              <View style={styles.rowInput}>
                <Text style={[styles.rowLabel, themeStyles.textTitle]}>Name</Text>
                <TextInput
                  style={[styles.input, themeStyles.textTitle]}
                  placeholder="Required"
                  placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                  value={customer.name}
                  onChangeText={(text) => handleChange('name', text)}
                  autoCorrect={false}
                />
              </View>

              <View style={[styles.separator, themeStyles.separatorColor]} />

              {/* Phone Row */}
              <View style={styles.rowInput}>
                <Text style={[styles.rowLabel, themeStyles.textTitle, phoneError && styles.labelError]}>Phone</Text>
                <TextInput
                  style={[styles.input, themeStyles.textTitle]}
                  placeholder="Required (10+ digits)"
                  placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                  keyboardType="phone-pad"
                  value={customer.phone}
                  onChangeText={(text) => handleChange('phone', text)}
                  autoCorrect={false}
                />
              </View>

              <View style={[styles.separator, themeStyles.separatorColor]} />

              {/* Email Row */}
              <View style={styles.rowInput}>
                <Text style={[styles.rowLabel, themeStyles.textTitle]}>Email</Text>
                <TextInput
                  style={[styles.input, themeStyles.textTitle]}
                  placeholder="Optional"
                  placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={customer.email}
                  onChangeText={(text) => handleChange('email', text)}
                  autoCorrect={false}
                />
              </View>
            </View>

            {phoneError && <Text style={styles.errorHelper}>Phone number must be at least 10 digits</Text>}

            {/* Addresses Section */}
            <Text style={styles.sectionHeader}>Addresses</Text>

            <View style={[styles.groupContainer, themeStyles.cardBg, themeStyles.cardBorder]}>
              {customer.addresses && customer.addresses.length > 0 ? (
                customer.addresses.map((address, index) => (
                  <View key={address.id || index.toString()}>
                    {index > 0 && <View style={[styles.separator, themeStyles.separatorColor]} />}
                    <View style={styles.addressRow}>
                      <Pressable
                        style={{ flex: 1, paddingVertical: 12 }}
                        onPress={() => handleEditAddress(address)}
                      >
                        <Text style={[styles.addressText, themeStyles.textTitle]} numberOfLines={1}>
                          {address.full || `${address.line1}, ${address.city}`}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              ) : (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: isDark ? '#5c6e84' : '#8e8e93', fontStyle: 'italic' }}>
                    No addresses added yet.
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              style={[styles.addAddressBtn, { borderColor: isDark ? '#27272a' : '#e2e8f0', backgroundColor: isDark ? '#18181b' : '#ffffff' }]}
              onPress={handleAddAddress}
            >
              <SymbolView
                name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add' }}
                size={16}
                tintColor={isDark ? '#818CF8' : '#007aff'}
              />
              <Text style={[styles.addAddressBtnText, { color: isDark ? '#818CF8' : '#007aff' }]}>
                Add new address
              </Text>
            </Pressable>

            <TouchableOpacity
              style={[styles.primaryButton, themeStyles.btnPrimary]}
              onPress={updateCustomer}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Address Form Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addressModalVisible}
        onRequestClose={() => setAddressModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setAddressModalVisible(false)}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={[styles.modalCard, { backgroundColor: isDark ? '#1c1c1e' : '#ffffff', maxHeight: '90%', width: '100%' }]}
            >
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, themeStyles.textTitle]}>
                  {dataAddress.id ? 'Edit Address' : 'Add New Address'}
                </Text>
                <Pressable
                  onPress={() => setAddressModalVisible(false)}
                  hitSlop={15}
                  style={[styles.modalCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}
                >
                  <SymbolView
                    name={{ ios: 'xmark', android: 'close', web: 'close' }}
                    size={14}
                    tintColor={isDark ? '#8e8e93' : '#8e8e93'}
                  />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 14 }} showsVerticalScrollIndicator={false}>

                {/* Line 1 */}
                <View>
                  <View style={[styles.modernInputWrapper, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                    <SymbolView
                      name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }}
                      size={15}
                      tintColor={c.primary}
                    />
                    <TextInput
                      style={[styles.modernInput, { color: isDark ? '#ffffff' : '#000000' }]}
                      placeholder="Address Line 1"
                      placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                      value={dataAddress.line1}
                      onChangeText={(text) => setDataAddress(prev => ({ ...prev, line1: text }))}
                    />
                  </View>
                  {addressError && <Text style={{ color: '#ff3b30', fontSize: 11, marginTop: 4, marginLeft: 4 }}>Address must be at least 5 characters</Text>}
                </View>

                {/* Line 2 */}
                <View>
                  <View style={[styles.modernInputWrapper, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                    <SymbolView
                      name={{ ios: 'building.2.fill', android: 'business', web: 'business' }}
                      size={15}
                      tintColor={c.primary}
                    />
                    <TextInput
                      style={[styles.modernInput, { color: isDark ? '#ffffff' : '#000000' }]}
                      placeholder="Address Line 2 (optional)"
                      placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                      value={dataAddress.line2}
                      onChangeText={(text) => setDataAddress(prev => ({ ...prev, line2: text }))}
                    />
                  </View>
                </View>

                {/* City */}
                <View>
                  <View style={[styles.modernInputWrapper, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                    <SymbolView
                      name={{ ios: 'building.fill', android: 'location_city', web: 'location_city' }}
                      size={15}
                      tintColor={c.primary}
                    />
                    <TextInput
                      style={[styles.modernInput, { color: isDark ? '#ffffff' : '#000000' }]}
                      placeholder="City"
                      placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                      value={dataAddress.city}
                      onChangeText={(text) => setDataAddress(prev => ({ ...prev, city: text }))}
                    />
                  </View>
                </View>

                {/* State */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <View style={[styles.modernInputWrapper, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                      <SymbolView
                        name={{ ios: 'map.fill', android: 'map', web: 'map' }}
                        size={15}
                        tintColor={c.primary}
                      />
                      <TextInput
                        style={[styles.modernInput, { color: isDark ? '#ffffff' : '#000000' }]}
                        placeholder="State"
                        placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                        value={dataAddress.state}
                        onChangeText={(text) => setDataAddress(prev => ({ ...prev, state: text }))}
                      />
                    </View>
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <View style={[styles.modernInputWrapper, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                      <SymbolView
                        name={{ ios: 'number', android: 'pin', web: 'pin' }}
                        size={15}
                        tintColor={c.primary}
                      />
                      <TextInput
                        style={[styles.modernInput, { color: isDark ? '#ffffff' : '#000000' }]}
                        placeholder="Zip Code"
                        placeholderTextColor={isDark ? '#5c6e84' : '#c4c4c6'}
                        value={dataAddress.zip}
                        onChangeText={(text) => setDataAddress(prev => ({ ...prev, zip: text }))}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>

              </ScrollView>

              {/* Modal Actions */}
              <View style={styles.modalActions}>
                {dataAddress.id ? (
                  <Pressable
                    onPress={() => handleRemoveAddress(dataAddress.id)}
                    disabled={removeAddressLoading !== null}
                    style={[styles.modalActionBtn, { backgroundColor: isDark ? 'rgba(255, 59, 48, 0.12)' : 'rgba(255, 59, 48, 0.08)', flex: 1 }]}
                  >
                    {removeAddressLoading ? (
                      <ActivityIndicator size="small" color="#ff3b30" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#ff3b30' }}>Delete</Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setAddressModalVisible(false)}
                    style={[styles.modalActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f2f2f7', flex: 1 }]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#a1a1aa' : '#8e8e93' }}>Discard</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleSaveAddress}
                  disabled={addressFormLoading}
                  style={[styles.modalActionBtn, { backgroundColor: isDark ? '#0A84FF' : '#007aff', flex: 1.5 }]}
                >
                  {addressFormLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Save</Text>
                  )}
                </Pressable>
              </View>

            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  headerSaveBtn: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSaveText: {
    fontSize: 17,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textTransform: 'uppercase',
    marginLeft: 16,
    marginBottom: 8,
    marginTop: 16,
  },
  groupContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  rowInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
  },
  rowLabel: {
    width: 90,
    fontSize: 16,
    fontWeight: '500',
  },
  labelError: {
    color: '#ff3b30',
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    paddingVertical: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  errorHelper: {
    color: '#ff3b30',
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  addressText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  deleteAddressBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 12,
  },
  addAddressBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 8,
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
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 4,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    width: '100%',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  modalActionBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernFormLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginLeft: 2,
  },
  modernInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  modernInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
});

const lightStyles = StyleSheet.create({
  bg: { backgroundColor: '#f2f2f7' },
  cardBg: { backgroundColor: '#ffffff' },
  cardBorder: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
  textTitle: { color: '#000000' },
  separatorColor: { backgroundColor: 'rgba(0,0,0,0.08)' },
  btnPrimary: { backgroundColor: '#007aff' },
});

const darkStyles = StyleSheet.create({
  bg: { backgroundColor: '#000000' },
  cardBg: { backgroundColor: '#1c1c1e' },
  cardBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  textTitle: { color: '#ffffff' },
  separatorColor: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnPrimary: { backgroundColor: '#0A84FF' },
});
