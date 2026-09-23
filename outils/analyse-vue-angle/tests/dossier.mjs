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
import { reglagesPdf, pdfParDefaut, MARGES } from '../js/papier.js';
import { bilanEtude } from '../js/etude-plan.js';

const ici = dirname(fileURLToPath(import.meta.url));
const REELLE = JSON.parse(readFileSync(
  join(ici, '..', '..', '..', 'etudes', '2026-09-22-site-industriel', 'etude.json'), 'utf8',
));
const AGENCE = JSON.parse(readFileSync(
  join(ici, '..', '..', '..', 'agence.json'), 'utf8',
));
const DEVIS = JSON.parse(readFileSync(join(
  ici, '..', '..', '..', 'etudes', '2026-09-22-site-industriel', 'devis.json',
), 'utf8'));

const copie = () => JSON.parse(JSON.stringify(REELLE));
const PLAN = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

/** L'ordre d'apparition des titres de chapitre dans le document produit. */
const titres = (html) => [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((m) => m[1].trim());

/* ------------------------------------------------------ la liste réglée */

test('sans réglage, le dossier garde l\'ordre naturel et tout est visible', () => {
  const nu = copie();
  delete nu.dossier;
  const s = sectionsDuDossier(nu);
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

/* ------------------------------------------------------------ le papier */

test('sans réglage, le papier est A4 portrait à marges normales', () => {
  assert.deepEqual(reglagesPdf(copie()), pdfParDefaut());
  assert.ok(fiche(copie(), AGENCE, PLAN).includes('@page { size:A4 portrait;'));
});

test('le format, le sens et les marges choisis passent dans la feuille', () => {
  const e = copie();
  e.dossier = { pdf: { format: 'A3', orientation: 'landscape', marges: 'larges' } };
  const page = fiche(e, AGENCE, PLAN).match(/@page \{[^}]*\}/)[0];
  assert.ok(page.includes('size:A3 landscape'));
  assert.ok(page.includes(MARGES.larges.css));
});

test('un réglage inventé retombe sur le papier par défaut', () => {
  const e = copie();
  e.dossier = { pdf: { format: 'papyrus', orientation: 'de travers', marges: 'aucune' } };
  assert.deepEqual(reglagesPdf(e), pdfParDefaut());
  assert.ok(fiche(e, AGENCE, PLAN).includes('@page { size:A4 portrait;'));
});

/* --------------------------------------------------------- la couverture */

test('le titre, la référence et le destinataire sont ceux de l\'étude', () => {
  const e = copie();
  e.titre = 'Vidéosurveillance du dépôt';
  e.reference = 'ETU-2026-10-04';
  e.client = 'SCI des Drillons & fils';
  const html = fiche(e, AGENCE, PLAN);
  assert.ok(html.includes('<h1>Vidéosurveillance du dépôt</h1>'));
  assert.ok(html.includes('ETU-2026-10-04'));
  assert.ok(html.includes('<b>Pour :</b> SCI des Drillons &amp; fils'));
});

test('sans destinataire, pas de ligne vide sur la couverture', () => {
  const e = copie();
  delete e.client;
  assert.ok(!fiche(e, AGENCE, PLAN).includes('Pour :'));
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

/* ------------------------------------------- le dossier en un seul bloc */

test('sans devis, le chapitre du chiffrage n\'existe pas', () => {
  const html = fiche(copie(), AGENCE, PLAN);
  assert.ok(!titres(html).includes('Le chiffrage'));
  assert.ok(html.includes('Il ne vaut ni devis ni engagement'),
    'et la réserve dit bien qu\'aucun montant n\'y figure');
});

test('avec devis, le dossier porte le bordereau et change sa réserve', () => {
  const html = fiche(copie(), AGENCE, PLAN, DEVIS);
  assert.ok(titres(html).includes('Le chiffrage'));
  assert.ok(html.includes('Supports, coffrets et accessoires'), 'les lots du devis y sont');
  // Le tarif est renseigné : le bandeau de brouillon a disparu. « Document
  // de travail » subsiste en pied de page, mais c'est l'étude qui le dit,
  // pas un bandeau d'alerte au-dessus du prix.
  assert.ok(!html.includes('class="avis"'), 'aucun bandeau rouge');
  assert.ok(/postes restent\s+à chiffrer/.test(html));
  assert.ok(html.includes('Total TTC'));
  assert.ok(!html.includes('Il ne vaut ni devis ni engagement'),
    'la réserve ne peut plus dire qu\'aucun montant n\'y figure');
});

test('le dossier porte le synoptique, et il vaut celui du module', () => {
  const html = fiche(copie(), AGENCE, PLAN);
  assert.ok(titres(html).includes('Le synoptique de raccordement'));
  assert.ok(html.includes('COFFRETS DÉPORTÉS'));
  assert.ok(html.includes('LOCAL TECHNIQUE'));
});

test('tous les chapitres tiennent dans un seul fichier, sans lien externe', () => {
  const e = copie();
  e.dossier = dossierParDefaut();
  // Sans photo, le chapitre des vues ne sort pas : sept titres, pas huit.
  const sansPhoto = { ...e, photos: [] };
  assert.equal(titres(fiche(sansPhoto, AGENCE, PLAN, DEVIS)).length,
    SECTIONS_STANDARD.length - 1, 'sans photo, le chapitre des vues ne sort pas');
  const html = fiche(e, AGENCE, PLAN, DEVIS);
  assert.equal(titres(html).length, SECTIONS_STANDARD.length,
    'avec ses photos, tous les chapitres y sont');
  assert.deepEqual([...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]*/g)].map((m) => m[0]), []);
  assert.equal((html.match(/<html/g) || []).length, 1, 'un seul document');
});

test('le chiffrage s\'écarte et se déplace comme n\'importe quel chapitre', () => {
  const e = copie();
  e.dossier = dossierParDefaut();
  const d = e.dossier.sections;
  const i = d.findIndex((s) => s.cle === 'devis');
  d.unshift(...d.splice(i, 1));
  assert.equal(titres(fiche(e, AGENCE, PLAN, DEVIS))[0], 'Le chiffrage');
  d[0].visible = false;
  assert.ok(!titres(fiche(e, AGENCE, PLAN, DEVIS)).includes('Le chiffrage'));
});

test('le dossier porte la garantie et la maintenance', () => {
  const html = fiche(copie(), AGENCE, PLAN);
  assert.ok(titres(html).includes('Garantie, maintenance et suivi'));
  assert.ok(html.includes('<b>3 ans</b>'));
  assert.ok(html.includes('<b>1 an offert</b>'));
});

test('une fiche modèle n\'imprime jamais un NaN', () => {
  const e = copie();
  delete e.modeles.panoramique.focale;
  delete e.modeles.varifocal.ir;
  // Les images embarquées sont du base64 : « NaN » s'y trouve par hasard.
  // On ne cherche que dans le texte de la page.
  const html = fiche(e, AGENCE, PLAN).replace(/data:[^"]+/g, '');
  assert.ok(!/NaN/.test(html), 'une donnée absente se tait, elle n\'écrit pas NaN');
  assert.ok(!/undefined/.test(html));
});

test('la fiche technique ne parle que des modèles posés', () => {
  const e = copie();
  e.modeles.fantome = { reference: 'Modèle jamais posé', resH: 100, resV: 100, angleH: 90 };
  const html = fiche(e, AGENCE, PLAN);
  assert.ok(!html.includes('Modèle jamais posé'));
  assert.ok(html.includes(e.modeles.turret.reference));
});

/* ------------------------------------------------ la profondeur d'archive */

test('le dossier propose les deux profondeurs, et dit celle qui est retenue', () => {
  const html = fiche(copie(), AGENCE, PLAN);
  assert.ok(titres(html).includes('La profondeur d&#39;archive'));
  assert.ok(/15 jours d'enregistrement continu/.test(html));
  assert.ok(/30 jours d'enregistrement continu/.test(html));
  assert.ok(html.includes('1 disque de 10 To'));
  assert.ok(html.includes('2 disques de 10 To'));
  assert.ok(html.includes('RETENU'));
  assert.ok(html.includes('EN OPTION'));
});

test('quinze jours tiennent sur un disque, trente en demandent deux', () => {
  const e = copie();
  const court = bilanEtude(e, { jours: 15 }).disques.pool;
  const long = bilanEtude(e, { jours: 30 }).disques.pool;
  assert.equal(court.nombre, 1, 'une baie suffit à quinze jours');
  assert.equal(long.nombre, 2);
  assert.equal(court.unitaire, long.unitaire, 'le même disque, en double');
});

test('sans variante déclarée, le chapitre ne montre qu\'une carte', () => {
  const e = copie();
  delete e.stockage.variante;
  const html = fiche(e, AGENCE, PLAN);
  assert.ok(!html.includes('EN OPTION'));
  assert.ok(html.includes('RETENU'));
});

test('aucun tiret long dans le dossier remis au client', () => {
  /*
   * L'agence signe ce dossier. Le tiret cadratin est la ponctuation que
   * personne ne tape au clavier : il trahit un texte composé à la machine.
   * On le traque dans le texte, pas dans les images embarquées.
   */
  const e = copie();
  const html = fiche(e, AGENCE, PLAN, DEVIS)
    .replace(/data:[^"]+/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '');
  const i = html.indexOf('—');
  assert.equal(i, -1, i < 0 ? '' : `tiret long : « ${html.slice(i - 70, i + 70)} »`);
});

test('une caméra qui couvre toute la vue ne noie pas la photo', () => {
  /*
   * Une panoramique de 180° reportée sur une photo de 53° déborde largement.
   * Son aplat rouge recouvrait l'image entière, et deux caméras sur la même
   * vue la rendaient illisible.
   */
  const e = copie();
  const pano = e.cameras.find((c) => e.modeles[c.modele].capteurUnique);
  assert.ok(pano, 'l\'étude porte bien une panoramique');
  e.photos = [{
    cle: 'V1', titre: 'Essai', champ: 52.8,
    src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    reperes: [{ camera: pano.cle, bande: 0.5 }],
  }];
  const html = fiche(e, AGENCE, PLAN);
  assert.ok(/class="champ large"/.test(html), 'la bande large perd son fond');
  assert.ok(html.includes('.report .champ.large { background:none; }'));
  assert.ok(html.includes('toute la vue'));
});

test('une caméra au champ étroit garde son aplat', () => {
  const e = copie();
  const etroite = e.cameras.find((c) => c.tele);
  e.photos = [{
    cle: 'V1', titre: 'Essai', champ: 52.8,
    src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    reperes: [{ camera: etroite.cle, bande: 0.5 }],
  }];
  const html = fiche(e, AGENCE, PLAN);
  assert.ok(/class="champ"/.test(html));
  assert.ok(!/class="champ large"/.test(html));
});
