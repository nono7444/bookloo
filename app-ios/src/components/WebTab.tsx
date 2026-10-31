// Onglet = une page du serveur. Toucher l'onglet déjà ouvert ramène à sa page de départ.
import { useIsFocused, useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef } from 'react';

import { BookWeb, type BookWebHandle } from '@/components/BookWeb';

export function WebTab({ path }: { path: string }) {
  const nav = useNavigation();
  const focused = useIsFocused();
  const web = useRef<BookWebHandle>(null);
  useEffect(
    () =>
      (nav as any).addListener('tabPress', () => {
        if (nav.isFocused()) web.current?.home();
      }),
    [nav],
  );
  return <BookWeb ref={web} path={path} focused={focused} />;
}
