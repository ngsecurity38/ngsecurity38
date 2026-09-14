/**
 * Tests de la lecture du texte d'une étude.
 * Exécution : node --test tests/etude.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { analyserEtude, champsPourCamera, confronter } from '../js/lecture-etude.js';
import { anglesDeChamp, CAPTEURS } from '../js/optique.js';

/** Étude type, telle qu'un PDF la restitue : une page par élément du dossier. */
const ETUDE = [
  [
    "ÉTUDE D'IMPLANTATION VIDÉOPROTECTION",
    'Client : SCI Les Ateliers',
    'Site : ZA de Chartreuse, 38500 Voiron',
    'Affaire n° 2026-118',
  ].join('\n'),
  [
    'CAM 04 — Parking nord',
    'Caméra bullet extérieure, capteur 1/2.8"',
    'Objectif fixe 2,8 mm — angle de vue 105°',
    'Résolution 1920 x 1080',
    'Hauteur de pose : 3,5 m',
    'Distance à la scène : 15 m',
    'Niveau attendu : reconnaissance des personnes',
  ].join('\n'),
  [
    'Caméra n° 7 — Quai de livraison',
    'Objectif varifocal 2,8 - 12 mm',
    'Capteur 1/1.8"',
    'Résolution 4 MP',
    'Hauteur 4 m, portée 28 m',
    'Niveau attendu : identification',
  ].join('\n'),
];

test('en-tête : client, site et affaire', () => {
  const e = analyserEtude(ETUDE);
  assert.equal(e.entete.client.valeur, 'SCI Les Ateliers');
  assert.match(e.entete.site.valeur, /ZA de Chartreuse/);
  assert.equal(e.entete.affaire.valeur, '2026-118');
  assert.equal(e.entete.client.page, 1, 'la page d\'origine est citée');
});

test('les caméras sont repérées et normalisées', () => {
  const e = analyserEtude(ETUDE);
  assert.deepEqual(e.cameras.map((c) => c.repere), ['CAM 04', 'CAM 07']);
  assert.equal(e.cameras[0].page, 2);
  assert.equal(e.cameras[1].page, 3);
});

test('les valeurs restent dans la section de leur caméra', () => {
  const e = analyserEtude(ETUDE);
  const c4 = champsPourCamera(e, 'CAM 04');
  assert.equal(c4.focale.valeur, 2.8);
  assert.equal(c4.angle.valeur, 105);
  assert.equal(c4.capteur.valeur, '1/2.8"');
  assert.deepEqual(c4.resolution.valeur, { h: 1920, v: 1080 });
  assert.equal(c4.hauteur.valeur, 3.5);
  assert.equal(c4.distance.valeur, 15);
  assert.equal(c4.niveau.valeur, 'reconnaissance');

  const c7 = champsPourCamera(e, 'CAM 07');
  assert.equal(c7.capteur.valeur, '1/1.8"', 'le capteur de CAM 04 ne déborde pas sur CAM 07');
  assert.equal(c7.hauteur.valeur, 4);
  assert.equal(c7.distance.valeur, 28);
  assert.equal(c7.niveau.valeur, 'identification');
});

test('varifocal : la borne basse est retenue, c\'est le champ le plus large', () => {
  const c7 = champsPourCamera(analyserEtude(ETUDE), 'CAM 07');
  assert.equal(c7.focale.valeur, 2.8);
});

test('chaque valeur cite sa page et son extrait', () => {
  const c4 = champsPourCamera(analyserEtude(ETUDE), 'CAM 04');
  assert.equal(c4.focale.page, 2);
  assert.match(c4.focale.extrait, /Objectif fixe 2,8 mm/);
  assert.equal(c4.focale.unite, 'mm');
});

test('résolutions : paire de pixels, mégapixels, noms commerciaux', () => {
  const lire = (ligne) => analyserEtude([ligne]).champs.resolution?.valeur;
  assert.deepEqual(lire('Résolution 2560 x 1440'), { h: 2560, v: 1440 });
  assert.deepEqual(lire('Caméra 4K UHD'), { h: 3840, v: 2160 });
  assert.deepEqual(lire('Capteur Full HD'), { h: 1920, v: 1080 });
  assert.equal(lire('Définition 5 MP').h, 2592);
  assert.equal(lire('8 Mégapixels').h, 3840);
});

test('les faux positifs numériques sont écartés', () => {
  const e = analyserEtude(['Référence produit 12 x 3 du catalogue 2026']);
  assert.equal(e.champs.resolution, undefined);
  const f = analyserEtude(['Câble de 30 mm de diamètre']);
  assert.equal(f.champs.focale, undefined, 'un « mm » sans contexte optique n\'est pas une focale');
  const g = analyserEtude(['Objectif 900 mm']);
  assert.equal(g.champs.focale, undefined, 'valeur hors des focales plausibles');
});

test('étude d\'une seule caméra, sans section : tout est relevé', () => {
  const e = analyserEtude([[
    'Remplacement de la caméra du hall',
    'Focale 6 mm, capteur 1/3"',
    'Hauteur de pose 2,8 m',
  ].join('\n')]);
  assert.equal(e.cameras.length, 0);
  assert.equal(e.champs.focale.valeur, 6);
  assert.equal(e.champs.capteur.valeur, '1/3"');
  assert.equal(e.champs.hauteur.valeur, 2.8);
});

test('une page unique peut être passée sans tableau', () => {
  const e = analyserEtude('Focale 8 mm sur capteur 1/2"');
  assert.equal(e.champs.focale.valeur, 8);
});

test('texte PDF : espaces insécables et guillemets typographiques', () => {
  const e = analyserEtude(['Capteur 1/2.8” — focale 4 mm']);
  assert.equal(e.champs.capteur.valeur, '1/2.8"');
  assert.equal(e.champs.focale.valeur, 4);
});

test('l\'axe de l\'angle annoncé est reconnu', () => {
  const axe = (ligne) => analyserEtude([ligne]).champs.angle;
  assert.equal(axe('Angle de vue 105°').axe, 'horizontal', 'horizontal par défaut');
  assert.equal(axe('Angle de vue horizontal 90°').axe, 'horizontal');
  assert.equal(axe('Angle de vue diagonal 120°').axe, 'diagonal');
  assert.equal(axe('Champ vertical 45°').axe, 'vertical');
});

/* ------------------------------------------------------- confrontation */

const POSE = {
  capteur: CAPTEURS['1/2.8"'],
  capteurCle: '1/2.8"',
  focale: 4,
  angles: anglesDeChamp(CAPTEURS['1/2.8"'], 4),
  resolution: { h: 1920, v: 1080 },
  distance: 15,
  hauteur: 3.5,
};

test('confrontation : une focale plus longue que l\'étude est signalée', () => {
  const champs = champsPourCamera(analyserEtude(ETUDE), 'CAM 04');
  const lignes = confronter(champs, POSE, anglesDeChamp);
  const focale = lignes.find((l) => l.libelle === 'Focale');
  assert.equal(focale.conforme, false);
  assert.equal(focale.etude, '2,8 mm');
  assert.equal(focale.installe, '4 mm');
  assert.match(focale.remarque, /\+1,2 mm/);

  const angle = lignes.find((l) => l.cle === 'angle');
  assert.equal(angle.libelle, 'Angle de vue horizontal');
  assert.equal(angle.conforme, false, '105° demandés contre 65,8° obtenus');
});

test('confrontation : distance et hauteur conformes ne remontent aucun écart', () => {
  const champs = champsPourCamera(analyserEtude(ETUDE), 'CAM 04');
  const lignes = confronter(champs, POSE, anglesDeChamp);
  assert.equal(lignes.find((l) => l.libelle === 'Distance à la scène').conforme, true);
  assert.equal(lignes.find((l) => l.libelle === 'Hauteur de pose').conforme, true);
  assert.equal(lignes.find((l) => l.libelle === 'Capteur').conforme, true);
  assert.equal(lignes.find((l) => l.libelle === 'Résolution').conforme, true);
});

test('confrontation : sans angle annoncé, il est déduit de la focale de l\'étude', () => {
  const champs = { focale: { valeur: 4, unite: 'mm', page: 1, extrait: 'focale 4 mm' } };
  const angle = confronter(champs, POSE, anglesDeChamp).find((l) => l.cle === 'angle');
  assert.equal(angle.conforme, true, 'même focale, même capteur : conforme');
  assert.match(angle.remarque, /déduit de la focale/);
});

test('confrontation : un angle diagonal est comparé à la diagonale', () => {
  const champs = { angle: { valeur: 93.4, unite: '°', page: 1, extrait: '', axe: 'diagonal' } };
  const pose = { ...POSE, focale: 2.8, angles: anglesDeChamp(CAPTEURS['1/2.8"'], 2.8) };
  const ligne = confronter(champs, pose, anglesDeChamp).find((l) => l.cle === 'angle');
  assert.equal(ligne.libelle, 'Angle de vue diagonal');
  assert.equal(ligne.conforme, true, 'la diagonale à 2,8 mm vaut bien environ 93°');
  // Comparée à l'horizontale (82,5°), la même valeur passerait pour un écart.
  const horizontal = confronter(
    { angle: { ...champs.angle, axe: 'horizontal' } }, pose, anglesDeChamp,
  ).find((l) => l.cle === 'angle');
  assert.equal(horizontal.conforme, false);
});

test('confrontation : une résolution supérieure à l\'étude reste conforme', () => {
  const champs = { resolution: { valeur: { h: 1920, v: 1080 }, unite: '', page: 1, extrait: '' } };
  const pose = { ...POSE, resolution: { h: 2560, v: 1440 } };
  const ligne = confronter(champs, pose, anglesDeChamp).find((l) => l.libelle === 'Résolution');
  assert.equal(ligne.conforme, true);
});

test('confrontation : une étude muette ne produit aucune ligne', () => {
  assert.deepEqual(confronter({}, POSE, anglesDeChamp), []);
});

/* ------------------------------------------------- formulations rencontrées */

/** Relève une caractéristique sur une ou deux lignes, hors de toute section. */
const lire = (cle, ...lignes) => analyserEtude([lignes.join('\n')]).champs[cle];

test('focale : notations des fiches constructeur', () => {
  assert.equal(lire('focale', 'Focale : 3,6 mm').valeur, 3.6);
  assert.equal(lire('focale', 'f = 3,6 mm').valeur, 3.6);
  assert.equal(lire('focale', 'f=2.8mm').valeur, 2.8);
  assert.equal(lire('focale', 'Objectif 2.8mm/F2.0').valeur, 2.8);
  assert.equal(lire('focale', 'Lentille 6 mm').valeur, 6);
  assert.equal(lire('focale', 'Optique : 4mm').valeur, 4);
  assert.equal(lire('focale', 'Objectif varifocal motorisé 2,7 — 13,5 mm').valeur, 2.7);
  assert.equal(lire('focale', '4 mm de focale').valeur, 4);
});

test('angle : notations abrégées des fiches produit', () => {
  assert.equal(lire('angle', 'H : 102° V : 54°').valeur, 102);
  assert.equal(lire('angle', 'H : 102° V : 54°').axe, 'horizontal');
  assert.equal(lire('angle', '106°(H) / 56°(V)').valeur, 106);
  assert.equal(lire('angle', 'AOV 106°').valeur, 106);
  assert.equal(lire('angle', 'FOV : 90 °').valeur, 90);
  assert.equal(lire('angle', "Angle d'ouverture 110 degrés").valeur, 110);
  assert.equal(lire('angle', 'Champ de vision horizontal 87,7°').valeur, 87.7);
});

test('capteur : pouces écrits en toutes lettres ou en abrégé', () => {
  assert.equal(lire('capteur', 'CMOS 1/2,8 pouce').valeur, '1/2.8"');
  assert.equal(lire('capteur', 'Capteur : 1/1.8 in').valeur, '1/1.8"');
  assert.equal(lire('capteur', '1/2.9" progressive scan CMOS').valeur, '1/2.9"');
  assert.equal(lire('capteur', 'Capteur 1/3 pouces').valeur, '1/3"');
});

test('résolution : espaces de milliers, suffixes p, mégapixels', () => {
  assert.deepEqual(lire('resolution', 'Définition 1 920 x 1 080').valeur, { h: 1920, v: 1080 });
  assert.deepEqual(lire('resolution', 'Flux principal 2688 × 1520').valeur, { h: 2688, v: 1520 });
  assert.deepEqual(lire('resolution', 'Enregistrement 1080p').valeur, { h: 1920, v: 1080 });
  assert.deepEqual(lire('resolution', 'Caméra 2160p').valeur, { h: 3840, v: 2160 });
  assert.equal(lire('resolution', 'Capteur 8 Mpix').valeur.h, 3840);
});

test('valeurs en tableau : reprises sous leur en-tête de colonne', () => {
  const focale = lire('focale', 'Focale     Capteur      Résolution', '2,8 mm    1/2.8"    1920 x 1080');
  assert.equal(focale.valeur, 2.8, 'la valeur sous un en-tête « Focale » est retenue');
  const hauteur = lire('hauteur', 'Hauteur de pose', '3,50 m');
  assert.equal(hauteur.valeur, 3.5);
});

test('en-tête ambigu : rien plutôt qu\'une valeur prise à l\'envers', () => {
  // « Hauteur » et « Distance » partagent l'unité : impossible de dire à quelle
  // colonne appartient le premier nombre.
  const deux = analyserEtude(['Hauteur    Distance\n3,5 m    15 m']);
  assert.equal(deux.champs.hauteur, undefined);
  assert.equal(deux.champs.distance, undefined);
});

test('« hauteur sous plafond » décrit le local, pas la pose', () => {
  assert.equal(lire('hauteur', 'Hauteur sous plafond : 2,70 m'), undefined);
  assert.equal(lire('hauteur', 'Hauteur de pose : 3,5 m').valeur, 3.5);
});

test('repères caméra : formes admises et pièges écartés', () => {
  const reperes = (t) => analyserEtude([t]).cameras.map((c) => c.repere);
  assert.deepEqual(reperes('CAM04 - Parking'), ['CAM 04']);
  assert.deepEqual(reperes('CAM-7 : Quai'), ['CAM 07']);
  assert.deepEqual(reperes('Caméra n° 12'), ['CAM 12']);
  assert.deepEqual(reperes('Caméra 4K UHD'), [], 'une définition n\'est pas un repère');
  assert.deepEqual(reperes('Caméra 4 MP extérieure'), [], 'ni une résolution');
  assert.deepEqual(reperes('Caméra 105 °'), [], 'ni un angle');
});

test('une caméra citée à deux endroits ne compte que pour une', () => {
  const e = analyserEtude([
    'CAM 04 - Parking nord\nObjectif fixe 2,8 mm',
    'CAM 07 - Quai\nObjectif 6 mm',
    'Récapitulatif\nCAM 04 : hauteur de pose 3,5 m',
  ]);
  assert.deepEqual(e.cameras.map((c) => c.repere), ['CAM 04', 'CAM 07']);
  const c4 = champsPourCamera(e, 'CAM 04');
  assert.equal(c4.focale.valeur, 2.8, 'valeur de la fiche détaillée');
  assert.equal(c4.hauteur.valeur, 3.5, 'valeur reprise du récapitulatif');
});

test('les caméras sont rendues dans l\'ordre de leur numéro', () => {
  const e = analyserEtude(['CAM 12 : hall\nCAM 03 : cour\nCAM 07 : quai']);
  assert.deepEqual(e.cameras.map((c) => c.repere), ['CAM 03', 'CAM 07', 'CAM 12']);
});

test('numéros : le symbole degré manque souvent après lecture optique', () => {
  const affaire = (t) => analyserEtude([t]).entete.affaire?.valeur;
  assert.equal(affaire('Affaire n° 2026-118'), '2026-118');
  assert.equal(affaire('Affaire n 2026-118'), '2026-118', 'degré perdu par l\'OCR');
  assert.equal(affaire('Dossier numéro 45'), '45');
  assert.equal(affaire('Référence AB-12'), 'AB-12');
  assert.equal(affaire('Affaire n'), undefined, 'un reste d\'abréviation n\'est pas une référence');

  const reperes = (t) => analyserEtude([t]).cameras.map((c) => c.repere);
  assert.deepEqual(reperes('Caméra n 7 - Quai'), ['CAM 07'], 'degré perdu par l\'OCR');
  assert.deepEqual(reperes('Caméra numéro 12'), ['CAM 12']);
});

/* ------------------------------- étude réelle : fiche caméra en tableau ---- */

/**
 * Fiche caméra telle qu'elle se présente dans une étude d'implantation
 * réellement reçue : tableau à deux colonnes, libellé puis valeur, majuscules
 * partout, caméra bispectrale.
 */
const FICHE_REELLE = [
  'N° CAMERA CAMERA 4',
  'TYPE DE CAMERA THERMIQUE',
  'OBJECTIF OBJECTIF THERMIQUE 3,5MM – OBJECTIF CONTEXTE 4MM',
  'REFERENCE CAMERA DAHUA– DHI-TPC-BF1241',
  'DEBIT CAMERA 4 Mbits/s',
  'Nombre pixel/m 62',
  "HAUTEUR D'IMPLANTATION 4,5m",
].join('\n');

test('fiche réelle : la caméra est repérée, sans caméra fantôme', () => {
  const e = analyserEtude([FICHE_REELLE]);
  assert.deepEqual(e.cameras.map((c) => c.repere), ['CAM 04']);
});

test('fiche réelle : un débit n\'est pas un repère de caméra', () => {
  // « DEBIT CAMERA 8 Mbits/s » créait auparavant une caméra 8 inexistante.
  const e = analyserEtude(['N° CAMERA CAMERA 4\nDEBIT CAMERA 8 Mbits/s']);
  assert.deepEqual(e.cameras.map((c) => c.repere), ['CAM 04']);
});

test('fiche réelle : « REFERENCE CAMERA » n\'est pas un numéro d\'affaire', () => {
  const e = analyserEtude([FICHE_REELLE]);
  assert.equal(e.entete.affaire, undefined, 'la référence produit ne doit pas passer pour l\'affaire');
  assert.equal(champsPourCamera(e, 'CAM 04').modele.valeur, 'DAHUA– DHI-TPC-BF1241');
});

test('fiche réelle : « HAUTEUR D\'IMPLANTATION » est relevée', () => {
  assert.equal(champsPourCamera(analyserEtude([FICHE_REELLE]), 'CAM 04').hauteur.valeur, 4.5);
});

test('fiche réelle : les deux objectifs d\'une bispectrale sont retenus', () => {
  const c = champsPourCamera(analyserEtude([FICHE_REELLE]), 'CAM 04');
  assert.deepEqual(c.focale.variantes, [
    { valeur: 3.5, libelle: 'thermique' },
    { valeur: 4, libelle: 'contexte' },
  ]);
});

test('fiche réelle : type de caméra et densité exigée', () => {
  const c = champsPourCamera(analyserEtude([FICHE_REELLE]), 'CAM 04');
  assert.equal(c.type.valeur, 'THERMIQUE');
  assert.equal(c.densite.valeur, 62, 'la ligne « Nombre pixel/m » porte l\'exigence');
});

test('bispectrale : la focale posée est confrontée au bon objectif', () => {
  const champs = champsPourCamera(analyserEtude([FICHE_REELLE]), 'CAM 04');
  const thermique = {
    capteur: CAPTEURS['Thermique 256×192 — 12 µm'],
    capteurCle: 'Thermique 256×192 — 12 µm',
    focale: 3.5,
    angles: anglesDeChamp(CAPTEURS['Thermique 256×192 — 12 µm'], 3.5),
    resolution: { h: 256, v: 192 },
    distance: 15,
    hauteur: 4.5,
  };
  const ligne = confronter(champs, thermique, anglesDeChamp).find((l) => l.cle === 'focale');
  assert.equal(ligne.conforme, true, 'le 3,5 mm thermique est bien l\'un des deux objectifs');
  assert.match(ligne.etude, /3,5 mm \(thermique\)/);
  assert.match(ligne.etude, /4 mm \(contexte\)/);
  assert.match(ligne.remarque, /objectif thermique/);

  // La même étude, contrôlée cette fois sur l'objectif contexte.
  const contexte = {
    ...thermique,
    capteur: CAPTEURS['1/2.8"'],
    capteurCle: '1/2.8"',
    focale: 4,
    angles: anglesDeChamp(CAPTEURS['1/2.8"'], 4),
    resolution: { h: 1920, v: 1080 },
  };
  const ligne2 = confronter(champs, contexte, anglesDeChamp).find((l) => l.cle === 'focale');
  assert.equal(ligne2.conforme, true);
  assert.match(ligne2.remarque, /objectif contexte/);

  // Un 6 mm ne correspond à aucun des deux.
  const autre = { ...contexte, focale: 6, angles: anglesDeChamp(CAPTEURS['1/2.8"'], 6) };
  assert.equal(confronter(champs, autre, anglesDeChamp).find((l) => l.cle === 'focale').conforme, false);
});

test('la densité exigée est confrontée à celle réellement obtenue', () => {
  const champs = { densite: { valeur: 62, unite: 'px/m', page: 1, extrait: 'Nombre pixel/m 62' } };
  // 1920 px sur 19,4 m de large à 15 m : environ 99 px/m, au-dessus de l'exigence.
  const large = confronter(champs, POSE, anglesDeChamp).find((l) => l.cle === 'densite');
  assert.equal(large.conforme, true);
  assert.equal(large.etude, '62 px/m');

  // La même caméra visant deux fois plus loin retombe sous l'exigence.
  const loin = { ...POSE, distance: 30 };
  const serre = confronter(champs, loin, anglesDeChamp).find((l) => l.cle === 'densite');
  assert.equal(serre.conforme, false);
  assert.match(serre.remarque, /en deçà/);
});

test('capteur thermique : le champ calculé colle à la fiche constructeur', () => {
  // Dahua TPC-BF1241, objectif thermique 3,5 mm sur matrice 256 × 192 au pas de
  // 12 µm. Le constructeur annonce environ 50° × 37°.
  const a = anglesDeChamp(CAPTEURS['Thermique 256×192 — 12 µm'], 3.5);
  assert.ok(Math.abs(a.horizontal - 50) < 4, `champ horizontal ${a.horizontal}`);
  assert.ok(Math.abs(a.vertical - 37) < 4, `champ vertical ${a.vertical}`);
});
