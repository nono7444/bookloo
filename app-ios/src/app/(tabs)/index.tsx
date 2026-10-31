// Recherche : tomes un par un, collections à part, cache AllDebrid vérifié tout seul, bouton Télécharger.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip, Empty, Spinner, Title } from '@/components/ui';
import { api, AuthError, octets, type EtatSource, type Resultat } from '@/lib/api';
import { C, TAB_SPACE } from '@/lib/theme';

const RAYONS: [string, string][] = [['mangas', 'Mangas'], ['bd', 'BD'], ['comics', 'Comics'], ['livres', 'Livres'], ['audio', 'Audio']];
const FILTRES: [string, string][] = [['tout', 'Tout'], ['tomes', 'Tomes'], ['collections', 'Collections']];

export default function Recherche() {
  const [q, setQ] = useState('');
  const [rayon, setRayon] = useState('mangas');
  const [filtre, setFiltre] = useState('tout');
  const [resultats, setResultats] = useState<Resultat[] | null>(null);
  const [sources, setSources] = useState<EtatSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, string>>({});
  const [ajoutes, setAjoutes] = useState<Set<string>>(new Set());
  const [ouverts, setOuverts] = useState<Set<number>>(new Set());
  const [sansDossier, setSansDossier] = useState(false);
  const n = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem('bl.rayon').then((r) => r && setRayon(r)).catch(() => {});
    api<{ choix: unknown; disques: unknown[] }>('/api/simple/disques')
      .then((d) => setSansDossier(!d.choix))
      .catch((e) => e instanceof AuthError && router.replace('/login'));
  }, []);

  const chercher = async (rayonChoisi = rayon) => {
    const texte = q.trim();
    if (!texte) return;
    Keyboard.dismiss();
    const id = ++n.current;
    setLoading(true);
    setError(null);
    setResultats(null);
    setOuverts(new Set());
    try {
      const r = await api<{ resultats: Resultat[]; sources: EtatSource[] }>(`/api/simple/recherche?famille=${rayonChoisi}&q=${encodeURIComponent(texte)}`, { timeoutMs: 90_000 });
      if (id !== n.current) return;
      setResultats(r.resultats);
      setSources(r.sources);
      const c: Record<string, string> = {};
      for (const x of r.resultats) if (x.cache) c[x.cle] = x.cache;
      setCache(c);
      verifierCaches(r.resultats, c, id);
    } catch (e: any) {
      if (e instanceof AuthError) return router.replace('/login');
      if (id === n.current) setError(e?.message ?? String(e));
    } finally {
      if (id === n.current) setLoading(false);
    }
  };

  // Cache AllDebrid : la meilleure version de chaque tome, puis les collections, 4 par 4
  const verifierCaches = async (liste: Resultat[], connus: Record<string, string>, id: number) => {
    const vus = new Set<number>();
    const ordre: string[] = [];
    for (const x of liste) {
      if (!x.torrent || !x.certain || connus[x.cle]) continue;
      if (x.genre === 'tome') {
        if (vus.has(x.tome!)) continue;
        vus.add(x.tome!);
      }
      ordre.push(x.cle);
    }
    const a = ordre.slice(0, 40);
    for (let i = 0; i < a.length; i += 4) {
      if (id !== n.current) return;
      const lot = a.slice(i, i + 4);
      setCache((c) => ({ ...c, ...Object.fromEntries(lot.map((k) => [k, 'verif'])) }));
      try {
        const r = await api<{ etats: Record<string, string>; sansCle?: boolean }>('/api/simple/cache', { method: 'POST', body: { hashes: lot } });
        if (r.sansCle) {
          setCache((c) => ({ ...c, ...Object.fromEntries(lot.map((k) => [k, ''])) }));
          return;
        }
        setCache((c) => ({ ...c, ...Object.fromEntries(lot.map((k) => [k, r.etats[k] || 'inconnu'])) }));
      } catch {
        setCache((c) => ({ ...c, ...Object.fromEntries(lot.map((k) => [k, ''])) }));
        return;
      }
    }
  };

  const telecharger = async (x: Resultat) => {
    try {
      await api('/api/simple/telecharger', { method: 'POST', body: { cle: x.cle, titre: x.titre, source: x.source } });
      setAjoutes((s) => new Set(s).add(x.cle));
    } catch (e: any) {
      Alert.alert('Téléchargement impossible', e?.message ?? String(e));
    }
  };

  const groupes = useMemo(() => {
    const certains = (resultats ?? []).filter((x) => x.certain);
    const rang = (x: Resultat) => (cache[x.cle] === 'en-cache' ? 0 : 1);
    const parTome = new Map<number, Resultat[]>();
    for (const x of certains.filter((y) => y.genre === 'tome')) {
      if (!parTome.has(x.tome!)) parTome.set(x.tome!, []);
      parTome.get(x.tome!)!.push(x);
    }
    const tomes = [...parTome.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, l]) => [t, [...l].sort((a, b) => rang(a) - rang(b) || (b.seeders ?? 0) - (a.seeders ?? 0))] as const);
    return {
      tomes,
      packs: certains.filter((x) => x.genre === 'pack'),
      livres: certains.filter((x) => x.genre === 'livre'),
      incertains: (resultats ?? []).filter((x) => !x.certain),
    };
  }, [resultats, cache]);

  const carte = (x: Resultat) => (
    <Carte key={x.cle} x={x} cache={cache[x.cle]} ajoute={ajoutes.has(x.cle)} onDownload={() => telecharger(x)} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Title>Recherche</Title>
      <View style={st.field}>
        <Ionicons name="search" size={20} color={C.textDim} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Titre ou série : Jujutsu Kaizen…"
          placeholderTextColor={C.textFaint}
          style={st.input}
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={() => chercher()}
          clearButtonMode="while-editing"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.chips}>
        {RAYONS.map(([id, l]) => (
          <Chip
            key={id}
            label={l}
            on={rayon === id}
            onPress={() => {
              setRayon(id);
              AsyncStorage.setItem('bl.rayon', id).catch(() => {});
              if (q.trim()) chercher(id);
            }}
          />
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_SPACE + 40 }} keyboardShouldPersistTaps="handled">
        {sansDossier ? (
          <Pressable style={st.banner} onPress={() => router.push('/dossier')}>
            <Ionicons name="folder-open" size={20} color={C.accent} />
            <Text style={{ color: C.text, flex: 1 }}>Choisis où ranger tes téléchargements.</Text>
            <Text style={{ color: C.accent, fontWeight: '800' }}>Choisir</Text>
          </Pressable>
        ) : null}
        {resultats?.length ? (
          <View style={[st.chips, { paddingHorizontal: 0 }]}>
            {FILTRES.map(([id, l]) => (
              <Chip key={id} label={l} on={filtre === id} onPress={() => setFiltre(id)} />
            ))}
          </View>
        ) : null}
        {sources.length && resultats ? (
          <View style={st.sources}>
            {sources.map((s) => (
              <Text key={s.id} style={[st.source, (s.etat === 'cle-absente' || s.etat === 'echec') && { color: C.warning }]}>
                {s.label} : {s.etat === 'cle-absente' ? 'clé manquante' : s.etat === 'echec' ? 'pas de réponse' : s.n}
              </Text>
            ))}
          </View>
        ) : null}
        {loading ? <Spinner /> : null}
        {error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {resultats && !resultats.length ? <Empty icon="search" text="Aucun résultat en français pour cette recherche." /> : null}
        {!resultats && !loading && !error ? <Empty icon="library-outline" text="Cherche un manga, une BD, un livre ou un livre audio." /> : null}

        {filtre !== 'collections' && groupes.tomes.length ? (
          <>
            <Text style={st.h2}>
              Tomes <Text style={st.count}>{groupes.tomes.length}</Text>
            </Text>
            {groupes.tomes.map(([t, versions]) => (
              <View key={t} style={{ marginBottom: 8 }}>
                {carte(versions[0])}
                {versions.length > 1 ? (
                  <>
                    <Pressable
                      onPress={() => setOuverts((o) => { const s = new Set(o); if (s.has(t)) s.delete(t); else s.add(t); return s; })}
                      hitSlop={6}
                      style={{ paddingLeft: 78, paddingVertical: 6 }}>
                      <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>
                        {ouverts.has(t) ? 'Masquer' : `+ ${versions.length - 1} autre${versions.length > 2 ? 's' : ''} version${versions.length > 2 ? 's' : ''}`}
                      </Text>
                    </Pressable>
                    {ouverts.has(t) ? versions.slice(1).map((v) => <View key={v.cle} style={{ marginBottom: 8 }}>{carte(v)}</View>) : null}
                  </>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        {filtre !== 'tomes' && groupes.packs.length ? (
          <>
            <Text style={st.h2}>
              Collections et intégrales <Text style={st.count}>{groupes.packs.length}</Text>
            </Text>
            {groupes.packs.map((x) => <View key={x.cle} style={{ marginBottom: 8 }}>{carte(x)}</View>)}
          </>
        ) : null}

        {filtre === 'tout' && groupes.livres.length ? (
          <>
            <Text style={st.h2}>
              {groupes.tomes.length || groupes.packs.length ? 'Autres' : 'Résultats'} <Text style={st.count}>{groupes.livres.length}</Text>
            </Text>
            {groupes.livres.map((x) => <View key={x.cle} style={{ marginBottom: 8 }}>{carte(x)}</View>)}
          </>
        ) : null}

        {filtre === 'tout' && groupes.incertains.length ? <Incertains liste={groupes.incertains} render={carte} /> : null}
      </ScrollView>
    </View>
  );
}

function Incertains({ liste, render }: { liste: Resultat[]; render: (x: Resultat) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(!open)} style={{ paddingVertical: 14 }} hitSlop={6}>
        <Text style={{ color: C.textDim, fontWeight: '700' }}>
          {open ? '▾' : '▸'} Résultats moins proches ({liste.length})
        </Text>
      </Pressable>
      {open ? liste.map((x) => <View key={x.cle} style={{ marginBottom: 8 }}>{render(x)}</View>) : null}
    </>
  );
}

function Carte({ x, cache, ajoute, onDownload }: { x: Resultat; cache?: string; ajoute: boolean; onDownload: () => void }) {
  const badge =
    cache === 'en-cache' ? { t: '⚡ En cache', c: C.success, b: 'rgba(48,209,88,0.16)' } : cache === 'absent' ? { t: 'Pas en cache', c: C.warning, b: 'rgba(255,179,64,0.14)' } : cache === 'verif' ? { t: 'Cache…', c: C.textDim, b: C.surfaceHigh } : null;
  return (
    <View style={st.card}>
      <View style={st.num}>
        {x.genre === 'tome' ? (
          <>
            <Text style={st.numSmall}>TOME</Text>
            <Text style={st.numBig}>{x.tome}</Text>
          </>
        ) : x.genre === 'pack' ? (
          <>
            <Text style={st.numSmall}>{x.plage === 'Intégrale' ? 'SÉRIE' : 'PACK'}</Text>
            <Text style={[st.numBig, { fontSize: 14 }]}>{x.plage === 'Intégrale' ? 'Tout' : x.plage!.replace(' à ', '–')}</Text>
          </>
        ) : (
          <Ionicons name="book" size={22} color={C.text} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.cardTitle} numberOfLines={2}>
          {x.titre}
        </Text>
        <View style={st.meta}>
          <Text style={st.metaText}>{x.source}</Text>
          {x.taille ? <Text style={st.metaText}>{octets(x.taille)}</Text> : null}
          {x.seeders != null ? <Text style={st.metaText}>{x.seeders} seeds</Text> : null}
          {x.format && x.format !== 'inconnu' ? <Text style={st.metaText}>{x.format.toUpperCase()}</Text> : null}
          {badge ? <Text style={[st.badge, { color: badge.c, backgroundColor: badge.b }]}>{badge.t}</Text> : null}
        </View>
      </View>
      <Pressable onPress={onDownload} disabled={ajoute} style={[st.dl, ajoute && { backgroundColor: 'rgba(48,209,88,0.18)' }]} hitSlop={6}>
        <Ionicons name={ajoute ? 'checkmark' : 'arrow-down'} size={20} color={ajoute ? C.success : '#fff'} />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, backgroundColor: C.surfaceHigh, borderRadius: 14, paddingHorizontal: 14 },
  input: { flex: 1, color: C.text, fontSize: 17, paddingVertical: 13 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.accentSoft, borderRadius: 16, padding: 14, marginBottom: 10 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
  source: { color: C.textFaint, fontSize: 13 },
  h2: { color: C.text, fontSize: 19, fontWeight: '800', marginTop: 18, marginBottom: 10 },
  count: { color: C.textDim, fontSize: 14, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 16, padding: 12 },
  num: { width: 54, height: 54, borderRadius: 12, backgroundColor: C.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  numSmall: { color: C.textDim, fontSize: 9, fontWeight: '800' },
  numBig: { color: C.text, fontSize: 20, fontWeight: '900' },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  metaText: { color: C.textDim, fontSize: 12.5 },
  badge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  dl: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
