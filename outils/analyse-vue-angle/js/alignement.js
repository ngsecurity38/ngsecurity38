/**
 * Recalage de deux vues d'une même scène (vue demandée / vue réglée).
 *
 * Module pur (aucune dépendance au DOM) : il ne manipule que des images en
 * niveaux de gris {data: Float32Array, largeur, hauteur}, ce qui le rend
 * testable sous Node.
 *
 * Modèle géométrique — un point p du repère de la VUE DEMANDÉE se retrouve
 * dans la VUE RÉGLÉE en :
 *
 *     p' = echelle · R(rotation) · (p - centre) + centre + (tx, ty)
 *
 * Les coordonnées sont normalisées : x et y sont exprimés en fraction de la
 * LARGEUR de l'image (l'axe y n'est pas renormalisé, pour conserver des
 * angles justes quel que soit le rapport d'image). x va vers la droite,
 * y vers le bas.
 */

const TAILLE_GROSSIERE = 64;
const TAILLE_FINE = 192;

/** Image en niveaux de gris. */
export function creerImage(largeur, hauteur, data) {
  return { largeur, hauteur, data: data || new Float32Array(largeur * hauteur) };
}

/**
 * Convertit des données RGBA (ImageData) en niveaux de gris 0..1.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 */
export function versGris(imageData) {
  const { width, height, data } = imageData;
  const sortie = new Float32Array(width * height);
  for (let i = 0, p = 0; i < sortie.length; i += 1, p += 4) {
    sortie[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
  }
  return creerImage(width, height, sortie);
}

/** Rééchantillonnage par moyenne de zone (réduction) ou bilinéaire (agrandissement). */
export function redimensionner(img, largeur, hauteur) {
  const sortie = creerImage(largeur, hauteur);
  const rx = img.largeur / largeur;
  const ry = img.hauteur / hauteur;
  for (let y = 0; y < hauteur; y += 1) {
    const y0 = Math.floor(y * ry);
    const y1 = Math.max(y0 + 1, Math.min(img.hauteur, Math.ceil((y + 1) * ry)));
    for (let x = 0; x < largeur; x += 1) {
      const x0 = Math.floor(x * rx);
      const x1 = Math.max(x0 + 1, Math.min(img.largeur, Math.ceil((x + 1) * rx)));
      let somme = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          somme += img.data[yy * img.largeur + xx];
          n += 1;
        }
      }
      sortie.data[y * largeur + x] = n ? somme / n : 0;
    }
  }
  return sortie;
}

/** Flou moyenneur séparable (rayon en pixels). */
function flou(img, rayon) {
  if (rayon < 1) return img;
  const { largeur, hauteur, data } = img;
  const tampon = new Float32Array(largeur * hauteur);
  const sortie = new Float32Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      let somme = 0;
      let n = 0;
      for (let k = -rayon; k <= rayon; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= largeur) continue;
        somme += data[y * largeur + xx];
        n += 1;
      }
      tampon[y * largeur + x] = somme / n;
    }
  }
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      let somme = 0;
      let n = 0;
      for (let k = -rayon; k <= rayon; k += 1) {
        const yy = y + k;
        if (yy < 0 || yy >= hauteur) continue;
        somme += tampon[yy * largeur + x];
        n += 1;
      }
      sortie[y * largeur + x] = somme / n;
    }
  }
  return creerImage(largeur, hauteur, sortie);
}

/**
 * Prétraitement : soustraction de la moyenne locale.
 *
 * Indispensable ici — la vue demandée est souvent une photo de jour et la vue
 * réglée une capture de nuit ou en infrarouge. Ne garder que la structure
 * locale rend la corrélation insensible à l'exposition et au contraste.
 */
export function pretraiter(img) {
  const rayon = Math.max(1, Math.round(img.largeur / 12));
  const fond = flou(img, rayon);
  const sortie = new Float32Array(img.data.length);
  for (let i = 0; i < sortie.length; i += 1) sortie[i] = img.data[i] - fond.data[i];
  return creerImage(img.largeur, img.hauteur, sortie);
}

/** Échantillonnage bilinéaire ; renvoie NaN hors du cadre. */
function echantillonner(img, x, y) {
  if (x < 0 || y < 0 || x > img.largeur - 1 || y > img.hauteur - 1) return NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, img.largeur - 1);
  const y1 = Math.min(y0 + 1, img.hauteur - 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = img.data[y0 * img.largeur + x0];
  const b = img.data[y0 * img.largeur + x1];
  const c = img.data[y1 * img.largeur + x0];
  const d = img.data[y1 * img.largeur + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

export const TRANSFORMATION_NEUTRE = { tx: 0, ty: 0, echelle: 1, rotation: 0 };

/**
 * Corrélation croisée normalisée centrée (ZNCC) entre la vue demandée
 * transformée et la vue réglée.
 *
 * @returns {{zncc: number, recouvrement: number}} zncc dans [-1, 1],
 *          recouvrement = fraction de la vue demandée qui tombe dans la vue réglée.
 */
export function correlation(ref, act, t, pas = 1) {
  const cos = Math.cos((t.rotation * Math.PI) / 180);
  const sin = Math.sin((t.rotation * Math.PI) / 180);
  const cxR = (ref.largeur - 1) / 2;
  const cyR = (ref.hauteur - 1) / 2;
  const cxA = (act.largeur - 1) / 2;
  const cyA = (act.hauteur - 1) / 2;
  // Les translations sont exprimées en fraction de la largeur de l'image réglée.
  const decX = t.tx * act.largeur;
  const decY = t.ty * act.largeur;
  const k = (act.largeur / ref.largeur) * t.echelle;

  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  let total = 0;

  for (let y = 0; y < ref.hauteur; y += pas) {
    for (let x = 0; x < ref.largeur; x += pas) {
      total += 1;
      const dx = x - cxR;
      const dy = y - cyR;
      const xa = cxA + k * (dx * cos - dy * sin) + decX;
      const ya = cyA + k * (dx * sin + dy * cos) + decY;
      const b = echantillonner(act, xa, ya);
      if (Number.isNaN(b)) continue;
      const a = ref.data[y * ref.largeur + x];
      n += 1;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  }

  const recouvrement = total ? n / total : 0;
  if (n < 24) return { zncc: -1, recouvrement };
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  if (va <= 1e-9 || vb <= 1e-9) return { zncc: 0, recouvrement };
  const zncc = (sab - (sa * sb) / n) / Math.sqrt(va * vb);
  return { zncc, recouvrement };
}

/**
 * Score optimisé : la ZNCC pénalisée par le manque de recouvrement, pour
 * éviter que la recherche ne s'échappe vers un cadrage minuscule mais
 * parfaitement corrélé.
 */
function score(ref, act, t, pas) {
  const { zncc, recouvrement } = correlation(ref, act, t, pas);
  if (recouvrement < 0.25) return -1;
  return zncc * Math.min(1, recouvrement / 0.6);
}

/** Recherche exhaustive de la translation, à basse résolution. */
function rechercheGrossiere(ref, act, plageX, plageY, pasGrille) {
  let meilleur = { ...TRANSFORMATION_NEUTRE, score: -2 };
  for (let ty = -plageY; ty <= plageY; ty += pasGrille) {
    for (let tx = -plageX; tx <= plageX; tx += pasGrille) {
      const t = { tx, ty, echelle: 1, rotation: 0 };
      const s = score(ref, act, t, 1);
      if (s > meilleur.score) meilleur = { ...t, score: s };
    }
  }
  return meilleur;
}

/** Recherche par motif (compass search) sur les quatre paramètres. */
function affiner(ref, act, depart, options) {
  let courant = { ...depart };
  let meilleurScore = score(ref, act, courant, 1);
  const pas = {
    tx: 0.02,
    ty: 0.02,
    echelle: options.echelleLibre ? 0.03 : 0,
    rotation: options.rotationLibre ? 1.5 : 0,
  };
  const mini = { tx: 0.0008, ty: 0.0008, echelle: 0.0015, rotation: 0.05 };
  const cles = ['tx', 'ty', 'echelle', 'rotation'];

  for (let iteration = 0; iteration < 200; iteration += 1) {
    let ameliore = false;
    for (const cle of cles) {
      if (pas[cle] === 0) continue;
      for (const signe of [1, -1]) {
        const essai = { ...courant, [cle]: courant[cle] + signe * pas[cle] };
        if (essai.echelle < 0.25 || essai.echelle > 4) continue;
        if (Math.abs(essai.rotation) > 45) continue;
        const s = score(ref, act, essai, 1);
        if (s > meilleurScore + 1e-6) {
          courant = essai;
          meilleurScore = s;
          ameliore = true;
          break;
        }
      }
    }
    if (!ameliore) {
      let actif = false;
      for (const cle of cles) {
        if (pas[cle] > mini[cle]) {
          pas[cle] /= 2;
          actif = true;
        }
      }
      if (!actif) break;
    }
  }
  return { ...courant, score: meilleurScore };
}

/**
 * Estime la transformation qui amène la vue demandée sur la vue réglée.
 *
 * @param {object} refGris vue demandée en niveaux de gris
 * @param {object} actGris vue réglée en niveaux de gris
 * @param {object} [options]
 * @param {boolean} [options.echelleLibre=true] autorise une différence de zoom
 * @param {boolean} [options.rotationLibre=true] autorise un roulis
 * @returns {{tx:number, ty:number, echelle:number, rotation:number, zncc:number, recouvrement:number}}
 */
export function estimerTransformation(refGris, actGris, options = {}) {
  const opt = { echelleLibre: true, rotationLibre: true, ...options };
  const rapport = refGris.hauteur / refGris.largeur;

  const refG = pretraiter(redimensionner(refGris, TAILLE_GROSSIERE, Math.max(8, Math.round(TAILLE_GROSSIERE * rapport))));
  const actG = pretraiter(redimensionner(actGris, TAILLE_GROSSIERE, Math.max(8, Math.round((TAILLE_GROSSIERE * actGris.hauteur) / actGris.largeur))));
  const grossier = rechercheGrossiere(refG, actG, 0.4, 0.3, 1 / TAILLE_GROSSIERE);

  const hFine = Math.max(16, Math.round(TAILLE_FINE * rapport));
  const refF = pretraiter(redimensionner(refGris, TAILLE_FINE, hFine));
  const actF = pretraiter(redimensionner(actGris, TAILLE_FINE, Math.max(16, Math.round((TAILLE_FINE * actGris.hauteur) / actGris.largeur))));
  const fin = affiner(refF, actF, { tx: grossier.tx, ty: grossier.ty, echelle: 1, rotation: 0 }, opt);

  const { zncc, recouvrement } = correlation(refF, actF, fin, 1);
  return {
    tx: fin.tx,
    ty: fin.ty,
    echelle: fin.echelle,
    rotation: fin.rotation,
    zncc,
    recouvrement,
  };
}
