/**
 * Étude d'alarme anti-intrusion.
 *
 * Ce module décide combien de détecteurs poser et où. Une erreur y coûte
 * cher des deux côtés : un détecteur de trop se facture pour rien, un
 * détecteur de moins laisse une porte ouverte. D'où des tests sur le
 * raisonnement lui-même, et pas seulement sur le total.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TYPES_LOGEMENT, ANIMAUX, GARAGES, MASSE_IMMUNITE, SURFACE_PAR_DETECTEUR,
  strategie, inventaire, composerAlarme, reservesAlarme, couches,
} from '../js/alarme.js';
import { devis, ligne } from '../js/prix.js';

/** Un pavillon ordinaire, qui servira de point de départ. */
const MAISON = {
  typeLogement: 'etage',
  surface: 130,
  niveaux: 2,
  occupants: 2,
  portes: 2,
  fenetresAccessibles: 5,
  baies: 1,
  fenetresHautes: 3,
  garage: 'aucun',
  animaux: 'aucun',
  internet: 'box',
};

/* ---------------------------------------------------------- le périmètre */

test('chaque porte et chaque fenêtre accessible est protégée', () => {
  const i = inventaire(MAISON);
  assert.equal(i.ouvertures, 2 + 5, 'deux portes et cinq fenêtres');
  // Les fenêtres d'étage déclarées inaccessibles ne sont PAS comptées : les
  // équiper serait facturer une protection que le client n'a pas demandée.
  assert.equal(i.fenetresHautes, 3);
});

test('un garage communicant ajoute deux ouvertures, pas une', () => {
  /*
   * La porte de garage ET la porte intérieure. Une basculante se force en
   * silence ; si seule elle est équipée, l'intrus entre dans la maison par
   * une porte nue. Si seule la porte intérieure l'est, il fouille le garage
   * à loisir.
   */
  const sans = inventaire(MAISON).ouvertures;
  assert.equal(inventaire({ ...MAISON, garage: 'communicant' }).ouvertures, sans + 2);
  assert.equal(inventaire({ ...MAISON, garage: 'attenant' }).ouvertures, sans + 1);
  assert.equal(inventaire({ ...MAISON, garage: 'independant' }).ouvertures, sans + 1);
});

test('une grande surface vitrée appelle un détecteur de bris', () => {
  /*
   * Un contact d'ouverture sait qu'un battant s'ouvre. Il ignore qu'une vitre
   * a été cassée et qu'on est passé au travers : sans détecteur de bris, le
   * périmètre a un trou de la taille de la baie.
   */
  assert.equal(inventaire({ ...MAISON, baies: 0 }).brisVitre, 0);
  assert.equal(inventaire({ ...MAISON, baies: 1 }).brisVitre, 1);
  assert.equal(inventaire({ ...MAISON, baies: 4 }).brisVitre, 2);
  // Une baie est une fenêtre : on n'en déclare pas plus qu'il n'y a de fenêtres.
  assert.equal(inventaire({ ...MAISON, fenetresAccessibles: 2, baies: 9 }).baies, 2);
});

/* -------------------------------------------------------- le volumétrique */

test('le volumétrique suit les niveaux puis la surface', () => {
  const petit = inventaire({ ...MAISON, niveaux: 1, surface: 50 });
  assert.equal(petit.mouvements, 1, 'un petit plain-pied : la circulation suffit');

  const moyen = inventaire({ ...MAISON, niveaux: 2, surface: 130 });
  assert.equal(moyen.mouvements, 2 + Math.ceil((130 - 50) / SURFACE_PAR_DETECTEUR));

  // Monotone : plus grand ne peut pas demander moins de détecteurs.
  let precedent = 0;
  for (const surface of [60, 90, 120, 180, 240]) {
    const n = inventaire({ ...MAISON, surface }).mouvements;
    assert.ok(n >= precedent, `${surface} m² : ${n} après ${precedent}`);
    precedent = n;
  }
});

test('un logement démesuré ne produit pas une liste démesurée', () => {
  const i = inventaire({ ...MAISON, surface: 600, niveaux: 3 });
  assert.ok(i.mouvements <= 15, `${i.mouvements} détecteurs : c'est une étude sur place`);
});

/* --------------------------------------------------------- les animaux */

test('un grand chien fait basculer la détection sur le périmètre', () => {
  /*
   * Au-delà de l'immunité annoncée, un chien déclenche comme un homme. Le
   * volumétrique se réduit alors aux circulations : poser des détecteurs là
   * où l'animal passe fabrique des alertes qui finissent par faire désarmer
   * le système pour de bon — la panne la plus courante d'une alarme.
   */
  assert.ok(ANIMAUX.grandChien.masse > MASSE_IMMUNITE);
  const avec = inventaire({ ...MAISON, animaux: 'grandChien' });
  const sans = inventaire({ ...MAISON, animaux: 'aucun' });
  assert.equal(avec.mode, 'perimetrique');
  assert.ok(avec.mouvements < sans.mouvements,
    `${avec.mouvements} contre ${sans.mouvements}`);
  assert.equal(avec.ouvertures, sans.ouvertures, 'le périmètre, lui, ne bouge pas');
});

test('un chat aussi : l\'immunité suppose que l\'animal reste au sol', () => {
  assert.equal(strategie({ animaux: 'chat' }), 'perimetrique');
  assert.equal(strategie({ animaux: 'plusieurs' }), 'perimetrique');
  // Un petit chien, lui, est couvert par l'immunité : rien ne change.
  assert.equal(strategie({ animaux: 'petitChien' }), 'mixte');
  assert.equal(inventaire({ ...MAISON, animaux: 'petitChien' }).mouvements,
    inventaire({ ...MAISON, animaux: 'aucun' }).mouvements);
});

/* ------------------------------------------------------------ le matériel */

/** Tarif complet et chiffré, pour vérifier la composition. */
const TARIF = [
  { type: 'hub', reference: 'Centrale 50', prixAchat: 200, capacite: 50 },
  { type: 'hub', reference: 'Centrale 10', prixAchat: 100, capacite: 10 },
  { type: 'ouverture', reference: 'Contact', prixAchat: 30 },
  { type: 'mouvement', reference: 'PIR simple', prixAchat: 35 },
  { type: 'mouvement', reference: 'PIR animaux', prixAchat: 45, immuniteAnimaux: true },
  { type: 'mouvementPhoto', reference: 'PIR photo', prixAchat: 90, immuniteAnimaux: true },
  { type: 'brisVitre', reference: 'Bris', prixAchat: 40 },
  { type: 'clavier', reference: 'Clavier', prixAchat: 70 },
  { type: 'telecommande', reference: 'Télécommande', prixAchat: 25 },
  { type: 'sireneInt', reference: 'Sirène intérieure', prixAchat: 50 },
  { type: 'sireneExt', reference: 'Sirène extérieure', prixAchat: 120 },
  { type: 'relais', reference: 'Relais', prixAchat: 60 },
];

const parRole = (o, role) => o.lignes.find((l) => l.role === role);

test('la composition couvre tout l\'inventaire, et rien de plus', () => {
  const o = composerAlarme(MAISON, TARIF);
  assert.deepEqual(o.manques, [], JSON.stringify(o.manques));
  assert.equal(parRole(o, 'Détecteurs d\'ouverture').quantite, o.inv.ouvertures);
  assert.equal(parRole(o, 'Détecteurs de mouvement').quantite, o.inv.mouvements);
  assert.equal(parRole(o, 'Détecteurs de bris de vitre').quantite, o.inv.brisVitre);
  assert.equal(parRole(o, 'Télécommandes').quantite, 2, 'une par occupant');
  assert.ok(parRole(o, 'Centrale'), 'une centrale');
  assert.ok(parRole(o, 'Sirène extérieure'), 'demandée par défaut');
  assert.ok(!parRole(o, 'Relais radio'), 'aucune raison d\'en prévoir un ici');
});

test('une centrale trop petite n\'est pas proposée', () => {
  /*
   * Le tri se fait par prix : sans contrôle de capacité, la centrale à dix
   * appareils serait choisie systématiquement, et le système saturerait à la
   * pose.
   */
  const o = composerAlarme(MAISON, TARIF);
  assert.equal(parRole(o, 'Centrale').article.reference, 'Centrale 50');
  assert.ok(o.appareils > 10 && o.appareils <= 50, `${o.appareils} appareils`);

  const trop = composerAlarme(MAISON, TARIF.filter((a) => a.capacite !== 50));
  assert.ok(trop.manques.some((m) => /centrale/i.test(m)), JSON.stringify(trop.manques));
});

test('avec un animal, le détecteur à immunité est retenu — ou le défaut est dit', () => {
  const o = composerAlarme({ ...MAISON, animaux: 'petitChien' }, TARIF);
  assert.equal(parRole(o, 'Détecteurs de mouvement').article.reference, 'PIR animaux');

  // Sans détecteur immunisé au tarif, la page ne doit pas faire comme si.
  const sans = composerAlarme({ ...MAISON, animaux: 'petitChien' },
    TARIF.filter((a) => !a.immuniteAnimaux));
  assert.equal(parRole(sans, 'Détecteurs de mouvement').article.reference, 'PIR simple');
  assert.ok(sans.manques.some((m) => /immunité animale/.test(m)),
    JSON.stringify(sans.manques));
});

test('la photo à l\'alerte change le détecteur, pas la quantité', () => {
  const sans = composerAlarme(MAISON, TARIF);
  const avec = composerAlarme({ ...MAISON, leveeDoute: true }, TARIF);
  const l = parRole(avec, 'Détecteurs de mouvement avec photo');
  assert.equal(l.article.reference, 'PIR photo');
  assert.equal(l.quantite, parRole(sans, 'Détecteurs de mouvement').quantite);
});

test('un relais est prévu là où la radio peut manquer', () => {
  for (const cas of [{ garage: 'independant' }, { dependance: true },
    { niveaux: 3 }, { surface: 240 }]) {
    const o = composerAlarme({ ...MAISON, ...cas }, TARIF);
    assert.ok(parRole(o, 'Relais radio'), `relais attendu : ${JSON.stringify(cas)}`);
  }
});

test('la pose se chiffre sur le nombre d\'appareils, et se refuse', () => {
  const o = composerAlarme(MAISON, TARIF);
  assert.ok(o.heures > 0);
  const gros = composerAlarme({ ...MAISON, fenetresAccessibles: 15 }, TARIF);
  assert.ok(gros.heures > o.heures, 'plus de détecteurs, plus d\'heures');
  assert.equal(composerAlarme({ ...MAISON, pose: false }, TARIF).heures, 0);
});

/* --------------------------------------------------------------- chiffrage */

test('l\'étude se chiffre, et le total suit les quantités', () => {
  const o = composerAlarme(MAISON, TARIF);
  const d = devis(o.lignes.map((l) => ligne(l.article, l.quantite)),
    { heures: o.heures, tauxHoraire: 55 });
  assert.ok(d.complet, JSON.stringify(d.sansPrix.map((l) => l.article.reference)));
  assert.ok(d.totalTtc > d.totalHt);

  const gros = composerAlarme({ ...MAISON, fenetresAccessibles: 12 }, TARIF);
  const d2 = devis(gros.lignes.map((l) => ligne(l.article, l.quantite)),
    { heures: gros.heures, tauxHoraire: 55 });
  assert.ok(d2.totalHt > d.totalHt, 'sept fenêtres de plus coûtent plus cher');
});

test('tarif livré : le matériel est composé, les prix sont dits manquants', async () => {
  /*
   * Le fichier livré ne porte AUCUN prix, et c'est voulu : un prix se relève
   * chez le distributeur. La page doit alors tout de même établir le matériel
   * et les quantités — et dire que les montants manquent, plutôt que
   * d'afficher un total de zéro euro qui passerait pour une offre.
   */
  const { default: tarif } = await import('../tarif-alarme.json', { with: { type: 'json' } });
  const o = composerAlarme(MAISON, tarif.articles);
  assert.deepEqual(o.manques, [], JSON.stringify(o.manques));
  assert.ok(o.lignes.length >= 7, `${o.lignes.length} lignes`);
  assert.ok(o.lignes.every((l) => l.article.reference), 'chaque ligne est désignée');

  const d = devis(o.lignes.map((l) => ligne(l.article, l.quantite)), { heures: o.heures });
  assert.equal(d.complet, false, 'le devis doit se déclarer incomplet');
  assert.equal(d.sansPrix.length, o.lignes.length);
  assert.equal(tarif.exemple, true, 'l\'avertissement doit rester affiché');
});

/* --------------------------------------------------------------- réserves */

test('les réserves disent ce que CETTE installation laisse passer', () => {
  const r = reservesAlarme(inventaire(MAISON));
  assert.ok(r.some((x) => /3 ouvertures en étage/.test(x)), JSON.stringify(r));
  assert.ok(r.some((x) => /n'empêche pas d'entrer/.test(x)), 'la limite d\'une alarme');
  assert.ok(r.some((x) => /A2P/.test(x)), 'la question de l\'assureur');

  const chien = reservesAlarme(inventaire({ ...MAISON, animaux: 'grandChien' }));
  assert.ok(chien.some((x) => new RegExp(`${MASSE_IMMUNITE} kg`).test(x)), JSON.stringify(chien));

  const chat = reservesAlarme(inventaire({ ...MAISON, animaux: 'chat' }));
  assert.ok(chat.some((x) => /reste au sol/.test(x)), JSON.stringify(chat));

  const garage = reservesAlarme(inventaire({ ...MAISON, garage: 'communicant' }));
  assert.ok(garage.some((x) => /communique avec la maison/.test(x)), JSON.stringify(garage));

  // Sans box, la carte SIM doit être annoncée AVANT la facture.
  const sansBox = reservesAlarme(inventaire({ ...MAISON, internet: 'aucun' }));
  assert.ok(sansBox.some((x) => /carte SIM/.test(x)), JSON.stringify(sansBox));
});

test('rien n\'est promis sur une maison sans étage déclaré inaccessible', () => {
  const r = reservesAlarme(inventaire({ ...MAISON, fenetresHautes: 0 }));
  assert.ok(!r.some((x) => /en étage/.test(x)), 'pas de réserve sans objet');
});

/* ---------------------------------------------------------------- schéma */

test('les trois lignes de défense comptent exactement les appareils posés', () => {
  const i = inventaire({ ...MAISON, garage: 'communicant' });
  const c = couches(i);
  assert.equal(c.length, 3);
  assert.equal(c[0].nombre, i.ouvertures + i.brisVitre);
  assert.equal(c[1].nombre, i.mouvements);
  assert.equal(c[2].nombre, 2, 'les deux sirènes');
  assert.equal(couches({ ...i, sireneExterieure: false })[2].nombre, 1);
  assert.ok(c.every((x) => x.titre && x.quand && x.detail), JSON.stringify(c));
});

/* ------------------------------------------------------------- robustesse */

test('des réponses absentes ou aberrantes donnent une étude, pas une erreur', () => {
  for (const cas of [{}, { surface: -5 }, { portes: -3, fenetresAccessibles: 'x' },
    { typeLogement: 'chateau' }, { garage: 'souterrain' }, { animaux: 'dragon' },
    { niveaux: 0 }, { occupants: -1 }]) {
    const i = inventaire(cas);
    assert.ok(i.ouvertures >= 0 && Number.isFinite(i.ouvertures), JSON.stringify(cas));
    assert.ok(i.mouvements >= 1, `${JSON.stringify(cas)} : ${i.mouvements}`);
    assert.ok(TYPES_LOGEMENT[i.type], `type retombé sur un connu : ${i.type}`);
    assert.ok(GARAGES[i.garage], `garage retombé sur un connu : ${i.garage}`);
    assert.ok(composerAlarme(cas, TARIF).lignes.length > 0);
  }
});
