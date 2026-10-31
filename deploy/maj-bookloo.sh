#!/bin/sh
# Bookloo (fork de Norman) : passe le service « bookloo » du compose /data sur l'image du fork,
# relie les disques /media/norman/jellyfin* (choix du dossier de téléchargement) et redémarre Bookloo.
# Usage : curl -fsSL https://raw.githubusercontent.com/nono7444/bookloo/main/deploy/maj-bookloo.sh | sh
set -e
cd /data
F=docker-compose.yaml
[ -f "$F" ] || F=docker-compose.yml
cp "$F" "$F.avant-bookloo2"
python3 - "$F" <<'PY'
import re, os, glob, sys
p = sys.argv[1]
L = open(p).read().split('\n')
i = next(n for n, l in enumerate(L) if re.match(r'^\s+bookloo:\s*$', l))
ind = re.match(r'^(\s+)', L[i]).group(1)
fin = next((n for n in range(i + 1, len(L)) if re.match(r'^' + ind + r'\S', L[n]) or re.match(r'^\S', L[n])), len(L))
bloc = [l.replace('ghcr.io/loo-stick/bookloo:latest', 'ghcr.io/nono7444/bookloo:latest') for l in L[i:fin]]
disques = sorted(d for d in glob.glob('/media/norman/jellyfin*') if os.path.isdir(d))
noms = [os.path.basename(d) for d in disques]
if not any('BOOKLOO_DISQUES' in l for l in bloc):
    k = next(n for n, l in enumerate(bloc) if 'ADMIN_LOGIN' in l)
    bloc.insert(k + 1, ind * 3 + '- BOOKLOO_DISQUES=' + ','.join(f'{n}:/disques/{n}' for n in noms))
if not any(l.strip().startswith('- /media/norman/') for l in bloc):
    k = next(n for n, l in enumerate(bloc) if '/app/data' in l)
    for d, n in reversed(list(zip(disques, noms))):
        bloc.insert(k + 1, ind * 3 + f'- {d}:/disques/{n}')
L[i:fin] = bloc
open(p, 'w').write('\n'.join(L))
print('Disques reliés :', ', '.join(noms) or 'AUCUN')
PY
if ! docker compose config -q; then
  echo "Compose invalide : je remets la sauvegarde"
  cp "$F.avant-bookloo2" "$F"
  exit 1
fi
docker compose pull bookloo
docker compose up -d bookloo
sleep 8
echo "Image : $(docker inspect bookloo -f '{{.Config.Image}}')"
