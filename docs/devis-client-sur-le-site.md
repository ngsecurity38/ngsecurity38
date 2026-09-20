# Mettre le devis en libre-service sur ngsecurity38.fr

Objectif : que vos visiteurs estiment eux-mêmes leur installation, depuis votre
site, sans que vous ayez rien à faire. Pas de plugin, pas de base de données,
pas de compte à créer.

La page est un **fichier HTML de 90 Ko** qui tourne entièrement dans le
navigateur du visiteur. Rien ne remonte chez nous ni chez personne : ce qu'il
saisit, et les photos qu'il prend, restent sur son téléphone.

---

## 1. Ce qu'il faut envoyer sur le site

**Le dossier `dist/site/devis/` est prêt à être déposé tel quel.** Il contient
les deux seuls fichiers nécessaires, déjà aux bons noms :

| Fichier | Rôle |
| --- | --- |
| `index.html` | la page |
| `tarif.json` | vos prix — le seul à retoucher ensuite |

Ils doivent rester **dans le même dossier** : c'est à côté d'elle que la page
va lire vos prix. Séparés, elle se rabat en silence sur le tarif embarqué le
jour de la fabrication.

### Par FTP

1. Ouvrir FileZilla et se connecter à l'hébergement.
2. Aller dans le dossier du site : `public_html/` (ou `www/`).
3. Créer un dossier `outils`.
4. Y glisser le dossier `devis` entier, tel qu'il sort de `dist/site/`.
5. Vérifier dans un navigateur : `https://ngsecurity38.fr/outils/devis/`.

La page s'appelle `index.html` pour que l'adresse reste courte et se retienne.

> **Cette étape vous revient.** Personne d'autre n'a accès à votre hébergement :
> tant que le dossier n'est pas déposé, rien n'est en ligne.

### Par le gestionnaire de fichiers de l'hébergeur

Chez Hostinger : **hPanel → Fichiers → Gestionnaire de fichiers**. Entrer
dans `public_html`, **Téléverser** l'archive, puis clic droit → **Extraire**.
Plus simple que FileZilla, et sans rien installer.

> **Si votre site est fait avec un créateur de pages** (créateur Hostinger,
> Wix, Webflow…), cette méthode ne s'applique pas : ces sites ne servent pas
> de fichiers que vous déposez. Voir la notice de la page de présentation,
> § « Trois façons de mettre les pages en ligne ».

---

## 2. Avant d'envoyer : trois choses à régler

### L'adresse qui reçoit les demandes

Elle est réglée sur **`contact@ngsecurity38.com`**, la boîte de votre
hébergement Hostinger. Pour en changer, dans `js/devis-client.js` :

```js
const CONTACT = 'contact@ngsecurity38.com';
```

puis relancer `npm run build`. **Laissée vide, le bouton « Demander une
étude » n'apparaît pas** — mieux vaut pas de bouton qu'un lien vers une
adresse qui n'existe pas.

N'y mettez jamais une adresse personnelle : la page est servie en clair et
l'adresse y sera moissonnée par les robots.

La demande qui vous parvient contient le type de site, la durée de
conservation, le métrage de câble estimé, le total, **et zone par zone ce que
la photo a mesuré** — angle, distance du fond, largeur, hauteur de pose,
caméra retenue. Elle invite aussi le visiteur à joindre son fichier `.json`,
que vous rouvrez dans la page pour retrouver ses photos et ses tracés.

### Vos prix

Ouvrir `tarif.json` dans un éditeur de texte. Le fichier porte ses propres
explications en tête. Il faut au minimum une ligne par type :

| `type` | Champs attendus en plus du prix |
| --- | --- |
| `camera` | `debit` en Mbit/s |
| `switch` | `ports`, `portsPoe`, `budgetPoe` en watts |
| `nvr` | `canaux` |
| `disque` | `capacite` en Go |
| `routeur`, `ecran`, `connectique`, `coffret` | rien de plus |
| `cable` | prix **au mètre** |

Tant qu'un type manque, la page le dit au visiteur (« Aucun enregistreur au
tarif — cet élément sera chiffré lors de l'étude ») au lieu de composer une
installation incomplète en silence.

### Le bandeau « tarif d'exemple »

Dans `tarif.json` :

```json
"exemple": false
```

Tant qu'il vaut `true`, la page affiche en haut que les montants n'engagent
personne. À passer à `false` **une fois vos prix saisis**, pas avant.

---

## 3. Le lien dans le menu

Ajouter une entrée pointant vers `https://ngsecurity38.fr/outils/devis/`,
intitulée `Estimer mon installation`.

Chaque outil a son chemin : **Apparence > Menus > Liens personnalisés** sous
WordPress, l'éditeur de navigation chez un créateur de pages.

---

## 4. L'intégrer dans une page existante

Pour que l'outil apparaisse *dans* une page du site plutôt que seul :

1. Créer une page (par exemple « Estimer mon installation »).
2. Y poser un bloc **HTML personnalisé** ou **Code intégré**.
3. Y coller :

```html
<iframe src="/outils/devis/" style="width:100%;height:1600px;border:0"
        title="Estimer mon installation de vidéosurveillance"></iframe>
```

La hauteur est fixée à la main : l'outil est long, et un cadre trop court
obligerait à faire défiler dans le défilement. 1600 pixels conviennent à la
plupart des cas ; ajustez si besoin.

---

## 5. Mettre les prix à jour, plus tard

**Un seul fichier à remplacer : `tarif.json`.** La page le relit à chaque
ouverture. Ni reconstruction, ni renvoi de la page, ni intervention de notre
part.

Pour ne pas tout retaper, l'outil d'étude sait l'exporter : repli **Devis**,
bouton **Exporter le tarif client**. Il reprend le matériel du synoptique
portant à la fois une référence et un prix. Les disques s'ajoutent à la main.

---

## 6. Prévenez vos visiteurs qu'ils peuvent photographier

C'est la fonction qui change tout, et elle est facultative — donc facile à
manquer. Dans le texte de présentation de la page sur votre site, dites-le
franchement :

> Prenez trois photos depuis l'endroit où vous voulez poser vos caméras,
> entourez ce que vous voulez surveiller, et vous saurez quelle caméra il vous
> faut et jusqu'où elle verra.

Un visiteur qui répond seulement aux quatre questions obtient un ordre de
grandeur. Celui qui photographie obtient une vraie mesure — et vous, une demande
qualifiée avec ses photos, ses repères et ses zones dans un fichier que vous
ouvrez directement.

---

## 7. Ce que cette page ne fait pas

Elle ne remplace pas une étude, et elle le dit au visiteur à trois endroits :
en résumé, dans le repli « ce que cette estimation ne peut pas savoir », et en
pied de page.

Elle ne fait pas non plus :

- de **panier ni de paiement** — c'est le rôle de la boutique ;
- de **compte client ni de dossier chez nous** — le projet est bien conservé,
  mais dans le navigateur du visiteur seul ; il nous parvient s'il nous envoie
  le fichier `.json` que la page lui exporte, ou son impression ;
- d'**analyse automatique du contenu des photos** — la page mesure les angles
  et les distances à partir des repères que le visiteur pose lui-même, mais elle
  ne reconnaît ni portail, ni façade, ni caméra existante sur l'image ;
- de **suivi ni de statistiques** — aucun traqueur, aucun cookie.

Ces briques demandent un serveur et une base de données. Elles figurent à la
feuille de route du cahier des charges, aux phases 2 et suivantes.
