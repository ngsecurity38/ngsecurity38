# Analyse de vue d'angle — mode d'emploi

Objectif : prouver, pièce à l'appui, que la caméra installée cadre bien **la vue
d'angle demandée par le client**. L'outil compare l'image de référence et
l'image réellement réglée, chiffre l'écart en degrés, dicte la correction à
appliquer et sort un procès-verbal signable.

Rien n'est envoyé sur Internet : les images et les fiches restent sur le poste.

---

## 1. Installation sur un PC ou une tablette

Un seul fichier à récupérer — deux versions au choix :

| Version | Poids | Pour qui |
| --- | --- | --- |
| [`analyse-vue-angle.html`](../outils/analyse-vue-angle/dist/analyse-vue-angle.html) | 1,5 Mo | le cas courant : études reçues en PDF normal |
| [`analyse-vue-angle-ocr.html`](../outils/analyse-vue-angle/dist/analyse-vue-angle-ocr.html) | 7,6 Mo | si vos études arrivent **scannées** (§ 8) |

Les deux sont le même outil. La seconde embarque en plus un moteur de
reconnaissance de caractères, qui pèse à lui seul près de 5 Mo : inutile de le
transporter si vos clients vous remettent des PDF ordinaires.

**Sur un PC (Windows ou Mac)**

1. Copier le fichier où l'on veut — bureau, dossier de l'affaire, clé USB.
2. Double-cliquer dessus : il s'ouvre dans le navigateur par défaut.
3. Pour le retrouver vite : clic droit sur l'onglet > **Ajouter aux favoris**.

**Sur une tablette (iPad ou Android)**

1. Envoyer le fichier sur la tablette (câble, e-mail à soi-même, cloud interne).
2. L'enregistrer dans **Fichiers** (iPad) ou **Téléchargements** (Android).
3. Appuyer dessus : il s'ouvre dans Safari ou Chrome.
4. Pour un accès direct : menu de partage > **Sur l'écran d'accueil**.

Aucune installation, aucun compte, aucune connexion nécessaire. Le fichier
contient l'outil en entier, lecteur de PDF compris.

> **Ne pas extraire le fichier d'un dossier de sources.** Le dossier
> `outils/analyse-vue-angle/` sert au développement et à la mise en ligne : ses
> pages ne s'ouvrent pas correctement en double-clic, les navigateurs bloquant
> les modules JavaScript depuis le disque. Sur un poste, c'est toujours
> `dist/analyse-vue-angle.html` qu'on utilise.

Après chaque mise à jour de l'outil, il suffit de remplacer ce fichier par le
nouveau : les fiches `.json` déjà enregistrées restent lisibles.

---

## 2. Un dossier, plusieurs caméras

Une réception ne porte pas sur une caméra mais sur un chantier. Une fiche
décrit donc **un dossier** : les renseignements de chantier, les tolérances
convenues, l'étude de référence, et autant de caméras que le site en compte.

La barre sous le titre porte un onglet par caméra :

- **+ Ajouter** crée une caméra. Elle reprend l'optique de la précédente —
  sur un même chantier, le matériel est le plus souvent identique d'un poste à
  l'autre — mais repart sans images ni analyse.
- Cliquer sur un onglet bascule dessus. Tout suit : images, optique,
  zones d'intérêt, analyse, observations.
- **Supprimer** retire la caméra affichée. Un dossier garde toujours au moins
  une caméra.

La pastille de chaque onglet donne le verdict d'un coup d'œil — vert conforme,
orange ajustement, rouge non conforme, cercle vide pas encore analysée — et le
compteur de droite annonce l'avancement : « 4/6 conformes — 2 caméras à
analyser ». C'est le tableau de bord de la journée.

Ce qui est **commun au dossier** : client, site, technicien, date, affaire,
tolérances de réception, étude de référence. Ce qui est **propre à chaque
caméra** : son repère, son optique, ses deux vues, ses zones, son analyse et ses
observations.

Un seul fichier `.json` enregistre tout le dossier, et le procès-verbal couvre
tout le chantier (§ 13).

> Les fiches enregistrées avec la première version de l'outil s'ouvrent
> toujours : elles deviennent un dossier d'une seule caméra, sans rien perdre.

---

## 3. Étude depuis la photo — le point de départ

C'est le chemin principal, et l'outil l'annonce dès l'ouverture : l'écran
d'accueil propose **deux façons de travailler** — *proposer une installation*
depuis une photo, ou *réceptionner une installation* en comparant deux vues. Le
bloc d'étude est le premier de la colonne de gauche, encadré en rouge ; les
blocs numérotés 1 à 6 sont ceux de la réception et ne servent qu'après la pose.

On revient du repérage avec des photos prises depuis l'emplacement prévu de
chaque caméra ; l'outil en tire tout le reste.

1. **Charger la photo** dans le bloc *Étude depuis la photo*. Ou, si la caméra
   est déjà en place, reprendre son image d'un bouton.
2. **Renseigner la hauteur** de prise de vue, et choisir l'appareil dans la
   liste — téléphone, ultra grand-angle, caméra en place. C'est ce qui donne le
   champ de la photo.
3. **Poser deux repères.** Saisir une distance connue, cliquer le point du sol
   qui s'y trouve ; recommencer avec un second point, plus haut dans l'image.
   Un portail, l'angle d'un bâtiment, une place de parking suffisent.

   Ces deux repères lèvent les deux inconnues : **l'angle de vue de la photo et
   son inclinaison sont mesurés, plus supposés**. Le panneau l'affiche en
   toutes lettres — « champ mesuré : 59,6° ». Avec un seul repère, l'outil se
   rabat sur le champ déclaré de l'appareil et annonce « champ supposé ».

   Des lignes de distance apparaissent alors sur la photo — 10 m, 15 m, 20 m,
   30 m… posées à l'endroit exact où elles tombent.
4. **Entourer la zone** que le client veut voir couverte, au cliquer-glisser.

   La zone reste **maniable** : la saisir en son milieu pour la **déplacer**,
   tirer un de ses huit **coins ou bords** pour la **redimensionner**, attraper
   un **repère** pour le replacer. Tout se recalcule à chaque relâchement —
   focale, portées, matériel, tracé d'angle. On ajuste le cadrage devant le
   client jusqu'à ce qu'il couvre exactement ce qu'il veut voir, au lieu de
   recommencer le tracé à chaque essai.

   Le curseur dit ce que fera le geste : croix pour déplacer, double flèche
   orientée pour redimensionner, main pour un repère. Le bouton **Entourer la
   zone** force, lui, un nouveau tracé depuis zéro.

L'analyse se fait alors seule, **sous la photo** — pas dans la colonne de
saisie, où elle passait inaperçue :

| | |
| --- | --- |
| Angle de vue nécessaire | ce qu'il faut embrasser pour couvrir la zone |
| **Focale à poser** | l'objectif qui donne exactement cet angle |
| Zone la plus proche / la plus éloignée | distances réelles des deux bords |
| Largeur au fond de zone | largeur embrassée au point le plus lointain |
| Définition au fond | pixels par mètre à cette distance |
| **Niveau garanti** | détection, observation, reconnaissance ou identification |

Puis, dans le même panneau, **le matériel proposé** : la caméra du catalogue qui
donne cette focale et le zoom à y régler, suivie des autres qui conviennent — au
plus quatre, parce qu'au-delà les varifocaux d'une même plage donnent tous le
même réglage et que le choix se fait alors sur le boîtier ou le prix. Et un
tableau des portées — jusqu'où on détecte, observe, reconnaît, identifie.

Quand aucun modèle du catalogue ne convient, l'outil le dit et donne la focale
du commerce la plus proche, plutôt que de proposer la moins mauvaise.

### Le tracé d'angle

Sous la photo, l'outil **dessine le champ vu de dessus** : la caméra, son cône à
l'angle calculé, et des arcs marquant la distance au-delà de laquelle chaque
niveau d'exploitation décroche. C'est le tracé qui figure sur les études
d'implantation, produit sans plan ni vue aérienne, à partir des seules mesures
faites sur la photo.

Sur un écran large, la photo et le tracé se placent **côte à côte** : on voit du
même coup d'œil la zone entourée et la portée qu'elle demande. Sur tablette ou
écran étroit, ils s'empilent, chacun limité à la hauteur de la fenêtre.

**Exporter la photo annotée** enregistre les deux images : la photo avec sa zone
et ses distances, et le tracé d'angle. Les deux figurent aussi dans la
proposition client.

> **Les lignes de distance ne sont pas décoratives.** Elles montrent que
> l'échelle tient : si la ligne des 20 m ne tombe pas là où vous savez que se
> trouvent 20 m, c'est que la hauteur ou le point de calage sont à revoir. Un
> coup d'œil suffit à valider toute la mesure.

### La proposition client

Le bouton **Proposition client** produit le document à remettre :

1. l'affaire — client, site, n° d'affaire, date ;
2. une **synthèse** d'une ligne par caméra : zone couverte, angle de vue,
   matériel préconisé, exploitation garantie ;
3. par caméra : la **photo annotée** avec la zone et les distances, le **tracé
   d'angle** vu de dessus, le tableau du matériel préconisé, et un tableau
   **« Ce que permettra l'image »** en français courant — « reconnaître une
   personne déjà connue : jusqu'à 14 m » ;
4. les **méthode et hypothèses** en toutes lettres — sol supposé plan, valeurs
   de jour, mise en œuvre soumise au relevé définitif ;
5. les deux cadres de signature.

C'est un document commercial, distinct du procès-verbal de réception (§ 13) :
l'un dit ce qui est proposé, l'autre constate ce qui a été posé.

> Une proposition qui tait ses conditions de validité n'engage personne. Les
> hypothèses figurent donc dans le document, pas dans un coin de tête.

---

## 4. Synoptique de câblage — « ça passe, en longueur ? »

C'est la question que pose tout client dès que le devis arrive. Le bloc **C ·
Synoptique de câblage** y répond en mesurant, pas en estimant.

1. **Charger une vue aérienne** du site — ou reprendre celle du bloc B d'un
   bouton, calibrage compris.
2. **Calibrer** : saisir une distance connue, cliquer ses deux extrémités. Un
   portail, une façade, deux poteaux d'éclairage. C'est ce qui donne l'échelle.
3. **Poser le matériel** : caméra, switch PoE, enregistreur, écran, baie. Le
   bouton **Poser les caméras de la fiche** place d'un coup toutes celles du
   dossier, à glisser ensuite à leur place.
4. **Relier** : cliquer le matériel de départ, puis celui d'arrivée. Un clic
   dans le vide entre les deux pose un **point de passage** — c'est ainsi qu'on
   fait contourner un bâtiment au câble au lieu de le faire voler.

Chaque liaison porte alors sa longueur, à l'écran et dans un tableau.

### Deux longueurs, et il ne faut pas les confondre

| | |
| --- | --- |
| **Au plan** | la longueur du trait, à plat, telle que le plan la donne |
| **Descentes** | les montées et descentes verticales aux deux extrémités — une caméra à 4 m ne se raccorde pas au ras du sol |
| **Câble à prévoir** | (au plan + descentes) + la réserve, réglable, 10 % par défaut |

C'est la troisième qu'on commande. Les deux premières servent à comprendre d'où
elle sort.

### Ce que l'outil refuse de laisser passer

- **Une liaison de plus de 90 m.** C'est la limite du lien permanent en cuivre
  (EN 50173-1 / ISO 11801 : 90 m de câble fixe, 100 m pour le canal complet
  avec les cordons). Au-delà, le lien ne fonctionne plus de façon garantie :
  l'outil le signale en rouge et rappelle les trois issues — switch
  intermédiaire, répéteur PoE, ou fibre.
- **Un matériel au bout d'aucun câble.** Posé, oublié, jamais relié.
- **Une caméra qui ne remonte à aucun enregistreur**, même par les switches.

Ces trois relevés figurent aussi au dossier, sous « Points à traiter ».

### L'arborescence

À côté du plan, l'outil dessine **le synoptique logique** : qui dépend de qui,
l'enregistreur en haut, les switches au milieu, les caméras en bas. Le plan dit
où passent les câbles ; l'arborescence dit comment l'installation est
construite. Les deux répondent à des questions différentes, et les deux
figurent au dossier.

Un matériel relié à rien y apparaît quand même, rangé en bas : un oubli doit se
voir, pas disparaître du schéma.

### Au dossier

Le **procès-verbal** et la **proposition client** portent tous deux une section
*Synoptique de câblage* : les deux images, l'inventaire du matériel, le tableau
des longueurs avec son total, et les points à traiter. Sur la proposition, une
réserve rappelle que les cheminements figurés sont ceux de l'étude et que le
relevé définitif peut les modifier.

Si le plan n'a pas été calibré, le dossier le dit au lieu d'avancer des
longueurs : le matériel se pose et les liaisons se tracent sans échelle, mais
rien n'est chiffré.

---

## 5. Enregistrement et alimentation

Le repli **Enregistrement et alimentation**, sous le synoptique, répond à la
question du devis : quelle capacité, quel switch.

### Combien de téraoctets

Vous renseignez le **débit** de chaque caméra dans sa fiche — il figure sur la
fiche technique, et souvent dans l'étude du client (« DÉBIT CAMÉRA 8 Mbits/s »).
Vous choisissez la durée de conservation, les heures par jour et la marge.

Le calcul est celui de la profession :

```
débit cumulé (Mbit/s) × 10,8 × jours × (heures par jour ÷ 24) × (1 + marge)
```

10,8 parce qu'un mégabit par seconde pendant vingt-quatre heures fait
10,8 gigaoctets. L'exemple de référence :

```
8 caméras × 5 Mbit/s      = 40 Mbit/s
40 × 10,8                 = 432 Go par jour
432 × 30 jours            = 12 960 Go
+ 20 % de marge           = 15 552 Go
→ disque de 16 To
```

L'outil affiche directement : *« Pour 8 caméras totalisant 40 Mbit/s,
enregistrées 24 h/24 pendant 30 jours, la capacité recommandée est de 15,6 To
(marge de 20 % comprise). »*

Les téraoctets sont **décimaux**, comme les étiquettes des fabricants : un
disque annoncé 16 To offre bien 16 × 10¹² octets. C'est l'affichage du système,
en Tio, qui montrera 14,5 — différence d'unité, pas de capacité perdue.

> **Si vous n'avez pas encore les débits**, le bouton **Estimer les débits
> manquants** en propose un d'après la définition de chaque caméra, la cadence
> et le codec. C'est un ordre de grandeur pour démarrer, pas une valeur de fiche
> technique : un débit supposé faux se paie en téraoctets. Remplacez-le dès que
> vous avez le vrai.

### Le calcul dans l'autre sens

Renseignez la **capacité installée** sur la fiche de l'enregistreur, et l'outil
dit ce qu'elle tient réellement : *« 8 000 Go pour 15 552 Go nécessaires —
15,4 jours tenus au lieu de 30. »* C'est souvent là que se joue la discussion
avec le client : trente jours ou quinze, le prix du disque n'est pas le même.

### Les huit contrôles

L'outil relève, en rouge ce qui empêchera l'installation de fonctionner, en
ambre ce qui la fragilise :

| Contrôle | Ce qu'il attrape |
| --- | --- |
| **Adresse IP en double** | deux appareils sur la même adresse |
| **Adresse mal formée** | `192.168.1.300`, un zéro en tête |
| **Ports dépassés** | plus d'appareils que le switch n'a de ports |
| **Ports PoE dépassés** | plus de caméras à alimenter que de ports PoE |
| **Budget PoE dépassé** | la somme des consommations passe le budget du switch |
| **Canaux de l'enregistreur** | plus de caméras que de canaux |
| **Caméra sans PoE** | raccordée à un switch qui n'alimente pas : injecteur à prévoir |
| **Capacité insuffisante** | le disque installé ne tient pas la durée demandée |

Un contrôle ne dit jamais « peut-être » : tant qu'une donnée manque pour
trancher, il se tait plutôt que d'alarmer à tort. C'est pourquoi les champs de
fiche partent à zéro — zéro veut dire « non renseigné ».

### Les classes PoE

Quand vous saisissez la consommation d'une caméra, l'outil dit quelle classe
suffit :

| Classe | Au port | Utile au bout du câble |
| --- | --- | --- |
| PoE (802.3af) | 15,4 W | 12,95 W |
| PoE+ (802.3at) | 30 W | 25,5 W |
| PoE++ type 3 (802.3bt) | 60 W | 51 W |
| PoE++ type 4 (802.3bt) | 100 W | 71 W |

La différence entre les deux colonnes part en échauffement du câble.
Dimensionner un switch sur la seule puissance des caméras, c'est le
sous-dimensionner.

### Au dossier

La section *Synoptique de câblage* des deux documents porte le détail du
calcul — débit cumulé, volume par jour, durée, marge, capacité, disques — et
non seulement son résultat. Un client qui voit « 16 To » sans savoir d'où ça
sort n'a aucun moyen de discuter la durée de conservation, qui est pourtant le
premier levier sur le prix.

---

## 6. Concevoir un champ sur plan

L'outil sert dans les deux sens. Les sections suivantes vérifient qu'une caméra
posée respecte l'étude ; celle-ci fait l'inverse : **tracer le champ voulu sur
une vue aérienne, et en déduire la caméra et le zoom**.

C'est le geste des études d'implantation, où la couverture est dessinée en cônes
sur une photo satellite. Bloc **Champ sur plan**, dans la colonne de gauche.

1. **Charger le plan** — une capture de vue aérienne, ou directement la page de
   plan du PDF de l'étude.
2. **Étalonner.** Saisir une distance connue (largeur d'une cour, longueur d'un
   bâtiment, entraxe de deux poteaux), puis cliquer les deux points
   correspondants. Sans cette échelle, aucune distance n'est mesurable — c'est
   l'étape qui conditionne tout le reste.
3. **Placer la caméra** d'un clic, à l'emplacement du mât ou de la façade.
4. **Viser la zone** : cliquer le point le plus éloigné à couvrir. La direction
   et la portée en découlent.
5. **Régler l'ouverture** au curseur jusqu'à ce que le cône couvre la zone.

L'outil affiche alors en direct :

| | |
| --- | --- |
| Portée visée | distance réelle jusqu'au point visé |
| Azimut | direction de visée, 0° au nord du plan |
| Largeur couverte | largeur de scène embrassée à cette portée |
| **Focale nécessaire** | l'objectif qui donne exactement cette ouverture |
| Densité à la portée | pixels par mètre au point le plus éloigné |
| Niveau atteint | détection, observation, reconnaissance ou identification |

Et, juste en dessous, **la caméra à poser et le zoom à régler**, pris dans le
catalogue (§ ci-dessous).

### Dans l'autre sens : le champ réel d'une caméra choisie

Cocher **Suivre la focale saisie au bloc 2** : l'ouverture n'est plus réglée à
la main, elle est déduite de l'objectif. Le cône dessiné devient alors le champ
**réel** de la caméra retenue — de quoi vérifier sur le plan qu'elle couvre bien
ce qu'on attend d'elle, avant de monter sur l'échelle.

### Le catalogue du matériel

Le repli **Catalogue du matériel** liste les caméras que vous posez :
référence, voie (thermique, contexte…), focale minimale et maximale, type. Une
focale fixe se saisit deux fois la même valeur ; un varifocal, avec ses deux
bornes.

L'outil y cherche ce qui donne la focale calculée, et dit quoi faire :
« focale fixe 4 mm, rien à régler », ou « varifocal 2,7–13,5 mm, régler le zoom
sur 5,2 mm ». Si rien ne convient, il le dit et propose la focale du commerce la
plus proche.

Le catalogue est livré **pré-rempli de 28 références, toutes tirées d'un
document** — aucune n'a été composée de mémoire :

| Origine | Ce qu'elle apporte |
| --- | --- |
| Brochure **Hikvision AcuSense** (éd. française, juil. 2021) | 20 références EasyIP 2.0+, EasyIP 4.0 et ColorVu, pages 9 à 11 — fixes 2,8 / 4 / 6 mm et varifocaux 2,8–12 et 3,6–9 mm |
| **Catalogue de l'agence** (relevé du 15/03/2025) | 6 références réellement au tarif, dont le varifocal 2,7–13,5 mm et le turret 8 MP Dahua |
| **Étude du client** | les deux voies de la bispectrale Dahua DHI-TPC-BF1241 |

Chaque ligne porte sa source : **survolez la pastille** de la colonne de droite
pour la lire — « Brochure Hikvision AcuSense, p. 11 ».

**Trois pastilles, et toute la différence :**

| | |
| --- | --- |
| **✓** | tout est sourcé — référence, focale, définition et format de capteur |
| **~** | référence et focale sourcées, mais **le format de capteur n'est dans aucun document** : il ne se lit que sur la fiche technique du modèle |
| **⋯** | focale ou définition manquante — la ligne reste listée pour mémoire, mais **n'est jamais proposée** |

Pourquoi ce « ~ » : ni les brochures commerciales ni les intitulés de catalogue
n'indiquent la taille du capteur. Elle n'entre pas dans le **choix** de
l'objectif — qui se fait sur la focale — mais dans l'**angle annoncé**. Un
capteur supposé de travers déplace cet angle ; la proposition client le dit
donc en toutes lettres : « le format de capteur reste à confirmer sur la fiche
technique du modèle ». Renseignez-le une fois, la ligne passe en « ✓ ».

### Importer son catalogue

Le bouton **Importer** reconnaît deux fichiers, et ne les traite pas pareil :

| Fichier | Ce qu'il fait |
| --- | --- |
| **Catalogue au format de l'outil** — colonnes marque, référence, voie, type, capteur, focale min/max, résolution, source | **remplace** le catalogue : c'est un fichier complet |
| **Relevé commercial** — n'importe quel tableau portant une colonne « Titre » : export de place de marché, tarif distributeur | **ajoute** ses références à celles déjà là, sans écraser votre saisie |

Le relevé commercial est lu prudemment. Il retient les lignes qui parlent d'une
caméra, écarte les doublons, déduit la marque de l'intitulé ou du préfixe de la
référence, et lit dans le texte la focale et la définition **quand elles y
sont écrites** :

- « DS-2CD2T86G2-4I **F4** » → focale fixe 4 mm ;
- « (**2,7-13,5 mm**) … **8MP** » → varifocal 2,7–13,5 mm, 3840 × 2160 ;
- « DH-IPC-HDW5842TMP-ASE-**0280B**-S3 » → 2,8 mm, les quatre chiffres du
  suffixe Dahua.

Et il s'abstient dès que l'intitulé n'est pas net :

- « DS-2DE3A400BW-DE**(F1)**(T5) » : ce F1 est un indice de révision, pas une
  focale de 1 mm ;
- « DS-2CD2186G2-ISU **F2.8**/8MP/**2.8-12 mm** » : l'intitulé se contredit,
  la fiche technique tranchera ;
- « Axis P3265-LVE » : aucune focale écrite.

Ces lignes-là arrivent en « ⋯ » : elles sont dans le tableau, prêtes à être
complétées, et ne partiront jamais chez un client en l'état.

**Exporter** produit le format de l'outil, source comprise, pour passer le
catalogue d'un poste à l'autre.

> **Une référence inventée serait pire que pas de référence.** C'est pourquoi
> l'outil distingue ce qu'il sait de ce qu'il suppose, à l'écran comme dans le
> document remis au client. Le catalogue reste sur le poste et voyage avec la
> fiche.

### Ce que ça produit

**Exporter le plan annoté** enregistre le plan avec son cône, en pleine
définition — à coller dans l'étude remise au client.

**Appliquer au bloc 2** recopie la focale et la distance dans la configuration
caméra : la suite de l'analyse s'aligne alors sur ce qui a été dessiné.

Et le procès-verbal porte une **fiche d'implantation** reprenant la disposition
habituelle des études : n° de caméra, type, objectif, référence, nombre de
pixels par mètre, hauteur — plus le plan annoté.

---

## 7. Avant d'aller sur site

Préparer la **vue demandée** : la référence contractuelle.

1. Remplir le bloc **1 · Chantier** (client, site, technicien, n° d'affaire) —
   ces renseignements valent pour toutes les caméras.
2. Renseigner le bloc **2 · Caméra et optique** : le repère de la caméra, puis
   capteur, focale, résolution, distance à la scène, hauteur de pose.
   Ajouter une caméra par poste prévu au chantier (§ 2).
3. Charger la vue demandée dans le premier cadre du bloc **3** — voir le § 8
   ci-dessous pour partir directement du PDF de l'étude.
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

## 8. Partir du PDF de l'étude

C'est le cas le plus courant : le client a remis une étude au format PDF, avec
le plan d'implantation et, caméra par caméra, la vue attendue.

1. Déposer le PDF **directement** dans le cadre « Vue demandée » — glisser le
   fichier, ou cliquer sur le cadre et le choisir.
2. L'outil affiche les pages en vignettes sur la gauche. Cliquer sur celle qui
   porte la vue de la caméra en cours.
3. Si la page contient autre chose que l'image (titre, cartouche, plusieurs
   vues), **cliquer-glisser sur la page** pour encadrer la seule vue demandée.
   Le reste est écarté. Sinon, laisser tel quel : la page entière est retenue.
4. **Utiliser cette vue**.

Le procès-verbal citera ensuite la source exacte — « Source : etude.pdf, page 3
(recadrée) » — ce qui rend la comparaison opposable : on sait exactement sur
quelle pièce du dossier le contrôle s'est appuyé.

> Un recadrage serré sur la vue demandée donne un recalage plus sûr : l'outil
> compare ce qu'il voit, et un cartouche de plan ou un bandeau de titre ne
> correspond à rien dans l'image de la caméra.

Le PDF lui-même n'est pas conservé dans la fiche, seulement l'image retenue et
la référence de la page.

### Le relevé de l'étude

En même temps qu'il affiche les pages, l'outil **lit le texte du PDF** et en
extrait ce que l'étude annonce : focale, angle de vue, capteur, résolution,
distance à la scène, hauteur de pose, niveau d'exploitation attendu. Si l'étude
détaille plusieurs caméras (« CAM 04 », « Caméra n° 7 »…), les valeurs restent
rattachées à la bonne caméra.

Un bloc **« 2 bis · Relevé de l'étude »** apparaît alors dans la colonne de
gauche, avec trois colonnes :

| Caractéristique | Étude | Posé |
| --- | --- | --- |
| Focale | 2,8 mm | 4 mm  (+1,2 mm) |
| Angle de vue horizontal | 105 ° | 65,8 °  (−39,2 °) |
| Capteur | 1/2.8" | 1/2.8" |

Un liseré vert ou rouge indique, ligne par ligne, si le matériel posé tient la
promesse de l'étude. Dans l'exemple ci-dessus, une caméra 4 mm a été montée là
où l'étude demandait un 2,8 mm : le champ couvert est bien plus étroit que
prévu. Le cadrage aura beau être parfaitement réglé, la caméra ne verra pas ce
que le client a commandé — c'est exactement le genre d'écart qu'on découvre
d'ordinaire trop tard.

**Survoler une ligne** affiche la page et la phrase exacte d'où la valeur a été
tirée. L'outil ne devine pas : il montre sa source.

### Quand une caractéristique manque

Déplier **Texte lu par l'outil**, sous le tableau. On y voit, page par page, ce
que l'outil a réellement extrait du PDF, les passages retenus surlignés en vert.
Une ligne présente mais non surlignée, c'est une formulation qu'il ne sait pas
encore lire ; une page vide, c'est un scan (§ 8).

Le bouton **Copier le texte** met ce contenu dans le presse-papiers. Le
transmettre suffit à faire ajouter la formulation manquante — inutile de sortir
l'étude du dossier client.

Quand l'étude décrit des caméras absentes du dossier, un bouton **Créer les
caméras manquantes** monte le dossier d'un coup, chaque fiche étant rattachée à
son repère dans l'étude. Il ne reste qu'à charger les images.

Le bouton **Reprendre** recopie une valeur dans le bloc 2. À n'utiliser que si
le matériel posé correspond effectivement à l'étude — par exemple en préparant
la fiche au bureau. Sur site, on saisit ce qui est **réellement monté** : c'est
l'écart qui fait tout l'intérêt du relevé. **Reprendre l'en-tête** remplit d'un
coup le client, le site, le numéro d'affaire et le repère caméra.

### Caméras thermiques et bispectrales

Une fiche qui annonce « OBJECTIF THERMIQUE 3,5MM – OBJECTIF CONTEXTE 4MM »
décrit une caméra **bispectrale** : deux objectifs, deux champs différents. Les
deux sont relevés et présentés ensemble ; la ligne passe au vert dès que la
focale saisie correspond à l'un d'eux, et la remarque dit lequel. Chaque
objectif se contrôle donc séparément, avec sa propre image — le plus simple
étant d'en faire deux caméras dans le dossier (§ 2).

Si l'étude annonce une caméra thermique, un bandeau orange le rappelle tant que
le capteur choisi reste un format visible. **Ce n'est pas un détail :** un
microbolomètre ne se désigne pas en pouces mais par sa matrice et son pas de
pixel. Une matrice 256 × 192 au pas de 12 µm mesure 3,07 × 2,30 mm — moitié
moins qu'un 1/2.8". Choisir le mauvais capteur donnerait un angle de champ faux,
donc un écart de pointage faux, sans que rien ne le signale. Les formats
thermiques courants figurent dans la liste du bloc 2.

### Densité exigée

Si l'étude porte une ligne « Nombre pixel/m », l'exigence est confrontée à la
densité réellement obtenue avec l'optique et la distance saisies. La ligne passe
au rouge si la caméra posée voit moins fin que ce que l'étude demandait.

> **Angle horizontal ou diagonal ?** Les fiches constructeur annoncent souvent
> l'angle diagonal, plus large. L'outil repère le mot « diagonal » ou
> « vertical » dans la phrase et compare alors au bon axe. Sans précision, il
> retient l'horizontal, convention des études d'implantation.

Le procès-verbal reprend ce tableau sous le titre **« Conformité à l'étude »**,
avec la page d'origine de chaque valeur. Le dossier porte ainsi deux
vérifications distinctes : le **matériel** correspond-il à l'étude, et le
**cadrage** correspond-il à la vue demandée.

> **Une page de plan n'est pas une vue demandée.** Beaucoup d'études présentent
> la couverture sous forme de cônes tracés sur une vue aérienne. C'est précieux
> pour le relevé des caractéristiques, mais une telle page ne peut pas être
> comparée à l'image de la caméra : ce sont deux représentations sans rapport
> visuel. Pour la comparaison de cadrage, il faut une **image** de la vue
> attendue — capture validée ou photo de repérage. À défaut, le relevé du
> matériel reste exploitable, et la partie cadrage se traite au recalage manuel
> (§ 12) ou se réserve pour une visite ultérieure.

### Si l'étude est un scan

Certaines études arrivent numérisées : le PDF ne contient pas de texte, juste la
photographie d'une page papier. L'outil le détecte et l'annonce — « Document
sans texte : étude probablement scannée ».

Avec la version **OCR** (§ 1), un bouton **Lire l'étude scannée** apparaît alors.
Il fait passer chaque page en reconnaissance de caractères, hors ligne, sans rien
envoyer nulle part. Comptez une à deux secondes par page. Les valeurs reconnues
alimentent ensuite le relevé comme celles d'un PDF ordinaire.

Un bandeau orange signale que ces valeurs viennent d'une lecture optique, et le
procès-verbal le mentionne également. **Ce n'est pas une précaution de style :**
un « 2,8 » lu « 28 » fausserait tout le calcul d'angle sans que rien ne le
signale. Les valeurs restent affichées avec leur page et leur extrait d'origine :
un coup d'œil au survol suffit à les valider.

Avec la version légère, le bouton n'apparaît pas et l'outil dit pourquoi. Les
valeurs sont alors à saisir à la main dans le bloc 2 — ce qui reste tout à fait
praticable, une étude ne comptant qu'une poignée de chiffres par caméra.

---

## 9. Sur site, après la pose

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
  (voir le § 12).

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

## 10. Zones d'intérêt

Pour vérifier qu'un point précis reste dans le champ (portail, caisse, quai de
livraison, allée) :

1. Cliquer sur **Tracer une zone d'intérêt**.
2. Sur la vue demandée (à gauche), tracer le rectangle par cliquer-glisser.
3. Nommer la zone dans la liste qui apparaît sous les vues.

L'outil reporte la zone dans l'image réglée et indique le pourcentage encore
couvert. Le seuil d'exigence se règle dans le bloc **4** (95 % par défaut).

---

## 11. Tolérances de réception

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

## 12. Quand le recalage automatique échoue

L'outil annonce « recalage non concluant » quand les deux images ne se
ressemblent pas assez. Les causes habituelles :

- la vue demandée est un **plan ou un croquis**, pas une photo ;
- la page d'étude retenue porte du texte ou un cartouche : la recadrer sur la
  seule image (§ 8) suffit souvent à débloquer la situation ;
- les deux prises de vue ont été faites depuis **des emplacements différents** ;
- la scène a **réellement changé** (chantier, saison, véhicules déplacés) ;
- le décalage dépasse les trois quarts du champ : il ne reste presque plus rien
  en commun.

Ouvrir alors le repli **Recalage manuel** dans le bloc 5 et ajuster les quatre
curseurs jusqu'à la superposition. Les écarts et le verdict se recalculent en
direct, et le rapport indique que le recalage a été fait à la main.

---

## 13. Rapport et archivage

**Rapport / Impression** ouvre la boîte d'impression du navigateur. Choisir
« Enregistrer au format PDF » pour obtenir le procès-verbal du chantier :

1. les renseignements de chantier ;
2. une **synthèse** d'une ligne par caméra — écarts de pointage, d'aplomb et de
   cadrage, écarts de matériel, note et verdict — qui dit en un coup d'œil ce
   qui reste à reprendre ;
3. puis, caméra par caméra et chacune sur sa page : configuration optique,
   conformité à l'étude, les deux vues, le tableau des écarts, les consignes,
   les zones d'intérêt et les observations ;
4. les deux cadres de signature.

Une caméra non analysée apparaît quand même dans la synthèse, marquée comme
telle : le document ne laisse pas croire qu'un poste a été contrôlé alors qu'il
ne l'a pas été.

Avec une seule caméra au dossier, la synthèse est omise — elle n'apprendrait
rien.

**Enregistrer la fiche** produit le `.json` du dossier entier, toutes caméras et
toutes images comprises. À conserver dans le dossier d'affaire : rouvert plus
tard, il rejoue les analyses à l'identique et sert de référence lors d'un
contrôle annuel ou d'une contestation.

---

## 14. Mettre l'outil en ligne sur le site

Utile pour y accéder depuis une tablette sans rien installer.

### Par FTP (recommandé)

1. Se connecter au serveur en FTP/SFTP (identifiants de l'hébergeur).
2. Ouvrir le dossier public du site (`public_html`, `www` ou `httpdocs`).
3. Y créer un dossier `outils`.
4. Copier dedans le dossier `analyse-vue-angle` **entier**, en conservant la
   structure : `index.html`, `styles.css`, et les sous-dossiers `js` et
   `vendor` (dont `vendor/ocr`, qui permet la lecture des études scannées). Les dossiers `tests`, `dist` et les fichiers `.mjs` à la racine ne
   servent qu'au développement, inutile de les envoyer.
5. L'outil est accessible à
   `https://ngsecurity38.fr/outils/analyse-vue-angle/`.

Servi par le site, le dossier fonctionne normalement : c'est l'ouverture en
double-clic depuis le disque qui pose problème, pas la mise en ligne.

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
- ou ne pas le mettre en ligne du tout et travailler depuis le fichier unique
  copié sur la tablette (§ 1) — l'outil fonctionne sans connexion.

> Ne pas coller le contenu de `index.html` dans un bloc HTML WordPress : la page
> a besoin de ses fichiers `styles.css` et `js/`, et WordPress bloque les
> modules JavaScript insérés de cette façon. Passer par l'upload FTP.

---

## 15. Ce que l'outil ne fait pas

- Il ne corrige pas la **distorsion** des objectifs très grand-angle. Les
  écarts restent justes au centre et se dégradent vers les bords de l'image.
- Il ne compare que des vues prises **du même endroit**. Il mesure une erreur
  de pointage, pas une erreur d'emplacement du mât.
- Il ne juge pas la qualité d'image (netteté, bruit, exposition) : uniquement le
  cadrage.
- Il lit le texte des PDF ; les études scannées passent par la reconnaissance
  de caractères (§ 8), plus faillible, d'où l'avertissement qui les accompagne.
- Le relevé reconnaît les formulations courantes des études d'implantation et
  des fiches constructeur — « focale 3,6 mm », « f = 4 mm », « H : 102° »,
  « 1/2,8 pouce », « 1 920 x 1 080 », « 1080p », valeurs en colonnes sous leur
  en-tête. Une mise en page inhabituelle peut malgré tout lui échapper : chaque
  valeur est donc affichée avec sa page et son extrait, et le texte lu reste
  consultable pour comprendre ce qui manque (§ 8).
- Il ne vérifie pas les points non chiffrés d'un cahier des charges (indice de
  protection, alimentation, chemin de câbles, conformité RGPD de l'affichage).
- Il calcule le **budget PoE** d'un switch et la **capacité** de l'enregistreur
  (§ 5), mais ni la section des alimentations, ni l'autonomie d'un onduleur, ni
  la bande passante du lien Internet pour la consultation à distance.
- Le stockage est calculé à **débit constant**. Un enregistrement sur détection
  consomme moins, un site très passant davantage ; la marge de sécurité est là
  pour cela, pas pour compenser un débit mal renseigné.
- Il ne **dessine pas les murs** et ne calcule donc pas les **angles morts**
  qu'ils créent. Les cônes tracés supposent le champ dégagé.
- Il ne connaît pas le cheminement réel des câbles : il mesure celui que vous
  tracez. Fourreaux existants, passages de cloison et réservations restent à
  relever sur site — d'où la réserve appliquée par défaut.
- Il ne tient pas à jour les catalogues constructeurs. Les références livrées
  viennent de documents datés (§ 6) ; les tarifs, les disponibilités et les fins
  de série ne sont pas de son ressort.
- Il ne connaît pas le **format de capteur** des modèles du commerce : aucune
  brochure ne le publie. Les entrées concernées le disent (« ~ »), et la
  proposition client le répète. C'est la seule caractéristique du catalogue que
  l'outil vous demande d'aller chercher.
- Le catalogue livré couvre **2,8 à 13,5 mm**. Au-delà, il annonce qu'aucun de
  ses modèles ne convient et donne la focale du commerce la plus proche, plutôt
  que de proposer une longue portée dont il ne tient la référence de nulle part.
