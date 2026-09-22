/**
 * Tests du dimensionnement de l'écran de supervision.
 * Exécution : node --test tests/ecran.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RATIO, POUCE, MOSAIQUES, VIGNETTE_MINI, DEFINITIONS, RECUL,
  mosaique, vignette, vignetteSuffisante,
  diagonaleDepuisHauteur, hauteurDepuisDiagonale, ecranConseille,
} from '../js/ecran.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

test('mosaïque : la plus petite qui contienne le parc', () => {
  assert.equal(mosaique(1).cases, 1);
  assert.equal(mosaique(4).cases, 4);
  assert.equal(mosaique(5).cases, 9, 'cinq caméras tiennent en 3 × 3');
  assert.equal(mosaique(10).cases, 16);
  assert.equal(mosaique(16).cases, 16, 'seize pile, pas de case perdue');
  assert.equal(mosaique(16).libres, 0);
  assert.equal(mosaique(10).libres, 6);
});

test('mosaïque : toujours carrée, donc des vignettes égales', () => {
  for (const n of [1, 3, 7, 10, 20, 30]) {
    const g = mosaique(n);
    assert.equal(g.colonnes, g.lignes);
    assert.equal(g.colonnes * g.lignes, g.cases);
    assert.ok(g.cases >= n);
  }
});

test('mosaïque : rien à afficher, rien à conseiller', () => {
  assert.equal(mosaique(0), null);
  assert.equal(mosaique(100), null, 'au-delà du catalogue, pas d\'invention');
});

test('vignette : le Full HD ne tient pas seize caméras', () => {
  const g = mosaique(10);
  const hd = vignette(DEFINITIONS[0], g);
  const uhd = vignette(DEFINITIONS[1], g);
  assert.deepEqual(hd, { largeur: 480, hauteur: 270 });
  assert.deepEqual(uhd, { largeur: 960, hauteur: 540 });
  assert.equal(vignetteSuffisante(hd), false, '480 × 270 ne montre plus rien');
  assert.equal(vignetteSuffisante(uhd), true);
  assert.equal(VIGNETTE_MINI.largeur, 640);
});

test('vignette : quatre caméras tiennent en Full HD', () => {
  // La définition ne se décide pas au nombre de pouces mais au nombre de
  // vignettes : à quatre caméras, le Full HD laisse du 960 × 540.
  const v = vignette(DEFINITIONS[0], mosaique(4));
  assert.deepEqual(v, { largeur: 960, hauteur: 540 });
  assert.equal(vignetteSuffisante(v), true);
});

test('géométrie 16:9 : diagonale et hauteur sont réciproques', () => {
  const d = diagonaleDepuisHauteur(0.5);
  proche(hauteurDepuisDiagonale(d), 0.5, 1e-12, 'aller-retour');
  // Un 55 pouces mesure environ 68 cm de haut.
  proche(hauteurDepuisDiagonale(55 * POUCE), 0.685, 0.005, 'hauteur d\'un 55"');
});

test('conseil : dix caméras imposent le 4K, quelle que soit la taille', () => {
  for (const distance of [1.5, 2, 3]) {
    const r = ecranConseille({ cameras: 10, distance });
    assert.equal(r.definition.cle, '4k');
    assert.equal(r.grille.colonnes, 4);
    assert.equal(r.vignetteSuffisante, true);
  }
});

test('conseil : la diagonale suit le recul, pas le nombre de caméras', () => {
  const pres = ecranConseille({ cameras: 10, distance: 1.5 });
  const loin = ecranConseille({ cameras: 10, distance: 3 });
  assert.ok(loin.pouces > pres.pouces, `${loin.pouces}" devrait dépasser ${pres.pouces}"`);

  // À recul égal, quatre caméras ou dix donnent la MÊME diagonale : seule
  // la définition change. C'est tout l'objet du module.
  const quatre = ecranConseille({ cameras: 4, distance: 2 });
  const dix = ecranConseille({ cameras: 10, distance: 2 });
  assert.equal(quatre.pouces, dix.pouces);
  assert.notEqual(quatre.definition.cle, dix.definition.cle);
});

test('conseil : l\'écran retenu tient le recul annoncé', () => {
  const r = ecranConseille({ cameras: 10, distance: 2 });
  assert.ok(r.reculMini <= r.distance + 0.5, `recul mini ${r.reculMini}`);
  assert.ok(r.reculMaxi >= r.distance - 0.5, `recul maxi ${r.reculMaxi}`);
  assert.equal(RECUL.retenu, 5);
});

test('conseil : la finesse en réserve est annoncée, pas présentée comme un défaut', () => {
  const r = ecranConseille({ cameras: 10, distance: 2 });
  // À deux mètres d'un 4K, l'œil ne sépare pas les pixels : la finesse
  // sert au plein écran d'une vignette, pas à la mosaïque.
  assert.equal(r.reserveDeDetail, true);
  assert.ok(r.reculPleinDetail < r.distance,
    `${r.reculPleinDetail} m devrait être sous ${r.distance} m`);
});

test('conseil : données absentes → rien', () => {
  assert.equal(ecranConseille({ cameras: 0, distance: 2 }), null);
  assert.equal(ecranConseille({ cameras: 10, distance: 0 }), null);
});
