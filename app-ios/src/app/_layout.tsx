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
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="web" />
        </Stack>
      </ServerProvider>
    </SafeAreaProvider>
  );
}
