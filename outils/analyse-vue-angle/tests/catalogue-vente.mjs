/**
 * Tests du catalogue de facturation.
 * Exécution : node --test tests/catalogue.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assainirCatalogue, prixVente, articlesSansPrix, chercher, ligneDepuisArticle,
} from '../js/catalogue-vente.js';

const ici = dirname(fileURLToPath(import.meta.url));
const FICHIER = JSON.parse(readFileSync(join(ici, '..', 'catalogue-facturation.json'), 'utf8'));

const CAT = {
  remise: 0.1,
  tva: 0.2,
  familles: { video: 'Vidéosurveillance', service: 'Main-d\'œuvre' },
  articles: [
    {
      cle: 'cam', famille: 'video', unite: 'u',
      designation: 'Caméra panoramique 180°', reference: 'DS-2CD2346G2P-ISU/SL',
      marche: 184.06,
    },
    {
      cle: 'heure', famille: 'service', unite: 'h',
      designation: 'Main-d\'œuvre', prixVente: 73.81,
    },
    { cle: 'route', famille: 'service', unite: 'u', designation: 'Déplacement', marche: null },
  ],
};

/* ------------------------------------------------------------- les prix */

test('la remise de l\'agence s\'applique au prix de marché', () => {
  // 184,06 - 10 % = 165,65 : le prix porté au devis GO FORMATION.
  assert.equal(prixVente(CAT.articles[0], 0.1), 165.65);
});

test('un prix de vente renseigné ne subit pas la remise', () => {
  // Un taux horaire n'est pas un prix catalogue : il ne se remise pas.
  assert.equal(prixVente(CAT.articles[1], 0.1), 73.81);
});

test('un article non chiffré vaut null, jamais zéro', () => {
  /*
   * `Number(null)` vaut 0. Sans garde, un prix laissé vide parce qu'il n'est
   * pas connu passerait pour un article gratuit, et la facture sortirait
   * juste en apparence.
   */
  assert.equal(prixVente(CAT.articles[2], 0.1), null);
  assert.equal(prixVente({ marche: null, prixVente: null }, 0.1), null);
  assert.equal(prixVente({}, 0.1), null);
  // Zéro reste zéro : une intervention sous garantie se facture à zéro euro.
  assert.equal(prixVente({ prixVente: 0 }, 0.1), 0);
});

test('l\'outil sait ce qu\'il reste à chiffrer', () => {
  const reste = articlesSansPrix(CAT).map((a) => a.cle);
  assert.deepEqual(reste, ['route']);
});

/* ------------------------------------------------------- la recherche */

test('la recherche ignore les accents et l\'ordre des mots', () => {
  assert.deepEqual(chercher(CAT, 'camera').map((a) => a.cle), ['cam']);
  assert.deepEqual(chercher(CAT, 'CAMÉRA').map((a) => a.cle), ['cam']);
  assert.deepEqual(chercher(CAT, 'panoramique camera').map((a) => a.cle), ['cam']);
  assert.deepEqual(chercher(CAT, 'deplacement').map((a) => a.cle), ['route']);
});

test('la recherche porte aussi sur la référence', () => {
  assert.deepEqual(chercher(CAT, '2346G2P').map((a) => a.cle), ['cam']);
});

test('une famille restreint la liste', () => {
  assert.deepEqual(chercher(CAT, '', 'service').map((a) => a.cle), ['heure', 'route']);
  assert.deepEqual(chercher(CAT, 'camera', 'service').map((a) => a.cle), []);
});

/* ------------------------------------------------------ la ligne posée */

test('une ligne reprend la désignation, la référence et le prix', () => {
  const l = ligneDepuisArticle(CAT.articles[0], CAT, 6);
  assert.equal(l.designation, 'Caméra panoramique 180°');
  assert.equal(l.detail, 'DS-2CD2346G2P-ISU/SL');
  assert.equal(l.quantite, 6);
  assert.equal(l.prixUnitaire, 165.65);
  assert.equal(l.tva, 0.2);
  assert.equal(l.aChiffrer, false);
});

test('une unité qui n\'est pas l\'unité se dit sur la ligne', () => {
  // « 20 » se discute, « 20 h à 73,81 € de l'heure » se relit.
  assert.match(ligneDepuisArticle(CAT.articles[1], CAT).detail, /heure/);
});

test('une ligne sans prix se pose quand même, et se signale', () => {
  const l = ligneDepuisArticle(CAT.articles[2], CAT);
  assert.equal(l.prixUnitaire, 0);
  assert.equal(l.aChiffrer, true, 'le montant reste dû, il ne doit pas passer pour zéro');
});

/* --------------------------------------------------- le fichier livré */

test('le catalogue de l\'agence se lit et porte ses familles', () => {
  const c = assainirCatalogue(FICHIER);
  assert.ok(c.articles.length > 30, `${c.articles.length} articles`);
  assert.equal(c.remise, 0.1);
  for (const a of c.articles) {
    assert.ok(a.cle && a.designation, `article incomplet : ${JSON.stringify(a)}`);
    assert.ok(c.familles[a.famille], `${a.cle} : famille inconnue « ${a.famille} »`);
  }
  const cles = c.articles.map((a) => a.cle);
  assert.equal(new Set(cles).size, cles.length, 'deux articles portent la même clé');
});

test('les prix du catalogue sont ceux portés au devis de l\'agence', () => {
  const c = assainirCatalogue(FICHIER);
  const prix = (cle) => prixVente(c.articles.find((a) => a.cle === cle), c.remise);
  // Les trois prix donnés par l'agence le 24/09/2026, à l'euro près.
  assert.equal(prix('cam-varifocale'), 239.4);
  assert.equal(prix('cam-tourelle'), 163);
  assert.equal(prix('cam-panoramique'), 165.65);
  assert.equal(prix('main-oeuvre'), 73.81);
});

test('aucun prix n\'est inventé : ce qui manque manque', () => {
  /*
   * Le déplacement, le transport et la gamme d'alarme n'ont pas été chiffrés
   * par l'agence. Les remplir d'un montant plausible ferait sortir des
   * factures fausses : ils restent vides, et l'outil le dit.
   */
  const c = assainirCatalogue(FICHIER);
  const reste = articlesSansPrix(c).map((a) => a.cle);
  for (const cle of ['deplacement', 'transport', 'coffret', 'presse-etoupe', 'ajax-hub']) {
    assert.ok(reste.includes(cle), `${cle} ne doit pas porter de prix deviné`);
  }
});
