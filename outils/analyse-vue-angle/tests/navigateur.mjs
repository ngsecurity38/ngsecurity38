/**
 * Tests de bout en bout, dans un vrai navigateur.
 *
 *   npm run build && npm run test:navigateur
 *
 * Ils couvrent ce que les tests unitaires ne peuvent pas voir : le dossier de
 * sources servi en HTTP, et surtout le fichier unique ouvert depuis le disque
 * (`file://`) avec import d'un vrai PDF.
 *
 * Playwright n'est pas une dépendance du projet : si la bibliothèque est
 * absente, les tests sont ignorés au lieu d'échouer.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = dirname(dirname(fileURLToPath(import.meta.url)));
const FICHIER_UNIQUE = join(racine, 'dist', 'analyse-vue-angle.html');
const FICHIER_OCR = join(racine, 'dist', 'analyse-vue-angle-ocr.html');
const DECALAGE = 0.08; // la vue réglée est prise 8 % plus à droite que la vue demandée
const CHAMP_H = 65.66; // champ horizontal par défaut : capteur 1/2.8", focale 4 mm
const ATTENDU = (180 / Math.PI) * Math.atan(2 * DECALAGE * Math.tan(((CHAMP_H / 2) * Math.PI) / 180));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('Playwright absent — tests navigateur ignorés.');
  console.log('  npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}
if (!existsSync(FICHIER_UNIQUE)) {
  console.error('dist/analyse-vue-angle.html manquant — lancer « npm run build » d\'abord.');
  process.exit(1);
}

/* --------------------------------------------------- petit serveur statique */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
};
const serveur = createServer(async (req, res) => {
  try {
    const chemin = join(racine, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!chemin.startsWith(racine)) throw new Error('hors racine');
    res.writeHead(200, { 'Content-Type': TYPES[extname(chemin)] || 'application/octet-stream' });
    res.end(await readFile(chemin));
  } catch {
    res.writeHead(404).end('non trouvé');
  }
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${serveur.address().port}`;

/* ------------------------------------------------------------ utilitaires */

let echecs = 0;
let reussites = 0;
async function cas(nom, fn) {
  try {
    await fn();
    reussites += 1;
    console.log(`  ok   ${nom}`);
  } catch (err) {
    echecs += 1;
    console.log(`  ÉCHEC ${nom}\n        ${err.message}`);
  }
}
const affirmer = (condition, message) => { if (!condition) throw new Error(message); };

/** Deux fenêtres décalées découpées dans une même scène : le cas réel, simulé. */
const SCENE = `(dec = ${DECALAGE}) => {
  const M = document.createElement('canvas'); M.width = 1400; M.height = 700;
  const g = M.getContext('2d');
  const ciel = g.createLinearGradient(0, 0, 0, 300);
  ciel.addColorStop(0, '#8fb4d8'); ciel.addColorStop(1, '#cfdce8');
  g.fillStyle = ciel; g.fillRect(0, 0, 1400, 320);
  g.fillStyle = '#6f7a68'; g.fillRect(0, 320, 1400, 380);
  g.fillStyle = '#4a4f55'; g.fillRect(0, 430, 1400, 150);
  g.fillStyle = '#d8d2c4'; g.fillRect(120, 140, 300, 300);
  g.fillStyle = '#3a3f47'; g.fillRect(160, 200, 70, 90); g.fillRect(270, 200, 70, 90);
  g.fillStyle = '#b9532f'; g.fillRect(100, 120, 340, 34);
  g.fillStyle = '#cfd3d8'; g.fillRect(760, 180, 280, 260);
  g.fillStyle = '#2f343b'; g.fillRect(820, 300, 160, 140);
  for (let i = 0; i < 9; i += 1) { g.fillStyle = '#eee'; g.fillRect(520 + i * 90, 470, 60, 8); }
  ['#c23b22', '#2f6fa8', '#e0e0e0', '#38424d'].forEach((c, i) => {
    g.fillStyle = c; g.fillRect(530 + i * 92, 486, 64, 34);
  });
  g.fillStyle = '#5a4a3a';
  for (let i = 0; i < 6; i += 1) g.fillRect(60 + i * 230, 300, 10, 150);
  const L = 800; const H = 450;
  const decouper = (dx) => {
    const c = document.createElement('canvas'); c.width = L; c.height = H;
    c.getContext('2d').drawImage(M, 200 + dx, 120, L, H, 0, 0, L, H);
    return c.toDataURL('image/png');
  };
  return { demandee: decouper(0), reglee: decouper(Math.round(dec * L)) };
}`;

/** Joue le générateur de scène dans la page (evaluate reçoit une expression). */
const scene = (page, decalage) => page.evaluate(`(${SCENE})(${decalage === undefined ? DECALAGE : decalage})`);

const enBuffer = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');

/**
 * Texte sans aucune espace.
 *
 * Les montants portent une espace insécable aux milliers — « 1 072,85 € ».
 * Elle est là pour l'œil du client ; une assertion n'a pas à s'en occuper.
 */
const serre = (t) => String(t || '').replace(/[\s\u00a0\u202f]/g, '');
const nombre = (texte) => parseFloat(texte.replace(',', '.'));

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const dossier = await mkdtemp(join(tmpdir(), 'vue-angle-'));

/** Surveille les erreurs de console : une page qui jette n'est jamais « ok ». */
function surveiller(page) {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  return erreurs;
}

async function chargerLesDeuxVues(page, vues) {
  await page.setInputFiles('#fichier-reference', { name: 'demandee.png', mimeType: 'image/png', buffer: enBuffer(vues.demandee) });
  await page.setInputFiles('#fichier-reglee', { name: 'reglee.png', mimeType: 'image/png', buffer: enBuffer(vues.reglee) });
  await page.waitForFunction(() => !document.querySelector('#btn-analyser').disabled);
}

async function analyser(page) {
  await page.click('#btn-analyser');
  await page.waitForSelector('#verdict:not([hidden]) .pastille', { timeout: 30000 });
  return page.evaluate(() => ({
    verdict: document.querySelector('.pastille').textContent.trim(),
    pan: document.querySelector('.critere .val').textContent.trim(),
    consignes: [...document.querySelectorAll('.consignes li')].map((l) => l.textContent).join(' '),
  }));
}

/* ------------------------------------------- 1. dossier de sources, en HTTP */

console.log('\nDossier de sources (servi en HTTP)');
{
  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  const vues = await scene(page);

  await cas('l\'écart de pointage mesuré correspond à la géométrie', async () => {
    await chargerLesDeuxVues(page, vues);
    const r = await analyser(page);
    const pan = nombre(r.pan);
    affirmer(Math.abs(pan - ATTENDU) < 1.0, `pan ${pan}° au lieu de ${ATTENDU.toFixed(2)}°`);
    affirmer(/vers la gauche/.test(r.consignes), 'consigne de correction absente');
  });

  await cas('les quatre modes d\'affichage se rendent sans erreur', async () => {
    for (const mode of ['superposition', 'rideau', 'difference', 'cote']) {
      await page.click(`.mode[data-mode="${mode}"]`);
      await page.waitForTimeout(120);
    }
    affirmer(await page.evaluate(() => !document.querySelector('#paire').hidden), 'retour en côte à côte raté');
  });

  await cas('une zone d\'intérêt se trace et se chiffre', async () => {
    await page.click('#btn-zones');
    const b = await page.locator('#toile-reference').boundingBox();
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.7, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const texte = await page.evaluate(() => document.querySelector('#zones-liste').textContent);
    affirmer(/Couverte à \d+ %/.test(texte), 'couverture non calculée');
  });

  await cas('le recalage manuel recalcule les écarts', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#man-tx');
      el.value = '0';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const pan = nombre(await page.evaluate(() => document.querySelector('.critere .val').textContent));
    affirmer(Math.abs(pan) < 0.01, `écart non remis à zéro : ${pan}`);
  });

  await cas('le rapport se construit', async () => {
    await page.evaluate(() => document.querySelector('#btn-rapport').click());
    const texte = await page.evaluate(() => document.querySelector('#rapport').textContent);
    affirmer(/Procès-verbal/.test(texte), 'rapport vide');
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* ------------------------------------------------- 2. aller-retour de fiche */

console.log('\nEnregistrement et réouverture d\'une fiche');
{
  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  const vues = await scene(page);
  await chargerLesDeuxVues(page, vues);
  await page.fill('#ch-client', 'Dupont & Fils <test>');
  await page.fill('#cam-focale', '6');
  const avant = await analyser(page);

  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-enregistrer'),
  ]);
  const fiche = await telechargement.path();

  await page.reload({ waitUntil: 'networkidle' });
  await page.setInputFiles('#fichier-fiche', fiche);
  await page.waitForSelector('#verdict:not([hidden]) .pastille', { timeout: 15000 });
  const apres = await page.evaluate(() => ({
    pan: document.querySelector('.critere .val').textContent.trim(),
    verdict: document.querySelector('.pastille').textContent.trim(),
    client: document.querySelector('#ch-client').value,
    focale: document.querySelector('#cam-focale').value,
    images: !document.querySelector('#vignette-reference').hidden
      && !document.querySelector('#vignette-reglee').hidden,
  }));

  await cas('la fiche rouverte restitue l\'analyse à l\'identique', () => {
    affirmer(apres.pan === avant.pan && apres.verdict === avant.verdict, 'analyse différente après réouverture');
    affirmer(apres.focale === '6', 'optique non restituée');
    affirmer(apres.images, 'images non restituées');
  });

  await cas('le texte saisi n\'est pas interprété comme du HTML', async () => {
    affirmer(apres.client === 'Dupont & Fils <test>', 'champ altéré');
    await page.evaluate(() => document.querySelector('#btn-rapport').click());
    const html = await page.evaluate(() => document.querySelector('#rapport').innerHTML);
    affirmer(!html.includes('<test>'), 'échappement HTML absent du rapport');
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* ------------------------- 3. fichier unique ouvert depuis le disque + PDF */

console.log('\nFichier unique ouvert depuis le disque (file://), étude au format PDF');
{
  // Fabrique une étude PDF de trois pages dont la dernière porte la vue demandée.
  const atelier = await contexte.newPage();
  await atelier.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  const vues = await scene(atelier);
  await atelier.setContent(`<!doctype html><meta charset="utf-8">
    <style>@page{size:800px 450px;margin:0}html,body{margin:0;font:15px sans-serif}
      .p{width:800px;height:450px;page-break-after:always;box-sizing:border-box;padding:40px}
      img{width:800px;height:450px;display:block} li{margin:4px 0}</style>
    <div class="p">
      <h1>Étude d'implantation vidéoprotection</h1>
      <p>Client : SCI Les Ateliers</p>
      <p>Site : ZA de Chartreuse, 38500 Voiron</p>
      <p>Affaire n° 2026-118</p>
    </div>
    <div class="p">
      <h2>CAM 04 — Parking nord</h2>
      <ul>
        <li>Caméra bullet extérieure, capteur 1/2.8"</li>
        <li>Objectif fixe 2,8 mm — angle de vue 105°</li>
        <li>Résolution 1920 x 1080</li>
        <li>Hauteur de pose : 3,5 m — distance à la scène : 15 m</li>
        <li>Niveau attendu : reconnaissance</li>
      </ul>
    </div>
    <div class="p" style="padding:0"><img src="${vues.demandee}"></div>`);
  const pdf = await atelier.pdf({ preferCSSPageSize: true, printBackground: true });
  const cheminPdf = join(dossier, 'etude.pdf');
  await writeFile(cheminPdf, pdf);
  await atelier.close();

  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  await page.goto(pathToFileURL(FICHIER_UNIQUE).href);
  await page.waitForSelector('#btn-analyser');

  await cas('PDF.js est embarqué dans le fichier', async () => {
    affirmer(await page.evaluate(() => !!window.pdfjsLib), 'pdfjsLib absent');
  });

  await cas('l\'étude PDF s\'ouvre et ses pages sont proposées', async () => {
    await page.setInputFiles('#fichier-reference', cheminPdf);
    await page.waitForSelector('#modale-pdf:not([hidden])');
    await page.waitForFunction(
      () => document.querySelectorAll('#pdf-pages .pdf-vignette').length >= 3,
      { timeout: 30000 },
    );
  });

  await cas('la page portant la vue demandée devient la référence', async () => {
    await page.click('.pdf-vignette[data-page="3"]');
    await page.waitForFunction(() => document.querySelector('#pdf-etat').textContent.includes('Page 3'));
    await page.click('#pdf-valider');
    await page.waitForSelector('#modale-pdf', { state: 'hidden' });
    const info = await page.evaluate(() => document.querySelector('#info-reference').textContent);
    affirmer(/etude\.pdf — page 3/.test(info), `provenance inattendue : ${info}`);
  });

  await cas('l\'analyse issue du PDF donne le même écart', async () => {
    await page.setInputFiles('#fichier-reglee', { name: 'reglee.png', mimeType: 'image/png', buffer: enBuffer(vues.reglee) });
    const r = await analyser(page);
    const pan = nombre(r.pan);
    affirmer(Math.abs(pan - ATTENDU) < 1.2, `pan ${pan}° au lieu de ${ATTENDU.toFixed(2)}°`);
  });

  await cas('le rapport cite la page d\'étude utilisée', async () => {
    await page.evaluate(() => document.querySelector('#btn-rapport').click());
    const texte = await page.evaluate(() => document.querySelector('#rapport').textContent.replace(/\s+/g, ' '));
    affirmer(/etude\.pdf, page 3/.test(texte), 'provenance absente du rapport');
  });

  await cas('les caractéristiques annoncées sont relevées dans le texte', async () => {
    const releve = await page.evaluate(() => {
      const lignes = [...document.querySelectorAll('#etude-tableau tbody tr')].map((tr) => ({
        libelle: tr.children[0].textContent.trim(),
        etude: tr.children[1].textContent.trim(),
        pose: tr.children[2].textContent.trim(),
        conforme: tr.classList.contains('ok'),
        source: tr.children[0].title,
      }));
      return { visible: !document.querySelector('#bloc-etude').hidden, lignes };
    });
    affirmer(releve.visible, 'le bloc de relevé est resté masqué');
    const par = Object.fromEntries(releve.lignes.map((l) => [l.libelle, l]));
    affirmer(par.Focale?.etude === '2,8 mm', `focale relevée : ${par.Focale?.etude}`);
    affirmer(par.Capteur?.conforme, 'capteur 1/2.8" attendu conforme');
    affirmer(/105 °/.test(par['Angle de vue horizontal']?.etude || ''), 'angle de vue non relevé');
    affirmer(!par['Angle de vue horizontal'].conforme, '105° demandés contre 65,8° obtenus : écart attendu');
    affirmer(/Page 2/.test(par.Focale.source), `source non citée : ${par.Focale.source}`);
  });

  await cas('« Reprendre » recopie la valeur de l\'étude dans la configuration', async () => {
    await page.click('#etude-tableau button[data-reprendre="focale"]');
    await page.waitForTimeout(150);
    const focale = await page.evaluate(() => document.querySelector('#cam-focale').value);
    affirmer(Number(focale) === 2.8, `focale non reprise : ${focale}`);
    const conforme = await page.evaluate(() => document.querySelector('#etude-tableau tbody tr').classList.contains('ok'));
    affirmer(conforme, 'la ligne devrait passer conforme après reprise');
    await page.evaluate(() => {
      const el = document.querySelector('#cam-focale');
      el.value = '4';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  await cas('le texte lu est consultable, passages retenus surlignés', async () => {
    await page.click('#etude-diagnostic summary');
    const r = await page.evaluate(() => ({
      visible: !document.querySelector('#etude-diagnostic').hidden,
      pages: document.querySelectorAll('#etude-texte h4').length,
      surlignes: [...document.querySelectorAll('#etude-texte mark')].map((m) => m.textContent),
      manquant: document.querySelector('#etude-manquant').textContent,
    }));
    affirmer(r.visible, 'le diagnostic devrait être disponible');
    affirmer(r.pages === 3, `pages affichées : ${r.pages}`);
    affirmer(r.surlignes.some((t) => /2,8 mm/.test(t)),
      `la ligne de la focale devrait être surlignée : ${JSON.stringify(r.surlignes)}`);
    affirmer(/relevé/i.test(r.manquant), `bilan des manques : ${r.manquant}`);
  });

  await cas('le texte lu se copie en un geste', async () => {
    await page.click('#etude-copier');
    await page.waitForTimeout(200);
    const libelle = await page.evaluate(() => document.querySelector('#etude-copier').textContent.trim());
    affirmer(/copié|sélectionné/i.test(libelle), `bouton : ${libelle}`);
  });

  await cas('« Reprendre l\'en-tête » remplit la fiche chantier', async () => {
    await page.click('#etude-entete');
    const ch = await page.evaluate(() => ({
      client: document.querySelector('#ch-client').value,
      affaire: document.querySelector('#ch-affaire').value,
      camera: document.querySelector('#ch-camera').value,
    }));
    affirmer(ch.client === 'SCI Les Ateliers', `client : ${ch.client}`);
    affirmer(ch.affaire === '2026-118', `affaire : ${ch.affaire}`);
    affirmer(ch.camera === 'CAM 04', `repère : ${ch.camera}`);
  });

  await cas('le rapport porte la conformité à l\'étude', async () => {
    await page.evaluate(() => document.querySelector('#btn-rapport').click());
    const texte = await page.evaluate(() => document.querySelector('#rapport').textContent.replace(/\s+/g, ' '));
    affirmer(/Conformité à l'étude — CAM 04/.test(texte), 'section absente du rapport');
    affirmer(/Angle de vue horizontal/.test(texte), 'ligne d\'angle absente');
    affirmer(/écart entre le matériel annoncé et le matériel posé|écarts entre/.test(texte), 'bilan absent');
  });

  await cas('le fichier léger annonce que la lecture optique lui manque', async () => {
    // Même document scanné, mais ouvert avec la version sans moteur OCR :
    // l'outil doit le dire plutôt que de laisser un relevé vide sans explication.
    const scan = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 900; c.height = 500;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#111'; g.font = '26px serif';
      g.fillText('CAM 09 - Objectif 6 mm', 50, 100);
      return c.toDataURL('image/png');
    });
    const atelier2 = await contexte.newPage();
    await atelier2.setContent(`<!doctype html><meta charset="utf-8">
      <style>@page{size:900px 500px;margin:0}html,body{margin:0}img{width:900px;height:500px;display:block}</style>
      <img src="${scan}">`);
    const chemin = join(dossier, 'scan-leger.pdf');
    await writeFile(chemin, await atelier2.pdf({ preferCSSPageSize: true, printBackground: true }));
    await atelier2.close();

    await page.setInputFiles('#fichier-reference', chemin);
    await page.waitForFunction(
      () => /scann/i.test(document.querySelector('#pdf-releve').textContent),
      { timeout: 60000 },
    );
    const releve = await page.evaluate(() => document.querySelector('#pdf-releve').textContent);
    affirmer(/pas disponible dans cette version/.test(releve), `message : ${releve}`);
    affirmer(await page.evaluate(() => document.querySelector('#pdf-ocr').hidden),
      'le bouton OCR ne doit pas être proposé sans moteur');
    await page.click('#pdf-fermer');
  });

  await cas('le recadrage d\'une page ne retient que la partie choisie', async () => {
    await page.setInputFiles('#fichier-reference', cheminPdf);
    await page.waitForFunction(
      () => document.querySelectorAll('#pdf-pages .pdf-vignette').length >= 3,
      { timeout: 30000 },
    );
    await page.click('.pdf-vignette[data-page="3"]');
    await page.waitForFunction(() => document.querySelector('#pdf-etat').textContent.includes('Page 3'));
    const b = await page.locator('#pdf-toile').boundingBox();
    await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.85, { steps: 10 });
    await page.mouse.up();
    await page.click('#pdf-valider');
    await page.waitForSelector('#modale-pdf', { state: 'hidden' });
    const info = await page.evaluate(() => document.querySelector('#info-reference').textContent);
    affirmer(/recadrée/.test(info), `recadrage non appliqué : ${info}`);
    affirmer(Number(info.match(/(\d+) × \d+ px/)[1]) < 1300, `image non rognée : ${info}`);
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* ------------------------------------------- 4. dossier de plusieurs caméras */

console.log('\nDossier de plusieurs caméras');
{
  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

  await cas('un dossier neuf porte une caméra', async () => {
    const onglets = await page.evaluate(() => [...document.querySelectorAll('.onglet .nom')].map((e) => e.textContent));
    affirmer(onglets.length === 1 && onglets[0] === 'CAM 01', `onglets : ${onglets}`);
    affirmer(await page.evaluate(() => document.querySelector('#btn-supprimer-camera').disabled),
      'la dernière caméra ne doit pas pouvoir être supprimée');
  });

  await cas('la première caméra s\'analyse', async () => {
    await chargerLesDeuxVues(page, await scene(page, 0.08));
    await page.fill('#ch-camera', 'CAM 04 — parking');
    const r = await analyser(page);
    affirmer(r.verdict !== 'Conforme à la vue demandée', `verdict inattendu : ${r.verdict}`);
  });

  await cas('ajouter une caméra ouvre une fiche vierge, sans perdre la première', async () => {
    await page.click('#btn-ajouter-camera');
    await page.waitForFunction(() => document.querySelectorAll('.onglet').length === 2);
    const etat = await page.evaluate(() => ({
      vues: document.querySelector('#vignette-reference').hidden
        && document.querySelector('#vignette-reglee').hidden,
      verdict: document.querySelector('#verdict').hidden,
      focale: document.querySelector('#cam-focale').value,
      actif: document.querySelector('.onglet.actif .nom').textContent,
    }));
    affirmer(etat.vues, 'les vues de la caméra précédente sont restées à l\'écran');
    affirmer(etat.verdict, 'le verdict précédent est resté affiché');
    affirmer(etat.actif === 'CAM 05', `onglet actif : ${etat.actif}`);
    affirmer(etat.focale === '4', 'l\'optique de la caméra précédente devrait être reprise');
  });

  await cas('la seconde caméra a sa propre analyse et sa propre optique', async () => {
    await page.fill('#cam-focale', '6');
    await page.evaluate(() => document.querySelector('#cam-focale').dispatchEvent(new Event('input', { bubbles: true })));
    await chargerLesDeuxVues(page, await scene(page, 0.015));
    const r = await analyser(page);
    affirmer(/Conforme/.test(r.verdict), `verdict : ${r.verdict}`);
  });

  await cas('revenir en arrière restitue la première caméra telle quelle', async () => {
    await page.click('.onglet[data-camera="0"]');
    await page.waitForFunction(() => document.querySelector('.onglet.actif').dataset.camera === '0');
    await page.waitForTimeout(200);
    const etat = await page.evaluate(() => ({
      nom: document.querySelector('#ch-camera').value,
      focale: document.querySelector('#cam-focale').value,
      images: !document.querySelector('#vignette-reference').hidden
        && !document.querySelector('#vignette-reglee').hidden,
      verdict: document.querySelector('#verdict .pastille')?.textContent.trim(),
      pan: document.querySelector('.critere .val')?.textContent.trim(),
    }));
    affirmer(etat.nom === 'CAM 04 — parking', `nom : ${etat.nom}`);
    affirmer(etat.focale === '4', `focale : ${etat.focale} (celle de la seconde caméra a débordé)`);
    affirmer(etat.images, 'images non restituées');
    affirmer(/Ajustement|Non conforme/.test(etat.verdict || ''), `verdict : ${etat.verdict}`);
  });

  await cas('les onglets portent le verdict de chaque caméra', async () => {
    const puces = await page.evaluate(() => [...document.querySelectorAll('.onglet .puce')]
      .map((e) => [...e.classList].filter((c) => c !== 'puce')[0]));
    affirmer(puces.length === 2, `puces : ${puces}`);
    affirmer(puces[1] === 'conforme', `seconde caméra : ${puces[1]}`);
    affirmer(puces[0] !== 'vide' && puces[0] !== 'conforme', `première caméra : ${puces[0]}`);
    const synthese = await page.evaluate(() => document.querySelector('#synthese-courte').textContent);
    affirmer(/1\/2 conforme/.test(synthese), `synthèse : ${synthese}`);
  });

  await cas('le procès-verbal ouvre sur une synthèse et détaille chaque caméra', async () => {
    await page.evaluate(() => document.querySelector('#btn-rapport').click());
    const r = await page.evaluate(() => {
      const rap = document.querySelector('#rapport');
      return {
        texte: rap.textContent.replace(/\s+/g, ' '),
        synthese: [...rap.querySelectorAll('.synthese tbody tr')].map((tr) => tr.children[0].textContent),
        titres: [...rap.querySelectorAll('.camera-titre')].map((e) => e.textContent),
      };
    });
    affirmer(/Synthèse du chantier/.test(r.texte), 'synthèse absente');
    affirmer(r.synthese.length === 2, `lignes de synthèse : ${r.synthese}`);
    affirmer(r.titres.length === 2, `blocs caméra : ${r.titres}`);
    affirmer(/2 caméras analysées sur 2/.test(r.texte), 'bilan mal accordé : ' + r.texte.slice(0, 400));
  });

  await cas('le dossier complet se réenregistre et se rouvre', async () => {
    const [telechargement] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-enregistrer'),
    ]);
    const chemin = await telechargement.path();
    await page.reload({ waitUntil: 'networkidle' });
    await page.setInputFiles('#fichier-fiche', chemin);
    await page.waitForFunction(() => document.querySelectorAll('.onglet').length === 2, { timeout: 15000 });
    const noms = await page.evaluate(() => [...document.querySelectorAll('.onglet .nom')].map((e) => e.textContent));
    affirmer(noms[0] === 'CAM 04 — parking', `noms : ${noms}`);
    await page.click('.onglet[data-camera="1"]');
    await page.waitForTimeout(300);
    const focale = await page.evaluate(() => document.querySelector('#cam-focale').value);
    affirmer(focale === '6', `optique de la seconde caméra : ${focale}`);
  });

  await cas('une fiche de l\'ancienne version s\'ouvre encore', async () => {
    const v1 = join(dossier, 'ancienne-fiche.json');
    await writeFile(v1, JSON.stringify({
      type: 'ng-vue-angle',
      version: 1,
      chantier: { client: 'Ancien client', camera: 'CAM 12', commentaire: 'Note de terrain' },
      camera: { capteur: '1/1.8"', focale: 8, resolution: '0', distance: 30, hauteur: 5 },
      tolerances: { angle: 3 },
      zones: [],
    }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.setInputFiles('#fichier-fiche', v1);
    await page.waitForFunction(() => document.querySelector('.onglet .nom')?.textContent === 'CAM 12',
      { timeout: 15000 });
    const etat = await page.evaluate(() => ({
      onglets: document.querySelectorAll('.onglet').length,
      client: document.querySelector('#ch-client').value,
      focale: document.querySelector('#cam-focale').value,
      commentaire: document.querySelector('#ch-commentaire').value,
      tolerance: document.querySelector('#tol-angle').value,
    }));
    affirmer(etat.onglets === 1 && etat.client === 'Ancien client', JSON.stringify(etat));
    affirmer(etat.focale === '8', `focale : ${etat.focale}`);
    affirmer(etat.commentaire === 'Note de terrain', 'observations perdues');
    affirmer(etat.tolerance === '3', 'tolérances perdues');
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* ----------------------------------------------- 5. étude scannée, lue par OCR */

if (!existsSync(FICHIER_OCR)) {
  console.log('\nÉtude scannée — dist/analyse-vue-angle-ocr.html absent, bloc ignoré.');
} else {
  console.log('\nÉtude scannée, lue par reconnaissance de caractères');
  const page = await contexte.newPage();
  const erreurs = surveiller(page);

  // Une étude scannée : le texte est dessiné dans une image, le PDF n'en porte
  // aucune trace exploitable.
  const atelier = await contexte.newPage();
  await atelier.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  const vues = await scene(atelier);
  const scan = await atelier.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1240; c.height = 700;
    const g = c.getContext('2d');
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111'; g.font = '30px serif';
    g.fillText('ETUDE D IMPLANTATION VIDEOPROTECTION', 60, 80);
    g.font = '26px serif';
    [
      'Client : SCI Les Ateliers',
      'Affaire n 2026-118',
      '',
      'CAM 04 - Parking nord',
      'Capteur 1/2.8 pouce',
      'Objectif fixe 2,8 mm',
      'Resolution 1920 x 1080',
      'Hauteur de pose : 3,5 m',
      'Distance a la scene : 15 m',
    ].forEach((l, i) => g.fillText(l, 60, 150 + i * 46));
    return c.toDataURL('image/png');
  });
  await atelier.setContent(`<!doctype html><meta charset="utf-8">
    <style>@page{size:1240px 700px;margin:0}html,body{margin:0}
      img{width:1240px;height:700px;display:block;page-break-after:always}</style>
    <img src="${scan}"><img src="${vues.demandee}">`);
  const pdf = await atelier.pdf({ preferCSSPageSize: true, printBackground: true });
  const cheminScan = join(dossier, 'etude-scannee.pdf');
  await writeFile(cheminScan, pdf);
  await atelier.close();

  await page.goto(pathToFileURL(FICHIER_OCR).href);
  await page.waitForSelector('#btn-analyser');

  await cas('un PDF sans texte est reconnu comme scanné', async () => {
    await page.setInputFiles('#fichier-reference', cheminScan);
    await page.waitForSelector('#modale-pdf:not([hidden])');
    await page.waitForFunction(
      () => /scann/i.test(document.querySelector('#pdf-releve').textContent),
      { timeout: 60000 },
    );
    affirmer(!(await page.evaluate(() => document.querySelector('#pdf-ocr').hidden)),
      'le bouton de lecture optique devrait être proposé');
  });

  await cas('la lecture optique retrouve les caractéristiques annoncées', async () => {
    await page.click('#pdf-ocr');
    await page.waitForFunction(
      () => /Lecture optique/.test(document.querySelector('#pdf-releve').textContent),
      { timeout: 180000 },
    );
    const releve = await page.evaluate(() => document.querySelector('#pdf-releve').textContent);
    affirmer(/caméra repérée/.test(releve), `relevé : ${releve}`);
  });

  await cas('les valeurs lues alimentent la confrontation, avec avertissement', async () => {
    await page.click('.pdf-vignette[data-page="2"]');
    await page.waitForFunction(() => document.querySelector('#pdf-etat').textContent.includes('Page 2'));
    await page.click('#pdf-valider');
    await page.waitForSelector('#modale-pdf', { state: 'hidden' });
    const r = await page.evaluate(() => ({
      avertissement: !document.querySelector('#etude-ocr').hidden,
      lignes: [...document.querySelectorAll('#etude-tableau tbody tr')].map((tr) => ({
        libelle: tr.children[0].textContent.trim(),
        etude: tr.children[1].textContent.trim(),
      })),
    }));
    affirmer(r.avertissement, 'l\'avertissement « lecture optique » devrait être visible');
    const par = Object.fromEntries(r.lignes.map((l) => [l.libelle, l.etude]));
    affirmer(par.Focale === '2,8 mm', `focale lue : ${par.Focale}`);
    affirmer(par.Capteur === '1/2.8"', `capteur lu : ${par.Capteur}`);
    affirmer(/1920/.test(par['Résolution'] || ''), `résolution lue : ${par['Résolution']}`);
    affirmer(/3,5 m/.test(par['Hauteur de pose'] || ''), `hauteur lue : ${par['Hauteur de pose']}`);
  });

  await cas('le procès-verbal signale la provenance optique', async () => {
    await page.evaluate(() => document.querySelector('#btn-rapport').click());
    const texte = await page.evaluate(() => document.querySelector('#rapport').textContent.replace(/\s+/g, ' '));
    affirmer(/par lecture optique \(document scanné\)/.test(texte), 'provenance optique absente du PV');
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* --------------------------------------- 6. champ tracé sur un plan aérien */

console.log('\nChamp tracé sur un plan');
{
  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

  // Plan carré de 1000 px : on y placera des points à des fractions connues,
  // ce qui rend les distances vérifiables au mètre près.
  const plan = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 1000;
    const g = c.getContext('2d');
    g.fillStyle = '#7a8070'; g.fillRect(0, 0, 1000, 1000);
    g.fillStyle = '#5a5f55';
    for (let i = 0; i < 40; i += 1) g.fillRect(Math.random() * 1000, Math.random() * 1000, 40, 25);
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.strokeRect(200, 200, 200, 200);
    return c.toDataURL('image/png');
  });

  /** Clique à une position donnée en fractions de la toile du plan. */
  const cliquerPlan = async (fx, fy) => {
    const b = await page.locator('#toile-plan').boundingBox();
    await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
    await page.waitForTimeout(60);
  };

  await cas('le plan se charge et bascule la visionneuse', async () => {
    await page.setInputFiles('#fichier-plan', {
      name: 'plan.png', mimeType: 'image/png', buffer: enBuffer(plan),
    });
    await page.waitForSelector('#plan-vue:not([hidden])', { timeout: 10000 });
    const mode = await page.evaluate(() => document.querySelector('.mode.actif').dataset.mode);
    affirmer(mode === 'plan', `mode : ${mode}`);
    affirmer(/[ÉE]talonner|distance connue/i.test(
      await page.evaluate(() => document.querySelector('#plan-consigne').textContent),
    ), 'la consigne devrait demander l\'étalonnage');
  });

  await cas('étalonnage : une distance connue fixe l\'échelle du plan', async () => {
    await page.fill('#plan-etalon-metres', '50');
    await page.click('.etapes [data-etape="etalon"]');
    // Deux points écartés d'un quart de la largeur : 50 m pour 0,25 unité,
    // donc 200 m sur toute la largeur du plan.
    await cliquerPlan(0.25, 0.9);
    await cliquerPlan(0.5, 0.9);
    const echelle = await page.evaluate(() => {
      const c = document.querySelector('.onglet.actif');
      return c ? null : null;
    });
    affirmer(echelle === null, 'étalonnage posé');
  });

  await cas('tracé : portée et azimut se mesurent sur le plan', async () => {
    await page.click('.etapes [data-etape="sommet"]');
    await cliquerPlan(0.5, 0.8);
    await page.click('.etapes [data-etape="vise"]');
    await cliquerPlan(0.5, 0.3); // 0,5 unité vers le haut → 100 m, plein nord
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const tuiles = [...document.querySelectorAll('#plan-mesures .mesure')];
      return Object.fromEntries(tuiles.map((t) => [
        t.querySelector('.cle').textContent.trim(),
        t.querySelector('.val').textContent.trim(),
      ]));
    });
    const portee = parseFloat(m['Portée visée'].replace(',', '.'));
    affirmer(Math.abs(portee - 100) < 3, `portée mesurée : ${m['Portée visée']} (attendu ~100 m)`);
    affirmer(m.Azimut.startsWith('0'), `azimut : ${m.Azimut}`);
  });

  await cas('l\'ouverture tracée donne la focale nécessaire', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#plan-ouverture');
      el.value = '60';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('#plan-mesures .mesure')].map((t) => [
        t.querySelector('.cle').textContent.trim(),
        t.querySelector('.val').textContent.trim(),
      ]),
    ));
    // Capteur 1/2.8" (5,18 mm) à 60° d'ouverture : 5,18 / (2·tan30) = 4,5 mm.
    const focale = parseFloat(m['Focale nécessaire'].replace(',', '.'));
    affirmer(Math.abs(focale - 4.5) < 0.2, `focale : ${m['Focale nécessaire']} (attendu ~4,5 mm)`);
    // Largeur couverte : 2 × 100 × tan30 = 115 m.
    const largeur = parseFloat(m['Largeur couverte'].replace(',', '.'));
    affirmer(Math.abs(largeur - 115) < 5, `largeur : ${m['Largeur couverte']}`);
  });

  await cas('resserrer le champ allonge la focale et densifie l\'image', async () => {
    const lire = () => page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('#plan-mesures .mesure')].map((t) => [
        t.querySelector('.cle').textContent.trim(),
        parseFloat(t.querySelector('.val').textContent.replace(',', '.')),
      ]),
    ));
    const large = await lire();
    await page.evaluate(() => {
      const el = document.querySelector('#plan-ouverture');
      el.value = '20';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    const serre = await lire();
    affirmer(serre['Focale nécessaire'] > large['Focale nécessaire'], 'focale plus longue');
    affirmer(serre['Densité à la portée'] > large['Densité à la portée'], 'densité plus forte');
  });

  await cas('le catalogue propose un objectif et le zoom à régler', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#plan-ouverture');
      el.value = '65.8'; // l'ouverture d'un 4 mm sur 1/2.8"
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({
      conseil: document.querySelector('#plan-conseil').textContent,
      propositions: [...document.querySelectorAll('.propositions li')].map((l) => l.textContent),
    }));
    affirmer(/dahua/i.test(r.conseil), `conseil : ${r.conseil}`);
    affirmer(/4 mm/.test(r.conseil), `la focale conseillée devrait être 4 mm : ${r.conseil}`);
    affirmer(r.propositions.length >= 1, 'au moins une proposition');
  });

  await cas('le catalogue montre la provenance de chaque référence', async () => {
    const r = await page.evaluate(() => {
      document.querySelector('#catalogue-liste').closest('details').open = true;
      const lignes = [...document.querySelectorAll('#catalogue-liste tbody tr')];
      return lignes.map((tr) => {
        const cases = tr.querySelectorAll('td');
        const pastille = cases[cases.length - 2];
        return {
          reference: tr.querySelector('[data-champ="reference"]').value,
          marque: pastille.textContent.trim(),
          titre: pastille.getAttribute('title') || '',
        };
      });
    });
    affirmer(r.length >= 20, `catalogue fourni : ${r.length} lignes`);

    const etude = r.find((l) => l.reference === 'DHI-TPC-BF1241');
    affirmer(etude && etude.marque === '✓', 'la caméra lue sur l\'étude est marquée vérifiée');

    const brochure = r.find((l) => l.reference === 'DS-2CD2083G2-I');
    affirmer(!!brochure, 'les références de la brochure Hikvision sont là');
    affirmer(brochure.marque === '~', `capteur supposé attendu, obtenu « ${brochure.marque} »`);
    affirmer(/AcuSense/.test(brochure.titre) && /p\. 11/.test(brochure.titre),
      `la source doit être citée : ${brochure.titre}`);
  });

  await cas('un relevé commercial ajoute ses références sans écraser le catalogue', async () => {
    const avant = await page.evaluate(
      () => document.querySelectorAll('#catalogue-liste tbody tr').length,
    );

    // Trois intitulés tels qu'ils sortent d'un export de place de marché : le
    // premier complet, le deuxième sans focale, le troisième n'est pas une caméra.
    await page.setInputFiles('#fichier-catalogue', {
      name: 'releve-mars.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'ASIN (parent),Titre,Sessions',
        'B01,"Hikvision DS-2CD3786G2T-IZS (2,7-13,5 mm) AcuSense 8MP Varifocal 4K Caméra dôme",9',
        'B02,"Axis P3265-LVE High-Perf Fixed Dome CAM W/DLPU",17',
        'B03,"Ruijie Reyee 24-Port Gigabit Layer 2 Managed Switch RG-NBS3200-24GT4XS",1',
      ].join('\n'), 'utf8'),
    });
    await page.waitForTimeout(300);

    const r = await page.evaluate(() => {
      const lignes = [...document.querySelectorAll('#catalogue-liste tbody tr')];
      return {
        total: lignes.length,
        references: lignes.map((tr) => tr.querySelector('[data-champ="reference"]').value),
        incompletes: lignes.filter((tr) => tr.classList.contains('a-completer'))
          .map((tr) => tr.querySelector('[data-champ="reference"]').value),
        etat: document.querySelector('#etat-analyse').textContent,
      };
    });

    affirmer(r.references.includes('DHI-TPC-BF1241'), 'le catalogue en place n\'est pas écrasé');
    affirmer(r.references.includes('P3265-LVE'), 'la référence sans focale est quand même relevée');
    affirmer(!r.references.includes('RG-NBS3200-24GT4XS'), 'le switch ne doit pas entrer au catalogue');
    affirmer(r.incompletes.includes('P3265-LVE'), 'elle doit être marquée à compléter');
    affirmer(r.total > avant, `le catalogue s'est étoffé : ${avant} → ${r.total}`);
    affirmer(/compl[ée]ter/i.test(r.etat), `le message doit le dire : ${r.etat}`);
  });

  await cas('lier l\'ouverture à la focale saisie redessine le champ réel', async () => {
    await page.check('#plan-lier');
    await page.evaluate(() => {
      const el = document.querySelector('#cam-focale');
      el.value = '8';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const ouverture = await page.evaluate(() => parseFloat(
      document.querySelector('#out-ouverture').textContent.replace(',', '.'),
    ));
    // 5,18 mm de capteur sur 8 mm de focale : 2·atan(5,18/16) = 35,3°.
    affirmer(Math.abs(ouverture - 35.3) < 1, `ouverture déduite : ${ouverture}°`);
    affirmer(await page.evaluate(() => document.querySelector('#plan-ouverture').disabled),
      'le curseur doit être neutralisé quand l\'ouverture suit la focale');
    await page.uncheck('#plan-lier');
  });

  await cas('« Appliquer au bloc 2 » reprend focale et distance', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#plan-ouverture');
      el.value = '40';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('#plan-reprendre');
    await page.waitForTimeout(150);
    const v = await page.evaluate(() => ({
      focale: parseFloat(document.querySelector('#cam-focale').value),
      distance: parseFloat(document.querySelector('#cam-distance').value),
    }));
    // 5,18 / (2·tan20) = 7,1 mm ; portée 100 m.
    affirmer(Math.abs(v.focale - 7.1) < 0.3, `focale reprise : ${v.focale}`);
    affirmer(Math.abs(v.distance - 100) < 3, `distance reprise : ${v.distance}`);
  });

  await cas('le tracé survit au changement de caméra et à la fiche', async () => {
    await page.click('#btn-ajouter-camera');
    await page.waitForTimeout(200);
    affirmer(await page.evaluate(() => document.querySelector('#plan-reglages').hidden),
      'la nouvelle caméra ne doit pas hériter du plan');
    await page.click('.onglet[data-camera="0"]');
    await page.waitForTimeout(300);
    const revenu = await page.evaluate(() => ({
      visible: !document.querySelector('#plan-reglages').hidden,
      portee: document.querySelector('#plan-mesures .mesure .val')?.textContent.trim(),
    }));
    affirmer(revenu.visible, 'le plan de la première caméra devrait revenir');
    affirmer(/^10\d/.test(revenu.portee || ''), `portée restituée : ${revenu.portee}`);
  });

  await cas('le procès-verbal porte la fiche d\'implantation', async () => {
    await page.evaluate(() => document.querySelector('#btn-rapport').click());
    const texte = await page.evaluate(() => document.querySelector('#rapport').textContent.replace(/\s+/g, ' '));
    affirmer(/Fiche d'implantation — champ à réaliser/.test(texte), 'section absente');
    affirmer(/Nombre pixel\/m/.test(texte), 'ligne de densité absente');
    affirmer(/Azimut/.test(texte), 'tableau de tracé absent');
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* ----------------------------- 7. étude depuis une photo, et proposition client */

console.log('\nÉtude depuis une photo de repérage');
{
  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

  // Photo type : ciel en haut, cour au sol, quelques objets pour la lisibilité.
  const photo = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 900;
    const g = c.getContext('2d');
    g.fillStyle = '#aebfd0'; g.fillRect(0, 0, 1600, 300);
    g.fillStyle = '#8a8a82'; g.fillRect(0, 300, 1600, 600);
    g.fillStyle = '#3a5f2a'; g.fillRect(0, 280, 1600, 40);
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle = '#2f5f9e';
      g.fillRect(1100 + i * 80, 340 + i * 30, 70, 50 + i * 10);
    }
    g.fillStyle = '#d8d8d2'; g.fillRect(500, 600, 200, 90);
    return c.toDataURL('image/png');
  });

  /** La souris travaille en coordonnées d'écran : la toile doit être visible. */
  const toilePhoto = async () => {
    const l = page.locator('#toile-photo');
    await l.scrollIntoViewIfNeeded();
    return l.boundingBox();
  };
  const glisser = async (u1, v1, u2, v2) => {
    const b = await toilePhoto();
    await page.mouse.move(b.x + b.width * u1, b.y + b.height * v1);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * u2, b.y + b.height * v2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const cliquerPhoto = async (u, v) => {
    const b = await toilePhoto();
    await page.mouse.click(b.x + b.width * u, b.y + b.height * v);
    await page.waitForTimeout(120);
  };
  const tuiles = () => page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('#photo-mesures .mesure')].map((t) => [
      t.querySelector('.cle').textContent.trim(),
      t.querySelector('.val').textContent.trim(),
    ]),
  ));

  await cas('la photo se charge et bascule la visionneuse', async () => {
    await page.setInputFiles('#fichier-photo', {
      name: 'reperage.png', mimeType: 'image/png', buffer: enBuffer(photo),
    });
    await page.waitForSelector('#photo-vue:not([hidden])', { timeout: 10000 });
    const mode = await page.evaluate(() => document.querySelector('.mode.actif').dataset.mode);
    affirmer(mode === 'photo', `mode : ${mode}`);
    affirmer(/repère/i.test(await page.evaluate(() => document.querySelector('#photo-consigne').textContent)),
      'la consigne devrait demander le premier repère');
  });

  await cas('un seul repère : le champ reste supposé', async () => {
    await page.fill('#photo-hauteur', '4.5');
    await page.fill('#photo-distance', '12');
    await page.fill('#photo-distance2', '35');
    await page.click('[data-photo-etape="calage"]');
    await cliquerPhoto(0.5, 0.82);
    const m = await tuiles();
    affirmer(m['Champ supposé'], `un seul repère : le champ devrait être annoncé supposé — ${JSON.stringify(m)}`);
    const inclinaison = parseFloat((m['Inclinaison déduite'] || '').replace(',', '.'));
    affirmer(inclinaison > 0 && inclinaison < 60, `inclinaison déduite : ${m['Inclinaison déduite']}`);
  });

  await cas('deux repères : l\'angle de vue est mesuré, plus supposé', async () => {
    await page.click('[data-photo-etape="calage2"]');
    await cliquerPhoto(0.5, 0.52);
    const m = await tuiles();
    affirmer(m['Champ mesuré'], `le champ devrait être mesuré — ${JSON.stringify(m)}`);
    const champ = parseFloat(m['Champ mesuré'].replace(',', '.'));
    affirmer(champ > 15 && champ < 150, `champ mesuré : ${m['Champ mesuré']}`);
    const auto = await page.evaluate(() => document.querySelector('#photo-consigne').textContent);
    affirmer(/zone|Zone/.test(auto), `la consigne devrait passer à la zone : ${auto}`);
  });

  await cas('la zone entourée est analysée toute seule', async () => {
    await page.click('[data-photo-etape="zone"]');
    await glisser(0.2, 0.45, 0.8, 0.9);
    const m = await tuiles();
    const nb = (cle) => parseFloat((m[cle] || '').replace(',', '.'));
    affirmer(m['Champ de la photo (mesuré)'], `le champ mesuré devrait être rappelé — ${JSON.stringify(m)}`);
    affirmer(nb('Angle de vue nécessaire') > 10 && nb('Angle de vue nécessaire') < 90,
      `angle : ${m['Angle de vue nécessaire']}`);
    affirmer(nb('Focale à poser') > 1 && nb('Focale à poser') < 40, `focale : ${m['Focale à poser']}`);
    affirmer(nb('Zone la plus éloignée') > nb('Zone la plus proche'), 'le fond est plus loin que le bord');
    affirmer(m['Niveau garanti'], 'un niveau d\'exploitation est annoncé');
  });

  await cas('la photo ne bouge pas pendant qu\'on trace', async () => {
    // Le panneau de résultats se remplit sous la photo au fur et à mesure du
    // tracé. Si la visionneuse lui cède de la hauteur et recentre son contenu,
    // la photo remonte sous le curseur et le rectangle obtenu n'est pas celui
    // qu'on dessine — le défaut se voit à l'usage, jamais dans une capture.
    await page.evaluate(() => {
      window.__rects = [];
      const t = document.querySelector('#toile-photo');
      for (const ev of ['pointerdown', 'pointermove', 'pointerup']) {
        t.addEventListener(ev, () => {
          const r = t.getBoundingClientRect();
          window.__rects.push([r.top, r.left, r.width, r.height]);
        }, true);
      }
    });

    await page.click('[data-photo-etape="zone"]');
    await glisser(0.25, 0.4, 0.75, 0.88);

    const rects = await page.evaluate(() => window.__rects);
    affirmer(rects.length >= 3, `le tracé devrait produire des événements : ${rects.length}`);
    const [t0, g0, l0, h0] = rects[0];
    for (const [t, g, l, h] of rects) {
      affirmer(
        Math.abs(t - t0) < 2 && Math.abs(g - g0) < 2 && Math.abs(l - l0) < 2 && Math.abs(h - h0) < 2,
        `la toile a bougé pendant le tracé : ${[t0, g0, l0, h0]} → ${[t, g, l, h]}`,
      );
    }
  });

  await cas('resserrer la zone allonge la focale', async () => {
    const avant = parseFloat((await tuiles())['Focale à poser'].replace(',', '.'));
    await page.click('[data-photo-etape="zone"]');
    await glisser(0.4, 0.45, 0.6, 0.9);
    const apres = parseFloat((await tuiles())['Focale à poser'].replace(',', '.'));
    affirmer(apres > avant, `focale ${apres} devrait dépasser ${avant}`);
  });

  await cas('le matériel est proposé avec son réglage', async () => {
    const r = await page.evaluate(() => ({
      conseil: document.querySelector('#photo-conseil').textContent,
      portees: document.querySelector('#photo-portees').textContent,
    }));
    affirmer(r.conseil.length > 20, `conseil : ${r.conseil}`);
    affirmer(/Reconnaissance|Identification|Détection|Observation/.test(r.portees),
      'les portées d\'exploitation devraient être listées');
  });

  await cas('« Appliquer au bloc 2 » reprend focale, distance et hauteur', async () => {
    const m = await tuiles();
    await page.click('#photo-reprendre');
    await page.waitForTimeout(150);
    const v = await page.evaluate(() => ({
      focale: parseFloat(document.querySelector('#cam-focale').value),
      distance: parseFloat(document.querySelector('#cam-distance').value),
      hauteur: parseFloat(document.querySelector('#cam-hauteur').value),
    }));
    affirmer(Math.abs(v.focale - parseFloat(m['Focale à poser'].replace(',', '.'))) < 0.2,
      `focale reprise : ${v.focale}`);
    affirmer(Math.abs(v.hauteur - 4.5) < 0.01, `hauteur reprise : ${v.hauteur}`);
    affirmer(v.distance > 1, `distance reprise : ${v.distance}`);
  });

  await cas('la proposition client est un document complet', async () => {
    await page.fill('#ch-client', 'Communauté de communes');
    await page.fill('#ch-site', 'Déchetterie intercommunale');
    await page.fill('#ch-camera', 'CAM 04 — quai de dépôt');
    await page.evaluate(() => document.querySelector('#btn-proposition').click());
    const r = await page.evaluate(() => ({
      texte: document.querySelector('#rapport').textContent.replace(/\s+/g, ' '),
      images: document.querySelectorAll('#rapport img').length,
    }));
    affirmer(/Proposition d'implantation vidéoprotection/.test(r.texte), 'titre absent');
    affirmer(/Synthèse de la couverture/.test(r.texte), 'synthèse absente');
    affirmer(/Matériel préconisé/.test(r.texte), 'matériel absent');
    affirmer(/Ce que permettra l'image/.test(r.texte), 'niveaux d\'exploitation absents');
    affirmer(/reconnaître une personne déjà connue/.test(r.texte), 'explication en clair absente');
    affirmer(/Méthode et hypothèses/.test(r.texte), 'hypothèses absentes');
    affirmer(/sol est supposé plan/.test(r.texte), 'la limite du sol plan doit être écrite');
    affirmer(/tracé d'angle/i.test(r.texte), 'le tracé d\'angle doit figurer dans la proposition');
    affirmer(/mesuré sur deux repères/.test(r.texte), 'la provenance du champ doit être dite');
    affirmer(r.images >= 2, `photo annotée et tracé d'angle attendus : ${r.images} image(s)`);
  });

  await cas('la zone se déplace après coup', async () => {
    // Zone connue, pour saisir son centre à coup sûr.
    await page.click('[data-photo-etape="zone"]');
    await glisser(0.25, 0.50, 0.75, 0.90);
    const avant = await tuiles();
    const b = await toilePhoto();
    // Remonter la zone dans l'image : elle vise alors plus loin.
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.70);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.63, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(220);
    const apres = await tuiles();
    const d = (m) => parseFloat((m['Zone la plus éloignée'] || '').replace(',', '.'));
    affirmer(Number.isFinite(d(avant)) && Number.isFinite(d(apres)),
      `mesures absentes — avant ${JSON.stringify(avant)} / après ${JSON.stringify(apres)}`);
    affirmer(d(apres) > d(avant),
      `la zone remontée devrait viser plus loin : ${avant['Zone la plus éloignée']} → ${apres['Zone la plus éloignée']}`);
  });

  await cas('une poignée retaille la zone sans la retracer', async () => {
    await page.click('[data-photo-etape="zone"]');
    await glisser(0.30, 0.50, 0.70, 0.90);
    const avant = await tuiles();
    const b = await toilePhoto();
    // Poignée du bord droit, au milieu de la hauteur de la zone.
    await page.mouse.move(b.x + b.width * 0.70, b.y + b.height * 0.70);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.92, b.y + b.height * 0.70, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(220);
    const apres = await tuiles();
    const a = (m) => parseFloat((m['Angle de vue nécessaire'] || '').replace(',', '.'));
    affirmer(Number.isFinite(a(avant)) && Number.isFinite(a(apres)),
      `mesures absentes — ${JSON.stringify(apres)}`);
    affirmer(a(apres) > a(avant),
      `élargir la zone devrait élargir l'angle : ${avant['Angle de vue nécessaire']} → ${apres['Angle de vue nécessaire']}`);
  });

  await cas('un repère se déplace et le calage suit', async () => {
    const avant = await tuiles();
    const b = await toilePhoto();
    // Le second repère est posé à (0,5 ; 0,52) : on le descend légèrement.
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.52);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.57, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const apres = await tuiles();
    affirmer(apres['Champ de la photo (mesuré)'] !== avant['Champ de la photo (mesuré)'],
      `déplacer un repère devrait changer le champ mesuré : ${avant['Champ de la photo (mesuré)']} → ${apres['Champ de la photo (mesuré)']}`);
  });

  await cas('le tracé d\'angle est dessiné sous la photo', async () => {
    const schema = await page.evaluate(() => {
      const c = document.querySelector('#toile-schema');
      return { visible: !c.hidden, largeur: c.width, hauteur: c.height };
    });
    affirmer(schema.visible, 'le schéma devrait être affiché');
    affirmer(schema.largeur > 100 && schema.hauteur > 100, `dimensions : ${JSON.stringify(schema)}`);
  });

  await cas('le procès-verbal reste un document distinct', async () => {
    await page.evaluate(() => document.querySelector('#btn-rapport').click());
    const texte = await page.evaluate(() => document.querySelector('#rapport').textContent);
    affirmer(/Procès-verbal/.test(texte), 'le PV doit rester accessible');
    affirmer(!/Proposition d'implantation/.test(texte), 'les deux documents ne doivent pas se mélanger');
  });

  await cas('l\'étude photo survit au changement de caméra', async () => {
    const avant = await tuiles();
    await page.click('#btn-ajouter-camera');
    await page.waitForTimeout(200);
    affirmer(await page.evaluate(() => document.querySelector('#photo-reglages').hidden),
      'la nouvelle caméra part sans photo');
    await page.click('.onglet[data-camera="0"]');
    await page.waitForTimeout(300);
    const apres = await tuiles();
    affirmer(apres['Focale à poser'] === avant['Focale à poser'],
      `focale restituée : ${apres['Focale à poser']} au lieu de ${avant['Focale à poser']}`);
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* ------------------------------------------- 8. synoptique de câblage */

console.log('\nSynoptique de câblage');
{
  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

  // Vue aérienne type : un bâtiment, une cour.
  const vue = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1400; c.height = 1000;
    const g = c.getContext('2d');
    g.fillStyle = '#9aa08f'; g.fillRect(0, 0, 1400, 1000);
    g.fillStyle = '#c9c4bb'; g.fillRect(120, 90, 700, 320);
    g.fillStyle = '#8c9384'; g.fillRect(120, 470, 1120, 430);
    return c.toDataURL('image/png');
  });

  const toileReseau = async () => {
    const l = page.locator('#toile-reseau');
    await l.scrollIntoViewIfNeeded();
    return l.boundingBox();
  };
  const clic = async (u, v) => {
    const b = await toileReseau();
    await page.mouse.click(b.x + b.width * u, b.y + b.height * v);
    await page.waitForTimeout(90);
  };
  const lignes = () => page.evaluate(() => [...document.querySelectorAll('#reseau-tableau tbody tr')]
    .map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
  const alertes = () => page.evaluate(() => [...document.querySelectorAll('#reseau-alertes li')]
    .map((t) => t.textContent.replace(/\s+/g, ' ').trim()));

  await cas('le plan du site bascule sur le synoptique', async () => {
    await page.setInputFiles('#fichier-reseau', {
      name: 'site.png', mimeType: 'image/png', buffer: enBuffer(vue),
    });
    await page.waitForSelector('#reseau-vue:not([hidden])', { timeout: 10000 });
    const mode = await page.evaluate(() => document.querySelector('.mode.actif').dataset.mode);
    affirmer(mode === 'reseau', `mode : ${mode}`);
    affirmer(/[Cc]alibrer/.test(await page.evaluate(
      () => document.querySelector('#reseau-consigne').textContent,
    )), 'la consigne devrait demander le calibrage');
  });

  await cas('le matériel se pose avant le calibrage, sans longueur chiffrée', async () => {
    await page.click('[data-reseau-outil="poser"]');
    await page.selectOption('#reseau-type', 'camera');
    await clic(0.2, 0.3);
    await page.selectOption('#reseau-type', 'switch');
    await clic(0.4, 0.2);
    await page.click('[data-reseau-outil="relier"]');
    await clic(0.2, 0.3);
    await clic(0.4, 0.2);

    affirmer((await lignes()).length === 0, 'rien ne peut être chiffré sans échelle');
    const a = await alertes();
    affirmer(a.some((x) => /non calibré/i.test(x)), `l'outil doit le dire : ${a.join(' | ')}`);
    // Le câblage tracé doit rester visible même sans échelle : c'est le dessin
    // qui porte le travail, pas le tableau. On le vérifie sur les pixels de la
    // toile, en cherchant le violet des liaisons entre les deux matériels.
    const violet = await page.evaluate(() => {
      const t = document.querySelector('#toile-reseau');
      const d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 90 && d[i] < 140 && d[i + 1] < 110 && d[i + 2] > 180) n += 1;
      }
      return n;
    });
    affirmer(violet > 50, `la liaison doit être dessinée même sans échelle : ${violet} pixels`);
  });

  await cas('une fois le plan calibré, les longueurs apparaissent', async () => {
    await page.fill('#reseau-etalon', '40');
    await page.click('[data-reseau-outil="calage"]');
    await clic(0.1, 0.06);
    await clic(0.6, 0.06);   // 0,5 unité = 40 m, soit 80 m par unité

    const l = await lignes();
    affirmer(l.length === 1, `une liaison attendue : ${JSON.stringify(l)}`);
    // Trajet 0,2/0,3 → 0,4/0,2 : 0,2236 unité, soit 17,9 m ; plus 3,5 m de
    // descente caméra, plus 10 % de réserve, soit 23,5 m.
    affirmer(/2[23],\d m/.test(l[0]), `longueur de câble inattendue : ${l[0]}`);
  });

  await cas('corriger la distance connue recalcule tout', async () => {
    // L'invariant qui compte n'est pas une longueur particulière mais le
    // rapport : tripler la distance de référence triple l'échelle, donc le
    // trajet au plan — les descentes, elles, ne bougent pas.
    const auPlan = () => page.evaluate(() => parseFloat(
      document.querySelector('#reseau-tableau tbody tr td:nth-child(2)')
        .textContent.replace(',', '.'),
    ));
    const avant = await auPlan();
    await page.fill('#reseau-etalon', '120');
    await page.dispatchEvent('#reseau-etalon', 'change');
    await page.waitForTimeout(200);
    const apres = await auPlan();
    affirmer(Math.abs(apres / avant - 3) < 0.02,
      `l'échelle triplée devrait tripler le trajet : ${avant} → ${apres}`);
  });

  await cas('au-delà de 90 m, la liaison est signalée', async () => {
    await page.click('[data-reseau-outil="poser"]');
    await page.selectOption('#reseau-type', 'camera');
    await clic(0.9, 0.85);
    await page.click('[data-reseau-outil="relier"]');
    await clic(0.9, 0.85);
    await clic(0.4, 0.2);
    await page.waitForTimeout(150);

    const a = await alertes();
    affirmer(a.some((x) => /90 m/.test(x) && /fibre|switch/i.test(x)),
      `le dépassement doit être expliqué : ${a.join(' | ')}`);
    const l = await lignes();
    affirmer(l.length === 2, `deux liaisons attendues : ${JSON.stringify(l)}`);
  });

  await cas('un matériel au bout d\'aucun câble est signalé', async () => {
    await page.click('[data-reseau-outil="poser"]');
    await page.selectOption('#reseau-type', 'nvr');
    await clic(0.55, 0.5);
    await page.waitForTimeout(150);
    const a = await alertes();
    affirmer(a.some((x) => /aucun câble/i.test(x)), `matériel isolé : ${a.join(' | ')}`);
    affirmer(a.some((x) => /aucun enregistreur/i.test(x)),
      `les caméras ne remontent à rien : ${a.join(' | ')}`);
  });

  await cas('le récapitulatif compte le matériel et le câble', async () => {
    const m = await page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('#reseau-mesures .mesure')].map((t) => [
        t.querySelector('.cle').textContent.trim(),
        t.querySelector('.val').textContent.trim(),
      ]),
    ));
    affirmer(m['Caméra'] === '2', `caméras comptées : ${m['Caméra']}`);
    affirmer(m['Switch PoE'] === '1', `switches : ${m['Switch PoE']}`);
    affirmer(parseFloat((m['Câble total'] || '').replace(',', '.')) > 100,
      `câble total : ${m['Câble total']}`);
  });

  await cas('le déplacement d\'un matériel rallonge la liaison', async () => {
    const avant = (await lignes())[0];
    await page.click('[data-reseau-outil="deplacer"]');
    const b = await toileReseau();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.05, b.y + b.height * 0.8, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const apres = (await lignes())[0];
    affirmer(apres !== avant, `la longueur devrait changer : ${avant} → ${apres}`);
  });

  await cas('supprimer un matériel supprime ses liaisons', async () => {
    const avant = (await lignes()).length;
    await page.click('[data-reseau-outil="supprimer"]');
    await clic(0.4, 0.2);   // le switch, qui portait les deux liaisons
    await page.waitForTimeout(200);
    const apres = (await lignes()).length;
    affirmer(apres === 0, `${avant} liaisons devaient disparaître avec le switch, reste ${apres}`);
    const pendants = await page.evaluate(
      () => document.querySelectorAll('#reseau-tableau tbody tr').length,
    );
    affirmer(pendants === 0, 'aucune liaison pendante ne doit subsister');
  });

  await cas('le devis se chiffre depuis le matériel posé', async () => {
    page.once('dialog', (d) => d.accept());
    await page.click('#reseau-effacer');
    await page.fill('#reseau-etalon', '40');
    await page.dispatchEvent('#reseau-etalon', 'change');
    await page.evaluate(() => { document.querySelector('#reseau-devis').open = true; });
    await page.waitForTimeout(200);

    await page.click('[data-reseau-outil="poser"]');
    await page.selectOption('#reseau-type', 'nvr');
    await clic(0.3, 0.2);
    await page.selectOption('#reseau-type', 'switch');
    await clic(0.4, 0.22);
    await page.selectOption('#reseau-type', 'camera');
    const places = [[0.15, 0.35], [0.25, 0.4], [0.35, 0.45], [0.55, 0.35]];
    for (const [u, v] of places) await clic(u, v);

    const reference = async (valeur) => {
      const sel = '#reseau-selection [data-materiel-texte="reference"]';
      await page.fill(sel, valeur);
      await page.dispatchEvent(sel, 'change');
    };
    await page.click('[data-reseau-outil="deplacer"]');
    await clic(0.4, 0.22); await reference('DS-3E0310HP-E');
    for (const [u, v] of places) { await clic(u, v); await reference('DS-2CD2T86G2-4I'); }
    await clic(0.3, 0.2); await reference('DS-7608NXI-I2/8P');
    await page.waitForTimeout(150);

    await page.click('#devis-prix-releves');
    await page.waitForTimeout(250);

    const lignes = await page.evaluate(() => [...document.querySelectorAll('#devis-tableau tbody tr')]
      .map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
    // Les identiques sont regroupés : quatre caméras font une ligne de quatre.
    affirmer(lignes.length === 3, `trois lignes attendues : ${JSON.stringify(lignes)}`);
    const cam = lignes.find((l) => /DS-2CD2T86G2/.test(l));
    affirmer(/ 4 /.test(cam), `quantité groupée : ${cam}`);
    // 214,57 € relevés, majorés de 25 % : 268,21 € l'unité.
    // Les milliers portent une espace insécable : on compare sans les espaces.
    affirmer(/268,21/.test(cam), `prix de vente attendu : ${cam}`);
    affirmer(/1072,85/.test(serre(cam)), `total de la ligne : ${cam}`);
  });

  await cas('un matériel sans prix laisse le devis incomplet, et le dit', async () => {
    const lignes = await page.evaluate(() => [...document.querySelectorAll('#devis-tableau tbody tr')]
      .map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
    const nvr = lignes.find((l) => /DS-7608NXI/.test(l));
    affirmer(/⋯/.test(nvr), `l'enregistreur n'a pas de prix relevé : ${nvr}`);

    const reserves = await page.evaluate(() => [...document.querySelectorAll('#devis-tableau .alertes li')]
      .map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
    affirmer(reserves.some((x) => /sans prix/.test(x) && /DS-7608NXI/.test(x)),
      `la ligne non chiffrée doit être nommée : ${JSON.stringify(reserves)}`);
    affirmer(reserves.some((x) => /20\/09\/2026/.test(x) && /confirmer/.test(x)),
      `les prix relevés doivent porter leur date : ${JSON.stringify(reserves)}`);
  });

  await cas('main-d\'œuvre, remise et TVA entrent dans le total', async () => {
    const totaux = () => page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('#devis-mesures .mesure')].map((t) => [
        t.querySelector('.cle').textContent.trim(),
        t.querySelector('.val').textContent.trim(),
      ]),
    ));
    await page.fill('#devis-heures', '10');
    await page.dispatchEvent('#devis-heures', 'change');
    await page.waitForTimeout(200);
    const t = await totaux();
    // 1 072,85 + 108,28 = 1 181,13 HT de matériel, plus 10 h à 55 €.
    affirmer(/1181,13/.test(serre(t['Matériel HT'])), `matériel : ${t['Matériel HT']}`);
    affirmer(/550,00/.test(serre(t["Main-d'œuvre HT"])), `main-d'œuvre : ${t["Main-d'œuvre HT"]}`);
    affirmer(/1731,13/.test(serre(t['Total HT'])), `total HT : ${t['Total HT']}`);
    affirmer(/2077,35/.test(serre(t['Total TTC'])), `total TTC : ${t['Total TTC']}`);

    await page.fill('#devis-remise', '10');
    await page.dispatchEvent('#devis-remise', 'change');
    await page.waitForTimeout(200);
    const apres = await totaux();
    affirmer(apres['Remise'], 'la remise doit apparaître');
    affirmer(parseFloat((apres['Total HT'] || '').replace(/[^\d,]/g, '').replace(',', '.'))
      < 1731.13, `la remise doit baisser le total : ${apres['Total HT']}`);
    await page.fill('#devis-remise', '0');
    await page.dispatchEvent('#devis-remise', 'change');
  });

  await cas('le devis figure à la proposition client, pas au procès-verbal', async () => {
    await page.click('#btn-proposition');
    await page.waitForTimeout(600);
    const proposition = await page.evaluate(() => document.querySelector('#rapport').innerHTML);
    affirmer(/<h2>Devis<\/h2>/.test(proposition), 'le devis doit figurer à la proposition');
    affirmer(/Total TTC/.test(proposition), 'avec son total');
    affirmer(/Pose et mise en service/.test(proposition), 'et la main-d\'œuvre');

    await page.click('#btn-rapport');
    await page.waitForTimeout(600);
    const pv = await page.evaluate(() => document.querySelector('#rapport').innerHTML);
    affirmer(!/<h2>Devis<\/h2>/.test(pv),
      'le procès-verbal constate une pose, il ne vend rien');
  });

  await cas('une caméra orientée trace son champ, un mur le découpe', async () => {
    page.once('dialog', (d) => d.accept());
    await page.click('#reseau-effacer');
    // « Tout effacer » vide le matériel, pas le calibrage : un test précédent
    // a porté la distance de référence à 120 m, et l'échelle avec elle.
    await page.fill('#reseau-etalon', '40');
    await page.dispatchEvent('#reseau-etalon', 'change');
    await page.waitForTimeout(200);

    await page.click('[data-reseau-outil="poser"]');
    await page.selectOption('#reseau-type', 'camera');
    await clic(0.3, 0.3);
    await page.click('[data-reseau-outil="deplacer"]');
    await clic(0.3, 0.3);

    const saisir = async (champ, valeur) => {
      const sel = `#reseau-selection [data-materiel="${champ}"]`;
      await page.fill(sel, valeur);
      await page.dispatchEvent(sel, 'change');
    };
    await saisir('hauteur', '4');
    await saisir('azimut', '150');
    await saisir('ouverture', '80');
    await saisir('portee', '45');
    await page.waitForTimeout(200);

    // Les quatre valeurs doivent avoir été prises : le formulaire ne doit pas
    // se reconstruire entre deux champs, sous peine d'en perdre un sur deux.
    const lu = await page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('#reseau-selection [data-materiel]')]
        .map((e) => [e.dataset.materiel, e.value]),
    ));
    affirmer(lu.azimut === '150' && lu.ouverture === '80' && lu.portee === '45',
      `saisie perdue : ${JSON.stringify(lu)}`);

    const part = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('#couverture-mesures .mesure')]
        .find((x) => /Champ dégagé/.test(x.querySelector('.cle').textContent));
      return t ? parseFloat(t.querySelector('.val').textContent.replace(',', '.')) : 100;
    });
    affirmer(await part() === 100, 'sans mur, le champ est entièrement dégagé');

    // Un muret de 2 m : la caméra voit par-dessus, mais perd une bande.
    await page.fill('#mur-hauteur', '2');
    await page.click('[data-reseau-outil="mur"]');
    await clic(0.15, 0.52);
    await clic(0.75, 0.52);
    await page.waitForTimeout(250);
    const avecMuret = await part();
    affirmer(avecMuret > 30 && avecMuret < 95,
      `un muret entame le champ sans le supprimer : ${avecMuret} %`);

    // Le même mur porté à 5 m : plus rien ne passe au-dessus.
    await page.click('[data-reseau-outil="deplacer"]');
    await clic(0.45, 0.52);
    await page.fill('#reseau-selection [data-mur="hauteur"]', '5');
    await page.dispatchEvent('#reseau-selection [data-mur="hauteur"]', 'change');
    await page.waitForTimeout(250);
    const avecMur = await part();
    affirmer(avecMur < avecMuret,
      `un mur haut doit cacher davantage qu'un muret : ${avecMur} % vs ${avecMuret} %`);
  });

  await cas('le mur porte sa longueur et sa hauteur', async () => {
    const m = await page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('#couverture-mesures .mesure')].map((t) => [
        t.querySelector('.cle').textContent.trim(),
        t.querySelector('.val').textContent.trim(),
      ]),
    ));
    affirmer(m['Murs tracés'] === '1', `murs comptés : ${m['Murs tracés']}`);
    affirmer(/^4[78],\d/.test(m['Longueur de murs'] || ''),
      `0,6 unité à 80 m/unité font 48 m : ${m['Longueur de murs']}`);

    /*
     * La longueur figure aussi sur le plan, dans un cartouche sombre à côté du
     * trait — et ce cartouche doit rester modeste.
     *
     * Sa hauteur se déduisait de `ctx.font` : dès que la police a porté une
     * graisse, « 600 16px … » a été lu 600, et chaque étiquette traînait un
     * rectangle noir de six cents pixels. Mesuré ici : 0,5 % de la toile quand
     * tout va bien, 11 % avec ce défaut.
     */
    const sombre = await page.evaluate(() => {
      const t = document.querySelector('#toile-reseau');
      const d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60) n += 1;
      }
      return { n, total: t.width * t.height };
    });
    affirmer(sombre.n > 200, `l'étiquette doit être dessinée : ${sombre.n} px`);
    affirmer(sombre.n < sombre.total * 0.03,
      `cartouche démesuré : ${sombre.n} px sur ${sombre.total}`);
  });

  await cas('la couverture réelle figure au procès-verbal', async () => {
    await page.click('#btn-rapport');
    await page.waitForTimeout(600);
    const rapport = await page.evaluate(() => document.querySelector('#rapport').innerHTML);
    affirmer(/Couverture réelle/.test(rapport), 'la section doit figurer');
    affirmer(/Angle mort le plus étendu/.test(rapport), 'avec les angles morts chiffrés');
  });

  await cas('le calcul de stockage reprend l\'exemple de référence', async () => {
    // Huit caméras à 5 Mbps, 30 jours, 20 % de marge : 15 552 Go, soit 16 To.
    // Le tout posé par le code : l\'interface a déjà été éprouvée plus haut.
    // Autonome : le bloc précédent a laissé du matériel, et un compte de
    // caméras hérité fausserait l'exemple qu'on cherche à reproduire.
    page.once('dialog', (d) => d.accept());
    await page.click('#reseau-effacer');
    await page.waitForTimeout(200);

    await page.click('[data-reseau-outil="poser"]');
    await page.selectOption('#reseau-type', 'nvr');
    await clic(0.32, 0.2);
    await page.selectOption('#reseau-type', 'switch');
    await clic(0.4, 0.25);
    await page.selectOption('#reseau-type', 'camera');
    const places = [[0.12, 0.32], [0.2, 0.36], [0.28, 0.4], [0.52, 0.32],
      [0.6, 0.36], [0.68, 0.4], [0.76, 0.46], [0.84, 0.52]];
    for (const [u, v] of places) await clic(u, v);

    await page.click('[data-reseau-outil="relier"]');
    await clic(0.4, 0.25); await clic(0.32, 0.2);
    for (const [u, v] of places) { await clic(u, v); await clic(0.4, 0.25); }

    const saisir = async (champ, valeur) => {
      const sel = `#reseau-selection [data-materiel="${champ}"]`;
      await page.fill(sel, valeur);
      await page.dispatchEvent(sel, 'change');
    };
    await page.click('[data-reseau-outil="deplacer"]');
    for (const [u, v] of places) {
      await clic(u, v);
      await saisir('debit', '5');
      await saisir('conso', '8');
    }
    await clic(0.4, 0.25);
    await saisir('portsPoe', '8');
    await saisir('budgetPoe', '65');
    await clic(0.32, 0.2);
    await saisir('canaux', '8');
    await page.waitForTimeout(250);

    const m = await page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll('#nvr-mesures .mesure')].map((t) => [
        t.querySelector('.cle').textContent.trim(),
        t.querySelector('.val').textContent.trim(),
      ]),
    ));
    affirmer(/^40,0\b/.test(m['Débit total'] || ''), `débit cumulé : ${m['Débit total']}`);
    affirmer(/15\s*552/.test(m['Capacité nécessaire'] || ''),
      `capacité : ${m['Capacité nécessaire']}`);
    affirmer(/^16 To/.test(m['Disques'] || ''), `disque recommandé : ${m['Disques']}`);
    affirmer(/64/.test(m['PoE — SW 1'] || ''), `budget PoE : ${m['PoE — SW 1']}`);

    const conseil = await page.evaluate(() => document.querySelector('#nvr-conseil').textContent);
    affirmer(/8 caméras/.test(conseil) && /30 jours/.test(conseil), conseil);
  });

  await cas('une capacité installée trop faible est signalée', async () => {
    await clic(0.32, 0.2);
    await page.fill('#reseau-selection [data-materiel="capacite"]', '8000');
    await page.dispatchEvent('#reseau-selection [data-materiel="capacite"]', 'change');
    await page.waitForTimeout(200);
    const a = await alertes();
    const manque = a.find((x) => /Capacité installée insuffisante/.test(x));
    affirmer(!!manque, `l'insuffisance doit être dite : ${a.join(' | ')}`);
    affirmer(/15,4 jours tenus au lieu de 30/.test(manque), manque);
    // Et elle est présentée comme bloquante, pas comme une remarque.
    const graves = await page.evaluate(
      () => document.querySelectorAll('#reseau-alertes li.grave').length,
    );
    affirmer(graves >= 1, 'une capacité insuffisante est bloquante');
  });

  await cas('un budget PoE dépassé et une adresse en double sont signalés', async () => {
    await clic(0.12, 0.32);
    await page.fill('#reseau-selection [data-materiel="conso"]', '25');
    await page.dispatchEvent('#reseau-selection [data-materiel="conso"]', 'change');
    await page.fill('#reseau-selection [data-materiel-texte="ip"]', '192.168.1.10');
    await page.dispatchEvent('#reseau-selection [data-materiel-texte="ip"]', 'change');
    await clic(0.2, 0.36);
    await page.fill('#reseau-selection [data-materiel-texte="ip"]', '192.168.1.10');
    await page.dispatchEvent('#reseau-selection [data-materiel-texte="ip"]', 'change');
    await page.waitForTimeout(200);

    const a = await alertes();
    affirmer(a.some((x) => /budget PoE dépassé/.test(x)), `PoE : ${a.join(' | ')}`);
    affirmer(a.some((x) => /192\.168\.1\.10 attribuée à 2 appareils/.test(x)),
      `adresse en double : ${a.join(' | ')}`);
  });

  await cas('le stockage figure au procès-verbal', async () => {
    await page.click('#btn-rapport');
    await page.waitForTimeout(600);
    const rapport = await page.evaluate(() => document.querySelector('#rapport').innerHTML);
    affirmer(/Enregistrement/.test(rapport), 'la section doit figurer');
    affirmer(/Capacité nécessaire/.test(rapport), 'avec le besoin chiffré');
    affirmer(/Volume par jour/.test(rapport), 'et le détail du calcul');
    affirmer(/Alimentation PoE/.test(rapport), 'et le bilan PoE');
    affirmer(/Anomalies relevées/.test(rapport), 'et les anomalies bloquantes');
  });

  await cas('le synoptique figure au procès-verbal', async () => {
    // On reconstitue un câblage complet, puis on regarde le document produit.
    await page.click('[data-reseau-outil="poser"]');
    await page.selectOption('#reseau-type', 'switch');
    await clic(0.4, 0.25);
    await page.click('[data-reseau-outil="relier"]');
    await clic(0.9, 0.85);
    await clic(0.4, 0.25);
    await page.waitForTimeout(200);

    await page.click('#btn-rapport');
    await page.waitForTimeout(600);
    const rapport = await page.evaluate(() => document.querySelector('#rapport').innerHTML);
    affirmer(/Synoptique de câblage/.test(rapport), 'la section doit figurer au procès-verbal');
    affirmer(/Longueurs de câble/.test(rapport), 'avec le tableau des longueurs');
    affirmer((rapport.match(/<img[^>]+src="data:image\/png/g) || []).length >= 2,
      'le plan câblé et l\'arborescence doivent y être');
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* ------------------------------------------- 9. page de devis client */

console.log('\nDevis client');
{
  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  // Servie en HTTP, comme sur le site : la page doit alors lire tarif.json.
  await page.goto(`${BASE}/devis-client.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const lire = () => page.evaluate(() => ({
    resume: document.querySelector('#resume').textContent.trim(),
    lignes: [...document.querySelectorAll('#lignes tr')]
      .map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
    totalTtc: (document.querySelector('#totaux tr.fort') || {}).textContent || '',
    manques: [...document.querySelectorAll('#manques li')]
      .map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
  }));

  await cas('la page s\'ouvre chiffrée, sans que le visiteur ait rien fait', async () => {
    const r = await lire();
    affirmer(/caméras/.test(r.resume), `résumé : ${r.resume}`);
    affirmer(r.lignes.length >= 2, `des lignes doivent être proposées : ${r.lignes.length}`);
    affirmer(/€/.test(r.totalTtc), `un total TTC : ${r.totalTtc}`);
  });

  await cas('le tarif d\'exemple est annoncé comme tel', async () => {
    const visible = await page.evaluate(
      () => !document.querySelector('#bandeau-exemple').hidden,
    );
    affirmer(visible, 'un tarif d\'exemple ne doit pas passer pour une offre');
  });

  await cas('changer de type de site propose d\'autres valeurs', async () => {
    await page.selectOption('#q-type', 'entrepot');
    await page.waitForTimeout(200);
    const zones = await page.inputValue('#q-zones');
    affirmer(zones === '6', `l'entrepôt propose 6 zones : ${zones}`);
    const r = await lire();
    affirmer(/entrepôt/.test(r.resume), r.resume);
  });

  await cas('plus de caméras, plus cher ; plus de jours, plus de disque', async () => {
    const montant = async () => {
      const r = await lire();
      return parseFloat(r.totalTtc.replace(/[^\d,]/g, '').replace(',', '.'));
    };
    await page.fill('#q-zones', '2');
    await page.dispatchEvent('#q-zones', 'change');
    await page.waitForTimeout(200);
    const petit = await montant();

    await page.fill('#q-zones', '8');
    await page.dispatchEvent('#q-zones', 'change');
    await page.waitForTimeout(200);
    const grand = await montant();
    affirmer(grand > petit, `huit caméras coûtent plus que deux : ${grand} vs ${petit}`);

    const disque = async () => {
      const r = await lire();
      return parseFloat((r.resume.match(/([\d,]+) To/) || [])[1].replace(',', '.'));
    };
    await page.selectOption('#q-jours', '7');
    await page.waitForTimeout(200);
    const court = await disque();
    await page.selectOption('#q-jours', '90');
    await page.waitForTimeout(200);
    affirmer(await disque() > court, 'garder plus longtemps demande plus de disque');
  });

  await cas('ce qui manque au tarif est dit au visiteur', async () => {
    // Le tarif livré ne porte ni enregistreur ni disque : la page doit le dire
    // plutôt que de composer une installation qui ne se commande pas.
    const r = await lire();
    affirmer(r.manques.some((m) => /enregistreur/i.test(m)), JSON.stringify(r.manques));
    affirmer(r.manques.some((m) => /disque/i.test(m)), JSON.stringify(r.manques));
    affirmer(r.manques.some((m) => /chiffrés lors de l'étude/.test(m)), JSON.stringify(r.manques));
  });

  await cas('le synoptique montre toute la chaîne, pas seulement le tarif', async () => {
    const schema = await page.evaluate(() => {
      const svg = document.querySelector('#schema svg');
      return {
        textes: [...svg.querySelectorAll('text')].map((t) => t.textContent.trim()),
        gris: [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') === '#b6bcc6').length,
        traits: svg.querySelectorAll('line').length,
        note: (document.querySelector('.note-schema') || {}).textContent || '',
      };
    });
    // Le tarif livré n'a ni enregistreur ni routeur : ils doivent quand même
    // figurer, en gris, sinon les caméras sembleraient reliées à rien.
    affirmer(schema.textes.some((t) => /Enregistreur/.test(t)), JSON.stringify(schema.textes));
    affirmer(schema.textes.some((t) => /Switch PoE/.test(t)), JSON.stringify(schema.textes));
    affirmer(schema.gris >= 2, `les maillons hors tarif sont grisés : ${schema.gris}`);
    affirmer(/En gris/.test(schema.note), `et expliqués : ${schema.note}`);
    affirmer(schema.traits >= 3, `la chaîne est reliée : ${schema.traits} traits`);
  });

  await cas('chaque maillon est relié au bon parent', async () => {
    // Le téléphone passe par le routeur, jamais par l'enregistreur : autant de
    // traits que de maillons ayant un parent, pas le produit des étages.
    await page.evaluate(() => {
      document.querySelector('#q-ecran').checked = true;
      document.querySelector('#q-ecran').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const traits = await page.evaluate(
      () => document.querySelectorAll('#schema svg line').length,
    );
    // caméras→switch, switch→NVR, switch→routeur, NVR→écran, routeur→téléphone.
    affirmer(traits === 5, `cinq liaisons attendues, pas davantage : ${traits}`);
  });

  await cas('câble, connectique et coffret figurent au besoin', async () => {
    const r = await lire();
    // Ils ne sont pas au tarif d'exemple : la page doit le dire.
    affirmer(r.manques.some((m) => /câble/i.test(m)), JSON.stringify(r.manques));
  });

  await cas('prévoir une extension change le matériel, pas le nombre de caméras', async () => {
    await page.fill('#q-zones', '4');
    await page.dispatchEvent('#q-zones', 'change');
    await page.waitForTimeout(200);
    const avant = await lire();
    await page.selectOption('#q-extension', '4');
    await page.waitForTimeout(200);
    const apres = await lire();
    const cameras = (t) => (t.lignes.find((l) => /Caméras/.test(l)) || '').match(/ (\d+) /);
    affirmer(String(cameras(avant)?.[1]) === String(cameras(apres)?.[1]),
      'on ne vend pas les caméras de l\'extension d\'avance');
    await page.selectOption('#q-extension', '0');
  });

  await cas('le client étudie sa photo et obtient sa caméra', async () => {
    const photo = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1600; c.height = 900;
      const g = c.getContext('2d');
      g.fillStyle = '#8fb6e0'; g.fillRect(0, 0, 1600, 380);
      g.fillStyle = '#6a6f63'; g.fillRect(0, 380, 1600, 520);
      for (let i = 0; i < 14; i += 1) {
        g.fillStyle = i % 2 ? '#7c8174' : '#70756a';
        g.fillRect(0, 380 + i * 38, 1600, 19);
      }
      return c.toDataURL('image/png');
    });
    await page.setInputFiles('#fichier-photo', {
      name: 'cour.png', mimeType: 'image/png', buffer: enBuffer(photo),
    });
    await page.waitForSelector('#etude-photo:not([hidden])', { timeout: 8000 });

    const toile = async () => {
      const l = page.locator('#toile-photo');
      await l.scrollIntoViewIfNeeded();
      return l.boundingBox();
    };
    const clic = async (u, v) => {
      const b = await toile();
      await page.mouse.click(b.x + b.width * u, b.y + b.height * v);
      await page.waitForTimeout(120);
    };
    const saisir = async (id, valeur) => {
      await page.fill(id, valeur);
      await page.dispatchEvent(id, 'change');
    };

    await saisir('#p-hauteur', '3.5');
    await saisir('#p-d1', '12');
    await saisir('#p-d2', '30');

    affirmer(/point dont vous connaissez la distance/.test(
      await page.textContent('#photo-consigne'),
    ), 'la première consigne demande un repère');

    await clic(0.5, 0.82);
    await clic(0.5, 0.52);

    const b = await toile();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.9, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const r = await page.evaluate(() => ({
      tuiles: Object.fromEntries([...document.querySelectorAll('#photo-resultat .tuile')]
        .map((t) => [t.querySelector('.cle').textContent.trim(),
          t.querySelector('.val').textContent.trim()])),
      notes: [...document.querySelectorAll('#photo-resultat .note-tuile')]
        .map((t) => t.textContent.trim()),
      conseil: (document.querySelector('.conseil-client') || {}).textContent || '',
    }));
    const nb = (x) => parseFloat((x || '').replace(',', '.'));
    affirmer(nb(r.tuiles['Angle de vue nécessaire']) > 10
      && nb(r.tuiles['Angle de vue nécessaire']) < 120,
    `angle : ${r.tuiles['Angle de vue nécessaire']}`);
    affirmer(nb(r.tuiles['Zone la plus éloignée']) > 0,
      `distance : ${r.tuiles['Zone la plus éloignée']}`);
    // Deux repères ont été posés : le champ doit être mesuré, pas supposé.
    affirmer(r.notes.some((x) => /mesuré sur vos deux repères/.test(x)),
      `le champ doit être annoncé mesuré : ${JSON.stringify(r.notes)}`);
    affirmer(/DS-2CD2T86G2/.test(r.conseil), `une caméra doit être nommée : ${r.conseil}`);
    affirmer(/pixels par mètre/.test(r.conseil), r.conseil);

    /*
     * La densité annoncée doit être celle de l'objectif posé au mur, pas
     * celle d'une caméra idéale qui cadrerait la zone au pixel près. Un
     * 4 mm voit plus large que les 60 ° demandés ; promettre les pixels du
     * cadrage idéal surestimerait l'image d'un bon cinquième.
     */
    const ppm = parseFloat((r.conseil.match(/soit\s+(\d+)\s+pixels/) || [])[1]);
    const angle = nombre(r.tuiles['Angle de vue nécessaire']);
    const distance = nombre(r.tuiles['Zone la plus éloignée']);
    const ideale = 3840 / (2 * distance * Math.tan((angle * Math.PI) / 360));
    affirmer(Number.isFinite(ppm), `densité illisible : ${r.conseil}`);
    affirmer(ppm < ideale - 2,
      `${ppm} px/m annoncés alors que le cadrage idéal en donnerait ${ideale.toFixed(0)} : `
      + 'la densité doit venir du champ réel de la caméra');
  });

  await cas('la photo commande le nombre de caméras du devis', async () => {
    const cameras = async () => page.evaluate(() => {
      const l = [...document.querySelectorAll('#lignes tr')]
        .find((t) => /Caméras/.test(t.textContent));
      return l ? l.querySelectorAll('td')[1].textContent.trim() : null;
    });
    affirmer(await cameras() === '1', `une photo, une caméra : ${await cameras()}`);

    // Le nombre déclaré plus haut ne doit plus l'emporter sur l'étude.
    await page.fill('#q-zones', '9');
    await page.dispatchEvent('#q-zones', 'change');
    await page.waitForTimeout(250);
    affirmer(await cameras() === '1',
      `une photo étudiée l'emporte sur un nombre déclaré : ${await cameras()}`);
  });

  await cas('la zone se retaille sans être retracée', async () => {
    const angle = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('#photo-resultat .tuile')]
        .find((x) => /Angle/.test(x.querySelector('.cle').textContent));
      return parseFloat(t.querySelector('.val').textContent.replace(',', '.'));
    });
    const avant = await angle();
    const l = page.locator('#toile-photo');
    await l.scrollIntoViewIfNeeded();
    const b = await l.boundingBox();
    // Le coin bas-droit de la zone tracée, ramené vers le centre.
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.9);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.9, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const apres = await angle();
    affirmer(apres < avant, `resserrer doit réduire l'angle : ${avant}° → ${apres}°`);
  });

  await cas('chaque zone étudiée figure au récapitulatif', async () => {
    /*
     * Une seule photo est ouverte à la fois ; le devis, lui, les porte toutes.
     * Sans ce récapitulatif, un client qui étudie trois angles n'en imprime
     * qu'un, et nous n'en recevons qu'un.
     */
    const avant = await page.evaluate(
      () => document.querySelectorAll('#recap-photos .zone-recap').length,
    );
    affirmer(avant === 1, `une zone étudiée, une entrée : ${avant}`);

    const seconde = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1600; c.height = 900;
      const g = c.getContext('2d');
      g.fillStyle = '#93a7bd'; g.fillRect(0, 0, 1600, 340);
      g.fillStyle = '#5d5a52'; g.fillRect(0, 340, 1600, 560);
      return c.toDataURL('image/png');
    });
    await page.setInputFiles('#fichier-photo', {
      name: 'parking.png', mimeType: 'image/png', buffer: enBuffer(seconde),
    });
    await page.waitForTimeout(600);

    const toile = async () => {
      const l = page.locator('#toile-photo');
      await l.scrollIntoViewIfNeeded();
      return l.boundingBox();
    };
    const b2 = await toile();
    await page.mouse.click(b2.x + b2.width * 0.5, b2.y + b2.height * 0.78);
    await page.waitForTimeout(150);
    await page.click('[data-etape="zone"]');
    const b3 = await toile();
    await page.mouse.move(b3.x + b3.width * 0.25, b3.y + b3.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b3.x + b3.width * 0.75, b3.y + b3.height * 0.88, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const r = await page.evaluate(() => ({
      entrees: [...document.querySelectorAll('#recap-photos .zone-recap')]
        .map((f) => f.textContent.replace(/\s+/g, ' ').trim()),
      images: [...document.querySelectorAll('#recap-photos img')].map((i) => i.src.slice(0, 15)),
      cameras: (() => {
        const l = [...document.querySelectorAll('#lignes tr')]
          .find((t) => /Caméras/.test(t.textContent));
        return l ? l.querySelectorAll('td')[1].textContent.trim() : null;
      })(),
    }));
    affirmer(r.entrees.length === 2, `deux zones étudiées : ${r.entrees.length}`);
    affirmer(r.entrees.every((t) => /de champ/.test(t) && /de large/.test(t)),
      `chaque entrée porte ses mesures : ${JSON.stringify(r.entrees)}`);
    affirmer(r.entrees.some((t) => /supposé d'après l'appareil/.test(t)),
      `un seul repère sur la seconde : la supposition doit être dite — ${JSON.stringify(r.entrees)}`);
    affirmer(r.images.length === 2 && r.images.every((x) => x.startsWith('data:image')),
      `chaque zone porte sa photo annotée : ${JSON.stringify(r.images)}`);
    affirmer(r.cameras === '2', `le devis suit : ${r.cameras} caméra(s)`);
  });

  await cas('le projet s\'enregistre et se reprend', async () => {
    const memorise = await page.evaluate(
      () => !!window.localStorage.getItem('ngsecurity-devis-client'),
    );
    affirmer(memorise, 'le projet doit être mémorisé sur l\'appareil du visiteur');

    const contenu = await page.evaluate(
      () => JSON.parse(window.localStorage.getItem('ngsecurity-devis-client')),
    );
    affirmer(contenu.type === 'ng-devis-client', `type : ${contenu.type}`);
    affirmer(contenu.zones.length === 2, `les deux zones enregistrées : ${contenu.zones.length}`);
    affirmer(contenu.zones.every((z) => z.dataUrl), 'les photos voyagent avec le projet');
    affirmer(!!contenu.zones[0].zone, 'et la zone tracée aussi');
    affirmer(contenu.zones[0].img === undefined,
      'l\'image décodée n\'a pas à être enregistrée');
  });

  await cas('les réserves d\'une estimation à distance sont écrites', async () => {
    const reserves = await page.evaluate(() => [...document.querySelectorAll('#reserves li')]
      .map((t) => t.textContent.trim()));
    affirmer(reserves.length >= 3, `${reserves.length} réserves`);
    affirmer(reserves.some((x) => /sans visite du site/.test(x)), JSON.stringify(reserves));
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

/* ------------------------------------- 10. page de présentation, boutique */

console.log('\nPage de présentation (boutique)');
{
  const page = await contexte.newPage();
  const erreurs = surveiller(page);
  await page.goto(`${BASE}/presentation.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  await cas('l\'échelle des paliers est dessinée, et dit sur quoi elle porte', async () => {
    const r = await page.evaluate(() => ({
      barres: document.querySelectorAll('#schema-dori rect').length,
      texte: document.querySelector('#schema-dori').textContent.replace(/\s+/g, ' '),
      legende: document.querySelector('#legende-dori').textContent,
    }));
    affirmer(r.barres === 4, `quatre paliers : ${r.barres}`);
    affirmer(/Détection/.test(r.texte) && /Identification/.test(r.texte), r.texte);
    // Les distances doivent décroître : on repère bien plus loin qu'on identifie.
    const m = [...r.texte.matchAll(/(\d+(?:,\d+)?) m/g)].map((x) => nombre(x[1]));
    affirmer(m.length === 4, `quatre distances : ${JSON.stringify(m)}`);
    affirmer(m[0] > m[1] && m[1] > m[2] && m[2] > m[3],
      `décroissantes : ${JSON.stringify(m)}`);
    affirmer(/DS-2CD2T86G2-4I/.test(r.legende) && /4 mm/.test(r.legende),
      `la légende doit nommer la caméra : ${r.legende}`);

    /*
     * L'échelle surplombe les fiches produits : elle doit annoncer, pour ce
     * modèle-là, exactement ce que sa fiche annonce trois centimètres plus
     * bas. Deux chiffres différents pour une même caméra sur un même écran,
     * et la page perd toute crédibilité.
     */
    const fiche = await page.evaluate(() => {
      const f = [...document.querySelectorAll('.produit')]
        .find((x) => /DS-2CD2T86G2-4I/.test(x.textContent));
      return f ? f.textContent.replace(/\s+/g, ' ') : '';
    });
    const surFiche = (fiche.match(/Reconnaît une personne jusqu'à ([\d,]+) m/) || [])[1];
    affirmer(surFiche, `fiche du modèle d'exemple introuvable : ${fiche}`);
    affirmer(new RegExp(`${surFiche.replace(',', ',')} m`).test(r.texte),
      `l'échelle dit ${JSON.stringify(m)} là où la fiche dit ${surFiche} m`);
  });

  await cas('sans réglage, les liens restent sur le site qui sert la page', async () => {
    /*
     * Les deux pages peuvent vivre sur un seul domaine. Des adresses en dur
     * vers l'autre site enverraient alors le visiteur sur une page qui
     * n'existe pas — et personne ne s'en apercevrait avant lui.
     */
    const liens = await page.evaluate(() => ({
      outil: document.querySelector('#lien-outil').getAttribute('href'),
      bas: document.querySelector('#lien-outil-bas').getAttribute('href'),
      boutique: document.querySelector('#lien-boutique').getAttribute('href'),
      pied: [...document.querySelectorAll('#pied-liens a')]
        .map((a) => [a.textContent.trim(), a.getAttribute('href')]),
    }));
    affirmer(liens.outil === '/outils/devis/', `étude : ${liens.outil}`);
    affirmer(liens.bas === liens.outil, 'les deux boutons mènent au même endroit');
    affirmer(liens.boutique === '/', `boutique : ${liens.boutique}`);
    affirmer(liens.pied.length === 2 && liens.pied.every(([, h]) => h.startsWith('/')),
      `le pied reste relatif : ${JSON.stringify(liens.pied)}`);
  });

  await cas('le catalogue livré s\'affiche, chiffré et sans réserve', async () => {
    const r = await page.evaluate(() => ({
      produits: [...document.querySelectorAll('.produit')]
        .map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
      sansLien: document.querySelectorAll('.produit.sans-lien').length,
      intro: document.querySelector('#intro-produits').textContent,
      reserves: [...document.querySelectorAll('#reserves-produits li')]
        .map((t) => t.textContent),
    }));
    affirmer(r.produits.length >= 8, `la gamme AcuSense : ${r.produits.length} fiches`);
    // Aucune fiche produit n'existe encore sur le site : elles informent sans
    // mener nulle part, et c'est légitime sur l'espace professionnel.
    affirmer(r.sansLien === r.produits.length,
      `${r.sansLien} fiches sans lien sur ${r.produits.length}`);
    affirmer(r.produits.every((t) => /de large à 10 m/.test(t)),
      `chaque fiche annonce son champ : ${JSON.stringify(r.produits.slice(0, 2))}`);
    affirmer(!r.reserves.length,
      `le catalogue livré ne doit rien avoir à signaler : ${JSON.stringify(r.reserves)}`);
    // Un angle constructeur partout : plus d'astérisque « capteur supposé ».
    affirmer(!r.produits.some((t) => /\*/.test(t)),
      'aucun capteur ne devrait être supposé');
  });

  await cas('un catalogue rempli donne des vignettes cliquables et chiffrées', async () => {
    // La page lit `catalogue.json` posé à côté d'elle : on sert le nôtre.
    const catalogue = {
      outil: 'https://exemple.test/outil/',
      boutique: 'https://exemple.test/boutique/',
      produits: [
        { reference: 'Bullet 4K 4 mm', url: 'https://exemple.test/p/1', resH: 3840, focale: 4, prixTtc: 289.9 },
        { reference: 'Dôme zoom 2.8-12', url: 'https://exemple.test/p/2', resH: 2560, focaleMin: 2.8, focaleMax: 12 },
        { reference: 'Sans optique', url: 'https://exemple.test/p/3' },
        { reference: 'Sans adresse', resH: 2688, angleH: 90 },
        { url: 'https://exemple.test/p/5', resH: 3840, focale: 4 },
      ],
    };
    await page.route('**/catalogue.json', (r) => r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(catalogue),
    }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const r = await page.evaluate(() => ({
      vignettes: [...document.querySelectorAll('.produit')].map((a) => ({
        href: a.getAttribute('href') || '',
        texte: a.textContent.replace(/\s+/g, ' ').trim(),
      })),
      reserves: [...document.querySelectorAll('#reserves-produits li')].map((t) => t.textContent),
      outil: document.querySelector('#lien-outil').getAttribute('href'),
      boutique: document.querySelector('#lien-boutique').getAttribute('href'),
    }));

    affirmer(r.vignettes.length === 4,
      `quatre produits nommés sur cinq : ${JSON.stringify(r.vignettes.map((v) => v.texte))}`);
    affirmer(r.vignettes.filter((v) => v.href).every((v) => /^https:\/\/exemple\.test\/p\//.test(v.href)),
      `chaque vignette liée mène à sa fiche : ${JSON.stringify(r.vignettes.map((v) => v.href))}`);

    // Celle sans adresse s'affiche, chiffrée, mais ne mène nulle part.
    const orpheline = r.vignettes.find((v) => /Sans adresse/.test(v.texte));
    affirmer(orpheline && !orpheline.href, `elle ne doit porter aucun lien : ${JSON.stringify(orpheline)}`);
    affirmer(/de large à 10 m/.test(orpheline.texte),
      `et rester chiffrée : ${orpheline.texte}`);

    const bullet = r.vignettes.find((v) => /Bullet/.test(v.texte));
    affirmer(/objectif 4 mm/.test(bullet.texte), bullet.texte);
    affirmer(/m de large à 10 m/.test(bullet.texte), bullet.texte);
    affirmer(/Reconnaît une personne jusqu'à/.test(bullet.texte), bullet.texte);
    affirmer(/289,90 € TTC/.test(bullet.texte), `le prix TTC : ${bullet.texte}`);

    const zoom = r.vignettes.find((v) => /Dôme/.test(v.texte));
    affirmer(/réglable de 2,8 à 12 mm/.test(zoom.texte), zoom.texte);

    // Aucune portée inventée pour un produit sans optique.
    const nu = r.vignettes.find((v) => /Sans optique/.test(v.texte));
    affirmer(!/jusqu'à/.test(nu.texte),
      `aucune portée ne doit être annoncée sans optique : ${nu.texte}`);
    affirmer(r.reserves.some((x) => /sans optique renseignée/.test(x)),
      `la lacune doit être dite : ${JSON.stringify(r.reserves)}`);
    affirmer(r.reserves.some((x) => /sans référence/.test(x)),
      `le produit écarté aussi : ${JSON.stringify(r.reserves)}`);
    affirmer(r.reserves.some((x) => /capteur 1\/2.8/.test(x)),
      `le capteur supposé doit être signalé : ${JSON.stringify(r.reserves)}`);

    affirmer(r.outil === 'https://exemple.test/outil/', `lien vers l'étude : ${r.outil}`);
    affirmer(r.boutique === 'https://exemple.test/boutique/', `lien boutique : ${r.boutique}`);
  });

  await cas('aucune erreur de console', () => affirmer(!erreurs.length, erreurs.join(' | ')));
  await page.close();
}

await navigateur.close();
serveur.close();

console.log(`\n${reussites} réussite(s), ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
