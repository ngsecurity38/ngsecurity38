# Servir les deux pages depuis le VPS

Votre VPS Hostinger (`srv1846780.hstgr.cloud`, 72.62.24.92) tourne sous
Docker. Les deux pages sont des fichiers statiques : un conteneur nginx de
quelques mégaoctets suffit, sans base de données ni PHP.

---

## Avant de commencer : que tourne-t-il déjà ?

```bash
docker ps
ss -tlnp | grep -E ':(80|443|8080) '
```

Si le port 8080 est pris, changez-le dans `docker-compose.yml` (ligne
`"8080:80"` → `"8081:80"` par exemple).

---

## La mise en ligne, trois commandes

Le dépôt est public : aucun identifiant n'est nécessaire.

```bash
git clone https://github.com/ngsecurity38/ngsecurity38.git
cd ngsecurity38 && git checkout claude/beautiful-gauss-ycyex1
docker compose -f deploiement/docker-compose.yml up -d
```

Vérifier :

```bash
curl -I http://localhost:8080/outils/etude/
```

Un `200 OK` et c'est en ligne, à `http://72.62.24.92:8080/outils/etude/`.

---

## Le mettre sur votre domaine

Deux façons, selon ce qui tourne déjà.

**Rien devant.** Changez `"8080:80"` en `"80:80"`, relancez, et faites
pointer un sous-domaine (`outils.ngsecurity38.fr`) sur 72.62.24.92 par un
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

**Pas vérifié** — le conteneur lui-même n'a pas pu être lancé : l'environnement
où ces fichiers ont été écrits n'a pas de démon Docker. La configuration nginx
et le fichier compose n'ont donc pas tourné pour de vrai. Si `docker compose
up` proteste, envoyez-moi le message.
