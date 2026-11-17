import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { PersonAvatar } from './ChatAvatar';
import { APPOINTMENT_STATUS, timeOfDay } from './helpers';
import { useChatCard } from './useChatCard';
import type { ChatCardAddress, ChatEntityRef } from './types';

interface Palette {
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  inputBg: string;
}

const addressLine = (a: ChatCardAddress | null) => (a ? [a.line1, a.city, `${a.state} ${a.zip}`.trim()].filter(Boolean).join(', ') : '');

function when(start: string, end: string): string {
  const day = new Date(start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${timeOfDay(start)} – ${timeOfDay(end)}`;
}

function Row({ icon, text, c }: { icon: { ios: string; android: string }; text: string; c: Palette }) {
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <SymbolView name={{ ios: icon.ios as any, android: icon.android as any, web: icon.android as any }} size={12} tintColor={c.textMuted} />
      <Text style={{ flex: 1, fontSize: 13, color: c.textMuted }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Customer or appointment card inside a message. Live: shows the current status,
 * time and techs. Tap opens the appointment / customer screen right away.
 */
export default function EntityCard({ entity, c }: { entity: ChatEntityRef; c: Palette }) {
  const router = useRouter();
  const { card, reload } = useChatCard(entity);
  const label = entity.type === 'appointment' ? `APPOINTMENT #${entity.id}` : `CUSTOMER #${entity.id}`;

  const open = () => {
    if (card.status === 'error') return reload();
    if (card.status !== 'ready') return;
    router.push((entity.type === 'appointment' ? `/appointment/${entity.id}` : `/customer/${entity.id}`) as any);
  };

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => ({ width: 250, borderRadius: 12, borderWidth: 1, borderColor: c.cardBorder, backgroundColor: c.card, padding: 10, gap: 5, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: c.primary }}>{label}</Text>
        {card.status === 'ready' && card.type === 'appointment' && (
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: (APPOINTMENT_STATUS[card.data.status]?.color ?? c.textFaint) + '22' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: APPOINTMENT_STATUS[card.data.status]?.color ?? c.textFaint }}>{APPOINTMENT_STATUS[card.data.status]?.label ?? 'Unknown'}</Text>
          </View>
        )}
      </View>

      {card.status === 'loading' && <ActivityIndicator color={c.primary} style={{ alignSelf: 'flex-start', marginVertical: 6 }} />}
      {card.status === 'missing' && <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textMuted }}>No longer available</Text>}
      {card.status === 'error' && <Text style={{ fontSize: 13, color: c.textMuted }}>Couldn't load. Tap to retry</Text>}

      {card.status === 'ready' && card.type === 'appointment' && (
        <>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }} numberOfLines={1}>
            {card.data.customer?.name ?? 'No customer'}
          </Text>
          <Row icon={{ ios: 'calendar', android: 'calendar_today' }} text={when(card.data.start, card.data.end)} c={c} />
          <Row icon={{ ios: 'mappin.and.ellipse', android: 'location_on' }} text={addressLine(card.data.address)} c={c} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={{ fontSize: 11, color: c.textFaint }}>Job #{card.data.job_id}</Text>
            <View style={{ flexDirection: 'row' }}>
              {card.data.techs.slice(0, 4).map((t, i) => (
                <View key={t.id} style={{ marginLeft: i ? -6 : 0 }}>
                  <PersonAvatar name={t.name} color={t.color} size={22} />
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {card.status === 'ready' && card.type === 'customer' && (
        <>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }} numberOfLines={1}>
            {card.data.name}
          </Text>
          <Row icon={{ ios: 'phone', android: 'call' }} text={card.data.phone ?? ''} c={c} />
          <Row icon={{ ios: 'mappin.and.ellipse', android: 'location_on' }} text={addressLine(card.data.address)} c={c} />
        </>
      )}
    </Pressable>
  );
}
