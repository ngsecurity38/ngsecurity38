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

## Le mettre sur votre domaine

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
