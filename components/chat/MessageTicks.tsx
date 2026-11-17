import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Sent (one tick) / read (two overlapping ticks) — same drawing as the web IconMessageTicks. */
export default function MessageTicks({ double = false, color, height = 11 }: { double?: boolean; color: string; height?: number }) {
  const width = (height * (double ? 17 : 12)) / 12;
  return (
    <Svg width={width} height={height} viewBox={double ? '0 0 17 12' : '0 0 12 12'} fill="none">
      <Path d="M1 6.5L4.5 10L11 2" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {double && <Path d="M7.75 8.75L9 10L15.5 2" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />}
    </Svg>
  );
}
