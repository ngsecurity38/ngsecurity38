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

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
const lire = (...p) => readFileSync(join(ici, ...p), 'utf8');

/** Modules de l'application, dans l'ordre des dépendances. */
const MODULES = [
  'dom.js', 'format.js', 'optique.js', 'alignement.js',
  'diagnostic.js', 'lecture-etude.js', 'plan.js', 'photo.js', 'catalogue.js', 'reseau.js', 'stockage.js', 'cable.js', 'etude-plan.js', 'murs.js', 'prix.js',
  'fiche.js', 'ocr.js', 'etude-pdf.js', 'app.js',
];

/**
 * Aucun module ne doit manquer à la liste.
 *
 * Un module oublié ici se concatène quand même… en étant absent : la page se
 * charge, puis lâche au premier appel avec un « X is not defined ». Le fichier
 * livré paraît bon et ne l'est pas. Mieux vaut un build qui refuse.
 */
function verifierListe(liste) {
  const declares = new Set(liste);
  const manquants = new Set();
  for (const nom of liste) {
    const source = lire('js', nom);
    for (const m of source.matchAll(/from\s*['"]\.\/([\w-]+\.js)['"]/g)) {
      if (!declares.has(m[1])) manquants.add(`${m[1]} (importé par ${nom})`);
    }
  }
  if (manquants.size) {
    throw new Error(`Modules absents de MODULES : ${[...manquants].join(', ')}. `
      + 'Les ajouter dans l\'ordre des dépendances, sinon le fichier unique '
      + 'se chargera puis plantera à l\'usage.');
  }
}
verifierListe(MODULES);

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

/** Le bandeau de navigation : une seule feuille pour les deux pages. */
const feuilleMenu = lire('menu.css');

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

/**
 * Le logo, embarqué dans la page.
 *
 * Une image posée à côté ferait un fichier de plus à déposer, et la version
 * collée dans WordPress ne pourrait pas l'emporter du tout. En palette de
 * 128 couleurs il pèse 14 Ko — 19 en base64 — pour un écart à l'original
 * invisible à l'œil : 0,3 % des pixels changent de plus d'un cran.
 */
const logo = `data:image/png;base64,${readFileSync(join(ici, 'img', 'logo.png')).toString('base64')}`;
const marque = (page) => injecter(page, 'src="img/logo.png"', `src="${logo}"`);

const entete = `<head>\n<!-- Analyse de vue d'angle — NG Security 38.\n`
  + `     Fichier unique produit par build.mjs le ${new Date().toISOString().slice(0, 10)}.\n`
  + '     Ne pas modifier ici : éditer les sources puis relancer « npm run build ». -->';

let html = marque(lire('index.html'));
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

/*
 * Page de devis client, fabriquée à part.
 *
 * Elle partage les calculs de l'outil d'étude — c'est tout l'intérêt : un
 * client et un technicien ne doivent jamais lire deux chiffres différents du
 * même site — mais elle est publique, légère, et n'embarque ni PDF.js ni OCR.
 *
 * Le tarif y est inclus en secours. Servie depuis un site web, la page relit
 * `tarif.json` posé à côté d'elle : mettre un prix à jour ne demande alors ni
 * outil ni reconstruction.
 */
const MODULES_CLIENT = ['dom.js', 'format.js', 'menu.js', 'optique.js', 'photo.js',
  'photo-client.js', 'stockage.js', 'cable.js', 'prix.js', 'pays.js', 'ensemble.js',
  'ensemble-vue.js', 'offre.js', 'devis-client.js'];
verifierListe(MODULES_CLIENT);

const paquetClient = `(function () {\n'use strict';\n\n`
  + `${MODULES_CLIENT.map((nom) => `/* ===== ${nom} ===== */\n`
    + deModuliser(lire('js', nom)).trim()).join('\n\n')}\n\n}());`;

let client = marque(lire('devis-client.html'));
client = injecter(client, '<link rel="stylesheet" href="devis-client.css">',
  `<style>${inerte(lire('devis-client.css'))}</style>`);
client = injecter(client, '<link rel="stylesheet" href="menu.css">',
  `<style>${inerte(feuilleMenu)}</style>`);
client = injecter(client, '<script type="module" src="js/devis-client.js"></script>',
  `<script>window.__tarif=${inerte(lire('tarif.json'))};</script>\n`
  + `<script>${inerte(paquetClient)}</script>`);
client = injecter(client, '<head>', `<head>\n<!-- Devis client — NG Security 38.\n`
  + `     Fichier unique produit par build.mjs le ${new Date().toISOString().slice(0, 10)}.\n`
  + '     Pour changer les prix : éditer tarif.json, à côté de la page. -->');

ecrire('devis-client.html', client);

/*
 * Page de présentation.
 *
 * Elle ne chiffre rien : elle explique, montre ce qu'une caméra permet de
 * voir, et renvoie vers l'étude et vers les caméras. Elle partage les mêmes
 * fonctions optiques — une vitrine qui annoncerait d'autres portées que
 * l'étude mentirait à moitié.
 */
const MODULES_PRESENTATION = ['dom.js', 'format.js', 'menu.js', 'optique.js', 'prix.js',
  'boutique.js', 'presentation.js'];
verifierListe(MODULES_PRESENTATION);

const paquetPresentation = `(function () {\n'use strict';\n\n`
  + `${MODULES_PRESENTATION.map((nom) => `/* ===== ${nom} ===== */\n`
    + deModuliser(lire('js', nom)).trim()).join('\n\n')}\n\n}());`;

let presentation = marque(lire('presentation.html'));
presentation = injecter(presentation, '<link rel="stylesheet" href="presentation.css">',
  `<style>${inerte(lire('presentation.css'))}</style>`);
presentation = injecter(presentation, '<link rel="stylesheet" href="menu.css">',
  `<style>${inerte(feuilleMenu)}</style>`);
presentation = injecter(presentation, '<script type="module" src="js/presentation.js"></script>',
  `<script>window.__catalogue=${inerte(lire('catalogue.json'))};</script>\n`
  + `<script>${inerte(paquetPresentation)}</script>`);
presentation = injecter(presentation, '<head>', `<head>\n<!-- Présentation — NG Security 38.\n`
  + `     Fichier unique produit par build.mjs le ${new Date().toISOString().slice(0, 10)}.\n`
  + '     Pour changer les produits : éditer catalogue.json, à côté de la page. -->');

ecrire('presentation.html', presentation);


/*
 * Page d'étude alarme.
 *
 * Même facture que le devis vidéo, même feuille de style : les deux pages
 * sont servies côte à côte et un client qui passe de l'une à l'autre ne doit
 * pas croire avoir changé de site. Elle n'embarque ni PDF.js ni OCR.
 */
const MODULES_ALARME = ['dom.js', 'format.js', 'menu.js', 'prix.js', 'pays.js',
  'ensemble.js', 'ensemble-vue.js', 'alarme.js', 'alarme-client.js'];
verifierListe(MODULES_ALARME);

const paquetAlarme = `(function () {\n'use strict';\n\n`
  + `${MODULES_ALARME.map((nom) => `/* ===== ${nom} ===== */\n`
    + deModuliser(lire('js', nom)).trim()).join('\n\n')}\n\n}());`;

let alarme = marque(lire('alarme-client.html'));
alarme = injecter(alarme, '<link rel="stylesheet" href="devis-client.css">',
  `<style>${inerte(lire('devis-client.css'))}</style>`);
alarme = injecter(alarme, '<link rel="stylesheet" href="menu.css">',
  `<style>${inerte(feuilleMenu)}</style>`);
alarme = injecter(alarme, '<script type="module" src="js/alarme-client.js"></script>',
  `<script>window.__tarifAlarme=${inerte(lire('tarif-alarme.json'))};</script>\n`
  + `<script>${inerte(paquetAlarme)}</script>`);
alarme = injecter(alarme, '<head>', `<head>\n<!-- Étude alarme — NG Security 38.\n`
  + `     Fichier unique produit par build.mjs le ${new Date().toISOString().slice(0, 10)}.\n`
  + '     Pour changer les prix : éditer tarif-alarme.json, à côté de la page. -->');

ecrire('alarme-client.html', alarme);


/* ---------------------------------------------------------- référencement

   Trois choses pour que Google trouve ces pages, les comprenne, et n'indexe
   pas une copie à notre place :

   - une page d'accueil à /outils/, qui les relie entre elles. Sans elle,
     l'adresse répond 404 et les trois pages sont orphelines : rien n'y mène,
     donc rien ne les fait découvrir ;
   - un sitemap, à donner une fois à la Search Console ;
   - les vignettes de partage, produites à part par `node og.mjs`.

   L'adresse canonique de chaque page, elle, est inscrite dans son HTML : ces
   pages existent aussi sur GitHub Pages, et sans elle Google choisirait
   lui-même laquelle des deux copies indexer. */

const ADRESSE = 'https://ngsecurity38.fr';
const PAGES_PUBLIEES = ['', 'etude/', 'devis/', 'alarme/'];

/** Le sitemap : quatre adresses, et la date du jour. */
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES_PUBLIEES.map((p) => `  <url>
    <loc>${ADRESSE}/outils/${p}</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
  </url>`).join('\n')}
</urlset>
`;

/*
 * La page d'accueil des outils.
 *
 * Elle garde son logo en fichier séparé, là où les trois autres l'embarquent
 * en base64 : celles-là doivent pouvoir être ouvertes d'un double-clic depuis
 * une clé USB, pas elle. Une image à part se met en cache, et le HTML reste
 * petit — ce qui compte pour une page dont le rôle est d'être explorée.
 */
const accueilOutils = lire('index-outils.html');

const VIGNETTES = ['og-etude.png', 'og-devis.png', 'og-alarme.png'];

/** Pose l'accueil, le sitemap et les vignettes à la racine d'un dossier servi. */
function referencer(dossier) {
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'index.html'), accueilOutils);
  writeFileSync(join(dossier, 'sitemap.xml'), sitemap);
  for (const v of VIGNETTES) copyFileSync(join(ici, 'img', 'og', v), join(dossier, v));
  copyFileSync(join(ici, 'img', 'logo.png'), join(dossier, 'logo.png'));
}


/*
 * Dossier prêt à déposer sur le site, tel quel.
 *
 * La mise en ligne se fait à la main, par FTP : moins il y a d'étapes, moins
 * il y a d'occasions de se tromper. `dist/site/devis/` contient exactement ce
 * qu'il faut téléverser, aux bons noms — la page s'appelle `index.html` pour
 * que l'adresse reste `/outils/devis/`, et `tarif.json` est à côté d'elle,
 * faute de quoi la page se rabattrait en silence sur le tarif embarqué à la
 * fabrication.
 */
const aDeposer = (nom, page, donnees, fichierDonnees) => {
  const dossier = join(ici, 'dist', 'site', nom);
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'index.html'), page);
  writeFileSync(join(dossier, fichierDonnees), donnees);
  console.log(`${dossier} — dossier à déposer tel quel sur le site`);
};

// Les deux se déposent côte à côte, sous /outils/ : la présentation renvoie
// alors à l'étude sans qu'aucune adresse ait à être écrite.
aDeposer('devis', client, lire('tarif.json'), 'tarif.json');
aDeposer('etude', presentation, lire('catalogue.json'), 'catalogue.json');
aDeposer('alarme', alarme, lire('tarif-alarme.json'), 'tarif-alarme.json');

/*
 * L'éditeur d'étude.
 *
 * Ce n'est pas un outil de visiteur : c'est l'atelier de l'agence, d'où
 * l'on déplace les caméras d'un dossier et d'où sort le fichier qui le
 * regénère. Il n'est donc PAS lié depuis l'accueil public et porte
 * `noindex` : le publier à côté des estimateurs ferait croire à un
 * visiteur qu'il peut refaire l'étude lui-même.
 *
 * Une seule forme : un fichier unique, l'étude embarquée dedans, qui
 * s'ouvre d'un double-clic sans serveur ni réseau.
 */
const MODULES_EDITEUR = ['dom.js', 'format.js', 'optique.js', 'cable.js',
  'stockage.js', 'etude-plan.js', 'editeur-fiche.js', 'editeur.js'];
verifierListe(MODULES_EDITEUR);

const etudeJson = readFileSync(
  join(ici, '..', '..', 'etudes', '2026-09-22-site-industriel', 'etude.json'), 'utf8',
);
const paquetEditeur = `(function () {\n'use strict';\n\n`
  + `${MODULES_EDITEUR.map((nom) => `/* ===== ${nom} ===== */\n`
    + deModuliser(lire('js', nom)).trim()).join('\n\n')}\n\ndemarrer();\n}());`;

let editeur = marque(lire('editeur.html'));
editeur = injecter(editeur, '<link rel="stylesheet" href="editeur.css">',
  `<style>${inerte(lire('editeur.css'))}</style>`);
/*
 * Le remplacement passe par une FONCTION, jamais par une chaîne.
 *
 * Dans une chaîne de remplacement, « $$ » veut dire « un dollar » : le
 * paquet, qui contient `const $$ = …`, en ressortait avec `const $ = …`
 * deux fois, et la page mourait sur « $ has already been declared ». Une
 * fonction rend le texte tel quel.
 */
editeur = editeur.replace(
  /<script type="module">[\s\S]*?<\/script>/,
  () => `<script>window.__etude=${inerte(etudeJson)};</script>\n`
    + `<script>window.__agence=${inerte(JSON.stringify({
    ...JSON.parse(readFileSync(join(ici, '..', '..', 'agence.json'), 'utf8')),
    logo,
  }))};</script>\n`
    + `<script>${inerte(paquetEditeur)}</script>`,
);
ecrire('editeur.html', editeur);

/*
 * L'éditeur NE SORT PAS en dossier servi.
 *
 * L'agence l'a demandé nettement : il reste sur son ordinateur. Un outil
 * qui porte les photos d'un site client, ses plans et ses points faibles
 * n'a rien à faire sur un serveur public, fût-ce derrière une adresse que
 * personne ne devine — une adresse que personne ne devine finit toujours
 * par se deviner.
 *
 * Une seule sortie, donc : dist/editeur.html, un fichier qu'on copie sur
 * un ordinateur et qu'on ouvre d'un double-clic.
 */

/*
 * Le menu, un cran au-dessus des deux dossiers.
 *
 * Un seul fichier pour les deux pages : recopié dans chaque dossier, il
 * finirait par différer d'une page à l'autre — et personne ne s'en
 * apercevrait avant un visiteur.
 */
writeFileSync(join(ici, 'dist', 'site', 'menu.json'), lire('menu.json'));
referencer(join(ici, 'dist', 'site'));

/*
 * Version à coller dans une page existante, sans rien téléverser.
 *
 * Tout le monde n'a pas de FTP sous la main, et un gestionnaire de fichiers
 * d'hébergeur reste un détour. Un bloc « HTML personnalisé » dans l'éditeur
 * WordPress suffit alors — à condition que la page collée ne se batte pas
 * avec le thème.
 *
 * D'où la racine d'ombre : le style du site n'entre pas, celui de la page ne
 * sort pas. Sans elle, le `h1` du thème et le nôtre se disputeraient, et nos
 * `.carte` ou `.btn` écraseraient ceux du site — deux noms si courants que la
 * collision est certaine.
 */
function pourWordpress(page, feuille, paquet, donnees, id, adresses = '') {
  const corps = page.slice(page.indexOf('<body>') + 6, page.indexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '')
    /*
     * Le logo s'en va.
     *
     * Les créateurs de site refusent les images en `data:` dans un code
     * intégré — Hostinger répond « embed code is too large ». Et il serait
     * de toute façon redondant : le bloc est collé DANS un site qui porte
     * déjà son en-tête et sa marque.
     */
    .replace(/<div class="marque">[\s\S]*?<\/div>\s*<\/div>/, '')
    /*
     * Le bandeau de navigation s'en va pour la même raison, en plus net : le
     * site qui accueille le bloc porte déjà son propre menu, et deux menus
     * l'un au-dessus de l'autre sur la même page désorientent au lieu d'aider.
     */
    .replace(/<nav class="site-menu"[\s\S]*?<\/nav>/, '')
    /*
     * Et le projet complet.
     *
     * Il renvoie d'une page d'outil à l'autre par des adresses relatives
     * (`../devis/`). Collé dans une page de site, à une adresse quelconque,
     * ce lien ne mène nulle part — et rien ne dit que l'autre outil soit
     * collé quelque part. Un bloc vaut pour lui seul.
     */
    .replace(/<section class="carte" id="ensemble"[\s\S]*?<\/section>/, '')
    .trim();

  /*
   * Dans une racine d'ombre, `body` ne désigne plus rien et `:root` désigne
   * le document hôte. On les ramène sur l'hôte du composant et sur son
   * enveloppe, faute de quoi la page perdrait ses couleurs et ses marges.
   */
  const style = feuille
    .replace(/:root\b/g, ':host')
    .replace(/(^|[},;]\s*|@media[^{]*\{\s*)body\b/g, '$1.ngs-page');

  return `<!-- ${id} — NG Security 38. Bloc « HTML personnalisé ».
     Produit par build.mjs le ${new Date().toISOString().slice(0, 10)}.
     Tout se modifie ici même, dans l'éditeur : les adresses en tête, et les
     données sur la ligne window.__catalogue / window.__tarif plus bas. -->
<div id="${id}"></div>
${adresses}<script>
(function () {
  var hote = document.getElementById(${JSON.stringify(id)});
  if (!hote || hote.shadowRoot) return;
  var ombre = hote.attachShadow({ mode: 'open' });
  ombre.innerHTML = ${JSON.stringify(`<style>${style}</style><div class="ngs-page">${corps}</div>`)};
  window.__ngsRacine = ombre;
  window.__ngsIntegre = true;
  ${donnees};
}());
</script>
<script>${paquet}</script>`;
}

/*
 * Copie servie par GitHub Pages.
 *
 * C'est la voie la plus sûre pour un site bâti avec un créateur de pages :
 * on n'y dépose pas de fichiers, et le code intégré plafonne. Les deux pages
 * vivent donc ailleurs, et le site n'en montre qu'un cadre de deux lignes.
 *
 * `.nojekyll` évite que GitHub ne tente de traiter le dossier comme un blog,
 * ce qui écarterait les fichiers commençant par un tiret bas.
 */
const dossierPages = join(ici, '..', '..', 'docs', 'outils');
for (const [nom, page, donnees, fichier] of [
  ['devis', client, lire('tarif.json'), 'tarif.json'],
  ['etude', presentation, lire('catalogue.json'), 'catalogue.json'],
  ['alarme', alarme, lire('tarif-alarme.json'), 'tarif-alarme.json'],
]) {
  const d = join(dossierPages, nom);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), page);
  writeFileSync(join(d, fichier), donnees);
}
writeFileSync(join(dossierPages, 'menu.json'), lire('menu.json'));
referencer(dossierPages);
writeFileSync(join(ici, '..', '..', 'docs', '.nojekyll'), '');
console.log(`${dossierPages} — servi par GitHub Pages`);

/*
 * Le cadre à coller, quand les pages sont servies ailleurs.
 *
 * Deux lignes : aucun plafond de taille à craindre, aucun conflit de style
 * possible, et la page gardée entière — logo compris.
 */
writeFileSync(join(ici, 'dist', 'site', 'cadre-a-coller.html'), `<!-- NG Security 38 — à coller dans un élément « Code intégré ».
     Remplacez l'adresse ci-dessous par celle de la page publiée. -->
<iframe src="https://ngsecurity38.github.io/ngsecurity38/outils/etude/"
        title="Quelle caméra vous faut-il ?"
        style="width:100%;height:2600px;border:0;display:block"
        loading="lazy"></iframe>
`);
console.log(`${join(ici, 'dist', 'site', 'cadre-a-coller.html')} — deux lignes à coller`);

const dossierWp = join(ici, 'dist', 'site', 'wordpress');
mkdirSync(dossierWp, { recursive: true });
/*
 * Les deux seules lignes qu'on aura à modifier, hissées en tête du bloc.
 *
 * Elles figurent aussi dans le catalogue, mais celui-ci est collé sur une
 * ligne unique de plusieurs dizaines de milliers de caractères : y retrouver
 * une adresse dans l'éditeur WordPress est hors de portée. Ici, elles sautent
 * aux yeux.
 */
const adressesEnTete = `<script>
/* ————————————————————————————————————————————————————————————————
   Les DEUX SEULES lignes à modifier une fois vos pages publiées.
   Remplacez-les par l'adresse complète de chacune, par exemple
   'https://ngsecurity38.fr/estimer-mon-installation/'.
   ———————————————————————————————————————————————————————————— */
window.__ngsOutil = '../devis/';          /* « Lancer l'étude »     */
window.__ngsBoutique = '/';               /* « Voir nos caméras »   */
</${'script'}>
`;

for (const [nom, page, feuille, paquet, donnees, id, adresses] of [
  ['etude', presentation, lire('presentation.css'), paquetPresentation,
    `window.__catalogue=${inerte(lire('catalogue.json'))}`, 'ngs-etude', adressesEnTete],
  ['devis', client, lire('devis-client.css'), paquetClient,
    `window.__tarif=${inerte(lire('tarif.json'))}`, 'ngs-devis', ''],
]) {
  const bloc = pourWordpress(page, feuille, paquet, donnees, id, adresses);
  writeFileSync(join(dossierWp, `${nom}.html`), bloc);
  console.log(`${join(dossierWp, `${nom}.html`)} — ${(bloc.length / 1024).toFixed(0)} Ko `
    + 'à coller dans un bloc HTML personnalisé');
}
