/**
 * Traduction du recalage géométrique en écarts de réglage caméra
 * et en consignes d'intervention.
 *
 * Module pur (aucune dépendance au DOM).
 */

import { fractionVersAngle, radians } from './optique.js';

/** Tolérances par défaut d'une pose soignée. */
export const TOLERANCES_DEFAUT = {
  angle: 2.0, // écart de pointage horizontal / vertical, en degrés
  roulis: 1.5, // défaut d'aplomb, en degrés
  zoom: 5.0, // écart de cadrage, en pourcentage
};

// Deux vues du même point de vue, même à des heures différentes, dépassent
// largement ce seuil une fois la moyenne locale retirée ; deux scènes sans
// rapport restent en dessous. La valeur brute est rendue dans
// `qualiteRecalage` pour que le technicien puisse trancher lui-même.
const SEUIL_CORRELATION = 0.28;
const SEUIL_RECOUVREMENT = 0.4;

/** Note 0–100 d'un écart au regard de sa tolérance. */
export function noter(ecart, tolerance) {
  const e = Math.abs(ecart);
  if (!(tolerance > 0)) return e === 0 ? 100 : 0;
  if (e <= tolerance) return 100 - (20 * e) / tolerance;
  return Math.max(0, 80 - (80 * (e - tolerance)) / (2 * tolerance));
}

const arrondir = (v, n = 1) => {
  const f = 10 ** n;
  return Math.round(v * f) / f;
};

/** Nombre au format français, pour les consignes lues sur le terrain. */
const fr = (v, n = 1) => String(arrondir(v, n)).replace('.', ',');

/**
 * @param {object} transformation résultat de estimerTransformation()
 * @param {{horizontal:number, vertical:number}} angles angles de champ de la caméra
 * @param {object} [options]
 * @param {object} [options.tolerances]
 * @param {number} [options.distance] distance caméra → scène, en mètres
 * @param {number} [options.focale] focale actuelle, en mm
 */
export function diagnostiquer(transformation, angles, options = {}) {
  const tol = { ...TOLERANCES_DEFAUT, ...(options.tolerances || {}) };
  const { tx, ty, echelle, rotation, zncc, recouvrement } = transformation;
  const angleH = angles.horizontal;

  // Le contenu se déplace à l'inverse de la caméra : un décalage du contenu
  // vers la gauche (tx < 0) signifie que la caméra pointe trop à droite.
  const ecartPan = fractionVersAngle(-tx, angleH); // > 0 : caméra trop à droite
  const ecartSite = fractionVersAngle(-ty, angleH); // > 0 : caméra trop basse
  const ecartRoulis = -rotation; // > 0 : caméra penchée dans le sens horaire
  const ecartZoom = (echelle - 1) * 100; // > 0 : cadrage trop serré

  const fiable = zncc >= SEUIL_CORRELATION && recouvrement >= SEUIL_RECOUVREMENT;

  const criteres = [
    { cle: 'pan', label: 'Pointage horizontal', ecart: ecartPan, unite: '°', tolerance: tol.angle, poids: 2 },
    { cle: 'site', label: 'Pointage vertical', ecart: ecartSite, unite: '°', tolerance: tol.angle, poids: 2 },
    { cle: 'roulis', label: 'Aplomb (roulis)', ecart: ecartRoulis, unite: '°', tolerance: tol.roulis, poids: 1 },
    { cle: 'zoom', label: 'Cadrage / zoom', ecart: ecartZoom, unite: '%', tolerance: tol.zoom, poids: 1 },
  ].map((c) => ({
    ...c,
    ecart: arrondir(c.ecart, 2),
    note: arrondir(noter(c.ecart, c.tolerance), 0),
    conforme: Math.abs(c.ecart) <= c.tolerance,
  }));

  const poidsTotal = criteres.reduce((s, c) => s + c.poids, 0);
  const score = arrondir(criteres.reduce((s, c) => s + c.note * c.poids, 0) / poidsTotal, 0);

  let verdict;
  if (!fiable) verdict = 'indetermine';
  else if (criteres.every((c) => c.conforme)) verdict = 'conforme';
  else if (criteres.every((c) => Math.abs(c.ecart) <= c.tolerance * 3)) verdict = 'ajustement';
  else verdict = 'non-conforme';

  const consignes = [];
  if (fiable) {
    if (!criteres[0].conforme) {
      consignes.push({
        axe: 'Panoramique',
        texte: `Pivoter la caméra de ${fr(Math.abs(ecartPan))}° vers la ${ecartPan > 0 ? 'gauche' : 'droite'}.`,
      });
    }
    if (!criteres[1].conforme) {
      consignes.push({
        axe: 'Site',
        texte: `${ecartSite > 0 ? 'Relever' : 'Abaisser'} la caméra de ${fr(Math.abs(ecartSite))}°.`,
      });
    }
    if (!criteres[2].conforme) {
      consignes.push({
        axe: 'Aplomb',
        texte: `Remettre la caméra d'aplomb : rotation de ${fr(Math.abs(ecartRoulis))}° dans le sens ${ecartRoulis > 0 ? 'antihoraire' : 'horaire'}.`,
      });
    }
    if (!criteres[3].conforme) {
      const focale = options.focale > 0 ? ` (focale conseillée : ${fr(options.focale / echelle, 1)} mm)` : '';
      consignes.push({
        axe: 'Cadrage',
        texte: `${ecartZoom > 0 ? 'Élargir' : 'Resserrer'} le champ de ${fr(Math.abs(ecartZoom))} %${focale}.`,
      });
    }
    if (!consignes.length) {
      consignes.push({ axe: 'Aucune', texte: 'Le réglage est conforme à la vue demandée, aucune intervention nécessaire.' });
    }
  } else {
    consignes.push({
      axe: 'Recalage',
      texte:
        'Le recalage automatique n\'est pas fiable (scènes trop différentes ou recouvrement insuffisant). '
        + 'Vérifier que les deux images correspondent bien au même point de vue, ou régler l\'écart manuellement.',
    });
  }

  // Traduction de l'écart angulaire en mètres sur la scène, si la distance est connue.
  let decalageScene = null;
  if (options.distance > 0) {
    decalageScene = {
      horizontal: arrondir(options.distance * Math.tan(radians(ecartPan)), 2),
      vertical: arrondir(options.distance * Math.tan(radians(ecartSite)), 2),
    };
  }

  return {
    fiable,
    verdict,
    score,
    criteres,
    consignes,
    decalageScene,
    ecarts: {
      pan: arrondir(ecartPan, 2),
      site: arrondir(ecartSite, 2),
      roulis: arrondir(ecartRoulis, 2),
      zoom: arrondir(ecartZoom, 2),
    },
    qualiteRecalage: { zncc: arrondir(zncc, 3), recouvrement: arrondir(recouvrement, 3) },
  };
}

export const LIBELLES_VERDICT = {
  conforme: 'Conforme à la vue demandée',
  ajustement: 'Ajustement mineur nécessaire',
  'non-conforme': 'Non conforme — reprise du réglage',
  indetermine: 'Recalage non concluant',
};
