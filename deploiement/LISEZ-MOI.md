# Servir les deux pages depuis le VPS

Votre VPS Hostinger (`srv1846780.hstgr.cloud`, 72.62.24.92) tourne sous
Docker. Les deux pages sont des fichiers statiques : un conteneur nginx de
quelques mégaoctets suffit, sans base de données ni PHP.

---

## Avant de commencer : que tourne-t-il déjà ?

```bash
sh deploiement/etat-du-serveur.sh
```

Ce script ne lit aucun secret — ni `.env`, ni clés, ni lignes de commande des
processus, qui contiennent parfois des identifiants. Il regarde le système,
les conteneurs, les ports occupés, et si un serveur web est déjà devant.
Rien n'est modifié.

Sa sortie se colle sans risque dans une conversation. Si le port 8080 est
pris, changez `PORT` dans `.env`.

---

## La mise en ligne, quatre commandes

Le dépôt est public : aucun identifiant n'est nécessaire.

```bash
git clone https://github.com/ngsecurity38/ngsecurity38.git
cd ngsecurity38 && git checkout claude/beautiful-gauss-ycyex1
cp deploiement/.env.exemple deploiement/.env    # puis ajuster PORT et DOMAINE
docker compose -f deploiement/docker-compose.yml up -d
```

### Le fichier `.env`

Deux réglages, et rien d'autre :

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `PORT` | port ouvert sur le VPS | `8080` |
| `DOMAINE` | nom servi, pour le `server_name` de nginx | `_` |

**`.env` n'est pas versionné** — la règle est dans `.gitignore`, et elle est
vérifiée. C'est le fichier où l'on met un jour un mot de passe : il reste sur
le serveur. Seul `.env.exemple` est dans le dépôt, et il ne contient aucune
valeur sensible.

> **Ne collez jamais un `.env` réel dans une conversation**, ici ou ailleurs.
> Si c'est arrivé, changez les identifiants qu'il contenait.

Vérifier :

```bash
curl -I http://localhost:8080/outils/etude/
```

Un `200 OK` et c'est en ligne, à `http://72.62.24.92:8080/outils/etude/`.

---

## Le plus simple : une seule commande

```bash
sh deploiement/brancher.sh
```

Le script trouve le proxy, lit son réseau, écrit `.env`, démarre le
conteneur des pages et vérifie que le proxy les voit. Il **ne touche pas au
Caddyfile** : celui-ci sert vos autres applications, et sa modification
reste un geste volontaire. Il vous donne les trois lignes à y ajouter.

En cas d'échec, il dit à quelle étape et affiche les journaux du conteneur.

---

## Le même chemin, à la main

C'est le cas de ce VPS : un `caddy:2-alpine` tient 80 et 443, devant un
backend et un Postgres.

Dans cette configuration, **le conteneur des outils ne publie aucun port**.
Il s'attache au réseau du proxy, qui le joint par son nom. Publier un port
serait au mieux inutile, au pire une porte ouverte sans TLS.

```bash
# 1. Le nom du réseau de Caddy
docker inspect deploy-caddy-1 \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'

# 2. Le reporter dans .env, ligne RESEAU_PROXY
nano deploiement/.env

# 3. Lancer la variante « derrière un proxy »
#    --env-file explicite : selon la version de Compose, un .env rangé
#    ailleurs que dans le dossier courant n'est pas lu.
docker compose --env-file deploiement/.env \
  -f deploiement/docker-compose.proxy.yml up -d

# 4. Vérifier depuis le conteneur Caddy lui-même
docker exec deploy-caddy-1 wget -qO- http://ngs-outils/outils/etude/ | head -3
```

Si la dernière commande affiche du HTML, le proxy voit les pages. Reste à
lui dire de les servir.

### La règle Caddy

À ajouter dans le Caddyfile, **dans le bloc du domaine voulu** :

```caddy
handle_path /outils/* {
    reverse_proxy ngs-outils:80
}
```

Attention à `handle_path` plutôt que `handle` : il retire `/outils` avant de
transmettre. Comme nos pages vivent déjà sous `/outils/` côté nginx, c'est
`handle` qu'il faut ici — sans quoi le chemin serait retiré deux fois :

```caddy
handle /outils/* {
    reverse_proxy ngs-outils:80
}
```

Puis recharger sans interruption :

```bash
docker exec deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

> **Avant de toucher au Caddyfile**, copiez-le : `cp Caddyfile Caddyfile.bak`.
> C'est lui qui sert vos autres applications.

---

## En autonome, si aucun proxy n'est devant

Deux façons, selon ce qui tourne déjà.

**Rien devant.** Mettez `PORT=80` dans `.env`, relancez, et faites pointer
un sous-domaine (`outils.ngsecurity38.fr`) sur 72.62.24.92 par un
enregistrement DNS de type A.

**Un proxy devant (nginx, Traefik, Caddy).** Ajoutez une règle vers
`localhost:8080`. Exemple pour nginx :

```nginx
location /outils/ {
    proxy_pass http://127.0.0.1:8080/outils/;
    proxy_set_header Host $host;
}
```

Dans les deux cas, pensez au certificat TLS — Let's Encrypt via certbot, ou
automatiquement si vous utilisez Caddy ou Traefik.

---

## Mettre à jour

```bash
cd ngsecurity38 && git pull
docker compose -f deploiement/docker-compose.yml restart
```

Les prix et le catalogue se changent **sans redémarrer** : ils sont dans
`docs/outils/devis/tarif.json` et `docs/outils/etude/catalogue.json`, servis
sans cache. Un `git pull` suffit, ou une édition directe du fichier.

---

## Ce qui a été vérifié, et ce qui ne l'a pas été

**Vérifié** — l'arborescence servie donne bien :

| Adresse | Résultat |
| --- | --- |
| `/` | redirige vers `/outils/etude/` |
| `/outils/etude/` | la présentation, logo affiché, 12 fiches |
| `/outils/devis/` | l'étude, chiffrée à 1 590,50 € TTC |
| `/outils/devis/tarif.json` | relu depuis le fichier voisin |

Aucune erreur de console, et le bouton « Lancer l'étude » mène bien d'une
page à l'autre.

La substitution du domaine dans le gabarit nginx a été simulée : seul
`${DOMAINE}` est remplacé, `$uri` reste intact — un filtre explicite
(`NGINX_ENVSUBST_FILTER`) l'impose, sans quoi envsubst s'en prendrait aussi
aux variables de nginx.

Et `.env` est bien ignoré par git : vérifié en en créant un, faux, et en
constatant que `git status` ne le voit pas.

**Pas vérifié** — le conteneur lui-même n'a pas pu être lancé : l'environnement
où ces fichiers ont été écrits n'a pas de démon Docker. La configuration nginx
et le fichier compose n'ont donc pas tourné pour de vrai. Si `docker compose
up` proteste, envoyez-moi le message.
