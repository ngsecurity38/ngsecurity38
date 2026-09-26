/**
 * Tests de l'offre commerciale remise au client.
 * Exécution : node --test tests/offre-commerciale.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prixLigne, comptes, ficheOffre } from '../js/offre-fiche.js';

const ici = dirname(fileURLToPath(import.meta.url));
const dossierOffres = join(ici, '..', '..', '..', 'offres');

const OFFRE = {
  reference: 'OFF-TEST', date: '2026-09-26', validite: 30,
  remise: 0.1, tva: 0.2, tauxHoraire: 73.81,
  client: { nom: 'Essai' },
  cameras: [{ cle: 'C1', nom: 'Entrée', exterieur: true }, { cle: 'C2', nom: 'Caisse' }],
  lots: [
    { titre: 'Matériel', lignes: [
      { designation: 'Caméra', quantite: 6, unite: 'u', marche: 100 },
      { designation: 'Sans prix', quantite: 2, unite: 'u', marche: null },
      { designation: 'Prix ferme', quantite: 1, unite: 'u', marche: 100, prixVente: 80 },
    ] },
    { titre: 'Pose', mainOeuvre: true, lignes: [
      { designation: 'Pose', quantite: 10, unite: 'h' },
    ] },
  ],
};

/* ------------------------------------------------------------- les prix */

test('la remise de l\'agence s\'applique au prix de marché', () => {
  assert.equal(prixLigne({ marche: 100 }, OFFRE), 90);
});

test('un prix ferme s\'impose et ne se remise pas', () => {
  assert.equal(prixLigne({ marche: 100, prixVente: 80 }, OFFRE), 80);
});

test('la main-d\'œuvre se facture au taux horaire, jamais remisée', () => {
  /*
   * Un taux horaire n'est pas un tarif catalogue : le rabattre de 10 %
   * reviendrait à se payer moins cher de l'heure sans l'avoir décidé.
   */
  assert.equal(prixLigne({ quantite: 10 }, OFFRE, true), 73.81);
});

test('une ligne non chiffrée vaut null, jamais zéro', () => {
  assert.equal(prixLigne({ marche: null }, OFFRE), null);
  assert.equal(prixLigne({}, OFFRE), null);
  // `Number(null)` vaut 0 : sans garde, la ligne passerait pour gratuite.
  assert.notEqual(prixLigne({ marche: null }, OFFRE), 0);
});

/* ---------------------------------------------------------- les comptes */

test('les comptes s\'additionnent par lot, puis en total', () => {
  const c = comptes(OFFRE);
  assert.equal(c.lots[0].total, 6 * 90 + 80, 'la ligne sans prix ne compte pas');
  assert.equal(c.lots[1].total, 738.1);
  assert.equal(c.ht, 620 + 738.1);
  assert.equal(c.tva, 271.62);
  assert.equal(c.ttc, 1629.72);
});

test('l\'offre dit combien de lignes restent à chiffrer', () => {
  /*
   * Un total présenté comme complet alors qu'il manque une ligne engage
   * l'agence sur un prix qu'elle n'a pas calculé.
   */
  assert.equal(comptes(OFFRE).aChiffrer, 1);
  assert.equal(comptes({ ...OFFRE, lots: [] }).aChiffrer, 0);
});

/* ----------------------------------------------------------- la feuille */

test('la feuille porte le client, les repères et les totaux', () => {
  const html = ficheOffre(OFFRE, { nomCommercial: 'NG Security 38', siret: '1' });
  assert.match(html, /OFFRE DE PRIX/);
  assert.match(html, /OFF-TEST/);
  assert.ok(html.includes('Essai'));
  assert.ok(html.includes('C1') && html.includes('C2'));
  // Le séparateur de milliers est une espace fine insécable, pas une espace.
  const serre = html.replace(/[\s\u00a0\u202f]/g, '');
  assert.ok(serre.includes('1358,10€'), 'le total hors taxes');
  assert.ok(serre.includes('1629,72€'), 'le total toutes taxes');
  assert.match(html, /Bon pour accord/, 'le client doit pouvoir signer');
  assert.match(html, /à chiffrer/, 'ce qui manque doit se voir');
});

test('la feuille annonce son papier', () => {
  // C'est cette mesure qui dit au cadre d'impression quelle taille prendre.
  const html = ficheOffre(OFFRE, {});
  assert.match(html, /data-papier-largeur="\d+"/);
  assert.match(html, /data-papier-hauteur="\d+"/);
});

test('rien de ce qui est saisi ne peut casser la feuille', () => {
  const html = ficheOffre({
    ...OFFRE,
    client: { nom: '<script>alert(1)</script>' },
    objet: '"><b>gras</b>',
  }, {});
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<b>gras</b>'));
});

/* ------------------------------------------------- les offres du dépôt */

test('chaque offre du dépôt se lit et se met en page', () => {
  if (!existsSync(dossierOffres)) return;
  for (const nom of readdirSync(dossierOffres)) {
    const fichier = join(dossierOffres, nom, 'offre.json');
    if (!existsSync(fichier)) continue;
    const offre = JSON.parse(readFileSync(fichier, 'utf8'));

    assert.ok(offre.reference, `${nom} : référence manquante`);
    assert.ok(offre.client && offre.client.nom, `${nom} : client manquant`);
    assert.ok((offre.cameras || []).length, `${nom} : aucune caméra`);
    for (const c of offre.cameras) {
      assert.ok(c.cle && c.nom && c.role, `${nom} : caméra incomplète ${JSON.stringify(c)}`);
    }

    const c = comptes(offre);
    assert.ok(c.ht > 0, `${nom} : total nul`);
    assert.equal(c.ttc, Math.round((c.ht + c.tva) * 100) / 100, `${nom} : TTC faux`);

    const html = ficheOffre(offre, { nomCommercial: 'NG Security 38' });
    /*
     * L'agence l'a demandé : pas de tirets longs sur ses documents. Ils
     * signent le texte écrit par une machine, et ça se voit.
     */
    const corps = html.slice(html.indexOf('<body'));
    assert.ok(!corps.includes('—'), `${nom} : un tiret long traîne dans le document`);
  }
});
