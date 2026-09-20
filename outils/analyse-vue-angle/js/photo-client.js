/**
 * Étude par photo, côté client.
 *
 * Le visiteur photographie depuis l'emplacement prévu de la caméra, indique à
 * quelle distance se trouve un point qu'il reconnaît, entoure la zone à
 * surveiller. On en tire l'angle de vue nécessaire, la distance à couvrir, la
 * focale et le niveau d'exploitation — puis la caméra du tarif qui y répond.
 *
 * Les calculs sont ceux de l'outil d'étude, mot pour mot : ce sont les mêmes
 * fonctions. Ce module n'apporte que l'interface, volontairement réduite à ce
 * qu'un particulier peut renseigner sans se tromper.
 */

import { fr } from './format.js';
import {
  CAPTEURS, SEUILS_DORI, anglesDeChamp, couverture, pixelsParMetre,
} from './optique.js';
import {
  APPAREILS, calibrerDeuxPoints, champVertical, inclinaisonPourDistance,
  dimensionnerDepuisPhoto, porteeUtile,
} from './photo.js';

/** Largeur maximale des photos conservées : au-delà, le projet devient lourd. */
const TAILLE_MAX = 1400;

/** Accroche des poignées, en pixels de toile. */
const ACCROCHE = 16;

/**
 * Capteur supposé pour traduire l'angle en focale.
 *
 * Le client ne le connaît pas et n'a pas à le connaître. La focale annoncée
 * n'est qu'indicative — c'est l'**angle de vue** qui est mesuré, et lui ne
 * dépend d'aucun capteur.
 */
const CAPTEUR_REFERENCE = CAPTEURS['1/2.8"'];

export const etatPhotos = { zones: [], courante: -1, etape: null, glisse: null };

/** La zone en cours d'étude, ou null. */
export const zoneCourante = () => etatPhotos.zones[etatPhotos.courante] || null;

/** Charge une image depuis une donnée en base64. */
const chargerImage = (dataUrl) => new Promise((resoudre, rejeter) => {
  const img = new Image();
  img.onload = () => resoudre(img);
  img.onerror = () => rejeter(new Error('Image illisible.'));
  img.src = dataUrl;
});

/**
 * Réduit une photo avant de la garder.
 *
 * Une photo de téléphone pèse plusieurs mégaoctets ; dix d'entre elles dans un
 * projet enregistré deviendraient intransportables, et le navigateur refuserait
 * de les ranger.
 */
export async function reduire(dataUrl) {
  const img = await chargerImage(dataUrl);
  if (img.naturalWidth <= TAILLE_MAX) return dataUrl;
  const l = TAILLE_MAX;
  const h = Math.round((l * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, l, h);
  return c.toDataURL('image/jpeg', 0.82);
}

/** Prise de vue déduite des repères posés : mesurée si possible, supposée sinon. */
export function priseDeVue(zone) {
  if (!zone?.image || !(zone.hauteur > 0)) return null;
  const rapport = zone.image.hauteur / zone.image.largeur;

  if (zone.r1 && zone.r2 && zone.d1 > 0 && zone.d2 > 0) {
    const mesure = calibrerDeuxPoints(
      { ...zone.r1, distance: zone.d1 },
      { ...zone.r2, distance: zone.d2 },
      { hauteur: zone.hauteur, rapport },
    );
    if (mesure) return { ...mesure, hauteur: zone.hauteur, mesure: true };
  }

  if (zone.r1 && zone.d1 > 0) {
    const angleH = APPAREILS[zone.appareil] || 67;
    const p = { hauteur: zone.hauteur, angleH, angleV: champVertical(angleH, rapport) };
    const inclinaison = inclinaisonPourDistance(zone.r1.u, zone.r1.v, zone.d1, p);
    if (inclinaison > 0) return { ...p, inclinaison, mesure: false };
  }
  return null;
}

/** Ce que demande la zone entourée — null tant qu'elle ne l'est pas. */
export function mesureZone(zone) {
  const prise = priseDeVue(zone);
  if (!prise || !zone.zone) return null;
  const m = dimensionnerDepuisPhoto(zone.zone, prise, CAPTEUR_REFERENCE, { h: 1920, v: 1080 });
  return m && m.distanceMax ? { ...m, prise } : null;
}

/**
 * Ce que la caméra du tarif couvrira réellement sur cette zone.
 *
 * `mesureZone` donne la focale *idéale* : celle qui cadrerait la zone au
 * pixel près. Une caméra réelle a la focale qu'elle a — fixe, ou variable
 * entre deux bornes. Elle cadre donc presque toujours plus large, et ses
 * pixels se répartissent sur cette largeur-là. Annoncer la densité de la
 * focale idéale promettrait une image que le matériel ne donnera pas.
 *
 * @param {object} m mesure de la zone
 * @param {object} camera article du tarif, avec focaleMin/focaleMax et resH
 */
export function couvertureReelle(m, camera) {
  if (!m || !(m.distanceMax > 0) || !camera) return null;
  const min = camera.focaleMin > 0 ? camera.focaleMin : camera.focaleMax;
  const max = camera.focaleMax > 0 ? camera.focaleMax : camera.focaleMin;
  if (!(min > 0) || !(max > 0)) return null;

  // Le capteur n'est pas toujours au tarif ; à défaut c'est celui qui a servi
  // à traduire l'angle en focale, faute de quoi les deux ne se compareraient
  // même pas.
  const capteur = CAPTEURS[camera.capteur] || CAPTEUR_REFERENCE;
  const focale = Math.min(max, Math.max(min, m.focale));
  const angle = anglesDeChamp(capteur, focale).horizontal;

  return {
    focale,
    angle,
    reglable: max > min,
    capteurSuppose: !CAPTEURS[camera.capteur],
    largeur: couverture(angle, m.distanceMax),
    densite: pixelsParMetre(camera.resH || 0, angle, m.distanceMax),
    // Plus serrée que demandé : la zone déborde du champ, il en manque un
    // morceau. C'est le seul cas où la caméra ne convient pas.
    serre: angle < m.angleRequis - 0.5,
    ecart: angle - m.angleRequis,
  };
}

/**
 * Niveau d'exploitation tenu à une densité de pixels donnée.
 * @param {number} densite pixels par mètre effectivement portés sur la zone
 */
export function niveauAtteint(densite) {
  const ordre = ['identification', 'reconnaissance', 'observation', 'detection'];
  const cle = densite > 0 ? ordre.find((k) => densite >= SEUILS_DORI[k].ppm) : undefined;
  return {
    densite: densite > 0 ? densite : 0,
    cle,
    label: cle ? SEUILS_DORI[cle].label : null,
    // Le verbe se lit mieux que le nom dans une phrase : « elle permet
    // d'observer » plutôt que « elle permet de observation ».
    verbe: cle ? VERBES[cle] : null,
  };
}

/** Ce que chaque niveau permet de faire, dit avec un verbe. */
const VERBES = {
  detection: 'repérer une présence',
  observation: 'observer ce qui se passe',
  reconnaissance: 'reconnaître une personne déjà connue',
  identification: 'identifier une personne inconnue',
};

/**
 * Portée à laquelle la caméra retenue tient encore un niveau d'exploitation.
 *
 * Calculée sur le champ réel de la caméra, pas sur l'angle demandé : c'est
 * l'objectif posé au mur qui décide jusqu'où l'image reste exploitable.
 */
export const porteeNiveau = (couv, resolutionH, cle) => (
  couv ? porteeUtile(resolutionH, couv.angle, SEUILS_DORI[cle].ppm) : 0
);

/* ------------------------------------------------------------- dessin */

/** Coordonnées d'un événement, en fractions de la largeur de l'image. */
export function position(e, toile) {
  const r = toile.getBoundingClientRect();
  return {
    u: (e.clientX - r.left) / r.width,
    v: ((e.clientY - r.top) / r.height) * (toile.height / toile.width),
  };
}

export function dessiner(toile, zone) {
  if (!zone?.img) return;
  const l = Math.min(TAILLE_MAX, zone.img.naturalWidth);
  const h = Math.round((l * zone.img.naturalHeight) / zone.img.naturalWidth);
  toile.width = l;
  toile.height = h;

  const ctx = toile.getContext('2d');
  ctx.drawImage(zone.img, 0, 0, l, h);
  const trait = Math.max(2, l / 400);
  const police = Math.max(12, Math.round(l / 46));
  ctx.lineWidth = trait;
  ctx.font = `600 ${police}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'middle';

  for (const [repere, distance, couleur] of [
    [zone.r1, zone.d1, '#ffd400'], [zone.r2, zone.d2, '#7ad1ff'],
  ]) {
    if (!repere) continue;
    const x = repere.u * l;
    const y = repere.v * l;
    ctx.strokeStyle = couleur;
    ctx.beginPath();
    ctx.moveTo(x - trait * 5, y);
    ctx.lineTo(x + trait * 5, y);
    ctx.moveTo(x, y - trait * 5);
    ctx.lineTo(x, y + trait * 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(16,19,23,.75)';
    const texte = `${fr(distance)} m`;
    ctx.fillRect(x + trait * 6, y - police * 0.7, ctx.measureText(texte).width + 8, police * 1.4);
    ctx.fillStyle = couleur;
    ctx.fillText(texte, x + trait * 6 + 4, y);
  }

  if (zone.zone) {
    const { u1, v1, u2, v2 } = zone.zone;
    const x = Math.min(u1, u2) * l;
    const y = Math.min(v1, v2) * l;
    const w = Math.abs(u2 - u1) * l;
    const hh = Math.abs(v2 - v1) * l;
    ctx.fillStyle = 'rgba(200,16,46,.22)';
    ctx.fillRect(x, y, w, hh);
    ctx.strokeStyle = '#c8102e';
    ctx.strokeRect(x, y, w, hh);

    // Poignées : le rectangle se retaille sans être retracé.
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#c8102e';
    for (const [px, py] of coins(x, y, w, hh)) {
      ctx.beginPath();
      ctx.arc(px, py, ACCROCHE / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

const coins = (x, y, w, h) => [
  [x, y], [x + w / 2, y], [x + w, y],
  [x, y + h / 2], [x + w, y + h / 2],
  [x, y + h], [x + w / 2, y + h], [x + w, y + h],
];

/** Poignée saisie sous le pointeur, ou 'zone' si l'on vise l'intérieur. */
export function priseSous(p, zone, l) {
  if (!zone?.zone) return null;
  const { u1, v1, u2, v2 } = zone.zone;
  const x = Math.min(u1, u2) * l;
  const y = Math.min(v1, v2) * l;
  const w = Math.abs(u2 - u1) * l;
  const h = Math.abs(v2 - v1) * l;
  const px = p.u * l;
  const py = p.v * l;

  const noms = ['hg', 'h', 'hd', 'g', 'd', 'bg', 'b', 'bd'];
  const trouve = coins(x, y, w, h)
    .map(([cx, cy], i) => ({ nom: noms[i], d: Math.hypot(cx - px, cy - py) }))
    .filter((c) => c.d <= ACCROCHE)
    .sort((a, b) => a.d - b.d)[0];
  if (trouve) return trouve.nom;

  return px >= x && px <= x + w && py >= y && py <= y + h ? 'zone' : null;
}

/** Applique un déplacement ou un redimensionnement à la zone. */
export function transformer(zone, prise, depart, p) {
  const z = { ...zone.zone };
  const du = p.u - depart.u;
  const dv = p.v - depart.v;
  if (prise === 'zone') {
    z.u1 += du; z.u2 += du; z.v1 += dv; z.v2 += dv;
    return z;
  }
  const gauche = Math.min(z.u1, z.u2);
  const droite = Math.max(z.u1, z.u2);
  const haut = Math.min(z.v1, z.v2);
  const bas = Math.max(z.v1, z.v2);
  const n = { u1: gauche, u2: droite, v1: haut, v2: bas };
  if (prise.includes('g')) n.u1 = gauche + du;
  if (prise.includes('d')) n.u2 = droite + du;
  if (prise.includes('h')) n.v1 = haut + dv;
  if (prise.includes('b')) n.v2 = bas + dv;
  if (prise === 'h') n.v1 = haut + dv;
  if (prise === 'b') n.v2 = bas + dv;
  if (prise === 'g') n.u1 = gauche + du;
  if (prise === 'd') n.u2 = droite + du;
  return n;
}

/** Liste des appareils proposés au client, le téléphone en tête. */
export const appareilsClient = () => Object.keys(APPAREILS)
  .filter((a) => APPAREILS[a] > 0);
