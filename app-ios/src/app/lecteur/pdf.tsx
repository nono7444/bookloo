// Lecteur PDF (le lecteur intégré d'iOS).
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { full } from '@/lib/api';
import { C } from '@/lib/theme';

export default function LecteurPdf() {
  const { jeton, titre } = useLocalSearchParams<{ jeton: string; titre: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={[st.top, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color="#fff" /></Pressable>
        <Text style={st.title} numberOfLines={1}>{titre}</Text>
      </View>
      <WebView source={{ uri: full(`/api/simple/f/${jeton}/fichier`) }} style={{ flex: 1, backgroundColor: '#000' }} startInLoadingState />
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10, backgroundColor: C.bg },
  title: { color: '#fff', fontWeight: '700', fontSize: 15, flex: 1 },
});
