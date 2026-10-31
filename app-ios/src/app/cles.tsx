// Clés : C411, Tr4ker (même clé API que dans Prowlarr) et AllDebrid. Elles restent sur le serveur, chiffrées.
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back } from '@/components/Back';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';

const CLES: [string, string, string][] = [
  ['c411', 'C411', 'Clé API (la même que dans Prowlarr)'],
  ['tr4ker', 'Tr4ker', 'Clé API (la même que dans Prowlarr)'],
  ['ad', 'AllDebrid', 'Clé API AllDebrid'],
];

export default function Cles() {
  const insets = useSafeAreaInsets();
  const [presentes, setPresentes] = useState<Record<string, boolean>>({});
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [verdicts, setVerdicts] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [busy, setBusy] = useState(false);

  const charger = () =>
    api<{ cles: { nom: string; renseignee: boolean }[] }>('/api/compte/cles')
      .then((r) => setPresentes(Object.fromEntries(r.cles.map((c) => [c.nom, c.renseignee]))))
      .catch(() => {});
  useEffect(() => {
    charger();
  }, []);

  const enregistrer = async () => {
    const corps = Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v.trim()));
    if (!Object.keys(corps).length) return;
    setBusy(true);
    try {
      await api('/api/compte/cles', { method: 'PUT', body: corps });
      setValeurs({});
      await charger();
      await tester();
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally {
      setBusy(false);
    }
  };

  const tester = async () => {
    setBusy(true);
    try {
      const r = await api<any>('/api/compte/cles/tester', { method: 'POST', body: {}, timeoutMs: 60_000 });
      const liste: any[] = Array.isArray(r) ? r : r.resultats ?? r.verdicts ?? Object.entries(r).map(([nom, v]: any) => ({ nom, ...v }));
      setVerdicts(Object.fromEntries(liste.filter((x) => x && x.nom).map((x) => [x.nom, { ok: Boolean(x.ok), message: String(x.message ?? '') }])));
    } catch (e: any) {
      Alert.alert('Test impossible', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Back title="Clés" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: C.textDim }}>Elles sont chiffrées sur le serveur et ne s’affichent jamais. Laisse un champ vide pour garder la clé actuelle.</Text>
        {CLES.map(([nom, label, aide]) => (
          <View key={nom} style={st.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={st.label}>{label}</Text>
              <Text style={{ color: presentes[nom] ? C.success : C.textFaint, fontSize: 13 }}>{presentes[nom] ? 'enregistrée' : 'absente'}</Text>
            </View>
            <TextInput
              value={valeurs[nom] ?? ''}
              onChangeText={(v) => setValeurs((x) => ({ ...x, [nom]: v }))}
              placeholder={presentes[nom] ? `${aide} — saisir pour remplacer` : aide}
              placeholderTextColor={C.textFaint}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="oneTimeCode"
              style={st.input}
            />
            {verdicts[nom] ? <Text style={{ color: verdicts[nom].ok ? C.success : C.danger, fontSize: 13 }}>{verdicts[nom].message}</Text> : null}
          </View>
        ))}
        <Button title={busy ? '…' : 'Enregistrer'} onPress={enregistrer} disabled={busy} />
        <Button title="Tester mes clés" kind="grey" onPress={tester} disabled={busy} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 14, gap: 10 },
  label: { color: C.text, fontSize: 17, fontWeight: '700' },
  input: { backgroundColor: C.surfaceHigh, color: C.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
});
