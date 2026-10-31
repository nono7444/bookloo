// Lecteur de livres (EPUB) : chapitre par chapitre, taille du texte, thème, sommaire, reprise.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Empty, Spinner } from '@/components/ui';
import { api, full } from '@/lib/api';
import { C } from '@/lib/theme';

const THEMES = ['sombre', 'sepia', 'clair'] as const;
const FOND = { sombre: '#000', sepia: '#f4ecd8', clair: '#fff' };

export default function LecteurEpub() {
  const { jeton, titre, chemin } = useLocalSearchParams<{ jeton: string; titre: string; chemin: string }>();
  const insets = useSafeAreaInsets();
  const [livre, setLivre] = useState<{ titre: string; chapitres: string[] } | null>(null);
  const [chap, setChap] = useState(0);
  const [taille, setTaille] = useState(19);
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('sombre');
  const [chrome, setChrome] = useState(true);
  const [sommaire, setSommaire] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defilement = useRef(0);
  const reprise = useRef(0);

  useEffect(() => {
    (async () => {
      const [pos, t, th] = await Promise.all([
        AsyncStorage.getItem(`bl.epub.${chemin}`).catch(() => null),
        AsyncStorage.getItem('bl.taille').catch(() => null),
        AsyncStorage.getItem('bl.theme').catch(() => null),
      ]);
      if (t) setTaille(Number(t) || 19);
      if (th && (THEMES as readonly string[]).includes(th)) setTheme(th as (typeof THEMES)[number]);
      try {
        const l = await api<{ titre: string; chapitres: string[] }>(`/api/simple/f/${jeton}/epub`);
        if (pos) {
          const [c, y] = pos.split(':').map(Number);
          if (c < l.chapitres.length) {
            setChap(c);
            reprise.current = y || 0;
          }
        }
        setLivre(l);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, [jeton, chemin]);

  const sauver = (c: number, y: number) => {
    AsyncStorage.setItem(`bl.epub.${chemin}`, `${c}:${y.toFixed(3)}`).catch(() => {});
    if (livre) AsyncStorage.setItem(`bl.pos.${chemin}`, `ch. ${c + 1}/${livre.chapitres.length}`).catch(() => {});
  };

  const changer = (c: number) => {
    if (!livre) return;
    const k = Math.max(0, Math.min(livre.chapitres.length - 1, c));
    reprise.current = 0;
    setChap(k);
    sauver(k, 0);
  };

  // Suivi du défilement (reprise au même endroit), et toucher = afficher / masquer les commandes
  const script = `(function(){
    var y=${reprise.current};
    function aller(){ if(y>0){ window.scrollTo(0, y*(document.documentElement.scrollHeight-innerHeight)); } }
    window.addEventListener('load', function(){ setTimeout(aller, 60); });
    aller();
    var t=null;
    window.addEventListener('scroll', function(){ if(t) return; t=setTimeout(function(){ t=null;
      var h=document.documentElement.scrollHeight-innerHeight; window.ReactNativeWebView.postMessage(JSON.stringify({y: h>0? scrollY/h : 0})); }, 400); });
    document.addEventListener('click', function(e){ if(e.target.closest('a')) return; window.ReactNativeWebView.postMessage(JSON.stringify({tap:1})); });
  })(); true;`;

  if (error)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 40 }}>
        <Empty icon="alert-circle-outline" text={error}>
          <Pressable onPress={() => router.back()}><Text style={{ color: C.accent, fontWeight: '800' }}>Retour</Text></Pressable>
        </Empty>
      </View>
    );
  if (!livre) return <View style={{ flex: 1, backgroundColor: C.bg }}><Spinner style={{ marginTop: 200 }} /></View>;

  const sombre = theme === 'sombre';
  const ink = sombre ? '#fff' : '#111';
  const barBg = sombre ? 'rgba(20,20,22,0.92)' : 'rgba(240,240,240,0.95)';

  return (
    <View style={{ flex: 1, backgroundColor: FOND[theme] }}>
      <StatusBar hidden={!chrome} style={sombre ? 'light' : 'dark'} />
      <WebView
        key={`${chap}-${taille}-${theme}`}
        source={{ uri: full(`/api/simple/f/${jeton}/epub/${chap}?taille=${taille}&theme=${theme}`) }}
        style={{ flex: 1, backgroundColor: FOND[theme] }}
        originWhitelist={['*']}
        injectedJavaScript={script}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.tap) setChrome((c) => !c);
            if (typeof m.y === 'number') {
              defilement.current = m.y;
              sauver(chap, m.y);
            }
          } catch {}
        }}
        startInLoadingState
        renderLoading={() => <View style={[StyleSheet.absoluteFill, { backgroundColor: FOND[theme] }]} />}
      />
      {chrome ? (
        <>
          <View style={[st.top, { paddingTop: insets.top + 4, backgroundColor: barBg }]}>
            <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color={ink} /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[st.title, { color: ink }]} numberOfLines={1}>{livre.titre || titre}</Text>
              <Text style={st.sub} numberOfLines={1}>{livre.chapitres[chap]}</Text>
            </View>
            <Pressable onPress={() => setSommaire(true)} hitSlop={10}><Ionicons name="list" size={24} color={ink} /></Pressable>
          </View>
          <View style={[st.bottom, { paddingBottom: insets.bottom + 8, backgroundColor: barBg }]}>
            <Pressable onPress={() => changer(chap - 1)} disabled={chap === 0} hitSlop={8} style={{ opacity: chap === 0 ? 0.3 : 1 }}>
              <Ionicons name="chevron-back-circle" size={32} color={ink} />
            </Pressable>
            <Pressable onPress={() => { const t = Math.max(13, taille - 1); setTaille(t); AsyncStorage.setItem('bl.taille', String(t)).catch(() => {}); }} hitSlop={8}>
              <Text style={[st.aa, { color: ink, fontSize: 15 }]}>A−</Text>
            </Pressable>
            <Pressable onPress={() => { const t = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; setTheme(t); AsyncStorage.setItem('bl.theme', t).catch(() => {}); }} hitSlop={8}>
              <Ionicons name="contrast" size={24} color={ink} />
            </Pressable>
            <Pressable onPress={() => { const t = Math.min(32, taille + 1); setTaille(t); AsyncStorage.setItem('bl.taille', String(t)).catch(() => {}); }} hitSlop={8}>
              <Text style={[st.aa, { color: ink, fontSize: 21 }]}>A+</Text>
            </Pressable>
            <Text style={st.sub}>{chap + 1}/{livre.chapitres.length}</Text>
            <Pressable onPress={() => changer(chap + 1)} disabled={chap >= livre.chapitres.length - 1} hitSlop={8} style={{ opacity: chap >= livre.chapitres.length - 1 ? 0.3 : 1 }}>
              <Ionicons name="chevron-forward-circle" size={32} color={ink} />
            </Pressable>
          </View>
        </>
      ) : null}
      <Modal visible={sommaire} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSommaire(false)}>
        <View style={{ flex: 1, backgroundColor: '#161618' }}>
          <View style={st.sheetHead}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Sommaire</Text>
            <Pressable onPress={() => setSommaire(false)} hitSlop={10}><Ionicons name="close" size={26} color="#fff" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {livre.chapitres.map((c, i) => (
              <Pressable key={i} onPress={() => { changer(i); setSommaire(false); }} style={[st.toc, i === chap && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={{ color: i === chap ? C.accent : '#fff', fontSize: 16 }} numberOfLines={2}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  title: { fontWeight: '700', fontSize: 15 },
  sub: { color: '#8e8e93', fontSize: 12 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 10 },
  aa: { fontWeight: '800' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  toc: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a2a2c' },
});
