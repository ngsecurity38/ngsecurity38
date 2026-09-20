#!/bin/sh
# Rassemble exactement ce qu'il faut pour brancher les pages derrière Caddy.
#
#   sh deploiement/ce-qu-il-me-faut.sh
#
# Puis copier-coller la sortie dans la conversation.
#
# Les mots de passe, jetons et clés sont REMPLACÉS par [MASQUÉ] avant
# affichage. Relisez tout de même avant d'envoyer : aucun filtre n'est
# infaillible.

masquer() {
  sed -E \
    -e 's/(pass|passwd|password|secret|token|key|api_?key|auth|credential)([^ =:"]*)[ =:"]+[^ "]+/\1\2 [MASQUÉ]/gI' \
    -e 's#(://[^:/@]+):[^@]+@#\1:[MASQUÉ]@#g' \
    -e 's/\$2[aby]\$[A-Za-z0-9./]+/[MASQUÉ-HASH]/g' \
    -e 's/\b(sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{8,}/[MASQUÉ-JETON]/g' \
    -e 's/\beyJ[A-Za-z0-9._-]{20,}/[MASQUÉ-JWT]/g' \
    -e 's/\b[A-Za-z0-9+\/_-]{40,}={0,2}\b/[MASQUÉ-LONG]/g'
}

echo "########## 1. NOM DU RÉSEAU DE CADDY ##########"
docker inspect deploy-caddy-1 \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}
{{end}}' 2>/dev/null || echo "(échec : relancer avec sudo)"

echo
echo "########## 2. OÙ VIT LA CONFIGURATION ##########"
docker inspect deploy-caddy-1 \
  --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}
{{end}}' 2>/dev/null

echo
echo "########## 3. LE CADDYFILE (mots de passe masqués) ##########"
docker exec deploy-caddy-1 sh -c 'cat /etc/caddy/Caddyfile 2>/dev/null' 2>/dev/null \
  | masquer \
  || echo "(pas de Caddyfile à cet emplacement — voir les montages ci-dessus)"

echo
echo "########## 4. QUELS DOMAINES RÉPONDENT DÉJÀ ##########"
docker exec deploy-caddy-1 sh -c 'cat /etc/caddy/Caddyfile 2>/dev/null' 2>/dev/null \
  | grep -E '^[a-z0-9*.-]+\.[a-z]{2,}' | sed 's/[ {].*//' | sort -u \
  || echo "(aucun domaine lisible)"

echo
echo "########## FIN — tout copier et envoyer ##########"
