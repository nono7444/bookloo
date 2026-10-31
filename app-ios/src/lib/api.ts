// Appels au serveur Bookloo depuis l'appli (session par cookie, jeton anti-CSRF demandé au serveur).
let base = '';
let csrf: string | null = null;

export class AuthError extends Error {}

export function setBase(url: string | null) {
  base = (url ?? '').replace(/\/+$/, '');
  csrf = null;
}
export const serverUrl = () => base;

/** Adresse complète d'un chemin du serveur (images, lecteurs). */
export const full = (path: string) => `${base}${path}`;

async function jeton(): Promise<string> {
  if (csrf) return csrf;
  const r = await fetch(full('/api/simple/session'), { credentials: 'include' });
  if (r.status === 401) throw new AuthError('connexion requise');
  const j = await r.json();
  csrf = j.csrf as string;
  return csrf;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF'] = await jeton();
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  try {
    const r = await fetch(full(path), {
      method,
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
    if (r.status === 401) {
      csrf = null;
      throw new AuthError('connexion requise');
    }
    const text = await r.text();
    const data = text ? JSON.parse(text) : {};
    if (r.status === 403 && /csrf/i.test(data?.erreur ?? '')) csrf = null;
    if (!r.ok) throw new Error(data?.erreur || `Le serveur a répondu ${r.status}`);
    return data as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Le serveur ne répond pas.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function login(user: string, password: string) {
  csrf = null;
  const r = await fetch(full('/api/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ login: user, motDePasse: password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.erreur || `Connexion refusée (${r.status})`);
  return data as { login: string; role: string };
}

export async function logout() {
  await fetch(full('/api/logout'), { method: 'POST', credentials: 'include' }).catch(() => {});
  csrf = null;
}

export async function session(): Promise<{ userId: number; role: string } | null> {
  try {
    const r = await fetch(full('/api/simple/session'), { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    csrf = j.csrf;
    return j;
  } catch {
    return null;
  }
}

// ——— Types ———
export type Resultat = {
  cle: string;
  titre: string;
  source: string;
  taille?: number;
  seeders?: number;
  format: string;
  genre: 'tome' | 'pack' | 'livre';
  tome?: number;
  plage?: string;
  torrent: boolean;
  certain: boolean;
  cache?: 'en-cache' | 'absent' | 'inconnu';
};
export type EtatSource = { id: string; label: string; etat: string; n: number };
export type Travail = {
  id: string;
  titre: string;
  etat: 'attente' | 'debrideur' | 'telechargement' | 'termine' | 'erreur' | 'annule';
  message: string;
  recu: number;
  total: number;
  fichiers: number;
  faits: number;
  dossier: { racine: string; chemin: string };
  destination?: string;
};
export type Livre = {
  nom: string;
  titre: string;
  dossier: string;
  chemin: string;
  format: 'bd' | 'epub' | 'pdf' | 'audio';
  taille: number;
  modifie: string;
  jeton: string;
};
export type Choix = { racine: string; chemin: string };

export function octets(n?: number) {
  if (!n) return '';
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1).replace('.', ',')} ${u[i]}`;
}
