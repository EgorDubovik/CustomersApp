import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getInitials } from '@/components/appointment/tabs/shared';
import AudioPlayer from './AudioPlayer';
import { callsPalette, callsStyles as styles } from './styles';
import { ICall, ICallComment } from './types';
import { formatCallDuration, formatClock } from './helpers';

const ROLE_ADMIN = 1;

interface Props {
  call: ICall;
  isDark: boolean;
  onCommentsChange: (call: ICall, comments: ICallComment[]) => void;
  onShowTranscription: (callId: string) => void;
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

export default function CallItem({ call, isDark, onCommentsChange, onShowTranscription }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [showSummary, setShowSummary] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const canDeleteComment = (cm: ICallComment) => !!user && (user.roles_ids?.includes(ROLE_ADMIN) || String(user.id) === String(cm.user_id));

  const sendComment = async () => {
    const text = comment.trim();
    if (!text || sending || !token) return;
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/calls/comment/${call.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ comment: text }),
      });
      if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
      onCommentsChange(call, await r.json());
      setComment('');
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to add comment.');
    } finally {
      setSending(false);
    }
  };

  const deleteComment = (cm: ICallComment) => {
    if (!token) return;
    Alert.alert('Delete comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(cm.id);
          try {
            const r = await fetch(`${API_URL}/calls/comment/${cm.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
            if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
            onCommentsChange(call, await r.json());
          } catch (err: any) {
            console.error(err);
            Alert.alert('Error', err.message || 'Failed to delete comment.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.bubbleRow, { justifyContent: isOutgoing ? 'flex-end' : 'flex-start' }]}>
      <View style={{ maxWidth: '88%', minWidth: 240 }}>
        {/* ─── Bubble ─── */}
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

        {/* ─── Meta row: time · summary · comments ─── */}
        <View style={styles.bubbleMeta}>
          <Text style={[styles.metaText, { color: c.textFaint }]}>at {formatDate(call.created_at, 'hh:mm A')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {!!call.ai_details?.summary && (
              <Pressable
                onPress={() => {
                  setShowSummary((v) => !v);
                  setShowComments(false);
                }}
                hitSlop={6}
              >
                <Text style={[styles.metaLink, { color: showSummary ? c.primary : c.textMuted }]}>Summary</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setShowComments((v) => !v);
                setShowSummary(false);
              }}
              hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <SymbolView name={{ ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }} size={13} tintColor={showComments ? c.primary : c.textMuted} />
              <Text style={[styles.metaLink, { color: showComments ? c.primary : c.textMuted }]}>{call.comments?.length ? call.comments.length : 'Comment'}</Text>
            </Pressable>
          </View>
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

        {/* ─── Comments ─── */}
        {showComments && (
          <View style={[styles.summaryBox, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            {(call.comments || []).length === 0 && <Text style={{ fontSize: 12, fontStyle: 'italic', color: c.textMuted }}>No comments yet.</Text>}
            {(call.comments || []).map((cm) => (
              <View key={cm.id} style={[styles.commentItem, { backgroundColor: c.noteBg }]}>
                <View style={[styles.commentAvatar, { backgroundColor: cm.user?.color || c.primary }]}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{getInitials(cm.user?.name || 'U')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>
                    <Text style={{ fontWeight: '700', color: c.textSecondary }}>{cm.user?.name}</Text>
                    {'  '}{formatDate(cm.created_at, 'MMM DD, h:mm A')}
                  </Text>
                  <Text style={{ fontSize: 13, color: c.text, marginTop: 2 }}>{cm.comment}</Text>
                </View>
                {canDeleteComment(cm) && (
                  <Pressable onPress={() => deleteComment(cm)} hitSlop={8} disabled={deletingId === cm.id}>
                    {deletingId === cm.id ? <ActivityIndicator size="small" color={c.danger} /> : <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={14} tintColor={c.danger} />}
                  </Pressable>
                )}
              </View>
            ))}
            <View style={styles.commentInputRow}>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Type comment here…"
                placeholderTextColor={c.textFaint}
                multiline
                style={[styles.commentInput, { backgroundColor: c.inputBg, borderColor: c.cardBorder, color: c.text }]}
              />
              <Pressable onPress={sendComment} disabled={sending || !comment.trim()} style={({ pressed }) => [styles.commentSendBtn, { backgroundColor: comment.trim() ? c.primary : c.inputBg }, pressed && { opacity: 0.8 }]}>
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={14} tintColor={comment.trim() ? '#fff' : c.textMuted} />}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
