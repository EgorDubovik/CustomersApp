import React, { useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  PanResponder,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { IAppointmentDetails } from './types';
import { palette, styles } from './styles';

interface JobHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  appointment: IAppointmentDetails | null;
  isDark: boolean;
  formatDate: (dateStr: string, formatStr: string) => string;
}

export default function JobHistoryModal({
  visible,
  onClose,
  appointment,
  isDark,
  formatDate,
}: JobHistoryModalProps) {
  const router = useRouter();
  const c = isDark ? palette.dark : palette.light;

  // Swipe gesture to close
  const panJobHistory = useRef(
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

  const statusConfig = [
    { label: 'Scheduled', color: c.primary },
    { label: 'Active', color: c.success },
    { label: 'Finished', color: c.warning },
  ];

  if (!appointment) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '80%', width: '100%' }]}>
          {/* Drag Handle */}
          <View {...panJobHistory.panHandlers} style={styles.modalDragArea}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Job History</Text>
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

          <ScrollView contentContainerStyle={{ paddingVertical: 8, gap: 8 }} showsVerticalScrollIndicator={false}>
            {!appointment.job.appointments || appointment.job.appointments.length === 0 ? (
              <Text style={{ textAlign: 'center', fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 20 }}>
                No other appointments found for this job.
              </Text>
            ) : (
              appointment.job.appointments.map((appt, idx) => {
                const statusConf = statusConfig[appt.status] || statusConfig[0];
                const borderColor = getMixedColor(appt.techs);
                const isCurrent = appt.id === appointment.id;

                return (
                  <Pressable
                    key={appt.id || idx}
                    onPress={() => {
                      if (isCurrent) return;
                      onClose();
                      router.push(`/appointment/${appt.id}` as any);
                    }}
                    style={({ pressed }) => [
                      styles.timerHistoryItem,
                      {
                        backgroundColor: isCurrent ? c.primaryMuted : c.timerItemBg,
                        borderLeftColor: borderColor,
                      },
                      pressed && !isCurrent && { opacity: 0.7 },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                        {formatDate(appt.start, 'MMM DD, YYYY')}
                        {isCurrent && <Text style={{ color: c.primary, fontSize: 11, fontStyle: 'italic' }}>  (Current)</Text>}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '500', color: c.textMuted }}>
                        {formatDate(appt.start, 'hh:mm A')} — {formatDate(appt.end, 'hh:mm A')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <View style={[styles.miniChip, { backgroundColor: statusConf.color + '20' }]}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: statusConf.color }}>
                          {statusConf.label}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.modalActionBtn,
              { backgroundColor: c.primary, marginTop: 12 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
