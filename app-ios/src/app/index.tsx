// Premier lancement : réglage de l'adresse du serveur ; ensuite, directement les onglets.
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useServer } from '@/lib/server';
import { C } from '@/lib/theme';

export default function Index() {
  const { ready, url } = useServer();
  if (!ready)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.text} />
      </View>
    );
  return <Redirect href={url ? '/(tabs)' : '/setup'} />;
}
