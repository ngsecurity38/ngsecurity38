/**
 * Champ de vision tracé sur un plan.
 *
 * Le pendant de l'analyse : au lieu de vérifier qu'une caméra posée respecte
 * l'étude, on trace sur une vue aérienne la zone à couvrir, et l'outil en
 * déduit l'ouverture, la focale nécessaire et la densité obtenue.
 *
 * Toutes les coordonnées sont normalisées par la **largeur** de l'image du
 * plan : un point vaut (x, y) en fractions de cette largeur. L'échelle est donc
 * exprimée en mètres par unité normalisée, ce qui rend les mesures
 * indépendantes de la définition de l'image chargée.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { degres, radians } from './optique.js';

/** Distance entre deux points, en unités normalisées. */
export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Échelle du plan, à partir d'une distance connue.
 * @param {{x:number,y:number}} a premier repère
 * @param {{x:number,y:number}} b second repère
 * @param {number} metres distance réelle entre les deux
 * @returns {number} mètres par unité normalisée, 0 si l'étalonnage est inutilisable
 */
export function echelleDuPlan(a, b, metres) {
  const d = distance(a, b);
  if (!(d > 1e-6) || !(metres > 0)) return 0;
  return metres / d;
}

/**
 * Azimut d'une visée, en degrés.
 * 0° vers le haut du plan, puis dans le sens horaire — convention des vues
 * aériennes, où le nord est en haut.
 */
export function azimut(sommet, point) {
  const a = degres(Math.atan2(point.x - sommet.x, sommet.y - point.y));
  return (a + 360) % 360;
}

/** Portée d'une visée, en mètres. */
export const portee = (sommet, point, echelle) => distance(sommet, point) * echelle;

/**
 * Polygone du cône de couverture, pour le tracé.
 * @param {object} sommet position de la caméra
 * @param {number} azimutDeg direction de visée
 * @param {number} ouvertureDeg angle de champ horizontal
 * @param {number} rayon portée, en unités normalisées
 * @param {number} [segments=24] finesse de l'arc de fermeture
 */
export function polygoneCone(sommet, azimutDeg, ouvertureDeg, rayon, segments = 24) {
  const points = [{ ...sommet }];
  const debut = azimutDeg - ouvertureDeg / 2;
  for (let i = 0; i <= segments; i += 1) {
    const a = radians(debut + (ouvertureDeg * i) / segments);
    points.push({
      x: sommet.x + rayon * Math.sin(a),
      y: sommet.y - rayon * Math.cos(a),
    });
  }
  return points;
}

/**
 * Dimensionnement d'un champ tracé sur le plan.
 *
 * @param {object} trace {sommet, vise, ouverture} — le point visé donne la
 *   direction et la portée, l'ouverture donne la largeur du cône
 * @param {number} echelle mètres par unité normalisée
 * @param {object} capteur dimensions du capteur, en mm
 * @param {number} resolutionH définition horizontale, en pixels
 */
export function dimensionner(trace, echelle, capteur, resolutionH) {
  const { sommet, vise, ouverture } = trace;
  const distanceM = portee(sommet, vise, echelle);
  const demi = radians(ouverture) / 2;

  // Largeur de scène embrassée à la portée visée.
  const largeur = 2 * distanceM * Math.tan(demi);
  // Focale qui donne exactement cette ouverture avec ce capteur.
  const focale = ouverture > 0 && ouverture < 180
    ? capteur.largeur / (2 * Math.tan(demi))
    : 0;
  const densite = largeur > 0 ? resolutionH / largeur : 0;

  return {
    azimut: azimut(sommet, vise),
    portee: distanceM,
    ouverture,
    largeur,
    focale,
    densite,
    // Surface approchée du secteur couvert, utile pour comparer deux options.
    surface: (radians(ouverture) / 2) * distanceM * distanceM,
  };
}

/** Ouverture obtenue avec une focale donnée — le tracé suit alors l'objectif. */
export function ouverturePourFocale(capteur, focale) {
  if (!(focale > 0)) return 0;
  return degres(2 * Math.atan(capteur.largeur / (2 * focale)));
}
