/**
 * Extrait du dossier les figures que la présentation reprend.
 *
 *   node etudes/2026-09-22-site-industriel/deck/visuels.mjs
 *
 * Le plan masse, le repérage aérien et un diagramme DORI sont des SVG
 * calculés par le générateur du dossier. Les recopier à la main serait le
 * plus sûr moyen de présenter un plan que l'étude ne dit plus.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = new URL('.', import.meta.url).pathname;
const nav = await chromium.launch();
const p = await nav.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file:///home/user/ngsecurity38/etudes/2026-09-22-site-industriel/etude.html');
await p.waitForTimeout(2000);
// Le plan masse : le plus grand SVG.
let best = 0, aire = 0;
const n = await p.locator('svg').count();
for (let i = 0; i < n; i += 1) {
  const b = await p.locator('svg').nth(i).boundingBox();
  if (b && b.width * b.height > aire) { aire = b.width * b.height; best = i; }
}
await p.locator('svg').nth(best).screenshot({ path: `${out}/plan.png` });
// Le repérage aérien : la figure qui porte la légende des repères.
// L'IMAGE seule : la figure embarque sa légende, qui ferait doublon avec
// celle de la diapositive.
const fig = p.locator('figure', { hasText: 'Repérage de principe' }).first();
if (await fig.count()) await fig.locator('img').first().screenshot({ path: `${out}/reperage.png` });
// Un diagramme DORI : la première fiche modèle.
const mod = p.locator('.modele').first();
if (await mod.count()) await mod.screenshot({ path: `${out}/modele.png` });
await nav.close();
console.log('images ok');
