// Lecteur de BD / mangas : planche par planche, zoom au pincement, sens manga, reprise automatique.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Empty, Spinner } from '@/components/ui';
import { api, full } from '@/lib/api';
import { C } from '@/lib/theme';

export default function LecteurBD() {
  const { jeton, titre, chemin } = useLocalSearchParams<{ jeton: string; titre: string; chemin: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [manga, setManga] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liste = useRef<FlatList<number>>(null);
  const depart = useRef(0);

  const url = (n: number) => full(`/api/simple/f/${jeton}/page/${n}`);

  useEffect(() => {
    (async () => {
      const [p, sens] = await Promise.all([
        AsyncStorage.getItem(`bl.page.${chemin}`).catch(() => null),
        AsyncStorage.getItem('bl.sens').catch(() => null),
      ]);
      setManga(sens === 'manga');
      try {
        const r = await api<{ pages: number }>(`/api/simple/f/${jeton}/pages`);
        depart.current = Math.min(Number(p) || 0, r.pages - 1);
        setPage(depart.current);
        setTotal(r.pages);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, [jeton, chemin]);

  // Reprise + préchargement des planches suivantes
  useEffect(() => {
    if (total == null) return;
    AsyncStorage.setItem(`bl.page.${chemin}`, String(page)).catch(() => {});
    AsyncStorage.setItem(`bl.pos.${chemin}`, `p. ${page + 1}/${total}`).catch(() => {});
    Image.prefetch([1, 2, 3].map((d) => page + d).filter((n) => n < total).map(url)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, total]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const v = viewableItems[0];
    if (v?.index != null) setPage(v.index);
  }).current;

  const aller = useCallback(
    (n: number) => {
      if (total == null) return;
      const k = Math.max(0, Math.min(total - 1, n));
      liste.current?.scrollToIndex({ index: k, animated: true });
      setPage(k);
    },
    [total]
  );

  if (error)
    return (
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + 40 }}>
        <Empty icon="alert-circle-outline" text={error}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: C.accent, fontWeight: '800' }}>Retour</Text>
          </Pressable>
        </Empty>
      </View>
    );
  if (total == null) return <View style={{ flex: 1, backgroundColor: '#000' }}><Spinner style={{ marginTop: 200 }} /></View>;

  const pages = Array.from({ length: total }, (_, i) => i);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden={!chrome} style="light" />
      <FlatList
        ref={liste}
        data={pages}
        horizontal
        pagingEnabled
        inverted={manga}
        initialScrollIndex={depart.current}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(i) => String(i)}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        windowSize={5}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width, height }}
            contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => setChrome((c) => !c)} style={{ width, height }}>
              <Image source={url(item)} style={{ width, height }} contentFit="contain" cachePolicy="disk" transition={100} />
            </Pressable>
          </ScrollView>
        )}
      />
      {chrome ? (
        <>
          <View style={[st.top, { paddingTop: insets.top + 4 }]}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={st.round}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Text style={st.title} numberOfLines={1}>
              {titre}
            </Text>
            <Pressable
              onPress={() => {
                const v = !manga;
                setManga(v);
                AsyncStorage.setItem('bl.sens', v ? 'manga' : 'bd').catch(() => {});
              }}
              hitSlop={10}
              style={[st.pill, manga && { backgroundColor: '#fff' }]}>
              <Text style={[st.pillText, manga && { color: '#000' }]}>{manga ? 'Sens manga' : 'Sens BD'}</Text>
            </Pressable>
          </View>
          <View style={[st.bottom, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable onPress={() => aller(page - 1)} hitSlop={10}><Ionicons name="chevron-back-circle" size={34} color="#fff" /></Pressable>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={st.count}>{page + 1} / {total}</Text>
              <View style={st.bar}><View style={[st.fill, { width: `${((page + 1) / total) * 100}%` }]} /></View>
            </View>
            <Pressable onPress={() => aller(page + 1)} hitSlop={10}><Ionicons name="chevron-forward-circle" size={34} color="#fff" /></Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.65)' },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontWeight: '700', fontSize: 15, flex: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)' },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.65)' },
  count: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: C.accent },
});
