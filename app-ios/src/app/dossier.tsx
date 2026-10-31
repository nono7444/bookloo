// Choix du dossier de téléchargement sur les disques du serveur (comme dans Lumio).
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back } from '@/components/Back';
import { Button, Empty, Spinner } from '@/components/ui';
import { api, octets, type Choix } from '@/lib/api';
import { C } from '@/lib/theme';

type Disque = { nom: string; libre: number | null; total: number | null };

export default function Dossier() {
  const insets = useSafeAreaInsets();
  const [disques, setDisques] = useState<Disque[] | null>(null);
  const [choix, setChoix] = useState<Choix | null>(null);
  const [racine, setRacine] = useState<string | null>(null);
  const [chemin, setChemin] = useState('');
  const [dossiers, setDossiers] = useState<string[] | null>(null);
  const [fichiers, setFichiers] = useState(0);
  const [nouveau, setNouveau] = useState<string | null>(null);

  useEffect(() => {
    api<{ disques: Disque[]; choix: Choix | null }>('/api/simple/disques')
      .then((d) => {
        setDisques(d.disques);
        setChoix(d.choix);
        if (d.choix) {
          setRacine(d.choix.racine);
          setChemin(d.choix.chemin);
        }
      })
      .catch((e) => Alert.alert('Erreur', e.message));
  }, []);

  useEffect(() => {
    if (!racine) return;
    setDossiers(null);
    api<{ dossiers: string[]; fichiers: number }>(`/api/simple/disques/dossiers?racine=${encodeURIComponent(racine)}&chemin=${encodeURIComponent(chemin)}`)
      .then((r) => {
        setDossiers(r.dossiers);
        setFichiers(r.fichiers);
      })
      .catch((e) => {
        setDossiers([]);
        Alert.alert('Erreur', e.message);
      });
  }, [racine, chemin]);

  const parts = chemin.split('/').filter(Boolean);
  const choisi = choix && choix.racine === racine && (choix.chemin || '') === chemin;

  const creer = async () => {
    const nom = (nouveau ?? '').trim();
    if (!nom || !racine) return;
    try {
      const r = await api<{ chemin: string }>('/api/simple/disques/dossier', { method: 'POST', body: { racine, chemin, nom } });
      setNouveau(null);
      setChemin(r.chemin);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    }
  };

  const choisir = async () => {
    try {
      const r = await api<{ choix: Choix }>('/api/simple/disques/choix', { method: 'PUT', body: { racine, chemin } });
      setChoix(r.choix);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Back title="Dossier de téléchargement" />
      <View style={st.current}>
        <Text style={{ color: C.textDim }}>Téléchargements rangés dans</Text>
        <Text style={{ color: C.text, fontWeight: '800', marginTop: 4 }}>
          {choix ? [choix.racine, ...choix.chemin.split('/').filter(Boolean)].join(' › ') : 'aucun dossier choisi'}
        </Text>
      </View>
      <View style={st.crumbs}>
        <Pressable onPress={() => { setRacine(null); setChemin(''); }} hitSlop={6}>
          <Text style={st.crumb}>Disques</Text>
        </Pressable>
        {racine ? (
          <>
            <Text style={st.sepc}>›</Text>
            <Pressable onPress={() => setChemin('')} hitSlop={6}>
              <Text style={st.crumb}>{racine}</Text>
            </Pressable>
          </>
        ) : null}
        {parts.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
            <Text style={st.sepc}>›</Text>
            <Pressable onPress={() => setChemin(parts.slice(0, i + 1).join('/'))} hitSlop={6}>
              <Text style={st.crumb}>{p}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 140, gap: 8 }}>
        {!racine ? (
          !disques ? (
            <Spinner />
          ) : !disques.length ? (
            <Empty icon="server-outline" text="Aucun disque n’est relié à Bookloo sur le serveur." />
          ) : (
            disques.map((d) => (
              <Pressable key={d.nom} style={st.row} onPress={() => { setRacine(d.nom); setChemin(''); }}>
                <View style={st.icon}><Ionicons name="server" size={18} color={C.text} /></View>
                <Text style={st.name}>{d.nom}</Text>
                {d.libre ? <Text style={{ color: C.textDim, fontSize: 13 }}>{octets(d.libre)} libres</Text> : null}
              </Pressable>
            ))
          )
        ) : !dossiers ? (
          <Spinner />
        ) : (
          <>
            {dossiers.map((nom) => (
              <Pressable key={nom} style={st.row} onPress={() => setChemin(parts.concat(nom).join('/'))}>
                <View style={st.icon}><Ionicons name="folder" size={18} color={C.text} /></View>
                <Text style={st.name} numberOfLines={1}>{nom}</Text>
                <Ionicons name="chevron-forward" size={18} color={C.textFaint} />
              </Pressable>
            ))}
            {!dossiers.length ? <Text style={{ color: C.textDim, textAlign: 'center', padding: 20 }}>{fichiers ? `${fichiers} fichier(s), aucun sous-dossier` : 'Dossier vide'}</Text> : null}
            {nouveau !== null ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput value={nouveau} onChangeText={setNouveau} autoFocus placeholder="Nom du dossier (ex. Mangas)" placeholderTextColor={C.textFaint} style={st.input} onSubmitEditing={creer} returnKeyType="done" />
                <Button title="Créer" onPress={creer} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      {racine ? (
        <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}>
            <Button title="Nouveau dossier" icon="add" kind="grey" onPress={() => setNouveau('')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={choisi ? 'Dossier choisi ✓' : 'Choisir ce dossier'} onPress={choisir} disabled={!!choisi} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  current: { marginHorizontal: 16, backgroundColor: C.surface, borderRadius: 16, padding: 14 },
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  crumb: { color: C.accent, fontWeight: '700', fontSize: 15 },
  sepc: { color: C.textDim },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 14, padding: 13 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.text, fontSize: 16, fontWeight: '600', flex: 1 },
  input: { flex: 1, backgroundColor: C.surfaceHigh, color: C.text, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.bg },
});
