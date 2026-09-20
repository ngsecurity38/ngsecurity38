# La page de présentation

Objectif : que vos visiteurs comprennent **ce dont ils ont besoin** avant
d'acheter, et qu'ils arrivent sur vos fiches produits en sachant ce qu'ils
cherchent.

La page ne chiffre aucune installation — c'est le rôle de la page d'étude.
Elle explique, elle montre, et elle renvoie.

> **Un site ou deux, au choix.** Telle qu'elle est livrée, la page reste sur
> le site qui la sert : « Lancer l'étude » mène à `/outils/devis/` du même
> domaine, « Voir nos caméras » à sa racine. C'est ce qu'il faut si tout est
> sur **ngsecurity38.fr**. Pour renvoyer vers l'autre site, il suffit de
> mettre les adresses complètes dans `catalogue.json` (§3).

---

## 1. Ce qu'il y a sur la page

1. **Un titre et deux boutons** : « Lancer l'étude » (vers le `.fr`) et
   « Voir nos caméras » (vers la boutique).
2. **Comment ça marche** : les trois gestes, en trois phrases.
3. **Ce que « voir » veut dire** : les quatre paliers de la norme
   EN 62676-4, dessinés à l'échelle des distances. Le rapport de dix entre
   « repérer une présence » et « identifier un inconnu » se voit d'un coup
   d'œil. C'est l'argument que vos concurrents n'expliquent pas.
4. **Nos caméras** : vos produits, avec pour chacun ce qu'il embrasse de
   large et jusqu'où il reconnaît une personne.
5. **Ce que l'outil ne fait pas** : trois limites, dites franchement.

Les distances sont calculées avec **les mêmes fonctions optiques que votre
outil d'étude**. Une vitrine qui annoncerait d'autres portées que l'étude
mentirait à moitié.

---

## 2. Mettre la page en ligne

Le dossier `dist/site/etude/` est prêt à être déposé tel quel :

| Fichier | Rôle |
| --- | --- |
| `index.html` | la page |
| `catalogue.json` | vos produits et vos deux adresses |

Par FTP, dans `public_html/`, créer `outils` et y glisser le dossier
`etude` — à côté du dossier `devis`. Sur **ngsecurity38.fr**, la page est
alors à `https://ngsecurity38.fr/outils/etude/`, et son bouton « Lancer
l'étude » tombe juste sans rien éditer.

> Comme pour le `.fr`, cette étape vous revient : personne d'autre n'a accès
> à votre hébergement.

---

## 3. Remplir `catalogue.json`

C'est le seul fichier à modifier. La page le relit à chaque ouverture.

Les deux premières lignes disent où mènent les boutons. Laissées telles
quelles, elles restent sur le site qui sert la page. Mettez des adresses
complètes (`https://…`) seulement si les deux pages sont sur deux domaines.

```json
{
  "outil": "/outils/devis/",
  "boutique": "/",
  "produits": [
    {
      "reference": "Hikvision DS-2CD2T86G2-4I — bullet 8 MP, 4 mm",
      "url": "https://ngsecurity38.com/produit/ds-2cd2t86g2-4i",
      "image": "https://ngsecurity38.com/wp-content/uploads/…jpg",
      "prixTtc": 289.90,
      "resH": 3840,
      "focale": 4
    }
  ]
}
```

| Champ | Obligatoire | Rôle |
| --- | --- | --- |
| `reference` | oui | ce que lit le client |
| `url` | non | la fiche produit. Sans elle, la fiche s'affiche mais ne mène nulle part — c'est légitime sur l'espace professionnel, où il n'y a pas de boutique derrière |
| `angleH` | recommandé | l'angle horizontal **annoncé par le constructeur** |
| `angleHTele` | | idem au téléobjectif, pour un objectif motorisé |
| `image` | non | photo du produit |
| `prixTtc` | non | prix de vente TTC |
| `focale` | non | en mm, objectif fixe |
| `focaleMin` / `focaleMax` | non | en mm, objectif réglable |
| `resH` | non | 3840 (4K), 2560 (4 MP), 1920 (1080p) |
| `capteur` | non | `1/2.8"` par exemple — sinon supposé, et la page le dit |

**Sans `focale` ni `resH`, le produit est affiché sans portée annoncée.** La
page ne calcule rien qu'elle ne puisse justifier, et elle vous signale en bas
de la grille ce qu'il lui manque pour mieux faire.

La page est livrée avec **neuf fiches AcuSense déjà renseignées** — les
angles viennent des fiches Hikvision, avec leur date. Il ne vous reste qu'à
ajouter vos `url` et vos `prixTtc` quand les pages produits existeront.

---

## 3 bis. La bibliothèque d'optiques

`references-optiques.json` est un carnet, pas un catalogue : pour chaque
modèle, ce que le **constructeur** annonce, avec la source qui le dit. Les
onze modèles qui s'y trouvent sont les vôtres, relevés dans votre rapport de
ventes.

S'en servir : copier la ligne voulue dans `catalogue.json`, puis y ajouter
vos deux informations — `url` et `prixTtc`.

### Pourquoi `angleH` plutôt qu'un calcul

Un grand-angle n'est pas rectiligne. Le calcul à partir de la focale et du
capteur le **resserre**, donc gonfle les pixels par mètre annoncés :

| Modèle | Annoncé | Calculé | Écart |
| --- | --- | --- | --- |
| Hikvision DS-2CD2T86G2-4I, 4 mm | 87 ° | 84 ° | +4 % |
| Dahua IPC-HFW3549T1-AS-PV, 2,8 mm | 98 ° | 88 ° | +11 % |
| Hikvision DS-2CD2143G2-I, 2,8 mm | 103 ° | 81 ° | +27 % |
| Axis M2036-LE, 2,4 mm | 130 ° | 96 ° | +35 % |

L'angle annoncé dépasse toujours le calcul, jamais l'inverse — un test le
vérifie sur les onze modèles à chaque construction.

### Nos chiffres sont plus prudents que ceux des constructeurs

Hikvision annonce pour le DS-2CD2T47G2-L une reconnaissance à **14 m**. Nos
pages disent **10 m**. Les deux sont de bonne foi : la norme EN 62676-4 exige
125 pixels par mètre pour reconnaître, et c'est ce seuil que nous appliquons.
Les tableaux DORI des constructeurs sont établis avec des critères plus
généreux.

Si un client vous compare à une fiche produit, la réponse est simple : nos
distances sont celles de la norme, les leurs sont commerciales. C'est un
argument, pas une gêne.

---

## 3 ter. Les caméras mobiles (PTZ)

Une PTZ n'est pas une caméra fixe avec un zoom. Deux choses la distinguent,
et la page les dit toutes les deux.

### Elle ne regarde qu'une direction à la fois

Un 25× « reconnaît à 200 m » — mais seulement là où il pointe. Pendant qu'il
regarde le portail, il ne voit pas le parking. C'est écrit sous chaque fiche
mobile, parce qu'un client qui l'ignore croit acheter une surveillance
panoramique.

### Sa portée s'arrête où s'arrête son éclairage

Le DS-2DE7A825IW-AEB au zoom maximal donne, en pixels seuls, une
reconnaissance à **677 m**. Personne ne peut promettre cela : de nuit son
infrarouge s'arrête à 200 m, et de jour la brume et la turbulence de l'air
font le reste. Hikvision plafonne d'ailleurs ce même modèle à 409 m dans sa
propre table.

La page retient **200 m**, la portée de l'éclairage, renseignée par
`porteeMax`. Sans ce champ, le plafond est de 150 m. Un test refuse qu'une
fiche annonce plus de 300 m en reconnaissance.

### Les trois modèles livrés

| Modèle | Zoom | Champ | Portée retenue |
| --- | --- | --- | --- |
| DS-2DE3A404IW-DE, mini PTZ 4 MP | ×4 | 96,7 → 31,6 ° | 50 m (infrarouge) |
| DS-2DE3A400BW-DE, ColorVu 4 MP | — | 88,7 ° | 30 m (lumière blanche) |
| DS-2DE7A825IW-AEB, 8 MP | ×25 | 50,8 → 2,6 ° | 200 m (infrarouge) |

Pour en ajouter une : `type: "ptz"`, `zoom` tel que le constructeur
l'appelle — un 2,8–12 mm est un ×4, pas un ×4,3 — et `porteeMax`.

---

## 3 quater. Trois façons de mettre les pages en ligne

Selon ce qui fait tourner votre site, une seule de ces trois voies s'applique
vraiment.

### A. Le site est fait de fichiers (hébergement mutualisé, VPS)

C'est le §2 : déposer le dossier `outils/` dans la racine web
(`public_html/`, `/var/www/html/`…). Les deux pages se trouvent l'une
l'autre, le logo est là, rien à régler. **C'est la voie la plus propre.**

### B. Le site est fait avec un créateur de pages

Créateur de site Hostinger, Wix, Webflow… On n'y dépose pas de fichiers, et
l'élément « Code intégré » a ses limites — Hostinger, par exemple, **refuse
les images en `data:`** et répond « embed code is too large ».

La solution : **héberger les pages ailleurs, et n'insérer qu'un cadre.**

1. Dans le dépôt GitHub, **Settings → Pages**
2. Source : *Deploy from a branch* — branche `claude/beautiful-gauss-ycyex1`,
   dossier **`/docs`** → **Save**
3. Après une minute, les pages sont à
   `https://ngsecurity38.github.io/ngsecurity38/outils/etude/` et
   `…/outils/devis/`
4. Dans l'éditeur du site, poser un élément **Code intégré** et y coller
   `dist/site/cadre-a-coller.html` (quatre lignes), avec la bonne adresse

Le cadre isole totalement : aucun conflit de style possible, aucun plafond de
taille, et la page reste entière — logo compris. Ajustez `height` si la page
est coupée.

C'est aussi réversible : le jour où vous passez à la méthode A, vous
remplacez le cadre par un lien.

### C. Coller la page elle-même dans le site

`dist/site/wordpress/etude.html` et `devis.html` sont des blocs autonomes à
coller dans un champ « HTML personnalisé ». Ils montent la page dans une
**racine d'ombre** : le style du site ne les atteint pas, le leur ne déborde
pas. Un test le vérifie sur une page hôte volontairement hostile.

Leurs limites, à connaître avant d'essayer : 50 Ko et 103 Ko de code à
coller, et **pas de logo** — ces blocs le retirent, faute de pouvoir
l'embarquer. Le site qui les accueille porte déjà sa marque, de toute façon.

Une fois les deux pages publiées, relevez leurs adresses et corrigez les
**deux lignes en tête** du bloc de la présentation :

```js
window.__ngsOutil = '../devis/';   /* → l'adresse de la page d'étude   */
window.__ngsBoutique = '/';        /* → l'adresse de vos caméras       */
```

Elles y sont isolées et commentées, dans les six premières lignes. Elles
priment sur tout le reste. **Ce ne sont pas des commandes à exécuter** :
elles se modifient dans un éditeur de texte, à l'intérieur du fichier, avant
de coller.

### Changer les produits, ensuite

Le bloc porte ses données avec lui. La ligne `window.__catalogue={…}`, visible
dans le bloc, se modifie directement dans l'éditeur — c'est le même contenu
que `catalogue.json`.

---

## 4. Le lien dans le menu

Dans le menu de votre site, ajouter une entrée pointant vers l'adresse
retenue au §3 quater :

- Texte : `Quelle caméra me faut-il ?`
- URL : l'adresse de la page

Chaque outil a son propre chemin pour cela — « Liens personnalisés » sous
WordPress, l'éditeur de navigation chez un créateur de pages. Le principe
est le même.

---

## 5. Les deux pages, et ce qui les relie

| | `outils/etude/` | `outils/devis/` |
| --- | --- | --- |
| Rôle | comprendre, choisir | chiffrer |
| Public | qui hésite encore | qui sait ce qu'il veut |
| Fichier à tenir à jour | `catalogue.json` | `tarif.json` |

« Lancer l'étude » mène de la première à la seconde ; le pied de page ramène
aux caméras. **Sur un seul site, rien à régler.** Si un jour la boutique
passe sur `ngsecurity38.com` et l'étude reste sur le `.fr`, il suffit de
mettre les deux adresses complètes dans `catalogue.json` : pas de
reconstruction, pas de renvoi de la page.
