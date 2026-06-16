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
import { IAppointmentDetails } from './types';
import { palette, styles } from './styles';

interface TimerHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  appointment: IAppointmentDetails | null;
  isDark: boolean;
  formatDate: (dateStr: string, formatStr: string) => string;
  elapsedSeconds: number;
}

export default function TimerHistoryModal({
  visible,
  onClose,
  appointment,
  isDark,
  formatDate,
  elapsedSeconds,
}: TimerHistoryModalProps) {
  const c = isDark ? palette.dark : palette.light;

  // Swipe gesture to close
  const panHistory = useRef(
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

  const formatTimerText = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '80%', width: '100%' }]}>
          {/* Drag Handle */}
          <View {...panHistory.panHandlers} style={styles.modalDragArea}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Timer History</Text>
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

          {/* Total elapsed */}
          <View style={[styles.timerTotalBanner, { backgroundColor: c.primaryMuted }]}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Time
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: c.primary, fontVariant: ['tabular-nums'] }}>
              {formatTime(elapsedSeconds)}
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingVertical: 8, gap: 8 }} showsVerticalScrollIndicator={false}>
            {appointment.timers?.length === 0 ? (
              <Text style={{ textAlign: 'center', fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 20 }}>
                No timer records found.
              </Text>
            ) : (
              appointment.timers?.map((t, idx) => {
                const startMs = Date.parse(t.started_at);
                const stopMs = t.stopped_at ? Date.parse(t.stopped_at) : Date.now();
                const durationSecs = isNaN(startMs) ? 0 : Math.floor((stopMs - startMs) / 1000);
                const isActive = !t.stopped_at;

                return (
                  <View
                    key={t.id || idx}
                    style={[
                      styles.timerHistoryItem,
                      {
                        backgroundColor: c.timerItemBg,
                        borderLeftColor: isActive ? c.success : c.primary,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                        {formatDate(t.started_at, 'MMM DD, hh:mm A')} — {t.stopped_at ? formatDate(t.stopped_at, 'hh:mm A') : 'Running'}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '500', color: c.textMuted }}>
                        Started by: {t.started_by?.name || 'Unknown'}
                        {t.stopped_by?.name && ` · Stopped by: ${t.stopped_by.name}`}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: isActive ? c.success : c.primary, fontVariant: ['tabular-nums'] }}>
                        {formatTimerText(durationSecs)}
                      </Text>
                      {isActive && (
                        <View style={[styles.miniChip, { backgroundColor: c.successMuted }]}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: c.success }}>LIVE</Text>
                        </View>
                      )}
                    </View>
                  </View>
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
