/**
 * Analyse d'une photo prise depuis l'emplacement de la caméra.
 *
 * Le point de départ d'une étude, ce sont les photos du repérage. Sur l'une
 * d'elles, on entoure la zone que le client veut voir ; ce module en tire les
 * distances réelles, l'angle de vue nécessaire et la définition obtenue.
 *
 * Modèle : sténopé (projection rectilinéaire), sol plan, caméra sans roulis.
 * Repère de l'appareil : X vers la droite, Y vers le bas, Z vers l'avant.
 * Les coordonnées d'image sont des fractions (u, v) dans [0, 1], origine en
 * haut à gauche.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { degres, radians } from './optique.js';

/** Champs de vision usuels des appareils qui servent au repérage. */
export const APPAREILS = {
  'Téléphone — objectif principal': 67,
  'Téléphone — ultra grand-angle': 105,
  'Téléphone — téléobjectif': 34,
  'Appareil photo — 24 mm équivalent': 74,
  'Appareil photo — 35 mm équivalent': 55,
  'Caméra en place (champ calculé au bloc 2)': 0,
};

/**
 * Direction du rayon passant par un point de l'image, dans le repère appareil.
 * @param {number} u abscisse, en fraction de la largeur
 * @param {number} v ordonnée, en fraction de la hauteur
 * @param {number} angleH champ horizontal de la photo, en degrés
 * @param {number} angleV champ vertical de la photo, en degrés
 */
export function rayon(u, v, angleH, angleV) {
  return {
    x: (2 * u - 1) * Math.tan(radians(angleH) / 2),
    y: (2 * v - 1) * Math.tan(radians(angleV) / 2),
    z: 1,
  };
}

/**
 * Point du sol visé par un pixel de la photo.
 *
 * C'est le cœur de l'analyse automatique : la hauteur de prise de vue et
 * l'inclinaison étant connues, l'ordonnée d'un point dans l'image donne sa
 * distance réelle. Un point au-dessus de l'horizon ne rencontre jamais le sol
 * et ne renvoie rien.
 *
 * @param {object} prise {hauteur, inclinaison, angleH, angleV}
 * @returns {{distance:number, avant:number, lateral:number}|null} en mètres
 */
export function pointAuSol(u, v, prise) {
  const { hauteur, inclinaison, angleH, angleV } = prise;
  if (!(hauteur > 0)) return null;
  const r = rayon(u, v, angleH, angleV);
  const t = radians(inclinaison);
  const cos = Math.cos(t);
  const sin = Math.sin(t);

  // Rotation de l'appareil vers le bas, autour de son axe X.
  const bas = r.y * cos + r.z * sin;
  const avant = -r.y * sin + r.z * cos;
  if (!(bas > 1e-9)) return null; // rayon au-dessus de l'horizon

  const k = hauteur / bas;
  return {
    avant: k * avant,
    lateral: k * r.x,
    distance: Math.hypot(k * avant, k * r.x),
  };
}

/**
 * Inclinaison déduite d'un point dont la distance est connue.
 *
 * Personne ne sait donner au degré près l'inclinaison d'une photo. En revanche,
 * tout le monde peut désigner un point du sol et dire à quelle distance il se
 * trouve — un portail, l'angle d'un bâtiment, une place de parking. La distance
 * décroît quand l'appareil pique vers le bas : une recherche par dichotomie
 * suffit.
 *
 * @returns {number} inclinaison en degrés sous l'horizontale, 0 si insoluble
 */
export function inclinaisonPourDistance(u, v, distance, prise) {
  if (!(distance > 0) || !(prise.hauteur > 0)) return 0;
  const mesure = (t) => {
    const p = pointAuSol(u, v, { ...prise, inclinaison: t });
    return p ? p.distance : Infinity;
  };
  let bas = 0.05;
  let haut = 89;
  if (mesure(bas) < distance) return 0; // hors d'atteinte, même à l'horizontale
  for (let i = 0; i < 60; i += 1) {
    const milieu = (bas + haut) / 2;
    if (mesure(milieu) > distance) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}

/**
 * Ordonnée, dans l'image, de la ligne de sol située à une distance donnée.
 *
 * Sert à tracer les lignes d'iso-distance sur la photo : rien ne convainc mieux
 * un client que de voir « 20 m » posé à l'endroit exact où se trouvent 20 m.
 *
 * @returns {number|null} ordonnée en fraction de hauteur, null si hors champ
 */
export function ordonneePourDistance(u, distance, prise) {
  if (!(distance > 0)) return null;
  const mesure = (v) => {
    const p = pointAuSol(u, v, prise);
    return p ? p.distance : Infinity;
  };
  // La distance décroît du haut vers le bas de l'image.
  let haut = 0;
  let bas = 1;
  if (mesure(bas) > distance) return null; // plus proche que le bord inférieur
  if (mesure(haut) < distance) return null; // plus loin que le bord supérieur
  for (let i = 0; i < 50; i += 1) {
    const milieu = (haut + bas) / 2;
    if (mesure(milieu) > distance) haut = milieu;
    else bas = milieu;
  }
  const v = (haut + bas) / 2;
  return v > 0 && v < 1 ? v : null;
}

/** Champ vertical déduit du champ horizontal et du format de l'image. */
export const champVertical = (angleH, rapport) => degres(
  2 * Math.atan(Math.tan(radians(angleH) / 2) * rapport),
);

/**
 * Champ de vision ET inclinaison déduits de deux points de distance connue.
 *
 * Choisir l'appareil dans une liste reste une approximation : un recadrage, un
 * zoom intermédiaire, et l'échelle angulaire est fausse. Avec deux points du
 * sol dont on connaît la distance, les deux inconnues se lèvent d'un coup —
 * plus rien n'est supposé, tout est mesuré.
 *
 * Le premier point fixe l'inclinaison pour un champ donné ; le second dit si ce
 * champ était le bon. On balaie les champs plausibles jusqu'au changement de
 * signe de l'écart, puis on affine par dichotomie.
 *
 * @param {{u:number, v:number, distance:number}} a premier repère
 * @param {{u:number, v:number, distance:number}} b second repère
 * @param {{hauteur:number, rapport:number}} prise hauteur en m, rapport hauteur/largeur de l'image
 * @returns {{angleH:number, angleV:number, inclinaison:number}|null}
 */
export function calibrerDeuxPoints(a, b, prise) {
  const { hauteur, rapport } = prise;
  if (!(hauteur > 0) || !(rapport > 0)) return null;
  if (!(a.distance > 0) || !(b.distance > 0)) return null;
  if (Math.abs(a.v - b.v) < 0.02) return null; // deux points à la même hauteur n'apprennent rien

  const resoudre = (angleH) => {
    const p = { hauteur, angleH, angleV: champVertical(angleH, rapport) };
    const inclinaison = inclinaisonPourDistance(a.u, a.v, a.distance, p);
    if (!(inclinaison > 0)) return null;
    const sol = pointAuSol(b.u, b.v, { ...p, inclinaison });
    if (!sol) return null;
    return { inclinaison, ecart: sol.distance - b.distance };
  };

  // Balayage des champs plausibles, du téléobjectif au très grand-angle.
  let precedent = null;
  let borneBasse = null;
  let borneHaute = null;
  for (let angle = 15; angle <= 150; angle += 1) {
    const r = resoudre(angle);
    if (!r) { precedent = null; continue; }
    if (precedent && Math.sign(r.ecart) !== Math.sign(precedent.ecart)) {
      borneBasse = precedent.angle;
      borneHaute = angle;
      break;
    }
    precedent = { angle, ecart: r.ecart };
  }
  if (borneBasse === null) return null; // aucune solution dans la plage

  for (let i = 0; i < 50; i += 1) {
    const milieu = (borneBasse + borneHaute) / 2;
    const r = resoudre(milieu);
    if (!r) break;
    const bas = resoudre(borneBasse);
    if (Math.sign(r.ecart) === Math.sign(bas.ecart)) borneBasse = milieu;
    else borneHaute = milieu;
  }

  const angleH = (borneBasse + borneHaute) / 2;
  const final = resoudre(angleH);
  if (!final) return null;
  return {
    angleH,
    angleV: champVertical(angleH, rapport),
    inclinaison: final.inclinaison,
  };
}

/** Angle, par rapport à l'axe optique, du rayon passant par une abscisse. */
export const angleHorizontal = (u, angleH) => degres(Math.atan((2 * u - 1) * Math.tan(radians(angleH) / 2)));

/** Angle, par rapport à l'axe optique, du rayon passant par une ordonnée. */
export const angleVertical = (v, angleV) => degres(Math.atan((2 * v - 1) * Math.tan(radians(angleV) / 2)));

/**
 * Étude d'une zone entourée sur la photo.
 *
 * @param {{u1:number, v1:number, u2:number, v2:number}} zone rectangle tracé
 * @param {object} prise {hauteur, inclinaison, angleH, angleV}
 * @param {object} capteur dimensions du capteur visé, en mm
 * @param {{h:number, v:number}} resolution définition de la caméra visée
 */
export function dimensionnerDepuisPhoto(zone, prise, capteur, resolution) {
  const u1 = Math.min(zone.u1, zone.u2);
  const u2 = Math.max(zone.u1, zone.u2);
  const v1 = Math.min(zone.v1, zone.v2);
  const v2 = Math.max(zone.v1, zone.v2);

  // Angle de vue à couvrir : écart angulaire entre les deux bords de la zone.
  const gauche = angleHorizontal(u1, prise.angleH);
  const droite = angleHorizontal(u2, prise.angleH);
  const angleRequis = droite - gauche;
  const decentrage = (droite + gauche) / 2;

  // Distances : le bord bas de la zone est le plus proche, le bord haut le plus
  // éloigné. Les deux sont pris au milieu de la zone.
  const milieu = (u1 + u2) / 2;
  const proche = pointAuSol(milieu, v2, prise);
  const lointain = pointAuSol(milieu, v1, prise);

  const distanceMax = lointain ? lointain.distance : null;
  const distanceMin = proche ? proche.distance : null;

  // Largeur réellement embrassée au point le plus éloigné, une fois la caméra
  // recentrée sur la zone.
  const largeur = distanceMax ? 2 * distanceMax * Math.tan(radians(angleRequis) / 2) : null;
  const focale = angleRequis > 0 && angleRequis < 179
    ? capteur.largeur / (2 * Math.tan(radians(angleRequis) / 2))
    : 0;
  const densite = largeur > 0 ? resolution.h / largeur : 0;

  return {
    angleRequis,
    decentrage,
    distanceMin,
    distanceMax,
    largeur,
    focale,
    densite,
    // Vertical : utile pour dire si la zone tient dans la hauteur de l'image.
    angleVertical: angleVertical(v2, prise.angleV) - angleVertical(v1, prise.angleV),
    horizonVisible: !pointAuSol(milieu, 0, prise),
  };
}

/**
 * Distance au-delà de laquelle un niveau d'exploitation n'est plus tenu.
 * @param {number} resolutionH définition horizontale de la caméra
 * @param {number} angleDeg champ horizontal retenu
 * @param {number} ppm densité exigée, en pixels par mètre
 */
export function porteeUtile(resolutionH, angleDeg, ppm) {
  if (!(ppm > 0) || !(angleDeg > 0)) return 0;
  return (resolutionH / ppm) / (2 * Math.tan(radians(angleDeg) / 2));
}
