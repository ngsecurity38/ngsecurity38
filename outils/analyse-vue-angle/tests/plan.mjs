/**
 * Tests du tracé de champ sur plan et du choix d'objectif.
 * Exécution : node --test tests/plan.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  distance, echelleDuPlan, azimut, portee, polygoneCone, dimensionner, ouverturePourFocale,
} from '../js/plan.js';
import { CAPTEURS, anglesDeChamp, niveauDori } from '../js/optique.js';
import {
  CATALOGUE_INITIAL, proposer, conseil, focaleCourante, normaliserEntree, estFixe,
} from '../js/catalogue.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/* ------------------------------------------------------------------- plan */

test('échelle : une distance connue donne les mètres par unité de plan', () => {
  // Deux repères écartés d'un quart de la largeur du plan valent 20 m sur le terrain.
  const e = echelleDuPlan({ x: 0.2, y: 0.5 }, { x: 0.45, y: 0.5 }, 20);
  proche(e, 80, 1e-9, 'la largeur entière du plan vaut donc 80 m');
  assert.equal(echelleDuPlan({ x: 0.2, y: 0.5 }, { x: 0.2, y: 0.5 }, 20), 0, 'deux points confondus');
  assert.equal(echelleDuPlan({ x: 0, y: 0 }, { x: 1, y: 0 }, 0), 0, 'distance nulle');
});

test('azimut : le nord est en haut du plan, le sens est horaire', () => {
  const o = { x: 0.5, y: 0.5 };
  proche(azimut(o, { x: 0.5, y: 0.1 }), 0, 1e-9, 'vers le haut');
  proche(azimut(o, { x: 0.9, y: 0.5 }), 90, 1e-9, 'vers la droite');
  proche(azimut(o, { x: 0.5, y: 0.9 }), 180, 1e-9, 'vers le bas');
  proche(azimut(o, { x: 0.1, y: 0.5 }), 270, 1e-9, 'vers la gauche');
});

test('portée : longueur du tracé convertie par l\'échelle', () => {
  const e = echelleDuPlan({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 50); // 100 m par unité
  proche(portee({ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.5 }, e), 30, 1e-9);
});

test('dimensionnement : ouverture tracée, focale et densité obtenues', () => {
  const echelle = 100; // 1 unité de plan = 100 m
  const trace = {
    sommet: { x: 0.5, y: 0.9 },
    vise: { x: 0.5, y: 0.5 }, // 0,4 unité vers le haut, soit 40 m
    ouverture: 60,
  };
  const d = dimensionner(trace, echelle, CAPTEURS['1/2.8"'], 1920);
  proche(d.portee, 40, 1e-9, 'portée');
  proche(d.azimut, 0, 1e-9, 'visée plein nord');
  proche(d.largeur, 2 * 40 * Math.tan(Math.PI / 6), 1e-9, 'largeur couverte');
  proche(d.focale, 5.18 / (2 * Math.tan(Math.PI / 6)), 1e-9, 'focale nécessaire');
  proche(d.densite, 1920 / d.largeur, 1e-9, 'densité');
  assert.equal(niveauDori(d.densite), 'detection', 'à 40 m en grand angle, on détecte seulement');
});

test('dimensionnement : resserrer le champ allonge la focale et densifie', () => {
  const base = { sommet: { x: 0.5, y: 0.9 }, vise: { x: 0.5, y: 0.5 } };
  const large = dimensionner({ ...base, ouverture: 90 }, 100, CAPTEURS['1/2.8"'], 1920);
  const serre = dimensionner({ ...base, ouverture: 30 }, 100, CAPTEURS['1/2.8"'], 1920);
  assert.ok(serre.focale > large.focale, 'un champ étroit demande une focale plus longue');
  assert.ok(serre.densite > large.densite, 'et donne plus de pixels par mètre');
  assert.ok(serre.surface < large.surface);
});

test('focale et ouverture sont réciproques', () => {
  const capteur = CAPTEURS['1/2.8"'];
  const trace = { sommet: { x: 0.5, y: 0.9 }, vise: { x: 0.5, y: 0.4 }, ouverture: 47 };
  const d = dimensionner(trace, 100, capteur, 1920);
  proche(ouverturePourFocale(capteur, d.focale), 47, 1e-9, 'aller-retour');
  proche(anglesDeChamp(capteur, d.focale).horizontal, 47, 1e-9, 'cohérent avec le calcul optique');
});

test('cône : sommet en tête, arc symétrique autour de la visée', () => {
  const sommet = { x: 0.5, y: 0.8 };
  const p = polygoneCone(sommet, 0, 60, 0.3, 12);
  assert.equal(p.length, 14, 'sommet + 13 points d\'arc');
  assert.deepEqual(p[0], sommet);
  proche(distance(sommet, p[1]), 0.3, 1e-9, 'premier bord à la portée');
  proche(distance(sommet, p[p.length - 1]), 0.3, 1e-9, 'second bord aussi');
  proche(azimut(sommet, p[1]), 330, 1e-9, 'bord gauche à -30°');
  proche(azimut(sommet, p[p.length - 1]), 30, 1e-9, 'bord droit à +30°');
});

test('un champ dégénéré ne produit pas de focale absurde', () => {
  const t = { sommet: { x: 0.5, y: 0.5 }, vise: { x: 0.5, y: 0.2 }, ouverture: 0 };
  assert.equal(dimensionner(t, 100, CAPTEURS['1/2.8"'], 1920).focale, 0);
  const plat = { ...t, ouverture: 200 };
  assert.equal(dimensionner(plat, 100, CAPTEURS['1/2.8"'], 1920).focale, 0);
});

/* -------------------------------------------------------------- catalogue */

test('catalogue de départ : le matériel de l\'étude, voie par voie', () => {
  assert.equal(CATALOGUE_INITIAL.length, 2);
  assert.ok(CATALOGUE_INITIAL.every((e) => estFixe(e)), 'les deux objectifs sont fixes');
  assert.equal(CATALOGUE_INITIAL.find((e) => e.type === 'thermique').focaleMin, 3.5);
});

test('proposition : une focale fixe proche est retenue, une trop éloignée non', () => {
  assert.equal(proposer(CATALOGUE_INITIAL, 4).length, 2, '4 mm : les deux entrées restent plausibles');
  assert.equal(proposer(CATALOGUE_INITIAL, 4)[0].entree.voie, 'contexte', 'le 4 mm exact en tête');
  assert.equal(proposer(CATALOGUE_INITIAL, 12).length, 0, '12 mm : aucun matériel ne convient');
});

test('proposition : restriction à une technologie', () => {
  const p = proposer(CATALOGUE_INITIAL, 3.6, { type: 'thermique' });
  assert.equal(p.length, 1);
  assert.equal(p[0].entree.voie, 'thermique');
});

test('proposition : un varifocal couvrant passe avant un fixe approchant', () => {
  const catalogue = [
    normaliserEntree({ reference: 'Fixe 6', focaleMin: 6, focaleMax: 6 }),
    normaliserEntree({ reference: 'Vari 2,7-13,5', focaleMin: 2.7, focaleMax: 13.5 }),
  ];
  const p = proposer(catalogue, 5.2);
  assert.equal(p[0].entree.reference, 'Vari 2,7-13,5');
  assert.equal(p[0].dans, true);
  proche(p[0].reglage, 5.2, 1e-9, 'le zoom se règle sur la focale voulue');
});

test('conseil : varifocal, focale fixe, et catalogue muet', () => {
  const vari = [normaliserEntree({ reference: 'Vari', focaleMin: 2.7, focaleMax: 13.5 })];
  const c1 = conseil(5.24, proposer(vari, 5.24));
  assert.match(c1.texte, /régler le zoom sur 5,2 mm/);

  const c2 = conseil(4, proposer(CATALOGUE_INITIAL, 4));
  assert.match(c2.texte, /focale fixe 4 mm, rien à régler/);

  const c3 = conseil(9.3, []);
  assert.match(c3.texte, /Aucun matériel du catalogue/);
  assert.equal(c3.focale, 8, 'la focale du commerce la plus proche');
});

test('focale du commerce la plus proche', () => {
  assert.equal(focaleCourante(3.4), 3.6);
  assert.equal(focaleCourante(5.2), 6);
  assert.equal(focaleCourante(0), 0);
});

test('une entrée saisie à la main est assainie', () => {
  const e = normaliserEntree({ reference: '  Test  ', focaleMin: '13,5', focaleMax: '2.7' });
  assert.equal(e.reference, 'Test');
  assert.equal(e.focaleMin, 2.7, 'les bornes sont remises dans l\'ordre');
  assert.equal(e.focaleMax, 13.5);
  assert.equal(e.type, 'visible');
  assert.ok(e.id, 'un identifiant est attribué');
});
