/**
 * Fabrique les vignettes de partage (Open Graph), 1200 × 630.
 *
 *   node og.mjs
 *
 * Ce sont les images qu'affichent Facebook, LinkedIn, WhatsApp ou un SMS
 * quand on colle le lien d'une des pages. Sans elles, le lien arrive nu : un
 * titre gris sur fond blanc, que personne n'ouvre.
 *
 * Lancé à la main, pas à chaque fabrication : les images ne changent que si
 * les titres changent, et Playwright n'est pas une dépendance du projet. Les
 * fichiers produits sont versionnés — `npm run build` ne fait que les
 * recopier là où le site les sert.
 */

import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const logo = `data:image/png;base64,${readFileSync(join(ici, 'img', 'logo.png')).toString('base64')}`;

const CARTES = [
  {
    fichier: 'og-etude.png',
    surtitre: 'Outil gratuit',
    titre: 'Quelle caméra vous faut-il&nbsp;?',
    sous: 'Photographiez, entourez la zone : vous saurez le modèle, l\'objectif, '
      + 'et jusqu\'où l\'image reste exploitable.',
  },
  {
    fichier: 'og-devis.png',
    surtitre: 'Estimation gratuite',
    titre: 'Estimer mes caméras',
    sous: 'Caméras, enregistreur, stockage, réseau et pose. '
      + 'Quatre questions, et vous savez ce qu\'il vous faut.',
  },
  {
    fichier: 'og-alarme.png',
    surtitre: 'Étude gratuite',
    titre: 'Alarme anti-intrusion',
    sous: 'Maison, magasin, bureaux, dépôt, chantier : combien de détecteurs, '
      + 'à quels endroits, et pourquoi.',
  },
];

const page = (c) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; display: flex; align-items: center; gap: 56px;
    padding: 0 72px; background: #1a1d23; color: #fff;
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    border-bottom: 14px solid #c8102e;
  }
  .marque { flex: none; background: #fff; border-radius: 22px; padding: 26px 30px; }
  .marque img { display: block; height: 230px; width: auto; }
  .texte { min-width: 0; }
  .surtitre {
    font-size: 21px; font-weight: 700; letter-spacing: .12em;
    text-transform: uppercase; color: #c8102e; margin-bottom: 16px;
  }
  h1 { font-size: 62px; line-height: 1.08; letter-spacing: -.015em; }
  p { margin-top: 24px; font-size: 26px; line-height: 1.42; color: #c3c9d3; }
  .pied {
    margin-top: 32px; font-size: 23px; font-weight: 700; color: #fff;
    display: flex; align-items: center; gap: 12px;
  }
  .pied i { width: 9px; height: 9px; border-radius: 50%; background: #c8102e; }
</style></head><body>
  <div class="marque"><img src="${logo}" alt=""></div>
  <div class="texte">
    <div class="surtitre">${c.surtitre}</div>
    <h1>${c.titre}</h1>
    <p>${c.sous}</p>
    <div class="pied"><i></i>ngsecurity38.fr</div>
  </div>
</body></html>`;

const { chromium } = await import('playwright');
const dossier = join(ici, 'img', 'og');
mkdirSync(dossier, { recursive: true });

const nav = await chromium.launch();
const onglet = await nav.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of CARTES) {
  await onglet.setContent(page(c), { waitUntil: 'load' });
  await onglet.screenshot({ path: join(dossier, c.fichier) });
  console.log(`${join(dossier, c.fichier)} — 1200 × 630`);
}
await nav.close();
