/**
 * Tests des moyens de paiement affichés sur les documents.
 * Exécution : node --test tests/paiement.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOYENS, moyensAcceptes, badgesPaiement } from '../js/paiement.js';

const ici = dirname(fileURLToPath(import.meta.url));
const AGENCE = JSON.parse(readFileSync(join(ici, '..', '..', '..', 'agence.json'), 'utf8'));

test('l\'agence choisit ses moyens, dans son ordre', () => {
  const a = { paiements: ['paypal', 'virement'] };
  assert.deepEqual(moyensAcceptes(a), ['paypal', 'virement']);
});

test('un moyen inconnu est écarté, pas dessiné au hasard', () => {
  const a = { paiements: ['virement', 'bitcoin', 'carte'] };
  assert.deepEqual(moyensAcceptes(a), ['virement', 'carte']);
});

test('sans réponse, le virement seul', () => {
  assert.deepEqual(moyensAcceptes({}), ['virement']);
  assert.deepEqual(moyensAcceptes({ paiements: [] }), ['virement']);
});

test('chaque moyen porte son nom écrit, pas seulement un dessin', () => {
  /*
   * Un pictogramme seul ne se lit pas en noir et blanc, et ne se lit pas du
   * tout par un lecteur d'écran.
   */
  const html = badgesPaiement({ paiements: ['virement', 'carte', 'paypal'] });
  for (const cle of ['virement', 'carte', 'paypal']) {
    assert.ok(html.includes(MOYENS[cle].label), `${cle} doit être nommé`);
  }
  assert.equal((html.match(/<svg/g) || []).length, 3);
});

test('un logo officiel déposé remplace le pictogramme', () => {
  /*
   * Les logos Visa, Mastercard et PayPal sont des marques déposées : on ne
   * les redessine pas de mémoire. L'agence dépose le fichier officiel, et
   * il prend la place.
   */
  const a = {
    paiements: ['carte', 'paypal'],
    logosPaiement: { paypal: 'data:image/png;base64,iVBORw0KGgo=' },
  };
  const html = badgesPaiement(a);
  assert.ok(html.includes('<img src="data:image/png;base64,iVBORw0KGgo="'));
  assert.equal((html.match(/<svg/g) || []).length, 1, 'la carte garde le sien');
  assert.ok(html.includes('PayPal'), 'le nom reste écrit sous le logo');
});

test('une adresse de logo ne peut pas casser le document', () => {
  const html = badgesPaiement({
    paiements: ['carte'],
    logosPaiement: { carte: '"><script>alert(1)</script>' },
  });
  assert.ok(!html.includes('<script>'), 'le contenu déposé est échappé');
});

test('aucun dessin ne prétend être une marque déposée', () => {
  /*
   * Rien dans les pictogrammes ne doit porter le nom d'une marque de carte :
   * un logo approximatif se voit, et il n'a rien à faire sur une facture.
   */
  for (const [cle, m] of Object.entries(MOYENS)) {
    for (const marque of ['Visa', 'Mastercard', 'CB', 'American']) {
      assert.ok(!m.symbole.includes(marque), `${cle} ne doit pas imiter ${marque}`);
    }
  }
});

test('la fiche de l\'agence déclare ses moyens', () => {
  assert.deepEqual(moyensAcceptes(AGENCE), ['virement', 'carte', 'paypal']);
  // Tant qu'aucun fichier officiel n'est déposé, ce sont nos pictogrammes.
  assert.deepEqual(AGENCE.logosPaiement, {});
});
