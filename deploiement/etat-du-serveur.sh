#!/bin/sh
# État du serveur — NG Security 38.
#
# À lancer sur le VPS, puis copier la sortie dans la conversation :
#
#   sh deploiement/etat-du-serveur.sh
#
# Ce script ne LIT AUCUN SECRET : ni .env, ni clés, ni mots de passe. Il ne
# fait que regarder ce qui tourne et ce qui écoute. Rien n'est modifié.

echo "===== système ====="
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
echo "espace disque libre : $(df -h / | awk 'NR==2 {print $4}')"

echo
echo "===== docker ====="
if command -v docker >/dev/null 2>&1; then
  docker --version
  echo "--- conteneurs en marche ---"
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || echo "(droits insuffisants : relancer avec sudo)"
  echo "--- docker compose ---"
  docker compose version 2>/dev/null || echo "(le plugin compose n'est pas là)"
else
  echo "docker absent"
fi

echo
echo "===== ports à l'écoute ====="
# Le nom du processus suffit ; aucune ligne de commande n'est affichée, elles
# contiennent parfois des identifiants.
(ss -tlnH 2>/dev/null || netstat -tlnp 2>/dev/null) \
  | awk '{print $4}' | sed 's/.*://' | sort -un | tr '\n' ' '
echo

echo
echo "===== un serveur web est-il déjà devant ? ====="
for s in nginx apache2 httpd caddy traefik; do
  if command -v "$s" >/dev/null 2>&1 || docker ps 2>/dev/null | grep -qi "$s"; then
    echo "$s : présent"
  fi
done
echo "(rien d'affiché ci-dessus = aucun proxy détecté)"

echo
echo "===== se brancher derrière le proxy ====="
# De quoi remplir RESEAU_PROXY, et retrouver la configuration du proxy.
for c in $(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'caddy|traefik|nginx|proxy'); do
  echo "--- $c ---"
  echo "réseaux : $(docker inspect "$c" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)"
  # Les points de montage disent où vit la configuration, sans la lire : un
  # fichier de configuration peut contenir des identifiants.
  docker inspect "$c" --format '{{range .Mounts}}monté  : {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' 2>/dev/null
done

echo
echo "===== le port 8080 est-il libre ? ====="
if (ss -tln 2>/dev/null || netstat -tln 2>/dev/null) | grep -q ':8080 '; then
  echo "NON — choisir un autre PORT dans deploiement/.env"
else
  echo "oui"
fi
