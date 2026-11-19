import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { API_URL } from '@/constants/Config';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/components/appointment/tabs/shared';
import { renderMentions } from '@/utils/mentions';
import MentionInput from './MentionInput';
import { callsPalette, callsStyles as styles } from './styles';
import { ICallComment } from './types';

const ROLE_ADMIN = 1;
/** How long the comment opened from a push / Mentions stays highlighted. */
const HIGHLIGHT_MS = 3000;

interface Props {
  itemType: 'call' | 'sms';
  itemId: string;
  comments: ICallComment[];
  onCommentsChange: (comments: ICallComment[]) => void;
  isDark: boolean;
  /** Comment to highlight — opened from a push or the Mentions screen */
  highlightCommentId?: string | null;
}

/**
 * Internal staff comments on a call or an SMS (the customer never sees them), with
 * @mentions. Same endpoints and rules as the web InternalComments: a mention or a
 * reply in a thread you wrote in notifies you; opening the thread marks it read.
 */
export default function CommentsPanel({ itemType, itemId, comments, onCommentsChange, isDark, highlightCommentId }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const { token, user, companyEmployees, mentionableUserIds, mentionsUnread, setMentionsUnread } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

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

  return (
    <View style={[styles.summaryBox, { backgroundColor: c.card, borderColor: c.cardBorder, marginTop: 4 }]}>
      {comments.length === 0 && <Text style={{ fontSize: 12, fontStyle: 'italic', color: c.textMuted }}>No comments yet.</Text>}
      {comments.map((cm) => {
        const flashing = flashId === String(cm.id);
        return (
          <View key={cm.id} style={[styles.commentItem, { backgroundColor: flashing ? c.primaryMuted : c.noteBg, borderWidth: 1, borderColor: flashing ? c.primary : 'transparent' }]}>
            <View style={[styles.commentAvatar, { backgroundColor: cm.user?.color || c.primary }]}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{getInitials(cm.user?.name || 'U')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>
                <Text style={{ fontWeight: '700', color: c.textSecondary }}>{cm.user?.name}</Text>
                {'  '}
                {formatDate(cm.created_at, 'MMM DD, h:mm A')}
              </Text>
              <Text style={{ fontSize: 13, color: c.text, marginTop: 2 }}>{renderMentions(cm.comment, c.primary, user?.id)}</Text>
            </View>
            {canDelete(cm) && (
              <Pressable onPress={() => remove(cm)} hitSlop={8} disabled={deletingId === cm.id}>
                {deletingId === cm.id ? <ActivityIndicator size="small" color={c.danger} /> : <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={14} tintColor={c.danger} />}
              </Pressable>
            )}
          </View>
        );
      })}
      <View style={styles.commentInputRow}>
        <MentionInput
          value={text}
          onChange={setText}
          candidates={candidates}
          placeholder="Comment… (@ to mention)"
          palette={c}
          editable={!sending}
          style={[styles.commentInput, { backgroundColor: c.inputBg, borderColor: c.cardBorder, color: c.text }]}
        />
        <Pressable onPress={send} disabled={sending || !text.trim()} style={({ pressed }) => [styles.commentSendBtn, { backgroundColor: text.trim() ? c.primary : c.inputBg }, pressed && { opacity: 0.8 }]}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={14} tintColor={text.trim() ? '#fff' : c.textMuted} />}
        </Pressable>
      </View>
    </View>
  );
}
