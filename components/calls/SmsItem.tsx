import React from 'react';
import { Text, View } from 'react-native';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';
import { callsPalette, callsStyles as styles } from './styles';
import { ISmsMessage } from './types';

const STATUS_LABEL: Record<ISmsMessage['status'], string> = {
  received: '',
  sent: 'Sending',
  delivered: 'Delivered',
  failed: 'Not delivered',
};

export default function SmsItem({ message, isDark }: { message: ISmsMessage; isDark: boolean }) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const isOutbound = message.direction === 'outbound';
  const status = isOutbound ? STATUS_LABEL[message.status] : '';

  return (
    <View style={[styles.bubbleRow, { justifyContent: isOutbound ? 'flex-end' : 'flex-start' }]}>
      <View style={{ maxWidth: '82%' }}>
        <View style={[styles.smsBubble, isOutbound ? styles.bubbleOut : styles.bubbleIn, { backgroundColor: isOutbound ? c.bubbleOut : c.bubbleIn, maxWidth: '100%' }]}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: isOutbound ? c.bubbleOutText : c.bubbleInText }}>{message.text}</Text>
        </View>
        <View style={styles.bubbleMeta}>
          <Text style={[styles.metaText, { color: c.textFaint }]}>at {formatDate(message.created_at, 'hh:mm A')}</Text>
          {!!status && <Text style={[styles.metaText, { fontWeight: '600', color: message.status === 'failed' ? c.danger : c.textFaint }]}>{status}</Text>}
        </View>
      </View>
    </View>
  );
}
