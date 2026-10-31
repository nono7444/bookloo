// Disques du serveur et dossier de téléchargement choisi par chaque compte (comme dans Lumio).
//
// Les disques viennent de BOOKLOO_DISQUES : « nom:/chemin,nom2:/chemin2 » (chemins VUS DU
// CONTENEUR, montés dans le docker-compose). Aucun chemin ne sort de ces racines.

import fs from 'node:fs';
import path from 'node:path';
import { cheminEtat } from '../core/sqlite';

export interface Disque { nom: string; dir: string }
export interface Choix { racine: string; chemin: string }

export class ErreurDisque extends Error {
  constructor(public code: number, message: string) { super(message); }
}

export function disques(): Disque[] {
  const brut = process.env.BOOKLOO_DISQUES || '';
  return brut
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf(':');
      const nom = i > 0 ? x.slice(0, i) : path.basename(x);
      const dir = path.resolve(i > 0 ? x.slice(i + 1) : x);
      return { nom, dir };
    })
    .filter((d) => fs.existsSync(d.dir));
}

/** Chemin absolu dans une racine, ou une erreur : jamais de sortie par « .. ». */
export function cheminSur(racine: string, rel: string): { disque: Disque; complet: string } {
  const disque = disques().find((d) => d.nom === racine);
  if (!disque) throw new ErreurDisque(404, 'disque inconnu');
  const complet = path.resolve(disque.dir, '.' + path.sep + String(rel || '').replace(/^\/+/, ''));
  if (complet !== disque.dir && !complet.startsWith(disque.dir + path.sep)) {
    throw new ErreurDisque(400, 'chemin interdit');
  }
  return { disque, complet };
}

export async function infoDisque(d: Disque): Promise<{ nom: string; libre: number | null; total: number | null }> {
  try {
    const st = await fs.promises.statfs(d.dir);
    return { nom: d.nom, libre: st.bavail * st.bsize, total: st.blocks * st.bsize };
  } catch {
    return { nom: d.nom, libre: null, total: null };
  }
}

/** Sous-dossiers d'un dossier (les fichiers sont comptés, pas listés). */
export async function listerDossiers(racine: string, rel: string) {
  const { complet } = cheminSur(racine, rel);
  const entrees = await fs.promises.readdir(complet, { withFileTypes: true });
  const dossiers = entrees
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
  const fichiers = entrees.filter((e) => e.isFile() && !e.name.startsWith('.')).length;
  return { dossiers, fichiers };
}

/** Nom de dossier ou de fichier sans caractère gênant. */
export function nomPropre(nom: string): string {
  return String(nom)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 180) || 'sans nom';
}

export async function creerDossier(racine: string, rel: string, nom: string): Promise<string> {
  const propre = nomPropre(nom);
  const cible = path.join(String(rel || ''), propre);
  const { complet } = cheminSur(racine, cible);
  await fs.promises.mkdir(complet, { recursive: true });
  return cible;
}

// ——— Dossier choisi, par compte ———

const FICHIER_CHOIX = cheminEtat('bookloo-dossiers.json');

function lireChoix(): Record<string, Choix> {
  try {
    return JSON.parse(fs.readFileSync(FICHIER_CHOIX, 'utf8')) as Record<string, Choix>;
  } catch {
    return {};
  }
}

export function choixDe(userId: number): Choix | null {
  const c = lireChoix()[String(userId)];
  if (!c) return null;
  try {
    cheminSur(c.racine, c.chemin);
    return c;
  } catch {
    return null;
  }
}

export function poserChoix(userId: number, c: Choix): void {
  cheminSur(c.racine, c.chemin); // vérifie la racine et le chemin
  const tout = lireChoix();
  tout[String(userId)] = { racine: c.racine, chemin: String(c.chemin || '') };
  fs.mkdirSync(path.dirname(FICHIER_CHOIX), { recursive: true });
  fs.writeFileSync(FICHIER_CHOIX, JSON.stringify(tout, null, 2));
}
