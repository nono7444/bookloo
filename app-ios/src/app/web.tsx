// Une page du serveur ouverte depuis les Réglages (compte, nouveautés, administration…).
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookWeb } from '@/components/BookWeb';
import { C } from '@/lib/theme';

export default function WebPage() {
  const { path, title } = useLocalSearchParams<{ path: string; title?: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.round} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? ''}
        </Text>
      </View>
      <BookWeb path={String(path || '/accueil.html')} withTabBar={false} topInset={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: C.bg },
  round: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 20, fontWeight: '800', flex: 1 },
});
