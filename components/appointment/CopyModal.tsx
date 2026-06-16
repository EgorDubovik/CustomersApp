import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  PanResponder,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { API_URL } from '@/constants/Config';
import { IAppointmentDetails } from './types';
import { palette, styles } from './styles';

interface CopyModalProps {
  visible: boolean;
  onClose: () => void;
  appointment: IAppointmentDetails | null;
  token: string | null;
  isDark: boolean;
}

export default function CopyModal({ visible, onClose, appointment, token, isDark }: CopyModalProps) {
  const router = useRouter();
  const c = isDark ? palette.dark : palette.light;

  // Local States
  const [copyDate, setCopyDate] = useState<Date>(new Date());
  const [copyDurationHours, setCopyDurationHours] = useState<number>(2);
  const [isFinishCurrentAppointment, setIsFinishCurrentAppointment] = useState(true);
  const [copyLoading, setCopyLoading] = useState(false);

  // Set initial copy date to current time when modal opens
  useEffect(() => {
    if (visible) {
      setCopyDate(new Date());
    }
  }, [visible]);

  // Swipe gesture to close
  const panCopy = useRef(
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

  const handleCreateCopy = async () => {
    if (copyLoading || !appointment || !token) return;
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
      onClose();
      Alert.alert('Success', 'New appointment created successfully.');
      router.push(`/appointment/${resData.appointment.id}` as any);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to create copy.');
    } finally {
      setCopyLoading(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', width: '100%' }]}>
          {/* Drag Handle */}
          <View {...panCopy.panHandlers} style={styles.modalDragArea}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>New Appointment</Text>
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

          {/* Date & Time Selector */}
          <View style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={[styles.stepperLabel, { color: c.textMuted }]}>Start Date & Time</Text>
              <View style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.02)', borderRadius: 12, padding: 8 }}>
                <DateTimePicker
                  value={copyDate}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onValueChange={(event: any, selectedDate?: Date) => {
                    if (selectedDate) setCopyDate(selectedDate);
                  }}
                  textColor={isDark ? '#F1F5F9' : '#1E293B'}
                  style={{ height: 200, width: '100%' }}
                />
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
              onPress={onClose}
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
  );
}
