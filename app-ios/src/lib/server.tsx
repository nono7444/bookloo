// Adresse du serveur Bookloo (gardée sur l'iPhone) et petit état partagé entre les onglets.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setBase } from './api';

const KEY = 'bookloo.server';

type Ctx = {
  /** Adresse du serveur, sans « / » final (null tant qu'elle n'est pas réglée) */
  url: string | null;
  ready: boolean;
  setUrl: (u: string | null) => Promise<void>;
  /** Change à chaque connexion / déconnexion : les onglets se rechargent */
  authNonce: number;
  bumpAuth: () => void;
  /** Lecture plein écran : la barre d'onglets se cache */
  immersive: boolean;
  setImmersive: (on: boolean) => void;
};

const ServerContext = createContext<Ctx | null>(null);

/** « bookloo.exemple.fr » → « https://bookloo.exemple.fr » */
export function normalizeUrl(raw: string) {
  let u = raw.trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export function ServerProvider({ children }: { children: ReactNode }) {
  const [url, setUrlState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [authNonce, setAuthNonce] = useState(0);
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        setBase(v || null);
        setUrlState(v || null);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setUrl = useCallback(async (u: string | null) => {
    setBase(u);
    setUrlState(u);
    try {
      if (u) await AsyncStorage.setItem(KEY, u);
      else await AsyncStorage.removeItem(KEY);
    } catch {}
  }, []);

  const bumpAuth = useCallback(() => setAuthNonce((n) => n + 1), []);

  const value = useMemo(
    () => ({ url, ready, setUrl, authNonce, bumpAuth, immersive, setImmersive }),
    [url, ready, setUrl, authNonce, bumpAuth, immersive],
  );
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

export function useServer() {
  const c = useContext(ServerContext);
  if (!c) throw new Error('ServerProvider manquant');
  return c;
}

/** Vérifie qu'un serveur Bookloo répond à cette adresse (route /sante). */
export async function checkServer(u: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${u}/sante`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`Le serveur répond ${r.status}`);
    const j = await r.json().catch(() => null);
    if (!j?.ok) throw new Error('Ce n’est pas un serveur Bookloo');
  } finally {
    clearTimeout(t);
  }
}
