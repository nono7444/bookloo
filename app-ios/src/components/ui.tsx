// Petites briques de l'interface (style Lumio).
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/lib/theme';

export function Title({ children, right }: { children: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.title, { paddingTop: insets.top + 10 }]}>
      <Text style={s.titleText}>{children}</Text>
      {right}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]} hitSlop={4}>
      <Text style={[s.chipText, on && { color: '#000' }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ icon, text, children }: { icon: keyof typeof Ionicons.glyphMap; text: string; children?: ReactNode }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={40} color={C.textFaint} />
      <Text style={s.emptyText}>{text}</Text>
      {children}
    </View>
  );
}

export const Spinner = ({ style }: { style?: ViewStyle }) => <ActivityIndicator color={C.text} style={[{ marginTop: 40 }, style]} />;

export function Button({ title, icon, onPress, kind = 'accent', disabled }: { title: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; kind?: 'accent' | 'grey'; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, kind === 'grey' && { backgroundColor: C.surfaceHigh }, (pressed || disabled) && { opacity: 0.6 }]}>
      {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
      <Text style={s.btnText}>{title}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  titleText: { color: C.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.6 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surfaceHigh },
  chipOn: { backgroundColor: C.text },
  chipText: { color: C.textDim, fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 60, paddingHorizontal: 30 },
  emptyText: { color: C.textDim, fontSize: 15, textAlign: 'center' },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 18 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
