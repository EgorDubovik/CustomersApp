import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { INote } from './types';
import { palette, styles } from './styles';

// ─── Pulsing Dot Component ────────────────────────────────────────────────────
export function PulsingDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: color,
          },
          animStyle,
        ]}
      />
    </View>
  );
}

// ─── Avatar Initials Component ────────────────────────────────────────────────
export function AvatarInitials({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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

// ─── Progress Bar Component ───────────────────────────────────────────────────
export function PaymentProgressBar({ total, remaining, isDark }: { total: number; remaining: number; isDark: boolean }) {
  const paid = total - remaining;
  const pct = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0;
  const c = isDark ? palette.dark : palette.light;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: c.success }}>
          Paid: ${paid.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: c.danger }}>
          Due: ${remaining.toFixed(2)}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.inputBg, overflow: 'hidden' }}>
        <LinearGradient
          colors={isDark ? ['#34D399', '#6EE7B7'] : ['#10B981', '#34D399']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 6, borderRadius: 3, width: `${pct * 100}%` as any }}
        />
      </View>
    </View>
  );
}

// ─── Info Row with Icon ───────────────────────────────────────────────────────
export function InfoRowIcon({
  icon,
  label,
  value,
  isDark,
  valueStyle,
}: {
  icon: any;
  label: string;
  value: string;
  isDark: boolean;
  valueStyle?: any;
}) {
  const c = isDark ? palette.dark : palette.light;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: c.primaryMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SymbolView name={icon} size={16} tintColor={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
        <Text style={[{ fontSize: 14, fontWeight: '600', color: c.text }, valueStyle]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ─── Swipeable Note Component ──────────────────────────────────────────────────
export function SwipeableNote({
  note,
  isSelf,
  canDelete,
  onDelete,
  loadingRemove,
  c,
  isDark,
  formatDate,
  setScrollEnabled,
}: {
  note: INote;
  isSelf: boolean;
  canDelete: boolean;
  onDelete: (id: number) => void;
  loadingRemove: boolean;
  c: any;
  isDark: boolean;
  formatDate: any;
  setScrollEnabled: (enabled: boolean) => void;
}) {
  const translateX = useSharedValue(0);
  const isSwiped = useSharedValue(false);
  const maxSwipe = -70;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Start as true so parent ScrollView can request termination if movement is vertical
      },
      onPanResponderMove: (_, gestureState) => {
        const { dx, dy } = gestureState;
        // Disable parent ScrollView scroll only if gesture is horizontal and has exceeded threshold
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          setScrollEnabled(false);
        }
        let nextX = gestureState.dx;
        if (isSwiped.value) {
          nextX = maxSwipe + gestureState.dx;
        }
        if (nextX > 0) nextX = 0;
        if (nextX < maxSwipe * 1.5) nextX = maxSwipe * 1.5;
        translateX.value = nextX;
      },
      onPanResponderRelease: (_, gestureState) => {
        setScrollEnabled(true);
        if (translateX.value < maxSwipe / 2) {
          translateX.value = withTiming(maxSwipe, { duration: 200 });
          isSwiped.value = true;
        } else {
          translateX.value = withTiming(0, { duration: 200 });
          isSwiped.value = false;
        }
      },
      onPanResponderTerminate: () => {
        setScrollEnabled(true);
        translateX.value = withTiming(0, { duration: 200 });
        isSwiped.value = false;
      },
      onPanResponderTerminationRequest: (_, gestureState) => {
        const { dx, dy } = gestureState;
        // If we have already started swiping horizontally, refuse termination
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          return false;
        }
        // Otherwise, allow ScrollView to take over if drag is vertical
        return Math.abs(dy) > Math.abs(dx);
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleClose = () => {
    translateX.value = withTiming(0, { duration: 200 });
    isSwiped.value = false;
  };

  return (
    <View style={{ width: '100%', alignItems: isSelf ? 'flex-end' : 'flex-start', marginVertical: 4 }}>
      <View style={{ position: 'relative', maxWidth: '85%', minWidth: 120 }}>
        {canDelete && (
          <View
            style={{
              position: 'absolute',
              right: 1,
              top: 1,
              bottom: 1,
              width: 70,
              backgroundColor: c.danger,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 13,
            }}
          >
            {loadingRemove ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Pressable
                onPress={() => {
                  onDelete(note.id);
                  handleClose();
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <SymbolView
                  name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                  size={20}
                  tintColor="#ffffff"
                />
              </Pressable>
            )}
          </View>
        )}

        <Animated.View
          {...(canDelete ? panResponder.panHandlers : {})}
          style={[
            animatedStyle,
            styles.noteContent,
            isSelf ? styles.noteBubbleSelf : styles.noteBubbleOther,
            isSelf ? { backgroundColor: isDark ? '#334155' : '#E2E8F0' } : { backgroundColor: c.primary },
          ]}
        >
          <Text style={[styles.noteText, { color: isSelf ? c.text : '#ffffff' }]}>
            {note.text}
          </Text>
          <View style={styles.noteMeta}>
            <Text style={[styles.noteAuthor, { color: isSelf ? c.textMuted : 'rgba(255,255,255,0.7)' }]}>
              {note.creator?.name || 'Unknown'}
            </Text>
            <Text style={[styles.noteDate, { color: isSelf ? c.textMuted : 'rgba(255,255,255,0.7)' }]}>
              {formatDate(note.created_at, 'MMM DD, hh:mm A')}
            </Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
