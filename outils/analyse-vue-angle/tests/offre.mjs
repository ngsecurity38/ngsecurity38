/**
 * Tests de la composition automatique d'une installation.
 * Exécution : node --test tests/offre.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TYPES_SITE, POSE_DEFAUT, RESERVES, composer } from '../js/offre.js';

/** Tarif d'essai : deux caméras, trois switches, deux NVR, trois disques. */
const TARIF = [
  { type: 'camera', reference: 'CAM éco', prixAchat: 150, debit: 4, resH: 2560, resV: 1440 },
  { type: 'camera', reference: 'CAM 4K', prixAchat: 260, debit: 8, resH: 3840, resV: 2160 },
  { type: 'switch', reference: 'SW 5', prixAchat: 60, ports: 5, portsPoe: 4 },
  { type: 'switch', reference: 'SW 10', prixAchat: 90, ports: 10, portsPoe: 8 },
  { type: 'switch', reference: 'SW 18', prixAchat: 220, ports: 18, portsPoe: 16 },
  { type: 'nvr', reference: 'NVR 4', prixAchat: 180, canaux: 4 },
  { type: 'nvr', reference: 'NVR 8', prixAchat: 240, canaux: 8 },
  { type: 'disque', reference: 'HDD 2 To', prixAchat: 90, capacite: 2000 },
  { type: 'disque', reference: 'HDD 8 To', prixAchat: 190, capacite: 8000 },
  { type: 'disque', reference: 'HDD 16 To', prixAchat: 330, capacite: 16000 },
  { type: 'ecran', reference: 'Écran 24"', prixAchat: 130 },
];

const roles = (o) => Object.fromEntries(o.lignes.map((l) => [l.role, l]));

test('les types de site proposent des valeurs de départ plausibles', () => {
  for (const [cle, t] of Object.entries(TYPES_SITE)) {
    assert.ok(t.label, `${cle} sans étiquette`);
    assert.ok(['un', 'une'].includes(t.article), `${cle} : article « ${t.article} »`);
    assert.ok(t.zones >= 1 && t.zones <= 12, `${cle} : ${t.zones} zones`);
    assert.ok([7, 15, 30, 45, 60, 90].includes(t.jours), `${cle} : ${t.jours} jours`);
  }
});

test('trois caméras : le switch, l\'enregistreur et le disque suivent', () => {
  const o = composer({ typeSite: 'maison', zones: 3, jours: 15 }, TARIF);
  const r = roles(o);

  assert.equal(o.cameras, 3);
  assert.equal(r['Caméras'].article.reference, 'CAM éco', 'la moins chère du tarif');
  assert.equal(r['Caméras'].quantite, 3);
  // 3 caméras + 1 uplink = 4 ports, dont 3 PoE : le SW 5 suffit.
  assert.equal(r['Switch PoE'].article.reference, 'SW 5');
  assert.equal(r['Enregistreur'].article.reference, 'NVR 4');
  assert.equal(o.manques.length, 0, JSON.stringify(o.manques));
});

test('le switch réserve un port pour l\'enregistreur', () => {
  // Quatre caméras : 4 PoE, mais 5 ports au total — le SW 5 y suffit tout juste.
  const quatre = roles(composer({ zones: 4, jours: 15 }, TARIF));
  assert.equal(quatre['Switch PoE'].article.reference, 'SW 5');

  // Cinq caméras : il faudrait 6 ports, le SW 5 est écarté.
  const cinq = roles(composer({ zones: 5, jours: 15 }, TARIF));
  assert.equal(cinq['Switch PoE'].article.reference, 'SW 10');
});

test('le disque est dimensionné sur la durée demandée', () => {
  const court = composer({ zones: 3, jours: 7 }, TARIF);
  const long = composer({ zones: 3, jours: 60 }, TARIF);
  assert.ok(long.capaciteGo > court.capaciteGo, 'garder plus longtemps coûte plus de disque');
  assert.equal(roles(court)['Disque de surveillance'].article.reference, 'HDD 2 To');
  assert.equal(roles(long)['Disque de surveillance'].article.reference, 'HDD 16 To');
});

test('une plage horaire réduite réduit le disque', () => {
  const plein = composer({ zones: 4, jours: 30 }, TARIF);
  const partiel = composer({ zones: 4, jours: 30, heuresParJour: 12 }, TARIF);
  assert.ok(partiel.capaciteGo < plein.capaciteGo);
});

test('l\'écran n\'est ajouté que s\'il est demandé', () => {
  assert.ok(!roles(composer({ zones: 2, jours: 15 }, TARIF))['Écran de supervision']);
  assert.ok(roles(composer({ zones: 2, jours: 15, ecran: true }, TARIF))['Écran de supervision']);
});

test('la pose se chiffre en heures, et peut être écartée', () => {
  const o = composer({ zones: 4, jours: 15 }, TARIF);
  assert.equal(o.heures, POSE_DEFAUT.base + POSE_DEFAUT.parCamera * 4);
  assert.equal(composer({ zones: 4, jours: 15, pose: false }, TARIF).heures, 0);
  assert.equal(
    composer({ zones: 2, jours: 15 }, TARIF, { pose: { base: 2, parCamera: 1 } }).heures, 4,
  );
});

test('ce qui manque au tarif est dit, et rien n\'est inventé', () => {
  // Vingt caméras : aucun switch ni enregistreur du tarif n'y suffit.
  const o = composer({ zones: 20, jours: 30 }, TARIF);
  assert.equal(roles(o)['Caméras'].quantite, 20);
  assert.ok(!roles(o)['Switch PoE'], 'aucun switch ne doit être proposé au hasard');
  assert.ok(!roles(o)['Enregistreur']);
  assert.ok(o.manques.some((m) => /20 ports PoE/.test(m)), JSON.stringify(o.manques));
  assert.ok(o.manques.some((m) => /20 canaux/.test(m)), JSON.stringify(o.manques));
  assert.ok(o.manques.some((m) => /disque/.test(m)), JSON.stringify(o.manques));
});

test('un tarif vide ne compose rien et le dit', () => {
  const o = composer({ zones: 3, jours: 30 }, []);
  assert.equal(o.lignes.length, 0);
  assert.equal(o.manques.length, 4, JSON.stringify(o.manques));
  assert.ok(o.manques.every((m) => /Aucun/.test(m)));
});

test('un article sans prix n\'est jamais retenu', () => {
  const tarif = [
    { type: 'camera', reference: 'CAM sans prix', debit: 4 },
    { type: 'camera', reference: 'CAM chiffrée', prixAchat: 300, debit: 4 },
  ];
  const o = composer({ zones: 2, jours: 15 }, tarif);
  assert.equal(roles(o)['Caméras'].article.reference, 'CAM chiffrée');
});

test('le prix de vente l\'emporte sur l\'achat pour classer les articles', () => {
  const tarif = [
    { type: 'camera', reference: 'A', prixAchat: 100, prixVente: 400, debit: 4 },
    { type: 'camera', reference: 'B', prixAchat: 200, prixVente: 250, debit: 4 },
  ];
  assert.equal(roles(composer({ zones: 1, jours: 15 }, tarif))['Caméras'].article.reference, 'B');
});

test('des réponses absurdes sont ramenées dans les clous', () => {
  const o = composer({ typeSite: 'inconnu', zones: -5, jours: 0, heuresParJour: 99 }, TARIF);
  assert.equal(o.cameras, 1, 'au moins une caméra');
  assert.equal(o.jours, 1, 'au moins un jour');
  assert.equal(o.heuresParJour, 24, 'pas plus de vingt-quatre heures par jour');
});

test('sans réponse, les valeurs du type de site servent de départ', () => {
  const o = composer({ typeSite: 'entrepot' }, TARIF);
  assert.equal(o.cameras, TYPES_SITE.entrepot.zones);
  assert.equal(o.jours, TYPES_SITE.entrepot.jours);
});

test('les réserves disent ce qu\'une configuration à distance ne sait pas', () => {
  assert.ok(RESERVES.length >= 3);
  assert.ok(RESERVES.some((r) => /sans visite du site/.test(r)));
  assert.ok(RESERVES.some((r) => /angles de vue|obstacles/.test(r)));
});
