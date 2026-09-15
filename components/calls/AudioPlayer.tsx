import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { AudioPlayer as ExpoAudioPlayer, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { callsStyles as styles } from './styles';
import { formatClock } from './helpers';

// Only one recording plays at a time — starting one pauses whichever was active
let activePlayer: ExpoAudioPlayer | null = null;
const claimPlayback = (player: ExpoAudioPlayer) => {
  if (activePlayer && activePlayer !== player) {
    try {
      activePlayer.pause();
    } catch {}
  }
  activePlayer = player;
};

interface Props {
  url: string;
  /** Known length in seconds — shown before the file is loaded */
  durationHint: number;
  /** Colors follow the bubble: white-on-primary for outgoing, dark-on-grey for incoming */
  tint: string;
  trackColor: string;
  textColor: string;
}

/**
 * Compact play/pause + progress bar + time. The source is attached lazily on the first
 * tap so a long timeline doesn't download every recording up front.
 */
export default function AudioPlayer({ url, durationHint, tint, trackColor, textColor }: Props) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const finishedRef = useRef(false);

  const duration = status.duration > 0 ? status.duration : durationHint;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  // Once the file is in, start it if the user is still waiting for it
  useEffect(() => {
    if (loaded && waiting && status.isLoaded) {
      setWaiting(false);
      claimPlayback(player);
      player.play();
    }
  }, [loaded, waiting, status.isLoaded, player]);

  // Rewind to the start when playback reaches the end so the next tap plays again
  useEffect(() => {
    if (!status.isLoaded) return;
    if (status.playing) finishedRef.current = false;
    else if (status.duration > 0 && status.currentTime >= status.duration - 0.25 && !finishedRef.current) {
      finishedRef.current = true;
      player.seekTo(0).catch(() => {});
    }
  }, [status.playing, status.currentTime, status.duration, status.isLoaded, player]);

  const toggle = () => {
    if (!loaded) {
      player.replace({ uri: url });
      setLoaded(true);
      setWaiting(true);
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      claimPlayback(player);
      player.play();
    }
  };

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);
  const onTrackPress = (e: GestureResponderEvent) => {
    if (!loaded || !status.isLoaded || trackWidth === 0 || duration === 0) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth));
    player.seekTo(ratio * duration).catch(() => {});
  };

  const showSpinner = waiting && !status.isLoaded;

  return (
    <View style={styles.playerRow}>
      <Pressable onPress={toggle} hitSlop={6} style={({ pressed }) => [styles.playBtn, { backgroundColor: trackColor }, pressed && { opacity: 0.7 }]}>
        {showSpinner ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <SymbolView
            name={status.playing ? { ios: 'pause.fill', android: 'pause', web: 'pause' } : { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
            size={14}
            tintColor={tint}
          />
        )}
      </Pressable>
      <Pressable onLayout={onTrackLayout} onPress={onTrackPress} hitSlop={{ top: 12, bottom: 12 }} style={[styles.progressTrack, { backgroundColor: trackColor }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: tint }]} />
      </Pressable>
      <Text style={{ fontSize: 11, fontWeight: '600', color: textColor, fontVariant: ['tabular-nums'] }}>
        {status.playing || status.currentTime > 0 ? `${formatClock(status.currentTime)} / ` : ''}
        {formatClock(duration)}
      </Text>
    </View>
  );
}
