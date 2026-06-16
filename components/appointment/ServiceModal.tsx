import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  TextInput,
  ScrollView,
  Switch,
  PanResponder,
  Alert,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native';
import { API_URL } from '@/constants/Config';
import { CompanyService } from '@/context/AuthContext';
import * as storage from '@/utils/storage';
import { IAppointmentDetails, IService } from './types';
import { palette, styles } from './styles';

interface ServiceModalProps {
  visible: boolean;
  onClose: () => void;
  editingService: IService | null;
  appointment: IAppointmentDetails | null;
  token: string | null;
  companyServices: CompanyService[];
  isDark: boolean;
  onSuccess: () => void;
}

export default function ServiceModal({
  visible,
  onClose,
  editingService,
  appointment,
  token,
  companyServices,
  isDark,
  onSuccess,
}: ServiceModalProps) {
  const c = isDark ? palette.dark : palette.light;

  // Local Form States
  const [serviceTitle, setServiceTitle] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceTaxable, setServiceTaxable] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [serviceFormLoading, setServiceFormLoading] = useState(false);
  const [defaultTaxable, setDefaultTaxable] = useState(true);

  // AI Description Generator states
  const [aiStatus, setAiStatus] = useState<'none' | 'loading' | 'success' | 'error'>('none');
  const [aiDots, setAiDots] = useState('.');
  const aiAnim = useSharedValue(0);

  // Load last taxable setting
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

  // Initialize fields on open/edit change
  useEffect(() => {
    if (visible) {
      if (editingService) {
        setServiceTitle(editingService.title || editingService.name || '');
        setServicePrice(parseFloat(editingService.price).toString());
        setServiceDescription(editingService.description || '');
        setServiceTaxable(editingService.taxable || false);
      } else {
        setServiceTitle('');
        setServicePrice('');
        setServiceDescription('');
        setServiceTaxable(defaultTaxable);
      }
      setShowSuggestions(false);
      setAiStatus('none');
    }
  }, [visible, editingService, defaultTaxable]);

  // AI Glow Animation
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

  // AI Dots ticking
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

  // Swipe gesture to close
  const panService = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 60 || gestureState.vy > 0.4) {
          onClose();
        }
      },
    })
  ).current;

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
    if (aiStatus === 'loading' || !token) return;

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

  const handleSaveService = async () => {
    if (serviceFormLoading || !appointment || !token) return;

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

      onClose();
      onSuccess();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Something went wrong while saving.');
    } finally {
      setServiceFormLoading(false);
    }
  };

  const handleDeleteService = () => {
    if (!editingService || !appointment || !token) return;

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

              onClose();
              onSuccess();
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

  if (!appointment) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
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
                onPress={onClose}
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
                    onPress={onClose}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}
