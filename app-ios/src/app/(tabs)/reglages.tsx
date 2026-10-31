// Réglages : serveur, dossier de téléchargement, clés, déconnexion.
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Title } from '@/components/ui';
import { api, logout, type Choix } from '@/lib/api';
import { useServer } from '@/lib/server';
import { C, TAB_SPACE } from '@/lib/theme';

type Row = { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; danger?: boolean };

export default function Reglages() {
  const { url } = useServer();
  const [choix, setChoix] = useState<Choix | null>(null);
  const [admin, setAdmin] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<{ choix: Choix | null }>('/api/simple/disques').then((d) => setChoix(d.choix)).catch(() => {});
      api<{ role: string }>('/api/simple/session').then((s) => setAdmin(s.role === 'admin')).catch(() => {});
    }, [])
  );

  const groups: { title: string; rows: Row[] }[] = [
    { title: 'Téléchargements', rows: [{ icon: 'folder-open-outline', label: 'Dossier de téléchargement', sub: choix ? [choix.racine, ...choix.chemin.split('/').filter(Boolean)].join(' › ') : 'Aucun dossier choisi', onPress: () => router.push('/dossier') }] },
    { title: 'Compte', rows: [{ icon: 'key-outline', label: 'Clés', sub: 'C411, Tr4ker, AllDebrid', onPress: () => router.push('/cles') }] },
    { title: 'Serveur', rows: [{ icon: 'server-outline', label: 'Adresse du serveur', sub: url ?? '', onPress: () => router.push('/setup') }] },
    ...(admin ? [{ title: 'Administration', rows: [{ icon: 'people-outline' as const, label: 'Comptes de la famille', sub: 'Dans Safari', onPress: () => url && Linking.openURL(`${url}/admin.html`) }] }] : []),
    {
      title: '',
      rows: [
        {
          icon: 'log-out-outline',
          label: 'Se déconnecter',
          danger: true,
          onPress: () =>
            Alert.alert('Se déconnecter ?', '', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Se déconnecter', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
            ]),
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Title>Réglages</Title>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_SPACE + 20 }}>
        {groups.map((g, gi) => (
          <View key={gi} style={{ marginTop: 18 }}>
            {g.title ? <Text style={st.section}>{g.title}</Text> : null}
            <View style={st.card}>
              {g.rows.map((r, i) => (
                <Pressable key={r.label} onPress={r.onPress} style={({ pressed }) => [st.row, i > 0 && st.sep, pressed && { backgroundColor: C.surfaceHigh }]}>
                  <Ionicons name={r.icon} size={21} color={r.danger ? C.danger : C.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.label, r.danger && { color: C.danger }]}>{r.label}</Text>
                    {r.sub ? <Text style={st.sub} numberOfLines={1}>{r.sub}</Text> : null}
                  </View>
                  {!r.danger ? <Ionicons name="chevron-forward" size={18} color={C.textFaint} /> : null}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <Text style={st.version}>Bookloo pour iPhone {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  section: { color: C.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  label: { color: C.text, fontSize: 16, fontWeight: '600' },
  sub: { color: C.textDim, fontSize: 13, marginTop: 2 },
  version: { color: C.textFaint, fontSize: 12, textAlign: 'center', marginTop: 28 },
});
