// Livres téléchargés sur les disques : liste, et lecture dans l'appli (BD planche par planche,
// EPUB chapitre par chapitre, PDF et livres audio en fichier).
//
// L'appli ouvre ces fichiers par des liens SIGNÉS (valables 24 h, liés au compte) : une image,
// un lecteur PDF ou audio n'envoient pas de cookie, et un lien signé ne donne accès qu'à ce fichier.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { cheminEtat } from '../core/sqlite';
import { tracer } from '../core/journal';
import { exigerConnexion } from '../auth/garde';
import { jetonCsrf } from '../auth/sessions';
import { ouvrirLocal } from '../lecture/precharges';
import { inspecterZip, lireEntree, lireEntrees, estImage, triNaturel, type EntreeZip } from '../lecture/zip';
import { sommaireRar } from '../lecture/rar';
import { cheminOpf, dossierDe, lireOpf, nettoyerChapitre, titreDeChapitre, type LivreEpub } from '../lecture/epub';
import { cheminSur, choixDe, disques } from './disques';

const FORMATS: Record<string, string> = {
  '.cbz': 'bd', '.cbr': 'bd', '.zip': 'bd', '.epub': 'epub', '.pdf': 'pdf',
  '.mp3': 'audio', '.m4b': 'audio', '.m4a': 'audio', '.aac': 'audio', '.ogg': 'audio', '.flac': 'audio',
};
const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf', '.epub': 'application/epub+zip', '.cbz': 'application/vnd.comicbook+zip',
  '.cbr': 'application/vnd.comicbook-rar', '.zip': 'application/zip', '.mp3': 'audio/mpeg', '.m4b': 'audio/mp4',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
};

// ——— Liens signés ———

const FICHIER_SECRET = cheminEtat('bookloo-liens.secret');
const SECRET: Buffer = (() => {
  try {
    const s = fs.readFileSync(FICHIER_SECRET);
    if (s.length >= 32) return s;
  } catch { /* premier démarrage */ }
  const s = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(FICHIER_SECRET), { recursive: true });
    fs.writeFileSync(FICHIER_SECRET, s, { mode: 0o600 });
  } catch { /* liens valables jusqu'au prochain redémarrage seulement */ }
  return s;
})();

interface Lien { u: number; r: string; c: string; e: number }

export function signer(userId: number, racine: string, chemin: string): string {
  const corps = Buffer.from(JSON.stringify({ u: userId, r: racine, c: chemin, e: Date.now() + 24 * 3600_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(corps).digest('base64url');
  return `${corps}.${sig}`;
}

function verifier(jeton: string): { lien: Lien; complet: string } | null {
  const [corps, sig] = String(jeton).split('.');
  if (!corps || !sig) return null;
  const attendu = crypto.createHmac('sha256', SECRET).update(corps).digest('base64url');
  if (sig.length !== attendu.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(attendu))) return null;
  try {
    const lien = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8')) as Lien;
    if (lien.e < Date.now()) return null;
    const { complet } = cheminSur(lien.r, lien.c);
    return { lien, complet };
  } catch {
    return null;
  }
}

// ——— Liste des livres du dossier choisi ———

export interface Livre {
  nom: string;
  titre: string;
  dossier: string;
  chemin: string;
  format: string;
  taille: number;
  modifie: string;
  jeton: string;
}

async function parcourir(base: string, rel: string, profondeur: number, out: { rel: string; nom: string; st: fs.Stats }[]): Promise<void> {
  if (profondeur > 5 || out.length >= 3000) return;
  let entrees: fs.Dirent[] = [];
  try {
    entrees = await fs.promises.readdir(path.join(base, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entrees) {
    if (e.name.startsWith('.')) continue;
    const r = path.join(rel, e.name);
    if (e.isDirectory()) await parcourir(base, r, profondeur + 1, out);
    else if (e.isFile() && FORMATS[path.extname(e.name).toLowerCase()] && !e.name.endsWith('.part')) {
      try { out.push({ rel: r, nom: e.name, st: await fs.promises.stat(path.join(base, r)) }); } catch { /* disparu */ }
    }
  }
}

/** « Jujutsu Kaizen - Tome 05 [CBZ] FR.cbz » → « Jujutsu Kaizen - Tome 05 » */
function titreDe(nom: string): string {
  return nom
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[._]+/g, ' ')
    .replace(/\[[^\]]*\]|\((?:fr|french|vf|cbz|cbr|epub|pdf)[^)]*\)/gi, '')
    .replace(/\b(FRENCH|FR|VF|MULTi|CBZ|CBR|EPUB|PDF|Digital|Webrip|NoTag)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || nom;
}

// ——— Archives ouvertes (gardées quelques minutes) ———

interface Ouvert { lire: (d: number, f: number) => Promise<Buffer>; taille: number; entrees?: EntreeZip[]; pages?: EntreeZip[]; livre?: LivreEpub; titres?: string[]; at: number }
const ouverts = new Map<string, Ouvert>();

async function ouvrir(complet: string): Promise<Ouvert> {
  const o = ouverts.get(complet);
  if (o && Date.now() - o.at < 10 * 60_000) return o;
  const f = await ouvrirLocal(complet);
  const n: Ouvert = { lire: f.lire, taille: f.taille, at: Date.now() };
  ouverts.set(complet, n);
  if (ouverts.size > 20) ouverts.delete(ouverts.keys().next().value!);
  return n;
}

async function pagesDe(complet: string): Promise<EntreeZip[]> {
  const o = await ouvrir(complet);
  if (o.pages) return o.pages;
  const entete = await o.lire(0, 7);
  if (entete.subarray(0, 4).toString('latin1') === 'Rar!') {
    o.pages = (await sommaireRar(o.lire, o.taille)).entrees;
  } else {
    const { images } = await inspecterZip(o.lire, o.taille);
    if (!images.length) throw new Error('Cette archive ne contient aucune image.');
    o.pages = images;
  }
  return o.pages;
}

async function epubDe(complet: string): Promise<Ouvert & { livre: LivreEpub; entrees: EntreeZip[] }> {
  const o = await ouvrir(complet);
  if (o.livre && o.entrees) return o as Ouvert & { livre: LivreEpub; entrees: EntreeZip[] };
  const entrees = await lireEntrees(o.lire, o.taille);
  const par = (n: string) => entrees.find((e) => e.nom === n);
  const container = par('META-INF/container.xml');
  if (!container) throw new Error('Ce fichier n’est pas un EPUB.');
  const chemin = cheminOpf((await lireEntree(o.lire, container)).toString('utf-8'));
  const opf = chemin ? par(chemin) : undefined;
  if (!chemin || !opf) throw new Error('Ce livre n’a pas de manifeste lisible.');
  const livre = lireOpf((await lireEntree(o.lire, opf)).toString('utf-8'), dossierDe(chemin));
  if (!livre?.chapitres.length) throw new Error('Ce livre ne déclare aucun chapitre.');
  o.livre = livre;
  o.entrees = entrees;
  return o as Ouvert & { livre: LivreEpub; entrees: EntreeZip[] };
}

const TYPE_IMAGE: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
};
const typeImage = (nom: string) => TYPE_IMAGE[(nom.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function routesLivres(): Router {
  const r = Router();

  // Session de l'appli : le jeton anti-CSRF (l'appli ne lit pas les cookies)
  r.get('/api/simple/session', exigerConnexion, (req, res) => {
    res.json({ userId: req.session!.userId, role: req.session!.role, csrf: jetonCsrf(req.session!.id) });
  });

  // Livres du dossier de téléchargement (et de ses sous-dossiers)
  r.get('/api/simple/livres', exigerConnexion, async (req, res) => {
    const userId = req.session!.userId;
    const choix = choixDe(userId);
    if (!choix) { res.json({ livres: [], dossier: null }); return; }
    const { complet } = cheminSur(choix.racine, choix.chemin);
    const trouves: { rel: string; nom: string; st: fs.Stats }[] = [];
    await parcourir(complet, '', 0, trouves);
    const livres: Livre[] = trouves
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)
      .map((f) => {
        const chemin = path.join(choix.chemin || '', f.rel);
        return {
          nom: f.nom,
          titre: titreDe(f.nom),
          dossier: path.dirname(f.rel) === '.' ? '' : path.dirname(f.rel),
          chemin,
          format: FORMATS[path.extname(f.nom).toLowerCase()],
          taille: f.st.size,
          modifie: f.st.mtime.toISOString(),
          jeton: signer(userId, choix.racine, chemin),
        };
      });
    res.json({ livres, dossier: choix, disques: disques().length });
  });

  // Supprimer un livre du disque
  r.post('/api/simple/livres/supprimer', exigerConnexion, async (req, res) => {
    const v = verifier(String(req.body?.jeton ?? ''));
    if (!v || v.lien.u !== req.session!.userId) { res.status(403).json({ erreur: 'lien invalide' }); return; }
    try {
      await fs.promises.rm(v.complet, { force: true });
      ouverts.delete(v.complet);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ erreur: (e as Error).message });
    }
  });

  // ——— Lecture par lien signé (sans cookie) ———
  const lien = (req: import('express').Request, res: import('express').Response) => {
    const v = verifier(String(req.params.jeton));
    if (!v) { res.status(403).json({ erreur: 'lien expiré : rouvre le livre depuis la bibliothèque' }); return null; }
    return v;
  };

  r.get('/api/simple/f/:jeton/fichier', (req, res) => {
    const v = lien(req, res);
    if (!v) return;
    const ext = path.extname(v.complet).toLowerCase();
    res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(path.basename(v.complet))}`);
    res.sendFile(v.complet, { acceptRanges: true, dotfiles: 'allow', headers: { 'Cache-Control': 'private, max-age=3600' } });
  });

  r.get('/api/simple/f/:jeton/pages', async (req, res) => {
    const v = lien(req, res);
    if (!v) return;
    try {
      const pages = await pagesDe(v.complet);
      res.json({ titre: titreDe(path.basename(v.complet)), pages: pages.length });
    } catch (e) {
      res.status(422).json({ erreur: (e as Error).message });
    }
  });

  r.get('/api/simple/f/:jeton/page/:n', async (req, res) => {
    const v = lien(req, res);
    if (!v) return;
    try {
      const pages = await pagesDe(v.complet);
      const p = pages[Number(req.params.n)];
      if (!p) { res.status(404).json({ erreur: 'page absente' }); return; }
      const o = await ouvrir(v.complet);
      res.setHeader('Content-Type', typeImage(p.nom));
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(await lireEntree(o.lire, p));
    } catch (e) {
      tracer('Livres', `page illisible : ${(e as Error).message}`);
      res.status(422).json({ erreur: (e as Error).message });
    }
  });

  r.get('/api/simple/f/:jeton/epub', async (req, res) => {
    const v = lien(req, res);
    if (!v) return;
    try {
      const o = await epubDe(v.complet);
      if (!o.titres) {
        const titres: string[] = [];
        for (const [i, c] of o.livre.chapitres.entries()) {
          const e = o.entrees.find((x) => x.nom === c.chemin);
          let t: string | null = null;
          if (e) { try { t = titreDeChapitre((await lireEntree(o.lire, e)).toString('utf-8')); } catch { t = null; } }
          titres.push(t ?? `Chapitre ${i + 1}`);
        }
        o.titres = titres;
      }
      res.json({ titre: o.livre.titre ?? titreDe(path.basename(v.complet)), auteur: o.livre.auteur, chapitres: o.titres });
    } catch (e) {
      res.status(422).json({ erreur: (e as Error).message });
    }
  });

  // Un chapitre, en page HTML prête à afficher (style de lecture dans /b-liseuse.css)
  r.get('/api/simple/f/:jeton/epub/:n', async (req, res) => {
    const v = lien(req, res);
    if (!v) return;
    try {
      const o = await epubDe(v.complet);
      const n = Number(req.params.n);
      const c = o.livre.chapitres[n];
      const e = c && o.entrees.find((x) => x.nom === c.chemin);
      if (!e) { res.status(404).send('Chapitre absent'); return; }
      const base = dossierDe(c.chemin);
      const brut = (await lireEntree(o.lire, e)).toString('utf-8');
      const html = nettoyerChapitre(brut, (src) => {
        const cible = path.posix.normalize(src.startsWith('/') ? src.slice(1) : `${base ? `${base}/` : ''}${src}`).split('#')[0];
        return `/api/simple/f/${encodeURIComponent(String(req.params.jeton))}/res?f=${encodeURIComponent(cible)}`;
      });
      const theme = req.query.theme === 'clair' ? 'clair' : req.query.theme === 'sepia' ? 'sepia' : 'sombre';
      const taille = Math.min(32, Math.max(13, Number(req.query.taille) || 19));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html><html lang="fr" class="${theme} t${taille}"><head><meta charset="utf-8">`
        + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        + `<title>${echapper(o.titres?.[n] ?? `Chapitre ${n + 1}`)}</title><link rel="stylesheet" href="/b-liseuse.css"></head>`
        + `<body><article>${html}</article></body></html>`);
    } catch (e) {
      res.status(422).send(echapper((e as Error).message));
    }
  });

  r.get('/api/simple/f/:jeton/res', async (req, res) => {
    const v = lien(req, res);
    if (!v) return;
    const f = String(req.query.f ?? '');
    if (!estImage(f) && !/\.svg$/i.test(f)) { res.status(400).end(); return; }
    try {
      const o = await epubDe(v.complet);
      const e = o.entrees.find((x) => x.nom === f);
      if (!e) { res.status(404).end(); return; }
      res.setHeader('Content-Type', typeImage(f));
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(await lireEntree(o.lire, e));
    } catch {
      res.status(422).end();
    }
  });

  return r;
}

// Utilisé par le tri naturel des pages (réexport pour les tests éventuels)
export { triNaturel };
