import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import AudioPlayer from './AudioPlayer';
import { callsPalette, callsStyles as styles } from './styles';
import { ICall, ICallComment } from './types';
import { formatCallDuration, formatClock } from './helpers';
import CommentsSheet from './CommentsSheet';
import HoldableBubble, { type BubbleAction, type HoldableBubbleHandle } from './HoldableBubble';
import CommentsBadge from './CommentsBadge';
import TimeWithDate from '@/components/TimeWithDate';


interface Props {
  call: ICall;
  isDark: boolean;
  onCommentsChange: (call: ICall, comments: ICallComment[]) => void;
  onShowTranscription: (callId: string) => void;
  /** Opened from a push / Mentions: comments start open and this one is highlighted */
  focusKey?: string | null;
  focusCommentId?: string | null;
}

/** Seconds since `since`, ticking once a second while `enabled` */
const useElapsedSeconds = (since: string | null | undefined, enabled: boolean) => {
  const calc = () => (since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(calc);
  useEffect(() => {
    if (!enabled || !since) return;
    setSeconds(calc());
    const t = setInterval(() => setSeconds(calc()), 1000);
    return () => clearInterval(t);
  }, [since, enabled]);
  return seconds;
};

export default function CallItem({ call, isDark, onCommentsChange, onShowTranscription, focusKey, focusCommentId }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;

  const [showSummary, setShowSummary] = useState(false);
  // Comments sheet: open, and the screen Y it rises from (null → from the bottom)
  const [commentsFrom, setCommentsFrom] = useState<{ y: number | null } | null>(null);
  const bubbleRef = useRef<HoldableBubbleHandle>(null);

  // Jumped here from a push / Mentions → open the comments (the list is still scrolling, so from the bottom)
  useEffect(() => {
    if (!focusKey) return;
    setCommentsFrom({ y: null });
  }, [focusKey]);

  const isOutgoing = call.direction === 'outgoing';
  const isCompleted = call.status === 'completed';
  const isMissed = call.is_missed_call || call.status === 'no-answer';
  const isVoicemail = Boolean(call.voicemail_url);
  const audioUrl = (isVoicemail ? call.voicemail_url : call.recording_url) || call.voicemail_url || call.recording_url || '';
  const hasRecord = Boolean(audioUrl);
  const audioDuration = isVoicemail ? Number(call.voicemail_duration) || call.duration_seconds || 0 : call.duration_seconds || 0;

  // Live call: ringing until answered_at, then "in progress" until completed_at
  const isLive = !call.completed_at && (call.status === 'ringing' || call.status === 'active');
  const isOngoing = isLive && !!call.answered_at;
  const isRinging = isLive && !call.answered_at;
  const elapsed = useElapsedSeconds(call.answered_at, isOngoing);

  const secondsSinceEnd = call.completed_at ? Math.floor((Date.now() - new Date(call.completed_at).getTime()) / 1000) : 100;
  const recordingExpected = call.recording_expected ?? true;
  const isWaitingForRecording = isCompleted && !hasRecord && recordingExpected && secondsSinceEnd < 30;
  const callDuration = call.duration_seconds > 0 ? formatCallDuration(call.duration_seconds) : '';

  // Bubble colours: outgoing = primary with white text, incoming = grey with dark text
  const bubbleBg = isOutgoing ? c.bubbleOut : c.bubbleIn;
  const bubbleText = isOutgoing ? c.bubbleOutText : c.bubbleInText;
  const bubbleMuted = isOutgoing ? 'rgba(255,255,255,0.75)' : c.textMuted;
  const trackColor = isOutgoing ? 'rgba(255,255,255,0.28)' : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  const commentsCount = call.comments?.length ?? 0;
  const openComments = () => {
    if (!bubbleRef.current) return setCommentsFrom({ y: null });
    bubbleRef.current.measure((y) => setCommentsFrom({ y: Number.isFinite(y) ? y : null }));
  };
  // Long press on the bubble: comments and, when the call was recorded / analysed, its transcription
  const hasTranscription = !!call.ai_details?.transcription || !!call.ai_details?.summary || (isCompleted && hasRecord);
  const actions: BubbleAction[] = [
    {
      key: 'comments',
      label: commentsCount ? `Comments (${commentsCount})` : 'Add comment',
      icon: { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' },
      onPress: openComments,
    },
  ];
  if (hasTranscription)
    actions.push({
      key: 'transcription',
      label: 'Transcription',
      icon: { ios: 'text.quote', android: 'subject', web: 'subject' },
      onPress: () => onShowTranscription(call.id),
    });

  const bubble = () => (
    <View style={[styles.bubble, isOutgoing ? styles.bubbleOut : styles.bubbleIn, { backgroundColor: bubbleBg, maxWidth: '100%', gap: 8 }]}>
      {isMissed && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SymbolView name={{ ios: 'phone.down.fill', android: 'phone_missed', web: 'phone_missed' }} size={18} tintColor={isOutgoing ? '#FECACA' : c.danger} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: isOutgoing ? '#FECACA' : c.danger }}>{isVoicemail ? 'Missed call · voicemail' : 'Missed call'}</Text>
        </View>
      )}

      {(isRinging || isOngoing) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isOngoing ? c.success : bubbleMuted }} />
          <Text style={{ flex: 1, fontSize: 13, fontStyle: 'italic', color: bubbleMuted }}>
            {isOngoing ? 'Call in progress' : isOutgoing ? 'Outgoing call…' : 'Incoming call…'}
          </Text>
          {isOngoing && <Text style={{ fontSize: 12, fontWeight: '700', color: bubbleText, fontVariant: ['tabular-nums'] }}>{formatClock(elapsed)}</Text>}
        </View>
      )}

      {(isCompleted || isVoicemail) &&
        (hasRecord ? (
          <AudioPlayer url={audioUrl} durationHint={audioDuration} tint={bubbleText} trackColor={trackColor} textColor={bubbleMuted} />
        ) : isWaitingForRecording ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={bubbleMuted} />
            <Text style={{ fontSize: 12, fontStyle: 'italic', color: bubbleMuted }}>Recording processing…</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 12, fontStyle: 'italic', color: bubbleMuted }}>
            No record{callDuration ? `. Call duration: ${callDuration}` : ''}
          </Text>
        ))}
    </View>
  );

  return (
    <View style={styles.callBlock}>
      <View style={{ flexDirection: 'row', justifyContent: isOutgoing ? 'flex-end' : 'flex-start' }}>
        <View style={{ maxWidth: '92%', minWidth: 240 }}>
          {/* ─── Bubble: hold it for the menu (comments, transcription) ─── */}
          <HoldableBubble
            ref={bubbleRef}
            align={isOutgoing ? 'right' : 'left'}
            isDark={isDark}
            actions={actions}
            renderBubble={bubble}
          />

          {/* ─── Meta row: time · summary ─── */}
          <View style={[styles.bubbleMeta, { flexDirection: isOutgoing ? 'row-reverse' : 'row' }]}>
            <View style={{ flexDirection: isOutgoing ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
              <TimeWithDate date={call.created_at} time={`at ${formatDate(call.created_at, 'hh:mm A')}`} style={[styles.metaText, { color: c.textFaint }]} />
              <CommentsBadge count={commentsCount} active={!!commentsFrom} c={c} onPress={openComments} />
            </View>
            {!!call.ai_details?.summary && (
              <Pressable
                onPress={() => setShowSummary((v) => !v)}
                hitSlop={6}
              >
                <Text style={[styles.metaLink, { color: showSummary ? c.primary : c.textMuted }]}>Call summary</Text>
              </Pressable>
            )}
          </View>

          {/* ─── AI summary ─── */}
          {showSummary && !!call.ai_details?.summary && (
            <View style={[styles.summaryBox, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              {call.ai_details.summary.split('|').map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500', color: c.text }}>{item.trim()}</Text>
                </View>
              ))}
              <Pressable onPress={() => onShowTranscription(call.id)} hitSlop={6} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>Show all transcription</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <CommentsSheet
        visible={!!commentsFrom}
        fromY={commentsFrom?.y}
        onClose={() => setCommentsFrom(null)}
        itemType="call"
        itemId={call.id}
        comments={call.comments || []}
        onCommentsChange={(comments) => onCommentsChange(call, comments)}
        isDark={isDark}
        // The call bubble has no width of its own (the player stretches), so give the copy one
        preview={<View style={{ width: 280 }}>{bubble()}</View>}
        align={isOutgoing ? 'right' : 'left'}
        time={`at ${formatDate(call.created_at, 'hh:mm A')}`}
        highlightCommentId={focusCommentId}
      />
    </View>
  );
}
