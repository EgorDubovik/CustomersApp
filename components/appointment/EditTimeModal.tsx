import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SymbolView } from 'expo-symbols';
import { API_URL } from '@/constants/Config';
import { useToast } from '@/context/ToastContext';
import { IAppointmentDetails } from './types';
import { palette, styles } from './styles';

interface EditTimeModalProps {
  visible: boolean;
  onClose: () => void;
  appointment: IAppointmentDetails | null;
  token: string | null;
  isDark: boolean;
  formatDate: (dateStr: string | Date, formatStr: string) => string;
  onSuccess: () => void;
}

export default function EditTimeModal({
  visible,
  onClose,
  appointment,
  token,
  isDark,
  formatDate,
  onSuccess,
}: EditTimeModalProps) {
  const c = isDark ? palette.dark : palette.light;
  const { showToast } = useToast();

  // Local States
  const [editTimeFrom, setEditTimeFrom] = useState<Date>(new Date());
  const [editTimeTo, setEditTimeTo] = useState<Date>(new Date());
  const [timeToIsSelected, setTimeToIsSelected] = useState(false);
  const [updateTimeLoading, setUpdateTimeLoading] = useState(false);
  const [selectedEditTab, setSelectedEditTab] = useState<'timeFrom' | 'timeTo'>('timeFrom');

  // Initialize fields on open
  useEffect(() => {
    if (visible && appointment) {
      const start = appointment.start ? new Date(appointment.start) : new Date();
      const end = appointment.end ? new Date(appointment.end) : new Date(start.getTime() + 2 * 3600_000);
      setEditTimeFrom(start);
      setEditTimeTo(end);
      setTimeToIsSelected(false);
      setSelectedEditTab('timeFrom');
    }
  }, [visible, appointment]);

  const manualIsoString = (date: Date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}T${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}Z`;
  };

  const onEditTimeChange = (event: any, selectedDate?: Date) => {
    if (selectedDate) {
      if (selectedEditTab === 'timeFrom') {
        setEditTimeFrom(selectedDate);
        if (!timeToIsSelected) {
          setEditTimeTo(new Date(selectedDate.getTime() + 2 * 3600_000));
        }
      } else {
        setTimeToIsSelected(true);
        setEditTimeTo(selectedDate);
      }
    }
  };

  const handleUpdateAppointmentTime = async () => {
    if (updateTimeLoading || !appointment || !token) return;
    setUpdateTimeLoading(true);

    try {
      const response = await fetch(`${API_URL}/appointments/${appointment.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          timeFrom: manualIsoString(editTimeFrom),
          timeTo: manualIsoString(editTimeTo),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      showToast({ message: 'Appointment time updated successfully', type: 'success' });
      onClose();
      onSuccess();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to update appointment time.');
    } finally {
      setUpdateTimeLoading(false);
    }
  };

  if (!appointment) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.modalCard,
            { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '90%', width: '100%' },
          ]}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Edit Appointment Time</Text>
            <Pressable
              onPress={onClose}
              hitSlop={15}
              style={({ pressed }) => [
                styles.modalCloseBtn,
                { backgroundColor: c.inputBg },
                pressed && { opacity: 0.7 },
              ]}
            >
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={14}
                tintColor={c.textMuted}
              />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
            {/* Tab selectors matching the web layout */}
            <View style={[styles.editTimeTabsContainer, { backgroundColor: c.inputBg }]}>
              <Pressable
                onPress={() => setSelectedEditTab('timeFrom')}
                style={[
                  styles.editTimeTab,
                  selectedEditTab === 'timeFrom' && { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#FFFFFF' },
                ]}
              >
                <Text style={[styles.editTimeTabLabel, { color: selectedEditTab === 'timeFrom' ? c.text : c.textMuted }]}>
                  From:
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.editTimeTabVal, { color: selectedEditTab === 'timeFrom' ? c.text : c.textMuted, fontWeight: '700' }]}>
                    {formatDate(editTimeFrom, 'MMM DD')}
                  </Text>
                  <Text style={[styles.editTimeTabValTime, { color: selectedEditTab === 'timeFrom' ? c.text : c.textMuted }]}>
                    {formatDate(editTimeFrom, 'hh:mm A')}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setSelectedEditTab('timeTo')}
                style={[
                  styles.editTimeTab,
                  selectedEditTab === 'timeTo' && { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#FFFFFF' },
                ]}
              >
                <Text style={[styles.editTimeTabLabel, { color: selectedEditTab === 'timeTo' ? c.text : c.textMuted }]}>
                  To:
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.editTimeTabVal, { color: selectedEditTab === 'timeTo' ? c.text : c.textMuted, fontWeight: '700' }]}>
                    {formatDate(editTimeTo, 'MMM DD')}
                  </Text>
                  <Text style={[styles.editTimeTabValTime, { color: selectedEditTab === 'timeTo' ? c.text : c.textMuted }]}>
                    {formatDate(editTimeTo, 'hh:mm A')}
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Reset lock button below tabs if To is customized */}
            {selectedEditTab === 'timeTo' && timeToIsSelected && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12, marginRight: 4 }}>
                <Pressable
                  onPress={() => {
                    setTimeToIsSelected(false);
                    setEditTimeTo(new Date(editTimeFrom.getTime() + 2 * 3600_000));
                  }}
                  style={{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: c.primaryMuted, borderRadius: 6 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: c.primary }}>Reset lock (+2h)</Text>
                </Pressable>
              </View>
            )}

            {/* Standard iOS/Android DatePicker */}
            <View style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.02)', borderRadius: 12, padding: 8, marginTop: 8 }}>
              <DateTimePicker
                value={selectedEditTab === 'timeFrom' ? editTimeFrom : editTimeTo}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onValueChange={onEditTimeChange}
                textColor={isDark ? '#F1F5F9' : '#1E293B'}
                style={{ height: 200, width: '100%' }}
              />
            </View>
          </ScrollView>

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
              onPress={handleUpdateAppointmentTime}
              disabled={updateTimeLoading}
              style={({ pressed }) => [
                styles.modalActionBtn,
                { backgroundColor: c.primary, flex: 1.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {updateTimeLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Update</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
