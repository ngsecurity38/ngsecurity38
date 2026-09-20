/**
 * Tests du chiffrage et du devis.
 * Exécution : node --test tests/prix.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TVA_DEFAUT, MARGE_COMMERCIALE, PROVENANCES,
  htDepuisTtc, ttcDepuisHt, prixDepuisVentes, prixHt, provenancePrix,
  ligne, devis, reservesDevis, euros,
} from '../js/prix.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/* ------------------------------------------------------------------ TVA */

test('TVA : aller-retour hors taxes / toutes taxes', () => {
  assert.equal(TVA_DEFAUT, 0.2, 'taux normal en France');
  proche(htDepuisTtc(240), 200, 1e-9);
  proche(ttcDepuisHt(200), 240, 1e-9);
  proche(htDepuisTtc(ttcDepuisHt(137.42)), 137.42, 1e-9);
});

test('TVA : un taux réduit s\'applique aussi', () => {
  proche(htDepuisTtc(220, 0.1), 200, 1e-9);
});

/* ------------------------------------------------- prix tiré des ventes */

test('prix pratiqué : le chiffre d\'affaires divisé par les unités', () => {
  // Relevé réel : 1 434,00 € pour 6 unités du bullet Dahua 5 MP.
  proche(prixDepuisVentes('1434', 6), 239, 1e-9);
  proche(prixDepuisVentes('2 056,00', 2), 1028, 1e-9, 'décimale et espace à la française');
  proche(prixDepuisVentes('2 056,00 €', 2), 1028, 1e-9, 'symbole monétaire compris');
  proche(prixDepuisVentes('1\u202f434,00 €', 6), 239, 1e-9, 'espace fine insécable');
});

test('prix pratiqué : sans vente, aucun prix n\'est déduit', () => {
  assert.equal(prixDepuisVentes(0, 5), null);
  assert.equal(prixDepuisVentes(500, 0), null, 'diviser par zéro unité n\'a pas de sens');
  assert.equal(prixDepuisVentes('', ''), null);
});

/* -------------------------------------------------------- prix hors taxes */

test('prix : un prix TTC est ramené hors taxes, un prix HT est pris tel quel', () => {
  proche(prixHt({ prixAchat: 240, achatTtc: true }), 200, 1e-9);
  proche(prixHt({ prixAchat: 200 }), 200, 1e-9);
  assert.equal(prixHt({ prixAchat: 0 }), 0);
  assert.equal(prixHt(null), 0);
});

test('prix : achat et vente ne se confondent pas', () => {
  const a = { prixAchat: 200, prixVente: 300 };
  proche(prixHt(a, 'prixAchat'), 200, 1e-9);
  proche(prixHt(a, 'prixVente'), 300, 1e-9);
  assert.equal(prixHt({ prixAchat: 200 }, 'prixVente'), 0, 'aucun prix de vente connu');
});

test('prix : un article peut porter son propre taux', () => {
  proche(prixHt({ prixAchat: 220, achatTtc: true, tva: 0.1 }), 200, 1e-9);
});

/* ------------------------------------------------------------ provenance */

test('provenance : ce qu\'on sait du prix, et ce qu\'on n\'en sait pas', () => {
  assert.equal(provenancePrix({ prixAchat: 0 }), 'aucune');
  assert.equal(provenancePrix({ prixVente: 239, sourceVente: { type: 'vendu' } }), 'vendu');
  assert.equal(provenancePrix({ prixAchat: 214, sourceAchat: { type: 'releve' } }), 'releve');
  assert.equal(provenancePrix({ prixAchat: 100 }), 'saisi', 'un prix sans source est le vôtre');
  assert.equal(provenancePrix({ prixAchat: 100, sourceAchat: { type: 'x' } }), 'saisi');
  assert.equal(
    provenancePrix({ prixAchat: 200, sourceAchat: { type: 'releve' }, prixVente: 300, sourceVente: { type: 'vendu' } }),
    'vendu', 'le prix de vente l\'emporte, et sa provenance avec lui',
  );
});

test('chaque provenance a son étiquette et sa pastille', () => {
  for (const [cle, p] of Object.entries(PROVENANCES)) {
    assert.ok(p.label, `${cle} sans étiquette`);
    assert.ok(p.marque.length <= 2, `${cle} : pastille trop longue`);
  }
});

/* ------------------------------------------------------------- une ligne */

test('ligne : la marge s\'applique au prix d\'achat', () => {
  const l = ligne({ prixAchat: 200, sourceAchat: { type: 'saisi' } }, 3, { marge: 0.25 });
  proche(l.achatHt, 200, 1e-9);
  proche(l.venteHt, 250, 1e-9);
  proche(l.totalHt, 750, 1e-9);
  assert.equal(l.quantite, 3);
  assert.equal(MARGE_COMMERCIALE, 0.25);
});

test('ligne : un prix de vente pratiqué ne se voit pas remarger', () => {
  // 239 € TTC réellement pratiqués font 199,17 € HT — et c'est ce qu'on
  // facture, pas une base sur laquelle rajouter 25 %.
  const l = ligne({ prixVente: 239, venteTtc: true, sourceVente: { type: 'vendu' } }, 1);
  proche(l.venteHt, 199.1667, 1e-3);
  assert.equal(l.achatHt, 0, 'le coût d\'achat reste inconnu');
  assert.equal(l.margeReelle, null, 'et la marge avec lui');
});

test('ligne : la marge réelle se calcule quand les deux prix sont connus', () => {
  const l = ligne({ prixAchat: 200, prixVente: 260 }, 1);
  proche(l.margeReelle, 0.3, 1e-9);
});

test('ligne : une quantité négative ne crédite personne', () => {
  assert.equal(ligne({ prixAchat: 100 }, -4).totalHt, 0);
});

/* ---------------------------------------------------------------- devis */

test('devis : matériel, remise, main-d\'œuvre, TVA', () => {
  const lignes = [
    ligne({ prixAchat: 200, sourceAchat: { type: 'saisi' } }, 4, { marge: 0.25 }), // 1 000 HT
    ligne({ prixAchat: 100, sourceAchat: { type: 'saisi' } }, 2, { marge: 0.25 }), //   250 HT
  ];
  const d = devis(lignes, { heures: 8, tauxHoraire: 55, remise: 0.1 });

  proche(d.materielBrut, 1250, 1e-9);
  proche(d.montantRemise, 125, 1e-9);
  proche(d.materielHt, 1125, 1e-9);
  proche(d.mainOeuvreHt, 440, 1e-9);
  proche(d.totalHt, 1565, 1e-9);
  proche(d.montantTva, 313, 1e-9);
  proche(d.totalTtc, 1878, 1e-9);
  assert.equal(d.complet, true);
});

test('devis : une remise aberrante est ramenée dans les clous', () => {
  const l = [ligne({ prixAchat: 100, sourceAchat: { type: 'saisi' } }, 1, { marge: 0 })];
  proche(devis(l, { remise: 3 }).materielHt, 0, 1e-9, 'pas de remise au-delà de 100 %');
  proche(devis(l, { remise: -1 }).materielHt, 100, 1e-9, 'ni de remise négative');
});

test('devis : une ligne sans prix rend le total incomplet', () => {
  const lignes = [
    ligne({ prixAchat: 200, reference: 'CAM-A', sourceAchat: { type: 'saisi' } }, 1),
    ligne({ prixAchat: 0, reference: 'NVR-B' }, 1),
  ];
  const d = devis(lignes);
  assert.equal(d.complet, false);
  assert.equal(d.sansPrix.length, 1);
  assert.match(reservesDevis(d)[0], /NVR-B/);
  assert.match(reservesDevis(d)[0], /incomplet/);
});

test('devis : un prix relevé est signalé avec sa date', () => {
  const lignes = [
    ligne({ prixAchat: 214.57, reference: 'CAM-A', sourceAchat: { type: 'releve', date: '20/09/2026' } }, 2),
  ];
  const d = devis(lignes);
  assert.equal(d.complet, true, 'le prix existe : le devis est chiffrable');
  assert.equal(d.releves.length, 1);
  const r = reservesDevis(d).join(' ');
  assert.match(r, /20\/09\/2026/);
  assert.match(r, /à confirmer auprès du distributeur/);
});

test('devis : rien à reprocher quand tout est pratiqué et chiffré', () => {
  const lignes = [ligne({ prixVente: 239, venteTtc: true, sourceVente: { type: 'vendu' } }, 1)];
  assert.deepEqual(reservesDevis(devis(lignes)), []);
});

test('devis : un devis vide ne fabrique pas de montants', () => {
  const d = devis([]);
  assert.equal(d.totalHt, 0);
  assert.equal(d.totalTtc, 0);
  assert.equal(d.complet, true);
  assert.deepEqual(reservesDevis(d), []);
  assert.equal(devis(null).totalHt, 0);
});

test('devis : la main-d\'œuvre seule se chiffre aussi', () => {
  const d = devis([], { heures: 6, tauxHoraire: 50 });
  proche(d.mainOeuvreHt, 300, 1e-9);
  proche(d.totalTtc, 360, 1e-9);
});

/* ---------------------------------------------------------------- format */

test('montants : deux décimales et virgule française', () => {
  assert.equal(euros(1234.5), '1234,5 €');
  assert.equal(euros(0), '0 €');
});
