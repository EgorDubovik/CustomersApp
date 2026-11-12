import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import ActiveCallView from '@/components/calls/ActiveCallView';

/** Экран идущего звонка; сама вёрстка — в ActiveCallView (на iOS — с Telnyx SDK). */
export default function ActiveCallScreen() {
  const { fromPhoneId } = useLocalSearchParams<{ fromPhoneId?: string }>();

  return (
    <>
      {/* Без жеста «назад»: уйти с разговора можно только кнопкой «Завершить» */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <ActiveCallView fromPhoneId={fromPhoneId ? Number(fromPhoneId) : undefined} />
    </>
  );
}
