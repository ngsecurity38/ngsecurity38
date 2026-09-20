/**
 * Tests du catalogue de la boutique.
 * Exécution : node --test tests/boutique.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPTEUR_DEFAUT, DISTANCE_VITRINE, PLAFOND_DEFAUT, focales, capacites,
  argumentaire, produitsAffichables, reservesCatalogue,
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

/* --------------------------------------------------- caméras mobiles (PTZ) */

/** Hikvision DS-2DE7A825IW-AEB : 8 MP, zoom ×25, infrarouge à 200 m. */
const PTZ25 = {
  reference: 'DS-2DE7A825IW-AEB', type: 'ptz', resH: 3840, capteur: '1/1.8"',
  focaleMin: 5.9, focaleMax: 147.5, angleH: 50.8, angleHTele: 2.6, porteeMax: 200,
};

test('la portée d\'un PTZ est arrêtée là où l\'éclairage s\'arrête', () => {
  const c = capacites(PTZ25);
  assert.equal(c.ptz, true);
  // L'optique seule mène à un chiffre que le terrain dément.
  assert.ok(c.portees.reconnaissance > 600,
    `l'optique promet ${c.portees.reconnaissance} m`);
  assert.equal(c.porteesTenues.reconnaissance, 200, 'rabattu sur l\'infrarouge');
  assert.equal(c.porteesTenues.identification, 200);
  assert.equal(c.plafonne, true, 'la page doit pouvoir dire pourquoi');
  assert.equal(c.plafond, 200);

  // C'est bien la valeur rabattue qui part sur la fiche.
  const a = argumentaire(PTZ25);
  assert.equal(a.reconnaissance, 200);
  assert.equal(a.plafonne, true);
});

test('sans portée déclarée, le plafond par défaut s\'applique', () => {
  const c = capacites({ ...PTZ25, porteeMax: undefined });
  assert.equal(c.plafond, PLAFOND_DEFAUT);
  assert.equal(c.porteesTenues.reconnaissance, PLAFOND_DEFAUT);
});

test('une caméra dont l\'optique ne dépasse pas le plafond n\'est pas rabattue', () => {
  const c = capacites({ resH: 3840, capteur: '1/1.8"', focale: 4, angleH: 87 });
  assert.equal(c.plafonne, false);
  assert.equal(c.porteesTenues.reconnaissance, c.portees.reconnaissance);
  proche(c.porteesTenues.reconnaissance, 16.2, 0.1);
});

test('un PTZ s\'annonce par son zoom, pas par sa focale', () => {
  const a = argumentaire(PTZ25);
  assert.match(a.optique, /zoom ×25/, a.optique);
  assert.match(a.optique, /de 50,8 ° à 2,6 °/, a.optique);
  assert.equal(a.ptz, true, 'la page doit pouvoir dire qu\'elle est mobile');

  // Un PTZ sans zoom optique reste une caméra mobile, mais s'annonce en focale.
  const fixe = argumentaire({ reference: 'x', type: 'ptz', resH: 2560, capteur: '1/1.8"', focale: 4, angleH: 88.7 });
  assert.equal(fixe.ptz, true);
  assert.match(fixe.optique, /objectif 4 mm/, fixe.optique);
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

test('seule la référence est exigée ; l\'adresse est un plus', () => {
  const catalogue = {
    produits: [
      FIXE,
      // Sans fiche produit derrière : la caractéristique renseigne quand même.
      { reference: 'Sans adresse', resH: 3840, focale: 4 },
      { url: 'https://exemple/x', resH: 3840, focale: 4 },
      { reference: '   ', url: 'https://exemple/y' },
    ],
  };
  const gardes = produitsAffichables(catalogue);
  assert.equal(gardes.length, 2, 'la fiche sans adresse reste affichable');
  assert.equal(gardes[1].reference, 'Sans adresse');
  assert.equal(produitsAffichables(null).length, 0);
});

test('les réserves disent ce qui manque, plutôt que de laisser une grille vide', () => {
  assert.match(reservesCatalogue({ produits: [] })[0], /Aucun produit/);
  assert.match(reservesCatalogue(null)[0], /Aucun produit/);

  const incomplet = reservesCatalogue({
    produits: [FIXE, { url: 'https://exemple/y' },
      { reference: 'Sans optique', url: 'https://exemple/z' }],
  });
  assert.ok(incomplet.some((r) => /sans référence/.test(r)));
  assert.ok(incomplet.some((r) => /sans optique renseignée/.test(r)));

  assert.deepEqual(reservesCatalogue({ produits: [FIXE] }), [],
    'un catalogue complet ne porte aucune réserve');
});

/* ------------------------------------------- bibliothèque d'optiques */

/*
 * `references-optiques.json` est le carnet des modèles du catalogue NG
 * Security 38, avec les caractéristiques annoncées par les constructeurs.
 * Une faute de frappe y passerait inaperçue et se retrouverait sur la page.
 */
test('chaque modèle de la bibliothèque tient debout', async () => {
  const { readFileSync } = await import('node:fs');
  const { CAPTEURS, anglesDeChamp } = await import('../js/optique.js');
  const lib = JSON.parse(readFileSync(
    new URL('../references-optiques.json', import.meta.url), 'utf8',
  ));
  assert.ok(lib.modeles.length >= 10, `${lib.modeles.length} modèles`);

  for (const m of lib.modeles) {
    const ou = `${m.marque} ${m.reference}`;
    assert.ok(m.marque && m.reference && m.designation, `${ou} : identité incomplète`);
    assert.ok(m.source, `${ou} : un relevé sans source ne vaut rien`);

    const c = capacites(m);
    assert.ok(c, `${ou} : optique inexploitable`);
    assert.equal(c.angleCalcule, false,
      `${ou} : l'angle doit venir du constructeur, pas d'un calcul`);
    assert.ok(c.angleLarge > 20 && c.angleLarge < 180, `${ou} : champ ${c.angleLarge}°`);

    if (m.angleHTele) {
      assert.ok(m.angleHTele < m.angleH,
        `${ou} : le téléobjectif doit resserrer (${m.angleHTele}° vs ${m.angleH}°)`);
      assert.ok(m.focaleMax > m.focaleMin, `${ou} : un zoom a deux focales`);
    }

    /*
     * Un grand-angle est distordu : il embrasse TOUJOURS plus que le calcul
     * rectiligne. Un angle annoncé inférieur au calcul trahirait une erreur
     * de saisie — capteur ou focale interverti, virgule égarée.
     */
    if (m.capteur && CAPTEURS[m.capteur]) {
      const calc = anglesDeChamp(CAPTEURS[m.capteur], m.focale || m.focaleMin).horizontal;
      assert.ok(c.angleLarge >= calc - 2,
        `${ou} : ${c.angleLarge}° annoncés sous les ${calc.toFixed(1)}° du calcul`);
      assert.ok(c.angleLarge <= calc * 1.6,
        `${ou} : ${c.angleLarge}° annoncés, très au-delà des ${calc.toFixed(1)}° calculés`);
    }
  }
});

/*
 * `catalogue.json` part en ligne tel quel : une faute de frappe y serait
 * visible par les visiteurs avant de l'être par nous.
 */
test('le catalogue livré tient debout', async () => {
  const { readFileSync } = await import('node:fs');
  const cat = JSON.parse(readFileSync(
    new URL('../catalogue.json', import.meta.url), 'utf8',
  ));
  const produits = produitsAffichables(cat);
  assert.ok(produits.length >= 8, `${produits.length} produits`);

  for (const p of produits) {
    const c = capacites(p);
    assert.ok(c, `${p.reference} : optique inexploitable`);
    assert.equal(c.angleCalcule, false,
      `${p.reference} : l'angle doit venir du constructeur`);
    assert.ok(p._source, `${p.reference} : une caractéristique sans source ne vaut rien`);
    // Aucun prix ne doit partir en ligne sans avoir été relevé chez nous.
    assert.equal(p.prixTtc, undefined, `${p.reference} : prix non relevé`);

    /*
     * Aucune distance invraisemblable ne doit partir sur une page client.
     * 300 m est déjà généreux pour une promesse de reconnaissance : au-delà,
     * ce sont l'éclairage et l'air qui décident, plus les pixels.
     */
    assert.ok(c.porteesTenues.reconnaissance <= 300,
      `${p.reference} : ${c.porteesTenues.reconnaissance} m annoncés en reconnaissance`);
    if (p.type === 'ptz') {
      assert.ok(p.porteeMax > 0,
        `${p.reference} : une caméra mobile doit porter sa limite d'éclairage`);
    }
  }
  assert.deepEqual(reservesCatalogue(cat), [],
    'le catalogue livré ne doit porter aucune réserve');
});
