# Analyse de vue d'angle

Outil web qui compare **la vue d'angle demandée par le client** et **l'image
réellement réglée sur la caméra**, puis en déduit les corrections de pointage à
appliquer et produit un procès-verbal imprimable.

Aucun serveur, aucune dépendance à installer, aucun envoi d'image : tout tourne
dans le navigateur, hors ligne.

## Deux formes, un seul code

| Forme | Fichier | Quand l'utiliser |
| --- | --- | --- |
| **Fichier unique** | `dist/analyse-vue-angle.html` (1,5 Mo) | PC, tablette, clé USB — s'ouvre d'un double-clic |
| **Fichier unique + OCR** | `dist/analyse-vue-angle-ocr.html` (7,6 Mo) | idem, mais sait lire les études **scannées** |
| **Devis client** | `dist/devis-client.html` (40 Ko) | page publique : le client estime lui-même son installation |
| **Dossier de sources** | `index.html` + `js/` + `vendor/` | mise en ligne sur le site, développement |

Le moteur de reconnaissance de caractères pèse près de 5 Mo pour un besoin
occasionnel. L'embarquer d'office ferait payer ce poids à chaque ouverture, à
tout le monde : le fichier ordinaire reste donc léger, et la seconde version le
porte pour les agences dont les études arrivent numérisées. Servi depuis le
site, le dossier de sources charge le moteur à la demande, sans ce choix.

Le fichier unique est produit par `npm run build` à partir des sources : c'est
le même code, rassemblé en un seul fichier sans module JavaScript.

Cette double forme n'est pas un confort mais une nécessité : **les navigateurs
refusent les modules JavaScript quand une page est ouverte depuis le disque**
(`file://`). Le dossier de sources ne fonctionne donc que servi par un serveur
web ; seul le fichier unique s'ouvre en double-cliquant.

Pour le mode d'emploi complet et la mise en ligne sur WordPress, voir
[`docs/analyse-vue-angle.md`](../../docs/analyse-vue-angle.md).

## Ce que fait l'outil

0. **Deux chemins annoncés à l'ouverture** — « proposer une installation » à
   partir d'une photo, ou « réceptionner une installation » en comparant deux
   vues. Le bloc d'étude est le premier de la colonne, encadré ; les blocs
   numérotés 1 à 6 sont ceux de la réception.
1. **Étude depuis la photo de repérage** — le chemin principal. Deux points du
   sol dont la distance est connue suffisent à **mesurer** l'angle de vue de la
   photo et son inclinaison — rien n'est supposé. L'ordonnée de n'importe quel
   point donne alors sa distance réelle. On entoure la zone à couvrir, l'outil
   en tire l'angle de vue nécessaire, la focale, la définition obtenue et le
   niveau d'exploitation garanti, puis propose le matériel. Des lignes
   d'iso-distance rendent l'échelle vérifiable d'un coup d'œil, et un **tracé
   d'angle vu de dessus** est dessiné automatiquement, avec les portées de
   chaque niveau d'exploitation — placé à côté de la photo dès que l'écran le
   permet. **Les résultats s'affichent sous la photo** — angle, focale, matériel
   proposé, portées — et non dans la colonne de saisie où ils passaient inaperçus.
   La zone reste **maniable** : on la déplace en la saisissant, on la
   redimensionne par ses huit poignées, on replace les repères de calage. Chaque
   relâchement recalcule tout — focale, portées, matériel, tracé. Ajuster un
   cadrage devant le client ne demande plus de recommencer le tracé.
2. **Proposition client** — document commercial distinct du procès-verbal :
   synthèse de couverture, photo annotée, tracé d'angle, matériel préconisé,
   tableau « ce que permettra l'image » en français courant, méthode et
   hypothèses.
3. **Catalogue de matériel** — 28 références livrées, **toutes tirées d'un
   document** : la brochure Hikvision AcuSense (page citée), le catalogue de
   l'agence, l'étude du client. Chaque entrée porte sa `source`, et sa pastille
   dit ce qui reste à confirmer — **✓** tout est sourcé, **~** référence et
   focale sourcées mais format de capteur absent du document, **⋯** focale ou
   définition manquante, jamais proposée au client. Le bouton **Importer**
   accepte deux formats : un catalogue au format de l'outil, qu'il remplace, et
   un **relevé commercial** — l'export d'une place de marché, un tarif
   distributeur — dont il extrait les références des intitulés.
4. **Synoptique de câblage** — le matériel se pose sur une vue aérienne
   calibrée, les liaisons se tirent entre eux, et l'outil **mesure le câble** :
   trajet au plan, descentes verticales aux deux bouts, réserve. Il signale les
   liaisons au-delà des 90 m admis en cuivre (EN 50173-1), le matériel oublié au
   bout d'aucun câble et les caméras qui ne remontent à aucun enregistreur. Une
   **arborescence** est dessinée automatiquement à côté du plan, et les deux
   figurent au procès-verbal comme à la proposition client, avec le tableau des
   longueurs.
5. **Murs et angles morts** — les murs se tracent sur le plan du site, avec leur
   longueur et leur hauteur. Les champs de vision en tiennent compte : un mur
   plus haut que la caméra arrête la vue, **un mur plus bas se laisse survoler**
   et ne cache qu'une bande de terrain, dont la longueur se déduit des deux
   hauteurs. L'outil chiffre la part de champ réellement dégagée et le plus
   grand angle mort de chaque caméra, et colorie la couverture par niveau
   d'exploitation.
6. **Enregistrement et alimentation** — capacité de l'enregistreur à partir du
   débit cumulé, de la durée de conservation, des heures par jour et d'une marge
   de sécurité ; disques à prévoir ; budget PoE par switch. Huit contrôles
   automatiques : adresse IP en double ou mal formée, ports et budget PoE
   dépassés, canaux de l'enregistreur, caméra sur un switch sans PoE,
   consommation hors norme PoE, capacité installée insuffisante, débit manquant.
   Les anomalies bloquantes passent devant les avertissements.
7. **Devis** — bâti sur le matériel réellement posé au synoptique, les
   identiques regroupés. Chaque prix porte sa provenance : **✓** pratiqué ou
   saisi par l'agence, **~** relevé chez un revendeur à une date donnée,
   **⋯** manquant — et le devis dit alors qu'il est incomplet plutôt que de
   compter la ligne à zéro. Prix d'achat et prix de vente sont distingués :
   un prix de vente connu s'impose tel quel, sans se voir appliquer une marge
   qu'il contient déjà. Main-d'œuvre, remise et TVA entrent dans le total, et
   le document part à la proposition client — jamais au procès-verbal.
8. **Devis client, en libre-service** — une page publique, légère, faite pour
   le site de l'agence : le visiteur répond à quatre questions — type de site,
   accès à couvrir, durée de conservation, pose ou non — et obtient sa
   configuration et son budget. Elle **partage les calculs de l'outil d'étude**,
   pour qu'un client et un technicien ne lisent jamais deux chiffres différents
   du même site. Elle ne propose que ce qui figure au tarif : ce qui manque est
   annoncé, pas inventé. Le visiteur peut surtout **photographier ses propres
   zones** depuis l'emplacement prévu de chaque caméra, poser un ou deux
   repères de distance connue, entourer ce qu'il veut surveiller : l'angle de
   vue est alors **mesuré** comme dans l'outil d'étude, la caméra du tarif qui
   y répond est nommée, et ce sont ces zones qui commandent le devis. Le projet
   se garde sur l'appareil et s'enregistre en un fichier réouvrable. La
   proposition couvre **tout le système** — caméras,
   switch PoE, enregistreur, disque, routeur, câble au mètre, connectique,
   coffret — et un **synoptique** montre comment tout se raccorde, les maillons
   hors tarif grisés plutôt qu'omis. Les prix viennent de `tarif.json`, posé à
   côté de la page — un seul fichier à modifier, sans reconstruction. Mise en
   ligne : [`docs/devis-client-sur-le-site.md`](../../docs/devis-client-sur-le-site.md).
9. **Conception d'un champ sur plan** — tracer sur une vue aérienne la zone à
   couvrir, et en déduire portée, ouverture, largeur couverte, **focale
   nécessaire**, densité en pixels par mètre et niveau DORI atteint. Un
   catalogue du matériel, tenu par l'agence, désigne alors la caméra à poser et
   le zoom à régler. Le plan annoté s'exporte, et le procès-verbal porte une
   fiche d'implantation au format des études.
10. **Dossier de chantier** — une fiche porte autant de caméras que le site en
   compte. Onglets avec pastille de verdict, synthèse d'avancement, un seul
   fichier `.json` pour tout le dossier et un procès-verbal unique. Les fiches
   de la version 1, à caméra unique, s'ouvrent toujours.
11. **Import de l'étude au format PDF** — les pages du PDF remis par le client
   sont affichées, on choisit celle qui porte la vue attendue et on recadre
   dessus pour n'en garder que l'image utile. Le procès-verbal cite ensuite le
   fichier et le numéro de page servis de référence.
12. **Lecture des études scannées** — un PDF sans texte est reconnu comme tel et
   peut être passé en reconnaissance de caractères, hors ligne. Les valeurs
   ainsi obtenues sont signalées comme telles, à l'écran et au procès-verbal :
   un chiffre mal reconnu fausserait la mesure d'angle.
13. **Relevé du texte de l'étude** — focale, angle de vue, capteur, résolution,
   distance et hauteur annoncés sont lus dans le texte du PDF, caméra par
   caméra, puis confrontés au matériel réellement posé. Chaque valeur est
   présentée avec sa page d'origine et son extrait : l'outil propose, le
   technicien valide. Les caméras bispectrales, qui portent deux objectifs, sont
   relevées avec leurs deux focales ; les caméras thermiques déclenchent un
   rappel tant que le capteur choisi reste un format visible. Un panneau
   **Texte lu** montre ce qui a été extrait,
   passages retenus surlignés, et se copie d'un clic : une formulation non
   reconnue se diagnostique sans sortir l'étude du dossier client.
14. **Calculs optiques** — angles de champ horizontal / vertical / diagonal à
   partir du capteur et de la focale, largeur de scène couverte, densité en
   pixels par mètre, portées DORI (EN 62676-4), zone morte au pied du mât,
   focale nécessaire pour couvrir une largeur donnée.
15. **Recalage des deux vues** — estimation automatique du décalage, du zoom et
   du roulis entre l'image de référence et l'image réglée.
16. **Diagnostic** — traduction de ce recalage en écarts de réglage réels
   (degrés de panoramique, de site, de roulis ; pourcentage de cadrage), note
   de conformité sur 100 et consignes d'intervention en clair.
17. **Zones d'intérêt** — rectangles tracés sur la vue demandée, dont l'outil
   vérifie qu'ils restent couverts par le champ réellement réglé.
18. **Fiche et rapport** — la fiche complète (paramètres + images) s'enregistre
   en un fichier `.json` réouvrable ; le rapport s'imprime ou s'exporte en PDF.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `index.html` | structure de la page |
| `styles.css` | présentation, y compris la feuille d'impression du rapport |
| `js/optique.js` | calculs d'optique — module pur, testé |
| `js/photo.js` | mesure des distances sur une photo de repérage — module pur, testé |
| `js/plan.js` | géométrie du champ tracé sur un plan — module pur, testé |
| `js/reseau.js` | longueurs de câble et arborescence du synoptique — module pur, testé |
| `js/stockage.js` | capacité d'enregistrement, budget PoE, contrôles — module pur, testé |
| `js/murs.js` | occlusion des champs de vision et angles morts — module pur, testé |
| `js/prix.js` | chiffrage, marges, TVA et devis — module pur, testé |
| `js/offre.js` | composition d'une installation depuis quatre réponses — module pur, testé |
| `js/photo-client.js` | étude par photo côté client — module pur, testé |
| `devis-client.html` | page publique de devis en libre-service |
| `js/devis-client.js` | logique de cette page |
| `devis-client.css` | sa présentation, écran et impression |
| `tarif.json` | prix lus par la page de devis client — le seul fichier à tenir à jour |
| `js/catalogue.js` | matériel de l'agence et choix d'objectif — module pur, testé |
| `js/alignement.js` | recalage des deux images — module pur, testé |
| `js/diagnostic.js` | écarts de réglage et consignes — module pur, testé |
| `js/etude-pdf.js` | ouverture du PDF d'étude et choix de la page |
| `js/ocr.js` | reconnaissance de caractères hors ligne, montée à la demande |
| `js/lecture-etude.js` | relevé des valeurs annoncées dans le texte — module pur, testé |
| `js/format.js` | mise en forme des nombres à la française |
| `js/fiche.js` | format du dossier `.json` et compatibilité des versions — module pur, testé |
| `js/dom.js` | raccourcis de sélection partagés |
| `js/app.js` | assemblage : formulaire, toiles, rapport |
| `vendor/` | PDF.js (Mozilla, Apache 2.0), embarqué pour fonctionner hors ligne |
| `vendor/ocr/` | Tesseract.js et son modèle français (Apache 2.0) |
| `build.mjs` | fabrication du fichier unique |
| `tests/run.mjs` | tests unitaires des calculs |
| `tests/etude.mjs` | tests unitaires de la lecture d'étude |
| `tests/fiche.mjs` | tests unitaires du format de dossier |
| `tests/plan.mjs` | tests unitaires du tracé sur plan et du catalogue |
| `tests/photo.mjs` | tests unitaires de l'analyse depuis photo |
| `tests/reseau.mjs` | tests unitaires du synoptique de câblage |
| `tests/stockage.mjs` | tests unitaires du stockage et des contrôles |
| `tests/murs.mjs` | tests unitaires des murs et des angles morts |
| `tests/prix.mjs` | tests unitaires du chiffrage et du devis |
| `tests/offre.mjs` | tests unitaires de la composition d'installation |
| `tests/photo-client.mjs` | tests unitaires de l'étude par photo côté client |
| `tests/navigateur.mjs` | tests de bout en bout dans un vrai navigateur |

Les trois modules de calcul ne touchent jamais au DOM : ils reçoivent des
nombres ou des images en niveaux de gris et renvoient des nombres. C'est ce qui
permet de les tester sans navigateur.

## Principe du recalage

Les deux vues sont réduites, puis on leur retire leur **moyenne locale**. Cette
étape est ce qui rend la comparaison possible entre une photo de repérage prise
en plein jour et une capture de nuit en infrarouge : seule la structure de la
scène subsiste, l'exposition disparaît.

La transformation qui amène la vue demandée sur la vue réglée est ensuite
cherchée en deux temps — balayage exhaustif de la translation à basse
résolution, puis descente par motif sur les quatre paramètres (décalage
horizontal, décalage vertical, échelle, rotation) à résolution plus fine. Le
critère maximisé est la corrélation croisée normalisée, pénalisée quand le
recouvrement entre les deux cadrages devient faible.

Le décalage trouvé est enfin converti en degrés par la projection rectilinéaire
de l'objectif — la relation n'est pas linéaire : un décalage de 25 % de la
largeur d'image ne vaut pas la moitié d'un décalage de 50 %.

### Limites

- La mesure sur photo suppose un **sol plan** et une prise de vue **sans
  roulis**. Un relief marqué, un dévers, ou un appareil penché faussent les
  distances. Les lignes d'iso-distance affichées servent justement à s'en
  apercevoir : si elles ne tombent pas où l'on sait que tombent les distances,
  le calage est à refaire.
- Le champ de l'appareil est mesuré dès que deux repères sont posés. Avec un
  seul, il reste supposé d'après une liste de valeurs usuelles, et une photo
  recadrée fausse alors l'échelle angulaire ; l'interface dit toujours dans
  lequel des deux cas on se trouve.
- La lecture du texte de l'étude suppose un **PDF **texte****. Une étude scannée en
  image ne donne rien : le panneau de relevé le dit et renvoie à la saisie
  manuelle. Les formulations reconnues sont celles des études d'implantation
  courantes ; une mise en page inhabituelle peut passer au travers, d'où
  l'affichage systématique de la page et de l'extrait d'origine.
- Le recalage suppose **le même point de vue**. Deux photos prises depuis des
  emplacements différents ne sont pas comparables par cette méthode : il faut
  alors passer par le recalage manuel.
- La distorsion des très courtes focales (fisheye, grand-angle marqué) n'est
  pas corrigée. Les écarts restent justes au centre de l'image et se dégradent
  vers les bords.
- L'indice de corrélation affiché sert de garde-fou : en dessous du seuil, le
  verdict passe en « recalage non concluant » plutôt que d'annoncer un écart
  inventé. La valeur brute reste affichée pour que le technicien tranche.

## Construire le fichier unique

```bash
cd outils/analyse-vue-angle
npm run build      # écrit les deux fichiers de dist/
```

Le script refuse de produire un fichier si un module manque à sa liste — il se
chargerait alors puis planterait au premier appel, avec un fichier livré
d'apparence saine. Il refuse également si deux modules déclarent un même nom au
premier niveau : concaténés dans une seule portée, ils feraient planter la page
au chargement. Mieux vaut un build qui échoue qu'un fichier muet.

À relancer après **toute** modification des sources — sinon le fichier livré aux
techniciens reste en retard sur le dépôt.

## Tests

```bash
npm test                 # 258 tests unitaires, sans navigateur
npm run build
npm run test:navigateur  # 104 tests de bout en bout (Playwright)
```

Les tests unitaires couvrent les calculs d'optique, la récupération de
transformations connues sur des scènes synthétiques (translation, zoom, roulis,
fort changement d'exposition), le rejet d'images sans rapport, la traduction des
écarts en consignes, la lecture d'une étude (repérage des caméras, relevé des
caractéristiques, rejet des faux positifs numériques, confrontation au matériel
posé, densité exigée), la géométrie du tracé sur plan avec son choix
d'objectif, le catalogue de matériel (provenance des références, aller-retour
CSV, en-têtes dans le désordre, lecture d'un relevé commercial — focale, marque
et définition tirées des intitulés, intitulés contradictoires écartés), les
longueurs du synoptique (trajet, descentes, réserve, dépassement des 90 m,
matériel non raccordé, arborescence), le calcul de stockage (l'exemple de
référence au gigaoctet près, plage horaire, calcul inverse, choix du disque) et
les contrôles d'exploitation (adresses, ports, budget PoE, canaux, capacité), les
angles morts (un mur survolé, un mur opaque, deux ombres qui se recouvrent, la
part de champ dégagée mesurée en surface), le chiffrage (aller-retour HT/TTC,
prix tiré d'un relevé de ventes écrit « 2 056,00 € », achat et vente jamais
confondus, devis incomplet signalé), la composition d'une installation (switch
et enregistreur dimensionnés sur le nombre de caméras, disque sur la durée,
budget PoE vérifié, extension prévue, rien qui ne soit au tarif), l'étude par
photo côté client (champ mesuré ou supposé selon les repères, niveau
d'exploitation, gestes sur la zone), la mesure des distances sur photo (sol plan, sténopé) avec le
calage automatique du champ de vision sur deux repères, et le format de dossier (conversion des fiches de la version 1, fichier
tronqué, nom de fichier proposé).

Les tests navigateur vérifient ce qu'aucun test unitaire ne peut voir : le
dossier servi en HTTP, l'aller-retour d'une fiche `.json`, et surtout le fichier
unique **ouvert depuis le disque** avec import d'une vraie étude PDF — jusqu'à
retrouver le même écart angulaire que la géométrie prédit, et à relever dans le
texte de cette étude les caractéristiques annoncées. Un bloc entier couvre le
dossier multi-caméras : cloisonnement des caméras entre elles, onglets de
verdict, synthèse du procès-verbal, aller-retour d'enregistrement et ouverture
d'une fiche de l'ancienne version. Un test vérifie qu'en plein tracé la photo **ne bouge pas d'un pixel** : la
mise en page qui se réorganise sous le curseur donne un rectangle qui n'est pas
celui qu'on dessine, et cela ne se voit sur aucune capture. Un dernier bloc
fabrique une étude
**scannée** — le texte dessiné dans une image, sans couche texte — et vérifie
que la reconnaissance de caractères la relit correctement, que l'avertissement
de provenance apparaît, et que la version légère annonce honnêtement qu'elle ne
sait pas le faire. Playwright n'est pas
une dépendance du projet : s'il est absent, ces tests sont ignorés au lieu
d'échouer.
