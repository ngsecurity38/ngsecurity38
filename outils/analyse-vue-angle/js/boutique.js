/**
 * Catalogue de la boutique, traduit en langage d'acheteur.
 *
 * Un particulier ne sait pas ce qu'est une focale de 4 mm ni un capteur
 * 1/2.8". Il sait en revanche très bien ce qu'il veut : « voir qui sonne à ma
 * porte », « surveiller le fond du jardin ». Ce module fait la traduction,
 * avec les mêmes fonctions optiques que l'outil d'étude — pas une règle de
 * trois écrite pour la vitrine.
 *
 * Règle intangible : **rien n'est inventé**. Une caméra sans optique
 * renseignée est présentée sans chiffres plutôt qu'avec des chiffres
 * plausibles.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { CAPTEURS, SEUILS_DORI, anglesDeChamp, couverture, distanceDori } from './optique.js';

/**
 * Capteur retenu faute de mieux.
 *
 * C'est le format courant des caméras IP 4K de vidéosurveillance. Il est
 * *supposé* : `estSuppose` le dit, et la page l'écrit au visiteur.
 */
export const CAPTEUR_DEFAUT = '1/2.8"';

/** Distance de référence pour annoncer une largeur de champ, en mètres. */
export const DISTANCE_VITRINE = 10;

/**
 * Plafond de portée, faute de mieux : 150 m.
 *
 * L'optique seule mène à des chiffres que le terrain dément. Un 25× annonce
 * une reconnaissance à 677 m si l'on ne regarde que les pixels ; de nuit
 * l'infrarouge s'arrête à 200 m, et de jour la brume et la turbulence de
 * l'air font le reste. Hikvision plafonne ce même modèle à 409 m dans sa
 * propre table. Imprimer 677 m sur une page client serait indéfendable.
 *
 * `porteeMax` sur la fiche produit — la portée de l'éclairage, en général —
 * remplace ce plafond dès qu'elle est connue.
 */
export const PLAFOND_DEFAUT = 150;

/** Ce que chaque niveau permet, dit à un particulier. */
export const USAGES = {
  detection: 'voir qu\'il se passe quelque chose',
  observation: 'suivre ce qui se passe',
  reconnaissance: 'reconnaître quelqu\'un que vous connaissez',
  identification: 'identifier une personne inconnue',
};

/** Un nombre utilisable, ou 0. */
const nombre = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/**
 * Les deux focales d'un produit : bornes d'un zoom, ou deux fois la même pour
 * un objectif fixe.
 * @returns {{min:number, max:number}|null} null si aucune focale n'est connue
 */
export function focales(produit) {
  const min = nombre(produit?.focaleMin) || nombre(produit?.focale);
  const max = nombre(produit?.focaleMax) || nombre(produit?.focale) || min;
  if (!min) return null;
  return { min, max: Math.max(min, max) };
}

/**
 * Ce qu'un produit permet de voir.
 *
 * L'angle de champ vient du constructeur dès qu'il est renseigné, et c'est
 * toujours préférable : un grand-angle n'est pas rectiligne. Dahua annonce
 * 95° pour son 2,8 mm quand le calcul en donne 83, Axis 130° pour un 2,4 mm
 * quand le calcul en donne 98. Calculer à sa place resserrerait le champ sur
 * le papier, donc gonflerait les pixels par mètre — et la caméra posée au mur
 * démentirait la page.
 *
 * Faute d'angle déclaré, il est calculé depuis la focale et le capteur, et
 * `angleCalcule` le dit.
 *
 * @returns {object|null} null tant que la définition, et soit l'angle soit la
 *   focale, ne sont pas connues — auquel cas la page n'annonce aucun chiffre.
 */
export function capacites(produit) {
  const resH = nombre(produit?.resH);
  if (!resH) return null;

  const f = focales(produit);
  const declareLarge = nombre(produit?.angleH);
  const declareSerre = nombre(produit?.angleHTele);
  if (!declareLarge && !f) return null;

  const nomCapteur = produit.capteur && CAPTEURS[produit.capteur]
    ? produit.capteur : CAPTEUR_DEFAUT;
  const capteur = CAPTEURS[nomCapteur];
  const calcule = (focale) => anglesDeChamp(capteur, focale).horizontal;
  const plafond = nombre(produit?.porteeMax) || PLAFOND_DEFAUT;

  // Au grand angle pour la largeur embrassée, au téléobjectif pour la portée :
  // c'est ainsi que le produit sera réglé selon ce qu'on lui demande.
  const angleLarge = declareLarge || calcule(f.min);
  // Le téléobjectif : l'angle déclaré s'il existe, sinon le calcul sur la
  // focale longue, sinon l'objectif est fixe et le champ ne bouge pas.
  const angleSerre = declareSerre
    || (f && f.max > f.min ? calcule(f.max) : angleLarge);

  const optiques = Object.fromEntries(Object.keys(SEUILS_DORI).map((cle) => [
    cle, distanceDori(resH, angleSerre, SEUILS_DORI[cle].ppm),
  ]));

  return {
    reglable: angleSerre < angleLarge - 0.5,
    focaleMin: f ? f.min : null,
    focaleMax: f ? f.max : null,
    capteur: nomCapteur,
    // L'angle vient-il du constructeur, ou d'un calcul sur un capteur supposé ?
    angleCalcule: !declareLarge,
    estSuppose: !declareLarge && (!produit.capteur || !CAPTEURS[produit.capteur]),
    angleLarge,
    angleSerre,
    largeurA: (d = DISTANCE_VITRINE) => couverture(angleLarge, d),
    // Le zoom annoncé par le constructeur prime : un 2,8–12 mm fait 4,29× au
    // calcul, et Hikvision l'appelle un ×4. Autant parler comme la fiche.
    zoom: nombre(produit?.zoom) || (f && f.max > f.min ? f.max / f.min : 1),
    ptz: produit.type === 'ptz',
    plafond,
    // Ce que l'optique permet, et ce que le terrain tient vraiment.
    portees: optiques,
    porteesTenues: Object.fromEntries(Object.entries(optiques)
      .map(([cle, d]) => [cle, Math.min(d, plafond)])),
    /*
     * Vrai seulement si un chiffre RÉELLEMENT AFFICHÉ a été rabattu. Se fier
     * à la détection — qui porte toujours le plus loin — ferait apparaître
     * l'avertissement sous des fiches dont aucune distance annoncée n'a
     * bougé.
     */
    plafonne: optiques.reconnaissance > plafond,
  };
}

/**
 * Phrase de vitrine : ce que cette caméra permet de faire, et jusqu'où.
 *
 * On annonce la reconnaissance plutôt que l'identification : c'est le niveau
 * qu'un client attend d'une caméra d'extérieur, et le promettre à la distance
 * d'identification reviendrait à vendre deux fois moins de portée qu'annoncé.
 */
export function argumentaire(produit) {
  const c = capacites(produit);
  if (!c) return null;
  const largeur = c.largeurA(DISTANCE_VITRINE);
  const optique = optiqueEnClair(c);
  return {
    optique,
    largeur,
    // Deux repères concrets : ce qu'on embrasse de large, et jusqu'où on
    // reconnaît une tête connue. Les portées sont celles que le terrain
    // tient, pas celles que l'optique promet.
    champ: `${optique} — ${arr(largeur)} m de large à ${DISTANCE_VITRINE} m`,
    reconnaissance: c.porteesTenues.reconnaissance,
    identification: c.porteesTenues.identification,
    plafonne: c.plafonne,
    plafond: c.plafond,
    ptz: c.ptz,
    zoom: c.zoom,
  };
}

/**
 * L'objectif, dit en clair.
 *
 * La focale parle au professionnel ; l'angle parle à tout le monde. On donne
 * les deux quand on a les deux, l'angle seul sinon.
 */
function optiqueEnClair(c) {
  if (c.ptz && c.zoom > 1.05) {
    // Sur une caméra mobile, le zoom parle plus que la focale : « ×25 » se
    // comprend, « 5,9 à 147,5 mm » demande un calcul.
    return `zoom ×${arr(c.zoom)}, de ${arr(c.angleLarge)} ° à ${arr(c.angleSerre)} °`;
  }
  if (!c.focaleMin) return `champ de ${arr(c.angleLarge)} °`;
  if (c.reglable && c.focaleMax > c.focaleMin) {
    return `objectif réglable de ${arr(c.focaleMin)} à ${arr(c.focaleMax)} mm`;
  }
  return `objectif ${arr(c.focaleMin)} mm, ${arr(c.angleLarge)} ° de champ`;
}

/** Arrondi à une décimale, sans zéro inutile : 4 et non 4,0. */
const arr = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

/**
 * Produits retenus pour la page, dans l'ordre du fichier.
 *
 * Seule la référence est exigée : sans elle le visiteur n'aurait rien à
 * demander. L'adresse d'une fiche produit, elle, est facultative — sur
 * l'espace professionnel il n'y a pas de boutique derrière, et une fiche qui
 * annonce un champ et une portée renseigne même sans lien marchand.
 */
export const produitsAffichables = (catalogue) => (catalogue?.produits || [])
  .filter((p) => p && typeof p.reference === 'string' && p.reference.trim());

/**
 * Réserves à afficher sous le catalogue.
 *
 * Un fichier vide n'est pas une erreur : c'est un catalogue pas encore
 * rempli. Le dire vaut mieux que montrer une grille vide sans explication.
 */
export function reservesCatalogue(catalogue) {
  const reserves = [];
  const bruts = catalogue?.produits || [];
  const affichables = produitsAffichables(catalogue);

  if (!bruts.length) {
    reserves.push('Aucun produit n\'est encore inscrit à cette page.');
  } else if (affichables.length < bruts.length) {
    const n = bruts.length - affichables.length;
    reserves.push(`${n} produit${n > 1 ? 's' : ''} sans référence : non affiché, `
      + 'faute de quoi le visiteur ne saurait pas quoi demander.');
  }

  const sansOptique = affichables.filter((p) => !capacites(p));
  if (sansOptique.length) {
    reserves.push(`${sansOptique.length} produit${sansOptique.length > 1 ? 's' : ''} sans `
      + 'optique renseignée : présenté sans portée annoncée. '
      + 'Renseignez resH, puis angleH (l\'angle du constructeur) ou à défaut '
      + 'focale, pour que la page les calcule.');
  }
  return reserves;
}
