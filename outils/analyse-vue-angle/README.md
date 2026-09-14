# Analyse de vue d'angle

Outil web qui compare **la vue d'angle demandée par le client** et **l'image
réellement réglée sur la caméra**, puis en déduit les corrections de pointage à
appliquer et produit un procès-verbal imprimable.

Aucun serveur, aucune dépendance à installer, aucun envoi d'image : tout tourne
dans le navigateur, hors ligne.

## Deux formes, un seul code

| Forme | Fichier | Quand l'utiliser |
| --- | --- | --- |
| **Fichier unique** | `dist/analyse-vue-angle.html` | PC, tablette, clé USB — s'ouvre d'un double-clic |
| **Dossier de sources** | `index.html` + `js/` + `vendor/` | mise en ligne sur le site, développement |

Le fichier unique est produit par `npm run build` à partir des sources : c'est
le même code, rassemblé en un seul fichier sans module JavaScript.

Cette double forme n'est pas un confort mais une nécessité : **les navigateurs
refusent les modules JavaScript quand une page est ouverte depuis le disque**
(`file://`). Le dossier de sources ne fonctionne donc que servi par un serveur
web ; seul le fichier unique s'ouvre en double-cliquant.

Pour le mode d'emploi complet et la mise en ligne sur WordPress, voir
[`docs/analyse-vue-angle.md`](../../docs/analyse-vue-angle.md).

## Ce que fait l'outil

1. **Import de l'étude au format PDF** — les pages du PDF remis par le client
   sont affichées, on choisit celle qui porte la vue attendue et on recadre
   dessus pour n'en garder que l'image utile. Le procès-verbal cite ensuite le
   fichier et le numéro de page servis de référence.
2. **Relevé du texte de l'étude** — focale, angle de vue, capteur, résolution,
   distance et hauteur annoncés sont lus dans le texte du PDF, caméra par
   caméra, puis confrontés au matériel réellement posé. Chaque valeur est
   présentée avec sa page d'origine et son extrait : l'outil propose, le
   technicien valide.
3. **Calculs optiques** — angles de champ horizontal / vertical / diagonal à
   partir du capteur et de la focale, largeur de scène couverte, densité en
   pixels par mètre, portées DORI (EN 62676-4), zone morte au pied du mât,
   focale nécessaire pour couvrir une largeur donnée.
4. **Recalage des deux vues** — estimation automatique du décalage, du zoom et
   du roulis entre l'image de référence et l'image réglée.
5. **Diagnostic** — traduction de ce recalage en écarts de réglage réels
   (degrés de panoramique, de site, de roulis ; pourcentage de cadrage), note
   de conformité sur 100 et consignes d'intervention en clair.
6. **Zones d'intérêt** — rectangles tracés sur la vue demandée, dont l'outil
   vérifie qu'ils restent couverts par le champ réellement réglé.
7. **Fiche et rapport** — la fiche complète (paramètres + images) s'enregistre
   en un fichier `.json` réouvrable ; le rapport s'imprime ou s'exporte en PDF.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `index.html` | structure de la page |
| `styles.css` | présentation, y compris la feuille d'impression du rapport |
| `js/optique.js` | calculs d'optique — module pur, testé |
| `js/alignement.js` | recalage des deux images — module pur, testé |
| `js/diagnostic.js` | écarts de réglage et consignes — module pur, testé |
| `js/etude-pdf.js` | ouverture du PDF d'étude et choix de la page |
| `js/lecture-etude.js` | relevé des valeurs annoncées dans le texte — module pur, testé |
| `js/format.js` | mise en forme des nombres à la française |
| `js/dom.js` | raccourcis de sélection partagés |
| `js/app.js` | assemblage : formulaire, toiles, rapport |
| `vendor/` | PDF.js (Mozilla, Apache 2.0), embarqué pour fonctionner hors ligne |
| `build.mjs` | fabrication du fichier unique |
| `tests/run.mjs` | tests unitaires des calculs |
| `tests/etude.mjs` | tests unitaires de la lecture d'étude |
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
npm run build      # écrit dist/analyse-vue-angle.html (~1,5 Mo)
```

Le script refuse de produire un fichier si deux modules déclarent un même nom au
premier niveau : concaténés dans une seule portée, ils feraient planter la page
au chargement. Mieux vaut un build qui échoue qu'un fichier muet.

À relancer après **toute** modification des sources — sinon le fichier livré aux
techniciens reste en retard sur le dépôt.

## Tests

```bash
npm test                 # 39 tests unitaires, sans navigateur
npm run build
npm run test:navigateur  # 20 tests de bout en bout (Playwright)
```

Les tests unitaires couvrent les calculs d'optique, la récupération de
transformations connues sur des scènes synthétiques (translation, zoom, roulis,
fort changement d'exposition), le rejet d'images sans rapport, la traduction des
écarts en consignes, et la lecture d'une étude (repérage des caméras, relevé des
caractéristiques, rejet des faux positifs numériques, confrontation au matériel
posé).

Les tests navigateur vérifient ce qu'aucun test unitaire ne peut voir : le
dossier servi en HTTP, l'aller-retour d'une fiche `.json`, et surtout le fichier
unique **ouvert depuis le disque** avec import d'une vraie étude PDF — jusqu'à
retrouver le même écart angulaire que la géométrie prédit, et à relever dans le
texte de cette étude les caractéristiques annoncées. Playwright n'est pas
une dépendance du projet : s'il est absent, ces tests sont ignorés au lieu
d'échouer.
