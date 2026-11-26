import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/components/appointment/tabs/shared';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { renderMentions } from '@/utils/mentions';
import MentionInput, { type MentionInputHandle } from './MentionInput';
import { callsPalette, callsStyles as styles } from './styles';
import { ICallComment } from './types';

const ROLE_ADMIN = 1;
/** How long the comment opened from a push / Mentions stays highlighted. */
const HIGHLIGHT_MS = 3000;
/** How far (px) or how fast (px/s) the sheet must be pulled down to close. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
const SPRING = { damping: 22, stiffness: 220, mass: 0.8 };

interface Props {
  visible: boolean;
  onClose: () => void;
  itemType: 'call' | 'sms';
  itemId: string;
  comments: ICallComment[];
  onCommentsChange: (comments: ICallComment[]) => void;
  isDark: boolean;
  /** The SMS / call being discussed, drawn at the top of the sheet */
  preview: React.ReactNode;
  /** Its side of the timeline and time, as under the bubble */
  align: 'left' | 'right';
  time: string;
  /** Screen Y of the element — the sheet rises from there. Unknown (opened from a push) → from the bottom. */
  fromY?: number | null;
  /** Comment to highlight — opened from a push or the Mentions screen */
  highlightCommentId?: string | null;
}

/**
 * Internal staff comments on a call or an SMS (the customer never sees them), in a sheet over
 * the conversation: the element on top, its comments below, the field with @mentions at the
 * bottom. Close with ✕ or by pulling the sheet down.
 *
 * Same endpoints and rules as the web InternalComments: a mention or a reply in a thread you
 * wrote in notifies you; opening the thread marks it read.
 */
export default function CommentsSheet(props: Props) {
  // Mounted only while open, so every opening starts from a clean state and animation
  return props.visible ? <Sheet {...props} /> : null;
}

function Sheet({ onClose, itemType, itemId, comments, onCommentsChange, isDark, preview, align, time, fromY, highlightCommentId }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { token, user, companyEmployees, mentionableUserIds, mentionsUnread, setMentionsUnread } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const inputRef = useRef<MentionInputHandle>(null);
  const listRef = useRef<ScrollView>(null);
  const keyboard = useKeyboardOverlap(true);

  const base = itemType === 'call' ? 'comment' : 'message-comment';
  const headers = useMemo(() => ({ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }), [token]);

  // People with access to calls (backend decides), minus me
  const candidates = useMemo(() => {
    const allowed = new Set(mentionableUserIds);
    return companyEmployees.filter((e) => allowed.has(Number(e.id)) && Number(e.id) !== Number(user?.id)).map((e) => ({ id: Number(e.id), name: e.name, color: e.color }));
  }, [companyEmployees, mentionableUserIds, user?.id]);

  // Thread opened → its mentions are read. Only ask the server when there's something to clear.
  useEffect(() => {
    if (!mentionsUnread || !token) return;
    fetch(`${API_URL}/calls/mentions/read`, { method: 'POST', headers, body: JSON.stringify({ item_type: itemType, item_id: itemId }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (typeof data?.total === 'number') setMentionsUnread(data.total);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemType, itemId, comments.length]);

  useEffect(() => {
    if (!highlightCommentId) return;
    setFlashId(String(highlightCommentId));
    const t = setTimeout(() => setFlashId(null), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [highlightCommentId]);

  const canDelete = (cm: ICallComment) => !!user && (user.roles_ids?.includes(ROLE_ADMIN) || String(user.id) === String(cm.user_id));

  const send = async () => {
    const comment = text.trim();
    if (!comment || sending || !token) return;
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/calls/${base}/${itemId}`, { method: 'POST', headers, body: JSON.stringify({ comment }) });
      if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
      onCommentsChange(await r.json());
      setText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'Failed to add comment.');
    } finally {
      setSending(false);
    }
  };

  const remove = (cm: ICallComment) => {
    if (!token) return;
    Alert.alert('Delete comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(cm.id);
          try {
            const r = await fetch(`${API_URL}/calls/${base}/${cm.id}`, { method: 'DELETE', headers });
            if (!r.ok) throw new Error(`Server returned status code ${r.status}`);
            onCommentsChange(await r.json());
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

  // ─── Opening, closing, pulling down ───
  const sheetTop = insets.top + 24;
  // The sheet rises from the element's place; from the bottom edge when that's unknown
  const startOffset = Math.max(0, (fromY ?? screenH) - sheetTop);
  const offset = useSharedValue(startOffset);
  const closing = useRef(false);

  useEffect(() => {
    offset.value = withSpring(0, SPRING);
  }, [offset]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    offset.value = withTiming(screenH, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  const pull = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      // Down follows the finger, up only stretches a little
      offset.value = e.translationY > 0 ? e.translationY : e.translationY * 0.15;
    })
    .onEnd((e) => {
      if (offset.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        offset.value = withTiming(screenH, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        offset.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, screenH - sheetTop], [1, 0], Extrapolation.CLAMP),
  }));

  const hasText = !!text.trim();

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(15,23,42,0.4)' }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close comments" />
        </Animated.View>

        <Animated.View
          ref={keyboard.ref}
          style={[
            {
              position: 'absolute',
              top: sheetTop,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: c.bg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: 'hidden',
              paddingBottom: keyboard.overlap,
            },
            sheetStyle,
          ]}
        >
          {/* Grabber + header + the element: pull any of it down to close */}
          <GestureDetector gesture={pull}>
            <View>
              <View style={{ alignItems: 'center', paddingTop: 8 }}>
                <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: c.cardBorder }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>
                  Comments{comments.length ? ` · ${comments.length}` : ''}
                </Text>
                <Pressable
                  onPress={close}
                  hitSlop={10}
                  accessibilityLabel="Close"
                  style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.inputBg, opacity: pressed ? 0.6 : 1 })}
                >
                  <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
                </Pressable>
              </View>

              <View style={{ paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.cardBorder }}>
                <View pointerEvents="none" style={{ alignSelf: align === 'right' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
                  {preview}
                </View>
                <Text style={[styles.metaText, { color: c.textFaint, marginTop: 4, alignSelf: align === 'right' ? 'flex-end' : 'flex-start' }]}>{time}</Text>
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            ref={listRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, gap: 8, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {comments.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 6 }}>
                <SymbolView name={{ ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }} size={28} tintColor={c.textFaint} />
                <Text style={{ fontSize: 14, color: c.textMuted }}>No comments yet</Text>
                <Text style={{ fontSize: 12, color: c.textFaint, textAlign: 'center' }}>Only your team sees them. Use @ to notify someone.</Text>
              </View>
            ) : (
              comments.map((cm) => {
                const flashing = flashId === String(cm.id);
                return (
                  <View key={cm.id} style={[styles.commentItem, { padding: 10, backgroundColor: flashing ? c.primaryMuted : c.card, borderWidth: 1, borderColor: flashing ? c.primary : c.cardBorder }]}>
                    <View style={[styles.commentAvatar, { width: 30, height: 30, borderRadius: 15, backgroundColor: cm.user?.color || c.primary }]}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{getInitials(cm.user?.name || 'U')}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: c.textMuted }}>
                        <Text style={{ fontWeight: '700', color: c.textSecondary }}>{cm.user?.name}</Text>
                        {'  '}
                        {formatDate(cm.created_at, 'MMM DD, h:mm A')}
                      </Text>
                      <Text style={{ fontSize: 14, lineHeight: 20, color: c.text, marginTop: 2 }}>{renderMentions(cm.comment, c.primary, user?.id)}</Text>
                    </View>
                    {canDelete(cm) && (
                      <Pressable onPress={() => remove(cm)} hitSlop={8} disabled={deletingId === cm.id} style={{ paddingTop: 2 }}>
                        {deletingId === cm.id ? <ActivityIndicator size="small" color={c.danger} /> : <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={15} tintColor={c.danger} />}
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Field: @ to pick who to mention, then the comment, then send */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 8,
              paddingHorizontal: 12,
              paddingTop: 10,
              paddingBottom: keyboard.keyboardOpen ? 10 : Math.max(insets.bottom, 12),
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.cardBorder,
              backgroundColor: c.card,
            }}
          >
            <Pressable
              onPress={() => inputRef.current?.startMention()}
              disabled={sending}
              hitSlop={6}
              accessibilityLabel="Mention someone"
              style={({ pressed }) => [styles.commentSendBtn, { borderRadius: 19, backgroundColor: c.inputBg }, pressed && { opacity: 0.6 }]}
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: c.primary, marginTop: -2 }}>@</Text>
            </Pressable>
            <MentionInput
              ref={inputRef}
              value={text}
              onChange={setText}
              candidates={candidates}
              placeholder="Comment for the team…"
              palette={c}
              editable={!sending}
              style={[styles.commentInput, { fontSize: 15, borderRadius: 19, paddingHorizontal: 14, backgroundColor: c.inputBg, borderColor: c.cardBorder, color: c.text }]}
            />
            <Pressable
              onPress={send}
              disabled={sending || !hasText}
              accessibilityLabel="Send comment"
              style={({ pressed }) => [styles.commentSendBtn, { borderRadius: 19, backgroundColor: hasText ? c.primary : c.inputBg }, pressed && { opacity: 0.8 }]}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={15} tintColor={hasText ? '#fff' : c.textMuted} />}
            </Pressable>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
