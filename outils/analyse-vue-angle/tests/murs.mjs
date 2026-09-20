/**
 * Tests des murs et des angles morts.
 * Exécution : node --test tests/murs.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nouveauMur, longueurMur, intersectionRayon, ombreAuSol,
  visibiliteRayon, balayage, partVisible, anglesMorts,
} from '../js/murs.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/** Échelle de travail : 100 m par unité normalisée. */
const ECHELLE = 100;
/** Caméra à l'origine, posée à 4 m, regardant vers le bas du plan (azimut 180°). */
const CAM = { x: 0, y: 0, hauteur: 4, azimut: 180, ouverture: 90 };
/** Vers le bas du plan : y croissant. */
const BAS = { x: 0, y: 1 };

/* ------------------------------------------------------------- géométrie */

test('longueur d\'un mur : le trait rapporté à l\'échelle', () => {
  const m = nouveauMur({ x: 0, y: 0 }, { x: 0.1217, y: 0 }, 3.5);
  proche(longueurMur(m, ECHELLE), 12.17, 1e-9, 'le mur de la capture : 12,17 m');
  assert.equal(m.hauteur, 3.5);
  assert.equal(longueurMur(m, 0), 0, 'sans échelle, pas de longueur');
});

test('intersection : un mur en travers du rayon est touché', () => {
  const mur = nouveauMur({ x: -0.1, y: 0.2 }, { x: 0.1, y: 0.2 });
  proche(intersectionRayon({ x: 0, y: 0 }, BAS, mur), 0.2, 1e-9);
});

test('intersection : un mur à côté, derrière, ou parallèle n\'est pas touché', () => {
  const origine = { x: 0, y: 0 };
  assert.equal(intersectionRayon(origine, BAS, nouveauMur({ x: 0.5, y: 0.2 }, { x: 0.7, y: 0.2 })),
    null, 'mur décalé sur le côté');
  assert.equal(intersectionRayon(origine, BAS, nouveauMur({ x: -0.1, y: -0.2 }, { x: 0.1, y: -0.2 })),
    null, 'mur derrière la caméra');
  assert.equal(intersectionRayon(origine, BAS, nouveauMur({ x: 0, y: 0.1 }, { x: 0, y: 0.5 })),
    null, 'mur dans l\'axe du rayon');
});

/* --------------------------------------------------------- angles morts */

test('ombre au sol : un mur plus bas que la caméra se laisse survoler', () => {
  // Mur de 2 m à 10 m, caméra à 4 m : D = 10 × 4 / (4 − 2) = 20 m.
  const o = ombreAuSol(10, 2, 4);
  proche(o.debut, 10, 1e-9);
  proche(o.fin, 20, 1e-9, 'le sol réapparaît à 20 m');
});

test('ombre au sol : un mur aussi haut que la caméra cache tout derrière', () => {
  assert.equal(ombreAuSol(10, 4, 4).fin, Infinity);
  assert.equal(ombreAuSol(10, 6, 4).fin, Infinity, 'plus haut encore, à plus forte raison');
});

test('ombre au sol : plus le mur est bas, plus l\'angle mort est court', () => {
  const bas = ombreAuSol(10, 1, 4);
  const haut = ombreAuSol(10, 3, 4);
  proche(bas.fin, 40 / 3, 1e-9);
  proche(haut.fin, 40, 1e-9);
  assert.ok(haut.fin - haut.debut > bas.fin - bas.debut);
});

test('ombre au sol : une caméra plus haute voit par-dessus de plus près', () => {
  const basse = ombreAuSol(10, 2, 3);
  const haute = ombreAuSol(10, 2, 8);
  proche(basse.fin, 30, 1e-9);
  proche(haute.fin, 80 / 6, 1e-9);
  assert.ok(haute.fin < basse.fin, 'monter la caméra raccourcit l\'angle mort');
});

test('ombre au sol : sans mur, aucune ombre', () => {
  assert.deepEqual(ombreAuSol(10, 0, 4), { debut: 0, fin: 0 });
  assert.deepEqual(ombreAuSol(0, 2, 4), { debut: 0, fin: 0 });
});

/* --------------------------------------------------------- visibilité */

test('visibilité : sans mur, tout le rayon est vu', () => {
  assert.deepEqual(visibiliteRayon(CAM, BAS, [], ECHELLE, 50), [[0, 50]]);
  assert.deepEqual(visibiliteRayon(CAM, BAS, null, ECHELLE, 50), [[0, 50]]);
});

test('visibilité : un muret coupe une bande, le sol revient ensuite', () => {
  // Mur de 2 m à 10 m : caché de 10 à 20, visible avant et après.
  const mur = nouveauMur({ x: -0.5, y: 0.1 }, { x: 0.5, y: 0.1 }, 2);
  const v = visibiliteRayon(CAM, BAS, [mur], ECHELLE, 50);
  assert.equal(v.length, 2);
  proche(v[0][0], 0, 1e-9); proche(v[0][1], 10, 1e-9);
  proche(v[1][0], 20, 1e-9); proche(v[1][1], 50, 1e-9);
});

test('visibilité : un mur haut arrête tout', () => {
  const mur = nouveauMur({ x: -0.5, y: 0.1 }, { x: 0.5, y: 0.1 }, 5);
  const v = visibiliteRayon(CAM, BAS, [mur], ECHELLE, 50);
  assert.equal(v.length, 1);
  proche(v[0][1], 10, 1e-9, 'la vue s\'arrête au pied du mur');
});

test('visibilité : deux murets aux ombres qui se chevauchent n\'en font qu\'une', () => {
  const a = nouveauMur({ x: -0.5, y: 0.1 }, { x: 0.5, y: 0.1 }, 2);   // cache 10 → 20
  const b = nouveauMur({ x: -0.5, y: 0.15 }, { x: 0.5, y: 0.15 }, 2); // cache 15 → 30
  const v = visibiliteRayon(CAM, BAS, [a, b], ECHELLE, 50);
  assert.equal(v.length, 2, 'une seule bande cachée, pas deux');
  proche(v[0][1], 10, 1e-9);
  proche(v[1][0], 30, 1e-9, 'la plus lointaine des deux fins l\'emporte');
});

test('visibilité : une ombre qui dépasse la portée ne laisse rien derrière', () => {
  const mur = nouveauMur({ x: -0.5, y: 0.1 }, { x: 0.5, y: 0.1 }, 3.5);
  // D = 10 × 4 / 0,5 = 80 m, au-delà de la portée de 50 m.
  const v = visibiliteRayon(CAM, BAS, [mur], ECHELLE, 50);
  assert.equal(v.length, 1);
  proche(v[0][1], 10, 1e-9);
});

test('visibilité : sans échelle ni portée, rien n\'est calculé', () => {
  assert.deepEqual(visibiliteRayon(CAM, BAS, [], 0, 50), []);
  assert.deepEqual(visibiliteRayon(CAM, BAS, [], ECHELLE, 0), []);
});

/* ---------------------------------------------------------- couverture */

test('couverture : le balayage couvre l\'ouverture, bord à bord', () => {
  const r = balayage(CAM, [], ECHELLE, 50, { pas: 10 });
  proche(r[0].angle, 135, 1e-9, 'bord gauche');
  proche(r[r.length - 1].angle, 225, 1e-9, 'bord droit');
  assert.ok(r.length >= 10);
});

test('couverture : l\'azimut oriente bien le balayage', () => {
  // Azimut 180° regarde vers le bas du plan : le rayon central a y > 0.
  const centre = balayage(CAM, [], ECHELLE, 50, { pas: 45 })[1];
  proche(centre.angle, 180, 1e-9);
  proche(centre.direction.y, 1, 1e-9);
  proche(centre.direction.x, 0, 1e-9);
});

test('couverture : un mur ne masque que les rayons qu\'il traverse', () => {
  // Muret court, placé à droite de l'axe : la moitié gauche reste dégagée.
  const mur = nouveauMur({ x: 0.05, y: 0.1 }, { x: 0.3, y: 0.1 }, 2);
  const r = balayage(CAM, [mur], ECHELLE, 50, { pas: 5 });
  const coupes = r.filter((x) => x.intervalles.length > 1);
  assert.ok(coupes.length > 0, 'certains rayons sont coupés');
  assert.ok(coupes.length < r.length, 'd\'autres passent à côté du mur');
  assert.ok(coupes.every((x) => x.angle < 180), 'ceux qui visent la droite du plan');
});

test('part visible : dégagée, elle vaut 1 ; entièrement bouchée, 0', () => {
  proche(partVisible(balayage(CAM, [], ECHELLE, 50), 50), 1, 1e-9);

  // Mur haut juste devant la caméra, plus large que le champ.
  const ecran = nouveauMur({ x: -2, y: 0.01 }, { x: 2, y: 0.01 }, 9);
  const bouche = partVisible(balayage(CAM, [ecran], ECHELLE, 50), 50);
  assert.ok(bouche < 0.01, `presque rien ne doit être vu : ${bouche}`);
});

test('part visible : elle se mesure en surface, pas en angle', () => {
  // Un mur lointain retire moins de surface qu'un mur proche, à ombre égale.
  const proche_ = nouveauMur({ x: -2, y: 0.05 }, { x: 2, y: 0.05 }, 2);
  const loin = nouveauMur({ x: -2, y: 0.3 }, { x: 2, y: 0.3 }, 2);
  const vProche = partVisible(balayage(CAM, [proche_], ECHELLE, 60), 60);
  const vLoin = partVisible(balayage(CAM, [loin], ECHELLE, 60), 60);
  assert.ok(vLoin < vProche, `un mur loin coûte plus de terrain : ${vLoin} vs ${vProche}`);
});

test('angles morts : les bandes cachées sont relevées, la plus grande en tête', () => {
  const mur = nouveauMur({ x: -0.5, y: 0.1 }, { x: 0.5, y: 0.1 }, 2);
  const r = balayage(CAM, [mur], ECHELLE, 50, { pas: 10 });
  const trous = anglesMorts(r, 50);
  assert.ok(trous.length > 0);
  assert.ok(trous[0].longueur >= trous[trous.length - 1].longueur, 'triés par étendue');

  // Le mur est à 10 m dans l'axe, plus loin sur les rayons obliques : aucune
  // bande cachée ne peut commencer avant. Le plus grand angle mort est
  // d'ailleurs sur un rayon de bord, à 10 / cos 45° = 14,1 m.
  assert.ok(trous.every((t) => t.debut >= 10 - 1e-6),
    `une bande commence avant le mur : ${JSON.stringify(trous[0])}`);
  const plusProche = Math.min(...trous.map((t) => t.debut));
  proche(plusProche, 10, 0.5, 'dans l\'axe, elle commence au pied du mur');
});

test('angles morts : les franges de calcul ne sont pas signalées', () => {
  const r = balayage(CAM, [], ECHELLE, 50, { pas: 10 });
  assert.deepEqual(anglesMorts(r, 50), [], 'sans mur, aucun trou');

  // Un muret de 10 cm ne cache qu'une frange : sous le seuil, on se tait.
  const bordure = nouveauMur({ x: -0.5, y: 0.1 }, { x: 0.5, y: 0.1 }, 0.1);
  const trous = anglesMorts(balayage(CAM, [bordure], ECHELLE, 50, { pas: 10 }), 50, 2);
  assert.equal(trous.length, 0, 'une bordure de 10 cm à 10 m cache 0,26 m');
});
