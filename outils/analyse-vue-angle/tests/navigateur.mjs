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
    affirmer(/DAHUA/.test(r.conseil), `conseil : ${r.conseil}`);
    affirmer(/4 mm/.test(r.conseil), `la focale conseillée devrait être 4 mm : ${r.conseil}`);
    affirmer(r.propositions.length >= 1, 'au moins une proposition');
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

  const glisser = async (u1, v1, u2, v2) => {
    const b = await page.locator('#toile-photo').boundingBox();
    await page.mouse.move(b.x + b.width * u1, b.y + b.height * v1);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * u2, b.y + b.height * v2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const cliquerPhoto = async (u, v) => {
    const b = await page.locator('#toile-photo').boundingBox();
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
    affirmer(/calage|caler/i.test(await page.evaluate(() => document.querySelector('#photo-consigne').textContent)),
      'la consigne devrait demander le calage');
  });

  await cas('calage : un point de distance connue donne l\'inclinaison', async () => {
    await page.fill('#photo-hauteur', '4.5');
    await page.fill('#photo-distance', '25');
    await page.click('[data-photo-etape="calage"]');
    await cliquerPhoto(0.5, 0.55);
    const m = await tuiles();
    const inclinaison = parseFloat((m['Inclinaison déduite'] || '').replace(',', '.'));
    affirmer(inclinaison > 0 && inclinaison < 45, `inclinaison déduite : ${m['Inclinaison déduite']}`);
  });

  await cas('la zone entourée est analysée toute seule', async () => {
    await page.click('[data-photo-etape="zone"]');
    await glisser(0.2, 0.45, 0.8, 0.9);
    const m = await tuiles();
    const nb = (cle) => parseFloat((m[cle] || '').replace(',', '.'));
    affirmer(nb('Angle de vue nécessaire') > 10 && nb('Angle de vue nécessaire') < 90,
      `angle : ${m['Angle de vue nécessaire']}`);
    affirmer(nb('Focale à poser') > 1 && nb('Focale à poser') < 40, `focale : ${m['Focale à poser']}`);
    affirmer(nb('Zone la plus éloignée') > nb('Zone la plus proche'), 'le fond est plus loin que le bord');
    affirmer(m['Niveau garanti'], 'un niveau d\'exploitation est annoncé');
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
    affirmer(r.images >= 1, 'la photo annotée doit figurer dans la proposition');
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

await navigateur.close();
serveur.close();

console.log(`\n${reussites} réussite(s), ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
