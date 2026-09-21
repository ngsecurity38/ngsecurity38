/**
 * Le pays du chantier : la TVA, et ce que la loi y demande.
 *
 * L'agence intervient en France et en Belgique. Tant que les pages
 * calculaient à 20 %, un client belge recevait une estimation fausse de
 * plusieurs centaines d'euros — sur une page publique, présentée comme celle
 * de l'agence. C'est ce que ces tests empêchent de revenir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { PAYS, pays, tauxTva, choixTva, lireChoix, reservesPays } from '../js/pays.js';
import { devis, ligne } from '../js/prix.js';

test('la Belgique ne se calcule pas à 20 %', () => {
  assert.equal(tauxTva('fr', 'normal').taux, 0.20);
  assert.equal(tauxTva('be', 'normal').taux, 0.21);

  // L'écart sur une estimation courante : ce que le client aurait lu en trop.
  const lignes = [ligne({ prixVente: 1325.41 }, 1)];
  const fr = devis(lignes, { tva: tauxTva('fr', 'normal').taux });
  const be = devis(lignes, { tva: tauxTva('be', 'normal').taux });
  assert.ok(be.totalTtc > fr.totalTtc, `${be.totalTtc} contre ${fr.totalTtc}`);
  assert.ok(Math.abs((be.totalTtc - fr.totalTtc) - 13.25) < 0.05,
    `écart de ${(be.totalTtc - fr.totalTtc).toFixed(2)} €`);
});

test('un taux réduit ne s\'applique jamais tout seul', () => {
  /*
   * Son éligibilité dépend de conditions que la page ne peut pas vérifier —
   * ancienneté du logement, attestation du client. L'annoncer d'office ferait
   * une estimation trop basse que l'agence devrait ensuite reprendre devant
   * le client.
   */
  for (const cle of Object.keys(PAYS)) {
    const defaut = tauxTva(cle);
    assert.equal(defaut.cle, 'normal', `${cle} : le taux par défaut doit être le taux plein`);
    assert.equal(defaut.condition, undefined, `${cle} : le taux plein n'a pas de condition`);

    const reduit = PAYS[cle].taux.find((t) => t.cle === 'reduit');
    assert.ok(reduit.taux < defaut.taux, cle);
    assert.match(reduit.condition, /confirmer par l'agence/, `${cle} : ${reduit.condition}`);
  }
});

test('un taux inconnu retombe sur le taux plein, jamais sur zéro', () => {
  for (const cas of [undefined, 'inconnu', '', null, 'NORMAL']) {
    const r = tauxTva('fr', cas);
    assert.ok(r.taux > 0, `${cas} : taux ${r.taux}`);
  }
  // Et un pays inconnu reste la France, plutôt que rien.
  assert.equal(pays('xx').cle, 'fr');
  assert.equal(tauxTva('xx', 'normal').taux, 0.20);
});

test('les taux se corrigent dans le tarif, sans reconstruire les pages', () => {
  /*
   * Un taux de TVA change par décision publique. L'agence doit pouvoir le
   * corriger dans le fichier de tarif, comme un prix.
   */
  assert.equal(tauxTva('be', 'normal', { be: { normal: 0.22 } }).taux, 0.22);
  // Mais pas n'importe quoi : une saisie aberrante ne remplace pas le taux.
  // Zéro compris : `Number(null)` vaut 0, et un champ vidé par mégarde
  // annoncerait un total toutes taxes égal au hors taxes.
  for (const aberrant of [-0.1, 1.5, 'vingt', null, NaN, 0, '']) {
    assert.equal(tauxTva('be', 'normal', { be: { normal: aberrant } }).taux, 0.21,
      `${aberrant} ne doit pas passer`);
  }
});

test('le choix proposé au visiteur nomme le pays et le taux', () => {
  const choix = choixTva();
  assert.equal(choix.length, 4, JSON.stringify(choix));
  assert.ok(choix.some((c) => /France/.test(c.label) && /20 %/.test(c.label)), JSON.stringify(choix));
  assert.ok(choix.some((c) => /Belgique/.test(c.label) && /21 %/.test(c.label)), JSON.stringify(choix));
  // Aller-retour : ce que la liste produit doit se relire.
  for (const c of choix) {
    const lu = lireChoix(c.valeur);
    assert.ok(PAYS[lu.pays], c.valeur);
    assert.ok(tauxTva(lu.pays, lu.taux).taux > 0, c.valeur);
  }
  // Sans deux-points, rien à lire : on retombe sur la France au taux plein.
  assert.deepEqual(lireChoix('n importe quoi'), { pays: 'fr', taux: 'normal' });
  assert.deepEqual(lireChoix('xx:inconnu'), { pays: 'fr', taux: 'inconnu' });
  assert.deepEqual(lireChoix(''), { pays: 'fr', taux: 'normal' });
});

test('chaque pays dit ce que SA loi demande, et ne promet rien', () => {
  /*
   * Une certification française ne veut rien dire à Bruxelles, et la Belgique
   * impose des démarches que la France ignore. Ces réserves posent la
   * question en nommant l'organisme — elles ne tranchent pas.
   */
  const fr = reservesPays('fr', 'alarme').join(' ');
  assert.match(fr, /NF A2P/);
  assert.ok(!/INCERT/.test(fr), 'la certification belge n\'a rien à faire ici');

  const be = reservesPays('be', 'alarme').join(' ');
  assert.match(be, /INCERT/);
  assert.match(be, /déclaré/, 'la déclaration obligatoire doit être signalée');
  assert.match(be, /à vérifier/i, 'rien n\'est affirmé comme un avis juridique');
  assert.ok(!/NF A2P française/.test(be) === false || /NF A2P/.test(be), be);

  assert.match(reservesPays('be', 'video').join(' '), /pictogramme/);
  assert.match(reservesPays('fr', 'video').join(' '), /préfectorale/);

  // La condition du taux retenu vient en tête, là où on la lit.
  const avec = reservesPays('fr', 'alarme', tauxTva('fr', 'reduit'));
  assert.match(avec[0], /deux ans/, JSON.stringify(avec));
  assert.equal(reservesPays('fr', 'alarme', tauxTva('fr', 'normal')).length,
    reservesPays('fr', 'alarme').length, 'le taux plein n\'ajoute rien');
});

test('les deux pays servis sont déclarés, et seulement eux', () => {
  assert.deepEqual(Object.keys(PAYS).sort(), ['be', 'fr']);
  for (const p of Object.values(PAYS)) {
    assert.ok(p.label && p.taux.length >= 1, p.cle);
    assert.ok(p.alarme.length && p.video.length, `${p.cle} : réserves manquantes`);
  }
});
