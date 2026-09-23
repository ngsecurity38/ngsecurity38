/**
 * Tests du bordereau de devis.
 *
 * Deux choses à tenir. Les quantités doivent être CELLES de l'étude — pas
 * une copie qui dérivera. Et un prix absent doit rester absent : un devis
 * qui arrondit ce qu'il ne sait pas est pire qu'un devis vide.
 *
 * Exécution : node --test tests/devis-etude.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bordereau, parcParModele } from '../js/devis-etude.js';
import { ficheDevis } from '../js/devis-fiche.js';
import { bilanEtude } from '../js/etude-plan.js';

const ici = dirname(fileURLToPath(import.meta.url));
const etudes = join(ici, '..', '..', '..', 'etudes', '2026-09-22-site-industriel');
const REELLE = JSON.parse(readFileSync(join(etudes, 'etude.json'), 'utf8'));
const DEVIS = JSON.parse(readFileSync(join(etudes, 'devis.json'), 'utf8'));
const AGENCE = JSON.parse(readFileSync(join(ici, '..', '..', '..', 'agence.json'), 'utf8'));

const copie = (o) => JSON.parse(JSON.stringify(o));
const trouver = (r, cle) => r.lots.flatMap((l) => l.lignes).find((x) => x.cle === cle);

/* ------------------------------------------------------------ le parc */

test('le parc se compte sur les caméras, jamais sur une liste tenue à part', () => {
  const p = parcParModele(REELLE);
  assert.equal(p.reduce((s, x) => s + x.nombre, 0), REELLE.cameras.length);
  const r = bordereau(REELLE, DEVIS);
  for (const m of p) {
    assert.equal(trouver(r, `camera-${m.cle}`).quantite, m.nombre);
  }
});

test('ajouter une caméra à l\'étude l\'ajoute au bordereau', () => {
  const e = copie(REELLE);
  const avant = trouver(bordereau(e, DEVIS), 'camera-turret').quantite;
  e.cameras.push({ ...e.cameras.find((c) => c.modele === 'turret'), cle: 'C11' });
  assert.equal(trouver(bordereau(e, DEVIS), 'camera-turret').quantite, avant + 1);
  assert.equal(trouver(bordereau(e, DEVIS), 'support').quantite, e.cameras.length);
});

/* --------------------------------------------------------- les quantités */

test('les quantités sont celles de l\'étude, au conditionnement près', () => {
  const b = bilanEtude(REELLE);
  const r = bordereau(REELLE, DEVIS);
  assert.equal(trouver(r, 'cableReseau').quantite, Math.ceil(b.reseau / 305),
    'le câble réseau s\'achète au touret entier');
  assert.equal(trouver(r, 'cableReseau').quantite, b.boites.boites,
    'et le dossier annonce le même nombre de boîtes');
  assert.equal(trouver(r, 'cableCommande').quantite, Math.ceil(b.commande / 100));
  assert.equal(trouver(r, 'disque').quantite, b.disques.pool.nombre);
  assert.equal(trouver(r, 'switchPoe').quantite, REELLE.coffrets.length);
  assert.equal(trouver(r, 'coffret').quantite, REELLE.coffrets.length);
});

test('deux connecteurs par liaison, coffrets compris', () => {
  const r = bordereau(REELLE, DEVIS);
  assert.equal(trouver(r, 'connecteur').quantite,
    (REELLE.cameras.length + REELLE.coffrets.length) * 2);
});

test('le presse-étoupe ne se compte que sur les caméras exposées', () => {
  const dehors = REELLE.cameras.filter((c) => c.exterieur).length;
  assert.ok(dehors > 0 && dehors < REELLE.cameras.length,
    'l\'étude distingue bien dedans et dehors');
  assert.equal(trouver(bordereau(REELLE, DEVIS), 'presseEtoupe').quantite, dehors);
});

test('une ventouse double pour une porte à deux vantaux', () => {
  const r = bordereau(REELLE, DEVIS);
  assert.equal(trouver(r, 'ventouseDouble').quantite, 1);
  assert.equal(trouver(r, 'ventouseSimple').quantite, 1);
  assert.equal(trouver(r, 'lecteur').quantite, REELLE.acces.length);
});

test('une alimentation par coffret qui porte un verrouillage', () => {
  const r = bordereau(REELLE, DEVIS);
  const points = new Set(REELLE.acces.map((a) => a.coffret || 'local'));
  assert.equal(trouver(r, 'alimSecourue').quantite, points.size);
  assert.equal(points.size, 2, 'R2 et R3 : deux bouts de site, deux alimentations');
});

test('la nacelle se déduit de la hauteur de pose, pas d\'une saisie', () => {
  const haut = REELLE.cameras.filter((c) => c.hauteur >= 4).length;
  const r = bordereau(REELLE, DEVIS);
  assert.equal(trouver(r, 'poseCameraNacelle').quantite,
    haut * DEVIS.mainOeuvre.parCameraNacelle);
  assert.equal(trouver(r, 'poseCamera').quantite,
    (REELLE.cameras.length - haut) * DEVIS.mainOeuvre.parCamera);
});

/* ------------------------------------------------------------ les prix */

test('un prix absent reste absent : rien ne s\'arrondit à zéro', () => {
  const r = bordereau(REELLE, DEVIS);
  const toutes = r.lots.flatMap((l) => l.lignes);
  assert.ok(toutes.every((l) => l.prix === null && l.total === null));
  assert.equal(r.totaux.ht, 0);
  assert.equal(r.totaux.complet, false);
  assert.equal(r.totaux.sansPrix, r.totaux.lignes);
});

test('un prix saisi se multiplie par la quantité et monte au sous-total', () => {
  const d = copie(DEVIS);
  d.prix.turret = 180;
  const r = bordereau(REELLE, d);
  const n = trouver(r, 'camera-turret');
  assert.equal(n.prix, 180);
  assert.equal(n.total, 180 * n.quantite);
  const lot = r.lots.find((l) => l.cle === 'materiel');
  assert.equal(lot.total, 180 * n.quantite);
  assert.ok(lot.sansPrix > 0, 'le lot dit ce qui manque encore');
});

test('la main d\'œuvre prend le taux horaire, une fois qu\'il existe', () => {
  const d = copie(DEVIS);
  d.tauxHoraire = 55;
  const r = bordereau(REELLE, d);
  const pose = trouver(r, 'poseCamera');
  assert.equal(pose.prix, 55);
  assert.equal(pose.total, 55 * pose.quantite);
  assert.ok(r.totaux.heures > 0);
});

test('une option ne compte ni dans le lot ni dans le total', () => {
  const d = copie(DEVIS);
  d.articles.ecran.prix = 400;
  d.prix.turret = 100;
  const r = bordereau(REELLE, d);
  const lot = r.lots.find((l) => l.cle === 'materiel');
  assert.equal(trouver(r, 'ecran').option, true);
  assert.equal(lot.total, 100 * trouver(r, 'camera-turret').quantite,
    'l\'écran en option n\'entre pas dans le sous-total');
});

test('la TVA s\'applique au total hors taxes', () => {
  const d = copie(DEVIS);
  d.prix.turret = 100;
  const r = bordereau(REELLE, d);
  assert.equal(r.totaux.montantTva, r.totaux.ht * d.tva);
  assert.equal(r.totaux.ttc, r.totaux.ht * (1 + d.tva));
});

/* ------------------------------------------------------- le document */

test('le devis non chiffré le dit, et ne montre aucun montant inventé', () => {
  const html = ficheDevis(REELLE, DEVIS, AGENCE);
  assert.ok(html.includes('Devis non contractuel'));
  assert.ok(!/\d+,\d\d €/.test(html), 'aucun montant ne doit apparaître');
  assert.ok(html.includes('—'));
});

test('le devis chiffré perd le bandeau et porte les montants', () => {
  const d = copie(DEVIS);
  d.exemple = false;
  d.tauxHoraire = 55;
  d.prix.turret = 100;
  const html = ficheDevis(REELLE, d, AGENCE);
  assert.ok(!html.includes('Devis non contractuel'));
  assert.ok(html.includes('Chiffrage partiel'), 'il reste des lignes sans prix');
  assert.ok(/\d,\d\d €/.test(html));
});

test('le devis reprend le papier réglé pour le dossier', () => {
  const e = copie(REELLE);
  e.dossier = { pdf: { format: 'A3', orientation: 'landscape', marges: 'larges' } };
  assert.ok(ficheDevis(e, DEVIS, AGENCE).includes('@page { size:A3 landscape;'));
});

test('le devis ne va rien chercher sur Internet', () => {
  const html = ficheDevis(REELLE, DEVIS, AGENCE);
  assert.deepEqual([...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]*/g)].map((m) => m[0]), []);
});

test('tout ce que le client tape ou que le tarif porte est échappé', () => {
  const e = copie(REELLE);
  e.client = 'Dupont & <fils>';
  const d = copie(DEVIS);
  d.articles.support.designation = 'Support "renforcé" & platine';
  const html = ficheDevis(e, d, AGENCE);
  assert.ok(html.includes('Dupont &amp; &lt;fils&gt;'));
  assert.ok(html.includes('Support &quot;renforcé&quot; &amp; platine'));
});
