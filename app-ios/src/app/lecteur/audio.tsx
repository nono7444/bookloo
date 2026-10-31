// Lecteur de livres audio : lecture en arrière-plan, ±30 s, vitesse, reprise automatique.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { full } from '@/lib/api';
import { C } from '@/lib/theme';

const VITESSES = [1, 1.25, 1.5, 1.75, 2, 0.8];
const temps = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};

export default function LecteurAudio() {
  const { jeton, titre, chemin } = useLocalSearchParams<{ jeton: string; titre: string; chemin: string }>();
  const insets = useSafeAreaInsets();
  const player = useAudioPlayer({ uri: full(`/api/simple/f/${jeton}/fichier`) });
  const status = useAudioPlayerStatus(player);
  const [vitesse, setVitesse] = useState(1);
  const repris = useRef(false);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
  }, []);

  // Reprise là où on s'était arrêté
  useEffect(() => {
    if (!status.isLoaded || repris.current) return;
    repris.current = true;
    AsyncStorage.getItem(`bl.audio.${chemin}`)
      .then((v) => {
        const s = Number(v) || 0;
        if (s > 5) player.seekTo(s).catch(() => {});
        player.play();
      })
      .catch(() => player.play());
  }, [status.isLoaded, chemin, player]);

  useEffect(() => {
    if (!status.isLoaded || !status.currentTime) return;
    AsyncStorage.setItem(`bl.audio.${chemin}`, String(Math.floor(status.currentTime))).catch(() => {});
    AsyncStorage.setItem(`bl.pos.${chemin}`, temps(status.currentTime)).catch(() => {});
  }, [Math.floor((status.currentTime || 0) / 10)]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = status.duration ? status.currentTime / status.duration : 0;

  return (
    <View style={[st.wrap, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={st.grip} />
      <Pressable onPress={() => router.back()} hitSlop={10} style={{ alignSelf: 'flex-start' }}>
        <Ionicons name="chevron-down" size={28} color={C.text} />
      </Pressable>
      <View style={st.cover}>
        <Image source={require('../../../assets/icon.png')} style={{ width: 200, height: 200, borderRadius: 30 }} />
      </View>
      <Text style={st.title} numberOfLines={3}>{titre}</Text>
      <View style={st.bar}>
        <View style={[st.fill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={st.times}>
        <Text style={st.time}>{temps(status.currentTime)}</Text>
        <Text style={st.time}>-{temps((status.duration || 0) - (status.currentTime || 0))}</Text>
      </View>
      <View style={st.controls}>
        <Pressable onPress={() => player.seekTo(Math.max(0, status.currentTime - 30))} hitSlop={10}>
          <Ionicons name="play-back" size={34} color={C.text} />
          <Text style={st.skip}>30 s</Text>
        </Pressable>
        <Pressable onPress={() => (status.playing ? player.pause() : player.play())} style={st.play}>
          {!status.isLoaded ? <Text style={{ color: '#000', fontWeight: '800' }}>…</Text> : <Ionicons name={status.playing ? 'pause' : 'play'} size={40} color="#000" />}
        </Pressable>
        <Pressable onPress={() => player.seekTo(Math.min(status.duration || 0, status.currentTime + 30))} hitSlop={10}>
          <Ionicons name="play-forward" size={34} color={C.text} />
          <Text style={st.skip}>30 s</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() => {
          const v = VITESSES[(VITESSES.indexOf(vitesse) + 1) % VITESSES.length];
          setVitesse(v);
          player.setPlaybackRate(v);
        }}
        style={st.speed}>
        <Text style={{ color: C.text, fontWeight: '800' }}>Vitesse ×{String(vitesse).replace('.', ',')}</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#121214', paddingHorizontal: 24 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 6 },
  cover: { alignItems: 'center', marginTop: 30, marginBottom: 30 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 34, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: C.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  time: { color: C.textDim, fontSize: 13 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 34 },
  skip: { color: C.textDim, fontSize: 11, textAlign: 'center' },
  play: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  speed: { alignSelf: 'center', marginTop: 34, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: C.surfaceHigh },
});
