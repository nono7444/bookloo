// Bookloo — recherche : tomes un par un, collections à part, cache AllDebrid vérifié tout seul.
'use strict';

const RAYONS = [
  ['mangas', 'Mangas'], ['bd', 'BD'], ['comics', 'Comics'], ['livres', 'Livres'], ['audio', 'Livres audio'],
];
const FILTRES = [['tout', 'Tout'], ['tomes', 'Tomes'], ['collections', 'Collections']];

const etat = {
  rayon: lire('bl.rayon', 'mangas'),
  filtre: 'tout',
  resultats: [],
  cache: {},
  ajoutes: new Set(),
  recherche: 0,
};

const $ = (id) => document.getElementById(id);
$('loupe').append(icone('loupe', 20));

function puces(conteneur, liste, actif, choisir) {
  conteneur.replaceChildren();
  for (const [id, libelle] of liste) {
    const b = el('button', 'puce', libelle);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(id === actif));
    b.addEventListener('click', () => choisir(id));
    conteneur.append(b);
  }
}

function dessinerPuces() {
  puces($('rayons'), RAYONS, etat.rayon, (id) => {
    etat.rayon = id;
    ecrire('bl.rayon', id);
    dessinerPuces();
    if ($('q').value.trim()) chercher();
  });
  puces($('filtres'), FILTRES, etat.filtre, (id) => {
    etat.filtre = id;
    dessinerPuces();
    afficher();
  });
}

// ——— Dossier de téléchargement ———
async function verifierDossier() {
  try {
    const { disques, choix } = await api('/api/simple/disques');
    const b = $('banniere');
    b.replaceChildren();
    if (!disques.length) {
      b.append(el('div', 'banniere', 'Aucun disque n’est relié à Bookloo : ajoute BOOKLOO_DISQUES dans le docker-compose.'));
    } else if (!choix) {
      const d = el('div', 'banniere');
      d.append(el('span', null, 'Choisis où ranger tes téléchargements.'));
      const a = el('a', null, 'Choisir');
      a.href = '/b-dossier.html';
      d.append(a);
      b.append(d);
    }
  } catch { /* la recherche reste possible */ }
}

// ——— Recherche ———
async function chercher() {
  const q = $('q').value.trim();
  if (!q) return;
  const n = ++etat.recherche;
  etat.resultats = [];
  $('filtres').classList.add('cache');
  $('etat').textContent = 'Recherche sur C411, Tr4ker et Wawacity…';
  const r = $('resultats');
  r.replaceChildren();
  const c = el('div', 'chargement');
  c.append(el('div', 'roue'));
  r.append(c);
  try {
    const rep = await api(`/api/simple/recherche?famille=${encodeURIComponent(etat.rayon)}&q=${encodeURIComponent(q)}`);
    if (n !== etat.recherche) return;
    etat.resultats = rep.resultats;
    for (const x of rep.resultats) if (x.cache) etat.cache[x.cle] = x.cache;
    $('etat').replaceChildren(...rep.sources.map((s) => el(
      'span',
      s.etat === 'cle-absente' || s.etat === 'echec' ? 'source ko' : 'source',
      `${s.label} : ${s.etat === 'cle-absente' ? 'clé manquante' : s.etat === 'echec' ? 'pas de réponse' : s.n}`,
    )));
    $('filtres').classList.toggle('cache', !rep.resultats.length);
    afficher();
    verifierCaches();
  } catch (e) {
    if (n !== etat.recherche) return;
    $('etat').textContent = '';
    r.replaceChildren(el('div', 'vide', e.message));
  }
}

/** Les versions d'un même tome, la meilleure d'abord (en cache, puis la plus partagée). */
function meilleures(liste) {
  const rang = (x) => (etat.cache[x.cle] === 'en-cache' ? 0 : 1);
  return [...liste].sort((a, b) => rang(a) - rang(b) || (b.seeders ?? 0) - (a.seeders ?? 0));
}

function afficher() {
  const r = $('resultats');
  r.replaceChildren();
  const certains = etat.resultats.filter((x) => x.certain);
  const incertains = etat.resultats.filter((x) => !x.certain);
  if (!etat.resultats.length) {
    r.append(el('div', 'vide', 'Aucun résultat en français pour cette recherche.'));
    return;
  }
  const voirTomes = etat.filtre !== 'collections';
  const voirCollections = etat.filtre !== 'tomes';

  // Tomes, regroupés par numéro
  const parTome = new Map();
  for (const x of certains.filter((y) => y.genre === 'tome')) {
    if (!parTome.has(x.tome)) parTome.set(x.tome, []);
    parTome.get(x.tome).push(x);
  }
  if (voirTomes && parTome.size) {
    const numeros = [...parTome.keys()].sort((a, b) => a - b);
    r.append(titre('Tomes', `${parTome.size}`));
    const l = el('div', 'liste');
    for (const t of numeros) {
      const [premiere, ...autres] = meilleures(parTome.get(t));
      l.append(carte(premiere));
      if (autres.length) {
        const bloc = el('div', 'autres');
        const bouton = el('button', null, `+ ${autres.length} autre${autres.length > 1 ? 's' : ''} version${autres.length > 1 ? 's' : ''}`);
        bouton.type = 'button';
        const cachees = el('div', 'liste cache');
        for (const a of autres) cachees.append(carte(a));
        bouton.addEventListener('click', () => {
          cachees.classList.toggle('cache');
          bouton.textContent = cachees.classList.contains('cache') ? `+ ${autres.length} autre${autres.length > 1 ? 's' : ''} version${autres.length > 1 ? 's' : ''}` : 'Masquer';
        });
        bloc.append(bouton);
        l.append(bloc, cachees);
      }
    }
    r.append(l);
  }

  const packs = certains.filter((x) => x.genre === 'pack');
  if (voirCollections && packs.length) {
    r.append(titre('Collections et intégrales', `${packs.length}`));
    const l = el('div', 'liste');
    for (const x of packs) l.append(carte(x));
    r.append(l);
  }

  const livres = certains.filter((x) => x.genre === 'livre');
  if (etat.filtre === 'tout' && livres.length) {
    r.append(titre(parTome.size || packs.length ? 'Autres' : 'Résultats', `${livres.length}`));
    const l = el('div', 'liste');
    for (const x of livres) l.append(carte(x));
    r.append(l);
  }

  if (!r.children.length) {
    r.append(el('div', 'vide', etat.filtre === 'tomes' ? 'Pas de tome séparé : regarde les collections.' : 'Pas de collection : regarde les tomes.'));
  }

  if (etat.filtre === 'tout' && incertains.length) {
    const d = el('details', 'incertains');
    d.append(el('summary', null, `Résultats moins proches (${incertains.length})`));
    const l = el('div', 'liste');
    for (const x of incertains) l.append(carte(x));
    d.append(l);
    r.append(d);
  }
}

function titre(texte, compte) {
  const h = el('h2', null, texte);
  if (compte) h.append(el('small', null, compte));
  return h;
}

function badgeCache(x) {
  const b = el('span', 'badge');
  b.dataset.cache = x.cle;
  majBadge(b, etat.cache[x.cle]);
  return b;
}

function majBadge(b, v) {
  b.className = 'badge';
  if (v === 'en-cache') { b.textContent = '⚡ En cache'; b.classList.add('vert'); }
  else if (v === 'absent') { b.textContent = 'Pas en cache'; b.classList.add('orange'); }
  else if (v === 'verif') b.textContent = 'Cache…';
  else b.classList.add('cache');
}

function carte(x) {
  const c = el('div', 'carte');
  const num = el('div', `num${x.genre === 'pack' ? ' pack' : ''}`);
  if (x.genre === 'tome') {
    num.append(el('small', null, 'Tome'));
    num.append(document.createTextNode(String(x.tome)));
  } else if (x.genre === 'pack') {
    num.append(el('small', null, x.plage === 'Intégrale' ? 'Série' : 'Pack'));
    num.append(document.createTextNode(x.plage === 'Intégrale' ? 'Tout' : x.plage.replace(' à ', '–')));
  } else {
    num.append(icone('dossier', 22));
  }
  const corps = el('div', 'corps');
  corps.append(el('div', 'titre', x.titre));
  const meta = el('div', 'meta');
  meta.append(el('span', null, x.source));
  if (x.taille) meta.append(el('span', null, octets(x.taille)));
  if (x.seeders !== undefined && x.seeders !== null) meta.append(el('span', null, `${x.seeders} seed${x.seeders > 1 ? 's' : ''}`));
  if (x.format && x.format !== 'inconnu') meta.append(el('span', null, x.format.toUpperCase()));
  if (x.torrent) meta.append(badgeCache(x));
  corps.append(meta);

  const b = el('button', 'bouton rond');
  b.type = 'button';
  b.setAttribute('aria-label', 'Télécharger');
  if (etat.ajoutes.has(x.cle)) { b.classList.add('fait'); b.append(icone('ok')); b.disabled = true; }
  else b.append(icone('telecharger'));
  b.addEventListener('click', () => telecharger(x, b));
  c.append(num, corps, b);
  return c;
}

async function telecharger(x, bouton) {
  bouton.disabled = true;
  try {
    await api('/api/simple/telecharger', {
      method: 'POST',
      body: JSON.stringify({ cle: x.cle, titre: x.titre, source: x.source }),
    });
    etat.ajoutes.add(x.cle);
    bouton.replaceChildren(icone('ok'));
    bouton.classList.add('fait');
    toast('Ajouté à la bibliothèque');
  } catch (e) {
    bouton.disabled = false;
    toast(e.message, true);
  }
}

// ——— Cache AllDebrid : vérifié tout seul, quelques releases à la fois ———
async function verifierCaches() {
  const n = etat.recherche;
  // Les releases visibles d'abord : la meilleure version de chaque tome, puis les collections
  const vues = [...document.querySelectorAll('#resultats > .liste > .carte .badge[data-cache], #resultats > .liste > .carte [data-cache]')]
    .map((b) => b.dataset.cache);
  const a = [...new Set(vues)].filter((cle) => !etat.cache[cle]).slice(0, 40);
  for (let i = 0; i < a.length; i += 4) {
    if (n !== etat.recherche) return;
    const lot = a.slice(i, i + 4);
    for (const cle of lot) document.querySelectorAll(`[data-cache="${cle}"]`).forEach((b) => majBadge(b, 'verif'));
    try {
      const rep = await api('/api/simple/cache', { method: 'POST', body: JSON.stringify({ hashes: lot }) });
      if (rep.sansCle) {
        for (const cle of lot) document.querySelectorAll(`[data-cache="${cle}"]`).forEach((b) => majBadge(b, undefined));
        return;
      }
      for (const cle of lot) {
        etat.cache[cle] = rep.etats[cle] || 'inconnu';
        document.querySelectorAll(`[data-cache="${cle}"]`).forEach((b) => majBadge(b, etat.cache[cle]));
      }
    } catch {
      for (const cle of lot) document.querySelectorAll(`[data-cache="${cle}"]`).forEach((b) => majBadge(b, undefined));
      return;
    }
  }
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  $('q').blur();
  chercher();
});

dessinerPuces();
verifierDossier();
