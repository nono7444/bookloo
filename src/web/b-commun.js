// Bookloo — outils communs de l'interface épurée.
'use strict';

function jetonCsrf() {
  const m = document.cookie.match(/(?:^|;\s*)mangaloo-csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/** Appel JSON au serveur, avec le jeton anti-CSRF ; renvoie vers la connexion si besoin. */
async function api(chemin, options = {}) {
  const rep = await fetch(chemin, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-CSRF': jetonCsrf(), ...(options.headers || {}) },
  });
  if (rep.status === 401) {
    location.href = '/login.html';
    throw new Error('connexion requise');
  }
  const corps = await rep.json().catch(() => ({}));
  if (!rep.ok) throw new Error(corps.erreur || `erreur ${rep.status}`);
  return corps;
}

function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined && texte !== null) e.textContent = texte;
  return e;
}

function octets(n) {
  if (!n) return '';
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1).replace('.', ',')} ${u[i]}`;
}

let minuteurToast = null;
function toast(texte, erreur = false) {
  document.querySelector('.toast')?.remove();
  const t = el('div', `toast${erreur ? ' erreur' : ''}`, texte);
  document.body.append(t);
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => t.remove(), 3200);
}

function lire(cle, defaut) {
  try { return localStorage.getItem(cle) ?? defaut; } catch { return defaut; }
}
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, valeur); } catch { /* navigation privée */ }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Petites icônes dessinées (pas de police d'icônes). */
function icone(nom, taille = 18) {
  const chemins = {
    telecharger: 'M12 4v11m0 0l-5-5m5 5l5-5M5 20h14',
    dossier: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    disque: 'M4 6h16v12H4zM8 14h.01',
    plus: 'M12 5v14M5 12h14',
    croix: 'M6 6l12 12M18 6L6 18',
    ok: 'M5 12l5 5L20 7',
    loupe: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2l4 4',
  };
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', taille);
  s.setAttribute('height', taille);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', chemins[nom] || '');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2.2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
}
