import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { C } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Recherche' }} />
      <Tabs.Screen name="bibliotheque" options={{ title: 'Bibliothèque' }} />
      <Tabs.Screen name="reglages" options={{ title: 'Réglages' }} />
    </Tabs>
  );
}
