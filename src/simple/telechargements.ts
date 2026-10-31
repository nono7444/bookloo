// Téléchargements vers les disques du serveur : AllDebrid récupère la release, Bookloo
// écrit les fichiers dans le dossier choisi. Un seul téléchargement à la fois.
//
// Les clés (AllDebrid, lien du .torrent) ne vivent QUE dans la mémoire du travail en cours :
// le fichier d'état ne garde que ce qui s'affiche.

import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { cheminEtat } from '../core/sqlite';
import { tracer } from '../core/journal';
import { service } from '../debrid';
import { etatMagnet } from '../debrid/alldebrid';
import { resoudreDdl } from '../debrid/ddl';
import { ouvreurDdl } from '../sources/ddl/ouvreurs';
import { cheminSur, nomPropre, type Choix } from './disques';

export type EtatTravail = 'attente' | 'debrideur' | 'telechargement' | 'termine' | 'erreur' | 'annule';

export interface Travail {
  id: string;
  userId: number;
  titre: string;
  cle: string;
  source: string;
  dossier: Choix;
  etat: EtatTravail;
  message: string;
  recu: number;
  total: number;
  fichiers: number;
  faits: number;
  cree: string;
  fini?: string;
  /** Dossier (relatif à la racine) où les fichiers ont été écrits */
  destination?: string;
}

interface Secrets { ad: string; torrentUrl?: string }

const FICHIER = cheminEtat('bookloo-telechargements.json');
const travaux: Travail[] = charger();
const secrets = new Map<string, Secrets>();
const controleurs = new Map<string, AbortController>();
let enCours = false;

function charger(): Travail[] {
  try {
    const liste = JSON.parse(fs.readFileSync(FICHIER, 'utf8')) as Travail[];
    // Un redémarrage coupe les téléchargements en cours : on le dit plutôt que de les laisser « en cours ».
    for (const t of liste) {
      if (['attente', 'debrideur', 'telechargement'].includes(t.etat)) {
        t.etat = 'erreur';
        t.message = 'Interrompu par un redémarrage du serveur : relance-le depuis la recherche.';
      }
    }
    return liste;
  } catch {
    return [];
  }
}

let sauvegardePrevue: NodeJS.Timeout | null = null;
function sauvegarder(): void {
  if (sauvegardePrevue) return;
  sauvegardePrevue = setTimeout(() => {
    sauvegardePrevue = null;
    try {
      fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
      fs.writeFileSync(FICHIER, JSON.stringify(travaux.slice(0, 300), null, 1));
    } catch (e) {
      tracer('Téléchargements', `état non enregistré (${(e as Error).message})`);
    }
  }, 1000);
  sauvegardePrevue.unref();
}

export function travauxDe(userId: number): Travail[] {
  return travaux.filter((t) => t.userId === userId);
}

export function ajouter(
  userId: number,
  demande: { titre: string; cle: string; source: string; dossier: Choix },
  s: Secrets,
): Travail {
  const t: Travail = {
    id: crypto.randomUUID(),
    userId,
    titre: demande.titre,
    cle: demande.cle,
    source: demande.source,
    dossier: demande.dossier,
    etat: 'attente',
    message: 'En attente',
    recu: 0,
    total: 0,
    fichiers: 0,
    faits: 0,
    cree: new Date().toISOString(),
  };
  travaux.unshift(t);
  secrets.set(t.id, s);
  sauvegarder();
  void suivant();
  return t;
}

export function annuler(userId: number, id: string): boolean {
  const t = travaux.find((x) => x.id === id && x.userId === userId);
  if (!t) return false;
  if (['attente', 'debrideur', 'telechargement'].includes(t.etat)) {
    t.etat = 'annule';
    t.message = 'Annulé';
    t.fini = new Date().toISOString();
    controleurs.get(id)?.abort();
    secrets.delete(id);
  } else {
    // Terminé ou en erreur : on le retire de la liste (les fichiers restent sur le disque)
    travaux.splice(travaux.indexOf(t), 1);
  }
  sauvegarder();
  return true;
}

async function suivant(): Promise<void> {
  if (enCours) return;
  const t = [...travaux].reverse().find((x) => x.etat === 'attente');
  if (!t) return;
  enCours = true;
  const ctrl = new AbortController();
  controleurs.set(t.id, ctrl);
  try {
    await executer(t, ctrl.signal);
    if (t.etat !== 'annule') {
      t.etat = 'termine';
      t.message = t.fichiers > 1 ? `${t.fichiers} fichiers téléchargés` : 'Téléchargé';
    }
  } catch (e) {
    if (t.etat !== 'annule') {
      t.etat = 'erreur';
      t.message = (e as Error).message || 'Échec du téléchargement';
      tracer('Téléchargements', `échec « ${t.titre} » : ${t.message}`);
    }
  } finally {
    t.fini = new Date().toISOString();
    controleurs.delete(t.id);
    secrets.delete(t.id);
    enCours = false;
    sauvegarder();
    void suivant();
  }
}

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((ok, ko) => {
    const m = setTimeout(ok, ms);
    signal.addEventListener('abort', () => { clearTimeout(m); ko(new Error('Annulé')); }, { once: true });
  });

/** Les fichiers à écrire : nom + lien direct. */
async function liensDuTravail(t: Travail, s: Secrets, signal: AbortSignal): Promise<{ nom: string; url: string; taille?: number }[]> {
  // Lien direct (Wawacity) : un fichier, disponible chez plusieurs hébergeurs
  const ddl = /^ddl:([a-z0-9-]+):([A-Za-z0-9_-]+)$/.exec(t.cle);
  if (ddl) {
    const ouvreur = ouvreurDdl(ddl[1]);
    if (!ouvreur) throw new Error(`Source « ${ddl[1]} » inconnue`);
    t.message = 'Ouverture de la fiche…';
    const liens = await ouvreur(ddl[2], signal);
    if (!liens?.length) throw new Error('La fiche ne donne aucun lien');
    t.message = 'AllDebrid débloque le lien…';
    for (const l of liens) {
      const url = await resoudreDdl(l.url, 'alldebrid', s.ad, signal);
      if (url) return [{ nom: l.nomFichier || t.titre, url, taille: l.taille }];
    }
    throw new Error('AllDebrid n’a pu ouvrir aucun lien de cette fiche');
  }

  // Torrent : déposé chez AllDebrid, qui le télécharge (instantané s'il est en cache)
  const hash = t.cle.toLowerCase();
  const svc = service('alldebrid', s.ad);
  t.etat = 'debrideur';
  t.message = 'Envoi à AllDebrid…';
  const id = (await svc.trouver(hash, signal)) || (await svc.deposer(hash, s.torrentUrl, signal));
  if (!id) throw new Error('AllDebrid a refusé le torrent');
  const debut = Date.now();
  for (;;) {
    const e = await etatMagnet(s.ad, id, signal);
    if (e?.pret) break;
    if (e && e.code !== null && e.code >= 5) throw new Error(`AllDebrid : ${e.statut || 'erreur'}`);
    if (e && e.taille > 0) {
      t.total = e.taille;
      t.recu = e.recu;
      t.message = `AllDebrid télécharge le torrent… ${Math.floor((e.recu / e.taille) * 100)} %`;
    } else t.message = 'AllDebrid prépare le torrent…';
    sauvegarder();
    if (Date.now() - debut > 6 * 3600_000) throw new Error('AllDebrid n’a pas fini en 6 heures');
    await pause(10_000, signal);
  }
  const fichiers = await svc.listerFichiers(id, signal);
  if (!fichiers.length) throw new Error('AllDebrid ne donne aucun fichier');
  const out: { nom: string; url: string; taille?: number }[] = [];
  t.message = 'Préparation des liens…';
  for (const f of fichiers) {
    if (f.id === undefined) continue;
    const url = await svc.lienFichier(id, f.id, signal);
    if (url) out.push({ nom: f.nom, url, taille: f.taille });
  }
  if (!out.length) throw new Error('AllDebrid n’a débloqué aucun fichier');
  return out;
}

/** Nom libre dans ce dossier : « nom (2).cbz » si « nom.cbz » existe déjà. */
function nomLibre(dossier: string, nom: string): string {
  const ext = path.extname(nom);
  const base = nom.slice(0, nom.length - ext.length);
  let n = 1;
  let essai = nom;
  while (fs.existsSync(path.join(dossier, essai))) essai = `${base} (${++n})${ext}`;
  return essai;
}

async function executer(t: Travail, signal: AbortSignal): Promise<void> {
  const s = secrets.get(t.id);
  if (!s) throw new Error('Clé AllDebrid perdue : relance le téléchargement');
  const { complet: base } = cheminSur(t.dossier.racine, t.dossier.chemin);

  const fichiers = await liensDuTravail(t, s, signal);
  t.fichiers = fichiers.length;
  t.faits = 0;
  t.total = fichiers.reduce((a, f) => a + (f.taille ?? 0), 0);
  t.recu = 0;

  // Plusieurs fichiers (un pack) : rangés dans un dossier au nom de la release
  let destination = base;
  let relatif = t.dossier.chemin || '';
  if (fichiers.length > 1) {
    const sous = nomPropre(t.titre);
    destination = path.join(base, sous);
    relatif = path.join(relatif, sous);
  }
  await fs.promises.mkdir(destination, { recursive: true });
  t.destination = relatif;
  t.etat = 'telechargement';

  let dejaRecu = 0;
  for (const f of fichiers) {
    const nom = nomLibre(destination, nomPropre(path.basename(f.nom.replace(/\\/g, '/'))));
    t.message = fichiers.length > 1 ? `Fichier ${t.faits + 1} sur ${fichiers.length} : ${nom}` : nom;
    sauvegarder();
    const rep = await fetch(f.url, { signal, redirect: 'follow' });
    if (!rep.ok || !rep.body) throw new Error(`Le lien a répondu ${rep.status}`);
    const taille = Number(rep.headers.get('content-length') || 0);
    if (!f.taille && taille) t.total += taille;
    const partiel = path.join(destination, `${nom}.part`);
    let recu = 0;
    const compteur = new Transform({
      transform(morceau: Buffer, _enc, fin) {
        recu += morceau.length;
        t.recu = dejaRecu + recu;
        fin(null, morceau);
      },
    });
    try {
      await pipeline(Readable.fromWeb(rep.body as never), compteur, fs.createWriteStream(partiel), { signal });
    } catch (e) {
      await fs.promises.rm(partiel, { force: true });
      throw e;
    }
    await fs.promises.rename(partiel, path.join(destination, nom));
    dejaRecu += recu;
    t.faits++;
  }
  t.recu = t.total = Math.max(t.total, dejaRecu);
}
