import React, { useState } from 'react';
import { Pressable, Text, type StyleProp, type TextStyle } from 'react-native';
import { formatDate } from '@/components/scheduler/utils/TimeHelper';

interface Props {
  /** When it happened — ISO string */
  date: string;
  /** What's always shown: "at 6:50 PM", "6:50 PM" */
  time: string;
  style?: StyleProp<TextStyle>;
}

/**
 * The time under a message / call / SMS. The date is normally in the day divider above
 * the group, but sometimes it's needed right away: a tap on the time adds "· Jun 19"
 * next to it (and the year when it isn't this year); another tap hides it.
 */
export default function TimeWithDate({ date, time, style }: Props) {
  const [showDate, setShowDate] = useState(false);
  const sameYear = new Date(date).getFullYear() === new Date().getFullYear();

  return (
    // A Pressable around it: the label is tiny, hitSlop makes it easy to hit with a finger
    <Pressable onPress={() => setShowDate((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityHint={showDate ? 'Hides the date' : 'Shows the date'}>
      {({ pressed }) => (
        <Text style={[style, pressed && { opacity: 0.6 }]}>
          {time}
          {showDate && <Text style={{ fontWeight: '700' }}>{` · ${formatDate(date, sameYear ? 'MMM DD' : 'MMM DD, YYYY')}`}</Text>}
        </Text>
      )}
    </Pressable>
  );
}
