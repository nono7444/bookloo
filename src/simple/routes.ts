// Routes de l'interface épurée (appli iPhone) : recherche par tome, cache AllDebrid,
// téléchargements vers les disques, choix du dossier.

import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { getSettings } from '../core/settings';
import { interrogerSource } from '../core/fanout';
import { memoriserLien, lienMemorise, etatCacheMemorise, poserEtatCache, hashConnu } from '../core/liens-torrent';
import { tracerErreur } from '../core/journal';
import { clesDeRecherche, clesEnClair } from '../auth/cles-utilisateur';
import { exigerConnexion, exigerCsrf, limiteurRecherche } from '../auth/garde';
import { toutesLesSources } from '../routes/releases';
import { creerAccumulateur } from '../routes/flux';
import { familleDemandee } from '../routes/famille';
import { sourceEcartee, formatEcarte, FAMILLES } from '../familles/table';
import { verifierUnHash } from '../debrid/alldebrid';
import type { Oeuvre } from '../catalogue/mangadex';
import type { Candidate, ResultatSource } from '../sources/types';
import {
  ErreurDisque, choixDe, creerDossier, disques, infoDisque, listerDossiers, poserChoix,
} from './disques';
import { ajouter, annuler, travauxDe } from './telechargements';

/** Langues gardées : le français (et l'inconnu, souvent français sur ces trackers). */
const LANGUES_GARDEES = new Set(['FR', 'VOSTFR', 'inconnue']);

export type Genre = 'tome' | 'pack' | 'livre';

export interface Resultat {
  cle: string;
  titre: string;
  source: string;
  sources: string[];
  taille?: number;
  seeders?: number;
  format: string;
  genre: Genre;
  /** Numéro du tome (genre « tome ») */
  tome?: number;
  /** « T1 à T12 », « Intégrale » (genre « pack ») */
  plage?: string;
  torrent: boolean;
  certain: boolean;
  cache?: 'en-cache' | 'absent' | 'inconnu';
}

/** Tome isolé, pack ou livre sans numéro. */
export function genreDe(c: Candidate): { genre: Genre; tome?: number; plage?: string } {
  const t = c.tomes;
  if (!t) return { genre: 'livre' };
  if (t.integrale) return { genre: 'pack', plage: 'Intégrale' };
  if (t.fin !== undefined && t.fin > t.debut) return { genre: 'pack', plage: `T${t.debut} à T${t.fin}` };
  return { genre: 'tome', tome: t.debut };
}

/** Ordre d'affichage : tomes par numéro, puis livres, puis packs du plus grand au plus petit. */
export function trier(liste: Resultat[]): Resultat[] {
  const poids = { tome: 0, livre: 1, pack: 2 } as const;
  const etendue = (r: Resultat) => {
    const m = /T(\d+) à T(\d+)/.exec(r.plage || '');
    return r.plage === 'Intégrale' ? 1e6 : m ? Number(m[2]) - Number(m[1]) : 0;
  };
  return [...liste].sort((a, b) =>
    poids[a.genre] - poids[b.genre]
    || (a.genre === 'tome' ? (a.tome ?? 0) - (b.tome ?? 0) : 0)
    || (a.genre === 'pack' ? etendue(b) - etendue(a) : 0)
    || Number(b.certain) - Number(a.certain)
    || (b.seeders ?? 0) - (a.seeders ?? 0));
}

function erreurDisque(res: import('express').Response, e: unknown): void {
  if (e instanceof ErreurDisque) res.status(e.code).json({ erreur: e.message });
  else res.status(500).json({ erreur: (e as Error).message || 'erreur disque' });
}

export function routesSimple(db: Database): Router {
  const r = Router();

  // ——— Recherche : toutes les sources en parallèle, réponse unique ———
  r.get('/api/simple/recherche', exigerConnexion, limiteurRecherche, async (req, res) => {
    const famille = familleDemandee(req.query);
    if (!famille) { res.status(400).json({ erreur: 'rayon inconnu' }); return; }
    const q = String(req.query.q ?? '').trim();
    if (!q) { res.json({ resultats: [], sources: [] }); return; }

    const session = req.session!;
    const cles = clesEnClair(db, session.userId, session.dek);
    const settings = getSettings();
    const sources = toutesLesSources().filter((s) => !sourceEcartee(famille, s.id));
    const controleur = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controleur.abort(); });
    const minuteurs: NodeJS.Timeout[] = [];
    const signalPour = (budget: number) => {
      const c = new AbortController();
      const m = setTimeout(() => c.abort(), budget);
      minuteurs.push(m);
      controleur.signal.addEventListener('abort', () => c.abort(), { once: true });
      return c.signal;
    };

    try {
      const reponses: ResultatSource[] = await Promise.all(
        sources.map((s) =>
          interrogerSource(
            s,
            { titres: [q] },
            { cles: clesDeRecherche(cles), famille, userId: session.userId },
            signalPour(s.budgetMs ?? settings.fanoutBudgetMs),
          )),
      );
      // Même rapprochement que le site : un résultat qui ne ressemble pas au titre est « incertain »
      const fiche = { id: `libre:${q}`, titre: q, titres: [q], formes: [q] } as unknown as Oeuvre;
      const acc = creerAccumulateur(fiche, settings.maxResultats);
      const vus = new Map<string, Candidate>();
      for (const rep of reponses) {
        const gardes = rep.candidats.filter(
          (c) => !formatEcarte(famille, c.format) && LANGUES_GARDEES.has(c.langue),
        );
        for (const c of gardes) {
          const cle = c.hash || c.identite;
          if (cle) memoriserLien(session.userId, cle, c.torrentUrl, c.source, c.aussiSur);
        }
        // L'accumulateur dédoublonne par hash et fusionne les sources d'une même release
        const lot = acc.absorber(gardes);
        for (const c of lot.ajouts) vus.set(c.hash || c.identite || `${c.source}:${c.titre}`, c);
        for (const f of lot.fusions) {
          const e = vus.get(f.hash);
          if (e) { e.seeders = f.seeders; e.source = f.source; e.aussiSur = f.aussiSur; }
        }
      }
      const labels = new Map(reponses.map((x) => [x.source, x.label]));
      const resultats: Resultat[] = [...vus.values()]
        .filter((c) => c.hash || c.identite)
        .map((c) => {
          const g = genreDe(c);
          const cle = (c.hash || c.identite)!;
          return {
            cle,
            titre: c.titre,
            source: labels.get(c.source) ?? c.source,
            sources: (c.aussiSur ?? []).map((s) => labels.get(s) ?? s),
            taille: c.taille,
            seeders: c.seeders,
            format: c.format,
            genre: g.genre,
            tome: g.tome,
            plage: g.plage,
            torrent: Boolean(c.hash),
            certain: c.certain !== false,
            cache: c.hash ? etatCacheMemorise(session.userId, c.hash, 'alldebrid') : undefined,
          };
        });
      res.json({
        resultats: trier(resultats),
        sources: reponses.map((x) => ({ id: x.source, label: x.label, etat: x.etat, n: x.candidats.length })),
      });
    } catch (e) {
      tracerErreur('Recherche', e);
      res.status(500).json({ erreur: 'la recherche s’est interrompue' });
    } finally {
      for (const m of minuteurs) clearTimeout(m);
    }
  });

  r.get('/api/simple/rayons', exigerConnexion, (_req, res) => {
    res.json({ rayons: FAMILLES.filter((f) => f.id !== 'presse').map((f) => ({ id: f.id, libelle: f.libelle })) });
  });

  // ——— Cache AllDebrid : vérifié quelques releases à la fois ———
  r.post('/api/simple/cache', exigerConnexion, exigerCsrf, async (req, res) => {
    const session = req.session!;
    const cles = clesEnClair(db, session.userId, session.dek);
    if (!cles.ad) { res.json({ etats: {}, sansCle: true }); return; }
    const hashes: string[] = (Array.isArray(req.body?.hashes) ? req.body.hashes : [])
      .map((h: unknown) => String(h).toLowerCase())
      .filter((h: string) => /^[a-f0-9]{40}$/.test(h))
      .slice(0, 4);
    const etats: Record<string, string> = {};
    for (const h of hashes) {
      const connu = etatCacheMemorise(session.userId, h, 'alldebrid');
      if (connu && connu !== 'inconnu') { etats[h] = connu; continue; }
      try {
        const v = await verifierUnHash(h, cles.ad, AbortSignal.timeout(30_000));
        poserEtatCache(session.userId, h, 'alldebrid', v.etat);
        etats[h] = v.etat;
      } catch {
        etats[h] = 'inconnu';
      }
    }
    res.json({ etats });
  });

  // ——— Téléchargements ———
  r.post('/api/simple/telecharger', exigerConnexion, exigerCsrf, (req, res) => {
    const session = req.session!;
    const cle = String(req.body?.cle ?? '');
    const titre = String(req.body?.titre ?? '').trim().slice(0, 300) || cle;
    const source = String(req.body?.source ?? '');
    const estHash = /^[a-f0-9]{40}$/i.test(cle);
    const estDdl = /^ddl:[a-z0-9-]+:[A-Za-z0-9_-]+$/.test(cle);
    if (!estHash && !estDdl) { res.status(400).json({ erreur: 'release invalide' }); return; }
    if (estHash && !hashConnu(session.userId, cle.toLowerCase())) {
      res.status(404).json({ erreur: 'release inconnue : relance la recherche' });
      return;
    }
    const cles = clesEnClair(db, session.userId, session.dek);
    if (!cles.ad) {
      res.status(400).json({ erreur: 'Ajoute ta clé AllDebrid dans Réglages → Compte et clés de service.' });
      return;
    }
    const dossier = choixDe(session.userId);
    if (!dossier) {
      res.status(400).json({ erreur: 'Choisis d’abord un dossier de téléchargement dans Réglages.' });
      return;
    }
    const t = ajouter(
      session.userId,
      { titre, cle: estHash ? cle.toLowerCase() : cle, source, dossier },
      { ad: cles.ad, torrentUrl: estHash ? lienMemorise(session.userId, cle.toLowerCase()) : undefined },
    );
    res.json({ travail: t });
  });

  r.get('/api/simple/telechargements', exigerConnexion, (req, res) => {
    res.json({ travaux: travauxDe(req.session!.userId) });
  });

  r.delete('/api/simple/telechargements/:id', exigerConnexion, exigerCsrf, (req, res) => {
    if (!annuler(req.session!.userId, String(req.params.id))) {
      res.status(404).json({ erreur: 'téléchargement inconnu' });
      return;
    }
    res.json({ ok: true });
  });

  // ——— Disques et dossier choisi ———
  r.get('/api/simple/disques', exigerConnexion, async (req, res) => {
    res.json({
      disques: await Promise.all(disques().map(infoDisque)),
      choix: choixDe(req.session!.userId),
    });
  });

  r.get('/api/simple/disques/dossiers', exigerConnexion, async (req, res) => {
    try {
      res.json(await listerDossiers(String(req.query.racine ?? ''), String(req.query.chemin ?? '')));
    } catch (e) {
      erreurDisque(res, e);
    }
  });

  r.post('/api/simple/disques/dossier', exigerConnexion, exigerCsrf, async (req, res) => {
    try {
      const nom = String(req.body?.nom ?? '').trim();
      if (!nom) { res.status(400).json({ erreur: 'nom vide' }); return; }
      const chemin = await creerDossier(String(req.body?.racine ?? ''), String(req.body?.chemin ?? ''), nom);
      res.json({ chemin });
    } catch (e) {
      erreurDisque(res, e);
    }
  });

  r.put('/api/simple/disques/choix', exigerConnexion, exigerCsrf, (req, res) => {
    try {
      poserChoix(req.session!.userId, {
        racine: String(req.body?.racine ?? ''),
        chemin: String(req.body?.chemin ?? ''),
      });
      res.json({ choix: choixDe(req.session!.userId) });
    } catch (e) {
      erreurDisque(res, e);
    }
  });

  return r;
}
