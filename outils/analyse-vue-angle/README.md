# Analyse de vue d'angle

Outil web qui compare **la vue d'angle demandée par le client** et **l'image
réellement réglée sur la caméra**, puis en déduit les corrections de pointage à
appliquer et produit un procès-verbal imprimable.

Aucun serveur, aucune dépendance, aucun envoi d'image : tout tourne dans le
navigateur. La page fonctionne hors ligne, y compris depuis une clé USB sur une
tablette de chantier.

## Utilisation

Ouvrir `index.html` dans un navigateur. Pour le mode d'emploi complet et la
mise en ligne sur le site WordPress, voir
[`docs/analyse-vue-angle.md`](../../docs/analyse-vue-angle.md).

## Ce que fait l'outil

1. **Calculs optiques** — angles de champ horizontal / vertical / diagonal à
   partir du capteur et de la focale, largeur de scène couverte, densité en
   pixels par mètre, portées DORI (EN 62676-4), zone morte au pied du mât,
   focale nécessaire pour couvrir une largeur donnée.
2. **Recalage des deux vues** — estimation automatique du décalage, du zoom et
   du roulis entre l'image de référence et l'image réglée.
3. **Diagnostic** — traduction de ce recalage en écarts de réglage réels
   (degrés de panoramique, de site, de roulis ; pourcentage de cadrage), note
   de conformité sur 100 et consignes d'intervention en clair.
4. **Zones d'intérêt** — rectangles tracés sur la vue demandée, dont l'outil
   vérifie qu'ils restent couverts par le champ réellement réglé.
5. **Fiche et rapport** — la fiche complète (paramètres + images) s'enregistre
   en un fichier `.json` réouvrable ; le rapport s'imprime ou s'exporte en PDF.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `index.html` | structure de la page |
| `styles.css` | présentation, y compris la feuille d'impression du rapport |
| `js/optique.js` | calculs d'optique — module pur, testé |
| `js/alignement.js` | recalage des deux images — module pur, testé |
| `js/diagnostic.js` | écarts de réglage et consignes — module pur, testé |
| `js/app.js` | assemblage : formulaire, toiles, rapport |
| `tests/run.mjs` | tests unitaires |

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

- Le recalage suppose **le même point de vue**. Deux photos prises depuis des
  emplacements différents ne sont pas comparables par cette méthode : il faut
  alors passer par le recalage manuel.
- La distorsion des très courtes focales (fisheye, grand-angle marqué) n'est
  pas corrigée. Les écarts restent justes au centre de l'image et se dégradent
  vers les bords.
- L'indice de corrélation affiché sert de garde-fou : en dessous du seuil, le
  verdict passe en « recalage non concluant » plutôt que d'annoncer un écart
  inventé. La valeur brute reste affichée pour que le technicien tranche.

## Tests

```bash
cd outils/analyse-vue-angle
npm test          # ou : node --test tests/run.mjs
```

22 tests couvrent les calculs d'optique, la récupération de transformations
connues sur des scènes synthétiques (translation, zoom, roulis, fort changement
d'exposition), le rejet d'images sans rapport, et la traduction des écarts en
consignes.
