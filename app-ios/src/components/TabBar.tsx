// Barre d'onglets flottante en verre, comme Lumio (Liquid Glass sur iOS 26, flou avant).
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type Tabs } from 'expo-router';
import { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useServer } from '@/lib/server';
import { C } from '@/lib/theme';

const liquid = isLiquidGlassAvailable();

export const TAB_ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  index: ['search-outline', 'search'],
  bibliotheque: ['library-outline', 'library'],
  reglages: ['settings-outline', 'settings'],
};

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { immersive } = useServer();
  if (immersive) return null; // lecture plein écran

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 10) }]}>
      <View style={styles.bar}>
        {liquid ? (
          <GlassView glassEffectStyle="regular" colorScheme="dark" tintColor="rgba(20,20,22,0.35)" style={StyleSheet.absoluteFill} />
        ) : (
          <>
            <BlurView tint="systemThickMaterialDark" intensity={80} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,20,0.55)' }]} />
          </>
        )}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const label = descriptors[route.key].options.title ?? route.name;
          const [off, on] = TAB_ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={styles.item}>
              <View style={[styles.pill, focused && styles.pillOn]}>
                <Ionicons name={focused ? on : off} size={22} color={focused ? C.text : C.textDim} />
              </View>
              <Text style={[styles.label, focused && { color: C.text }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 360,
    borderRadius: 32,
    overflow: 'hidden',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  pill: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 },
  pillOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  label: { color: C.textDim, fontSize: 10.5, fontWeight: '600' },
});
