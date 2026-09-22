/**
 * L'écran de supervision : quelle définition, quelle diagonale.
 *
 * La question arrive toujours sous la forme « il me faut combien de
 * pouces ? », et le nombre de pouces est justement ce qui se déduit en
 * dernier. Deux grandeurs commandent, et elles ne commandent pas la même
 * chose :
 *
 * - le NOMBRE DE CAMÉRAS décide la mosaïque, donc la définition. Seize
 *   vignettes sur un écran Full HD laissent 480 × 270 pixels par caméra :
 *   de quoi voir qu'il se passe quelque chose, pas de quoi voir quoi ;
 * - la DISTANCE DE L'OPÉRATEUR décide la diagonale. Un écran trop grand de
 *   près fatigue et force à balayer de la tête ; trop petit de loin, il
 *   ne montre rien que sa définition contenait pourtant.
 *
 * Acheter des pouces sans regarder la définition, c'est agrandir une
 * image qui n'a rien de plus à montrer.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/** Proportions d'un écran du commerce. */
export const RATIO = 16 / 9;

/** Un pouce, en mètres. */
export const POUCE = 0.0254;

/**
 * Mosaïques proposées par les enregistreurs, en nombre de vignettes.
 *
 * Les dispositions carrées sont les seules où toutes les vignettes ont la
 * même taille. Les autres (8, 32) réservent une grande case et reléguent
 * le reste : pratiques pour surveiller une entrée, trompeuses pour
 * dimensionner, puisque la plus petite vignette y décide de tout.
 */
export const MOSAIQUES = [1, 4, 9, 16, 25, 36];

/**
 * Vignette la plus petite qui montre encore quelque chose, en pixels.
 *
 * En deçà, une silhouette tient sur quelques dizaines de pixels : on voit
 * qu'il bouge, jamais qui c'est. Ce seuil n'est pas une norme — c'est le
 * plancher en dessous duquel un écran de supervision ne supervise plus.
 */
export const VIGNETTE_MINI = { largeur: 640, hauteur: 360 };

/** Définitions courantes, de la plus modeste à la plus fine. */
export const DEFINITIONS = [
  { cle: 'hd', label: 'Full HD', largeur: 1920, hauteur: 1080 },
  { cle: '4k', label: '4K UHD', largeur: 3840, hauteur: 2160 },
];

/**
 * Rapport distance / hauteur d'écran retenu pour la supervision.
 *
 * L'usage en salle de contrôle place l'opérateur entre quatre et six
 * hauteurs d'écran. Plus près, il balaie de la tête ; plus loin, il perd
 * le détail que la définition contenait. Cinq est le milieu.
 */
export const RECUL = { mini: 4, retenu: 5, maxi: 6 };

/** Mosaïque retenue pour n caméras, et les cases perdues. */
export function mosaique(cameras) {
  const n = Math.max(0, Math.floor(cameras));
  if (!n) return null;
  const cases = MOSAIQUES.find((m) => m >= n);
  if (!cases) return null;
  const cote = Math.round(Math.sqrt(cases));
  return { cases, colonnes: cote, lignes: cote, libres: cases - n };
}

/** Définition d'une vignette, en pixels, pour une définition d'écran donnée. */
export function vignette(definition, grille) {
  if (!definition || !grille) return null;
  return {
    largeur: Math.floor(definition.largeur / grille.colonnes),
    hauteur: Math.floor(definition.hauteur / grille.lignes),
  };
}

/** Une vignette montre-t-elle encore quelque chose ? */
export function vignetteSuffisante(v) {
  return !!v && v.largeur >= VIGNETTE_MINI.largeur && v.hauteur >= VIGNETTE_MINI.hauteur;
}

/**
 * Diagonale, en mètres, d'un écran de hauteur donnée.
 *
 * Pour du 16:9, la diagonale vaut la hauteur multipliée par √(16²+9²)/9.
 */
export function diagonaleDepuisHauteur(hauteur) {
  if (!(hauteur > 0)) return 0;
  return hauteur * (Math.sqrt(16 * 16 + 9 * 9) / 9);
}

/** Hauteur d'image, en mètres, d'un écran de diagonale donnée. */
export function hauteurDepuisDiagonale(diagonale) {
  if (!(diagonale > 0)) return 0;
  return diagonale / (Math.sqrt(16 * 16 + 9 * 9) / 9);
}

/** Diagonales du commerce, en pouces. */
const TAILLES = [22, 24, 27, 32, 43, 50, 55, 65, 75, 85, 98];

/**
 * L'écran qu'il faut, pour un parc et une distance d'observation.
 *
 * @param {object} p
 * @param {number} p.cameras nombre de caméras à afficher
 * @param {number} p.distance recul de l'opérateur, en mètres
 * @returns {object|null}
 */
export function ecranConseille({ cameras, distance }) {
  const grille = mosaique(cameras);
  if (!grille || !(distance > 0)) return null;

  // 1. La définition : la plus modeste qui tienne la mosaïque.
  const definition = DEFINITIONS.find(
    (d) => vignetteSuffisante(vignette(d, grille)),
  ) || DEFINITIONS[DEFINITIONS.length - 1];
  const tuile = vignette(definition, grille);

  // 2. La diagonale : elle ne dépend QUE du recul de l'opérateur.
  const hauteurIdeale = distance / RECUL.retenu;
  const ideale = diagonaleDepuisHauteur(hauteurIdeale);
  const pouces = ideale / POUCE;
  const retenue = TAILLES.find((t) => t >= pouces) ?? TAILLES[TAILLES.length - 1];

  // 3. À cette taille et à ce recul, l'œil distingue-t-il les pixels ?
  //    Une minute d'arc est la limite courante de l'acuité. Un pixel plus
  //    fin que cela n'est PAS gaspillé : il est en réserve. C'est lui qui
  //    fait qu'une vignette passée en plein écran montre davantage, et
  //    non la même image agrandie. Le chiffre utile est donc le recul
  //    auquel cette réserve devient visible.
  const largeurEcran = hauteurDepuisDiagonale(retenue * POUCE) * RATIO;
  const pas = largeurEcran / definition.largeur;
  const tanAcuite = Math.tan((1 / 60) * (Math.PI / 180));
  const pasResolu = distance * tanAcuite;
  const reculPleinDetail = pas / tanAcuite;

  return {
    grille,
    definition,
    tuile,
    vignetteSuffisante: vignetteSuffisante(tuile),
    distance,
    diagonaleIdeale: ideale,
    pouces: retenue,
    pasPixel: pas,
    pasResolu,
    // Recul auquel un pixel de l'écran vaut une minute d'arc. Au-delà,
    // l'œil ne les sépare plus : la finesse reste disponible pour le
    // plein écran d'une vignette, pas pour la mosaïque.
    reculPleinDetail,
    reserveDeDetail: pas < pasResolu,
    reculMini: hauteurDepuisDiagonale(retenue * POUCE) * RECUL.mini,
    reculMaxi: hauteurDepuisDiagonale(retenue * POUCE) * RECUL.maxi,
  };
}
