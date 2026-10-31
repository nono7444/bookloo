// Réglage de l'adresse du serveur Bookloo (premier lancement, ou depuis les Réglages).
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkServer, normalizeUrl, useServer } from '@/lib/server';
import { C } from '@/lib/theme';

export default function Setup() {
  const { url, setUrl, bumpAuth } = useServer();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const u = normalizeUrl(value);
    if (!u) return setError('Entre l’adresse de ton serveur Bookloo.');
    if (!u.startsWith('https://')) return setError('Bookloo demande une adresse en https:// (sinon la connexion échoue).');
    setBusy(true);
    setError(null);
    try {
      await checkServer(u);
      await setUrl(u);
      bumpAuth();
      router.replace('/login');
    } catch (e: any) {
      setError(e?.name === 'AbortError' ? 'Pas de réponse : vérifie l’adresse.' : e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[styles.wrap, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }]}>
        <Image source={require('../../assets/icon.png')} style={styles.icon} />
        <Text style={styles.h1}>Bookloo</Text>
        <Text style={styles.sub}>Livres, BD, mangas, comics et livres audio, depuis ton serveur.</Text>
        <Text style={styles.label}>Adresse du serveur</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="https://bookloo.wawanono.lol"
          placeholderTextColor={C.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={save}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={save} disabled={busy} style={({ pressed }) => [styles.btn, (pressed || busy) && { opacity: 0.75 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Continuer</Text>}
        </Pressable>
        {url ? (
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ alignSelf: 'center', marginTop: 16 }}>
            <Text style={{ color: C.textDim, fontSize: 15 }}>Annuler</Text>
          </Pressable>
        ) : null}
        <Text style={styles.foot}>Ensuite, connecte-toi avec ton compte Bookloo.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24 },
  icon: { width: 88, height: 88, borderRadius: 22, alignSelf: 'center', marginBottom: 18 },
  h1: { color: C.text, fontSize: 34, fontWeight: '900', textAlign: 'center', letterSpacing: -0.8 },
  sub: { color: C.textDim, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 36 },
  label: { color: C.textDim, fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { backgroundColor: C.surfaceHigh, color: C.text, fontSize: 17, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  error: { color: C.danger, fontSize: 14, marginTop: 10 },
  btn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  btnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  foot: { color: C.textFaint, fontSize: 13, textAlign: 'center', marginTop: 'auto' },
});
