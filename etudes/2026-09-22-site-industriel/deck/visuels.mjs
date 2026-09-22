/**
 * Extrait du dossier les figures que la présentation reprend.
 *
 *   node etudes/2026-09-22-site-industriel/deck/visuels.mjs
 *
 * Le plan masse, le repérage aérien, les diagrammes DORI et surtout les
 * PHOTOS DU SITE avec le champ de chaque caméra reporté dessus sont
 * calculés par le générateur du dossier. Les recomposer à la main serait
 * le plus sûr moyen de montrer au client un champ que l'étude ne dit plus.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const out = new URL('.', import.meta.url).pathname;
const nav = await chromium.launch();
/*
 * Deux fois la densité pour les tracés — un plan doit rester net — mais les
 * PHOTOS partent en JPEG : en PNG, les dix vues pesaient trente mégaoctets
 * à elles seules, et un fichier qu'on ne peut pas envoyer par courriel ne
 * sert à personne.
 */
const p = await nav.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file:///home/user/ngsecurity38/etudes/2026-09-22-site-industriel/etude.html');
await p.waitForTimeout(2500);

/* Le plan masse : le plus grand SVG de la page. */
let best = 0; let aire = 0;
const n = await p.locator('svg').count();
for (let i = 0; i < n; i += 1) {
  const b = await p.locator('svg').nth(i).boundingBox();
  if (b && b.width * b.height > aire) { aire = b.width * b.height; best = i; }
}
await p.locator('svg').nth(best).screenshot({ path: `${out}/plan.png` });

/* Le repérage aérien : l'IMAGE seule — la figure embarque sa légende. */
const fig = p.locator('figure.aerien').first();
if (await fig.count()) {
  await fig.locator('img').first().screenshot({
    path: `${out}/reperage.jpg`, type: 'jpeg', quality: 82,
  });
}

/* Un diagramme DORI, pour la fiche modèle. */
const mod = p.locator('.modele').first();
if (await mod.count()) await mod.screenshot({ path: `${out}/modele.png` });

/*
 * Les vues du site. Chaque section porte son titre et, par caméra, la photo
 * avec la bande de champ reportée dessus. C'est la pièce la plus parlante du
 * dossier : un client ne discute pas un angle, il regarde une photo.
 */
const vues = [];
const sections = p.locator('section.vue');
const total = await sections.count();
for (let i = 0; i < total; i += 1) {
  const s = sections.nth(i);
  const titre = (await s.locator('h2').first().textContent()).trim();
  const prise = (await s.locator('p.prise').first().textContent() || '').trim();
  const obs = await s.locator('ul.obs li').allTextContents();
  const reports = s.locator('.report');
  const combien = await reports.count();
  const photos = [];
  for (let k = 0; k < combien; k += 1) {
    const nom = `vue-${i + 1}-${k + 1}.jpg`;
    await reports.nth(k).screenshot({ path: `${out}/${nom}`, type: 'jpeg', quality: 80 });
    photos.push(nom);
  }
  const cams = (await s.locator('.camera h4 .puce').allTextContents()).map((t) => t.trim());
  vues.push({ titre, prise, obs: obs.map((t) => t.trim()), photos, cams });
}
writeFileSync(`${out}/vues.json`, `${JSON.stringify(vues, null, 1)}\n`);
await nav.close();
console.log(`${vues.length} vues, ${vues.reduce((t, v) => t + v.photos.length, 0)} photos de champ`);
