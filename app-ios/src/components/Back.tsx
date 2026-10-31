// En-tête simple avec bouton retour.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/lib/theme';

export function Back({ title, right }: { title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={st.round} accessibilityLabel="Retour">
        <Ionicons name="chevron-back" size={22} color={C.text} />
      </Pressable>
      <Text style={st.title} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  round: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 20, fontWeight: '800', flex: 1 },
});
