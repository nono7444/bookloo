// Bibliothèque : tes livres téléchargés (à lire dans l'appli) et les téléchargements en cours.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip, Empty, Spinner, Title } from '@/components/ui';
import { api, AuthError, full, octets, type Choix, type Livre, type Travail } from '@/lib/api';
import { ouvrirLivre } from '@/lib/ouvrir';
import { C, TAB_SPACE } from '@/lib/theme';

const ICONES: Record<Livre['format'], keyof typeof Ionicons.glyphMap> = { bd: 'images', epub: 'book', pdf: 'document-text', audio: 'headset' };
const ACTIFS = ['attente', 'debrideur', 'telechargement'];

export default function Bibliotheque() {
  const [vue, setVue] = useState<'livres' | 'telechargements'>('livres');
  const [livres, setLivres] = useState<Livre[] | null>(null);
  const [dossier, setDossier] = useState<Choix | null>(null);
  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [positions, setPositions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charger = useCallback(async () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    try {
      const [l, t] = await Promise.all([
        api<{ livres: Livre[]; dossier: Choix | null }>('/api/simple/livres'),
        api<{ travaux: Travail[] }>('/api/simple/telechargements'),
      ]);
      setLivres(l.livres);
      setDossier(l.dossier);
      setTravaux(t.travaux);
      setError(null);
      const keys = l.livres.map((x) => `bl.pos.${x.chemin}`);
      const pairs = await AsyncStorage.multiGet(keys).catch(() => [] as [string, string | null][]);
      setPositions(Object.fromEntries(pairs.filter(([, v]) => v).map(([k, v]) => [k.slice(7), v!])));
      if (t.travaux.some((x) => ACTIFS.includes(x.etat))) minuteur.current = setTimeout(charger, 2500);
    } catch (e: any) {
      if (e instanceof AuthError) return router.replace('/login');
      setError(e?.message ?? String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
      return () => {
        if (minuteur.current) clearTimeout(minuteur.current);
      };
    }, [charger])
  );

  const actifs = travaux.filter((t) => ACTIFS.includes(t.etat)).length;

  // Livres rangés par série (sous-dossier)
  const series = useMemo(() => {
    const m = new Map<string, Livre[]>();
    for (const l of livres ?? []) {
      const k = l.dossier || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    for (const l of m.values()) l.sort((a, b) => a.titre.localeCompare(b.titre, 'fr', { numeric: true }));
    return [...m.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0], 'fr')));
  }, [livres]);

  const options = (l: Livre) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: l.titre, options: ['Lire', 'Supprimer du disque', 'Annuler'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) ouvrirLivre(l);
        if (i === 1)
          Alert.alert('Supprimer ce livre ?', `${l.nom}\nLe fichier sera effacé du disque.`, [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api('/api/simple/livres/supprimer', { method: 'POST', body: { jeton: l.jeton } });
                  charger();
                } catch (e: any) {
                  Alert.alert('Erreur', e?.message ?? String(e));
                }
              },
            },
          ]);
      }
    );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Title>Bibliothèque</Title>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        <Chip label="Mes livres" on={vue === 'livres'} onPress={() => setVue('livres')} />
        <Chip label={`Téléchargements${actifs ? ` (${actifs})` : ''}`} on={vue === 'telechargements'} onPress={() => setVue('telechargements')} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_SPACE + 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={charger} tintColor={C.text} />}>
        {error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {!livres && !error ? <Spinner /> : null}
        {vue === 'livres' && livres ? (
          !dossier ? (
            <Empty icon="folder-open-outline" text="Choisis d’abord ton dossier de téléchargement.">
              <Pressable onPress={() => router.push('/dossier')}>
                <Text style={{ color: C.accent, fontWeight: '800', fontSize: 16 }}>Choisir un dossier</Text>
              </Pressable>
            </Empty>
          ) : !livres.length ? (
            <Empty icon="library-outline" text="Aucun livre dans ton dossier. Cherche un titre et appuie sur la flèche pour le télécharger." />
          ) : (
            series.map(([nom, liste]) => (
              <View key={nom || '_'} style={{ marginBottom: 18 }}>
                <Text style={st.h2}>{nom ? nom.split('/').pop() : 'Dans le dossier'}</Text>
                {liste.map((l) => (
                  <Pressable key={l.chemin} onPress={() => ouvrirLivre(l)} onLongPress={() => options(l)} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
                    {l.format === 'bd' ? (
                      <Image source={full(`/api/simple/f/${l.jeton}/page/0`)} style={st.cover} contentFit="cover" cachePolicy="disk" transition={150} />
                    ) : (
                      <View style={[st.cover, st.coverIcon]}>
                        <Ionicons name={ICONES[l.format]} size={22} color={C.text} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={st.title} numberOfLines={2}>
                        {l.titre}
                      </Text>
                      <Text style={st.sub}>
                        {[l.format.toUpperCase(), octets(l.taille), positions[l.chemin] ? `reprise ${positions[l.chemin]}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.textFaint} />
                  </Pressable>
                ))}
              </View>
            ))
          )
        ) : null}

        {vue === 'telechargements' ? (
          !travaux.length ? (
            <Empty icon="arrow-down-circle-outline" text="Aucun téléchargement." />
          ) : (
            travaux.map((t) => <TravailRow key={t.id} t={t} onChange={charger} />)
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

function TravailRow({ t, onChange }: { t: Travail; onChange: () => void }) {
  const actif = ACTIFS.includes(t.etat);
  const pct = t.etat === 'termine' ? 100 : t.total ? Math.min(100, Math.floor((t.recu / t.total) * 100)) : 0;
  const libelle = { attente: 'En attente', debrideur: 'AllDebrid', telechargement: 'Téléchargement', termine: 'Terminé', erreur: 'Échec', annule: 'Annulé' }[t.etat];
  return (
    <View style={st.job}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Text style={[st.title, { flex: 1 }]} numberOfLines={2}>
          {t.titre}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={async () => {
            await api(`/api/simple/telechargements/${t.id}`, { method: 'DELETE' }).catch(() => {});
            onChange();
          }}>
          <Ionicons name={actif ? 'close-circle' : 'trash-outline'} size={22} color={C.textDim} />
        </Pressable>
      </View>
      <Text style={[st.sub, t.etat === 'erreur' && { color: C.danger }]}>
        {libelle}
        {actif && t.total ? ` · ${pct} % · ${octets(t.recu)} sur ${octets(t.total)}` : ''}
        {t.message && t.etat !== 'termine' ? ` — ${t.message}` : ''}
      </Text>
      {actif || t.etat === 'termine' ? (
        <View style={st.bar}>
          <View style={[st.fill, { width: `${pct}%` }, t.etat === 'termine' && { backgroundColor: C.success }]} />
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  h2: { color: C.text, fontSize: 19, fontWeight: '800', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 14, padding: 10, marginBottom: 8 },
  cover: { width: 46, height: 66, borderRadius: 8, backgroundColor: C.surfaceHigh },
  coverIcon: { alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  sub: { color: C.textDim, fontSize: 12.5, marginTop: 4 },
  job: { backgroundColor: C.surface, borderRadius: 16, padding: 14, marginBottom: 8 },
  bar: { height: 6, backgroundColor: C.surfaceHigh, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: C.accent, borderRadius: 3 },
});
