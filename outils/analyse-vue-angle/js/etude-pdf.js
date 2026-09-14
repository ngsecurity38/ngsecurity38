/**
 * Ouverture du PDF de l'étude et choix de la vue demandée.
 *
 * L'étude remise par le client est presque toujours un PDF : plan
 * d'implantation, photos de repérage, vues attendues caméra par caméra. Ce
 * module affiche les pages, laisse choisir celle qui porte la vue demandée,
 * puis recadrer dessus pour n'en garder que l'image utile.
 *
 * PDF.js est chargé à la demande : tant qu'aucun PDF n'est ouvert, la page
 * reste légère. Dans la version en fichier unique, la bibliothèque est déjà
 * présente et rien n'est téléchargé.
 */

import { $ } from './dom.js';

const LARGEUR_VIGNETTE = 150;
const LARGEUR_RENDU = 1600;
const PAGES_MAX = 60;

let etatPdf = null; // page PDF en cours de sélection

function chargerScript(src) {
  return new Promise((resoudre, rejeter) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resoudre;
    s.onerror = () => rejeter(new Error(`Fichier introuvable : ${src}`));
    document.head.append(s);
  });
}

/**
 * Charge PDF.js si besoin.
 *
 * `pdf.worker.min.js` est chargé comme script ordinaire, pas comme Web Worker :
 * il expose alors `window.pdfjsWorker`, que PDF.js utilise directement dans le
 * fil principal. C'est ce qui permet à la page de fonctionner ouverte depuis le
 * disque, les navigateurs refusant les workers dans ce contexte.
 */
async function bibliothequePdf() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await chargerScript('vendor/pdf.min.js');
  await chargerScript('vendor/pdf.worker.min.js');
  if (!window.pdfjsLib) throw new Error('PDF.js n\'a pas pu être chargé.');
  return window.pdfjsLib;
}

export const estPdf = (fichier) => fichier
  && (fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name || ''));

function fermer() {
  $('#modale-pdf').hidden = true;
  if (etatPdf?.document) etatPdf.document.destroy();
  etatPdf = null;
}

/** Dessine la page rendue puis, par-dessus, le rectangle de recadrage. */
function rafraichirApercu() {
  const toile = $('#pdf-toile');
  const ctx = toile.getContext('2d');
  toile.width = etatPdf.page.width;
  toile.height = etatPdf.page.height;
  ctx.drawImage(etatPdf.page, 0, 0);
  if (!etatPdf.recadrage) return;
  const { x, y, l, h } = etatPdf.recadrage;
  ctx.save();
  ctx.fillStyle = 'rgba(10,12,16,.55)';
  ctx.beginPath();
  ctx.rect(0, 0, toile.width, toile.height);
  ctx.rect(x, y, l, h);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = Math.max(2, toile.width / 400);
  ctx.strokeRect(x, y, l, h);
  ctx.restore();
}

async function afficherPage(numero) {
  etatPdf.numero = numero;
  $('#pdf-etat').textContent = `Page ${numero} sur ${etatPdf.document.numPages} — rendu en cours…`;
  const page = await etatPdf.document.getPage(numero);
  const base = page.getViewport({ scale: 1 });
  const echelle = Math.min(3, LARGEUR_RENDU / base.width);
  const vue = page.getViewport({ scale: echelle });
  const toile = document.createElement('canvas');
  toile.width = Math.round(vue.width);
  toile.height = Math.round(vue.height);
  await page.render({ canvasContext: toile.getContext('2d'), viewport: vue }).promise;
  etatPdf.page = toile;
  etatPdf.recadrage = null;
  rafraichirApercu();
  $('#pdf-etat').textContent = `Page ${numero} sur ${etatPdf.document.numPages}`;
  document.querySelectorAll('#pdf-pages .pdf-vignette').forEach((el) => {
    el.classList.toggle('actif', Number(el.dataset.page) === numero);
  });
}

async function afficherVignettes() {
  const boite = $('#pdf-pages');
  boite.innerHTML = '';
  const total = Math.min(etatPdf.document.numPages, PAGES_MAX);
  for (let n = 1; n <= total; n += 1) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'pdf-vignette';
    bouton.dataset.page = String(n);
    bouton.innerHTML = `<canvas></canvas><span>Page ${n}</span>`;
    bouton.addEventListener('click', () => afficherPage(n));
    boite.append(bouton);

    /* eslint-disable no-await-in-loop */
    const page = await etatPdf.document.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vue = page.getViewport({ scale: LARGEUR_VIGNETTE / base.width });
    const toile = bouton.querySelector('canvas');
    toile.width = Math.round(vue.width);
    toile.height = Math.round(vue.height);
    await page.render({ canvasContext: toile.getContext('2d'), viewport: vue }).promise;
  }
  if (etatPdf.document.numPages > PAGES_MAX) {
    const info = document.createElement('p');
    info.className = 'note';
    info.textContent = `Seules les ${PAGES_MAX} premières pages sont proposées.`;
    boite.append(info);
  }
}

function brancherRecadrage() {
  const toile = $('#pdf-toile');
  let depart = null;
  const position = (e) => {
    const r = toile.getBoundingClientRect();
    return {
      x: Math.min(toile.width, Math.max(0, ((e.clientX - r.left) / r.width) * toile.width)),
      y: Math.min(toile.height, Math.max(0, ((e.clientY - r.top) / r.height) * toile.height)),
    };
  };
  toile.addEventListener('pointerdown', (e) => {
    if (!etatPdf?.page) return;
    depart = position(e);
    toile.setPointerCapture(e.pointerId);
  });
  toile.addEventListener('pointermove', (e) => {
    if (!depart) return;
    const p = position(e);
    etatPdf.recadrage = {
      x: Math.min(depart.x, p.x), y: Math.min(depart.y, p.y),
      l: Math.abs(p.x - depart.x), h: Math.abs(p.y - depart.y),
    };
    rafraichirApercu();
  });
  toile.addEventListener('pointerup', () => {
    if (!depart) return;
    depart = null;
    if (etatPdf.recadrage && (etatPdf.recadrage.l < 20 || etatPdf.recadrage.h < 20)) etatPdf.recadrage = null;
    rafraichirApercu();
    $('#pdf-aide').textContent = etatPdf.recadrage
      ? 'Recadrage posé. « Utiliser cette vue » ne retiendra que cette partie de la page.'
      : 'Cliquer-glisser sur la page pour ne garder que la vue demandée.';
  });
}

/** Image finale : la page entière, ou seulement le rectangle tracé. */
function extraire() {
  const { page, recadrage } = etatPdf;
  if (!recadrage) return page.toDataURL('image/png');
  const toile = document.createElement('canvas');
  toile.width = Math.round(recadrage.l);
  toile.height = Math.round(recadrage.h);
  toile.getContext('2d').drawImage(
    page, recadrage.x, recadrage.y, recadrage.l, recadrage.h,
    0, 0, toile.width, toile.height,
  );
  return toile.toDataURL('image/png');
}

let branche = false;

/**
 * Ouvre le sélecteur sur un fichier PDF.
 *
 * @param {File} fichier le PDF de l'étude
 * @param {string} role 'reference' ou 'reglee'
 * @param {(dataUrl: string, source: object) => void} onValider appelé au choix
 */
export async function ouvrirSelecteurPdf(fichier, role, onValider) {
  const modale = $('#modale-pdf');
  modale.hidden = false;
  $('#pdf-pages').innerHTML = '';
  $('#pdf-etat').textContent = 'Ouverture du document…';
  $('#pdf-titre').textContent = role === 'reference'
    ? `Étude — choisir la vue demandée (${fichier.name})`
    : `Document — choisir l'image réglée (${fichier.name})`;
  $('#pdf-aide').textContent = 'Cliquer-glisser sur la page pour ne garder que la vue demandée.';

  if (!branche) {
    branche = true;
    brancherRecadrage();
    $('#pdf-fermer').addEventListener('click', fermer);
    $('#pdf-annuler-recadrage').addEventListener('click', () => {
      if (!etatPdf) return;
      etatPdf.recadrage = null;
      rafraichirApercu();
    });
    modale.addEventListener('click', (e) => { if (e.target === modale) fermer(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#modale-pdf').hidden) fermer();
    });
    $('#pdf-valider').addEventListener('click', () => {
      if (!etatPdf?.page) return;
      const source = {
        type: 'pdf',
        fichier: etatPdf.nom,
        page: etatPdf.numero,
        recadre: !!etatPdf.recadrage,
      };
      const image = extraire();
      const rappel = etatPdf.onValider;
      fermer();
      rappel(image, source);
    });
  }

  try {
    const lib = await bibliothequePdf();
    const donnees = new Uint8Array(await fichier.arrayBuffer());
    const document_ = await lib.getDocument({ data: donnees }).promise;
    etatPdf = { document: document_, nom: fichier.name, numero: 1, page: null, recadrage: null, onValider };
    await afficherPage(1);
    await afficherVignettes();
  } catch (err) {
    $('#pdf-etat').textContent = `Lecture impossible : ${err.message}`;
  }
}
