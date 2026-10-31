// Ouvre un livre dans le bon lecteur de l'appli.
import { router } from 'expo-router';

import type { Livre } from './api';

export function ouvrirLivre(l: Livre) {
  const params = { jeton: l.jeton, titre: l.titre, chemin: l.chemin };
  if (l.format === 'bd') router.push({ pathname: '/lecteur/bd', params });
  else if (l.format === 'epub') router.push({ pathname: '/lecteur/epub', params });
  else if (l.format === 'pdf') router.push({ pathname: '/lecteur/pdf', params });
  else router.push({ pathname: '/lecteur/audio', params });
}
