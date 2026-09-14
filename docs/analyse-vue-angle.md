# Analyse de vue d'angle — mode d'emploi

Objectif : prouver, pièce à l'appui, que la caméra installée cadre bien **la vue
d'angle demandée par le client**. L'outil compare l'image de référence et
l'image réellement réglée, chiffre l'écart en degrés, dicte la correction à
appliquer et sort un procès-verbal signable.

L'outil se trouve dans [`outils/analyse-vue-angle/`](../outils/analyse-vue-angle/).
Il s'ouvre en double-cliquant sur `index.html`. Rien n'est envoyé sur Internet :
les images restent sur le poste.

---

## 1. Avant d'aller sur site

Préparer la **vue demandée**. C'est la référence contractuelle : selon le
dossier, une capture validée par le client, une photo de repérage prise lors du
métré, ou un extrait du plan d'implantation.

Créer la fiche dans l'outil :

1. Remplir le bloc **1 · Chantier** (client, site, repère caméra, n° d'affaire).
2. Renseigner le bloc **2 · Caméra et optique** : capteur, focale, résolution,
   distance à la scène, hauteur de pose.
3. Charger la vue demandée dans le premier cadre du bloc **3**.
4. **Enregistrer la fiche** : un fichier `.json` est téléchargé. Il contient
   tout, images comprises. C'est ce fichier que le technicien emporte.

> Les valeurs du bloc 2 ne sont pas décoratives : c'est la focale et le capteur
> qui convertissent un décalage de pixels en degrés. Une focale fausse donne un
> écart faux.

### Vérifier que l'optique tient la promesse

Le bloc 2 affiche en direct la largeur de scène couverte, la densité en
pixels par mètre et le niveau d'exploitation atteint. Le repli **Portées DORI**
donne les distances au-delà desquelles chaque niveau décroche :

| Niveau | Exigence | Ce que permet l'image |
| --- | --- | --- |
| Détection | 25 px/m | dire qu'une personne est présente |
| Observation | 62 px/m | suivre ses déplacements, décrire sa tenue |
| Reconnaissance | 125 px/m | reconnaître quelqu'un de connu |
| Identification | 250 px/m | identifier un inconnu, exploitable en justice |

Le repli **Aide au choix de focale** fait le calcul inverse : pour couvrir telle
largeur à telle distance, il donne la focale à monter.

---

## 2. Sur site, après la pose

1. Ouvrir la fiche (**Ouvrir une fiche…**).
2. Prendre une capture de l'image de la caméra et la charger dans le second
   cadre du bloc **3**. Trois façons de faire : glisser le fichier, cliquer sur
   le cadre, ou faire une copie d'écran et coller avec `Ctrl+V`.
3. Cliquer sur **Analyser la conformité**.

Le verdict s'affiche en bas :

- **Conforme** — tous les écarts sont dans les tolérances, rien à reprendre.
- **Ajustement mineur** — reprise rapide, la consigne indique quoi faire.
- **Non conforme** — le réglage est à refaire.
- **Recalage non concluant** — l'outil n'a pas pu rapprocher les deux images
  (voir le § 5).

Les consignes sont directement exploitables : « Pivoter la caméra de 6,4° vers
la gauche », « Relever la caméra de 2,4° », « Élargir le champ de 12 % (focale
conseillée : 3,6 mm) ».

### Les quatre modes de comparaison

| Mode | À quoi il sert |
| --- | --- |
| **Côte à côte** | voir les deux vues brutes, tracer les zones d'intérêt |
| **Superposition** | juger de l'alignement au curseur d'opacité |
| **Rideau** | balayer d'une vue à l'autre, très parlant devant le client |
| **Différence** | faire ressortir uniquement ce qui a bougé |

Trois cases complètent l'affichage :

- **Appliquer le recalage** — superpose les vues après correction de l'écart
  mesuré. Décochée, elle montre le décalage brut.
- **Grille des tiers** — repères de cadrage.
- **Réticules et écart** — le réticule bleu marque le centre demandé, le rouge
  le centre actuel ; la flèche jaune donne le sens de la correction.

---

## 3. Zones d'intérêt

Pour vérifier qu'un point précis reste dans le champ (portail, caisse, quai de
livraison, allée) :

1. Cliquer sur **Tracer une zone d'intérêt**.
2. Sur la vue demandée (à gauche), tracer le rectangle par cliquer-glisser.
3. Nommer la zone dans la liste qui apparaît sous les vues.

L'outil reporte la zone dans l'image réglée et indique le pourcentage encore
couvert. Le seuil d'exigence se règle dans le bloc **4** (95 % par défaut).

---

## 4. Tolérances de réception

| Réglage | Défaut | Signification |
| --- | --- | --- |
| Pointage | ± 2° | écart admis en panoramique et en site |
| Aplomb | ± 1,5° | défaut d'horizontalité admis |
| Cadrage | ± 5 % | écart de largeur de champ admis |
| Couverture zone | 95 % | part minimale d'une zone d'intérêt à conserver |

Ces valeurs correspondent à une pose soignée. Les resserrer pour une caméra
d'identification sur un passage étroit ; les desserrer pour une vue d'ensemble
de parking. Ce sont elles qui décident du verdict : à fixer avec le client
**avant** la réception, pas après.

---

## 5. Quand le recalage automatique échoue

L'outil annonce « recalage non concluant » quand les deux images ne se
ressemblent pas assez. Les causes habituelles :

- la vue demandée est un **plan ou un croquis**, pas une photo ;
- les deux prises de vue ont été faites depuis **des emplacements différents** ;
- la scène a **réellement changé** (chantier, saison, véhicules déplacés) ;
- le décalage dépasse les trois quarts du champ : il ne reste presque plus rien
  en commun.

Ouvrir alors le repli **Recalage manuel** dans le bloc 5 et ajuster les quatre
curseurs jusqu'à la superposition. Les écarts et le verdict se recalculent en
direct, et le rapport indique que le recalage a été fait à la main.

---

## 6. Rapport et archivage

**Rapport / Impression** ouvre la boîte d'impression du navigateur. Choisir
« Enregistrer au format PDF » pour obtenir le procès-verbal : chantier,
configuration optique, les deux vues, le tableau des écarts, les consignes, les
zones d'intérêt, les observations et les deux cadres de signature.

**Enregistrer la fiche** produit le `.json` complet. À conserver dans le dossier
d'affaire : rouvert plus tard, il rejoue l'analyse à l'identique et sert de
référence lors d'un contrôle annuel ou d'une contestation.

---

## 7. Mettre l'outil en ligne sur le site

Utile pour y accéder depuis une tablette sans rien installer.

### Par FTP (recommandé)

1. Se connecter au serveur en FTP/SFTP (identifiants de l'hébergeur).
2. Ouvrir le dossier public du site (`public_html`, `www` ou `httpdocs`).
3. Y créer un dossier `outils`.
4. Copier dedans le dossier `analyse-vue-angle` **entier**, en conservant la
   structure (`index.html`, `styles.css` et le sous-dossier `js`).
5. L'outil est accessible à
   `https://ngsecurity38.fr/outils/analyse-vue-angle/`.

### Ajouter le lien dans l'espace professionnels

Même méthode que pour les liens inter-sites (voir
[`liens-inter-sites.md`](liens-inter-sites.md)) : **Apparence > Menus >
Liens personnalisés**, URL
`https://ngsecurity38.fr/outils/analyse-vue-angle/`, texte « Analyse de vue
d'angle ».

Pour un bouton dans une page, bloc **HTML personnalisé** :

```html
<p style="text-align:center;margin:32px 0;">
  <a href="/outils/analyse-vue-angle/"
     target="_blank"
     rel="noopener"
     style="display:inline-block;padding:16px 34px;background:#c8102e;
            color:#ffffff;font-size:18px;font-weight:700;text-decoration:none;
            border-radius:6px;font-family:inherit;">
    Ouvrir l'analyse de vue d'angle &rarr;
  </a>
</p>
```

### Réserver l'accès aux techniciens

La page ne contient aucune donnée client : ce sont les fiches `.json`, qui
restent sur le poste, qui en contiennent. Si l'accès doit malgré tout être
restreint, deux solutions côté hébergeur :

- protéger le dossier `outils/` par mot de passe (`.htpasswd`, proposé dans la
  plupart des panneaux d'hébergement) ;
- ou ne pas le mettre en ligne du tout et travailler depuis une copie locale sur
  la tablette — l'outil fonctionne sans connexion.

> Ne pas coller le contenu de `index.html` dans un bloc HTML WordPress : la page
> a besoin de ses fichiers `styles.css` et `js/`, et WordPress bloque les
> modules JavaScript insérés de cette façon. Passer par l'upload FTP.

---

## 8. Ce que l'outil ne fait pas

- Il ne corrige pas la **distorsion** des objectifs très grand-angle. Les
  écarts restent justes au centre et se dégradent vers les bords de l'image.
- Il ne compare que des vues prises **du même endroit**. Il mesure une erreur
  de pointage, pas une erreur d'emplacement du mât.
- Il ne juge pas la qualité d'image (netteté, bruit, exposition) : uniquement le
  cadrage.
