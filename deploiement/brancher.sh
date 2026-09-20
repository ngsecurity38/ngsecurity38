#!/bin/sh
# Branche les deux pages derrière le proxy déjà en place — NG Security 38.
#
#   sh deploiement/brancher.sh
#
# Le script trouve le proxy et son réseau, démarre le conteneur des pages,
# et vérifie que le proxy les voit. Il NE TOUCHE PAS au Caddyfile : celui-ci
# sert vos autres applications, et sa modification reste votre geste.
set -e
cd "$(dirname "$0")/.."

echo "→ 1/5  recherche du proxy"
PROXY=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'caddy|traefik|nginx-proxy' | head -1)
[ -n "$PROXY" ] || { echo "ÉCHEC : aucun proxy trouvé. Envoyez la sortie de « docker ps »."; exit 1; }
echo "   trouvé : $PROXY"

echo "→ 2/5  recherche de son réseau"
RESEAU=$(docker inspect "$PROXY" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}
{{end}}' | head -1)
[ -n "$RESEAU" ] || { echo "ÉCHEC : réseau introuvable."; exit 1; }
echo "   trouvé : $RESEAU"

echo "→ 3/5  écriture de deploiement/.env"
# On n'écrase pas un .env existant sans prévenir : il peut contenir autre chose.
if [ -f deploiement/.env ] && ! grep -q '^RESEAU_PROXY=' deploiement/.env; then
  echo "RESEAU_PROXY=$RESEAU" >> deploiement/.env
elif [ -f deploiement/.env ]; then
  sed -i "s|^RESEAU_PROXY=.*|RESEAU_PROXY=$RESEAU|" deploiement/.env
else
  printf 'DOMAINE=ngsecurity38.fr\nRESEAU_PROXY=%s\n' "$RESEAU" > deploiement/.env
fi
grep -E '^(DOMAINE|RESEAU_PROXY)=' deploiement/.env | sed 's/^/   /'

echo "→ 4/5  démarrage du conteneur des pages"
# --env-file explicite : selon la version de Compose, un .env rangé ailleurs
# que dans le dossier courant n'est pas lu, et le démarrage échouerait sur
# RESEAU_PROXY manquant.
docker compose --env-file deploiement/.env \
  -f deploiement/docker-compose.proxy.yml up -d
sleep 3

echo "→ 5/5  le proxy voit-il les pages ?"
if docker exec "$PROXY" wget -qO- http://ngs-outils/outils/etude/ 2>/dev/null | grep -q "Quelle caméra"; then
  echo "   OUI — les pages répondent."
else
  echo "   NON. Sortie du conteneur des pages :"
  docker logs --tail 20 ngs-outils 2>&1 | sed 's/^/     /'
  exit 1
fi

cat <<'FIN'

===============================================================
  IL RESTE UNE SEULE CHOSE À FAIRE, ET ELLE EST MANUELLE.
===============================================================

Ajoutez ces trois lignes dans votre Caddyfile, À L'INTÉRIEUR du bloc
du domaine où vous voulez voir les pages :

    handle /outils/* {
        reverse_proxy ngs-outils:80
    }

Puis rechargez :

    docker exec CONTENEUR_PROXY caddy reload --config /etc/caddy/Caddyfile

Faites une copie du Caddyfile avant : c'est lui qui sert vos autres
applications.

Si vous ne savez pas où est ce fichier ni quel domaine choisir, envoyez
la sortie de :

    sh deploiement/ce-qu-il-me-faut.sh
FIN
