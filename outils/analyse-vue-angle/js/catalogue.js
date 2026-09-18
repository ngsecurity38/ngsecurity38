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
 * Catalogue de départ.
 *
 * Chaque entrée porte sa `source` : le document d'où sortent sa référence, sa
 * focale et sa résolution. Rien n'y figure qui ne vienne d'un document.
 *
 * Le **format de capteur**, lui, n'apparaît ni dans les brochures commerciales
 * ni dans les intitulés de catalogue : il ne se lit que sur la fiche technique
 * du modèle. Les entrées concernées portent donc `capteurSuppose: true`, et
 * l'outil le dit — à l'écran comme dans la proposition remise au client. Le
 * capteur n'intervient pas dans le choix de l'objectif (qui se fait sur la
 * focale) mais dans l'angle de champ annoncé : une supposition fausse déplace
 * cet angle, d'où le rappel.
 */

/** Résolutions Hikvision par classe de définition, telles que vendues. */
const DEF = {
  2: { h: 1920, v: 1080 },
  4: { h: 2560, v: 1440 },
  5: { h: 2560, v: 1920 },
  6: { h: 3200, v: 1800 },
  8: { h: 3840, v: 2160 },
  12: { h: 4000, v: 3000 },
};

const BROCHURE = 'Brochure Hikvision AcuSense (éd. française, juil. 2021)';
const LISTING = 'Catalogue NG Security, relevé du 15/03/2025';

/*
 * Colonnes : marque, référence, voie, focale mini, focale maxi, MP, capteur
 * supposé, source. Une focale égale des deux côtés désigne un objectif fixe.
 */
const SOURCEES = [
  // --- Hikvision EasyIP 2.0+ AcuSense, brochure page 11 -------------------
  ['Hikvision', 'DS-2CD2083G2-I', 'bullet', 2.8, 2.8, 8, '1/2.8"', `${BROCHURE}, p. 11`],
  ['Hikvision', 'DS-2CD2083G2-I', 'bullet', 4, 4, 8, '1/2.8"', `${BROCHURE}, p. 11`],
  ['Hikvision', 'DS-2CD2083G2-I', 'bullet', 6, 6, 8, '1/2.8"', `${BROCHURE}, p. 11`],
  ['Hikvision', 'DS-2CD2183G2-I', 'dôme', 2.8, 2.8, 8, '1/2.8"', `${BROCHURE}, p. 11`],
  ['Hikvision', 'DS-2CD2383G2-I', 'turret', 4, 4, 8, '1/2.8"', `${BROCHURE}, p. 11`],
  ['Hikvision', 'DS-2CD2683G2-IZS', 'bullet varifocal', 2.8, 12, 8, '1/2.8"', `${BROCHURE}, p. 11`],
  ['Hikvision', 'DS-2CD2783G2-IZS', 'turret varifocal', 2.8, 12, 8, '1/2.8"', `${BROCHURE}, p. 11`],
  ['Hikvision', 'DS-2CD2043G2-I', 'bullet', 2.8, 2.8, 4, '1/2.8"', `${BROCHURE}, p. 11`],
  ['Hikvision', 'DS-2CD2643G2-IZS', 'bullet varifocal', 2.8, 12, 4, '1/2.8"', `${BROCHURE}, p. 11`],

  // --- Hikvision EasyIP 4.0 AcuSense, brochure page 10 --------------------
  ['Hikvision', 'DS-2CD2T86G2-2I/4I', 'bullet', 2.8, 2.8, 8, '1/2.8"', `${BROCHURE}, p. 10`],
  ['Hikvision', 'DS-2CD2T86G2-2I/4I', 'bullet', 4, 4, 8, '1/2.8"', `${BROCHURE}, p. 10`],
  ['Hikvision', 'DS-2CD2T86G2-2I/4I', 'bullet', 6, 6, 8, '1/2.8"', `${BROCHURE}, p. 10`],
  ['Hikvision', 'DS-2CD2186G2-I(SU)', 'dôme', 2.8, 2.8, 8, '1/2.8"', `${BROCHURE}, p. 10`],
  ['Hikvision', 'DS-2CD2786G2-IZS', 'dôme varifocal', 2.8, 12, 8, '1/2.8"', `${BROCHURE}, p. 10`],
  ['Hikvision', 'DS-2CD2686G2-IZS', 'bullet varifocal', 2.8, 12, 8, '1/2.8"', `${BROCHURE}, p. 10`],
  ['Hikvision', 'DS-2CD2386G2-I', 'turret', 4, 4, 8, '1/2.8"', `${BROCHURE}, p. 10`],

  // --- Hikvision EasyIP 4.0 ColorVu, brochure page 9 ---------------------
  ['Hikvision', 'DS-2CD2087G2-L', 'bullet ColorVu', 2.8, 2.8, 8, '1/1.2"', `${BROCHURE}, p. 9`],
  ['Hikvision', 'DS-2CD2087G2-L', 'bullet ColorVu', 4, 4, 8, '1/1.2"', `${BROCHURE}, p. 9`],
  ['Hikvision', 'DS-2CD2647G2-LZS', 'bullet ColorVu varifocal', 3.6, 9, 4, '1/1.8"', `${BROCHURE}, p. 9`],
  ['Hikvision', 'DS-2CD2747G2-LZS', 'turret ColorVu varifocal', 3.6, 9, 4, '1/1.8"', `${BROCHURE}, p. 9`],

  // --- Références du catalogue de l'agence -------------------------------
  ['Hikvision', 'DS-2CD3786G2T-IZS', 'dôme varifocal', 2.7, 13.5, 8, '1/1.8"', LISTING],
  ['Hikvision', 'DS-2CD2T87G2H-LI', 'bullet ColorVu hybride', 2.8, 2.8, 8, '1/1.2"', LISTING],
  ['Hikvision', 'DS-2CD1353G0-I', 'dôme', 2.8, 2.8, 5, '1/2.7"', LISTING],
  ['Hikvision', 'iDS-2CD75C5G0-IZHSY', 'dôme DeepinView varifocal', 2.8, 12, 12, '1/1.7"', LISTING],
  ['Dahua', 'DH-IPC-HFW3549T1P-ZAS-PV', 'bullet varifocal', 2.7, 13.5, 5, '1/2.7"', LISTING],
  ['Dahua', 'DH-IPC-HDW5842TMP-ASE-0280B-S3', 'turret', 2.8, 2.8, 8, '1/1.8"', LISTING],
];

export const CATALOGUE_INITIAL = [
  // Seules entrées complètes de bout en bout : l'étude du client donne à la
  // fois la référence, les deux focales et le format de capteur thermique.
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
    capteurSuppose: false,
    source: 'Étude client — caméra 4 (thermique)',
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
    capteurSuppose: false,
    source: 'Étude client — caméra 4 (voie contexte)',
  },

  ...SOURCEES.map(([marque, reference, voie, focaleMin, focaleMax, mp, capteur, source], i) => ({
    id: `source-${i}`,
    marque,
    reference,
    voie,
    type: 'visible',
    capteur,
    focaleMin,
    focaleMax,
    resolution: { ...DEF[mp] },
    // La référence et la focale viennent d'un document : l'entrée est fiable.
    verifie: true,
    // Le capteur, lui, ne figure dans aucun des deux documents.
    capteurSuppose: true,
    source,
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
    // Une définition explicitement nulle est conservée telle quelle : elle dit
    // « inconnue », et la remplacer par du 1080p inventerait une donnée.
    resolution: {
      h: nombreSaisi(brut.resolution?.h) || (brut.resolution?.h === 0 ? 0 : 1920),
      v: nombreSaisi(brut.resolution?.v) || (brut.resolution?.v === 0 ? 0 : 1080),
    },
    // Une entrée modifiée à la main est tenue pour vérifiée : c'est l'agence
    // qui l'a saisie.
    verifie: brut.verifie !== false,
    // Le capteur reste supposé tant que personne ne l'a confirmé.
    capteurSuppose: brut.capteurSuppose === true,
    source: String(brut.source || '').trim(),
  };
}

/**
 * Une entrée n'est exploitable que si sa focale est connue : sans elle, on ne
 * peut ni la proposer ni dire quel champ elle couvrira. Les références relevées
 * d'un catalogue commercial arrivent souvent ainsi, réduites à un nom.
 */
export const estComplete = (e) => !!e && e.focaleMin > 0 && e.focaleMax > 0 && e.resolution.h > 0;

/** Ce qui, dans une entrée, reste à confirmer — vide si tout est sourcé. */
export function aConfirmer(e) {
  const restes = [];
  if (!e.verifie) restes.push('la référence');
  if (e.capteurSuppose) restes.push('le format de capteur');
  return restes;
}

/** Phrase de réserve à joindre à une entrée, vide quand tout est sourcé. */
export function reserve(e) {
  const restes = aConfirmer(e);
  if (!restes.length) return '';
  const quoi = restes.join(' et ');
  return ` ${quoi.charAt(0).toUpperCase()}${quoi.slice(1)} reste${restes.length > 1 ? 'nt' : ''} `
    + 'à confirmer sur la fiche technique du modèle.';
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
    .filter(estComplete)
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
          + reserve(p.entree),
      };
    }
    if (p.dans) {
      return {
        focale: p.reglage,
        texte: `${nom} : varifocal ${fr(p.entree.focaleMin, 1)}–${fr(p.entree.focaleMax, 1)} mm, `
          + `régler le zoom sur ${arrondie} mm.`
          + reserve(p.entree),
      };
    }
    const sens = p.reglage > focale ? 'plus serré' : 'plus large';
    return {
      focale: p.reglage,
      texte: `${nom} : focale ${fr(p.reglage, 1)} mm, soit un champ ${sens} que le tracé `
        + `(${Math.round(p.ecart * 100)} % d'écart).`
        + reserve(p.entree),
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

const COLONNES = ['marque', 'reference', 'voie', 'type', 'capteur', 'focaleMin', 'focaleMax', 'resH', 'resV', 'source'];

/** Catalogue au format CSV point-virgule, celui qu'attend un tableur français. */
export function versCsv(catalogue) {
  const lignes = [COLONNES.join(';')];
  for (const e of catalogue) {
    lignes.push([
      e.marque, e.reference, e.voie, e.type, e.capteur,
      String(e.focaleMin).replace('.', ','), String(e.focaleMax).replace('.', ','),
      e.resolution.h, e.resolution.v, e.source,
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
      source: lire('source') || 'Catalogue importé',
    }, i);
    // Sans référence ni focale, la ligne n'apprend rien.
    if (entree.reference && entree.focaleMin > 0) sortie.push(entree);
  }
  return sortie;
}

/* ------------------------------------- relevé d'un catalogue commercial */

/** Marques reconnues dans un intitulé de catalogue. */
const MARQUES = [
  'Hikvision', 'Dahua', 'Axis', 'Uniview', 'Hanwha', 'Bosch', 'Mobotix',
  'Safire', 'Vivotek', 'Avigilon', 'Milesight', 'Ajax', 'Reolink', 'Foscam',
];

/** Préfixes de référence propres à un constructeur, quand l'intitulé le tait. */
const PREFIXES = [
  [/^i?DS-2/i, 'Hikvision'],
  [/^(DH-)?IPC-|^DH-/i, 'Dahua'],
  [/^PN[OVD]-/i, 'Hanwha'],
  [/^N[BDI]E-/i, 'Bosch'],
];

/** Marque déduite de la seule référence — vide si le préfixe n'est pas connu. */
export function marqueDepuisReference(reference) {
  const trouve = PREFIXES.find(([motif]) => motif.test(String(reference || '')));
  return trouve ? trouve[1] : '';
}

/** Un intitulé qui ne parle pas d'une caméra n'a rien à faire au catalogue. */
const EST_CAMERA = /cam[ée]ra|camera|bullet|dôme|dome|turret|PTZ|speed dome|IPC-|DS-2CD|DS-2DE|DS-2TD|DS-2CE|PNO-|NBE-/i;

/** Définitions nommées en clair dans les intitulés du commerce. */
const DEFINITIONS = { '4k': { h: 3840, v: 2160 }, '1080p': { h: 1920, v: 1080 }, '720p': { h: 1280, v: 720 } };

/** Nombre écrit à la française ou à l'anglaise : « 13,5 » comme « 13.5 ». */
const dec = (t) => parseFloat(String(t).replace(',', '.'));

/**
 * Focale lue dans un intitulé — `null` quand il n'en porte pas.
 *
 * Seules les écritures sans ambiguïté sont retenues. Les suffixes propres à
 * chaque constructeur ne le sont pas, à une exception près : le `-0280B` de
 * Dahua, dont les quatre chiffres donnent la focale au centième près. Deviner
 * les autres reviendrait à inventer une caractéristique.
 */
export function focaleDepuisIntitule(titre) {
  const t = String(titre || '');

  // Une focale fixe s'écrit « 2.8 mm » ou, chez les revendeurs Hikvision,
  // « F2.8 » isolé. Entre parenthèses, « (F1) » est un indice de révision du
  // matériel, pas une focale : la forme collée est donc écartée.
  const cherche = (x) => x.match(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*mm/i)
    || x.match(/(?:^|[\s/])F(\d+(?:[.,]\d+)?)(?=[\s/]|$)/);

  const plage = t.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|à)\s*(\d+(?:[.,]\d+)?)\s*mm/i);
  if (plage) {
    // Un intitulé qui annonce à la fois une plage et une focale fixe se
    // contredit — la fiche technique tranchera, pas nous.
    const reste = t.replace(plage[0], ' ');
    return cherche(reste) ? null : { min: dec(plage[1]), max: dec(plage[2]) };
  }

  const fixe = cherche(t);
  if (fixe) return { min: dec(fixe[1]), max: dec(fixe[1]) };

  const dahua = t.match(/-(\d{4})B\b/);
  if (dahua) {
    const f = Number(dahua[1]) / 100;
    if (f >= 1 && f <= 50) return { min: f, max: f };
  }
  return null;
}

/** Définition lue dans un intitulé — `null` quand il n'en porte pas. */
export function definitionDepuisIntitule(titre) {
  const t = String(titre || '');

  const pixels = t.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/);
  if (pixels) return { h: Number(pixels[1]), v: Number(pixels[2]) };

  const nomme = t.match(/\b(4K|1080p|720p)\b/i);
  if (nomme) return { ...DEFINITIONS[nomme[1].toLowerCase()] };

  const mp = t.match(/(\d+)\s*(?:MP|Mpx|M[ée]gapixels?)\b/i);
  if (mp) {
    const classe = { 2: [1920, 1080], 4: [2560, 1440], 5: [2560, 1920], 6: [3200, 1800], 8: [3840, 2160], 12: [4000, 3000] };
    const d = classe[Number(mp[1])];
    if (d) return { h: d[0], v: d[1] };
  }
  return null;
}

/** Référence constructeur repérée dans un intitulé. */
export function referenceDepuisIntitule(titre) {
  const t = String(titre || '').replace(/[(),]/g, ' ');
  const jetons = t.split(/\s+/).filter((j) => (
    // Au moins deux lettres : « 1080-1080p », tiré d'une définition, n'est pas
    // une référence, et il est plus long que celle qu'on cherche.
    (j.match(/[A-Za-z]/g) || []).length >= 2 && /\d/.test(j) && j.length >= 5
    && /^[A-Za-z0-9/\-.]+$/.test(j)
    && !/^[\d\-x×.]+p?$/i.test(j) && !/mm$|MP$|^\d+p$/i.test(j)
  ));
  if (!jetons.length) return '';
  // La plus longue : une référence constructeur l'emporte sur « H.265+ ».
  return jetons.sort((a, b) => b.length - a.length)[0];
}

/**
 * Catalogue lu depuis un relevé commercial — l'export d'une place de marché,
 * d'un tarif distributeur, de n'importe quel tableau portant une colonne
 * d'intitulés.
 *
 * Ces relevés donnent la référence, souvent la définition, parfois la focale,
 * jamais le capteur. Les lignes dont la focale manque sont **rendues quand
 * même**, focale à zéro : elles apparaissent alors « à compléter » au lieu de
 * disparaître sans bruit, et l'outil ne les propose pas tant qu'elles le sont.
 *
 * @param {string} texte contenu du fichier CSV
 * @param {object} [options]
 * @param {string} [options.source] nom du relevé, reporté sur chaque entrée
 * @returns {object[]}
 */
export function depuisReleveCommercial(texte, options = {}) {
  const lignes = decouperCsv(String(texte || ''));
  if (lignes.length < 2) return [];

  const entetes = lignes[0].map((c) => c.trim().toLowerCase());
  const colTitre = entetes.findIndex((c) => /^(titre|title|nom|libell[ée]|d[ée]signation|produit)$/.test(c));
  if (colTitre < 0) return [];

  const source = options.source || 'Relevé de catalogue';
  const sortie = [];
  const vus = new Set();

  for (let i = 1; i < lignes.length; i += 1) {
    const titre = (lignes[i][colTitre] || '').trim();
    if (!titre || !EST_CAMERA.test(titre)) continue;

    const reference = referenceDepuisIntitule(titre);
    if (!reference || vus.has(reference)) continue;
    vus.add(reference);

    const marque = MARQUES.find((m) => new RegExp(`\\b${m}\\b`, 'i').test(titre))
      || marqueDepuisReference(reference);
    const focale = focaleDepuisIntitule(titre);
    const definition = definitionDepuisIntitule(titre);

    sortie.push(normaliserEntree({
      marque,
      reference,
      voie: '',
      type: /thermique|thermal|DS-2TD/i.test(titre) ? 'thermique' : 'visible',
      capteur: '1/2.8"',
      focaleMin: focale ? focale.min : 0,
      focaleMax: focale ? focale.max : 0,
      resolution: definition || { h: 0, v: 0 },
      verifie: true,
      // Aucun relevé commercial ne donne le capteur, ni la définition quand
      // l'intitulé n'en porte pas.
      capteurSuppose: true,
      source,
    }, i));
  }
  return sortie;
}

/**
 * Découpage d'un CSV qui respecte les guillemets : les intitulés du commerce
 * sont pleins de virgules, et une découpe naïve les éparpille sur plusieurs
 * colonnes.
 */
export function decouperCsv(texte) {
  const separateur = (texte.split('\n')[0] || '').includes(';') ? ';' : ',';
  const lignes = [];
  let champs = [];
  let champ = '';
  let guillemets = false;

  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i += 1; } else guillemets = false;
      } else champ += c;
    } else if (c === '"') {
      guillemets = true;
    } else if (c === separateur) {
      champs.push(champ); champ = '';
    } else if (c === '\n') {
      champs.push(champ.replace(/\r$/, ''));
      if (champs.some((x) => x.trim())) lignes.push(champs);
      champs = []; champ = '';
    } else champ += c;
  }
  champs.push(champ.replace(/\r$/, ''));
  if (champs.some((x) => x.trim())) lignes.push(champs);
  return lignes;
}
