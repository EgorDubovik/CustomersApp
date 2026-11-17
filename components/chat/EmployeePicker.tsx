import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { callsPalette, callsStyles as styles } from '@/components/calls/styles';
import { PersonAvatar } from './ChatAvatar';

interface Props {
  c: (typeof callsPalette)['light'];
  /** One tap picks (direct message) or toggles (group members). */
  multiple?: boolean;
  selected?: number[];
  onPick: (userId: number) => void;
  /** Already in the chat — not offered. */
  exclude?: number[];
  header?: React.ReactElement;
}

/** Active colleagues (everyone but me), with a search by name. */
export default function EmployeePicker({ c, multiple, selected = [], onPick, exclude = [], header }: Props) {
  const { companyEmployees, user } = useAuth();
  const [search, setSearch] = useState('');
  const myId = Number(user?.id ?? 0);

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companyEmployees
      .filter((e) => e.id !== myId && e.active !== 0 && !exclude.includes(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companyEmployees, search, myId, exclude]);

  return (
    <FlatList
      data={people}
      keyExtractor={(e) => String(e.id)}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={
        <View>
          {header}
          <View style={[styles.searchInputRow, { backgroundColor: c.card, borderColor: c.cardBorder, marginHorizontal: 16, marginVertical: 10 }]}>
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={c.textMuted} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search colleagues" placeholderTextColor={c.textFaint} style={[styles.searchInput, { color: c.text }]} />
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={{ textAlign: 'center', color: c.textMuted, paddingVertical: 32 }}>No colleagues found</Text>}
      renderItem={({ item }) => {
        const isSelected = selected.includes(item.id);
        return (
          <Pressable
            onPress={() => onPick(item.id)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: pressed ? c.inputBg : 'transparent' })}
          >
            <PersonAvatar name={item.name} color={item.color} size={38} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: c.text }} numberOfLines={1}>
              {item.name}
            </Text>
            {multiple && (
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: isSelected ? c.primary : c.textFaint,
                  backgroundColor: isSelected ? c.primary : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isSelected && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor="#fff" />}
              </View>
            )}
          </Pressable>
        );
      }}
    />
  );
}
