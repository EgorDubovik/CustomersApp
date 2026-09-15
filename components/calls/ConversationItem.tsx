import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { CompanyPhone } from '@/context/AuthContext';
import { callsPalette, callsStyles as styles } from './styles';
import { IConversation } from './types';
import { formatCallDuration, formatConversationDate, formatPhoneNumber, getBusinessNumberFromCall, getCustomerPhoneFromCall, getLastSmsIfNewer, getMatchedCompanyPhone } from './helpers';

interface Props {
  conv: IConversation;
  companyPhones: CompanyPhone[];
  isDark: boolean;
  onPress: () => void;
}

export default function ConversationItem({ conv, companyPhones, isDark, onPress }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;
  const lastCall = conv.last_call;
  const lastSms = getLastSmsIfNewer(conv);
  const unread = conv.unread_count ?? 0;
  const hasUnread = unread > 0;

  const isIncoming = lastCall?.direction === 'incoming';
  const isMissedIncoming = (lastCall?.is_missed_call || lastCall?.status === 'no-answer') && isIncoming;
  const isNoAnswer = (lastCall?.status === 'no-answer' || lastCall?.is_missed_call) && !isIncoming;
  const hasVoicemail = Boolean(lastCall?.voicemail_url);
  const isMissed = isMissedIncoming || isNoAnswer || hasVoicemail;

  const statusLabel = hasVoicemail ? 'Missed · voicemail' : isMissedIncoming ? 'Missed' : isNoAnswer ? 'No answer' : isIncoming ? 'Incoming' : 'Outgoing';

  const customerPhone = lastCall ? getCustomerPhoneFromCall(lastCall) : conv.customer_phone ?? '';
  const displayName = conv.customer?.name || formatPhoneNumber(customerPhone);
  const businessRaw = getBusinessNumberFromCall(lastCall) || conv.company_phone || '';
  const matched = getMatchedCompanyPhone(businessRaw, companyPhones);
  const secondaryPhone = conv.customer ? formatPhoneNumber(customerPhone) : formatPhoneNumber(businessRaw);

  let icon: SymbolViewProps['name'];
  if (lastSms) {
    icon = lastSms.direction === 'inbound'
      ? { ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' }
      : { ios: 'paperplane.fill', android: 'send', web: 'send' };
  } else if (isMissed) {
    icon = { ios: 'phone.down.fill', android: 'phone_missed', web: 'phone_missed' };
  } else if (isIncoming) {
    icon = { ios: 'phone.arrow.down.left.fill', android: 'call_received', web: 'call_received' };
  } else {
    icon = { ios: 'phone.arrow.up.right.fill', android: 'call_made', web: 'call_made' };
  }
  const iconColor = isMissed && !lastSms ? c.danger : c.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.convItem,
        { backgroundColor: c.card, borderColor: c.cardBorder, borderLeftColor: hasUnread ? c.primary : 'transparent' },
        hasUnread && { backgroundColor: c.unreadBg },
        pressed && { opacity: 0.75 },
      ]}
    >
      {/* Row 1: name + time */}
      <View style={styles.convRow}>
        <Text style={[styles.convName, { color: conv.customer ? c.primary : c.text, fontWeight: hasUnread ? '800' : '700' }]} numberOfLines={1}>
          {displayName || 'Unknown'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {hasUnread && (
            <View style={[styles.unreadBadge, { backgroundColor: c.danger }]}>
              <Text style={styles.unreadBadgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
          <Text style={{ fontSize: 12, color: c.textMuted }}>{formatConversationDate(lastSms ? lastSms.created_at : lastCall?.created_at)}</Text>
        </View>
      </View>

      {/* Row 2: status/preview + phone/calls */}
      <View style={[styles.convRow, { marginTop: 4 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <SymbolView name={icon} size={13} tintColor={iconColor} />
          {lastSms ? (
            <Text style={{ flex: 1, fontSize: 13, color: hasUnread ? c.text : c.textMuted, fontWeight: hasUnread ? '600' : '400' }} numberOfLines={1}>
              {lastSms.text}
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: isMissed ? c.danger : c.textMuted, fontWeight: isMissed ? '700' : '500' }} numberOfLines={1}>
              {statusLabel}
              {!hasVoicemail && lastCall?.duration_seconds ? `  ·  ${formatCallDuration(lastCall.duration_seconds)}` : ''}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          {matched ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: matched.color || '#888' }} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: matched.color || c.textMuted }} numberOfLines={1}>
                {matched.description || secondaryPhone}
              </Text>
            </View>
          ) : secondaryPhone ? (
            <Text style={{ fontSize: 11, color: c.textMuted }} numberOfLines={1}>{secondaryPhone}</Text>
          ) : null}
          {conv.calls_count > 0 && <Text style={{ fontSize: 11, color: c.textFaint }}>{conv.calls_count} calls</Text>}
        </View>
      </View>
    </Pressable>
  );
}
