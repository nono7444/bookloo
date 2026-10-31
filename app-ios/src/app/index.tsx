// Démarrage : adresse du serveur, puis connexion, puis les onglets.
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Spinner } from '@/components/ui';
import { session } from '@/lib/api';
import { useServer } from '@/lib/server';
import { C } from '@/lib/theme';

export default function Index() {
  const { ready, url } = useServer();
  useEffect(() => {
    if (!ready) return;
    if (!url) {
      router.replace('/setup');
      return;
    }
    session().then((s) => router.replace(s ? '/(tabs)' : '/login'));
  }, [ready, url]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Spinner style={{ marginTop: 200 }} />
    </View>
  );
}
