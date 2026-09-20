# La page de présentation sur ngsecurity38.com

Objectif : que vos visiteurs de la boutique comprennent **ce dont ils ont
besoin** avant d'acheter, et qu'ils arrivent sur vos fiches produits en
sachant ce qu'ils cherchent.

La page ne chiffre aucune installation — c'est le rôle de l'outil sur
l'espace professionnel. Elle explique, elle montre, et elle renvoie.

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

Par FTP, dans `public_html/` de **ngsecurity38.com**, créer `outils` et y
glisser le dossier `etude`. La page est alors à
`https://ngsecurity38.com/outils/etude/`.

> Comme pour le `.fr`, cette étape vous revient : personne d'autre n'a accès
> à votre hébergement.

---

## 3. Remplir `catalogue.json`

C'est le seul fichier à modifier. La page le relit à chaque ouverture.

```json
{
  "outil": "https://ngsecurity38.fr/outils/devis/",
  "boutique": "https://ngsecurity38.com/",
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

## 4. Le lien dans le menu

Admin WordPress du `.com` → **Apparence > Menus** → **Liens personnalisés** :

- URL : `https://ngsecurity38.com/outils/etude/`
- Texte : `Quelle caméra me faut-il ?`

Pour l'intégrer dans une page existante plutôt que seule :

```html
<iframe src="/outils/etude/" style="width:100%;height:2400px;border:0"
        title="Quelle caméra vous faut-il ?"></iframe>
```

---

## 5. Les deux sites, et ce qui les relie

| | `ngsecurity38.com` | `ngsecurity38.fr` |
| --- | --- | --- |
| Public | particuliers, acheteurs | professionnels |
| Page | présentation + catalogue | étude chiffrée |
| Dossier | `dist/site/etude/` | `dist/site/devis/` |
| Fichier à tenir à jour | `catalogue.json` | `tarif.json` |

Le bouton « Lancer l'étude » du `.com` mène à l'outil du `.fr`. Le pied de la
page d'étude ramène à la boutique. Les deux adresses se règlent dans
`catalogue.json` — pas besoin de reconstruire pour les changer.
