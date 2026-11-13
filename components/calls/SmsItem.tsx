import React, { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { callsPalette, callsStyles as styles } from './styles';
import { ISmsMessage } from './types';

// The whole road to the customer — each step is confirmed by a carrier webhook
const STATUS_LABEL: Record<ISmsMessage['status'], string> = {
  received: '',
  queued: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Not delivered',
};

export default function SmsItem({ message, isDark }: { message: ISmsMessage; isDark: boolean }) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const isOutbound = message.direction === 'outbound';
  const status = isOutbound ? STATUS_LABEL[message.status] ?? '' : '';
  const media = message.media ?? [];
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <View style={[styles.bubbleRow, { justifyContent: isOutbound ? 'flex-end' : 'flex-start' }]}>
      <View style={{ maxWidth: '82%' }}>
        <View style={[styles.smsBubble, isOutbound ? styles.bubbleOut : styles.bubbleIn, { backgroundColor: isOutbound ? c.bubbleOut : c.bubbleIn, maxWidth: '100%' }]}>
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
          {!!message.text && <Text style={{ fontSize: 14, lineHeight: 20, color: isOutbound ? c.bubbleOutText : c.bubbleInText }}>{message.text}</Text>}
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
  );
}
