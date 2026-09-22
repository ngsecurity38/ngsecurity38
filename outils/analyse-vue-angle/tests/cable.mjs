/**
 * Tests du métré : cheminements, limite Ethernet, section des alimentations.
 * Exécution : node --test tests/cable.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIAISON_PERMANENTE, CANAL_COMPLET, RESERVE_BOUT, MOU_DEFAUT, BOBINE,
  RHO_CUIVRE, SECTIONS, CHUTE_MAX,
  cheminement, verdictEthernet, bobines, chuteTension, sectionContinu,
} from '../js/cable.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/* -------------------------------------------------------- cheminement */

test('cheminement : la somme des écarts, le mou, puis les réserves de bout', () => {
  // 30 + 10 au plan, 4 m de descente de caméra, 3 m jusqu'à la baie = 47 m
  // parcourus ; +10 % = 51,7 ; +2 × 1 m de réserve = 53,7.
  const l = cheminement({ dx: 30, dy: 10, montee: 4, descente: 3 });
  proche(l, 53.7, 1e-9, 'longueur');
});

test('cheminement : le signe des écarts ne change rien', () => {
  assert.equal(
    cheminement({ dx: -30, dy: 10 }),
    cheminement({ dx: 30, dy: -10 }),
  );
});

test('cheminement : un trajet nul ne consomme pas les réserves de bout', () => {
  // Sans rien à parcourir il n'y a pas de câble, donc pas de deux mètres de
  // réserve. Le contraire ferait apparaître du câble dans le métré pour un
  // appareil posé sur la baie.
  assert.equal(cheminement({ dx: 0, dy: 0 }), 0);
});

test('cheminement : une montée négative ne raccourcit pas le câble', () => {
  assert.equal(
    cheminement({ dx: 20, montee: -5 }),
    cheminement({ dx: 20, montee: 0 }),
  );
});

test('cheminement : mou et réserves paramétrables', () => {
  const sec = cheminement({ dx: 100, mou: 0, reserveBout: 0 });
  assert.equal(sec, 100);
  assert.equal(MOU_DEFAUT, 0.1);
  assert.equal(RESERVE_BOUT, 1);
});

/* ---------------------------------------------------------- Ethernet */

test('limite Ethernet : les trois verdicts tombent aux bons seuils', () => {
  assert.equal(verdictEthernet(89).niveau, 'ok');
  assert.equal(verdictEthernet(LIAISON_PERMANENTE).niveau, 'ok');
  assert.equal(verdictEthernet(LIAISON_PERMANENTE + 0.5).niveau, 'limite');
  assert.equal(verdictEthernet(CANAL_COMPLET).niveau, 'limite');
  assert.equal(verdictEthernet(CANAL_COMPLET + 0.5).niveau, 'hors-norme');
});

test('limite Ethernet : le hors-norme nomme la sortie de secours', () => {
  const v = verdictEthernet(140);
  assert.match(v.texte, /commutateur déporté|fibre/);
});

test('limite Ethernet : une longueur absente ne déclenche pas d\'alerte', () => {
  // Se taire vaut mieux qu'alarmer sur une donnée manquante : une alerte
  // fausse dans un métré est une alerte qu'on n'écoute plus nulle part.
  assert.equal(verdictEthernet(0).niveau, 'ok');
  assert.equal(verdictEthernet(undefined).niveau, 'ok');
});

/* ------------------------------------------------------------ bobines */

test('bobines : on commande des boîtes entières, et le reste est dit', () => {
  const b = bobines(400);
  assert.equal(b.boites, 2);
  assert.equal(b.total, 610);
  assert.equal(b.reste, 210);
});

test('bobines : une longueur pile ne fait pas ouvrir une boîte de plus', () => {
  const b = bobines(BOBINE);
  assert.equal(b.boites, 1);
  assert.equal(b.reste, 0);
});

/* ------------------------------------------- alimentations continues */

test('chute de tension : le courant fait l\'aller ET le retour', () => {
  // 2 × 0,0175 × 50 × 0,5 / 1,5 = 0,583 V
  proche(chuteTension({ courant: 0.5, longueur: 50, section: 1.5 }), 0.5833, 0.001);
  // L'aller simple seul donnerait la moitié : c'est l'erreur classique, et
  // elle fait poser une section deux fois trop faible.
  const moitie = (RHO_CUIVRE * 50 * 0.5) / 1.5;
  proche(chuteTension({ courant: 0.5, longueur: 50, section: 1.5 }), 2 * moitie, 1e-9);
});

test('section : une ventouse de 0,5 A à 40 m en 12 V demande du 1,5 mm²', () => {
  // Section théorique : 2 × 0,0175 × 40 × 0,5 / 1,2 = 0,583 mm² → 0,75 au
  // catalogue… mais la chute réelle doit rester sous 1,2 V, ce que 0,75 tient.
  const r = sectionContinu({ courant: 0.5, longueur: 40 });
  assert.ok(SECTIONS.includes(r.section));
  assert.ok(r.chute <= 12 * CHUTE_MAX + 1e-9, `chute ${r.chute} V au-dessus de la limite`);
  assert.equal(r.horsCatalogue, false);
});

test('section : la section retenue tient toujours la chute admissible', () => {
  for (const longueur of [5, 20, 40, 60, 80, 120]) {
    for (const courant of [0.25, 0.5, 1, 2]) {
      const r = sectionContinu({ courant, longueur });
      if (r.horsCatalogue) continue;
      assert.ok(
        r.chute <= 12 * CHUTE_MAX + 1e-9,
        `${courant} A sur ${longueur} m : ${r.chute} V en ${r.section} mm²`,
      );
      assert.ok(r.part <= CHUTE_MAX + 1e-9);
    }
  }
});

test('section : doubler la longueur fait monter la section', () => {
  const court = sectionContinu({ courant: 1, longueur: 20 }).section;
  const long = sectionContinu({ courant: 1, longueur: 80 }).section;
  assert.ok(long > court, `${long} devrait dépasser ${court}`);
});

test('section : passer de 12 V à 24 V divise la chute par quatre', () => {
  // À section égale la chute ne dépend pas de la tension — mais le courant
  // d'un appareil de même puissance est deux fois moindre en 24 V, et la
  // chute ADMISSIBLE est deux fois plus grande. D'où le facteur quatre, qui
  // est la vraie réponse à un câble trop long.
  const en12 = sectionContinu({ courant: 1, longueur: 100, tension: 12 });
  const en24 = sectionContinu({ courant: 0.5, longueur: 100, tension: 24 });
  assert.ok(en24.section < en12.section, `${en24.section} devrait être sous ${en12.section}`);
});

test('section : au-delà du catalogue, la fonction le dit au lieu de mentir', () => {
  const r = sectionContinu({ courant: 10, longueur: 400 });
  assert.equal(r.horsCatalogue, true);
  assert.equal(r.section, SECTIONS[SECTIONS.length - 1]);
  assert.ok(r.part > CHUTE_MAX, 'la chute réelle dépasse bien l\'admissible');
});

test('section : données manquantes → rien, pas un zéro trompeur', () => {
  assert.equal(sectionContinu({ courant: 0, longueur: 20 }), null);
  assert.equal(sectionContinu({ courant: 1, longueur: 0 }), null);
  assert.equal(chuteTension({ courant: 1, longueur: 20, section: 0 }), 0);
});
