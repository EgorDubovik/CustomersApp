import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import CommentsSheet from './CommentsSheet';
import HoldableBubble, { type BubbleAction, type HoldableBubbleHandle } from './HoldableBubble';
import CommentsBadge from './CommentsBadge';
import { useToast } from '@/context/ToastContext';
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
  // Comments sheet: open, and the screen Y it rises from (null → from the bottom)
  const [commentsFrom, setCommentsFrom] = useState<{ y: number | null } | null>(null);
  const bubbleRef = useRef<HoldableBubbleHandle>(null);
  const commentsCount = message.comments?.length ?? 0;
  const { showToast } = useToast();
  const openComments = () => {
    if (!bubbleRef.current) return setCommentsFrom({ y: null });
    bubbleRef.current.measure((y) => setCommentsFrom({ y: Number.isFinite(y) ? y : null }));
  };

  // Long press on the bubble: copy the text, open the comments
  const actions: BubbleAction[] = [];
  if (message.text)
    actions.push({
      key: 'copy',
      label: 'Copy text',
      icon: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' },
      onPress: () => {
        Clipboard.setStringAsync(message.text ?? '');
        showToast({ message: 'Copied', type: 'success' });
      },
    });
  actions.push({
    key: 'comments',
    label: commentsCount ? `Comments (${commentsCount})` : 'Add comment',
    icon: { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' },
    onPress: openComments,
  });

  const bubble = (onLongPress: () => void) => (
    <View style={[styles.smsBubble, isOutbound ? styles.bubbleOut : styles.bubbleIn, { backgroundColor: isOutbound ? c.bubbleOut : c.bubbleIn, maxWidth: '100%' }]}>
      {/* Pictures above the text: a caption is read after the photo */}
      {media.length > 0 && (
        <View style={{ gap: 4, marginBottom: message.text ? 8 : 0 }}>
          {media.map((m) => (
            <Pressable key={m.url} onPress={() => setViewing(m.url)} onLongPress={onLongPress}>
              <Image source={{ uri: m.url }} style={{ width: 200, height: 200, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)' }} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      )}
      {!!message.text && <Text style={{ fontSize: 14, lineHeight: 20, color: isOutbound ? c.bubbleOutText : c.bubbleInText }}>{linkify(message.text, 'l', onLongPress)}</Text>}
    </View>
  );

  useEffect(() => {
    // Opened from a push / Mentions: the list is still scrolling to it, so rise from the bottom
    if (focusKey) setCommentsFrom({ y: null });
  }, [focusKey]);

  return (
    <View style={[styles.bubbleRow, { justifyContent: isOutbound ? 'flex-end' : 'flex-start' }]}>
      <View style={{ maxWidth: '82%' }}>
        <HoldableBubble
          ref={bubbleRef}
          align={isOutbound ? 'right' : 'left'}
          isDark={isDark}
          actions={actions}
          style={{ alignSelf: isOutbound ? 'flex-end' : 'flex-start' }}
          renderBubble={bubble}
        />
        <View style={styles.bubbleMeta}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.metaText, { color: c.textFaint }]}>at {formatDate(message.created_at, 'hh:mm A')}</Text>
            <CommentsBadge count={commentsCount} active={!!commentsFrom} c={c} onPress={openComments} />
          </View>
          {!!status && <Text style={[styles.metaText, { fontWeight: '600', color: message.status === 'failed' ? c.danger : c.textFaint }]}>{status}</Text>}
        </View>
      </View>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable onPress={() => setViewing(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {!!viewing && <Image source={{ uri: viewing }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>

      <CommentsSheet
        visible={!!commentsFrom}
        fromY={commentsFrom?.y}
        onClose={() => setCommentsFrom(null)}
        itemType="sms"
        itemId={message.id}
        comments={message.comments ?? []}
        onCommentsChange={(comments) => onCommentsChange(message, comments)}
        isDark={isDark}
        preview={bubble(() => {})}
        align={isOutbound ? 'right' : 'left'}
        time={`at ${formatDate(message.created_at, 'hh:mm A')}`}
        highlightCommentId={focusCommentId}
      />
    </View>
  );
}
