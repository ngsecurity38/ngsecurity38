/**
 * Calculs optiques pour l'analyse de vue d'angle.
 *
 * Module pur (aucune dépendance au DOM) : utilisable dans le navigateur
 * et dans les tests Node.
 */

/** Formats de capteurs courants en vidéosurveillance IP (zone utile 16/9, en mm). */
export const CAPTEURS = {
  '1/4"': { largeur: 3.6, hauteur: 2.03 },
  '1/3.6"': { largeur: 4.0, hauteur: 2.25 },
  '1/3"': { largeur: 4.8, hauteur: 2.7 },
  '1/2.9"': { largeur: 5.02, hauteur: 2.82 },
  '1/2.8"': { largeur: 5.18, hauteur: 2.92 },
  '1/2.7"': { largeur: 5.37, hauteur: 3.02 },
  '1/2.5"': { largeur: 5.76, hauteur: 3.24 },
  '1/2.3"': { largeur: 6.17, hauteur: 3.47 },
  '1/2"': { largeur: 6.4, hauteur: 3.6 },
  '1/1.8"': { largeur: 7.18, hauteur: 4.04 },
  '1/1.7"': { largeur: 7.6, hauteur: 4.28 },
  '1/1.2"': { largeur: 10.67, hauteur: 6.0 },
  '2/3"': { largeur: 8.8, hauteur: 4.95 },
  '1"': { largeur: 12.8, hauteur: 7.2 },

  /*
   * Capteurs thermiques. Un microbolomètre ne se désigne pas en pouces mais par
   * sa matrice et son pas de pixel : 256 × 192 au pas de 12 µm mesure
   * 3,07 × 2,30 mm. Choisir un format visible pour une caméra thermique
   * fausserait complètement l'angle de champ, et donc toute la mesure d'écart.
   */
  'Thermique 256×192 — 12 µm': { largeur: 3.072, hauteur: 2.304 },
  'Thermique 256×192 — 17 µm': { largeur: 4.352, hauteur: 3.264 },
  'Thermique 384×288 — 12 µm': { largeur: 4.608, hauteur: 3.456 },
  'Thermique 384×288 — 17 µm': { largeur: 6.528, hauteur: 4.896 },
  'Thermique 640×512 — 12 µm': { largeur: 7.68, hauteur: 6.144 },
  'Thermique 640×480 — 17 µm': { largeur: 10.88, hauteur: 8.16 },
};

/** Seuils DORI de la norme EN 62676-4, en pixels par mètre. */
export const SEUILS_DORI = {
  detection: { label: 'Détection', ppm: 25 },
  observation: { label: 'Observation', ppm: 62 },
  reconnaissance: { label: 'Reconnaissance', ppm: 125 },
  identification: { label: 'Identification', ppm: 250 },
};

export const degres = (radians) => (radians * 180) / Math.PI;
export const radians = (degres_) => (degres_ * Math.PI) / 180;

/**
 * Angle de champ d'un objectif rectilinéaire.
 * @param {number} dimensionCapteur dimension du capteur en mm (largeur ou hauteur)
 * @param {number} focale focale en mm
 * @returns {number} angle de champ en degrés
 */
export function angleDeChamp(dimensionCapteur, focale) {
  if (!(focale > 0) || !(dimensionCapteur > 0)) return 0;
  return degres(2 * Math.atan(dimensionCapteur / (2 * focale)));
}

/**
 * Angles de champ horizontal, vertical et diagonal.
 * @param {{largeur:number, hauteur:number}} capteur dimensions en mm
 * @param {number} focale en mm
 */
export function anglesDeChamp(capteur, focale) {
  const diagonale = Math.hypot(capteur.largeur, capteur.hauteur);
  return {
    horizontal: angleDeChamp(capteur.largeur, focale),
    vertical: angleDeChamp(capteur.hauteur, focale),
    diagonal: angleDeChamp(diagonale, focale),
  };
}

/**
 * Largeur (ou hauteur) de scène couverte à une distance donnée.
 * @param {number} angleDeg angle de champ en degrés
 * @param {number} distance en mètres
 * @returns {number} largeur couverte en mètres
 */
export function couverture(angleDeg, distance) {
  if (!(distance > 0)) return 0;
  return 2 * distance * Math.tan(radians(angleDeg) / 2);
}

/**
 * Focale nécessaire pour couvrir une largeur donnée à une distance donnée.
 * @param {number} largeurCapteur en mm
 * @param {number} largeurCible en mètres
 * @param {number} distance en mètres
 * @returns {number} focale en mm
 */
export function focaleRequise(largeurCapteur, largeurCible, distance) {
  if (!(largeurCible > 0) || !(distance > 0)) return 0;
  return (largeurCapteur * distance) / largeurCible;
}

/**
 * Densité de pixels sur la scène, en pixels par mètre.
 * @param {number} resolutionH résolution horizontale en pixels
 * @param {number} angleHDeg angle de champ horizontal en degrés
 * @param {number} distance en mètres
 */
export function pixelsParMetre(resolutionH, angleHDeg, distance) {
  const largeur = couverture(angleHDeg, distance);
  if (!(largeur > 0)) return 0;
  return resolutionH / largeur;
}

/**
 * Distance maximale à laquelle un critère DORI est encore tenu.
 * @param {number} resolutionH résolution horizontale en pixels
 * @param {number} angleHDeg angle de champ horizontal en degrés
 * @param {number} ppmRequis pixels par mètre exigés
 * @returns {number} distance en mètres
 */
export function distanceDori(resolutionH, angleHDeg, ppmRequis) {
  if (!(ppmRequis > 0) || !(angleHDeg > 0)) return 0;
  const largeurMax = resolutionH / ppmRequis;
  return largeurMax / (2 * Math.tan(radians(angleHDeg) / 2));
}

/** Tableau complet des distances DORI pour une configuration donnée. */
export function tableauDori(resolutionH, angleHDeg) {
  return Object.entries(SEUILS_DORI).map(([cle, { label, ppm }]) => ({
    cle,
    label,
    ppm,
    distance: distanceDori(resolutionH, angleHDeg, ppm),
  }));
}

/** Niveau DORI atteint pour une densité de pixels donnée. */
export function niveauDori(ppm) {
  if (ppm >= SEUILS_DORI.identification.ppm) return 'identification';
  if (ppm >= SEUILS_DORI.reconnaissance.ppm) return 'reconnaissance';
  if (ppm >= SEUILS_DORI.observation.ppm) return 'observation';
  if (ppm >= SEUILS_DORI.detection.ppm) return 'detection';
  return 'insuffisant';
}

/**
 * Convertit un décalage exprimé en fraction de la largeur d'image
 * en écart angulaire, en tenant compte de la projection rectilinéaire.
 *
 * Un décalage de 50 % de la largeur correspond exactement à un demi-angle
 * de champ ; la relation n'est pas linéaire entre les deux.
 *
 * @param {number} fraction décalage / largeur d'image (0.1 = 10 % de l'image)
 * @param {number} angleDeg angle de champ sur cet axe, en degrés
 * @returns {number} écart angulaire en degrés
 */
export function fractionVersAngle(fraction, angleDeg) {
  if (!(angleDeg > 0)) return 0;
  return degres(Math.atan(2 * fraction * Math.tan(radians(angleDeg) / 2)));
}

/**
 * Hauteur de montage et angle de site (inclinaison) à partir de la
 * distance au point visé.
 * @param {number} hauteur hauteur de la caméra en mètres
 * @param {number} distanceSol distance horizontale au point visé, en mètres
 * @param {number} hauteurCible hauteur du point visé (0 = au sol)
 * @returns {number} angle d'inclinaison sous l'horizontale, en degrés
 */
export function angleInclinaison(hauteur, distanceSol, hauteurCible = 0) {
  if (!(distanceSol > 0)) return 90;
  return degres(Math.atan((hauteur - hauteurCible) / distanceSol));
}

/** Zone morte au pied du mât : distance à partir de laquelle le sol entre dans le champ. */
export function zoneMorte(hauteur, inclinaisonDeg, angleVDeg) {
  const bordBas = inclinaisonDeg + angleVDeg / 2;
  if (bordBas >= 90) return 0;
  if (bordBas <= 0) return Infinity;
  return hauteur / Math.tan(radians(bordBas));
}
