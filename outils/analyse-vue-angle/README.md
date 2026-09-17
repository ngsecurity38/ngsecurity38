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

1. **Étude depuis la photo de repérage** — le chemin principal. Deux points du
   sol dont la distance est connue suffisent à **mesurer** l'angle de vue de la
   photo et son inclinaison — rien n'est supposé. L'ordonnée de n'importe quel
   point donne alors sa distance réelle. On entoure la zone à couvrir, l'outil
   en tire l'angle de vue nécessaire, la focale, la définition obtenue et le
   niveau d'exploitation garanti, puis propose le matériel. Des lignes
   d'iso-distance rendent l'échelle vérifiable d'un coup d'œil, et un **tracé
   d'angle vu de dessus** est dessiné automatiquement, avec les portées de
   chaque niveau d'exploitation.
2. **Proposition client** — document commercial distinct du procès-verbal :
   synthèse de couverture, photo annotée, tracé d'angle, matériel préconisé,
   tableau « ce que permettra l'image » en français courant, méthode et
   hypothèses.
3. **Conception d'un champ sur plan** — tracer sur une vue aérienne la zone à
   couvrir, et en déduire portée, ouverture, largeur couverte, **focale
   nécessaire**, densité en pixels par mètre et niveau DORI atteint. Un
   catalogue du matériel, tenu par l'agence, désigne alors la caméra à poser et
   le zoom à régler. Le plan annoté s'exporte, et le procès-verbal porte une
   fiche d'implantation au format des études.
4. **Dossier de chantier** — une fiche porte autant de caméras que le site en
   compte. Onglets avec pastille de verdict, synthèse d'avancement, un seul
   fichier `.json` pour tout le dossier et un procès-verbal unique. Les fiches
   de la version 1, à caméra unique, s'ouvrent toujours.
5. **Import de l'étude au format PDF** — les pages du PDF remis par le client
   sont affichées, on choisit celle qui porte la vue attendue et on recadre
   dessus pour n'en garder que l'image utile. Le procès-verbal cite ensuite le
   fichier et le numéro de page servis de référence.
6. **Lecture des études scannées** — un PDF sans texte est reconnu comme tel et
   peut être passé en reconnaissance de caractères, hors ligne. Les valeurs
   ainsi obtenues sont signalées comme telles, à l'écran et au procès-verbal :
   un chiffre mal reconnu fausserait la mesure d'angle.
7. **Relevé du texte de l'étude** — focale, angle de vue, capteur, résolution,
   distance et hauteur annoncés sont lus dans le texte du PDF, caméra par
   caméra, puis confrontés au matériel réellement posé. Chaque valeur est
   présentée avec sa page d'origine et son extrait : l'outil propose, le
   technicien valide. Les caméras bispectrales, qui portent deux objectifs, sont
   relevées avec leurs deux focales ; les caméras thermiques déclenchent un
   rappel tant que le capteur choisi reste un format visible. Un panneau
   **Texte lu** montre ce qui a été extrait,
   passages retenus surlignés, et se copie d'un clic : une formulation non
   reconnue se diagnostique sans sortir l'étude du dossier client.
8. **Calculs optiques** — angles de champ horizontal / vertical / diagonal à
   partir du capteur et de la focale, largeur de scène couverte, densité en
   pixels par mètre, portées DORI (EN 62676-4), zone morte au pied du mât,
   focale nécessaire pour couvrir une largeur donnée.
9. **Recalage des deux vues** — estimation automatique du décalage, du zoom et
   du roulis entre l'image de référence et l'image réglée.
10. **Diagnostic** — traduction de ce recalage en écarts de réglage réels
   (degrés de panoramique, de site, de roulis ; pourcentage de cadrage), note
   de conformité sur 100 et consignes d'intervention en clair.
11. **Zones d'intérêt** — rectangles tracés sur la vue demandée, dont l'outil
   vérifie qu'ils restent couverts par le champ réellement réglé.
12. **Fiche et rapport** — la fiche complète (paramètres + images) s'enregistre
   en un fichier `.json` réouvrable ; le rapport s'imprime ou s'exporte en PDF.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `index.html` | structure de la page |
| `styles.css` | présentation, y compris la feuille d'impression du rapport |
| `js/optique.js` | calculs d'optique — module pur, testé |
| `js/photo.js` | mesure des distances sur une photo de repérage — module pur, testé |
| `js/plan.js` | géométrie du champ tracé sur un plan — module pur, testé |
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

Le script refuse de produire un fichier si deux modules déclarent un même nom au
premier niveau : concaténés dans une seule portée, ils feraient planter la page
au chargement. Mieux vaut un build qui échoue qu'un fichier muet.

À relancer après **toute** modification des sources — sinon le fichier livré aux
techniciens reste en retard sur le dépôt.

## Tests

```bash
npm test                 # 109 tests unitaires, sans navigateur
npm run build
npm run test:navigateur  # 61 tests de bout en bout (Playwright)
```

Les tests unitaires couvrent les calculs d'optique, la récupération de
transformations connues sur des scènes synthétiques (translation, zoom, roulis,
fort changement d'exposition), le rejet d'images sans rapport, la traduction des
écarts en consignes, la lecture d'une étude (repérage des caméras, relevé des
caractéristiques, rejet des faux positifs numériques, confrontation au matériel
posé, densité exigée), la géométrie du tracé sur plan avec son choix
d'objectif, la mesure des distances sur photo (sol plan, sténopé) avec le
calage automatique du champ de vision sur deux repères, et le format de dossier (conversion des fiches de la version 1, fichier
tronqué, nom de fichier proposé).

Les tests navigateur vérifient ce qu'aucun test unitaire ne peut voir : le
dossier servi en HTTP, l'aller-retour d'une fiche `.json`, et surtout le fichier
unique **ouvert depuis le disque** avec import d'une vraie étude PDF — jusqu'à
retrouver le même écart angulaire que la géométrie prédit, et à relever dans le
texte de cette étude les caractéristiques annoncées. Un bloc entier couvre le
dossier multi-caméras : cloisonnement des caméras entre elles, onglets de
verdict, synthèse du procès-verbal, aller-retour d'enregistrement et ouverture
d'une fiche de l'ancienne version. Un dernier bloc fabrique une étude
**scannée** — le texte dessiné dans une image, sans couche texte — et vérifie
que la reconnaissance de caractères la relit correctement, que l'avertissement
de provenance apparaît, et que la version légère annonce honnêtement qu'elle ne
sait pas le faire. Playwright n'est pas
une dépendance du projet : s'il est absent, ces tests sont ignorés au lieu
d'échouer.
