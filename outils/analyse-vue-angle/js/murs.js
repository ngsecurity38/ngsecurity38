/**
 * Murs, obstacles et angles morts.
 *
 * Un cône de vision tracé sur un plan suppose le champ dégagé. Sur un site
 * réel il ne l'est jamais : un bâtiment, un muret, un portail plein coupent la
 * vue, et la caméra qui « couvre le parking » sur le plan n'en voit que la
 * moitié.
 *
 * Ce module dit ce qui reste réellement visible. Il ne se contente pas de
 * couper le cône au mur : **un mur plus bas que la caméra se laisse survoler**.
 * La caméra voit alors le pied du mur, perd une bande de terrain derrière, puis
 * revoit le sol plus loin. Cette bande est l'angle mort, et sa longueur dépend
 * des deux hauteurs — celle du mur et celle de la pose.
 *
 * Coordonnées normalisées par la largeur de l'image du plan, comme dans
 * `js/plan.js` et `js/reseau.js`.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

let compteurMurs = 0;

/** Nouveau mur entre deux points du plan. */
export function nouveauMur(a, b, hauteur = 2.5) {
  return {
    id: `mur-${Date.now().toString(36)}-${(compteurMurs += 1)}`,
    a: { x: a.x, y: a.y },
    b: { x: b.x, y: b.y },
    hauteur: Number.isFinite(hauteur) ? hauteur : 2.5,
  };
}

/** Longueur d'un mur, en mètres. */
export const longueurMur = (mur, echelle) => (
  echelle > 0 ? Math.hypot(mur.b.x - mur.a.x, mur.b.y - mur.a.y) * echelle : 0
);

/**
 * Distance à laquelle un rayon rencontre un segment, en unités normalisées.
 *
 * @param {object} origine départ du rayon
 * @param {object} direction vecteur unitaire
 * @param {object} mur segment {a, b}
 * @returns {number|null} distance le long du rayon, `null` s'il ne touche pas
 */
export function intersectionRayon(origine, direction, mur) {
  const ax = mur.a.x - origine.x;
  const ay = mur.a.y - origine.y;
  const sx = mur.b.x - mur.a.x;
  const sy = mur.b.y - mur.a.y;

  const denom = direction.x * sy - direction.y * sx;
  if (Math.abs(denom) < 1e-12) return null; // rayon parallèle au mur

  const t = (ax * sy - ay * sx) / denom;      // le long du rayon
  const u = (ax * direction.y - ay * direction.x) / denom; // le long du mur
  if (t <= 1e-9 || u < 0 || u > 1) return null;
  return t;
}

/**
 * Bande de sol cachée derrière un mur, vue d'une caméra.
 *
 * Le rayon qui frôle le haut du mur repart vers le sol et le retrouve plus
 * loin : entre le mur et ce point, le sol est invisible.
 *
 *     D = d × hc / (hc − hm)
 *
 * où `d` est la distance au mur, `hm` sa hauteur et `hc` celle de la caméra.
 * Quand le mur atteint ou dépasse la caméra, plus rien n'est visible derrière.
 *
 * @returns {{debut:number, fin:number}} bande cachée, `fin` pouvant être infinie
 */
export function ombreAuSol(distance, hauteurMur, hauteurCamera) {
  if (!(distance > 0)) return { debut: 0, fin: 0 };
  if (!(hauteurMur > 0)) return { debut: 0, fin: 0 };
  if (!(hauteurCamera > hauteurMur)) return { debut: distance, fin: Infinity };
  return { debut: distance, fin: (distance * hauteurCamera) / (hauteurCamera - hauteurMur) };
}

/** Réunion d'intervalles cachés, fusionnés et ordonnés. */
function fusionner(bandes) {
  const tries = bandes.filter((b) => b.fin > b.debut).sort((x, y) => x.debut - y.debut);
  const sortie = [];
  for (const b of tries) {
    const dernier = sortie[sortie.length - 1];
    if (dernier && b.debut <= dernier.fin) dernier.fin = Math.max(dernier.fin, b.fin);
    else sortie.push({ ...b });
  }
  return sortie;
}

/**
 * Ce qui reste visible le long d'un rayon, en mètres.
 *
 * @param {object} camera position, hauteur de pose
 * @param {object} direction vecteur unitaire
 * @param {object[]} murs
 * @param {number} echelle mètres par unité normalisée
 * @param {number} portee portée utile, en mètres
 * @returns {Array<[number, number]>} intervalles visibles, du plus proche au plus loin
 */
export function visibiliteRayon(camera, direction, murs, echelle, portee) {
  if (!(echelle > 0) || !(portee > 0)) return [];

  const ombres = [];
  for (const mur of murs || []) {
    const t = intersectionRayon(camera, direction, mur);
    if (t === null) continue;
    ombres.push(ombreAuSol(t * echelle, mur.hauteur, camera.hauteur));
  }

  const caches = fusionner(ombres);
  const visibles = [];
  let curseur = 0;
  for (const c of caches) {
    if (c.debut > curseur) visibles.push([curseur, Math.min(c.debut, portee)]);
    curseur = Math.max(curseur, c.fin);
    if (curseur >= portee) break;
  }
  if (curseur < portee) visibles.push([curseur, portee]);

  return visibles.filter(([d, f]) => f - d > 1e-6 && d < portee);
}

/**
 * Balayage du champ, rayon par rayon : ce que la caméra voit réellement.
 *
 * @param {object} camera {x, y, hauteur, azimut, ouverture}
 * @param {object[]} murs
 * @param {number} echelle mètres par unité normalisée
 * @param {number} portee portée utile, en mètres
 * @param {object} [options]
 * @param {number} [options.pas=1] finesse du balayage, en degrés
 * @returns {object[]} un élément par rayon : angle et intervalles visibles
 */
export function balayage(camera, murs, echelle, portee, options = {}) {
  const pas = options.pas > 0 ? options.pas : 1;
  const debut = camera.azimut - camera.ouverture / 2;
  const nombre = Math.max(2, Math.ceil(camera.ouverture / pas) + 1);
  const rayons = [];

  for (let i = 0; i < nombre; i += 1) {
    const angle = debut + (camera.ouverture * i) / (nombre - 1);
    const rad = (angle * Math.PI) / 180;
    // Azimut : 0° vers le haut du plan, sens horaire — convention des vues
    // aériennes, où le nord est en haut.
    const direction = { x: Math.sin(rad), y: -Math.cos(rad) };
    rayons.push({
      angle,
      direction,
      intervalles: visibiliteRayon(camera, direction, murs, echelle, portee),
    });
  }
  return rayons;
}

/**
 * Part du cône réellement visible, entre 0 et 1.
 *
 * Mesurée en surface : un angle mort proche coûte moins de terrain qu'un angle
 * mort lointain, et c'est bien la surface perdue qui intéresse le client.
 */
export function partVisible(rayons, portee) {
  if (!rayons?.length || !(portee > 0)) return 1;
  let visible = 0;
  for (const r of rayons) {
    // Un secteur élémentaire vaut (d₂² − d₁²) / 2 à l'angle près, constant ici.
    for (const [d, f] of r.intervalles) visible += f * f - d * d;
  }
  const total = rayons.length * portee * portee;
  return total > 0 ? Math.min(1, visible / total) : 1;
}

/**
 * Angles morts notables : les bandes cachées assez grandes pour compter.
 *
 * Sous le seuil, ce sont des franges de calcul entre deux rayons, pas des
 * trous d'exploitation — les signaler noierait les vrais.
 *
 * @returns {object[]} {angle, debut, fin, longueur}, du plus étendu au moins
 */
export function anglesMorts(rayons, portee, seuilMetres = 2) {
  const trous = [];
  for (const r of rayons || []) {
    let curseur = 0;
    for (const [d, f] of r.intervalles) {
      if (d - curseur >= seuilMetres) {
        trous.push({ angle: r.angle, debut: curseur, fin: d, longueur: d - curseur });
      }
      curseur = f;
    }
    if (portee - curseur >= seuilMetres) {
      trous.push({ angle: r.angle, debut: curseur, fin: portee, longueur: portee - curseur });
    }
  }
  return trous.sort((a, b) => b.longueur - a.longueur);
}
