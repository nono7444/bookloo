// Réglages : serveur, compte, pages du site (nouveautés, administration), déconnexion.
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useServer } from '@/lib/server';
import { C, TAB_SPACE } from '@/lib/theme';

type Row = { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; danger?: boolean };

const open = (path: string, title: string) => router.push({ pathname: '/web', params: { path, title } });

export default function Reglages() {
  const { url, bumpAuth } = useServer();
  const insets = useSafeAreaInsets();
  const [loggingOut, setLoggingOut] = useState(false);

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Serveur',
      rows: [{ icon: 'server-outline', label: 'Adresse du serveur', sub: url ?? '', onPress: () => router.push('/setup') }],
    },
    {
      title: 'Mon compte',
      rows: [
        { icon: 'key-outline', label: 'Compte et clés de service', sub: 'Débrideur, sources, mot de passe', onPress: () => open('/compte.html', 'Compte') },
        { icon: 'sparkles-outline', label: 'Nouveautés de Bookloo', onPress: () => open('/changelog.html', 'Nouveautés') },
      ],
    },
    {
      title: 'Administration',
      rows: [
        { icon: 'shield-checkmark-outline', label: 'Administration', sub: 'Comptes, sources, Telegram', onPress: () => open('/admin.html', 'Administration') },
        { icon: 'document-text-outline', label: 'Journal', onPress: () => open('/logs.html', 'Journal') },
      ],
    },
    {
      title: '',
      rows: [
        {
          icon: 'log-out-outline',
          label: 'Se déconnecter',
          danger: true,
          onPress: () =>
            Alert.alert('Se déconnecter ?', 'Tu devras retaper ton mot de passe.', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Se déconnecter', style: 'destructive', onPress: () => setLoggingOut(true) },
            ]),
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_SPACE + insets.bottom, paddingHorizontal: 16 }}>
        <Text style={styles.h1}>Réglages</Text>
        {groups.map((g, gi) => (
          <View key={gi} style={{ marginTop: 22 }}>
            {g.title ? <Text style={styles.section}>{g.title}</Text> : null}
            <View style={styles.card}>
              {g.rows.map((r, i) => (
                <Pressable
                  key={r.label}
                  onPress={r.onPress}
                  style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { backgroundColor: C.surfaceHigh }]}>
                  <Ionicons name={r.icon} size={21} color={r.danger ? C.danger : C.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, r.danger && { color: C.danger }]}>{r.label}</Text>
                    {r.sub ? (
                      <Text style={styles.sub} numberOfLines={1}>
                        {r.sub}
                      </Text>
                    ) : null}
                  </View>
                  {!r.danger ? <Ionicons name="chevron-forward" size={18} color={C.textFaint} /> : null}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <Text style={styles.version}>Bookloo pour iPhone {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>
      {/* Déconnexion : le site s'en charge lui-même (jeton anti-falsification compris) */}
      {loggingOut && url ? (
        <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}>
          <WebView
            source={{ uri: `${url}/compte.html` }}
            sharedCookiesEnabled
            injectedJavaScript={"(function(){var b=document.getElementById('deconnexion');if(b)b.click();})();true;"}
            onNavigationStateChange={(e) => {
              if (/\/login(\.html)?/.test(e.url) && !e.loading) {
                setLoggingOut(false);
                bumpAuth();
                router.navigate('/(tabs)');
              }
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: C.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.6 },
  section: { color: C.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  label: { color: C.text, fontSize: 16, fontWeight: '600' },
  sub: { color: C.textDim, fontSize: 13, marginTop: 2 },
  version: { color: C.textFaint, fontSize: 12, textAlign: 'center', marginTop: 28 },
});
