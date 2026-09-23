/**
 * Le bandeau de navigation des pages d'outil.
 *
 * Servies sous /outils/ par un conteneur distinct du site, les deux pages ne
 * traversent pas l'application qui construit le menu des autres pages. Ce
 * bandeau est donc leur seule porte de sortie : s'il se trompe d'adresse, le
 * visiteur est dans une impasse sans que rien ne le signale.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MENU_DEFAUT, memePage, entreesMenu, lienAilleurs } from '../js/menu.js';

test('la page ouverte se reconnaît quelle que soit la forme de son adresse', () => {
  for (const chemin of ['/outils/devis/', '/outils/devis', '/outils/devis/index.html',
    '/outils/devis/?retour=1', '/Outils/Devis/']) {
    assert.ok(memePage('/outils/devis/', chemin), `non reconnu : ${chemin}`);
  }
  assert.ok(!memePage('/outils/devis/', '/outils/etude/'), 'deux outils distincts');
  assert.ok(!memePage('/outils/devis/', ''), 'chemin inconnu : aucune entrée signalée');
  assert.ok(!memePage('', ''), 'deux vides ne font pas une correspondance');
});

test('une seule entrée est marquée, et elle correspond à la page ouverte', () => {
  const e = entreesMenu(MENU_DEFAUT, '/outils/etude/');
  assert.equal(e.filter((x) => x.courant).length, 1);
  assert.equal(e.find((x) => x.courant).href, '/outils/etude/');
  /*
   * « Nos produits » mène à la racine du site : sans mise à plat correcte,
   * « / » correspondrait à tout et se marquerait sur les deux outils.
   */
  assert.equal(entreesMenu(MENU_DEFAUT, '/outils/devis/').find((x) => x.courant).href,
    '/outils/devis/');
});

test('ailleurs : la page d\'outil garde une porte vers la boutique', () => {
  // L'agence garde le .fr : c'est là que la boutique vit.
  const a = lienAilleurs(MENU_DEFAUT);
  assert.match(a.href, /^https:\/\/ngsecurity38\.fr\//);
  assert.ok(a.texte.length > 0);
  assert.equal(lienAilleurs({ liens: [], ailleurs: null }), null, 'et il se retire');
});

test('le menu par défaut ne mène qu\'à des adresses vérifiées', () => {
  /*
   * Une rubrique inventée — « /alarme-ajax/ » parce que le site parle d'Ajax —
   * produirait un lien mort dans un menu, ce qui coûte plus cher que son
   * absence. Seules l'accueil et les deux outils sont sûrs.
   */
  const connues = new Set(['/', '/outils/etude/', '/outils/devis/', '/outils/alarme/']);
  for (const l of MENU_DEFAUT.liens) {
    assert.ok(connues.has(l.href), `adresse non vérifiée au menu : ${l.href}`);
    assert.ok(l.texte.trim().length > 0, 'entrée sans libellé');
  }
  assert.equal(MENU_DEFAUT.marque.href, '/', 'le mot-marque ramène à l\'accueil');
});

test('un menu vide ou abîmé se rabat sur celui par défaut', () => {
  /*
   * menu.json est édité à la main sur le serveur. Une virgule de trop, une
   * liste vidée par mégarde, et la page ne doit pas se retrouver sans aucune
   * sortie : mieux vaut le menu d'origine qu'un bandeau vide.
   */
  for (const cas of [null, undefined, {}, { liens: [] }, { liens: 'oui' }]) {
    assert.equal(entreesMenu(cas, '/outils/etude/').length, MENU_DEFAUT.liens.length,
      `cas ${JSON.stringify(cas)}`);
  }
  // En revanche une entrée incomplète est simplement ignorée, pas fatale.
  const e = entreesMenu({ liens: [{ texte: 'Bon', href: '/' }, { texte: 'Sans adresse' }] }, '');
  assert.deepEqual(e.map((x) => x.texte), ['Bon']);
});

test('menu.json livré : conforme à ce que la page attend', async () => {
  const { default: livre } = await import('../menu.json', { with: { type: 'json' } });
  assert.ok(Array.isArray(livre.liens) && livre.liens.length >= 3, 'les rubriques');
  assert.deepEqual(entreesMenu(livre, '/outils/devis/').map((x) => x.href),
    MENU_DEFAUT.liens.map((x) => x.href),
    'le fichier livré et le secours embarqué doivent dire la même chose');
  assert.equal(lienAilleurs(livre).href, lienAilleurs(MENU_DEFAUT).href);
});
