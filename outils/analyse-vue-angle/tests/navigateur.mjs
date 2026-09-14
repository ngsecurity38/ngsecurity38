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
const SCENE = `() => {
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
  return { demandee: decouper(0), reglee: decouper(Math.round(${DECALAGE} * L)) };
}`;

/** Joue le générateur de scène dans la page (evaluate reçoit une expression). */
const scene = (page) => page.evaluate(`(${SCENE})()`);

const enBuffer = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
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

await navigateur.close();
serveur.close();

console.log(`\n${reussites} réussite(s), ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
