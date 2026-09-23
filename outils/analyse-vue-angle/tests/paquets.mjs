/**
 * Tests des fichiers uniques produits par build.mjs.
 * Exécution : node --test tests/paquets.mjs
 *
 * Ces pages sont concaténées à la main par le build : ce qui casse ici ne
 * casse ni au lint ni aux tests de modules, et ne se voit qu'une fois la
 * page ouverte — souvent chez le client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const dist = join(ici, '..', 'dist');
const lire = (...p) => readFileSync(join(dist, ...p), 'utf8');

const PAGES = [
  'analyse-vue-angle.html', 'devis-client.html', 'alarme-client.html',
  'presentation.html', 'editeur.html',
];

test('les pages sont bien produites', () => {
  for (const p of PAGES) {
    assert.ok(existsSync(join(dist, p)), `${p} manque — lancer node build.mjs`);
  }
});

test('le raccourci $$ survit à la concaténation', () => {
  /*
   * Le piège : dans une chaîne de remplacement, « $$ » veut dire « un
   * dollar ». Un paquet inséré par String.replace avec une chaîne perd donc
   * ses `$$`, et la page meurt sur « $ has already been declared » — sans
   * qu'aucun test de module ne s'en aperçoive.
   */
  for (const p of PAGES) {
    const t = lire(p);
    if (!t.includes('querySelectorAll')) continue;
    assert.ok(
      t.includes('const $$ ='),
      `${p} : le raccourci $$ a été réduit à $ pendant l'insertion du paquet`,
    );
    assert.equal(
      (t.match(/^const \$ = /gm) || []).length, 1,
      `${p} : « $ » est déclaré plus d'une fois`,
    );
  }
});

test('aucun import ni export ne subsiste dans un fichier unique', () => {
  for (const p of PAGES) {
    const t = lire(p);
    assert.equal((t.match(/^import\s+\{/gm) || []).length, 0, `${p} : import restant`);
    assert.equal((t.match(/^export\s+(const|function|class)/gm) || []).length, 0,
      `${p} : export restant`);
  }
});

test('l\'éditeur embarque son étude et son logo', () => {
  const t = lire('editeur.html');
  assert.match(t, /window\.__etude=\{/, 'l\'étude doit être embarquée');
  assert.match(t, /src="data:image\/png;base64,/, 'le logo doit être embarqué');
  assert.ok(t.includes('demarrer();'), 'le paquet doit s\'amorcer tout seul');
  // Il ne s'adresse pas aux visiteurs : il ne doit pas se faire indexer.
  assert.match(t, /name="robots" content="noindex/);
});

test('l\'éditeur n\'est lié depuis aucune page publique', () => {
  for (const p of PAGES.filter((x) => x !== 'editeur.html')) {
    assert.ok(!lire(p).includes('editeur.html'),
      `${p} renvoie vers l'éditeur : c'est l'atelier de l'agence, pas un outil de visiteur`);
  }
  const accueil = join(dist, 'site', 'devis', 'index.html');
  if (existsSync(accueil)) {
    assert.ok(!readFileSync(accueil, 'utf8').includes('/editeur'));
  }
});
