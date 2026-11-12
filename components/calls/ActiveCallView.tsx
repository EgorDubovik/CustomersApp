import React from 'react';
import { Text, View } from 'react-native';

/** Звонки из приложения пока есть только на iPhone (ActiveCallView.ios.tsx). */
export default function ActiveCallView(_props: { fromPhoneId?: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text>Calls from the app are available on iPhone only.</Text>
    </View>
  );
}
