# Liens croisés entre ngsecurity38.com et ngsecurity38.fr

Objectif : deux sites WordPress qui restent **totalement séparés**, reliés par un
simple lien cliquable. Pas de redirection, pas de code, pas de plugin.

- `ngsecurity38.com` → boutique / particuliers
- `ngsecurity38.fr` → espace professionnels

---

## 1. Ajouter le lien dans le menu

À faire sur **chacun** des deux sites.

1. Se connecter à l'admin WordPress (`/wp-admin`).
2. **Apparence > Menus** (ou **Apparence > Personnaliser > Menus**).
3. Choisir le menu principal dans le sélecteur en haut, puis **Sélectionner**.
4. Dans la colonne de gauche, déplier **Liens personnalisés**.
5. Renseigner les deux champs :

   | Site où l'on ajoute le lien | URL                         | Texte du lien           |
   | --------------------------- | --------------------------- | ----------------------- |
   | `ngsecurity38.com`          | `https://ngsecurity38.fr`   | Espace Professionnels   |
   | `ngsecurity38.fr`           | `https://ngsecurity38.com`  | Boutique / Particuliers |

6. Cliquer sur **Ajouter au menu**.
7. Glisser-déposer l'entrée à la position voulue dans la structure du menu.
8. Cliquer sur **Enregistrer le menu**.

### Ouvrir dans un nouvel onglet (optionnel)

Par défaut WordPress masque cette option.

1. En haut à droite de la page Menus, ouvrir **Options de l'écran**.
2. Cocher **Ouvrir le lien dans un nouvel onglet** (section « Afficher les
   propriétés avancées du menu »).
3. Déplier l'entrée de menu concernée, cocher la case, puis **Enregistrer le menu**.

---

## 2. Bouton visible sur la page d'accueil (optionnel)

Si un bouton bien visible est préférable au lien de menu :

**Éditeur de blocs (Gutenberg)**
1. Ouvrir la page d'accueil (ou la page Professionnels) en édition.
2. Ajouter un bloc **Boutons > Bouton**.
3. Saisir le libellé, puis coller l'URL complète dans le champ lien.
4. Activer **Ouvrir dans un nouvel onglet**.
5. **Mettre à jour**.

**Flatsome (UX Builder)**
1. Ouvrir la page avec **Modifier avec UX Builder**.
2. Ajouter l'élément **Button**.
3. Onglet *Content* : renseigner le texte et le champ **Link**.
4. Cocher **Open in new tab**.
5. **Update**.

---

## Point de vigilance

Toujours écrire l'adresse **complète avec `https://`** :

- ✅ `https://ngsecurity38.fr`
- ❌ `ngsecurity38.fr` — WordPress la traite comme une page interne
  (`https://ngsecurity38.com/ngsecurity38.fr`) et le lien mène à une erreur 404.

---

## Vérification

Après enregistrement, sur chaque site :

1. Ouvrir la page d'accueil en navigation privée (pour éviter le cache).
2. Cliquer sur le nouveau lien.
3. Vérifier que l'URL de destination est bien l'autre domaine, en `https://`,
   sans segment ajouté.
4. Si le lien n'apparaît pas : vider le cache du site (plugin de cache,
   Hostinger, Cloudflare) puis recharger.
