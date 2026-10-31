import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ServerProvider } from '@/lib/server';
import { C } from '@/lib/theme';

SystemUI.setBackgroundColorAsync(C.bg).catch(() => {});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ServerProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
          <Stack.Screen name="login" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="dossier" />
          <Stack.Screen name="cles" />
          <Stack.Screen name="lecteur/bd" options={{ animation: 'fade' }} />
          <Stack.Screen name="lecteur/epub" options={{ animation: 'fade' }} />
          <Stack.Screen name="lecteur/pdf" options={{ animation: 'fade' }} />
          <Stack.Screen name="lecteur/audio" options={{ presentation: 'modal' }} />
        </Stack>
      </ServerProvider>
    </SafeAreaProvider>
  );
}
