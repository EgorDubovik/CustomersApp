import React, { memo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { callsPalette } from '@/components/calls/styles';
import { PersonAvatar } from './ChatAvatar';
import EntityCard from './EntityCard';
import MessageTicks from './MessageTicks';
import { isReadByPeer, messagePreview, NameLookup, systemText, timeOfDay } from './helpers';
import type { ChatAttachment, ChatConversation, ChatMessage } from './types';

interface Props {
  message: ChatMessage;
  conversation: ChatConversation;
  myUserId: number;
  name: NameLookup;
  /** First in a run of one author's messages — show the name and avatar. */
  startsRun: boolean;
  highlighted?: boolean;
  c: (typeof callsPalette)['light'];
  onLongPress: (message: ChatMessage) => void;
  onOpenPhoto: (photos: ChatAttachment[], index: number) => void;
  onRetry: (message: ChatMessage) => void;
  onDiscard: (message: ChatMessage) => void;
}

function Photos({ photos, onOpen, onLongPress }: { photos: ChatAttachment[]; onOpen: (index: number) => void; onLongPress: () => void }) {
  if (photos.length === 1) {
    const p = photos[0];
    const ratio = p.width && p.height ? p.width / p.height : 4 / 3;
    const w = 230;
    return (
      <Pressable onPress={() => onOpen(0)} onLongPress={onLongPress}>
        <Image source={{ uri: p.url }} style={{ width: w, height: Math.min(Math.max(w / ratio, 120), 320), borderRadius: 10, backgroundColor: '#0002' }} />
      </Pressable>
    );
  }
  return (
    <View style={{ width: 230, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
      {photos.slice(0, 4).map((p, i) => (
        <Pressable key={p.id} onPress={() => onOpen(i)} onLongPress={onLongPress}>
          <Image source={{ uri: p.url }} style={{ width: 113, height: 113, borderRadius: 8, backgroundColor: '#0002' }} />
          {i === 3 && photos.length > 4 && (
            <View style={{ position: 'absolute', inset: 0, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>+{photos.length - 4}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

/** One line of the chat: a bubble with text / photos / card, time and ticks below it. */
function MessageItem({ message, conversation, myUserId, name, startsRun, highlighted, c, onLongPress, onOpenPhoto, onRetry, onDiscard }: Props) {
  if (message.type === 'system') {
    return <Text style={{ textAlign: 'center', fontSize: 12, color: c.textFaint, marginVertical: 8, paddingHorizontal: 24 }}>{systemText(message.body, name)}</Text>;
  }

  const mine = message.sender_id === myUserId;
  const isGroup = conversation.type === 'group';
  const showAuthor = isGroup && !mine && startsRun;
  const failed = message.send_status === 'failed';
  const sending = message.send_status === 'sending';
  const read = mine && !isGroup && !message.send_status && isReadByPeer(conversation, message, myUserId);
  const fg = mine ? c.bubbleOutText : c.bubbleInText;
  const sender = conversation.members.find((m) => m.id === message.sender_id);
  const hasMedia = !message.deleted && (message.attachments.length > 0 || !!message.entity);
  const longPress = () => onLongPress(message);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        justifyContent: mine ? 'flex-end' : 'flex-start',
        marginTop: startsRun ? 10 : 2,
        borderRadius: 10,
        backgroundColor: highlighted ? c.warning + '33' : 'transparent',
      }}
    >
      {/* Keep the avatar column even without an avatar so a run lines up */}
      {isGroup && !mine && <View style={{ width: 30, marginBottom: 18 }}>{startsRun && <PersonAvatar name={name(message.sender_id)} color={sender?.color} size={30} />}</View>}

      <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {showAuthor && <Text style={{ fontSize: 12, fontWeight: '700', color: sender?.color || c.textMuted, marginBottom: 2, marginLeft: 4 }}>{name(message.sender_id)}</Text>}

        <Pressable
          onLongPress={longPress}
          delayLongPress={300}
          style={{
            borderRadius: 16,
            borderBottomRightRadius: mine && startsRun ? 4 : 16,
            borderBottomLeftRadius: !mine && startsRun ? 4 : 16,
            paddingHorizontal: hasMedia ? 4 : 12,
            paddingVertical: hasMedia ? 4 : 8,
            backgroundColor: mine ? c.bubbleOut : c.bubbleIn,
            opacity: failed ? 0.7 : 1,
            gap: 4,
          }}
        >
          {message.reply_to && (
            <View style={{ borderLeftWidth: 2, borderLeftColor: mine ? 'rgba(255,255,255,0.7)' : c.primary, paddingLeft: 8, paddingVertical: 2, margin: hasMedia ? 6 : 0, marginBottom: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: fg }}>{name(message.reply_to.sender_id)}</Text>
              <Text style={{ fontSize: 12, color: fg, opacity: 0.8 }} numberOfLines={2}>
                {messagePreview(message.reply_to, name)}
              </Text>
            </View>
          )}
          {message.deleted ? (
            <Text style={{ fontSize: 14, fontStyle: 'italic', color: fg, opacity: 0.7 }}>Message deleted</Text>
          ) : (
            <>
              {message.attachments.length > 0 && <Photos photos={message.attachments} onOpen={(i) => onOpenPhoto(message.attachments, i)} onLongPress={longPress} />}
              {message.entity && <EntityCard entity={message.entity} c={c} />}
              {!!message.body && <Text style={{ fontSize: 15, lineHeight: 20, color: fg, paddingHorizontal: hasMedia ? 8 : 0, paddingBottom: hasMedia ? 4 : 0 }}>{message.body}</Text>}
            </>
          )}
        </Pressable>

        {/* Time and ticks under the bubble, no background — as on the web */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 11, color: c.textFaint }}>{timeOfDay(message.created_at)}</Text>
          {mine && sending && <SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={10} tintColor={c.textFaint} />}
          {mine && !message.send_status && !isGroup && (
            <MessageTicks double={read} color={read ? c.primary : c.textFaint} />
          )}
        </View>

        {failed && (
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 4, marginTop: 2 }}>
            <Text style={{ fontSize: 12, color: c.danger }}>Not sent</Text>
            <Pressable onPress={() => onRetry(message)} hitSlop={8}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>Retry</Text>
            </Pressable>
            <Pressable onPress={() => onDiscard(message)} hitSlop={8}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>Remove</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export default memo(MessageItem);
