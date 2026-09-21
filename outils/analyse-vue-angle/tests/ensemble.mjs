/**
 * Le projet complet : les deux études réunies.
 *
 * L'erreur qui coûterait le plus cher ici est une addition malhonnête.
 * Additionner la partie chiffrée, taire celle qui ne l'est pas, et présenter
 * la somme comme le prix du projet — le client signe en croyant connaître son
 * budget, et découvre l'autre moitié à la facture. Plusieurs de ces tests ne
 * vérifient rien d'autre que cela.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VOLETS, CLE_ENSEMBLE, JOURS_PEREMPTION,
  anciennete, combiner, texteEnsemble, lireVolets, noterVolet,
} from '../js/ensemble.js';

const JOUR = 86400000;
const MAINTENANT = Date.parse('2026-09-21T12:00:00Z');
const leJour = (n) => new Date(MAINTENANT - n * JOUR).toISOString();

const video = (extra = {}) => ({
  cle: 'video', resume: '3 caméras', totalHt: 1325.41, totalTtc: 1590.49,
  chiffre: true, enregistreLe: leJour(0), ...extra,
});
const alarme = (extra = {}) => ({
  cle: 'alarme', resume: '10 détecteurs', totalHt: 0, totalTtc: 0,
  chiffre: false, enregistreLe: leJour(0), ...extra,
});

/* ------------------------------------------------------------ la somme */

test('deux volets chiffrés : le total est celui des deux', () => {
  const e = combiner({ video: video(), alarme: alarme({ totalTtc: 900, chiffre: true }) },
    MAINTENANT);
  assert.equal(e.volets.length, 2);
  assert.ok(e.complet && e.chiffre);
  assert.equal(e.partiel, false);
  assert.ok(Math.abs(e.totalTtc - (1590.49 + 900)) < 0.01, `${e.totalTtc}`);
  assert.deepEqual(e.manquants, []);
});

test('un volet non chiffré rend le total PARTIEL, et le dit', () => {
  /*
   * Le tarif alarme est volontairement vide tant que les prix ne sont pas
   * relevés. Afficher 1 590,50 € comme « le total » quand la moitié du projet
   * n'est pas chiffrée ferait croire au client qu'il connaît son budget.
   */
  const e = combiner({ video: video(), alarme: alarme() }, MAINTENANT);
  assert.equal(e.chiffre, false, 'le projet n\'est pas chiffré');
  assert.equal(e.partiel, true, 'et le total doit être annoncé comme partiel');
  assert.deepEqual(e.nonChiffres, ['Alarme anti-intrusion']);
  assert.ok(Math.abs(e.totalTtc - 1590.49) < 0.01, 'seul le volet chiffré compte');

  const texte = texteEnsemble(e).join('\n');
  assert.match(texte, /Total partiel/);
  assert.match(texte, /Alarme anti-intrusion restant à chiffrer/);
  assert.match(texte, /non chiffrée sur le site/);
});

test('aucun volet chiffré : aucun total n\'est avancé', () => {
  const e = combiner({ alarme: alarme() }, MAINTENANT);
  assert.equal(e.totalTtc, 0);
  assert.equal(e.chiffre, false);
  assert.equal(e.partiel, false, 'rien à additionner, donc rien de partiel');
  const texte = texteEnsemble(e).join('\n');
  assert.ok(!/Total/.test(texte), `aucun total ne doit être écrit : ${texte}`);
});

test('un volet « chiffré » à zéro euro ne passe pas pour une gratuité', () => {
  const e = combiner({ video: video({ totalTtc: 0, chiffre: true }), alarme: alarme() },
    MAINTENANT);
  assert.equal(e.chiffre, false, 'zéro euro n\'est pas un prix');
  assert.equal(e.nonChiffres.length, 2);
});

test('les montants s\'écrivent comme sur les devis', () => {
  /*
   * `toFixed(2)` sur le flottant brut écrivait 1590,49 € au courriel là où
   * l'écran affichait 1 590,50 € : deux chiffres différents pour la même
   * estimation, dans le même envoi. 1590,495 est précisément un montant où
   * les deux arrondis divergent — d'où sa présence ici.
   */
  const texte = texteEnsemble(combiner({
    video: video({ totalTtc: 1590.495 }), alarme: alarme(),
  }, MAINTENANT)).join('\n');
  assert.match(texte, /1\u202f590,50 €/, texte);
  assert.ok(!/1590,49/.test(texte), `l'arrondi du courriel diffère de l'écran : ${texte}`);
});

test('un seul volet n\'annonce pas un « total des deux »', () => {
  const texte = texteEnsemble(combiner({ video: video() }, MAINTENANT)).join('\n');
  assert.match(texte, /Vidéosurveillance/);
  assert.ok(!/Total/.test(texte), `aucun total sous une seule étude : ${texte}`);
});

/* ------------------------------------------------------- ce qui manque */

test('un seul volet : l\'autre est proposé, avec son adresse relative', () => {
  const e = combiner({ video: video() }, MAINTENANT);
  assert.equal(e.complet, false);
  assert.equal(e.manquants.length, 1);
  assert.equal(e.manquants[0].cle, 'alarme');
  /*
   * Relative : les deux pages se trouvent qu'elles soient servies à la racine
   * d'un domaine, sous un sous-dossier ou dans un cadre.
   */
  assert.ok(!/^https?:|^\//.test(e.manquants[0].page), e.manquants[0].page);
  assert.ok(e.manquants[0].invitation.length > 20, 'une invitation, pas une étiquette');
});

test('rien du tout : les deux volets sont proposés, sans erreur', () => {
  for (const cas of [undefined, null, {}, { video: null }, { inconnu: video() },
    { video: { cle: 'chantier' } }]) {
    const e = combiner(cas, MAINTENANT);
    assert.equal(e.volets.length, 0, JSON.stringify(cas));
    assert.equal(e.manquants.length, 2, JSON.stringify(cas));
    assert.deepEqual(texteEnsemble(e), []);
  }
});

/* ------------------------------------------------------------- l'âge */

test('une étude qui a pris de l\'âge est signalée', () => {
  assert.equal(anciennete({ enregistreLe: leJour(45) }, MAINTENANT), 45);
  assert.equal(anciennete({ enregistreLe: 'hier' }, MAINTENANT), null);
  assert.equal(anciennete({}, MAINTENANT), null);

  const vieux = combiner({ video: video({ enregistreLe: leJour(JOURS_PEREMPTION + 15) }) },
    MAINTENANT);
  assert.equal(vieux.anciens.length, 1);
  assert.match(texteEnsemble(vieux).join('\n'), /il y a 45 jours/);

  // Fraîche : rien ne doit encombrer le récapitulatif.
  const frais = combiner({ video: video({ enregistreLe: leJour(2) }) }, MAINTENANT);
  assert.equal(frais.anciens.length, 0);
  assert.ok(!/il y a/.test(texteEnsemble(frais).join('\n')));
});

/* -------------------------------------------------------- le rangement */

/** Un rangement de navigateur en mémoire. */
function rangementFactice(depart = {}) {
  const boite = { ...depart };
  return {
    boite,
    getItem: (c) => (c in boite ? boite[c] : null),
    setItem: (c, v) => { boite[c] = String(v); },
  };
}

test('déposer un volet ne touche pas à l\'autre', () => {
  const r = rangementFactice();
  noterVolet('video', video(), r);
  noterVolet('alarme', alarme(), r);
  const tout = lireVolets(r);
  assert.deepEqual(Object.keys(tout).sort(), ['alarme', 'video']);
  assert.equal(tout.video.resume, '3 caméras');

  // Refaire l'étude caméras ne doit pas effacer l'étude alarme.
  noterVolet('video', video({ resume: '5 caméras' }), r);
  const apres = lireVolets(r);
  assert.equal(apres.video.resume, '5 caméras');
  assert.ok(apres.alarme, 'le volet alarme a disparu');
});

test('un rangement illisible ou refusé rend un projet vide, jamais une erreur', () => {
  /*
   * Navigation privée, cookies bloqués, quota atteint : la page doit
   * fonctionner sans. Et le contenu n'a pas été écrit par cette page-ci — on
   * ne peut pas lui faire confiance.
   */
  assert.deepEqual(lireVolets(undefined), {});
  assert.deepEqual(lireVolets(rangementFactice({ [CLE_ENSEMBLE]: '{cassé' })), {});
  assert.deepEqual(lireVolets(rangementFactice({ [CLE_ENSEMBLE]: '[1,2,3]' })), {});
  assert.deepEqual(lireVolets(rangementFactice({ [CLE_ENSEMBLE]: 'null' })), {});

  const refuse = {
    getItem: () => { throw new Error('bloqué'); },
    setItem: () => { throw new Error('bloqué'); },
  };
  assert.deepEqual(lireVolets(refuse), {});
  assert.doesNotThrow(() => noterVolet('video', video(), refuse));
});

test('ce qui est déposé est borné et typé', () => {
  /*
   * Ce rangement est relu par l'AUTRE page, qui l'affichera. On n'y met donc
   * ni objet inattendu, ni texte sans fin : un résumé de 50 000 caractères
   * remplirait le quota et ferait échouer tous les enregistrements suivants.
   */
  const r = rangementFactice();
  noterVolet('video', {
    resume: 'x'.repeat(5000),
    lignes: Array.from({ length: 200 }, (_, i) => ({ role: `r${i}`, quantite: '3' })),
    totalTtc: 'beaucoup',
    chiffre: 'oui',
  }, r);
  const v = lireVolets(r).video;
  assert.ok(v.resume.length <= 400, `${v.resume.length} caractères`);
  assert.ok(v.lignes.length <= 40, `${v.lignes.length} lignes`);
  assert.equal(v.totalTtc, 0, 'un montant illisible vaut zéro, pas NaN');
  assert.equal(v.chiffre, true, 'et le drapeau reste un booléen');
  assert.equal(typeof v.lignes[0].quantite, 'number');
  assert.ok(Date.parse(v.enregistreLe), 'la date de dépôt est posée par le module');
});

test('un volet inconnu n\'entre pas dans le rangement', () => {
  const r = rangementFactice();
  noterVolet('chantier', video(), r);
  assert.deepEqual(lireVolets(r), {});
  assert.deepEqual(Object.keys(VOLETS).sort(), ['alarme', 'video']);
});
