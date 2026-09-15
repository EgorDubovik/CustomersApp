import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { CompanyPhone } from '@/context/AuthContext';
import { styles as appStyles } from '@/components/appointment/styles';
import { callsPalette, callsStyles as styles } from './styles';
import { formatPhoneNumber } from './helpers';

interface Props {
  visible: boolean;
  onClose: () => void;
  companyPhones: CompanyPhone[];
  /** Normalized (digits only) numbers whose conversations are hidden */
  hiddenPhones: Set<string>;
  onToggle: (phoneKey: string) => void;
  onShowAll: () => void;
  isDark: boolean;
}

export const phoneKey = (phone: string | null | undefined) => (phone || '').replace(/\D/g, '').slice(-10);

/** Bottom sheet: tick / untick company numbers to filter the conversation list by line */
export default function CallsSettingsModal({ visible, onClose, companyPhones, hiddenPhones, onToggle, onShowAll, isDark }: Props) {
  const c = isDark ? callsPalette.dark : callsPalette.light;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={appStyles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[appStyles.modalCard, { backgroundColor: c.modalBg, maxHeight: '80%', width: '100%' }]}>
          <View style={appStyles.modalHeader}>
            <View>
              <Text style={[appStyles.modalTitle, { color: c.text }]}>Company numbers</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>Untick a line to hide its conversations</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={15} style={({ pressed }) => [appStyles.modalCloseBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.7 }]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={c.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 8, gap: 4 }} showsVerticalScrollIndicator={false}>
            {companyPhones.length === 0 && <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textMuted, paddingVertical: 12 }}>No company numbers configured.</Text>}
            {companyPhones.map((p) => {
              const key = phoneKey(p.phone);
              const checked = !hiddenPhones.has(key);
              return (
                <Pressable key={p.id} onPress={() => onToggle(key)} style={({ pressed }) => [styles.phoneFilterRow, checked && { backgroundColor: c.primaryMuted }, pressed && { opacity: 0.7 }]}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color || '#888' }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }} numberOfLines={1}>
                      {p.description || 'Company number'}
                      {p.is_primary ? '  ·  primary' : ''}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{formatPhoneNumber(p.phone)}</Text>
                  </View>
                  <View style={[styles.phoneFilterCheck, { borderColor: checked ? c.primary : c.divider, backgroundColor: checked ? c.primary : 'transparent' }]}>
                    {checked && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor="#fff" />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={appStyles.modalActions}>
            <Pressable onPress={onShowAll} disabled={hiddenPhones.size === 0} style={({ pressed }) => [appStyles.modalActionBtn, { backgroundColor: c.inputBg }, pressed && { opacity: 0.8 }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: hiddenPhones.size === 0 ? c.textFaint : c.primary }}>Show all</Text>
            </Pressable>
            <Pressable onPress={onClose} style={({ pressed }) => [appStyles.modalActionBtn, { backgroundColor: c.primary, flex: 1.5 }, pressed && { opacity: 0.85 }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
