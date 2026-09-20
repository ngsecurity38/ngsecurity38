/**
 * Tests de l'étude par photo côté client.
 * Exécution : node --test tests/photo-client.mjs
 *
 * Seules les fonctions pures sont éprouvées ici ; le dessin et les gestes le
 * sont dans le navigateur (tests/navigateur.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  priseDeVue, mesureZone, couvertureReelle, niveauAtteint, porteeNiveau,
  priseSous, transformer, appareilsClient,
} from '../js/photo-client.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/** Photo 16/9 prise à 3 m, avec deux repères connus. */
const zoneDeBase = (extra = {}) => ({
  image: { largeur: 1600, hauteur: 900 },
  hauteur: 3,
  appareil: 'Téléphone — objectif principal',
  d1: 10,
  d2: 25,
  r1: { u: 0.5, v: 0.46 },
  r2: { u: 0.5, v: 0.34 },
  ...extra,
});

/* --------------------------------------------------------- prise de vue */

test('deux repères : le champ de la photo est mesuré, pas supposé', () => {
  const p = priseDeVue(zoneDeBase());
  assert.ok(p, 'le calage doit aboutir');
  assert.equal(p.mesure, true);
  assert.ok(p.angleH > 15 && p.angleH < 150, `champ mesuré : ${p.angleH}°`);
  assert.ok(p.inclinaison > 0 && p.inclinaison < 90, `inclinaison : ${p.inclinaison}°`);
});

test('un seul repère : le champ est celui de l\'appareil, et c\'est dit', () => {
  const p = priseDeVue(zoneDeBase({ r2: null }));
  assert.ok(p);
  assert.equal(p.mesure, false, 'supposé, pas mesuré');
  proche(p.angleH, 67, 1e-9, 'le champ déclaré du téléphone');
});

test('un appareil inconnu retombe sur un téléphone ordinaire', () => {
  const p = priseDeVue(zoneDeBase({ r2: null, appareil: 'Appareil fantaisiste' }));
  proche(p.angleH, 67, 1e-9);
});

test('sans hauteur ni repère, rien n\'est calé', () => {
  assert.equal(priseDeVue(zoneDeBase({ hauteur: 0 })), null);
  assert.equal(priseDeVue(zoneDeBase({ r1: null, r2: null })), null);
  assert.equal(priseDeVue(null), null);
});

test('deux repères à la même hauteur dans l\'image ne mesurent rien', () => {
  // Ils n'apportent aucune information nouvelle : on se rabat sur l'appareil.
  const p = priseDeVue(zoneDeBase({ r2: { u: 0.7, v: 0.46 } }));
  assert.equal(p.mesure, false);
});

/* ------------------------------------------------------- mesure de zone */

test('la zone entourée donne angle, distances et focale', () => {
  const m = mesureZone(zoneDeBase({ zone: { u1: 0.25, v1: 0.3, u2: 0.75, v2: 0.5 } }));
  assert.ok(m, 'la zone doit se mesurer');
  assert.ok(m.angleRequis > 5 && m.angleRequis < 120, `angle : ${m.angleRequis}°`);
  assert.ok(m.distanceMax > m.distanceMin, 'le fond est plus loin que le bord');
  assert.ok(m.focale > 1 && m.focale < 40, `focale : ${m.focale} mm`);
  assert.ok(m.largeur > 0);
});

test('resserrer la zone allonge la focale', () => {
  const large = mesureZone(zoneDeBase({ zone: { u1: 0.1, v1: 0.3, u2: 0.9, v2: 0.5 } }));
  const serre = mesureZone(zoneDeBase({ zone: { u1: 0.4, v1: 0.3, u2: 0.6, v2: 0.5 } }));
  assert.ok(serre.focale > large.focale, `${serre.focale} doit dépasser ${large.focale}`);
  assert.ok(serre.angleRequis < large.angleRequis);
});

test('sans zone tracée, aucune mesure', () => {
  assert.equal(mesureZone(zoneDeBase()), null);
  assert.equal(mesureZone(zoneDeBase({ zone: { u1: 0.2, v1: 0.3, u2: 0.8, v2: 0.5 }, hauteur: 0 })), null);
});

/* ------------------------------------------- ce que la caméra donne vraiment */

/** Caméra 4K à objectif fixe 4 mm, comme au tarif d'exemple. */
const FIXE_4MM = { resH: 3840, focaleMin: 4, focaleMax: 4 };

test('la densité annoncée est celle du champ réel, pas du champ idéal', () => {
  const m = mesureZone(zoneDeBase({ zone: { u1: 0.35, v1: 0.32, u2: 0.65, v2: 0.5 } }));
  const couv = couvertureReelle(m, FIXE_4MM);
  assert.ok(couv, 'la couverture doit se calculer');
  // La zone est plus serrée que 4 mm ne cadre : la caméra voit plus large,
  // donc pose moins de pixels au mètre que la focale idéale ne le laissait
  // croire.
  assert.ok(couv.angle > m.angleRequis, `${couv.angle}° devrait dépasser ${m.angleRequis}°`);
  assert.ok(couv.largeur > m.largeur, 'elle embrasse plus large que la zone');
  // `m.densite` est celle d'une caméra idéale à 1920 px ; à définition égale,
  // c'est la largeur embrassée qui fait la différence.
  const ideale = FIXE_4MM.resH / m.largeur;
  assert.ok(couv.densite < ideale,
    `densité réelle ${couv.densite} : elle doit rester sous ${ideale}`);
  assert.equal(couv.focale, 4, 'un objectif fixe ne se règle pas');
  assert.equal(couv.serre, false);
});

test('un objectif variable se règle sur la focale demandée, dans ses bornes', () => {
  const m = mesureZone(zoneDeBase({ zone: { u1: 0.35, v1: 0.32, u2: 0.65, v2: 0.5 } }));
  const large = couvertureReelle(m, { resH: 3840, focaleMin: 2.8, focaleMax: 12 });
  assert.ok(large.reglable);
  proche(large.focale, m.focale, 1e-9, 'la focale demandée tient dans les bornes');
  proche(large.angle, m.angleRequis, 0.01, 'il cadre alors exactement la zone');

  // Bornes dépassées : on se règle au plus près, pas au-delà.
  const bride = couvertureReelle(m, { resH: 3840, focaleMin: 2.8, focaleMax: 3 });
  assert.equal(bride.focale, 3);
});

test('une caméra trop serrée pour la zone est signalée comme telle', () => {
  const m = mesureZone(zoneDeBase({ zone: { u1: 0.1, v1: 0.3, u2: 0.9, v2: 0.5 } }));
  const tele = couvertureReelle(m, { resH: 3840, focaleMin: 25, focaleMax: 25 });
  assert.equal(tele.serre, true, 'un 25 mm ne couvre pas une zone large');
  assert.ok(tele.ecart < 0);
});

test('sans optique au tarif, rien n\'est calculé', () => {
  const m = mesureZone(zoneDeBase({ zone: { u1: 0.3, v1: 0.3, u2: 0.7, v2: 0.5 } }));
  assert.equal(couvertureReelle(m, { resH: 3840 }), null);
  assert.equal(couvertureReelle(m, null), null);
  assert.equal(couvertureReelle(null, FIXE_4MM), null);
});

/* ------------------------------------------------- niveau d'exploitation */

test('le niveau atteint suit la densité de pixels', () => {
  const ordre = ['detection', 'observation', 'reconnaissance', 'identification'];
  const hd = niveauAtteint(70);
  const fin = niveauAtteint(300);
  assert.equal(hd.cle, 'observation');
  assert.equal(fin.cle, 'identification');
  assert.ok(ordre.indexOf(fin.cle) > ordre.indexOf(hd.cle));
});

test('sous 25 pixels par mètre, aucun niveau n\'est tenu', () => {
  const n = niveauAtteint(12);
  assert.equal(n.cle, undefined, 'moins de 25 px/m : aucun niveau');
  assert.equal(n.label, null);
  assert.equal(n.verbe, null);
  assert.equal(niveauAtteint(0).densite, 0);
});

test('chaque niveau se dit avec un verbe, pour tenir dans une phrase', () => {
  const n = niveauAtteint(400);
  assert.ok(n.verbe, 'un verbe doit être proposé');
  assert.ok(!/^[A-Z]/.test(n.verbe), 'il s\'insère au fil du texte, sans majuscule');
});

test('la portée d\'un niveau décroît quand on l\'exige plus fin', () => {
  const m = mesureZone(zoneDeBase({ zone: { u1: 0.3, v1: 0.3, u2: 0.7, v2: 0.5 } }));
  const couv = couvertureReelle(m, FIXE_4MM);
  const detection = porteeNiveau(couv, 3840, 'detection');
  const identification = porteeNiveau(couv, 3840, 'identification');
  assert.ok(detection > identification, 'on détecte plus loin qu\'on n\'identifie');
  assert.equal(porteeNiveau(null, 3840, 'detection'), 0);
});

test('une caméra au champ plus large ne porte pas aussi loin', () => {
  const m = mesureZone(zoneDeBase({ zone: { u1: 0.3, v1: 0.3, u2: 0.7, v2: 0.5 } }));
  const grandAngle = couvertureReelle(m, { resH: 3840, focaleMin: 2.8, focaleMax: 2.8 });
  const serree = couvertureReelle(m, { resH: 3840, focaleMin: 8, focaleMax: 8 });
  assert.ok(porteeNiveau(serree, 3840, 'reconnaissance')
    > porteeNiveau(grandAngle, 3840, 'reconnaissance'),
  'à définition égale, le champ étroit reconnaît plus loin');
});

/* ----------------------------------------------------- gestes sur la zone */

test('la poignée saisie dépend de l\'endroit visé', () => {
  const zone = { zone: { u1: 0.2, v1: 0.2, u2: 0.6, v2: 0.5 } };
  const l = 1000;
  assert.equal(priseSous({ u: 0.2, v: 0.2 }, zone, l), 'hg');
  assert.equal(priseSous({ u: 0.6, v: 0.5 }, zone, l), 'bd');
  assert.equal(priseSous({ u: 0.4, v: 0.35 }, zone, l), 'zone', 'au milieu : on déplace');
  assert.equal(priseSous({ u: 0.9, v: 0.9 }, zone, l), null, 'hors zone : rien');
  assert.equal(priseSous({ u: 0.4, v: 0.35 }, {}, l), null);
});

test('déplacer la zone la translate sans la déformer', () => {
  const zone = { zone: { u1: 0.2, v1: 0.2, u2: 0.6, v2: 0.5 } };
  const z = transformer(zone, 'zone', { u: 0.4, v: 0.35 }, { u: 0.5, v: 0.4 });
  proche(z.u1, 0.3, 1e-9);
  proche(z.u2, 0.7, 1e-9);
  proche(z.v1, 0.25, 1e-9);
  proche(z.v2, 0.55, 1e-9);
  proche(z.u2 - z.u1, 0.4, 1e-9, 'la largeur ne change pas');
});

test('tirer une poignée ne bouge que son côté', () => {
  const zone = { zone: { u1: 0.2, v1: 0.2, u2: 0.6, v2: 0.5 } };
  const z = transformer(zone, 'd', { u: 0.6, v: 0.35 }, { u: 0.8, v: 0.35 });
  proche(z.u1, 0.2, 1e-9, 'le bord gauche reste');
  proche(z.u2, 0.8, 1e-9);
  proche(z.v1, 0.2, 1e-9);
  proche(z.v2, 0.5, 1e-9);
});

test('les appareils proposés au client excluent la caméra en place', () => {
  const liste = appareilsClient();
  assert.ok(liste.length >= 3);
  assert.ok(liste.some((a) => /Téléphone/.test(a)));
  assert.ok(!liste.some((a) => /bloc 2/.test(a)),
    'un particulier n\'a pas de « bloc 2 »');
});
