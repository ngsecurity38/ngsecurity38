/**
 * Tests du plan d'étude partagé entre le dossier et l'éditeur.
 * Exécution : node --test tests/etude-plan.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { geometrie, optiqueUtile, metre, bilanEtude } from '../js/etude-plan.js';
import { LIAISON_PERMANENTE } from '../js/cable.js';

const ici = dirname(fileURLToPath(import.meta.url));
const REELLE = JSON.parse(readFileSync(
  join(ici, '..', '..', '..', 'etudes', '2026-09-22-site-industriel', 'etude.json'), 'utf8',
));

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/* ------------------------------------------------------------ géométrie */

test('géométrie : tout se cale sur la longueur du bâtiment', () => {
  const g = geometrie({
    longueurBatiment: 100, profondeurBatiment: 22, marge: 12,
    annexe: { longueur: 18, profondeur: 10 }, cour: { profondeur: 62 },
  });
  assert.deepEqual(g.bat, { x: 12, y: 12, l: 100, p: 22 });
  assert.equal(g.annexe.x, 112, 'l\'annexe commence où le bâtiment finit');
  assert.equal(g.cour.y, 34, 'la cour commence sous le bâtiment');
  assert.equal(g.largeur, 100 + 18 + 24);
});

test('géométrie : allonger le bâtiment allonge la cour d\'autant', () => {
  const base = { profondeurBatiment: 22, marge: 12, annexe: { longueur: 18, profondeur: 10 }, cour: { profondeur: 62 } };
  const a = geometrie({ ...base, longueurBatiment: 75 });
  const b = geometrie({ ...base, longueurBatiment: 100 });
  assert.equal(b.largeur - a.largeur, 25);
  assert.equal(a.cour.y, b.cour.y, 'la profondeur du bâtiment ne bouge pas');
});

test('optique : un panoramique se calcule sur UN de ses capteurs', () => {
  const pano = { resH: 3040, angleH: 180, capteurUnique: { resH: 1520, angleH: 90 } };
  assert.deepEqual(optiqueUtile(pano), { resH: 1520, angleH: 90 });
  const vari = { resH: 3840, angleH: 108, angleHTele: 30 };
  assert.equal(optiqueUtile(vari).angleH, 108);
  assert.equal(optiqueUtile(vari, true).angleH, 30, 'le téléobjectif resserre');
});

/* ---------------------------------------------------------------- métré */

const ETUDE_TEST = {
  site: { longueurBatiment: 100, profondeurBatiment: 22, marge: 12, annexe: { longueur: 18, profondeur: 10 }, cour: { profondeur: 62 } },
  local: { x: 50, y: 16, hauteurChemin: 6.5 },
  modeles: { turret: { resH: 2688, resV: 1520, angleH: 100.2, consoPoe: 9 } },
  equipements: { enregistreur: { canaux: 16, baies: 2, capaciteMaxBaie: 10, raid: false, bandePassante: 160 } },
  coffrets: [{ cle: 'R1', nom: 'Coffret', depuis: 'local', x: 90, y: 20, hauteur: 3 }],
  cameras: [
    { cle: 'C1', modele: 'turret', hauteur: 3, role: 'A', x: 55, y: 20, azimut: 180, coffret: null },
    { cle: 'C2', modele: 'turret', hauteur: 3, role: 'B', x: 95, y: 25, azimut: 180, coffret: 'R1' },
  ],
  acces: [],
};

test('métré : une caméra derrière un coffret part du coffret', () => {
  const l = metre(ETUDE_TEST);
  const c2 = l.find((x) => x.repere === 'C2');
  assert.equal(c2.vers, 'R1');
  // Depuis R1 (90, 20) : 5 + 5 + 3 de montée + 3 de descente = 16, +10 %, +2.
  proche(c2.longueur, 16 * 1.1 + 2, 1e-9, 'longueur depuis le coffret');
  assert.ok(c2.direct > c2.longueur, 'le direct est plus long, sinon le coffret ne sert à rien');
});

test('métré : la montante du coffret vient de son parent', () => {
  const l = metre(ETUDE_TEST);
  const r1 = l.find((x) => x.repere === 'R1');
  assert.equal(r1.montante, true);
  assert.equal(r1.vers, 'local');
});

test('métré : un coffret en cascade part de l\'autre coffret, pas du local', () => {
  const e = {
    ...ETUDE_TEST,
    coffrets: [
      { cle: 'R1', nom: 'A', depuis: 'local', x: 90, y: 20, hauteur: 3 },
      { cle: 'R2', nom: 'B', depuis: 'R1', x: 95, y: 20, hauteur: 3 },
    ],
  };
  const r2 = metre(e).find((x) => x.repere === 'R2');
  assert.equal(r2.vers, 'R1');
  // Cinq mètres de R1, pas quarante-cinq du local.
  assert.ok(r2.longueur < 15, `${r2.longueur} m : la cascade n'est pas prise en compte`);
});

test('métré : chaque point d\'accès tire cinq liaisons, la platine comprise', () => {
  const e = {
    ...ETUDE_TEST,
    acces: [{ cle: 'A1', nom: 'Portail', x: 20, y: 80, hauteur: 1.5, platine: true, coffret: null }],
  };
  const reperes = metre(e).filter((l) => l.repere.startsWith('A1')).map((l) => l.repere);
  assert.deepEqual(reperes, ['A1·P', 'A1·V', 'A1·L', 'A1·B', 'A1·C']);
  const sansPlatine = metre({
    ...e, acces: [{ ...e.acces[0], platine: false }],
  }).filter((l) => l.repere.startsWith('A1'));
  assert.equal(sansPlatine.length, 4, 'sans platine, pas de liaison réseau');
});

/* ---------------------------------------------------------------- bilan */

test('bilan : un coffret en cascade n\'occupe pas de port sur l\'enregistreur', () => {
  const e = {
    ...ETUDE_TEST,
    coffrets: [
      { cle: 'R1', nom: 'A', depuis: 'local', x: 90, y: 20, hauteur: 3 },
      { cle: 'R2', nom: 'B', depuis: 'R1', x: 95, y: 20, hauteur: 3 },
    ],
    cameras: ETUDE_TEST.cameras.map((c) => ({ ...c, coffret: 'R2' })),
  };
  // Zéro caméra en direct, un seul coffret branché au local : un port.
  assert.equal(bilanEtude(e).ports, 1);
});

test('bilan : le débit se compte sur les caméras posées', () => {
  const b = bilanEtude(ETUDE_TEST);
  assert.equal(b.cameras, 2);
  proche(b.debitTotal, 2 * (2688 * 1520 * 25 * 0.035) / 1e6, 1e-9);
  assert.equal(b.consoPoe, 18);
  assert.equal(b.voiesLibres, 14);
  assert.equal(b.bandeSaturee, false);
});

test('bilan : une liaison trop longue ressort, elle ne se perd pas', () => {
  const loin = {
    ...ETUDE_TEST,
    cameras: [{ cle: 'C9', modele: 'turret', hauteur: 3, role: 'Loin', x: 200, y: 200, azimut: 0, coffret: null }],
  };
  const b = bilanEtude(loin);
  assert.equal(b.horsNorme.length, 1);
  assert.ok(b.horsNorme[0].longueur > LIAISON_PERMANENTE);
});

/* ------------------------------ l'étude réelle, et l'accord avec le dossier */

test('l\'étude du site industriel : aucune liaison hors norme', () => {
  const b = bilanEtude(REELLE);
  assert.equal(b.cameras, 10);
  assert.deepEqual(b.horsNorme.map((l) => l.repere), [],
    'le plan livré ne doit porter aucune liaison hors norme');
});

test('l\'étude réelle : les totaux que le dossier imprime', () => {
  const b = bilanEtude(REELLE);
  // Ces valeurs sont celles du dossier remis. Si elles bougent ici sans
  // bouger là-bas, les deux se contredisent — et c'est tout l'objet de ce
  // module de l'empêcher.
  proche(b.reseau, 746, 1, 'câble réseau');
  proche(b.commande, 493, 1, 'alimentation et commande');
  assert.equal(b.boites.boites, 3);
  assert.equal(b.ports, 3);
  proche(b.consoPoe, 111.5, 0.01);
  proche(b.capaciteGo / 1000, 18.2, 0.1, 'stockage 30 jours');
});

test('l\'étude réelle : déplacer une caméra change le métré', () => {
  const avant = bilanEtude(REELLE).reseau;
  const bougee = {
    ...REELLE,
    cameras: REELLE.cameras.map((c) => (c.cle === 'C1' ? { ...c, x: c.x + 30 } : c)),
  };
  assert.notEqual(bilanEtude(bougee).reseau, avant);
});
