import React from 'react';
import { Dimensions, FlatList, Image, Modal, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatAttachment } from './types';

/** Full-screen photos of one message; swipe sideways between them. */
export default function PhotoViewer({ photos, index, onClose }: { photos: ChatAttachment[]; index: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  const [current, setCurrent] = React.useState(index ?? 0);

  React.useEffect(() => {
    if (index !== null) setCurrent(index);
  }, [index]);

  return (
    <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {index !== null && (
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => String(p.id)}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <Image source={{ uri: item.url }} style={{ width, height }} resizeMode="contain" />}
          />
        )}
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{photos.length > 1 ? `${current + 1} / ${photos.length}` : ''}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={16} tintColor="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
