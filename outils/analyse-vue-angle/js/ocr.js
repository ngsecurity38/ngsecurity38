/**
 * Lecture d'une étude scannée par reconnaissance de caractères.
 *
 * Une étude numérisée est un PDF sans texte : seulement l'image d'une page
 * papier. Le relevé automatique n'y trouve rien. Ce module fait lire ces pages
 * par un moteur OCR, pour retomber sur le même texte que celui d'un PDF normal.
 *
 * Le moteur pèse près de 5 Mo : il n'est monté qu'à la demande, et seulement si
 * les fichiers correspondants accompagnent la page.
 */

import { chargerScript } from './dom.js';

const CHEMIN = 'vendor/ocr';

let moteur = null; // worker Tesseract, monté une seule fois par session

/** L'OCR est-il disponible ici ? */
export function ocrPossible() {
  // Version en fichier unique : tout est déjà embarqué.
  if (window.__ocrIntegre) return true;
  // Version en dossier : les fichiers sont à côté, mais inatteignables si la
  // page a été ouverte depuis le disque — le chargement le dira.
  return window.location.protocol !== 'file:';
}

function octets(base64) {
  const brut = atob(base64);
  const sortie = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i += 1) sortie[i] = brut.charCodeAt(i);
  return sortie;
}

/**
 * Assemble un worker autonome : moteur WebAssembly, modèle de langue et worker
 * dans un seul script.
 *
 * Page ouverte depuis le disque, un worker ne peut ni importer un second script
 * mémoire ni atteindre un fichier voisin. On lui livre donc tout d'un bloc et
 * on détourne les deux appels qu'il ferait vers l'extérieur : l'import du
 * moteur, déjà présent, et la requête du modèle de langue, servie depuis la
 * mémoire. La bibliothèque suit ensuite son chemin habituel, sans rustine dans
 * sa logique propre.
 */
function workerAutonome(assets) {
  const detournement = ';(function(){'
    + 'var vi = self.importScripts;'
    + 'self.importScripts = function(u){'
    + ' if (self.TesseractCore || self.TesseractCoreWASM) return;'
    + ' return vi.apply(self, arguments); };'
    + 'var oct = function(s){ var b = atob(s), a = new Uint8Array(b.length);'
    + ' for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };'
    + `var LANG = ${JSON.stringify(assets.langue)};`
    + 'var vf = self.fetch;'
    + 'self.fetch = function(u){ var url = String(u && u.url ? u.url : u);'
    + ' if (/\\.traineddata(\\.gz)?$/.test(url)) {'
    + '   return Promise.resolve(new Response(oct(LANG), { status: 200 }));'
    + ' } return vf.apply(self, arguments); };'
    + '}());';

  return URL.createObjectURL(new Blob(
    [octets(assets.moteur), detournement, octets(assets.worker)],
    { type: 'text/javascript' },
  ));
}

/** Récupère les trois pièces, embarquées ou voisines de la page. */
async function assets() {
  if (window.__ocrIntegre) return window.__ocrIntegre;
  const lire = async (nom, binaire) => {
    const r = await fetch(`${CHEMIN}/${nom}`);
    if (!r.ok) throw new Error(`${nom} : réponse ${r.status}`);
    const tampon = new Uint8Array(await r.arrayBuffer());
    if (!binaire) return tampon;
    let s = '';
    for (let i = 0; i < tampon.length; i += 1) s += String.fromCharCode(tampon[i]);
    return btoa(s);
  };
  const [moteurB, workerB, langueB] = await Promise.all([
    lire('tesseract-core-simd-lstm.wasm.js', true),
    lire('worker.min.js', true),
    lire('fra.traineddata.gz', true),
  ]);
  return { moteur: moteurB, worker: workerB, langue: langueB };
}

/**
 * Monte le moteur. Long la première fois (quelques secondes), immédiat ensuite.
 * @param {(etape: string, part: number) => void} [avancement]
 */
async function monter(avancement) {
  if (moteur) return moteur;
  if (!window.Tesseract) {
    if (window.__ocrIntegre) throw new Error('Moteur OCR absent de cette page.');
    await chargerScript(`${CHEMIN}/tesseract.min.js`);
  }
  if (avancement) avancement('Préparation du moteur', 0);
  const pieces = await assets();
  if (avancement) avancement('Préparation du moteur', 0.4);

  moteur = await window.Tesseract.createWorker('fra', 1, {
    workerPath: workerAutonome(pieces),
    workerBlobURL: false, // notre script est déjà prêt à servir de worker
    corePath: 'integre',
    langPath: 'integre',
    gzip: true,
    cacheMethod: 'none',
    logger: (m) => {
      if (avancement && m.status) avancement('Préparation du moteur', 0.4 + 0.6 * (m.progress || 0));
    },
  });
  return moteur;
}

/**
 * Lit une suite de pages rendues et renvoie leur texte.
 *
 * @param {HTMLCanvasElement[]} pages pages rendues du PDF
 * @param {(etape: string, part: number) => void} [avancement]
 * @returns {Promise<string[]>} texte de chaque page
 */
export async function lirePages(pages, avancement) {
  const t = await monter(avancement);
  const textes = [];
  for (let i = 0; i < pages.length; i += 1) {
    if (avancement) avancement(`Lecture de la page ${i + 1} sur ${pages.length}`, i / pages.length);
    /* eslint-disable no-await-in-loop */
    const r = await t.recognize(pages[i]);
    textes.push(r.data.text || '');
  }
  if (avancement) avancement('Lecture terminée', 1);
  return textes;
}

/** Libère le moteur : il occupe plusieurs dizaines de Mo. */
export async function relacher() {
  if (!moteur) return;
  const t = moteur;
  moteur = null;
  await t.terminate();
}
