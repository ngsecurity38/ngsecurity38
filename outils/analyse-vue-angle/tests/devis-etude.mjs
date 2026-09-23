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

import { bordereau, parcParModele, prixFacture } from '../js/devis-etude.js';
import { ficheDevis } from '../js/devis-fiche.js';
import { bilanEtude } from '../js/etude-plan.js';

const ici = dirname(fileURLToPath(import.meta.url));
const etudes = join(ici, '..', '..', '..', 'etudes', '2026-09-22-site-industriel');
const REELLE = JSON.parse(readFileSync(join(etudes, 'etude.json'), 'utf8'));
const DEVIS = JSON.parse(readFileSync(join(etudes, 'devis.json'), 'utf8'));
const AGENCE = JSON.parse(readFileSync(join(ici, '..', '..', '..', 'agence.json'), 'utf8'));

const copie = (o) => JSON.parse(JSON.stringify(o));

/** Un tarif sans le moindre prix : ce qu'était devis.json avant les relevés. */
function tarifNu() {
  const d = copie(DEVIS);
  d.marche = Object.fromEntries(Object.keys(d.marche).map((k) => [k, null]));
  d.prix = Object.fromEntries(Object.keys(d.prix).map((k) => [k, null]));
  for (const a of Object.values(d.articles)) a.marche = null;
  if (d.kitAcces) d.kitAcces.marche = null;
  d.tauxHoraire = null;
  return d;
}
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

test('le kit nomme les accès qu\'il dessert, et la ventouse de chacun', () => {
  const k = trouver(bordereau(REELLE, DEVIS), 'kitAcces');
  for (const a of REELLE.acces) {
    assert.ok(k.note.includes(a.cle), `${a.cle} doit être nommé`);
  }
  const texte = k.contenu.join(' ');
  assert.ok(/double/i.test(texte), 'la porte à deux vantaux demande une ventouse double');
  assert.ok(/A1/.test(texte) && /A2/.test(texte), 'chaque accès est situé');
});

test('sans kit défini, le contrôle d\'accès ne s\'invente pas', () => {
  const d = copie(DEVIS);
  delete d.kitAcces;
  const r = bordereau(REELLE, d);
  assert.equal(trouver(r, 'kitAcces'), undefined);
  assert.ok(!r.lots.some((l) => l.cle === 'controle'),
    'un lot vide ne s\'imprime pas');
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
  const r = bordereau(REELLE, tarifNu());
  const toutes = r.lots.flatMap((l) => l.lignes);
  assert.ok(toutes.every((l) => l.prix === null && l.total === null));
  assert.equal(r.totaux.ht, 0);
  assert.equal(r.totaux.complet, false);
  assert.equal(r.totaux.sansPrix, r.totaux.lignes);
});

test('un prix saisi se multiplie par la quantité et monte au sous-total', () => {
  const d = tarifNu();
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
  const d = tarifNu();
  d.articles.ecran.prix = 400;
  d.prix.turret = 100;
  const r = bordereau(REELLE, d);
  const lot = r.lots.find((l) => l.cle === 'materiel');
  assert.equal(trouver(r, 'ecran').option, true);
  assert.equal(lot.total, 100 * trouver(r, 'camera-turret').quantite,
    'l\'écran en option n\'entre pas dans le sous-total');
});

test('la TVA s\'applique au total hors taxes', () => {
  const d = tarifNu();
  d.prix.turret = 100;
  const r = bordereau(REELLE, d);
  assert.equal(r.totaux.montantTva, r.totaux.ht * d.tva);
  assert.equal(r.totaux.ttc, r.totaux.ht * (1 + d.tva));
});

/* ------------------------------------------------------- le document */

test('le devis non chiffré le dit, et ne montre aucun montant inventé', () => {
  const html = ficheDevis(REELLE, tarifNu(), AGENCE);
  assert.ok(html.includes('Devis non contractuel'));
  assert.ok(!/\d+,\d\d €/.test(html), 'aucun montant ne doit apparaître');
  assert.ok(html.includes('—'));
});

test('le devis chiffré perd le bandeau et porte les montants', () => {
  const d = tarifNu();
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

/* --------------------------------------------- le prix marché et la remise */

test('le prix facturé est le prix marché, remise faite', () => {
  assert.equal(prixFacture(100, 0.1), 90);
  assert.equal(prixFacture(266, 0.1), 239.4);
  assert.equal(prixFacture(181.11, 0.1), 163);
  assert.equal(prixFacture(null, 0.1), null, 'pas de marché, pas de prix');
  assert.equal(prixFacture(100, undefined), 100, 'pas de remise, prix marché');
});

test('la remise s\'applique à chaque ligne qui porte un prix marché', () => {
  const r = bordereau(REELLE, DEVIS);
  const t = trouver(r, 'camera-turret');
  assert.equal(t.prix, prixFacture(DEVIS.marche.turret, DEVIS.remise));
  assert.equal(trouver(r, 'switchPoe').prix,
    prixFacture(DEVIS.articles.switchPoe.marche, DEVIS.remise));
});

test('un prix ferme saisi l\'emporte sur le prix marché remisé', () => {
  const d = copie(DEVIS);
  d.prix.turret = 99;
  assert.equal(trouver(bordereau(REELLE, d), 'camera-turret').prix, 99);
});

test('NI le prix marché NI la remise ne sortent du document', () => {
  /*
   * C'est la règle que l'agence a posée : le client lit un prix, pas un
   * rabais. Un prix marché imprimé quelque part, et deux clients comparent
   * deux remises.
   */
  const html = ficheDevis(REELLE, DEVIS, AGENCE);
  for (const [cle, m] of Object.entries(DEVIS.marche)) {
    if (!m) continue;
    assert.ok(!html.includes(m.toFixed(2).replace('.', ',')),
      `le prix marché de ${cle} (${m}) apparaît dans le devis`);
  }
  assert.ok(!html.includes(String(DEVIS.articles.switchPoe.marche.toFixed(2)).replace('.', ',')));
  assert.ok(!/remise/i.test(html), 'le mot « remise » n\'a rien à faire là');
  assert.ok(!/\b10\s*%/.test(html), 'ni le taux');
  // Le prix facturé, lui, y est bien.
  assert.ok(html.includes('239,40 €'));
});

test('le contrôle d\'accès et le visiophone sortent en UN SEUL bloc', () => {
  const r = bordereau(REELLE, DEVIS);
  const k = trouver(r, 'kitAcces');
  assert.ok(k, 'le kit est au bordereau');
  assert.equal(k.option, true);
  assert.equal(k.quantite, 1);
  assert.equal(k.unite, 'ensemble');
  assert.ok(k.contenu.length >= 6, 'le client lit ce qu\'il contient');
  assert.ok(/reconnaissance faciale/i.test(k.contenu.join(' ')));
  assert.ok(/ventouse/i.test(k.contenu.join(' ')));
  assert.ok(/bouton de sortie/i.test(k.contenu.join(' ')));
  assert.ok(/lecteur de badge/i.test(k.contenu.join(' ')));
  // Plus aucune ligne détaillée : on ne peut pas retirer le bouton de sortie
  // d'un kit de verrouillage.
  for (const cle of ['ventouseSimple', 'ventouseDouble', 'lecteur', 'boutonSortie',
    'alimSecourue', 'badge', 'faciale', 'interphonie']) {
    assert.equal(trouver(r, cle), undefined, `${cle} ne doit plus être une ligne`);
  }
  // Les sirènes, elles, font partie du système vidéo.
  assert.equal(trouver(r, 'sireneInterieure').option, false);
  assert.equal(trouver(r, 'flash').option, false);
});

test('la pose et le câble de l\'option ne pèsent pas sur la base', () => {
  const r = bordereau(REELLE, DEVIS);
  assert.equal(trouver(r, 'cableCommande').option, true,
    'le câble de commande ne sert qu\'au verrouillage et à la platine');
  assert.equal(trouver(r, 'acces'), undefined, 'la pose du contrôle d\'accès est dans le kit');
  assert.equal(trouver(r, 'interphonie'), undefined, 'celle de la platine aussi');
});

test('chiffrer le kit ne change pas le total de la vidéosurveillance', () => {
  const d = copie(DEVIS);
  const sans = bordereau(REELLE, d).totaux.ht;
  d.kitAcces.marche = 2400;
  const r = bordereau(REELLE, d);
  assert.equal(r.totaux.ht, sans);
  assert.equal(trouver(r, 'kitAcces').prix, prixFacture(2400, d.remise),
    'le kit suit la même remise que le reste');
});



test('le second disque est une option, chiffrée au même prix', () => {
  const d = copie(DEVIS);
  d.marche.disque = 300;
  const r = bordereau(REELLE, d);
  const base = trouver(r, 'disque');
  const opt = trouver(r, 'disqueOption');
  assert.equal(base.quantite, 1, 'quinze jours : un disque');
  assert.equal(base.option, false);
  assert.equal(opt.quantite, 1, 'trente jours : un de plus');
  assert.equal(opt.option, true);
  assert.equal(opt.prix, base.prix, 'le même disque, le même prix');
  assert.ok(/30 jours/.test(opt.designation));
  // Et l'option ne gonfle pas le total.
  const sansOption = r.lots.find((l) => l.cle === 'materiel').total;
  assert.equal(sansOption, r.lots.find((l) => l.cle === 'materiel').lignes
    .filter((l) => !l.option && l.total !== null)
    .reduce((s, l) => s + l.total, 0));
});

test('tout article qui porte un prix marché se retrouve chiffré', () => {
  /*
   * L'oubli est toujours le même : la ligne reprend l'article par
   * décomposition, mais personne ne calcule son prix. Le tarif porte un
   * chiffre, le devis imprime « — », et l'agence ne s'en aperçoit qu'en
   * relisant le total.
   */
  const d = copie(DEVIS);
  for (const art of Object.values(d.articles)) art.marche = 42;
  for (const k of Object.keys(d.marche)) d.marche[k] = 42;
  d.kitAcces.marche = 42;
  const attendu = prixFacture(42, d.remise);
  for (const l of bordereau(REELLE, d).lots.flatMap((x) => x.lignes)) {
    if (l.unite === 'h') continue;  // la main d'œuvre suit le taux horaire
    assert.equal(l.prix, attendu, `${l.cle} ne prend pas son prix marché`);
  }
});
