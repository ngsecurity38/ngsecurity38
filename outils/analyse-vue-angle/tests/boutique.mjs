/**
 * Tests du catalogue de la boutique.
 * Exécution : node --test tests/boutique.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPTEUR_DEFAUT, DISTANCE_VITRINE, focales, capacites, argumentaire,
  produitsAffichables, reservesCatalogue,
} from '../js/boutique.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/** Caméra 4K à objectif fixe 4 mm. */
const FIXE = {
  reference: 'DS-2CD2T86G2-4I', url: 'https://exemple/fiche', resH: 3840, focale: 4,
};

/* ------------------------------------------------------------- focales */

test('focale fixe, zoom, et absence de focale', () => {
  assert.deepEqual(focales({ focale: 4 }), { min: 4, max: 4 });
  assert.deepEqual(focales({ focaleMin: 2.8, focaleMax: 12 }), { min: 2.8, max: 12 });
  // Bornes inversées par mégarde : on ne produit pas un intervalle absurde.
  assert.deepEqual(focales({ focaleMin: 12, focaleMax: 2.8 }), { min: 12, max: 12 });
  assert.equal(focales({ resH: 3840 }), null);
  assert.equal(focales(null), null);
});

/* ------------------------------------------------------------ capacités */

test('une caméra 4 mm en 4K : largeur embrassée et portées', () => {
  const c = capacites(FIXE);
  assert.ok(c, 'les capacités doivent se calculer');
  proche(c.angleLarge, 65.7, 0.5, 'champ d\'un 4 mm sur 1/2.8"');
  assert.equal(c.angleSerre, c.angleLarge, 'objectif fixe : un seul champ');
  assert.equal(c.reglable, false);
  proche(c.largeurA(10), 12.9, 0.3, 'largeur à 10 m');
  // Un niveau plus exigeant se tient plus près, jamais plus loin.
  assert.ok(c.portees.detection > c.portees.observation);
  assert.ok(c.portees.observation > c.portees.reconnaissance);
  assert.ok(c.portees.reconnaissance > c.portees.identification);
});

test('le capteur est supposé tant que la fiche ne le donne pas, et c\'est dit', () => {
  assert.equal(capacites(FIXE).estSuppose, true);
  assert.equal(capacites(FIXE).capteur, CAPTEUR_DEFAUT);
  const declare = capacites({ ...FIXE, capteur: '1/1.8"' });
  assert.equal(declare.estSuppose, false);
  assert.ok(declare.angleLarge > capacites(FIXE).angleLarge,
    'un capteur plus grand voit plus large à focale égale');
  // Un format fantaisiste ne doit pas fausser le calcul en silence.
  const inconnu = capacites({ ...FIXE, capteur: '1/42"' });
  assert.equal(inconnu.capteur, CAPTEUR_DEFAUT);
  assert.equal(inconnu.estSuppose, true);
});

test('un zoom embrasse large au grand angle et porte loin au téléobjectif', () => {
  const c = capacites({ ...FIXE, focale: undefined, focaleMin: 2.8, focaleMax: 12 });
  assert.equal(c.reglable, true);
  assert.ok(c.angleLarge > c.angleSerre, 'le grand angle ouvre davantage');
  assert.ok(c.portees.reconnaissance > capacites(FIXE).portees.reconnaissance,
    'réglé serré, il reconnaît plus loin qu\'un 4 mm fixe');
});

test('sans optique renseignée, aucun chiffre n\'est produit', () => {
  assert.equal(capacites({ reference: 'X', url: 'u', resH: 3840 }), null,
    'ni angle ni focale');
  assert.equal(capacites({ reference: 'X', url: 'u', focale: 4 }), null, 'pas de définition');
  assert.equal(capacites({ reference: 'X', url: 'u', angleH: 95 }), null, 'pas de définition');
  assert.equal(capacites({ reference: 'X', url: 'u', focale: 4, resH: 0 }), null);
  assert.equal(argumentaire({ reference: 'X', url: 'u' }), null);
});

/* ------------------------------------------- angle déclaré par le fabricant */

test('l\'angle du constructeur l\'emporte sur le calcul', () => {
  // Dahua IPC-HFW2441S-S : 2,8 mm sur 1/2.9", annoncé à 95° quand le calcul
  // rectiligne en donne 83. Un grand-angle est distordu ; calculer à la place
  // du constructeur resserre le champ sur le papier et gonfle les px/m.
  const declare = capacites({ resH: 2688, focale: 2.8, capteur: '1/2.9"', angleH: 95 });
  const calcule = capacites({ resH: 2688, focale: 2.8, capteur: '1/2.9"' });
  proche(declare.angleLarge, 95, 1e-9, 'l\'angle annoncé est repris tel quel');
  proche(calcule.angleLarge, 83.5, 1, 'le calcul rectiligne, à défaut');
  assert.equal(declare.angleCalcule, false);
  assert.equal(calcule.angleCalcule, true);
  // Champ plus large annoncé : moins de pixels au mètre, donc portée moindre.
  assert.ok(declare.portees.reconnaissance < calcule.portees.reconnaissance,
    'le champ réel, plus large, rapproche la portée utile');
  assert.ok(declare.largeurA(10) > calcule.largeurA(10));
});

test('un angle déclaré dispense de connaître le capteur', () => {
  const c = capacites({ resH: 2688, angleH: 130 });
  assert.ok(c, 'l\'angle seul suffit, avec la définition');
  assert.equal(c.estSuppose, false, 'aucun capteur n\'a été supposé');
  assert.equal(c.focaleMin, null);
  assert.equal(c.reglable, false);
  assert.match(argumentaire({ resH: 2688, angleH: 130 }).optique, /champ de 130 °/);
});

test('un zoom peut déclarer ses deux angles', () => {
  const c = capacites({ resH: 2688, focaleMin: 2.7, focaleMax: 13.5, angleH: 108, angleHTele: 30 });
  assert.equal(c.reglable, true);
  proche(c.angleLarge, 108, 1e-9);
  proche(c.angleSerre, 30, 1e-9, 'la portée se calcule au téléobjectif');
  assert.ok(c.portees.identification > 0);
});

/* --------------------------------------------------------- argumentaire */

test('la phrase de vitrine dit l\'objectif, la largeur et la portée', () => {
  const a = argumentaire(FIXE);
  assert.match(a.optique, /objectif 4 mm/);
  assert.match(a.champ, new RegExp(`m de large à ${DISTANCE_VITRINE} m`));
  assert.ok(a.reconnaissance > a.identification);
  assert.ok(!/\./.test(a.champ.replace(/[^\d.,]/g, '')), 'les décimales sont à la française');
});

test('un zoom s\'annonce comme réglable', () => {
  const a = argumentaire({ ...FIXE, focale: undefined, focaleMin: 2.8, focaleMax: 12 });
  assert.match(a.optique, /réglable de 2,8 à 12 mm/);
});

/* ------------------------------------------------------------ catalogue */

test('un produit sans référence ou sans adresse n\'est pas affiché', () => {
  const catalogue = {
    produits: [
      FIXE,
      { reference: 'Sans adresse', resH: 3840, focale: 4 },
      { url: 'https://exemple/x', resH: 3840, focale: 4 },
      { reference: '   ', url: 'https://exemple/y' },
    ],
  };
  const gardes = produitsAffichables(catalogue);
  assert.equal(gardes.length, 1);
  assert.equal(gardes[0].reference, FIXE.reference);
  assert.equal(produitsAffichables(null).length, 0);
});

test('les réserves disent ce qui manque, plutôt que de laisser une grille vide', () => {
  assert.match(reservesCatalogue({ produits: [] })[0], /Aucun produit/);
  assert.match(reservesCatalogue(null)[0], /Aucun produit/);

  const incomplet = reservesCatalogue({
    produits: [FIXE, { reference: 'Sans adresse' },
      { reference: 'Sans optique', url: 'https://exemple/z' }],
  });
  assert.ok(incomplet.some((r) => /sans référence ou sans adresse/.test(r)));
  assert.ok(incomplet.some((r) => /sans optique renseignée/.test(r)));

  assert.deepEqual(reservesCatalogue({ produits: [FIXE] }), [],
    'un catalogue complet ne porte aucune réserve');
});
