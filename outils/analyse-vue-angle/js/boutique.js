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
 * Ce qu'un produit permet de voir, calculé sur son optique.
 *
 * @returns {object|null} null tant que focale et définition ne sont pas toutes
 *   deux connues — auquel cas la page n'annonce aucun chiffre.
 */
export function capacites(produit) {
  const f = focales(produit);
  const resH = nombre(produit?.resH);
  if (!f || !resH) return null;

  const nomCapteur = produit.capteur && CAPTEURS[produit.capteur]
    ? produit.capteur : CAPTEUR_DEFAUT;
  const capteur = CAPTEURS[nomCapteur];

  // Au grand angle pour la largeur embrassée, au téléobjectif pour la portée :
  // c'est ainsi que le produit sera réglé selon ce qu'on lui demande.
  const angleLarge = anglesDeChamp(capteur, f.min).horizontal;
  const angleSerre = anglesDeChamp(capteur, f.max).horizontal;

  return {
    reglable: f.max > f.min,
    focaleMin: f.min,
    focaleMax: f.max,
    capteur: nomCapteur,
    estSuppose: !produit.capteur || !CAPTEURS[produit.capteur],
    angleLarge,
    angleSerre,
    largeurA: (d = DISTANCE_VITRINE) => couverture(angleLarge, d),
    portees: Object.fromEntries(Object.keys(SEUILS_DORI).map((cle) => [
      cle, distanceDori(resH, angleSerre, SEUILS_DORI[cle].ppm),
    ])),
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
  const optique = c.reglable
    ? `objectif réglable de ${arr(c.focaleMin)} à ${arr(c.focaleMax)} mm`
    : `objectif ${arr(c.focaleMin)} mm`;
  return {
    optique,
    largeur,
    // Deux repères concrets : ce qu'on embrasse de large, et jusqu'où on
    // reconnaît une tête connue.
    champ: `${optique} — ${arr(largeur)} m de large à ${DISTANCE_VITRINE} m`,
    reconnaissance: c.portees.reconnaissance,
    identification: c.portees.identification,
  };
}

/** Arrondi à une décimale, sans zéro inutile : 4 et non 4,0. */
const arr = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

/**
 * Produits retenus pour la page, dans l'ordre du fichier.
 *
 * Un produit sans référence n'est pas affichable : le client n'aurait rien à
 * demander. Un produit sans adresse ne l'est pas davantage sur une boutique —
 * une vignette sur laquelle on ne peut pas cliquer ne sert personne.
 */
export const produitsAffichables = (catalogue) => (catalogue?.produits || [])
  .filter((p) => p && typeof p.reference === 'string' && p.reference.trim() && p.url);

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
    reserves.push(`${n} produit${n > 1 ? 's' : ''} sans référence ou sans adresse de `
      + 'fiche : non affiché, faute de quoi le visiteur ne saurait pas quoi demander.');
  }

  const sansOptique = affichables.filter((p) => !capacites(p));
  if (sansOptique.length) {
    reserves.push(`${sansOptique.length} produit${sansOptique.length > 1 ? 's' : ''} sans `
      + 'focale ni définition : présenté sans portée annoncée. '
      + 'Renseignez focale et resH pour que la page les calcule.');
  }
  return reserves;
}
