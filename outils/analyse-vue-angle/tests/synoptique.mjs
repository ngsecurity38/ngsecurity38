/**
 * Tests du synoptique de raccordement.
 *
 * Le schéma dit ce qui tombe quand un coffret tombe. Il doit donc porter
 * TOUS les équipements de l'étude, rattacher chacun au bon coffret, et
 * montrer la cascade telle qu'elle est — R3 derrière R2, pas derrière le
 * local.
 *
 * Exécution : node --test tests/synoptique.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { synoptique, groupes } from '../js/synoptique.js';
import { bilanEtude } from '../js/etude-plan.js';

const ici = dirname(fileURLToPath(import.meta.url));
const etudes = join(ici, '..', '..', '..', 'etudes', '2026-09-22-site-industriel');
const REELLE = JSON.parse(readFileSync(join(etudes, 'etude.json'), 'utf8'));
const copie = () => JSON.parse(JSON.stringify(REELLE));

const gs = (e) => groupes(e, bilanEtude(e).liaisons);

test('chaque équipement de l\'étude figure une fois et une seule', () => {
  const g = gs(REELLE);
  const vus = g.flatMap((x) => x.equipements.map((e) => e.cle));
  const attendus = [
    ...REELLE.cameras, ...REELLE.acces, ...(REELLE.autres || []),
  ].map((x) => x.cle);
  assert.deepEqual([...vus].sort(), [...attendus].sort());
  assert.equal(new Set(vus).size, vus.length, 'aucun doublon');
});

test('un équipement sans coffret forme le groupe du local, en dernier', () => {
  const g = gs(REELLE);
  const dernier = g[g.length - 1];
  assert.equal(dernier.cle, null);
  // Le moniteur d'interphonie est dans le local même : il n'a pas de coffret.
  assert.ok(dernier.equipements.some((e) => e.cle === 'M1'));
  assert.ok(g.slice(0, -1).every((x) => x.cle), 'les autres groupes sont des coffrets');
});

test('la cascade est celle de l\'étude : R3 part de R2, pas du local', () => {
  const g = gs(REELLE).find((x) => x.cle === 'R3');
  assert.equal(g.depuis, 'R2');
  assert.ok(synoptique(REELLE).includes('depuis R2'),
    'et le schéma le dit, plutôt que de faire partir R3 du local');
});

test('un accès porte ses cinq câbles, et c\'est le plus long qui décide', () => {
  const g = gs(REELLE).flatMap((x) => x.equipements).find((e) => e.cle === 'A1');
  const siens = bilanEtude(REELLE).liaisons.filter((l) => String(l.repere).startsWith('A1'));
  assert.equal(g.liaison.cables, siens.length);
  assert.equal(g.liaison.longueur, Math.max(...siens.map((l) => l.longueur)));
  assert.ok(synoptique(REELLE).includes(`× ${siens.length}`));
});

test('déplacer une caméra d\'un coffret à l\'autre déplace sa ligne', () => {
  const e = copie();
  e.cameras.find((c) => c.cle === 'C8').coffret = 'R2';
  const g = gs(e);
  assert.ok(!g.find((x) => x.cle === 'R1').equipements.some((x) => x.cle === 'C8'));
  assert.ok(g.find((x) => x.cle === 'R2').equipements.some((x) => x.cle === 'C8'));
});

test('une liaison hors norme se dessine en rouge et se dit en légende', () => {
  const e = copie();
  // On éloigne une caméra assez pour crever les 90 m.
  const c = e.cameras.find((x) => x.cle === 'C4');
  c.coffret = 'R3';
  const svg = synoptique(e);
  const b = bilanEtude(e);
  assert.ok(b.horsNorme.length > 0, 'l\'étude voit bien le dépassement');
  assert.ok(svg.includes('#c8102e'), 'du rouge dans le schéma');
  assert.ok(/liaison\(s\) au-delà de 90 m/.test(svg));
});

test('sans dépassement, la légende le dit aussi', () => {
  assert.ok(/Toutes les liaisons tiennent sous les 90 m/.test(synoptique(REELLE)));
});

test('le SVG est autonome, bien formé et sans lien externe', () => {
  const svg = synoptique(REELLE);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.equal((svg.match(/<svg/g) || []).length, 1);
  assert.deepEqual([...svg.matchAll(/(?:src|href)="[^"]*/g)].map((m) => m[0]), []);
});

test('ce que l\'agence tape ne casse pas le schéma', () => {
  const e = copie();
  e.cameras[0].role = 'Entrée <principale> & "cour"';
  e.coffrets[0].nom = 'Coffret <A>';
  const svg = synoptique(e);
  assert.ok(svg.includes('&lt;') || svg.includes('&amp;'));
  assert.ok(!/<principale>/.test(svg));
});

test('le schéma grandit avec le parc plutôt que de déborder', () => {
  const e = copie();
  const avant = Number(synoptique(e).match(/viewBox="0 0 \d+ (\d+)"/)[1]);
  for (let i = 0; i < 6; i += 1) {
    e.cameras.push({ ...e.cameras[0], cle: `X${i}`, coffret: 'R1' });
  }
  const apres = Number(synoptique(e).match(/viewBox="0 0 \d+ (\d+)"/)[1]);
  assert.ok(apres > avant, `${apres} devrait dépasser ${avant}`);
});
