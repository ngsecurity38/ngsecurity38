/**
 * Catalogue du matériel et choix d'un objectif.
 *
 * Une fois le champ tracé sur le plan, la focale nécessaire est connue. Reste à
 * dire quelle caméra la donne : c'est l'objet de ce catalogue.
 *
 * Il n'est pas livré rempli de références inventées. Il part de ce que porte
 * l'étude du client, et c'est l'agence qui l'étoffe avec le matériel qu'elle
 * pose réellement — un catalogue faux serait pire que pas de catalogue.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { fr } from './format.js';

/** Focales fixes du commerce, pour la recommandation générique. */
const FOCALES_COURANTES = [2.1, 2.8, 3.6, 4, 6, 8, 12, 16, 25];

/**
 * Catalogue de départ : uniquement le matériel figurant dans l'étude fournie
 * par le client, objectif par objectif. À compléter par l'agence.
 */
export const CATALOGUE_INITIAL = [
  {
    id: 'tpc-bf1241-thermique',
    reference: 'DAHUA DHI-TPC-BF1241',
    voie: 'thermique',
    type: 'thermique',
    capteur: 'Thermique 256×192 — 12 µm',
    focaleMin: 3.5,
    focaleMax: 3.5,
    resolution: { h: 256, v: 192 },
  },
  {
    id: 'tpc-bf1241-contexte',
    reference: 'DAHUA DHI-TPC-BF1241',
    voie: 'contexte',
    type: 'visible',
    capteur: '1/2.8"',
    focaleMin: 4,
    focaleMax: 4,
    resolution: { h: 1920, v: 1080 },
  },
];

/** Un objectif est fixe quand sa plage se réduit à une valeur. */
export const estFixe = (e) => Math.abs(e.focaleMax - e.focaleMin) < 0.05;

/** Complète et assainit une entrée saisie à la main. */
/** Saisie à la française, et jamais NaN : « 13,5 » vaut 13.5, un champ vide vaut 0. */
const nombreSaisi = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function normaliserEntree(brut, index = 0) {
  const min = nombreSaisi(brut.focaleMin);
  const max = nombreSaisi(brut.focaleMax) || min;
  return {
    id: brut.id || `entree-${index}-${Math.random().toString(36).slice(2, 7)}`,
    reference: String(brut.reference || '').trim(),
    voie: String(brut.voie || '').trim(),
    type: brut.type === 'thermique' ? 'thermique' : 'visible',
    capteur: String(brut.capteur || '1/2.8"'),
    focaleMin: Math.min(min, max),
    focaleMax: Math.max(min, max),
    resolution: {
      h: nombreSaisi(brut.resolution?.h) || 1920,
      v: nombreSaisi(brut.resolution?.v) || 1080,
    },
  };
}

/** Focale du commerce la plus proche, pour une recommandation sans catalogue. */
export function focaleCourante(focale) {
  if (!(focale > 0)) return 0;
  return FOCALES_COURANTES.reduce(
    (m, f) => (Math.abs(f - focale) < Math.abs(m - focale) ? f : m),
    FOCALES_COURANTES[0],
  );
}

/**
 * Objectifs du catalogue capables de donner la focale demandée.
 *
 * @param {object[]} catalogue
 * @param {number} focale focale nécessaire, en mm
 * @param {object} [options]
 * @param {'thermique'|'visible'} [options.type] restreint à une technologie
 * @param {number} [options.ecartMax=0.15] écart relatif admis sur une focale fixe
 * @returns {object[]} propositions, la plus adaptée en tête
 */
export function proposer(catalogue, focale, options = {}) {
  if (!(focale > 0)) return [];
  const ecartMax = options.ecartMax ?? 0.15;

  return (catalogue || [])
    .filter((e) => !options.type || e.type === options.type)
    .map((e) => {
      const dans = focale >= e.focaleMin - 0.05 && focale <= e.focaleMax + 0.05;
      // Pour un varifocal on règle le zoom ; pour un fixe on subit sa focale.
      const reglage = dans ? focale : (focale < e.focaleMin ? e.focaleMin : e.focaleMax);
      const ecart = Math.abs(reglage - focale) / focale;
      return {
        entree: e,
        reglage,
        ecart,
        dans,
        // Un fixe pile à la bonne focale passe avant un varifocal à régler.
        rang: (dans ? 0 : 1) + ecart + (dans && estFixe(e) ? -0.001 : 0),
      };
    })
    .filter((p) => p.dans || p.ecart <= ecartMax)
    .sort((a, b) => a.rang - b.rang);
}

/**
 * Conseil de réglage en clair, catalogue vide compris.
 * @returns {{focale:number, texte:string}}
 */
export function conseil(focale, propositions) {
  const arrondie = fr(focale, 1);
  if (propositions.length) {
    const p = propositions[0];
    const nom = [p.entree.reference, p.entree.voie].filter(Boolean).join(' — ');
    if (p.dans && estFixe(p.entree)) {
      return { focale: p.reglage, texte: `${nom} : focale fixe ${fr(p.reglage, 1)} mm, rien à régler.` };
    }
    if (p.dans) {
      return {
        focale: p.reglage,
        texte: `${nom} : varifocal ${fr(p.entree.focaleMin, 1)}–${fr(p.entree.focaleMax, 1)} mm, `
          + `régler le zoom sur ${arrondie} mm.`,
      };
    }
    const sens = p.reglage > focale ? 'plus serré' : 'plus large';
    return {
      focale: p.reglage,
      texte: `${nom} : focale ${fr(p.reglage, 1)} mm, soit un champ ${sens} que le tracé `
        + `(${Math.round(p.ecart * 100)} % d'écart).`,
    };
  }
  const courante = focaleCourante(focale);
  return {
    focale: courante,
    texte: `Aucun matériel du catalogue ne couvre ${arrondie} mm. `
      + `Focale du commerce la plus proche : ${fr(courante, 1)} mm — ou un varifocal englobant cette valeur.`,
  };
}
