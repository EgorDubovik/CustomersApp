import React from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlatList, Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import type { ChatAttachment } from './types';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
/** How far (px) or how fast (px/s) a downward swipe must go to close the viewer. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
const SPRING = { damping: 20, stiffness: 220, mass: 0.6 };

/**
 * Full-screen photos of one message.
 *  - swipe sideways between photos;
 *  - pinch with two fingers to zoom, drag to look around, double-tap to zoom in/out;
 *  - swipe a (not zoomed) photo down to close.
 */
export default function PhotoViewer({ photos, index, onClose }: { photos: ChatAttachment[]; index: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [current, setCurrent] = React.useState(index ?? 0);
  const [zoomed, setZoomed] = React.useState(false);
  /** Vertical drag of the current photo while swiping it away — fades the background and the header. */
  const dismissDrag = useSharedValue(0);

  React.useEffect(() => {
    if (index !== null) {
      setCurrent(index);
      setZoomed(false);
      dismissDrag.value = 0;
    }
  }, [index, dismissDrag]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dismissDrag.value), [0, height * 0.5], [1, 0.2], Extrapolation.CLAMP),
  }));
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dismissDrag.value), [0, 80], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal is a separate native root, so gestures inside it need their own root view (Android). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }, backdropStyle]} />
        {index !== null && (
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            // While a photo is zoomed, a one-finger drag moves around the photo instead of flipping pages.
            scrollEnabled={!zoomed}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => String(p.id)}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item, index: i }) => (
              <ZoomablePhoto
                uri={item.url}
                width={width}
                height={height}
                active={i === current}
                dismissDrag={dismissDrag}
                onZoomChange={setZoomed}
                onDismiss={onClose}
              />
            )}
          />
        )}
        <Animated.View
          style={[{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerStyle]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{photos.length > 1 ? `${current + 1} / ${photos.length}` : ''}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={16} tintColor="#fff" />
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomablePhoto({
  uri,
  width,
  height,
  active,
  dismissDrag,
  onZoomChange,
  onDismiss,
}: {
  uri: string;
  width: number;
  height: number;
  active: boolean;
  dismissDrag: SharedValue<number>;
  onZoomChange: (zoomed: boolean) => void;
  onDismiss: () => void;
}) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const pinching = useSharedValue(false);
  const zoomedSV = useSharedValue(false);
  const [zoomed, setZoomed] = React.useState(false);

  // Pinch start state.
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);

  // Size of the photo as drawn with "contain" — the pan limits depend on it.
  const shownW = useSharedValue(width);
  const shownH = useSharedValue(height);

  const reportZoom = React.useCallback(
    (value: boolean) => {
      setZoomed(value);
      onZoomChange(value);
    },
    [onZoomChange],
  );

  // A photo that was swiped past is reset, so it isn't zoomed when you come back to it.
  React.useEffect(() => {
    if (!active && (scale.value !== 1 || tx.value !== 0 || ty.value !== 0)) {
      scale.value = 1;
      tx.value = 0;
      ty.value = 0;
      zoomedSV.value = false;
      setZoomed(false);
    }
  }, [active, scale, tx, ty, zoomedSV]);

  const setZoomedWorklet = (value: boolean) => {
    'worklet';
    if (zoomedSV.value !== value) {
      zoomedSV.value = value;
      runOnJS(reportZoom)(value);
    }
  };

  /** Keeps the zoomed photo from being dragged off-screen. */
  const settle = (targetScale: number) => {
    'worklet';
    const s = Math.min(Math.max(targetScale, 1), MAX_SCALE);
    const maxX = Math.max(0, (shownW.value * s - width) / 2);
    const maxY = Math.max(0, (shownH.value * s - height) / 2);
    scale.value = withSpring(s, SPRING);
    tx.value = withSpring(Math.min(Math.max(tx.value, -maxX), maxX), SPRING);
    ty.value = withSpring(Math.min(Math.max(ty.value, -maxY), maxY), SPRING);
    if (s <= 1.01) {
      tx.value = withSpring(0, SPRING);
      ty.value = withSpring(0, SPRING);
    }
    setZoomedWorklet(s > 1.01);
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinching.value = true;
      // A second finger during a swipe-down turns it into a zoom: drop the swipe.
      if (!zoomedSV.value) {
        ty.value = 0;
        dismissDrag.value = withSpring(0, SPRING);
      }
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
      startFocalX.value = e.focalX - width / 2;
      startFocalY.value = e.focalY - height / 2;
    })
    .onUpdate((e) => {
      const next = Math.min(Math.max(startScale.value * e.scale, 0.7), MAX_SCALE * 1.3);
      const ratio = next / startScale.value;
      // The point under the fingers stays under the fingers, and moving the fingers drags the photo.
      const focalX = e.focalX - width / 2;
      const focalY = e.focalY - height / 2;
      scale.value = next;
      tx.value = focalX - (startFocalX.value - startTx.value) * ratio;
      ty.value = focalY - (startFocalY.value - startTy.value) * ratio;
    })
    .onEnd(() => {
      settle(scale.value);
    })
    .onFinalize(() => {
      pinching.value = false;
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onChange((e) => {
      if (pinching.value) return; // the pinch moves the photo itself
      if (zoomedSV.value) {
        tx.value += e.changeX;
        ty.value += e.changeY;
      } else {
        // Not zoomed: the photo follows the finger down (and a little up, with resistance) to be swiped away.
        ty.value += e.changeY > 0 || ty.value > 0 ? e.changeY : e.changeY * 0.35;
        dismissDrag.value = ty.value;
      }
    })
    .onEnd((e) => {
      if (pinching.value) return;
      if (zoomedSV.value) {
        settle(scale.value);
        return;
      }
      if (ty.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        ty.value = withTiming(height, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        });
        dismissDrag.value = withTiming(height, { duration: 180 });
      } else {
        ty.value = withSpring(0, SPRING);
        dismissDrag.value = withSpring(0, SPRING);
      }
    });

  // Not zoomed: only a vertical drag is ours — a sideways one flips pages in the list.
  if (!zoomed) pan.activeOffsetY([-12, 12]).failOffsetX([-12, 12]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((e, success) => {
      if (!success) return;
      if (zoomedSV.value) {
        settle(1);
      } else {
        // Zoom in on the tapped point.
        const x = e.x - width / 2;
        const y = e.y - height / 2;
        tx.value = -x * (DOUBLE_TAP_SCALE - 1);
        ty.value = -y * (DOUBLE_TAP_SCALE - 1);
        settle(DOUBLE_TAP_SCALE);
      }
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, overflow: 'hidden' }} collapsable={false}>
        <Animated.Image
          source={{ uri }}
          style={[{ width, height }, imageStyle]}
          resizeMode="contain"
          onLoad={(e) => {
            const { width: w, height: h } = e.nativeEvent.source ?? {};
            if (!w || !h) return;
            const fitW = Math.min(width, (height * w) / h);
            shownW.value = fitW;
            shownH.value = (fitW * h) / w;
          }}
        />
      </View>
    </GestureDetector>
  );
}
