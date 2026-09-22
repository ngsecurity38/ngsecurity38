/**
 * Tests de l'autonomie sur coupure.
 * Exécution : node --test tests/secours.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RENDEMENT, RESERVE, FACTEUR_PUISSANCE,
  autonomie, energieNecessaire, voltamperes, calibreOnduleur, bilan,
} from '../js/secours.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

test('autonomie : la batterie ne rend ni toute son énergie ni sans pertes', () => {
  // 500 Wh, 100 W : une heure naïve de cinq heures. En vérité 500 × 0,8 × 0,85 / 100.
  proche(autonomie({ energieWh: 500, charge: 100 }), 3.4, 1e-9);
  assert.ok(
    autonomie({ energieWh: 500, charge: 100 }) < 500 / 100,
    'l\'autonomie calculée doit rester sous le calcul naïf',
  );
});

test('autonomie et énergie nécessaire sont réciproques', () => {
  const wh = energieNecessaire({ charge: 120, heures: 2 });
  proche(autonomie({ energieWh: wh, charge: 120 }), 2, 1e-9, 'aller-retour');
});

test('autonomie : doubler la charge divise la durée par deux', () => {
  const a = autonomie({ energieWh: 800, charge: 50 });
  const b = autonomie({ energieWh: 800, charge: 100 });
  proche(a / b, 2, 1e-9);
});

test('autonomie : les hypothèses se règlent', () => {
  // Sans pertes ni réserve, on retombe sur le calcul d'école.
  proche(autonomie({ energieWh: 500, charge: 100, rendement: 1, reserve: 0 }), 5, 1e-9);
  assert.equal(RENDEMENT, 0.85);
  assert.equal(RESERVE, 0.2);
});

test('autonomie : données manquantes → zéro, pas une durée imaginaire', () => {
  assert.equal(autonomie({ energieWh: 0, charge: 100 }), 0);
  assert.equal(autonomie({ energieWh: 500, charge: 0 }), 0);
  assert.equal(energieNecessaire({ charge: 100, heures: 0 }), 0);
});

test('voltampères : un onduleur « 1000 VA » ne donne pas mille watts', () => {
  proche(voltamperes(600), 1000, 1e-9, '600 W demandent 1000 VA');
  assert.equal(FACTEUR_PUISSANCE, 0.6);
  assert.equal(voltamperes(0), 0);
});

test('calibre : l\'arrondi va vers le haut, jamais au plus proche', () => {
  // 200 W demandent 333 VA. Au plus proche, on proposerait un 300 VA — qui
  // se met en sécurité au basculement, seul instant où il sert.
  assert.equal(calibreOnduleur(200), 400);
  assert.equal(calibreOnduleur(80), 200, '133 VA ne tiennent pas dans un 100');
  assert.equal(calibreOnduleur(120), 200, 'pile 200 VA : pas de calibre gaspillé');
});

test('calibre : il couvre toujours le besoin, sur toute la plage', () => {
  for (let w = 10; w <= 2000; w += 10) {
    assert.ok(
      calibreOnduleur(w) >= voltamperes(w),
      `${w} W : ${calibreOnduleur(w)} VA sous les ${voltamperes(w).toFixed(0)} nécessaires`,
    );
  }
  assert.equal(calibreOnduleur(0), 0);
});

/* ------------------------------------------------- la chaîne complète */

const ZONES = () => [
  {
    cle: 'local', nom: 'Local technique', enregistreur: true,
    secourue: true, charge: 120, cameras: ['C3', 'C5', 'C6', 'C7', 'C9'],
  },
  { cle: 'R1', nom: 'Coffret d\'entrée', secourue: false, charge: 40, cameras: ['C1', 'C2'] },
  { cle: 'R2', nom: 'Relais de halle', secourue: false, charge: 35, cameras: ['C4', 'C8'] },
];

test('secourir l\'enregistreur seul, c\'est enregistrer du noir', () => {
  const b = bilan({ zones: ZONES(), heures: 2 });
  assert.equal(b.enregistreNoir, true);
  assert.deepEqual(b.camerasPerdues, ['C1', 'C2', 'C4', 'C8']);
  assert.equal(b.camerasTenues.length, 5);
  assert.equal(b.chargeSecourue, 120);
  assert.equal(b.chargeAbandonnee, 75);
});

test('secourir toute la chaîne lève l\'alerte, et coûte la charge entière', () => {
  const zones = ZONES().map((z) => ({ ...z, secourue: true }));
  const b = bilan({ zones, heures: 2 });
  assert.equal(b.enregistreNoir, false);
  assert.equal(b.camerasPerdues.length, 0);
  assert.equal(b.chargeSecourue, 195);
  // Secourir tout demande plus de batterie que secourir l'enregistreur seul.
  assert.ok(b.energieWh > bilan({ zones: ZONES(), heures: 2 }).energieWh);
});

test('ne rien secourir n\'est pas « enregistrer du noir » : c\'est ne rien enregistrer', () => {
  // La distinction compte : l'alerte vise la dépense inutile, pas l'absence
  // de dépense. Une installation non secourue est un choix assumé.
  const zones = ZONES().map((z) => ({ ...z, secourue: false }));
  const b = bilan({ zones, heures: 2 });
  assert.equal(b.enregistreNoir, false);
  assert.equal(b.chargeSecourue, 0);
  assert.equal(b.energieWh, 0);
});

test('bilan : l\'énergie correspond à la charge secourue et à la durée visée', () => {
  const b = bilan({ zones: ZONES(), heures: 3 });
  proche(b.energieWh, energieNecessaire({ charge: 120, heures: 3 }), 1e-9);
  proche(b.voltamperes, voltamperes(120), 1e-9);
});

test('bilan : sans durée visée, aucune batterie n\'est chiffrée', () => {
  assert.equal(bilan({ zones: ZONES() }).energieWh, 0);
  assert.equal(bilan().chargeSecourue, 0);
});
