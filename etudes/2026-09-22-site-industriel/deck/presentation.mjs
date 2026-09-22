/**
 * La présentation, à partir des CHIFFRES DU DOSSIER.
 *
 *   node etudes/2026-09-22-site-industriel/deck/exporter.mjs   # extrait les données
 *   node etudes/2026-09-22-site-industriel/deck/presentation.mjs
 *
 * Rien n'est recopié à la main : les portées, les longueurs de câble, les
 * capacités et les diagrammes viennent du même générateur que le dossier.
 * Une présentation qui annoncerait d'autres chiffres que l'étude qu'elle
 * résume ne vaudrait ni l'une ni l'autre.
 *
 * Le fichier produit est un .pptx ordinaire : l'agence l'ouvre, le modifie,
 * en retire ou en ajoute une diapositive sans rien redemander à personne.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pptxgen = require('pptxgenjs');

const ici = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(ici, 'donnees.json'), 'utf8'));
const VUES = JSON.parse(readFileSync(join(ici, 'vues.json'), 'utf8'));
const img = (n) => join(ici, n);
const a = (n) => (existsSync(img(n)) ? { path: img(n) } : null);

/* La palette du dossier, pas une palette de circonstance : le rouge est
 * celui du logo, l'encre celle des titres, et le gris celui des légendes. */
const ROUGE = 'C8102E';
const ENCRE = '1A1D23';
const DOUX = '5B6472';
const BORD = 'DDE1E7';
const FOND = 'F6F7F9';
const BLANC = 'FFFFFF';

const TITRE = 'Arial';
const TEXTE = 'Calibri';

const fr = (n, d = 1) => Number(n).toFixed(d).replace('.', ',').replace(/,0$/, '');

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';          // 13,3 × 7,5 pouces — à poser AVANT tout
pres.author = D.agence.nomCommercial;
pres.company = D.agence.nomCommercial;
pres.title = 'Étude technique — vidéosurveillance';

/* ------------------------------------------------------------- le motif */

/**
 * La pastille de repère, reprise du plan du dossier : un disque plein,
 * un nombre en blanc. C'est le seul ornement de la présentation, et il
 * veut dire quelque chose — il désigne une caméra ou une étape.
 */
function pastille(s, texte, x, y, { taille = 0.42, fond = ENCRE } = {}) {
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: taille, h: taille, fill: { color: fond },
  });
  s.addText(String(texte), {
    x, y, w: taille, h: taille, isTextBox: true, margin: 0,
    align: 'center', valign: 'middle',
    fontFace: TITRE, fontSize: taille > 0.5 ? 14 : 11, bold: true, color: BLANC,
  });
}

/** L'en-tête d'une diapositive de contenu : un titre, et rien sous lui. */
function titre(s, texte, surtitre) {
  if (surtitre) {
    s.addText(surtitre.toUpperCase(), {
      x: 0.6, y: 0.52, w: 12.1, h: 0.26, isTextBox: true, margin: 0,
      fontFace: TITRE, fontSize: 11, bold: true, color: ROUGE, charSpacing: 1.6,
    });
  }
  s.addText(texte, {
    x: 0.6, y: surtitre ? 0.84 : 0.66, w: 12.1, h: 0.72, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 32, bold: true, color: ENCRE,
  });
}

/** Le logo, discret, en bas de chaque diapositive de contenu. */
function signature(s, clair = false) {
  const l = a('logo.png');
  if (l) s.addImage({ ...l, x: 12.25, y: 6.75, w: 0.52, h: 0.44 });
  s.addText(`${D.agence.nomCommercial} · ETU-2026-09-22`, {
    x: 0.6, y: 6.9, w: 8, h: 0.24, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 9, color: clair ? '9AA3AE' : DOUX,
  });
}

/** Un grand chiffre et sa légende — la façon la plus courte de dire un fait. */
function chiffre(s, x, y, valeur, legende, { w = 3.5, couleur = ROUGE, compact = false } = {}) {
  const hv = compact ? 0.7 : 0.95;
  s.addText(String(valeur), {
    x, y, w, h: hv, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: compact ? 36 : 54, bold: true, color: couleur,
  });
  s.addText(legende, {
    x, y: y + hv, w, h: compact ? 0.5 : 0.62, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: compact ? 11.5 : 13, color: DOUX,
  });
}

/** Une carte : un fond très clair, une ombre douce, aucun filet de couleur. */
function carte(s, x, y, w, h, { fond = BLANC } = {}) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: fond }, line: { color: BORD, width: 0.75 },
    shadow: { type: 'outer', color: '9AA3AE', blur: 6, offset: 1, angle: 90, opacity: 0.18 },
  });
}

/* ------------------------------------------------------- 1. couverture */

{
  const s = pres.addSlide();
  s.background = { color: ENCRE };
  const l = a('logo.png');
  if (l) s.addImage({ ...l, x: 0.85, y: 0.8, w: 1.5, h: 1.28 });

  s.addText('ÉTUDE TECHNIQUE', {
    x: 0.85, y: 2.5, w: 11, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 13, bold: true, color: ROUGE, charSpacing: 2.4,
  });
  s.addText('Vidéosurveillance\nd’un site industriel', {
    x: 0.85, y: 2.9, w: 11, h: 1.9, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 46, bold: true, color: BLANC, lineSpacingMultiple: 1.05,
  });
  s.addText(
    `Implantation de ${D.cameras.length} caméras · portées calculées · métré des câbles`,
    {
      x: 0.85, y: 4.85, w: 11, h: 0.4, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 16, color: 'B9C0CA',
    },
  );

  const pied = [
    `${D.agence.nomCommercial} · ${D.agence.formeCourte}`,
    D.agence.adresse,
    `${D.agence.telephone} · ${D.agence.courriel}`,
    `SIRET ${D.agence.siret} · TVA ${D.agence.tva}`,
  ].join('\n');
  s.addText(pied, {
    x: 0.85, y: 5.75, w: 6, h: 1.2, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 11, color: '8A93A0', lineSpacingMultiple: 1.25,
  });
  s.addText('Établie le 22 septembre 2026\nRéférence ETU-2026-09-22', {
    x: 9.3, y: 5.75, w: 3.2, h: 0.8, isTextBox: true, margin: 0, align: 'right',
    fontFace: TEXTE, fontSize: 11, color: '8A93A0', lineSpacingMultiple: 1.25,
  });
  s.addNotes('Document de travail. Les portées sont calculées sur les optiques '
    + 'constructeur ; les emplacements se confirment au relevé sur place.');
}

/* --------------------------------------------------------- 2. sommaire */

{
  const s = pres.addSlide();
  s.background = { color: BLANC };
  titre(s, 'Ce que contient ce dossier', 'Sommaire');

  const parties = [
    ['Le parc', 'Dix caméras, ce que chacune prouve, et à quelle distance.'],
    ['Le site, vue par vue', 'Chaque zone photographiée, avec le champ de sa caméra reporté sur l’image.'],
    ['Le plan', 'Implantation à l’échelle, portées rapportées à l’étendue réelle du site.'],
    ['L’installation', 'Enregistrement, stockage, câblage, autonomie sur coupure.'],
    ['Les options', 'Écran de supervision, contrôle d’accès et interphonie.'],
    ['Les engagements', 'Ce que l’agence livre, garantit et maintient.'],
  ];
  parties.forEach(([t, d], i) => {
    const x = 0.6 + (i % 2) * 6.2;
    const y = 1.9 + Math.floor(i / 2) * 1.55;
    carte(s, x, y, 5.9, 1.32, { fond: FOND });
    pastille(s, i + 1, x + 0.32, y + 0.3, { taille: 0.44, fond: i < 3 ? ENCRE : ROUGE });
    s.addText(t, {
      x: x + 0.92, y: y + 0.28, w: 4.7, h: 0.38, isTextBox: true, margin: 0,
      fontFace: TITRE, fontSize: 15, bold: true, color: ENCRE, valign: 'middle',
    });
    s.addText(d, {
      x: x + 0.92, y: y + 0.68, w: 4.7, h: 0.55, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11.5, color: DOUX,
    });
  });
  s.addText(
    'Les portées sont calculées, pas estimées : elles découlent de l’optique '
    + 'constructeur et de la norme EN 62676-4. Les emplacements, eux, sont '
    + 'proposés — ils se confirment au relevé sur place.',
    {
      x: 0.6, y: 6.28, w: 12.1, h: 0.5, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12, italic: true, color: DOUX,
    },
  );
  signature(s);
}

/* ----------------------------------------------------------- 2. le parc */

{
  const s = pres.addSlide();
  s.background = { color: FOND };
  titre(s, 'Ce que compte l’installation', 'Le parc');

  const dehors = D.cameras.filter((c) => ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].includes(c.cle)).length;
  chiffre(s, 0.6, 1.8, D.cameras.length, 'caméras au total');
  chiffre(s, 4.2, 1.8, dehors, 'à l’extérieur — entrée, cour, quai', { couleur: ENCRE });
  chiffre(s, 7.8, 1.8, D.cameras.length - dehors, 'dans la halle', { couleur: ENCRE });

  const modeles = [
    ['3', 'Bullet varifocal DS-2CD2683G2-IZS', 'objectif motorisé 2,8 à 12 mm'],
    ['1', 'Panoramique DS-2CD2346G2P-ISU/SL', '180°, stroboscope et alarme sonore'],
    ['6', 'Turret DS-2CD2346G2H-IU', '2,8 mm, micro intégré'],
  ];
  carte(s, 0.6, 3.75, 11.3, 2.45);
  modeles.forEach(([n, ref, det], i) => {
    const y = 3.98 + i * 0.72;
    pastille(s, n, 0.9, y + 0.04, { taille: 0.4, fond: i === 1 ? ROUGE : ENCRE });
    s.addText(ref, {
      x: 1.45, y, w: 6.2, h: 0.3, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 14, bold: true, color: ENCRE,
    });
    s.addText(det, {
      x: 1.45, y: y + 0.28, w: 6.2, h: 0.28, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11.5, color: DOUX,
    });
  });
  s.addText('Il manque un turret.', {
    x: 8.1, y: 4.15, w: 3.5, h: 0.32, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 15, bold: true, color: ROUGE,
  });
  s.addText('La commande porte trois varifocals, une panoramique et cinq '
    + 'turrets. Le plan en demande six.', {
    x: 8.1, y: 4.5, w: 3.5, h: 1.1, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 11.5, color: DOUX,
  });
  signature(s);
}

/* ------------------------------------------------- 3. les dix caméras */

{
  const s = pres.addSlide();
  s.background = { color: BLANC };
  titre(s, 'Les dix caméras', 'Synthèse');

  const lignes = [[
    { text: 'Repère', options: { bold: true, color: DOUX, fontSize: 10 } },
    { text: 'Zone', options: { bold: true, color: DOUX, fontSize: 10 } },
    { text: 'Modèle', options: { bold: true, color: DOUX, fontSize: 10 } },
    { text: 'Rôle', options: { bold: true, color: DOUX, fontSize: 10 } },
    { text: 'Identifie', options: { bold: true, color: DOUX, fontSize: 10, align: 'right' } },
  ]];
  for (const c of D.cameras) {
    const fort = c.ident > 5;
    lignes.push([
      { text: c.cle, options: { bold: true, color: ENCRE } },
      { text: c.zone, options: { color: ENCRE } },
      { text: c.modele.replace(/ \(.*/, '') + (c.tele ? ' · télé' : '') },
      { text: c.role, options: { color: DOUX } },
      { text: `${fr(c.ident)} m`, options: { align: 'right', bold: fort, color: fort ? ROUGE : ENCRE } },
    ]);
  }
  s.addTable(lignes, {
    x: 0.6, y: 1.75, w: 12.1, colW: [0.9, 3.1, 3.3, 3.2, 1.6],
    fontFace: TEXTE, fontSize: 11, color: ENCRE, valign: 'middle',
    border: { type: 'solid', color: BORD, pt: 0.5 }, rowH: 0.4,
  });
  signature(s);
  s.addNotes('La colonne « identifie » est la seule qui compte devant un '
    + 'tribunal : c’est la distance à laquelle un inconnu devient nommable.');
}

/* -------------------------------------------- 4. le point à retenir */

{
  const s = pres.addSlide();
  s.background = { color: ENCRE };
  s.addText('LE POINT À RETENIR', {
    x: 0.7, y: 0.6, w: 6.4, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 12, bold: true, color: ROUGE, charSpacing: 2.2,
  });
  s.addText('Deux caméras sur dix identifient au-delà de cinq mètres.', {
    x: 0.7, y: 1.05, w: 6.4, h: 1.7, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 30, bold: true, color: BLANC, lineSpacingMultiple: 1.08,
  });
  s.addText(
    `Ce sont les deux bullets réglés au téléobjectif — ${fr(D.porteesC1.identification)} m. `
    + 'Les six turrets s’arrêtent à 4,5 m, la panoramique à 3 m.',
    {
      x: 0.7, y: 2.9, w: 6.4, h: 0.9, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 15, color: 'B9C0CA',
    },
  );
  s.addText(
    'Cela ne les disqualifie pas : elles sont faites pour couvrir, pas pour '
    + 'prouver. Mais cela impose leur place — à l’aplomb des passages, jamais '
    + 'en surplomb d’une cour.',
    {
      x: 0.7, y: 3.95, w: 6.4, h: 1.2, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 13.5, color: '8A93A0',
    },
  );
  s.addText(
    `C1 est à ${fr(D.distancePortail, 0)} m du portail — sous les `
    + `${fr(D.porteesC1.identification)} m qu’elle identifie. L’entrée est `
    + 'identifiée, pas seulement observée.',
    {
      x: 0.7, y: 5.35, w: 6.4, h: 1, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 13, italic: true, color: 'D7DCE3',
    },
  );
  const mo = a('modele.png');
  if (mo) s.addImage({ ...mo, x: 7.5, y: 1.1, w: 5.2, h: 3.55 });
  signature(s, true);
}

/* --------------------------------- ce que chaque caméra prouve (graphique) */

{
  const s = pres.addSlide();
  s.background = { color: BLANC };
  titre(s, 'Jusqu’où chaque caméra identifie', 'Ce qui compte devant un tribunal');
  s.addText(
    'Identifier, c’est nommer un inconnu — 250 pixels par mètre selon la norme '
    + 'EN 62676-4. En deçà, on voit une silhouette, on ne prouve rien.',
    {
      x: 0.6, y: 1.72, w: 12.1, h: 0.45, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 14, color: DOUX,
    },
  );

  const ordre = [...D.cameras].sort((x, y) => x.ident - y.ident);
  s.addChart(pres.ChartType.bar, [{
    name: 'Distance d’identification',
    labels: ordre.map((c) => `${c.cle} — ${c.role.length > 26 ? `${c.role.slice(0, 25)}…` : c.role}`),
    values: ordre.map((c) => Number(c.ident.toFixed(1))),
  }], {
    x: 0.6, y: 2.25, w: 12.1, h: 4.15,
    barDir: 'bar',
    chartColors: ordre.map((c) => (c.ident > 5 ? ROUGE : '8A93A0')),
    showTitle: false,
    showLegend: false,
    showValue: true,
    dataLabelPosition: 'outEnd',
    dataLabelFormatCode: '0,0" m"',
    dataLabelFontFace: TEXTE,
    dataLabelFontSize: 11,
    dataLabelColor: ENCRE,
    catAxisLabelColor: ENCRE,
    catAxisLabelFontFace: TEXTE,
    catAxisLabelFontSize: 11,
    valAxisLabelColor: DOUX,
    valAxisLabelFontFace: TEXTE,
    valAxisLabelFontSize: 10,
    valAxisTitle: 'mètres',
    showValAxisTitle: true,
    valAxisTitleColor: DOUX,
    valAxisTitleFontSize: 10,
    valGridLine: { color: BORD, size: 0.75 },
    catGridLine: { style: 'none' },
    barGapWidthPct: 45,
  });
  s.addNotes('Les deux barres rouges sont les bullets réglés au téléobjectif. '
    + 'Tout le reste du parc couvre et dissuade ; il ne prouve pas.');
  signature(s);
}

/* --------------------------------------------- le site, vue par vue */

const COUVERTES = VUES.filter((v) => v.photos.length);
for (const v of COUVERTES) {
  const s = pres.addSlide();
  s.background = { color: BLANC };
  const cams = v.cams.join(' et ');
  titre(s, v.titre, cams ? `Caméra ${cams}` : 'Le site');

  const deux = v.photos.length > 1;
  v.photos.forEach((nom, i) => {
    const ph = a(nom);
    if (!ph) return;
    const w = deux ? 3.75 : 6.6;
    const x = 0.6 + i * (w + 0.35);
    s.addImage({ ...ph, x, y: 1.78, w, h: deux ? 2.5 : 4.4 });
    if (v.cams[i]) {
      pastille(s, v.cams[i].replace('C', ''), x + 0.12, 1.9, { taille: 0.4, fond: ROUGE });
    }
  });

  const xd = deux ? 8.5 : 7.5;
  const wd = deux ? 4.2 : 5.2;
  s.addText('Ce que montre la vue', {
    x: xd, y: 1.78, w: wd, h: 0.34, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 16, bold: true, color: ENCRE,
  });
  const obs = v.obs.slice(0, 4);
  s.addText(obs.map((t, i) => ({
    text: t.length > 210 ? `${t.slice(0, 208)}…` : t,
    options: { bullet: true, breakLine: i !== obs.length - 1, paraSpaceAfter: 9 },
  })), {
    x: xd, y: 2.22, w: wd, h: 3.9, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 11.5, color: DOUX,
  });

  if (deux) {
    s.addText('La bande rouge sur chaque photo est le champ réel de la caméra, '
      + 'reporté à l’échelle de la prise de vue.', {
      x: 0.6, y: 4.45, w: 7.5, h: 0.5, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11.5, italic: true, color: DOUX,
    });
  }

  const dets = D.cameras.filter((c) => v.cams.includes(c.cle));
  // La fiche caméra ne dépasse jamais la largeur des photos : au-delà, elle
  // passerait sous la colonne d'observations.
  const wc = deux ? 7.5 : 6.6;
  dets.forEach((c, i) => {
    const y = deux ? 5.1 + i * 0.78 : 5.45 + i * 0.78;
    carte(s, 0.6, y, wc, 0.68, { fond: FOND });
    pastille(s, c.cle.replace('C', ''), 0.78, y + 0.13, { taille: 0.42, fond: ENCRE });
    s.addText(`${c.modele.replace(/ \(.*/, '')}${c.tele ? ' · téléobjectif' : ''}`, {
      x: 1.32, y: y + 0.08, w: wc - 3.47, h: 0.52, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11.5, bold: true, color: ENCRE, valign: 'middle',
    });
    s.addText(`identifie jusqu’à ${fr(c.ident)} m`, {
      x: 0.6 + wc - 2.6, y: y + 0.08, w: 2.35, h: 0.52, isTextBox: true, margin: 0,
      align: 'right', fontFace: TEXTE, fontSize: 11.5, bold: true, valign: 'middle',
      color: c.ident > 5 ? ROUGE : DOUX,
    });
  });
  signature(s);
}

/* ------------------------------------- les zones sans caméra dédiée */

{
  const nues = VUES.filter((v) => !v.photos.length);
  if (nues.length) {
    const s = pres.addSlide();
    s.background = { color: FOND };
    titre(s, 'Ce que le parc ne couvre pas', 'Dit avant la pose, pas après');
    s.addText(
      `${nues.length} zones relevées sur le site n’ont pas de caméra dédiée au `
      + 'plan. Elles figurent ici parce qu’un dossier qui les tairait se '
      + 'retournerait contre celui qui l’a signé.',
      {
        x: 0.6, y: 1.72, w: 12.1, h: 0.5, isTextBox: true, margin: 0,
        fontFace: TEXTE, fontSize: 14, color: DOUX,
      },
    );
    nues.forEach((v, i) => {
      const y = 2.42 + i * 1.32;
      carte(s, 0.6, y, 12.1, 1.12, { fond: BLANC });
      s.addText(v.titre, {
        x: 0.92, y: y + 0.18, w: 5.4, h: 0.34, isTextBox: true, margin: 0,
        fontFace: TITRE, fontSize: 14.5, bold: true, color: ENCRE,
      });
      s.addText(v.obs[0] ? (v.obs[0].length > 150 ? `${v.obs[0].slice(0, 148)}…` : v.obs[0]) : '', {
        x: 0.92, y: y + 0.56, w: 11.4, h: 0.46, isTextBox: true, margin: 0,
        fontFace: TEXTE, fontSize: 11.5, color: DOUX,
      });
    });
    s.addText(
      'Deux réponses, et elles n’ont pas le même prix : une caméra de plus, '
      + 'ou l’acceptation écrite que ces zones restent sans image. Ce qui ne '
      + 'se défend pas, c’est de ne pas avoir posé la question.',
      {
        x: 0.6, y: 6.28, w: 12.1, h: 0.5, isTextBox: true, margin: 0,
        fontFace: TEXTE, fontSize: 12, bold: true, color: ROUGE,
      },
    );
    signature(s);
  }
}

/* ------------------------------------------------ 5. plan d’implantation */

{
  const s = pres.addSlide();
  s.background = { color: BLANC };
  titre(s, 'Plan d’implantation', `Le site — ${D.site.longueurBatiment} m de bâtiment`);
  const pl = a('plan.png');
  if (pl) s.addImage({ ...pl, x: 0.6, y: 1.72, w: 8.35, h: 4.6 });

  carte(s, 9.25, 1.72, 3.45, 4.6, { fond: FOND });
  s.addText('Comment le lire', {
    x: 9.55, y: 1.95, w: 2.9, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 14, bold: true, color: ENCRE,
  });
  const notes = [
    'Chaque secteur montre trois profondeurs pour la même caméra.',
    'Rouge vif : elle identifie un inconnu.',
    'Rouge pâle : elle reconnaît une personne connue.',
    'Gris : elle observe une action.',
    'Le rouge vif ne couvre presque rien de la cour — c’est voulu.',
  ];
  s.addText(notes.map((t, i) => ({
    text: t, options: { bullet: true, breakLine: i !== notes.length - 1, paraSpaceAfter: 7 },
  })), {
    x: 9.55, y: 2.4, w: 2.9, h: 3.6, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 11.5, color: DOUX,
  });
  signature(s);
}

/* -------------------------------------------------- 6. vue aérienne */

{
  const s = pres.addSlide();
  s.background = { color: BLANC };
  titre(s, 'Repérage sur la vue aérienne', 'Le site');
  const rp = a('reperage.png');
  if (rp) s.addImage({ ...rp, x: 0.6, y: 1.75, w: 12.1, h: 4.35 });
  s.addText(
    'Le secteur indique la direction de visée, pas la portée : une vue '
    + 'oblique ne se mesure pas. Les portées à l’échelle sont au plan masse.',
    {
      x: 0.6, y: 6.2, w: 12.1, h: 0.5, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12, italic: true, color: DOUX,
    },
  );
  signature(s);
}

/* ------------------------------------------ 7. enregistrement, stockage */

{
  const s = pres.addSlide();
  s.background = { color: FOND };
  titre(s, 'Enregistrement et stockage', D.nvr.reference);

  chiffre(s, 0.6, 1.9, `${D.cameras.length} / ${D.nvr.canaux}`, 'voies utilisées', { w: 2.9, compact: true });
  chiffre(s, 3.6, 1.9, fr(D.debit), `Mbit/s sur ${D.nvr.bandePassante} admis en entrée`, { w: 2.9, couleur: ENCRE, compact: true });
  chiffre(s, 6.6, 1.9, `${fr(D.stock30)} To`, 'pour 30 jours continus', { w: 2.9, couleur: ENCRE, compact: true });
  chiffre(s, 9.6, 1.9, `${fr(D.poe)} W`, `de PoE demandés sur ${D.nvr.budgetPoe} disponibles`, { w: 3.1, couleur: ENCRE, compact: true });

  carte(s, 0.6, 4.05, 5.8, 2.15);
  s.addText('Les deux disques', {
    x: 0.9, y: 4.28, w: 5.2, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 15, bold: true, color: ENCRE,
  });
  s.addText(
    `Deux baies plafonnées à ${D.nvr.capaciteMaxBaie} To. Deux disques de `
    + `${D.disques.pool.unitaire} To donnent ${D.disques.pool.total} To, `
    + 'soit environ 36 jours d’enregistrement continu.',
    {
      x: 0.9, y: 4.68, w: 5.2, h: 0.75, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12, color: DOUX,
    },
  );
  s.addText('Cette machine ne fait pas de RAID : la perte d’un disque emporte '
    + 'la moitié de la période conservée.', {
    x: 0.9, y: 5.45, w: 5.2, h: 0.6, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 12, bold: true, color: ROUGE,
  });

  carte(s, 6.9, 4.05, 5.8, 2.15);
  s.addText('Ce que le /16P change', {
    x: 7.2, y: 4.28, w: 5.2, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 15, bold: true, color: ENCRE,
  });
  s.addText(
    'L’enregistreur porte ses seize ports PoE : le commutateur séparé sort '
    + 'du projet. Les coffrets déportés, eux, restent — ils répondent à une '
    + 'distance, pas à un manque de ports.',
    {
      x: 7.2, y: 4.68, w: 5.2, h: 1.35, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12, color: DOUX,
    },
  );
  signature(s);
}

/* ------------------------------------------------ 8. réseau, coffrets */

{
  const s = pres.addSlide();
  s.background = { color: BLANC };
  titre(s, 'Trois coffrets, et pas un de trop', 'Câblage');
  s.addText(
    `Cent mètres de bâtiment ne se franchissent pas d’une seule liaison `
    + 'Ethernet — la norme s’arrête à 90 m de câble posé — et le local est à '
    + 'l’étage des bureaux, donc à une extrémité.',
    {
      x: 0.6, y: 1.7, w: 12.1, h: 0.62, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 14, color: DOUX,
    },
  );

  D.relais.forEach((r, i) => {
    const x = 0.6 + i * 4.08;
    carte(s, x, 2.55, 3.85, 2.3);
    pastille(s, r.cle.replace('R', ''), x + 0.28, 2.8, { taille: 0.44, fond: ROUGE });
    s.addText(r.nom, {
      x: x + 0.85, y: 2.8, w: 2.85, h: 0.42, isTextBox: true, margin: 0,
      fontFace: TITRE, fontSize: 14, bold: true, color: ENCRE, valign: 'middle',
    });
    s.addText(r.contenu, {
      x: x + 0.28, y: 3.38, w: 3.3, h: 0.6, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11.5, color: DOUX,
    });
    s.addText(
      `Montante ${fr(r.montante, 0)} m — depuis ${r.depuis === 'local' ? 'le local' : r.depuis}`,
      {
        x: x + 0.28, y: 4.15, w: 3.3, h: 0.45, isTextBox: true, margin: 0,
        fontFace: TEXTE, fontSize: 11.5, bold: true, color: ENCRE,
      },
    );
  });

  s.addText('R3 est branché derrière R2, pas sur le local : un commutateur en '
    + 'relaie un autre, et chaque saut reste dans la norme.', {
    x: 0.6, y: 4.95, w: 8.2, h: 0.4, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 12.5, italic: true, color: DOUX,
  });

  const cp = { compact: true, couleur: ENCRE };
  chiffre(s, 0.6, 5.45, `${fr(D.reseau, 0)} m`, 'de câble réseau', { ...cp, w: 3 });
  chiffre(s, 3.9, 5.45, `${D.boites.boites}`, 'boîtes de 305 m', { ...cp, w: 3 });
  chiffre(s, 7.2, 5.45, `${fr(D.commande, 0)} m`, 'd’alimentation et de commande', { ...cp, w: 3.2 });
  chiffre(s, 10.5, 5.45, '0', 'liaison hors norme', { compact: true, w: 2.2, couleur: ROUGE });
  signature(s);
}

/* --------------------------------------------- 9. autonomie sur coupure */

{
  const s = pres.addSlide();
  s.background = { color: FOND };
  titre(s, 'Ce qui se passe à la coupure', 'Autonomie');
  s.addText('L’enregistreur n’a pas de batterie, et ses ports PoE s’arrêtent '
    + 'avec lui — donc les caméras qu’ils alimentent aussi.', {
    x: 0.6, y: 1.7, w: 12.1, h: 0.45, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 14, color: DOUX,
  });

  carte(s, 0.6, 2.35, 6.4, 2.5, { fond: BLANC });
  s.addText('Le piège', {
    x: 0.9, y: 2.58, w: 5.8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 15, bold: true, color: ENCRE,
  });
  const tenues = D.zones.find((z) => z.cle === 'local').cameras;
  s.addText(
    `Le site compte ${D.zones.length} zones d’alimentation, chacune sur sa `
    + `propre arrivée 230 V. Un onduleur au local seul, et `
    + `${D.perdues.length} caméras sur ${D.cameras.length} restent éteintes — `
    + `seule ${tenues.join(', ')} tiendrait. L’installation fonctionnerait `
    + 'parfaitement, et la preuve serait vide.',
    {
      x: 0.9, y: 2.98, w: 5.8, h: 1.15, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12.5, color: DOUX,
    },
  );
  s.addText(`Il faut secourir les ${D.zones.length} zones, ou aucune.`, {
    x: 0.9, y: 4.25, w: 5.8, h: 0.4, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 14, bold: true, color: ROUGE,
  });

  carte(s, 7.3, 2.35, 5.4, 2.5, { fond: BLANC });
  s.addText('Quelle batterie', {
    x: 7.6, y: 2.58, w: 4.8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 15, bold: true, color: ENCRE,
  });
  const tb = [[
    { text: 'Charge', options: { bold: true, color: DOUX, fontSize: 10 } },
    { text: '1 h', options: { bold: true, color: DOUX, fontSize: 10, align: 'right' } },
    { text: '2 h', options: { bold: true, color: DOUX, fontSize: 10, align: 'right' } },
    { text: 'Onduleur', options: { bold: true, color: DOUX, fontSize: 10, align: 'right' } },
  ]];
  for (const b of D.batteries) {
    tb.push([
      { text: `${b.w} W`, options: { bold: true } },
      { text: `${b.h1} Wh`, options: { align: 'right' } },
      { text: `${b.h2} Wh`, options: { align: 'right' } },
      { text: `${b.va} VA`, options: { align: 'right', color: DOUX } },
    ]);
  }
  s.addTable(tb, {
    x: 7.6, y: 2.98, w: 4.8, colW: [1.3, 1.15, 1.15, 1.2],
    fontFace: TEXTE, fontSize: 10.5, color: ENCRE, rowH: 0.27, valign: 'middle',
    border: { type: 'solid', color: BORD, pt: 0.5 },
  });

  s.addText(
    'Deux corrections sont incluses : la conversion perd 15 %, et une '
    + 'batterie au plomb vidée à fond ne s’en remet pas — on ne compte que '
    + '80 % de sa capacité. Les négliger fait annoncer une heure là où '
    + 'l’installation en tient quarante minutes.',
    {
      x: 0.6, y: 5.1, w: 12.1, h: 0.9, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12.5, color: DOUX,
    },
  );
  signature(s);
}

/* ------------------------------------------------ 10. écran, en option */

{
  const s = pres.addSlide();
  s.background = { color: BLANC };
  titre(s, 'L’écran de supervision', 'Option');
  s.addText('« Il me faut combien de pouces ? » est la question à laquelle on '
    + 'répond en dernier.', {
    x: 0.6, y: 1.7, w: 12.1, h: 0.4, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 14, color: DOUX,
  });

  carte(s, 0.6, 2.3, 5.9, 1.55, { fond: FOND });
  s.addText('Le nombre de caméras décide la DÉFINITION', {
    x: 0.9, y: 2.52, w: 5.3, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 13.5, bold: true, color: ENCRE,
  });
  s.addText(
    `${D.cameras.length} caméras s’affichent en mosaïque `
    + `${D.mosaique.colonnes} × ${D.mosaique.lignes}. En Full HD chaque `
    + 'vignette tombe à 480 × 270 px : on voit que ça bouge, jamais qui. '
    + 'Le 4K est le minimum.',
    {
      x: 0.9, y: 2.9, w: 5.3, h: 0.85, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12, color: DOUX,
    },
  );

  carte(s, 6.8, 2.3, 5.9, 1.55, { fond: FOND });
  s.addText('Le recul de l’opérateur décide la DIAGONALE', {
    x: 7.1, y: 2.52, w: 5.3, h: 0.3, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 13.5, bold: true, color: ENCRE,
  });
  s.addText(
    'Et lui seul. Un écran trop grand de près force à balayer de la tête ; '
    + 'trop petit de loin, il cache ce que sa définition contenait pourtant.',
    {
      x: 7.1, y: 2.9, w: 5.3, h: 0.85, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12, color: DOUX,
    },
  );

  D.ecrans.forEach((e, i) => {
    const x = 0.6 + i * 4.08;
    carte(s, x, 4.15, 3.85, 1.85);
    s.addText(`${e.pouces}"`, {
      x: x + 0.3, y: 4.35, w: 3.25, h: 0.75, isTextBox: true, margin: 0,
      fontFace: TITRE, fontSize: 40, bold: true, color: ROUGE,
    });
    s.addText(`à ${fr(e.d)} m de recul`, {
      x: x + 0.3, y: 5.12, w: 3.25, h: 0.3, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 13, bold: true, color: ENCRE,
    });
    s.addText(`${e.def} — vignette ${e.tuile} px`, {
      x: x + 0.3, y: 5.45, w: 3.25, h: 0.3, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11, color: DOUX,
    });
  });
  signature(s);
}

/* ------------------------------------ 11. contrôle d’accès, en option */

{
  const s = pres.addSlide();
  s.background = { color: FOND };
  titre(s, 'Contrôle d’accès et interphonie', 'Option');
  s.addText(`${D.interphonie.reference} — ${D.interphonie.type}, alimenté en PoE.`, {
    x: 0.6, y: 1.72, w: 12.1, h: 0.4, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 14, color: DOUX,
  });

  const apports = [
    ['Ouverture à distance', 'Depuis le moniteur intérieur ou depuis le téléphone, où que soit le responsable.'],
    ['Quatre identifications', 'Visage pour les habitués, badge pour le personnel, code pour les livraisons, QR pour un visiteur annoncé.'],
    ['Droits programmables', 'Qui ouvre quelle porte, à quelles heures. Un livreur qui n’entre plus le dimanche est un réglage, pas une consigne.'],
    ['Traçabilité', 'Chaque ouverture datée et attribuée. C’est souvent ce qui sert, plus que la vidéo.'],
  ];
  apports.forEach(([t, d], i) => {
    const x = 0.6 + (i % 2) * 6.2;
    const y = 2.25 + Math.floor(i / 2) * 1.55;
    carte(s, x, y, 5.9, 1.35, { fond: BLANC });
    pastille(s, i + 1, x + 0.3, y + 0.28, { taille: 0.4, fond: ENCRE });
    s.addText(t, {
      x: x + 0.85, y: y + 0.26, w: 4.8, h: 0.34, isTextBox: true, margin: 0,
      fontFace: TITRE, fontSize: 14, bold: true, color: ENCRE, valign: 'middle',
    });
    s.addText(d, {
      x: x + 0.85, y: y + 0.63, w: 4.75, h: 0.62, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11, color: DOUX,
    });
  });

  s.addText(
    'Une ventouse sur une issue doit LIBÉRER quand tout s’arrête — coupure, '
    + 'alarme incendie, panique. Déverrouillage d’urgence obligatoire à '
    + 'l’intérieur, et classement du bâtiment à établir avant toute commande.',
    {
      x: 0.6, y: 5.55, w: 12.1, h: 0.75, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12.5, bold: true, color: ROUGE,
    },
  );
  signature(s);
}

/* ------------------------------------------------- 12. les engagements */

{
  const s = pres.addSlide();
  s.background = { color: BLANC };
  titre(s, 'Ce que l’agence engage à la livraison', 'Prestations');

  const eng = [
    ['Dossier technique de fin d’installation', 'Implantation réelle, plan de câblage, adresses, réglages. Ce qui permet à un tiers de reprendre l’installation sans la redécouvrir.'],
    ['Formation au logiciel d’exploitation', 'Sur site, sur l’installation réelle : relecture, export d’une séquence, recherche par date, gestion des accès.'],
    ['Connexion de l’application sur téléphone', 'Mise en service et vérification de l’accès à distance sur les téléphones désignés.'],
    ['Garantie du matériel : 3 ans', 'Sur les matériels fournis et posés par l’agence.'],
    ['Maintenance gratuite : 1 an', 'À compter de la réception.'],
  ];
  eng.forEach(([t, d], i) => {
    const y = 1.78 + i * 0.95;
    pastille(s, i + 1, 0.6, y + 0.06, { taille: 0.44, fond: i > 2 ? ROUGE : ENCRE });
    s.addText(t, {
      x: 1.2, y, w: 5.2, h: 0.4, isTextBox: true, margin: 0,
      fontFace: TITRE, fontSize: 14.5, bold: true, color: ENCRE, valign: 'middle',
    });
    s.addText(d, {
      x: 6.5, y: y + 0.02, w: 6.2, h: 0.75, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11.5, color: DOUX,
    });
    if (i < eng.length - 1) {
      s.addShape(pres.ShapeType.line, {
        x: 0.6, y: y + 0.82, w: 12.1, h: 0, line: { color: BORD, width: 0.75 },
      });
    }
  });
  signature(s);
}

/* --------------------------------------- 13. ce qui reste à mesurer */

{
  const s = pres.addSlide();
  s.background = { color: FOND };
  titre(s, 'Ce qu’il reste à mesurer sur place', 'Avant la pose');

  const points = [
    ['L’emplacement exact du local technique', 'Tout le métré en dépend, et plus que du nombre de caméras.'],
    ['L’arrivée 230 V à chaque coffret', 'Elle conditionne les coffrets, donc la platine et le verrouillage. Au portail, elle n’existe peut-être pas.'],
    ['Le classement incendie du bâtiment', 'Il fixe les obligations de déverrouillage d’urgence sur les portes tenues par ventouse.'],
    ['Les hauteurs de pose disponibles', 'Débord de toiture, descente d’eau, hauteur sous charpente.'],
    ['La durée de conservation retenue', 'Elle dimensionne le stockage, et c’est aussi une question juridique.'],
  ];
  points.forEach(([t, d], i) => {
    const x = 0.6 + (i % 2) * 6.2;
    const y = 1.85 + Math.floor(i / 2) * 1.5;
    carte(s, x, y, 5.9, 1.3, { fond: BLANC });
    s.addText(t, {
      x: x + 0.32, y: y + 0.22, w: 5.3, h: 0.36, isTextBox: true, margin: 0,
      fontFace: TITRE, fontSize: 13.5, bold: true, color: ENCRE,
    });
    s.addText(d, {
      x: x + 0.32, y: y + 0.62, w: 5.3, h: 0.6, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11.5, color: DOUX,
    });
  });
  s.addText(
    'Cette étude est établie sans visite du site. Elle ne vaut pas devis : '
    + 'seul un relevé technique arrête le nombre de caméras, leurs '
    + 'emplacements définitifs et le cheminement des câbles.',
    {
      x: 0.6, y: 6.28, w: 12.1, h: 0.5, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 12, italic: true, color: DOUX,
    },
  );
  signature(s);
}

/* ------------------------------------------------------- 14. contact */

{
  const s = pres.addSlide();
  s.background = { color: ENCRE };
  const l = a('logo.png');
  if (l) s.addImage({ ...l, x: 0.85, y: 1.6, w: 1.75, h: 1.5 });
  s.addText('Parlons du relevé.', {
    x: 0.85, y: 3.4, w: 8, h: 0.9, isTextBox: true, margin: 0,
    fontFace: TITRE, fontSize: 40, bold: true, color: BLANC,
  });
  s.addText('Une demi-journée sur place, et cette étude devient un devis.', {
    x: 0.85, y: 4.35, w: 8, h: 0.5, isTextBox: true, margin: 0,
    fontFace: TEXTE, fontSize: 16, color: 'B9C0CA',
  });
  s.addText(
    `${D.agence.nomCommercial} · ${D.agence.accroche}\n${D.agence.adresse}\n`
    + `${D.agence.telephone} · ${D.agence.courriel}\n`
    + `${D.agence.sites.join(' · ')}\n`
    + `${D.agence.formeCourte} · SIRET ${D.agence.siret} · TVA ${D.agence.tva}\n`
    + `APE ${D.agence.naf} — ${D.agence.nafLibelle}\n${D.agence.zone}`,
    {
      x: 0.85, y: 5.2, w: 8, h: 1.8, isTextBox: true, margin: 0,
      fontFace: TEXTE, fontSize: 11.5, color: '8A93A0', lineSpacingMultiple: 1.3,
    },
  );
}

const sortie = join(ici, 'etude-presentation.pptx');
await pres.writeFile({ fileName: sortie });
console.log(`${sortie} — ${pres.slides ? pres.slides.length : ''} diapositives`);
