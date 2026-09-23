/**
 * Tests de la mise en page du dossier client.
 *
 * Ce que l'agence arrête — l'ordre des chapitres, leur intitulé, ceux qu'elle
 * écarte, les textes qu'elle ajoute, le saut de page — doit se retrouver
 * exactement dans le fichier produit. Et le fichier doit rester autonome :
 * pas un lien vers l'extérieur, sans quoi il s'affiche vide chez le client.
 *
 * Exécution : node --test tests/dossier.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fiche, sectionsDuDossier, dossierParDefaut, SECTIONS_STANDARD,
} from '../js/editeur-fiche.js';

const ici = dirname(fileURLToPath(import.meta.url));
const REELLE = JSON.parse(readFileSync(
  join(ici, '..', '..', '..', 'etudes', '2026-09-22-site-industriel', 'etude.json'), 'utf8',
));
const AGENCE = JSON.parse(readFileSync(
  join(ici, '..', '..', '..', 'agence.json'), 'utf8',
));

const copie = () => JSON.parse(JSON.stringify(REELLE));
const PLAN = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

/** L'ordre d'apparition des titres de chapitre dans le document produit. */
const titres = (html) => [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((m) => m[1].trim());

/* ------------------------------------------------------ la liste réglée */

test('sans réglage, le dossier garde l\'ordre naturel et tout est visible', () => {
  const s = sectionsDuDossier(copie());
  assert.deepEqual(s.map((x) => x.cle), SECTIONS_STANDARD.map((x) => x.cle));
  assert.ok(s.every((x) => x.visible !== false));
});

test('un chapitre apparu depuis l\'enregistrement s\'ajoute à la fin', () => {
  const e = copie();
  e.dossier = { sections: [{ cle: 'reserves', titre: 'Réserves', visible: true }] };
  const s = sectionsDuDossier(e);
  assert.equal(s[0].cle, 'reserves', 'l\'ordre choisi par l\'agence passe avant');
  assert.equal(s.length, SECTIONS_STANDARD.length);
  assert.ok(s.slice(1).every((x) => x.cle !== 'reserves'), 'aucun doublon');
});

test('une clé inconnue est écartée, un texte libre est gardé', () => {
  const e = copie();
  e.dossier = {
    sections: [
      { cle: 'inventee', titre: 'Chapitre fantôme', visible: true },
      { cle: 'texte-1', type: 'texte', titre: 'Mot', corps: 'Bonjour', visible: true },
    ],
  };
  const cles = sectionsDuDossier(e).map((x) => x.cle);
  assert.ok(!cles.includes('inventee'));
  assert.ok(cles.includes('texte-1'));
});

test('le réglage par défaut est complet et cochable', () => {
  const d = dossierParDefaut();
  assert.equal(d.sautDePage, false);
  assert.equal(d.sections.length, SECTIONS_STANDARD.length);
  assert.ok(d.sections.every((s) => s.visible === true && s.titre));
});

/* --------------------------------------------------- le dossier produit */

test('l\'ordre choisi par l\'agence est l\'ordre du dossier', () => {
  const e = copie();
  e.dossier = {
    sautDePage: false,
    sections: [
      { cle: 'reserves', titre: 'Réserves', visible: true },
      { cle: 'cameras', titre: 'Les caméras', visible: true },
      { cle: 'chiffres', titre: 'Ce que l\'installation compte', visible: true },
      { cle: 'plan', titre: 'Le plan d\'implantation', visible: true },
      { cle: 'cablage', titre: 'Câblage', visible: true },
    ],
  };
  assert.deepEqual(titres(fiche(e, AGENCE, PLAN)).slice(0, 3),
    ['Réserves', 'Les caméras', 'Ce que l&#39;installation compte']);
});

test('un chapitre décoché ne sort pas — et son contenu non plus', () => {
  const e = copie();
  e.dossier = dossierParDefaut();
  e.dossier.sections.find((s) => s.cle === 'cablage').visible = false;
  const html = fiche(e, AGENCE, PLAN);
  assert.ok(!titres(html).includes('Câblage'));
  assert.ok(!html.includes('boîtes de 305 m'), 'le tableau du câblage est parti avec le titre');
  assert.ok(titres(html).includes('Les caméras'), 'le reste est intact');
});

test('l\'intitulé que l\'agence écrit est celui qui s\'imprime', () => {
  const e = copie();
  e.dossier = dossierParDefaut();
  e.dossier.sections.find((s) => s.cle === 'cameras').titre = 'Le parc proposé';
  assert.ok(titres(fiche(e, AGENCE, PLAN)).includes('Le parc proposé'));
});

test('un texte ajouté sort en paragraphes, à sa place, échappé', () => {
  const e = copie();
  e.dossier = dossierParDefaut();
  e.dossier.sections.splice(1, 0, {
    cle: 'texte-a', type: 'texte', visible: true,
    titre: 'Remise de prestation',
    corps: 'Formation au logiciel.\n\nGarantie 3 ans & maintenance <offerte> 1 an.',
  });
  const html = fiche(e, AGENCE, PLAN);
  assert.equal(titres(html)[1], 'Remise de prestation');
  assert.ok(html.includes('<p>Formation au logiciel.</p>'));
  assert.ok(html.includes('&amp; maintenance &lt;offerte&gt;'), 'le texte est échappé');
});

test('un texte vide ne laisse pas un titre tout seul', () => {
  const e = copie();
  e.dossier = dossierParDefaut();
  e.dossier.sections.push({
    cle: 'texte-b', type: 'texte', titre: 'Chapitre jamais écrit', corps: '   ', visible: true,
  });
  assert.ok(!titres(fiche(e, AGENCE, PLAN)).includes('Chapitre jamais écrit'));
});

test('sans photo, le chapitre des vues ne s\'imprime pas', () => {
  const e = copie();
  delete e.photos;
  assert.ok(!titres(fiche(e, AGENCE, PLAN)).includes('Le site, vue par vue'));
});

/* ----------------------------------------------------------------- PDF */

test('le saut de page ne s\'applique qu\'entre les chapitres, pas avant le premier', () => {
  const e = copie();
  e.dossier = { ...dossierParDefaut(), sautDePage: true };
  const html = fiche(e, AGENCE, PLAN);
  const premier = html.indexOf('<h2');
  assert.ok(!html.slice(premier, premier + 40).includes('saut'),
    'le premier chapitre ne commence pas par une page blanche');
  assert.equal((html.match(/class="saut"/g) || []).length,
    titres(html).length - 1);
});

test('sans le réglage, aucun saut forcé', () => {
  const e = copie();
  e.dossier = dossierParDefaut();
  assert.ok(!fiche(e, AGENCE, PLAN).includes('class="saut"'));
});

test('le dossier s\'imprime en A4 et cache le bouton à l\'impression', () => {
  const html = fiche(copie(), AGENCE, PLAN);
  assert.ok(html.includes('@page { size:A4 portrait;'));
  assert.ok(/@media print \{[\s\S]*\.pdf \{ display:none; \}/.test(html));
  assert.ok(html.includes('window.print()'), 'le bouton PDF est là');
});

test('le bandeau de chiffres ne sort pas de la feuille A4', () => {
  const html = fiche(copie(), AGENCE, PLAN);
  assert.ok(/\.chiffres \{ display:grid;/.test(html),
    'en flex, la cinquième case refusait de rétrécir et débordait de la page');
  assert.ok(!/\.chiffres \{ display:flex/.test(html));
});

test('rien ne se coupe en deux : les blocs lourds sont insécables', () => {
  const style = fiche(copie(), AGENCE, PLAN);
  for (const regle of ['break-inside:avoid', 'page-break-inside:avoid',
    'break-after:avoid']) {
    assert.ok(style.includes(regle), `règle d'impression manquante : ${regle}`);
  }
});

/* ---------------------------------------------------------- autonomie */

test('le dossier ne va rien chercher sur Internet', () => {
  const e = copie();
  e.dossier = dossierParDefaut();
  e.dossier.sections.push({
    cle: 'texte-c', type: 'texte', titre: 'Note', corps: 'Voir https://exemple.fr', visible: true,
  });
  const html = fiche(e, AGENCE, PLAN);
  const liens = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]*/g)];
  assert.deepEqual(liens.map((m) => m[0]), [],
    'une ressource externe s\'affiche vide le jour où le serveur tombe');
});
