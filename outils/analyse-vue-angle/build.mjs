/**
 * Fabrique la version « fichier unique » de l'outil.
 *
 * Pourquoi : les navigateurs refusent les modules JavaScript quand une page est
 * ouverte directement depuis le disque (`file://`). Le dossier de sources ne
 * fonctionne donc que servi par un serveur web. Ce script en tire un seul
 * fichier HTML, sans module, que l'on peut copier sur un PC ou une tablette et
 * ouvrir d'un double-clic, sans rien installer et sans connexion.
 *
 * Exécution : npm run build
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
const lire = (...p) => readFileSync(join(ici, ...p), 'utf8');

/** Modules de l'application, dans l'ordre des dépendances. */
const MODULES = [
  'dom.js', 'format.js', 'optique.js', 'alignement.js',
  'diagnostic.js', 'lecture-etude.js', 'fiche.js', 'ocr.js', 'etude-pdf.js', 'app.js',
];

/** Neutralise toute fin de balise qui casserait le script ou le style l'accueillant. */
const inerte = (code) => code.replace(/<\/(script|style)/gi, '<\\/$1');

/** Retire les `import` / `export` : tout se retrouve dans une seule portée. */
function deModuliser(source) {
  return source
    .replace(/^import\s[\s\S]*?from\s*['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s+/gm, '');
}

/**
 * Relève les déclarations de premier niveau pour refuser de produire un fichier
 * cassé : deux modules qui déclarent `const $` passent la concaténation mais
 * font planter la page au chargement.
 */
function declarations(source) {
  const noms = [];
  const motif = /^(?:const|let|var|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm;
  let m = motif.exec(source);
  while (m) {
    noms.push(m[1]);
    m = motif.exec(source);
  }
  return noms;
}

const vus = new Map();
const morceaux = [];
for (const nom of MODULES) {
  const source = deModuliser(lire('js', nom));
  for (const declaration of declarations(source)) {
    if (vus.has(declaration)) {
      throw new Error(
        `Collision de noms : « ${declaration} » est déclaré dans ${vus.get(declaration)} et ${nom}. `
        + 'Renommer l\'un des deux, sinon le fichier unique ne se chargera pas.',
      );
    }
    vus.set(declaration, nom);
  }
  morceaux.push(`/* ===== ${nom} ===== */\n${source.trim()}`);
}

const paquet = `(function () {\n'use strict';\n\n${morceaux.join('\n\n')}\n\n}());`;

const base64 = (...p) => readFileSync(join(ici, ...p)).toString('base64');

const scripts = [
  '<script>/* PDF.js 3.11.174 — Mozilla, Apache 2.0 — voir vendor/LICENSE-pdfjs.txt */</script>',
  `<script>${inerte(lire('vendor', 'pdf.min.js'))}</script>`,
  // Chargé comme script ordinaire et non comme Web Worker : PDF.js s'en sert
  // alors dans le fil principal, seul moyen de fonctionner depuis le disque.
  `<script>${inerte(lire('vendor', 'pdf.worker.min.js'))}</script>`,
  `<script>${inerte(paquet)}</script>`,
].join('\n');

/**
 * Remplacement littéral : passer par une fonction, car dans une chaîne de
 * remplacement `$$`, `$&` et `$'` ont un sens particulier — ce qui mutilerait
 * silencieusement le code inséré (`$$` deviendrait `$`).
 */
const injecter = (texte, motif, contenu) => texte.replace(motif, () => contenu);

const entete = `<head>\n<!-- Analyse de vue d'angle — NG Security 38.\n`
  + `     Fichier unique produit par build.mjs le ${new Date().toISOString().slice(0, 10)}.\n`
  + '     Ne pas modifier ici : éditer les sources puis relancer « npm run build ». -->';

let html = lire('index.html');
html = injecter(html, '<link rel="stylesheet" href="styles.css">', `<style>${inerte(lire('styles.css'))}</style>`);
html = injecter(html, '<script type="module" src="js/app.js"></script>', scripts);
html = injecter(html, '<head>', entete);

mkdirSync(join(ici, 'dist'), { recursive: true });

/**
 * Deux fichiers sont produits.
 *
 * Le moteur de reconnaissance de caractères pèse près de 5 Mo pour un besoin
 * occasionnel — les études scannées. L'embarquer d'office ferait payer ce poids
 * à tout le monde, à chaque ouverture. Le fichier ordinaire reste donc léger, et
 * une seconde version le porte pour les agences qui en ont l'usage.
 */
function ecrire(nom, contenu) {
  const chemin = join(ici, 'dist', nom);
  writeFileSync(chemin, contenu);
  console.log(`${chemin} — ${(contenu.length / 1024 / 1024).toFixed(2)} Mo`);
}

ecrire('analyse-vue-angle.html', html);

const ocr = [
  '<script>/* Tesseract.js 5.1.1 — Apache 2.0 — voir vendor/ocr/LICENSE-tesseractjs.txt */</script>',
  `<script>${inerte(lire('vendor', 'ocr', 'tesseract.min.js'))}</script>`,
  `<script>window.__ocrIntegre=${JSON.stringify({
    moteur: base64('vendor', 'ocr', 'tesseract-core-simd-lstm.wasm.js'),
    worker: base64('vendor', 'ocr', 'worker.min.js'),
    langue: base64('vendor', 'ocr', 'fra.traineddata.gz'),
  })};</script>`,
].join('\n');

ecrire('analyse-vue-angle-ocr.html', injecter(html, '</head>', `${ocr}\n</head>`));
