/**
 * Tests du facturier.
 *
 * Trois choses ne se rattrapent pas : un numéro en double, une TVA fausse,
 * un chiffre d'affaires qui compte des brouillons. Ce sont elles qu'on
 * verrouille ici.
 *
 * Exécution : node --test tests/facture.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ficheFacture } from '../js/facture-fiche.js';
import {
  prochainNumero, totauxFacture, echeance, retard, penalites,
  echeancesContrat, aFacturer, journal, mentionsManquantes, coordonneesBancaires,
  fusionnerAgence, lienPaiement, remiseFacture,
  INDEMNITE_RECOUVREMENT, PENALITE_MULTIPLE,
} from '../js/facture.js';

const ici = dirname(fileURLToPath(import.meta.url));
const AGENCE = JSON.parse(readFileSync(join(ici, '..', '..', '..', 'agence.json'), 'utf8'));

const ligne = (q, pu, tva = 0.2, remise = 0) => ({
  designation: 'x', quantite: q, prixUnitaire: pu, tva, remise,
});

/* --------------------------------------------------------- la numérotation */

test('le numéro suit le plus grand pris, pas le nombre de factures', () => {
  /*
   * Compter les factures au lieu de lire le dernier numéro rattribue un
   * numéro déjà émis dès qu'une facture est annulée. C'est la première
   * chose que l'administration regarde.
   */
  const f = [{ numero: 'F2026-001' }, { numero: 'F2026-002' }, { numero: 'F2026-003' }];
  assert.equal(prochainNumero(f, 2026), 'F2026-004');
  const avecTrou = [{ numero: 'F2026-001' }, { numero: 'F2026-003' }];
  assert.equal(prochainNumero(avecTrou, 2026), 'F2026-004', 'on ne rebouche pas un trou');
});

test('chaque année repart à un, sans croiser les autres', () => {
  const f = [{ numero: 'F2025-017' }, { numero: 'F2026-002' }];
  assert.equal(prochainNumero(f, 2026), 'F2026-003');
  assert.equal(prochainNumero(f, 2027), 'F2027-001');
  assert.equal(prochainNumero([], 2026), 'F2026-001');
});

test('un avoir a sa propre suite, il ne prend pas un numéro de facture', () => {
  const f = [{ numero: 'F2026-001' }, { numero: 'A2026-001' }];
  assert.equal(prochainNumero(f, 2026, 'A'), 'A2026-002');
  assert.equal(prochainNumero(f, 2026, 'F'), 'F2026-002');
});

/* --------------------------------------------------------------- la TVA */

test('la TVA se compte par taux, jamais en bloc', () => {
  // 20 % sur le matériel, 10 % sur la pose : additionner un seul taux serait
  // faux dès la première facture mixte.
  const t = totauxFacture({ lignes: [ligne(2, 100, 0.2), ligne(1, 500, 0.1)] });
  assert.equal(t.ht, 700);
  assert.deepEqual(t.tvas, [
    { taux: 0.1, base: 500, montant: 50 },
    { taux: 0.2, base: 200, montant: 40 },
  ]);
  assert.equal(t.tva, 90);
  assert.equal(t.ttc, 790);
});

test('une remise de ligne s\'applique avant la TVA', () => {
  const t = totauxFacture({ lignes: [ligne(1, 100, 0.2, 0.1)] });
  assert.equal(t.ht, 90);
  assert.equal(t.tva, 18);
});

test('l\'acompte se déduit du net à payer, pas du chiffre d\'affaires', () => {
  const f = { lignes: [ligne(1, 1000, 0.2)], acompte: 400 };
  const t = totauxFacture(f);
  assert.equal(t.ttc, 1200);
  assert.equal(t.netAPayer, 800);
  assert.equal(t.ht, 1000, 'le HT reste celui de la prestation');
});

test('les centimes ne dérivent pas sur une longue facture', () => {
  const lignes = Array.from({ length: 30 }, () => ligne(3, 19.99, 0.2));
  const t = totauxFacture({ lignes });
  assert.equal(t.ht, 1799.1);
  assert.equal(t.tva, 359.82);
  assert.equal(t.ttc, 2158.92);
});

/* ------------------------------------------------------- les échéances */

test('l\'échéance se compte sur l\'émission, pas sur aujourd\'hui', () => {
  assert.equal(echeance('2026-09-24', 30), '2026-10-24');
  assert.equal(echeance('2026-01-31', 30), '2026-03-02');
  assert.equal(echeance('pas une date', 30), null);
});

test('le retard ne court que sur une facture émise', () => {
  const f = { etat: 'emise', date: '2026-08-01', echeance: '2026-08-31' };
  assert.equal(retard(f, '2026-09-24'), 24);
  assert.equal(retard(f, '2026-08-20'), 0, 'avant l\'échéance, pas de retard');
  assert.equal(retard({ ...f, etat: 'payee' }, '2026-09-24'), 0);
  assert.equal(retard({ ...f, etat: 'brouillon' }, '2026-09-24'), 0);
});

test('les pénalités courent au prorata du taux légal, pas de trois cents pour cent', () => {
  /*
   * Le taux de pénalité est un MULTIPLE du taux d'intérêt légal. Le prendre
   * pour un pourcentage donnait « 300 % l'an » sur la facture, et des
   * intérêts vingt fois trop élevés.
   */
  const f = {
    etat: 'emise', date: '2026-08-01', echeance: '2026-08-31',
    lignes: [ligne(1, 1000, 0.2)],
  };
  const TAUX_LEGAL = 0.0526;
  const p = penalites(f, '2026-09-30', TAUX_LEGAL);
  assert.equal(p.jours, 30);
  assert.equal(p.taux, TAUX_LEGAL * PENALITE_MULTIPLE);
  assert.equal(p.indemnite, INDEMNITE_RECOUVREMENT);
  // 1 200 € x 15,78 % x 30/365
  assert.equal(p.interets, 15.56);
  assert.equal(p.total, 55.56);
  assert.equal(penalites({ ...f, etat: 'payee' }, '2026-09-30').total, 0);
});

test('sans le taux légal, on ne chiffre que l\'indemnité', () => {
  const f = {
    etat: 'emise', date: '2026-08-01', echeance: '2026-08-31',
    lignes: [ligne(1, 1000, 0.2)],
  };
  const p = penalites(f, '2026-09-30');
  assert.equal(p.interets, null, 'un intérêt inventé serait pire que pas d\'intérêt');
  assert.equal(p.total, INDEMNITE_RECOUVREMENT);
});

test('la facture n\'annonce jamais un taux en pourcentage', () => {
  const html = ficheFacture({
    numero: 'F2026-001', date: '2026-09-24', etat: 'emise',
    client: { nom: 'X' }, lignes: [ligne(1, 100)],
  }, AGENCE);
  assert.ok(!/300\s*%/.test(html), 'le multiple n\'est pas un pourcentage');
  assert.ok(/3 fois le taux\s+d'intérêt légal/.test(html));
});

/* ------------------------------------------------------- la maintenance */

test('un contrat annuel produit une échéance par an, à date fixe', () => {
  const c = { cle: 'C1', debut: '2027-06-01', periode: 'annuelle', montantHt: 480 };
  const e = echeancesContrat(c, '2029-07-01');
  assert.deepEqual(e.map((x) => x.date), ['2027-06-01', '2028-06-01', '2029-06-01']);
  assert.ok(e.every((x) => x.montantHt === 480));
});

test('le 31 d\'un mois court recule au dernier jour, il ne déborde pas', () => {
  const c = { cle: 'C1', debut: '2027-01-31', periode: 'mensuelle', montantHt: 40 };
  const e = echeancesContrat(c, '2027-04-30').map((x) => x.date);
  assert.deepEqual(e, ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
});

test('un contrat arrêté cesse de produire des échéances', () => {
  const c = {
    cle: 'C1', debut: '2027-06-01', fin: '2028-06-30',
    periode: 'annuelle', montantHt: 480,
  };
  assert.equal(echeancesContrat(c, '2030-01-01').length, 2);
});

test('ce qui est déjà facturé ne se refacture pas', () => {
  const c = { cle: 'C1', debut: '2027-06-01', periode: 'annuelle', montantHt: 480 };
  const factures = [
    { contrat: 'C1', periodeDebut: '2027-06-01', etat: 'payee' },
    { contrat: 'C1', periodeDebut: '2028-06-01', etat: 'annulee' },
  ];
  const reste = aFacturer(c, factures, '2029-07-01').map((x) => x.date);
  assert.deepEqual(reste, ['2028-06-01', '2029-06-01'],
    'une facture annulée laisse son échéance à refaire');
});

/* ------------------------------------------------------- la comptabilité */

const JEU = {
  factures: [
    { numero: 'F2026-001', date: '2026-07-10', etat: 'payee', lignes: [ligne(1, 1000)] },
    { numero: 'F2026-002', date: '2026-08-01', etat: 'emise', echeance: '2026-08-31', lignes: [ligne(1, 500)] },
    { numero: 'F2026-003', date: '2026-09-20', etat: 'emise', echeance: '2026-10-20', lignes: [ligne(1, 200)] },
    { numero: 'F2026-004', date: '2026-09-21', etat: 'brouillon', lignes: [ligne(1, 9999)] },
    { numero: 'F2026-005', date: '2026-09-22', etat: 'annulee', lignes: [ligne(1, 300)] },
  ],
};

test('un brouillon n\'entre ni dans le chiffre d\'affaires ni dans l\'attendu', () => {
  const j = journal(JEU, '2026-09-24');
  assert.equal(j.emises, 3);
  assert.equal(j.caHt, 1700, 'le brouillon de 9 999 € est dehors');
  assert.equal(j.annulees, 1);
});

test('le journal sépare l\'encaissé, l\'attendu et le retard', () => {
  const j = journal(JEU, '2026-09-24');
  assert.equal(j.encaisse, 1200);
  assert.equal(j.attendu, 840, '500 et 200 en TTC restent dus');
  assert.equal(j.enRetard.nombre, 1);
  assert.equal(j.enRetard.montant, 600);
  assert.equal(j.enRetard.factures[0].numero, 'F2026-002');
  assert.equal(j.enRetard.factures[0].jours, 24);
});

test('la TVA collectée est celle des factures émises', () => {
  assert.equal(journal(JEU, '2026-09-24').tvaCollectee, 340);
});

test('une facture annulée et son avoir se neutralisent', () => {
  // Retirer la facture sans retirer l'avoir amputerait le chiffre d'affaires
  // deux fois : une fois par la facture qui s'en va, une fois par l'avoir
  // resté seul, en négatif.
  const livre = {
    factures: [
      { numero: 'F1', date: '2026-08-02', etat: 'annulee', lignes: [ligne(1, 400)] },
      {
        numero: 'A1', date: '2026-08-03', etat: 'emise', type: 'avoir', annule: 'F1',
        lignes: [ligne(-1, 400)],
      },
      { numero: 'F2', date: '2026-08-04', etat: 'payee', lignes: [ligne(1, 1000)] },
    ],
  };
  const j = journal(livre, '2026-09-24');
  assert.equal(j.caHt, 1000);
  assert.equal(j.attendu, 0, 'l\'avoir n\'est pas une créance en attente');
  assert.equal(j.emises, 1);
});

test('un avoir qui n\'annule rien diminue bien le chiffre d\'affaires', () => {
  // Un geste commercial n'a pas de facture annulée en face : il compte.
  const livre = {
    factures: [
      { numero: 'F2', date: '2026-08-04', etat: 'payee', lignes: [ligne(1, 1000)] },
      {
        numero: 'A2', date: '2026-08-10', etat: 'emise', type: 'avoir',
        lignes: [ligne(-1, 150)],
      },
    ],
  };
  assert.equal(journal(livre, '2026-09-24').caHt, 850);
});

test('les totaux se regroupent par mois et par trimestre', () => {
  const j = journal(JEU, '2026-09-24');
  assert.deepEqual(j.parMois.map((m) => m.periode), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(j.parTrimestre.map((t) => t.periode), ['2026-T3']);
  assert.equal(j.parTrimestre[0].ht, 1700);
  assert.equal(j.parTrimestre[0].factures, 3);
});

/* ------------------------------------------------------------- la remise */

const l = (q, pu, tva = 0.2, remise) => ({ quantite: q, prixUnitaire: pu, tva, remise });

test('une remise s\'exprime en taux ou en euros, et donne les deux', () => {
  const brut = 1000;
  assert.deepEqual(remiseFacture({ remise: { type: 'taux', valeur: 0.1 } }, brut),
    { type: 'taux', taux: 0.1, montant: 100, libelle: 'Remise' });
  const m = remiseFacture({ remise: { type: 'montant', valeur: 150 } }, brut);
  assert.equal(m.montant, 150);
  assert.equal(m.taux, 0.15, 'le taux réel se déduit du montant');
});

test('une remise ne dépasse pas ce qu\'elle réduit', () => {
  // À 120 % d'une facture, on ne doit pas de l'argent au client : on s'est
  // trompé de champ.
  const r = remiseFacture({ remise: { type: 'montant', valeur: 5000 } }, 1000);
  assert.equal(r.montant, 1000);
  assert.equal(totauxFacture({ lignes: [l(1, 1000)], remise: { type: 'montant', valeur: 5000 } })
    .netAPayer, 0);
});

test('une remise absente ou nulle ne change rien', () => {
  assert.equal(remiseFacture({}, 1000), null);
  assert.equal(remiseFacture({ remise: { type: 'taux', valeur: 0 } }, 1000), null);
  assert.equal(totauxFacture({ lignes: [l(1, 100)] }).remise, null);
});

test('la remise se répartit sur les taux, pas sur le total', () => {
  /*
   * La retrancher du seul total fausserait la TVA de chaque taux — et c'est
   * la TVA par taux qui est déclarée.
   */
  const t = totauxFacture({
    lignes: [l(1, 1000, 0.2), l(1, 1000, 0.1)],
    remise: { type: 'taux', valeur: 0.1 },
  });
  assert.equal(t.brut, 2000);
  assert.equal(t.ht, 1800);
  assert.deepEqual(t.tvas.map((x) => x.base), [900, 900]);
  assert.deepEqual(t.tvas.map((x) => x.montant), [90, 180]);
  assert.equal(t.tva, 270);
  assert.equal(t.ttc, 2070);
});

test('le centime perdu au prorata retombe sur ses pieds', () => {
  /*
   * 183,33 € remisés de 33,33 % sur trois taux laissent un centime en l'air.
   * La somme des bases doit rester égale au total hors taxes, sans quoi la
   * déclaration de TVA et la facture ne diront pas la même chose.
   */
  const t = totauxFacture({
    lignes: [l(1, 100, 0.2), l(1, 50, 0.1), l(1, 33.33, 0.055)],
    remise: { type: 'taux', valeur: 0.3333 },
  });
  const somme = Math.round(t.tvas.reduce((s, x) => s + x.base, 0) * 100) / 100;
  assert.equal(somme, t.ht, `${somme} au lieu de ${t.ht}`);
});

test('une remise de ligne et une remise globale se cumulent', () => {
  // 100 moins 10 % = 90 sur la ligne, puis moins 50 % = 45.
  const t = totauxFacture({
    lignes: [l(1, 100, 0.2, 0.1)],
    remise: { type: 'taux', valeur: 0.5 },
  });
  assert.equal(t.brut, 90);
  assert.equal(t.ht, 45);
});

test('l\'intitulé de la remise est celui de l\'agence, ou « Remise »', () => {
  assert.equal(remiseFacture({ remise: { type: 'taux', valeur: 0.1, libelle: 'Geste commercial' } },
    100).libelle, 'Geste commercial');
  assert.equal(remiseFacture({ remise: { type: 'taux', valeur: 0.1, libelle: '  ' } },
    100).libelle, 'Remise');
});

/* ------------------------------------------------- l'identité de l'agence */

test('ce que l\'agence saisit l\'emporte, un champ vide n\'efface rien', () => {
  const page = {
    siret: '104 732 458 00013', tva: 'FR30',
    banque: { iban: 'FR76 AAA', bic: 'BBB' },
    paiements: ['virement'],
  };
  const saisie = {
    siret: '', lienPaiement: 'paypal.me/x',
    banque: { iban: 'FR76 ZZZ' },
    paiements: [],
  };
  const a = fusionnerAgence(page, saisie);
  assert.equal(a.siret, '104 732 458 00013', 'un champ laissé vide n\'efface pas le dépôt');
  assert.equal(a.lienPaiement, 'paypal.me/x');
  assert.equal(a.banque.iban, 'FR76 ZZZ', 'le compte saisi l\'emporte');
  assert.equal(a.banque.bic, 'BBB', 'et le BIC du dépôt reste : les sous-ensembles se fondent');
  assert.deepEqual(a.paiements, ['virement'], 'une liste vide ne remplace pas');
});

test('l\'agence peut renseigner ce qui manquait à ses factures', () => {
  const a = fusionnerAgence({ siret: '1', tva: '2' },
    { aCompleter: { capitalSocial: '2 000 €', rcsGreffe: 'Sens', assuranceRcPro: 'AXA' } });
  assert.deepEqual(mentionsManquantes(a), []);
});

test('le lien de paiement accepte une adresse, et rien d\'autre', () => {
  assert.deepEqual(lienPaiement({ lienPaiement: 'paypal.me/ngs38' }),
    { href: 'https://paypal.me/ngs38', texte: 'paypal.me/ngs38' });
  // Le client recopie du papier : on lui épargne le « https:// ».
  assert.equal(lienPaiement({ lienPaiement: 'https://buy.stripe.com/a/' }).texte,
    'buy.stripe.com/a');
  // Une facture ne doit pas porter un lien qui fasse autre chose qu'ouvrir une page.
  for (const mauvais of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a/b', '  ']) {
    assert.equal(lienPaiement({ lienPaiement: mauvais }), null, mauvais);
  }
  assert.equal(lienPaiement({}), null);
});

test('la facture peut porter son propre lien', () => {
  // Un chantier réglé par un lien dédié : la facture l'emporte.
  assert.equal(lienPaiement({ lienPaiement: 'paypal.me/agence' },
    { lienPaiement: 'buy.stripe.com/chantier' }).texte, 'buy.stripe.com/chantier');
});

/* ------------------------------------------------ les mentions obligatoires */

test('l\'IBAN vient de l\'agence, la facture peut le remplacer', () => {
  const agence = { banque: { iban: 'FR76 1111', bic: 'AAAAFRPP' } };
  assert.deepEqual(coordonneesBancaires(agence, {}),
    { iban: 'FR76 1111', bic: 'AAAAFRPP' });
  // Un chantier réglé sur un compte dédié : la facture l'emporte.
  assert.equal(coordonneesBancaires(agence, { iban: 'FR76 2222' }).iban, 'FR76 2222');
  // Rien nulle part : on ne fabrique pas un IBAN, on rend du vide.
  assert.deepEqual(coordonneesBancaires({}, {}), { iban: '', bic: '' });
});


test('l\'outil réclame ce qui manque à une facture de SAS', () => {
  const manque = mentionsManquantes(AGENCE);
  // Tant que l'agence ne les a pas donnés, la facture est irrégulière et
  // doit le dire — plutôt que de sortir propre et fausse.
  assert.ok(manque.includes('le capital social'));
  assert.ok(manque.includes('la ville du greffe du RCS'));
  assert.ok(!manque.includes('le SIRET'), 'le SIRET, lui, est renseigné');
});

test('une identité complète ne manque de rien', () => {
  const complet = {
    siret: '1', tva: '2',
    aCompleter: { capitalSocial: '1 000 €', rcsGreffe: 'Sens', assuranceRcPro: 'X' },
  };
  assert.deepEqual(mentionsManquantes(complet), []);
});
