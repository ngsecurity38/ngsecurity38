/**
 * Tests de l'analyse depuis une photo de repérage.
 * Exécution : node --test tests/photo.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rayon, pointAuSol, inclinaisonPourDistance, angleHorizontal, angleVertical,
  dimensionnerDepuisPhoto, porteeUtile, ordonneePourDistance, APPAREILS,
  calibrerDeuxPoints, champVertical,
} from '../js/photo.js';
import { CAPTEURS, anglesDeChamp, niveauDori } from '../js/optique.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/** Prise de vue type : téléphone tenu à 4,5 m, incliné de 20° vers le bas. */
const PRISE = { hauteur: 4.5, inclinaison: 20, angleH: 67, angleV: 40 };

test('rayon : le centre de l\'image suit l\'axe optique', () => {
  const r = rayon(0.5, 0.5, 67, 40);
  proche(r.x, 0, 1e-12);
  proche(r.y, 0, 1e-12);
  assert.equal(r.z, 1);
});

test('rayon : les bords correspondent aux demi-champs', () => {
  const r = rayon(1, 1, 90, 60);
  proche(Math.atan(r.x) * 180 / Math.PI, 45, 1e-9, 'demi-champ horizontal');
  proche(Math.atan(r.y) * 180 / Math.PI, 30, 1e-9, 'demi-champ vertical');
});

test('point au sol : le centre de l\'image tombe à h / tan(inclinaison)', () => {
  const p = pointAuSol(0.5, 0.5, PRISE);
  proche(p.distance, 4.5 / Math.tan(20 * Math.PI / 180), 1e-9, 'distance au centre');
  proche(p.lateral, 0, 1e-12, 'pas de décalage latéral au centre');
});

test('point au sol : plus bas dans l\'image, plus près de la caméra', () => {
  const haut = pointAuSol(0.5, 0.35, PRISE);
  const centre = pointAuSol(0.5, 0.5, PRISE);
  const bas = pointAuSol(0.5, 0.9, PRISE);
  assert.ok(haut.distance > centre.distance, 'le haut de l\'image est plus loin');
  assert.ok(bas.distance < centre.distance, 'le bas est plus près');
  proche(bas.distance, 4.5 / Math.tan((20 + angleVertical(0.9, 40)) * Math.PI / 180), 0.01);
});

test('point au sol : au-dessus de l\'horizon, aucun point de sol', () => {
  // Appareil presque horizontal : le haut de l'image regarde le ciel.
  assert.equal(pointAuSol(0.5, 0.05, { ...PRISE, inclinaison: 2 }), null);
  assert.ok(pointAuSol(0.5, 0.95, { ...PRISE, inclinaison: 2 }), 'le bas touche encore le sol');
});

test('point au sol : hauteur nulle ou négative refusée', () => {
  assert.equal(pointAuSol(0.5, 0.8, { ...PRISE, hauteur: 0 }), null);
});

test('inclinaison déduite d\'un point de distance connue', () => {
  // Point de référence à 25 m, à mi-hauteur de l'image.
  const reference = pointAuSol(0.5, 0.5, { ...PRISE, inclinaison: 12 });
  const trouvee = inclinaisonPourDistance(0.5, 0.5, reference.distance, PRISE);
  proche(trouvee, 12, 0.01, 'l\'inclinaison est retrouvée');
});

test('inclinaison : un point latéral se traite aussi', () => {
  const reference = pointAuSol(0.2, 0.7, { ...PRISE, inclinaison: 25 });
  const trouvee = inclinaisonPourDistance(0.2, 0.7, reference.distance, PRISE);
  proche(trouvee, 25, 0.01);
});

test('inclinaison : une distance inatteignable ne renvoie rien d\'absurde', () => {
  // À 4,5 m de haut, même à l'horizontale, un point bas ne peut pas être à 10 km.
  assert.equal(inclinaisonPourDistance(0.5, 0.95, 10000, PRISE), 0);
  assert.equal(inclinaisonPourDistance(0.5, 0.5, 0, PRISE), 0);
});

test('angles d\'un point : nuls au centre, symétriques aux bords', () => {
  proche(angleHorizontal(0.5, 67), 0, 1e-12);
  proche(angleHorizontal(1, 90), 45, 1e-9);
  proche(angleHorizontal(0, 90), -45, 1e-9);
  proche(angleVertical(0, 40), -20, 1e-9);
});

/* ------------------------------------------------------ étude d'une zone */

test('zone entourée : angle nécessaire, distances et densité', () => {
  const zone = { u1: 0.25, v1: 0.40, u2: 0.75, v2: 0.85 };
  const d = dimensionnerDepuisPhoto(zone, PRISE, CAPTEURS['1/2.8"'], { h: 1920, v: 1080 });

  const attendu = angleHorizontal(0.75, 67) - angleHorizontal(0.25, 67);
  proche(d.angleRequis, attendu, 1e-9, 'angle à couvrir');
  proche(d.decentrage, 0, 1e-9, 'zone centrée : pas de décentrage');

  const loin = pointAuSol(0.5, 0.40, PRISE).distance;
  const pres = pointAuSol(0.5, 0.85, PRISE).distance;
  proche(d.distanceMax, loin, 1e-9);
  proche(d.distanceMin, pres, 1e-9);
  assert.ok(d.distanceMax > d.distanceMin);

  proche(d.largeur, 2 * loin * Math.tan(d.angleRequis * Math.PI / 360), 1e-9);
  proche(d.densite, 1920 / d.largeur, 1e-9);
});

test('zone entourée : la focale calculée redonne bien l\'angle demandé', () => {
  const zone = { u1: 0.3, v1: 0.45, u2: 0.7, v2: 0.9 };
  const d = dimensionnerDepuisPhoto(zone, PRISE, CAPTEURS['1/2.8"'], { h: 1920, v: 1080 });
  proche(anglesDeChamp(CAPTEURS['1/2.8"'], d.focale).horizontal, d.angleRequis, 1e-9);
});

test('zone entourée : resserrer allonge la focale et densifie', () => {
  const large = dimensionnerDepuisPhoto(
    { u1: 0.1, v1: 0.5, u2: 0.9, v2: 0.9 }, PRISE, CAPTEURS['1/2.8"'], { h: 1920, v: 1080 },
  );
  const serre = dimensionnerDepuisPhoto(
    { u1: 0.4, v1: 0.5, u2: 0.6, v2: 0.9 }, PRISE, CAPTEURS['1/2.8"'], { h: 1920, v: 1080 },
  );
  assert.ok(serre.focale > large.focale);
  assert.ok(serre.densite > large.densite);
  proche(serre.distanceMax, large.distanceMax, 1e-9, 'même bord haut, même distance');
});

test('zone entourée : un coin en haut à gauche décentre la visée', () => {
  const d = dimensionnerDepuisPhoto(
    { u1: 0.05, v1: 0.5, u2: 0.35, v2: 0.9 }, PRISE, CAPTEURS['1/2.8"'], { h: 1920, v: 1080 },
  );
  assert.ok(d.decentrage < -10, `la caméra doit pivoter à gauche : ${d.decentrage}°`);
});

test('zone entourée : les coordonnées données à l\'envers sont remises d\'aplomb', () => {
  const a = dimensionnerDepuisPhoto({ u1: 0.7, v1: 0.9, u2: 0.3, v2: 0.45 }, PRISE, CAPTEURS['1/2.8"'], { h: 1920, v: 1080 });
  const b = dimensionnerDepuisPhoto({ u1: 0.3, v1: 0.45, u2: 0.7, v2: 0.9 }, PRISE, CAPTEURS['1/2.8"'], { h: 1920, v: 1080 });
  assert.deepEqual(a, b);
});

test('portée utile : au-delà, le niveau d\'exploitation décroche', () => {
  const angle = 65.66;
  const identification = porteeUtile(1920, angle, 250);
  proche(1920 / (2 * identification * Math.tan(angle * Math.PI / 360)), 250, 0.5);
  assert.ok(porteeUtile(1920, angle, 25) > identification, 'détecter porte plus loin qu\'identifier');
  assert.equal(porteeUtile(1920, angle, 0), 0);
});

test('un cas complet tient debout de bout en bout', () => {
  // Caméra à 4,5 m — la hauteur de l'étude reçue — sur une cour de déchetterie.
  const prise = { hauteur: 4.5, inclinaison: 0, angleH: 67, angleV: 38 };
  // Le technicien désigne le fond de la cour, qu'il sait à 35 m.
  const inclinaison = inclinaisonPourDistance(0.5, 0.42, 35, prise);
  assert.ok(inclinaison > 0 && inclinaison < 45, `inclinaison déduite : ${inclinaison}`);

  const complet = { ...prise, inclinaison };
  proche(pointAuSol(0.5, 0.42, complet).distance, 35, 0.05, 'le point de calage retombe juste');

  const d = dimensionnerDepuisPhoto(
    { u1: 0.15, v1: 0.42, u2: 0.85, v2: 0.95 }, complet, CAPTEURS['1/2.8"'], { h: 1920, v: 1080 },
  );
  assert.ok(d.focale > 1 && d.focale < 20, `focale plausible : ${d.focale}`);
  assert.ok(['detection', 'observation', 'reconnaissance', 'identification', 'insuffisant']
    .includes(niveauDori(d.densite)));
});

test('les appareils de repérage proposés ont des champs plausibles', () => {
  const valeurs = Object.values(APPAREILS).filter(Boolean);
  assert.ok(valeurs.every((v) => v > 20 && v < 140), 'champs réalistes');
  assert.equal(APPAREILS['Caméra en place (champ calculé au bloc 2)'], 0, 'repris de la configuration');
});

test('ligne d\'iso-distance : retrouvée à l\'endroit exact', () => {
  const v = ordonneePourDistance(0.5, 20, PRISE);
  assert.ok(v !== null, 'la ligne des 20 m est dans le champ');
  proche(pointAuSol(0.5, v, PRISE).distance, 20, 0.02, 'aller-retour');
});

test('ligne d\'iso-distance : hors champ, rien n\'est tracé', () => {
  assert.equal(ordonneePourDistance(0.5, 1, PRISE), null, 'trop près : sous le bord bas');
  // Inclinée de 30° avec 40° de champ vertical, la caméra ne voit pas au-delà
  // de h / tan(10°), soit 25,5 m : le bord haut plonge encore vers le sol.
  const piquee = { ...PRISE, inclinaison: 30 };
  assert.ok(ordonneePourDistance(0.5, 20, piquee) !== null, '20 m est dans le champ');
  assert.equal(ordonneePourDistance(0.5, 100, piquee), null, 'trop loin : au-delà du bord haut');
});

test('lignes d\'iso-distance : ordonnées croissantes vers le bas', () => {
  const v10 = ordonneePourDistance(0.5, 10, PRISE);
  const v30 = ordonneePourDistance(0.5, 30, PRISE);
  assert.ok(v10 > v30, 'les 10 m sont plus bas dans l\'image que les 30 m');
});

/* ------------------------------- calage automatique du champ de vision ---- */

/** Fabrique deux repères à partir d'une prise de vue connue. */
function reperes(prise, points) {
  return points.map(([u, v]) => {
    const p = pointAuSol(u, v, prise);
    return { u, v, distance: p.distance };
  });
}

test('deux points de distance connue donnent le champ ET l\'inclinaison', () => {
  const vrai = { hauteur: 4.5, inclinaison: 18, angleH: 67, angleV: champVertical(67, 900 / 1600) };
  const [a, b] = reperes(vrai, [[0.5, 0.45], [0.5, 0.85]]);
  const r = calibrerDeuxPoints(a, b, { hauteur: 4.5, rapport: 900 / 1600 });
  assert.ok(r, 'une solution est trouvée');
  proche(r.angleH, 67, 0.5, 'champ horizontal retrouvé');
  proche(r.inclinaison, 18, 0.2, 'inclinaison retrouvée');
});

test('calage automatique : un ultra grand-angle est reconnu comme tel', () => {
  const vrai = { hauteur: 6, inclinaison: 30, angleH: 105, angleV: champVertical(105, 3 / 4) };
  const [a, b] = reperes(vrai, [[0.4, 0.4], [0.6, 0.9]]);
  const r = calibrerDeuxPoints(a, b, { hauteur: 6, rapport: 3 / 4 });
  proche(r.angleH, 105, 1, 'champ large retrouvé');
  proche(r.inclinaison, 30, 0.3);
});

test('calage automatique : un téléobjectif aussi', () => {
  const vrai = { hauteur: 8, inclinaison: 12, angleH: 34, angleV: champVertical(34, 900 / 1600) };
  const [a, b] = reperes(vrai, [[0.5, 0.35], [0.5, 0.8]]);
  const r = calibrerDeuxPoints(a, b, { hauteur: 8, rapport: 900 / 1600 });
  proche(r.angleH, 34, 0.8);
  proche(r.inclinaison, 12, 0.2);
});

test('calage automatique : les distances mesurées retombent juste', () => {
  const vrai = { hauteur: 4.5, inclinaison: 22, angleH: 74, angleV: champVertical(74, 900 / 1600) };
  const [a, b] = reperes(vrai, [[0.3, 0.5], [0.7, 0.88]]);
  const r = calibrerDeuxPoints(a, b, { hauteur: 4.5, rapport: 900 / 1600 });
  const prise = { hauteur: 4.5, inclinaison: r.inclinaison, angleH: r.angleH, angleV: r.angleV };
  proche(pointAuSol(a.u, a.v, prise).distance, a.distance, 0.1, 'premier repère');
  proche(pointAuSol(b.u, b.v, prise).distance, b.distance, 0.1, 'second repère');
});

test('calage automatique : deux points à la même hauteur n\'apprennent rien', () => {
  const vrai = { hauteur: 4.5, inclinaison: 18, angleH: 67, angleV: champVertical(67, 0.5625) };
  const [a, b] = reperes(vrai, [[0.3, 0.7], [0.7, 0.705]]);
  assert.equal(calibrerDeuxPoints(a, b, { hauteur: 4.5, rapport: 0.5625 }), null);
});

test('calage automatique : des distances incohérentes ne donnent rien', () => {
  const a = { u: 0.5, v: 0.5, distance: 30 };
  const b = { u: 0.5, v: 0.9, distance: 60 }; // plus bas dans l'image, donc plus près : impossible
  assert.equal(calibrerDeuxPoints(a, b, { hauteur: 4.5, rapport: 0.5625 }), null);
  assert.equal(calibrerDeuxPoints({ ...a, distance: 0 }, b, { hauteur: 4.5, rapport: 0.5625 }), null);
  assert.equal(calibrerDeuxPoints(a, b, { hauteur: 0, rapport: 0.5625 }), null);
});

test('champ vertical : déduit du format de l\'image', () => {
  proche(champVertical(90, 1), 90, 1e-9, 'image carrée');
  assert.ok(champVertical(67, 900 / 1600) < 67, 'image en paysage : champ vertical plus étroit');
});
