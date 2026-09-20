# Être trouvé sur Google

Ce que le code fait, ce que vous seul pouvez faire, et ce que personne ne peut
promettre.

---

## Ce qui est fait

| Quoi | Où | À quoi ça sert |
| --- | --- | --- |
| Adresse canonique | dans chaque page | Les pages existent aussi sur GitHub Pages. Sans cette balise, Google choisit lui-même laquelle des deux copies indexer, et il lui arrive de retenir la mauvaise. |
| Titres et descriptions | idem | Uniques, de la bonne longueur, avec la marque. Deux pages au même titre et Google n'en garde qu'une. |
| Page d'accueil `/outils/` | `docs/outils/index.html` | Avant, cette adresse répondait 404 et les trois pages étaient orphelines. Un moteur découvre une page parce qu'un lien y mène. |
| `sitemap.xml` | `/outils/sitemap.xml` | La liste des quatre adresses, à donner une fois à la Search Console. |
| Vignettes de partage | `/outils/og-*.png` | Ce qu'affichent WhatsApp, Facebook ou un SMS quand on colle le lien. Sans elles, le lien arrive nu. |
| Données structurées | dans chaque page | Fil d'Ariane et identité de l'agence, en JSON-LD. |

Huit tests automatiques vérifient tout cela à chaque modification.

---

## Ce que vous seul pouvez faire

Par ordre d'importance. Le premier compte plus que tous les autres réunis.

### 1. Mettre les outils au menu de votre site

**C'est le point qui bloque tout le reste.** Aujourd'hui, rien sur
`ngsecurity38.fr` ne pointe vers `/outils/`. Pour Google, ces pages n'existent
pas : il ne les a jamais rencontrées.

Ajoutez dans le menu de votre site :

- `/outils/etude/` — Quelle caméra vous faut-il ?
- `/outils/devis/` — Estimer mes caméras
- `/outils/alarme/` — Alarme anti-intrusion

Ou, plus simple, une seule entrée vers `/outils/` : la page d'accueil des
outils mène aux trois.

### 2. Déclarer le sitemap

Sur [Google Search Console](https://search.google.com/search-console), section
**Sitemaps**, ajoutez :

```
https://ngsecurity38.fr/outils/sitemap.xml
```

Si le site n'y est pas encore inscrit, c'est l'occasion : c'est gratuit, et
c'est le seul endroit où l'on voit ce que Google a réellement indexé.

### 3. Vérifier le `robots.txt`

Ouvrez `https://ngsecurity38.fr/robots.txt`. S'il contient une ligne
`Disallow: /outils` ou `Disallow: /`, rien de ce qui précède ne servira à
rien. Ce fichier est servi par votre application, pas par le conteneur des
outils : je n'y ai pas accès.

### 4. Votre fiche Google Business Profile

Pour un installateur, c'est le premier levier local — davantage qu'un site.
Gratuite, à remplir une fois : zone d'intervention, horaires, photos, avis.

---

## Un point à trancher

Vos titres ne portent **aucune ville**, et c'est volontaire : je ne devine pas.

L'entreprise s'appelle **NG Security 38** — le 38, c'est l'Isère. Mais la page
d'accueil de votre site annonce une zone dans l'**Yonne (89)** : Sens, Auxerre,
Joigny, Migennes.

Les deux ne peuvent pas être vrais en même temps pour le référencement local.
Dites-moi quelle est votre vraie zone d'intervention, et j'ajoute la ville aux
titres et aux descriptions — c'est ce qui fait la différence entre « devis
alarme » (invendable, tout le monde s'y bat) et « devis alarme Auxerre »
(atteignable).

---

## Ce que personne ne peut promettre

Aucune de ces mesures ne garantit un classement. Elles suppriment les raisons
pour lesquelles une page *ne peut pas* être trouvée — ce n'est pas la même
chose que de la faire monter.

Ce qui fait monter, c'est le temps, les liens que d'autres sites font vers le
vôtre, et le fait que vos pages répondent vraiment à ce que les gens tapent.
Les trois outils sont de bons candidats sur ce dernier point : ils font quelque
chose qu'aucune page de concurrent ne fait.

Comptez **plusieurs semaines** avant que les pages apparaissent, et davantage
avant qu'elles se classent.
