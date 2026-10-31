// Bookloo — bibliothèque : téléchargements en cours et terminés.
'use strict';

const $ = (id) => document.getElementById(id);
let minuteur = null;

const LIBELLES = {
  attente: 'En attente',
  debrideur: 'AllDebrid',
  telechargement: 'Téléchargement',
  termine: 'Terminé',
  erreur: 'Échec',
  annule: 'Annulé',
};

async function charger() {
  clearTimeout(minuteur);
  try {
    const [{ travaux }, disques] = await Promise.all([
      api('/api/simple/telechargements'),
      api('/api/simple/disques').catch(() => ({ choix: null })),
    ]);
    const d = $('dossier');
    d.replaceChildren();
    if (disques.choix) {
      d.append(document.createTextNode('Rangés dans '));
      const a = el('a', null, chemin(disques.choix));
      a.href = '/b-dossier.html';
      d.append(a);
    } else {
      const a = el('a', null, 'Choisis un dossier de téléchargement');
      a.href = '/b-dossier.html';
      d.append(a);
    }
    dessiner(travaux);
    if (travaux.some((t) => ['attente', 'debrideur', 'telechargement'].includes(t.etat))) {
      minuteur = setTimeout(charger, 2000);
    }
  } catch (e) {
    $('liste').replaceChildren(el('div', 'vide', e.message));
  }
}

function chemin(c) {
  return [c.racine, ...String(c.chemin || '').split('/').filter(Boolean)].join(' › ');
}

function dessiner(travaux) {
  const l = $('liste');
  l.replaceChildren();
  if (!travaux.length) {
    l.append(el('div', 'vide', 'Rien pour l’instant. Cherche un titre et appuie sur la flèche pour le télécharger.'));
    return;
  }
  for (const t of travaux) {
    const c = el('div', `travail ${t.etat}`);
    const haut = el('div', 'haut');
    haut.append(el('div', 'titre', t.titre));
    const b = el('button', 'bouton rond gris');
    b.type = 'button';
    const actif = ['attente', 'debrideur', 'telechargement'].includes(t.etat);
    b.setAttribute('aria-label', actif ? 'Annuler' : 'Retirer de la liste');
    b.append(icone('croix', 16));
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api(`/api/simple/telechargements/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
        charger();
      } catch (e) {
        b.disabled = false;
        toast(e.message, true);
      }
    });
    haut.append(b);
    c.append(haut);

    const pct = t.etat === 'termine' ? 100 : t.total ? Math.min(100, Math.floor((t.recu / t.total) * 100)) : 0;
    const msg = [LIBELLES[t.etat] || t.etat];
    if (actif && t.total) msg.push(`${pct} % · ${octets(t.recu)} sur ${octets(t.total)}`);
    if (t.etat === 'termine' && t.total) msg.push(octets(t.total));
    c.append(el('div', 'message', `${msg.join(' · ')}${t.message && t.etat !== 'termine' ? ` — ${t.message}` : ''}`));
    if (t.etat === 'termine' && t.destination !== undefined) {
      c.append(el('div', 'message faible', `Dans ${chemin({ racine: t.dossier.racine, chemin: t.destination })}`));
    }
    if (actif || t.etat === 'termine') {
      const barre = el('div', 'barre');
      const rempli = el('div');
      rempli.style.width = `${pct}%`;
      barre.append(rempli);
      c.append(barre);
    }
    l.append(c);
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) charger(); });
charger();
