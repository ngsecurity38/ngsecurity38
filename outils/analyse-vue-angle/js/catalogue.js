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
  // Seules entrées certaines : elles proviennent de l'étude fournie par le
  // client, référence et focales lues sur la fiche.
  {
    id: 'dahua-tpc-bf1241-thermique',
    marque: 'Dahua',
    reference: 'DHI-TPC-BF1241',
    voie: 'thermique',
    type: 'thermique',
    capteur: 'Thermique 256×192 — 12 µm',
    focaleMin: 3.5,
    focaleMax: 3.5,
    resolution: { h: 256, v: 192 },
    verifie: true,
  },
  {
    id: 'dahua-tpc-bf1241-contexte',
    marque: 'Dahua',
    reference: 'DHI-TPC-BF1241',
    voie: 'contexte',
    type: 'visible',
    capteur: '1/2.8"',
    focaleMin: 4,
    focaleMax: 4,
    resolution: { h: 1920, v: 1080 },
    verifie: true,
  },

  /*
   * Gammes courantes, couvrant toute la plage de focales utile. Elles donnent
   * un catalogue exploitable dès la première ouverture, mais leurs références
   * exactes n'ont pas été confrontées aux fiches constructeur : elles portent
   * `verifie: false`, l'outil le signale, et la proposition client ne les
   * annonce jamais comme certaines. Une vérification auprès du distributeur,
   * une seule fois, et le catalogue devient le vôtre.
   */
  ...[
    ['Dahua', 'IPC-HFW2xxx — bullet', 2.8, 2.8, '1/2.7"', 2688, 1520],
    ['Dahua', 'IPC-HFW2xxx — bullet', 3.6, 3.6, '1/2.7"', 2688, 1520],
    ['Dahua', 'IPC-HFW2xxx — bullet', 6, 6, '1/2.7"', 2688, 1520],
    ['Dahua', 'IPC-HDW2xxx — dôme', 2.8, 2.8, '1/2.7"', 2688, 1520],
    ['Dahua', 'IPC-HDW2xxx — dôme', 3.6, 3.6, '1/2.7"', 2688, 1520],
    ['Dahua', 'IPC-HFW3xxx-ZAS — varifocal motorisé', 2.7, 13.5, '1/2.8"', 3840, 2160],
    ['Dahua', 'IPC-HFW5xxx-ZE — varifocal longue portée', 7, 35, '1/2.7"', 2592, 1944],
    ['Hikvision', 'DS-2CD20xx — bullet', 2.8, 2.8, '1/3"', 2688, 1520],
    ['Hikvision', 'DS-2CD20xx — bullet', 4, 4, '1/3"', 2688, 1520],
    ['Hikvision', 'DS-2CD20xx — bullet', 6, 6, '1/3"', 2688, 1520],
    ['Hikvision', 'DS-2CD21xx — turret', 2.8, 2.8, '1/3"', 2688, 1520],
    ['Hikvision', 'DS-2CD21xx — turret', 4, 4, '1/3"', 2688, 1520],
    ['Hikvision', 'DS-2CD2xx6 — 8 MP', 2.8, 2.8, '1/2.8"', 3840, 2160],
    ['Hikvision', 'DS-2CD2xxG2-IZS — varifocal motorisé', 2.8, 12, '1/2.8"', 2688, 1520],
    ['Hikvision', 'DS-2CD7A2xx-IZ — varifocal longue portée', 8, 32, '1/1.8"', 1920, 1080],
    ['Axis', 'série P14 — varifocal', 3, 10.5, '1/2.8"', 1920, 1080],
    ['Uniview', 'IPC2xxx — bullet', 2.8, 2.8, '1/2.7"', 2688, 1520],
    ['Uniview', 'IPC2xxx-Z — varifocal motorisé', 2.8, 12, '1/2.7"', 2688, 1520],
  ].map(([marque, reference, focaleMin, focaleMax, capteur, h, v], i) => ({
    id: `gamme-${i}`,
    marque,
    reference,
    voie: '',
    type: 'visible',
    capteur,
    focaleMin,
    focaleMax,
    resolution: { h, v },
    verifie: false,
  })),
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
    marque: String(brut.marque || '').trim(),
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
    // Une entrée modifiée à la main est tenue pour vérifiée : c'est l'agence
    // qui l'a saisie.
    verifie: brut.verifie !== false,
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

/** Désignation complète d'une entrée : marque, référence, voie. */
export const nomComplet = (e) => [e.marque, e.reference, e.voie]
  .map((x) => (x || '').trim()).filter(Boolean).join(' ');

/**
 * Conseil de réglage en clair, catalogue vide compris.
 * @returns {{focale:number, texte:string}}
 */
export function conseil(focale, propositions) {
  const arrondie = fr(focale, 1);
  if (propositions.length) {
    const p = propositions[0];
    const nom = nomComplet(p.entree);
    if (p.dans && estFixe(p.entree)) {
      return {
        focale: p.reglage,
        texte: `${nom} : focale fixe ${fr(p.reglage, 1)} mm, rien à régler.`
          + (p.entree.verifie ? '' : ' Référence à confirmer auprès du distributeur.'),
      };
    }
    if (p.dans) {
      return {
        focale: p.reglage,
        texte: `${nom} : varifocal ${fr(p.entree.focaleMin, 1)}–${fr(p.entree.focaleMax, 1)} mm, `
          + `régler le zoom sur ${arrondie} mm.`
          + (p.entree.verifie ? '' : ' Référence à confirmer auprès du distributeur.'),
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

/* ------------------------------------------------- échange avec le tableur */

const COLONNES = ['marque', 'reference', 'voie', 'type', 'capteur', 'focaleMin', 'focaleMax', 'resH', 'resV'];

/** Catalogue au format CSV point-virgule, celui qu'attend un tableur français. */
export function versCsv(catalogue) {
  const lignes = [COLONNES.join(';')];
  for (const e of catalogue) {
    lignes.push([
      e.marque, e.reference, e.voie, e.type, e.capteur,
      String(e.focaleMin).replace('.', ','), String(e.focaleMax).replace('.', ','),
      e.resolution.h, e.resolution.v,
    ].map((c) => String(c ?? '').replace(/;/g, ',')).join(';'));
  }
  return lignes.join('\r\n');
}

/**
 * Catalogue lu depuis un CSV, quel que soit l'ordre des colonnes.
 * Une entrée importée est tenue pour vérifiée : elle vient du distributeur.
 * @returns {object[]} entrées valides ; les lignes inexploitables sont ignorées
 */
export function depuisCsv(texte) {
  const lignes = String(texte || '').split(/\r?\n/).filter((l) => l.trim());
  if (lignes.length < 2) return [];
  const separateur = lignes[0].includes(';') ? ';' : ',';
  const entetes = lignes[0].split(separateur).map((c) => c.trim().toLowerCase());
  const indice = (nom) => entetes.findIndex((c) => c === nom.toLowerCase());

  const sortie = [];
  for (let i = 1; i < lignes.length; i += 1) {
    const cases = lignes[i].split(separateur);
    const lire = (nom) => {
      const k = indice(nom);
      return k >= 0 ? (cases[k] || '').trim() : '';
    };
    const entree = normaliserEntree({
      marque: lire('marque'),
      reference: lire('reference'),
      voie: lire('voie'),
      type: lire('type'),
      capteur: lire('capteur') || '1/2.8"',
      focaleMin: lire('focaleMin'),
      focaleMax: lire('focaleMax'),
      resolution: { h: lire('resH'), v: lire('resV') },
      verifie: true,
    }, i);
    // Sans référence ni focale, la ligne n'apprend rien.
    if (entree.reference && entree.focaleMin > 0) sortie.push(entree);
  }
  return sortie;
}
