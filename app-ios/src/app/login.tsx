// Connexion à Bookloo (compte créé par l'administrateur).
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { login } from '@/lib/api';
import { useServer } from '@/lib/server';
import { C } from '@/lib/theme';

export default function Login() {
  const insets = useSafeAreaInsets();
  const { url } = useServer();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    if (!user || !pass || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(user.trim(), pass);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.wrap, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }]}>
        <Image source={require('../../assets/icon.png')} style={st.icon} />
        <Text style={st.h1}>Connexion</Text>
        <Text style={st.sub} numberOfLines={1}>{url}</Text>
        <TextInput value={user} onChangeText={setUser} placeholder="Identifiant" placeholderTextColor={C.textFaint} autoCapitalize="none" autoCorrect={false} textContentType="username" style={st.input} returnKeyType="next" />
        <TextInput value={pass} onChangeText={setPass} placeholder="Mot de passe" placeholderTextColor={C.textFaint} secureTextEntry textContentType="password" style={st.input} returnKeyType="go" onSubmitEditing={go} />
        {error ? <Text style={st.error}>{error}</Text> : null}
        <View style={{ marginTop: 16 }}>
          <Button title={busy ? 'Connexion…' : 'Se connecter'} onPress={go} disabled={busy || !user || !pass} />
        </View>
        <Pressable onPress={() => router.replace('/setup')} style={{ alignSelf: 'center', marginTop: 18 }} hitSlop={10}>
          <Text style={{ color: C.textDim }}>Changer de serveur</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, gap: 10 },
  icon: { width: 80, height: 80, borderRadius: 20, alignSelf: 'center', marginBottom: 12 },
  h1: { color: C.text, fontSize: 30, fontWeight: '900', textAlign: 'center' },
  sub: { color: C.textDim, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: C.surfaceHigh, color: C.text, fontSize: 17, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  error: { color: C.danger, marginTop: 6 },
});
