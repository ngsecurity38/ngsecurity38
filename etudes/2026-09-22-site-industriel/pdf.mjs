/**
 * Impression du dossier en PDF.
 *
 *   node etudes/2026-09-22-site-industriel/pdf.mjs
 *
 * Le script vit dans le dépôt, à côté du document qu'il imprime : un PDF
 * produit par une commande tapée à la main un jour de chantier ne se
 * reproduit pas, et c'est celui-là qu'on retrouve chez le client.
 *
 * Il ajoute ce qu'une page HTML ne sait pas porter seule et qu'un dossier
 * remis à un client doit avoir : le logo et l'identité de l'agence EN TÊTE
 * DE CHAQUE PAGE, et la pagination en pied. Une page isolée d'un dossier —
 * et il s'en isole toujours une, photocopiée, faxée, glissée dans un autre
 * dossier — doit encore dire d'où elle vient.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..', '..');
const AGENCE = JSON.parse(readFileSync(join(racine, 'agence.json'), 'utf8'));

const logo = `data:image/png;base64,${readFileSync(
  join(racine, 'outils', 'analyse-vue-angle', 'img', 'logo.png'),
).toString('base64')}`;

/* Le rouge de la marque, celui du logo et des filets du document. */
const ROUGE = '#c8102e';
const DOUX = '#5b6472';

const entete = `
<div style="width:100%;font-size:8px;font-family:-apple-system,Segoe UI,Roboto,
     Helvetica,Arial,sans-serif;color:${DOUX};padding:0 14mm;
     border-bottom:1.5px solid ${ROUGE};padding-bottom:4px;margin-bottom:2px;
     display:flex;align-items:center;justify-content:space-between;">
  <div style="display:flex;align-items:center;gap:7px;">
    <img src="${logo}" style="height:20px;width:auto;">
    <span style="font-weight:700;color:#1a1d23;font-size:9px;">
      ${AGENCE.nomCommercial}</span>
  </div>
  <div style="text-align:right;line-height:1.35;">
    <div style="color:${ROUGE};font-weight:700;letter-spacing:.06em;">ÉTUDE TECHNIQUE</div>
    <div>Vidéosurveillance d'un site industriel · ETU-2026-09-22</div>
  </div>
</div>`;

const pied = `
<div style="width:100%;font-size:7.5px;font-family:-apple-system,Segoe UI,Roboto,
     Helvetica,Arial,sans-serif;color:${DOUX};padding:0 14mm;
     border-top:1px solid #dde1e7;padding-top:4px;
     display:flex;align-items:center;justify-content:space-between;">
  <span>${AGENCE.nomCommercial} · ${AGENCE.telephone} · ${AGENCE.courriel}
    · SIRET ${AGENCE.siret}</span>
  <span>Page <span class="pageNumber"></span> sur <span class="totalPages"></span></span>
</div>`;

const nav = await chromium.launch();
const page = await nav.newPage();
await page.goto(`file://${join(ici, 'etude.html')}`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.pdf({
  path: join(ici, 'etude.pdf'),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: entete,
  footerTemplate: pied,
  // La marge haute loge l'en-tête : sans elle, le logo se pose sur le texte.
  margin: { top: '22mm', bottom: '16mm', left: '14mm', right: '14mm' },
});
await nav.close();
console.log(`${join(ici, 'etude.pdf')} — logo et pagination sur chaque page`);
