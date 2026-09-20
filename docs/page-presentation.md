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
| `url` | oui | la fiche produit — sans elle, le produit n'est pas affiché |
| `image` | non | photo du produit |
| `prixTtc` | non | prix de vente TTC |
| `focale` | non | en mm, objectif fixe |
| `focaleMin` / `focaleMax` | non | en mm, objectif réglable |
| `resH` | non | 3840 (4K), 2560 (4 MP), 1920 (1080p) |
| `capteur` | non | `1/2.8"` par exemple — sinon supposé, et la page le dit |

**Sans `focale` ni `resH`, le produit est affiché sans portée annoncée.** La
page ne calcule rien qu'elle ne puisse justifier, et elle vous signale en bas
de la grille ce qu'il lui manque pour mieux faire.

Un produit sans `url` n'est pas affiché : une vignette sur laquelle on ne
peut pas cliquer ne sert personne, et la page vous dit combien elle en a
écartés.

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

## 4. Le lien dans le menu

Admin WordPress → **Apparence > Menus** → **Liens personnalisés** :

- URL : `https://ngsecurity38.fr/outils/etude/`
- Texte : `Quelle caméra me faut-il ?`

Pour l'intégrer dans une page existante plutôt que seule :

```html
<iframe src="/outils/etude/" style="width:100%;height:2400px;border:0"
        title="Quelle caméra vous faut-il ?"></iframe>
```

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
