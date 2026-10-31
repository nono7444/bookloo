// Bookloo — choix du dossier de téléchargement sur les disques du serveur (comme dans Lumio).
'use strict';

const $ = (id) => document.getElementById(id);
const nav = { racine: null, chemin: '' };
let infos = { disques: [], choix: null };

function joindre(...p) {
  return p.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, '');
}

async function demarrer() {
  try {
    infos = await api('/api/simple/disques');
    if (infos.choix) {
      nav.racine = infos.choix.racine;
      nav.chemin = infos.choix.chemin || '';
    }
    actuel();
    await ouvrir();
  } catch (e) {
    $('liste').replaceChildren(el('div', 'vide', e.message));
  }
}

function actuel() {
  const a = $('actuel');
  a.replaceChildren();
  a.append(el('span', 'pale', 'Téléchargements rangés dans'));
  a.append(el('b', null, infos.choix ? [infos.choix.racine, ...String(infos.choix.chemin || '').split('/').filter(Boolean)].join(' › ') : 'aucun dossier choisi'));
}

async function ouvrir() {
  const fil = $('fil');
  const liste = $('liste');
  const actions = $('actions');
  fil.replaceChildren();
  actions.replaceChildren();
  liste.replaceChildren(el('div', 'chargement'));
  liste.firstChild.append(el('div', 'roue'));

  // Fil d'Ariane : Disques › jellyfin1 › Mangas
  const lien = (texte, fn) => {
    const b = el('button', null, texte);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  fil.append(lien('Disques', () => { nav.racine = null; nav.chemin = ''; ouvrir(); }));
  if (nav.racine) {
    fil.append(document.createTextNode(' › '));
    fil.append(lien(nav.racine, () => { nav.chemin = ''; ouvrir(); }));
    const parts = nav.chemin.split('/').filter(Boolean);
    parts.forEach((p, i) => {
      fil.append(document.createTextNode(' › '));
      fil.append(lien(p, () => { nav.chemin = parts.slice(0, i + 1).join('/'); ouvrir(); }));
    });
  }

  try {
    if (!nav.racine) {
      liste.replaceChildren();
      if (!infos.disques.length) {
        liste.append(el('div', 'vide', 'Aucun disque n’est relié à Bookloo. Ajoute BOOKLOO_DISQUES et les volumes des disques dans le docker-compose.'));
        return;
      }
      for (const d of infos.disques) {
        liste.append(ligne('disque', d.nom, d.libre ? `${octets(d.libre)} libres` : '', () => {
          nav.racine = d.nom;
          nav.chemin = '';
          ouvrir();
        }));
      }
      return;
    }
    const { dossiers, fichiers } = await api(`/api/simple/disques/dossiers?racine=${encodeURIComponent(nav.racine)}&chemin=${encodeURIComponent(nav.chemin)}`);
    liste.replaceChildren();
    for (const nom of dossiers) {
      liste.append(ligne('dossier', nom, '', () => { nav.chemin = joindre(nav.chemin, nom); ouvrir(); }));
    }
    if (!dossiers.length) liste.append(el('div', 'vide', fichiers ? `${fichiers} fichier${fichiers > 1 ? 's' : ''}, aucun sous-dossier` : 'Dossier vide'));

    // Actions : choisir ce dossier, en créer un nouveau
    const barre = el('div', 'actions');
    const choisir = el('button', 'bouton', 'Choisir ce dossier');
    choisir.type = 'button';
    const estChoisi = infos.choix && infos.choix.racine === nav.racine && (infos.choix.chemin || '') === nav.chemin;
    if (estChoisi) { choisir.textContent = 'Dossier choisi'; choisir.classList.add('fait'); choisir.disabled = true; }
    choisir.addEventListener('click', async () => {
      choisir.disabled = true;
      try {
        const r = await api('/api/simple/disques/choix', { method: 'PUT', body: JSON.stringify({ racine: nav.racine, chemin: nav.chemin }) });
        infos.choix = r.choix;
        actuel();
        toast('Dossier enregistré');
        ouvrir();
      } catch (e) {
        choisir.disabled = false;
        toast(e.message, true);
      }
    });
    const nouveau = el('button', 'bouton gris');
    nouveau.type = 'button';
    nouveau.append(icone('plus', 16), document.createTextNode('Nouveau dossier'));
    barre.append(choisir, nouveau);
    actions.append(barre);

    const form = el('form', 'nouveau cache');
    const champ = el('input');
    champ.placeholder = 'Nom du dossier (ex. Mangas)';
    champ.autocapitalize = 'sentences';
    const creer = el('button', 'bouton', 'Créer');
    form.append(champ, creer);
    actions.append(form);
    nouveau.addEventListener('click', () => { form.classList.toggle('cache'); champ.focus(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nom = champ.value.trim();
      if (!nom) return;
      creer.disabled = true;
      try {
        const r = await api('/api/simple/disques/dossier', { method: 'POST', body: JSON.stringify({ racine: nav.racine, chemin: nav.chemin, nom }) });
        nav.chemin = r.chemin;
        toast('Dossier créé');
        ouvrir();
      } catch (err) {
        creer.disabled = false;
        toast(err.message, true);
      }
    });
  } catch (e) {
    liste.replaceChildren(el('div', 'vide', e.message));
  }
}

function ligne(type, nom, info, fn) {
  const b = el('button', 'ligne');
  b.type = 'button';
  const i = el('span', 'icone');
  i.append(icone(type, 18));
  b.append(i, el('span', 'nom', nom));
  if (info) b.append(el('span', 'info', info));
  b.addEventListener('click', fn);
  return b;
}

demarrer();
