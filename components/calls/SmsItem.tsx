import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import CommentsPanel from './CommentsPanel';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { callsPalette, callsStyles as styles } from './styles';
import { ICallComment, ISmsMessage } from './types';
import { linkify } from '@/utils/linkify';

// The whole road to the customer — each step is confirmed by a carrier webhook
const STATUS_LABEL: Record<ISmsMessage['status'], string> = {
  received: '',
  queued: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Not delivered',
};

interface Props {
  message: ISmsMessage;
  isDark: boolean;
  onCommentsChange: (message: ISmsMessage, comments: ICallComment[]) => void;
  /** Opened from a push / Mentions: comments start open and this one is highlighted */
  focusKey?: string | null;
  focusCommentId?: string | null;
}

export default function SmsItem({ message, isDark, onCommentsChange, focusKey, focusCommentId }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const isOutbound = message.direction === 'outbound';
  const status = isOutbound ? STATUS_LABEL[message.status] ?? '' : '';
  const media = message.media ?? [];
  const [viewing, setViewing] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const commentsCount = message.comments?.length ?? 0;

  useEffect(() => {
    if (focusKey) setShowComments(true);
  }, [focusKey]);

  return (
    // Same frame as a call with its comments open, so it is obvious which SMS is being discussed
    <View style={showComments ? [styles.callBlock, { backgroundColor: c.primaryMuted, borderColor: c.primary, padding: 8, marginHorizontal: -4 }] : undefined}>
    <View style={[styles.bubbleRow, { justifyContent: isOutbound ? 'flex-end' : 'flex-start' }]}>
      <View style={{ maxWidth: '82%' }}>
        {/* Bubble + comments toggle beside it (right of incoming, left of outgoing) — like a call */}
        <View style={{ flexDirection: isOutbound ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.smsBubble, isOutbound ? styles.bubbleOut : styles.bubbleIn, { backgroundColor: isOutbound ? c.bubbleOut : c.bubbleIn, maxWidth: '100%', flexShrink: 1 }]}>
          {/* Pictures above the text: a caption is read after the photo */}
          {media.length > 0 && (
            <View style={{ gap: 4, marginBottom: message.text ? 8 : 0 }}>
              {media.map((m) => (
                <Pressable key={m.url} onPress={() => setViewing(m.url)}>
                  <Image source={{ uri: m.url }} style={{ width: 200, height: 200, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)' }} resizeMode="cover" />
                </Pressable>
              ))}
            </View>
          )}
          {!!message.text && <Text style={{ fontSize: 14, lineHeight: 20, color: isOutbound ? c.bubbleOutText : c.bubbleInText }}>{linkify(message.text)}</Text>}
        </View>
          <Pressable onPress={() => setShowComments((v) => !v)} hitSlop={8} accessibilityLabel="Comments" style={({ pressed }) => [styles.commentToggle, pressed && { opacity: 0.6 }]}>
            <SymbolView name={{ ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }} size={20} tintColor={showComments ? c.primary : c.textMuted} />
            {commentsCount > 0 && <View style={[styles.commentDot, { backgroundColor: c.warning, borderColor: c.bg }]} />}
          </Pressable>
        </View>
        <View style={styles.bubbleMeta}>
          <Text style={[styles.metaText, { color: c.textFaint }]}>at {formatDate(message.created_at, 'hh:mm A')}</Text>
          {!!status && <Text style={[styles.metaText, { fontWeight: '600', color: message.status === 'failed' ? c.danger : c.textFaint }]}>{status}</Text>}
        </View>
      </View>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable onPress={() => setViewing(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {!!viewing && <Image source={{ uri: viewing }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>

      {showComments && (
        <CommentsPanel
          itemType="sms"
          itemId={message.id}
          comments={message.comments ?? []}
          onCommentsChange={(comments) => onCommentsChange(message, comments)}
          isDark={isDark}
          highlightCommentId={focusCommentId}
        />
      )}
    </View>
  );
}
