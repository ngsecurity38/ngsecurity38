/**
 * Lecture du texte d'une étude d'implantation.
 *
 * L'étude remise par le client annonce ce qui doit être posé : focale ou angle
 * de vue, capteur, résolution, distance, hauteur, niveau d'exploitation attendu.
 * Ce module relève ces valeurs dans le texte du PDF pour les confronter à ce qui
 * est réellement monté.
 *
 * Il ne décide rien : il propose des valeurs, chacune accompagnée de l'extrait
 * et de la page où elle a été lue. Une focale mal relevée fausserait toute la
 * mesure d'angle — c'est au technicien de valider.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { fr, signe } from './format.js';

/** Corrige l'espace insécable et les variantes d'apostrophe du texte PDF. */
function normaliser(texte) {
  return String(texte || '')
    .replace(/[   ]/g, ' ')
    .replace(/[’′]/g, "'")
    .replace(/[″”]/g, '"')
    .replace(/[ \t]+/g, ' ');
}

const nombre = (s) => parseFloat(String(s).replace(',', '.'));

/** Une valeur relevée, toujours accompagnée de sa justification. */
const releve = (valeur, ligne, page, unite = '', extra = {}) => ({
  valeur, unite, page, extrait: ligne.trim().slice(0, 160), ...extra,
});

/**
 * Sur quel axe porte un angle annoncé.
 *
 * Les fiches constructeur donnent volontiers l'angle diagonal, plus flatteur :
 * le comparer à l'angle horizontal de la pose ferait apparaître un écart qui
 * n'existe pas. À défaut de précision, l'horizontal est retenu, c'est la
 * convention des études d'implantation.
 */
function axeDeLAngle(ligne) {
  if (/diagonal/i.test(ligne)) return 'diagonal';
  if (/vertical/i.test(ligne)) return 'vertical';
  return 'horizontal';
}

/* ------------------------------------------------------------- extracteurs */

/**
 * Chaque extracteur reçoit une ligne et rend une valeur, ou null.
 * L'ordre compte : le premier qui répond gagne, les motifs les plus explicites
 * sont donc placés en tête.
 */
const EXTRACTEURS = {
  focale: [
    // « focale 2,8 - 12 mm » : sur un varifocal, seule la borne basse est retenue,
    // c'est elle qui donne le champ le plus large annoncé.
    /(?:focale|objectif|optique)[^\n]{0,30}?(\d+(?:[.,]\d+)?)\s*(?:[-–]|à)\s*(\d+(?:[.,]\d+)?)\s*mm/i,
    /(?:focale|objectif|optique)[^\n]{0,30}?(\d+(?:[.,]\d+)?)\s*mm/i,
    /(\d+(?:[.,]\d+)?)\s*mm\s*(?:de\s*)?(?:focale|d'objectif)/i,
  ],
  angle: [
    /(?:angle\s*(?:de\s*)?(?:vue|champ|vision)|champ\s*(?:de\s*)?(?:vision|vue)?|ouverture)\s*(?:horizontal\w*|vertical\w*|diagonal\w*)?\s*:?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:°|deg)/i,
    /(\d+(?:[.,]\d+)?)\s*°\s*(?:d'angle|de\s*champ|horizontal|vertical|diagonal)/i,
  ],
  capteur: [
    /\b1\s*\/\s*(\d+(?:[.,]\d+)?)\s*["'′″]/,
    /capteur[^\n]{0,20}?\b1\s*\/\s*(\d+(?:[.,]\d+)?)/i,
  ],
  resolution: [
    /(\d{3,5})\s*[x×*]\s*(\d{3,5})/,
    /(\d+(?:[.,]\d+)?)\s*(?:MP|M[ée]gapixels?|Mpx)\b/i,
  ],
  distance: [
    /(?:distance|port[ée]e|profondeur)[^\n]{0,25}?(\d+(?:[.,]\d+)?)\s*m\b/i,
    /[àa]\s*(\d+(?:[.,]\d+)?)\s*m[èe]tres?\s*(?:de\s*(?:la\s*)?(?:sc[èe]ne|zone|cible))/i,
  ],
  hauteur: [
    /hauteur\s*(?:de\s*)?(?:pose|montage|fixation|mise en place)?\s*:?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*m\b/i,
    /pos[ée]e?\s*[àa]\s*(\d+(?:[.,]\d+)?)\s*m\b/i,
  ],
  niveau: [
    /\b(identification|reconnaissance|observation|d[ée]tection)\b/i,
  ],
};

/** Résolutions nommées, converties en pixels. */
const RESOLUTIONS_NOMMEES = [
  [/\b(?:4K|UHD)\b/i, [3840, 2160]],
  [/\bfull\s*hd\b/i, [1920, 1080]],
  [/\bHD\b/, [1280, 720]],
];

/** Mégapixels → définition 16/9 la plus proche du catalogue courant. */
const PAR_MEGAPIXELS = [
  [1, [1280, 720]], [2, [1920, 1080]], [3, [2048, 1536]], [4, [2560, 1440]],
  [5, [2592, 1944]], [6, [3072, 2048]], [8, [3840, 2160]], [12, [4000, 3000]],
];

function lireResolution(ligne, page) {
  const paire = ligne.match(EXTRACTEURS.resolution[0]);
  if (paire) {
    const h = Number(paire[1]);
    const v = Number(paire[2]);
    // Filtre les faux positifs du genre « 2026 x 3 » ou une référence produit.
    if (h >= 320 && h <= 8192 && v >= 240 && v <= 8192 && h > v) {
      return releve({ h, v }, ligne, page);
    }
  }
  for (const [motif, [h, v]] of RESOLUTIONS_NOMMEES) {
    if (motif.test(ligne)) return releve({ h, v }, ligne, page);
  }
  const mp = ligne.match(EXTRACTEURS.resolution[1]);
  if (mp) {
    const valeur = nombre(mp[1]);
    if (valeur >= 0.3 && valeur <= 100) {
      const [, dims] = PAR_MEGAPIXELS.reduce(
        (meilleur, entree) => (Math.abs(entree[0] - valeur) < Math.abs(meilleur[0] - valeur) ? entree : meilleur),
      );
      return releve({ h: dims[0], v: dims[1], megapixels: valeur }, ligne, page);
    }
  }
  return null;
}

function lireChamp(cle, ligne, page) {
  if (cle === 'resolution') return lireResolution(ligne, page);

  for (const motif of EXTRACTEURS[cle]) {
    const m = ligne.match(motif);
    if (!m) continue;

    if (cle === 'capteur') return releve(`1/${m[1].replace(',', '.')}"`, ligne, page);
    if (cle === 'niveau') {
      const mot = m[1].toLowerCase().replace('é', 'e');
      return releve(mot.startsWith('detect') ? 'detection' : mot, ligne, page);
    }

    const valeur = nombre(m[1]);
    if (!Number.isFinite(valeur)) continue;
    if (cle === 'focale' && (valeur < 0.8 || valeur > 300)) continue;
    if (cle === 'angle' && (valeur < 5 || valeur > 360)) continue;
    if (cle === 'distance' && (valeur < 0.5 || valeur > 500)) continue;
    if (cle === 'hauteur' && (valeur < 0.5 || valeur > 60)) continue;
    if (cle === 'angle') return releve(valeur, ligne, page, '°', { axe: axeDeLAngle(ligne) });
    return releve(valeur, ligne, page, cle === 'focale' ? 'mm' : 'm');
  }
  return null;
}

const CHAMPS_CAMERA = ['focale', 'angle', 'capteur', 'resolution', 'distance', 'hauteur', 'niveau'];

/* ------------------------------------------------------------ repères caméra */

const MOTIF_CAMERA = /\b(?:cam[ée]ra|cam)\s*(?:n\s*[°o]\s*)?[-–—:]?\s*(\d{1,3})\b/i;

/** Repère normalisé : « CAM 04 ». */
const repereCamera = (numero) => `CAM ${String(numero).padStart(2, '0')}`;

/* --------------------------------------------------------------- en-tête */

const EXTRACTEURS_ENTETE = {
  client: /\bclient\s*:?\s*(.{2,60})/i,
  site: /\b(?:site|adresse|lieu|chantier)\s*:?\s*(.{2,80})/i,
  affaire: /\b(?:affaire|dossier|devis|r[ée]f[ée]rence)\s*(?:n\s*[°o]\s*)?:?\s*([\w][\w\-/.]{1,20})/i,
};

/* ------------------------------------------------------------------ analyse */

/**
 * Analyse le texte d'une étude.
 *
 * @param {string[]} pages texte de chaque page, lignes séparées par des retours
 * @returns {{cameras: object[], entete: object, champs: object}}
 *   `cameras` : une entrée par repère trouvé, avec les valeurs lues dans sa
 *   section. `champs` : les valeurs lues hors de toute section, qui servent de
 *   repli quand l'étude ne détaille pas caméra par caméra.
 */
export function analyserEtude(pages) {
  const lignes = [];
  (Array.isArray(pages) ? pages : [pages]).forEach((texte, index) => {
    normaliser(texte).split('\n').forEach((ligne) => {
      if (ligne.trim()) lignes.push({ texte: ligne, page: index + 1 });
    });
  });

  const entete = {};
  for (const [cle, motif] of Object.entries(EXTRACTEURS_ENTETE)) {
    for (const { texte, page } of lignes) {
      const m = texte.match(motif);
      if (m) {
        entete[cle] = releve(m[1].trim().replace(/\s*[—–-]\s*$/, ''), texte, page);
        break;
      }
    }
  }

  // Découpage en sections : une section court d'un repère caméra au suivant.
  const sections = [];
  lignes.forEach((ligne, index) => {
    const m = ligne.texte.match(MOTIF_CAMERA);
    if (!m) return;
    const numero = Number(m[1]);
    const derniere = sections[sections.length - 1];
    if (derniere && derniere.numero === numero) return; // même caméra citée plusieurs fois
    if (derniere) derniere.fin = index;
    sections.push({ numero, repere: repereCamera(numero), page: ligne.page, debut: index, fin: lignes.length });
  });

  const releverDans = (debut, fin) => {
    const champs = {};
    for (let i = debut; i < fin; i += 1) {
      for (const cle of CHAMPS_CAMERA) {
        if (champs[cle]) continue;
        const trouve = lireChamp(cle, lignes[i].texte, lignes[i].page);
        if (trouve) champs[cle] = trouve;
      }
    }
    return champs;
  };

  const cameras = sections.map((s) => ({
    repere: s.repere,
    numero: s.numero,
    page: s.page,
    champs: releverDans(s.debut, s.fin),
  }));

  // Hors sections : utile quand l'étude ne décrit qu'une seule caméra.
  const finEntete = sections.length ? sections[0].debut : lignes.length;
  const champs = releverDans(0, finEntete);
  if (!sections.length) Object.assign(champs, releverDans(0, lignes.length));

  return { cameras, entete, champs };
}

/** Valeurs de l'étude applicables à une caméra donnée, repli sur le global. */
export function champsPourCamera(etude, repere) {
  const camera = etude.cameras.find((c) => c.repere === repere);
  return { ...etude.champs, ...(camera ? camera.champs : {}) };
}

/* --------------------------------------------------- confrontation à la pose */

const TOLERANCE_ANGLE_ETUDE = 5; // écart d'angle admis entre étude et pose, en degrés
const TOLERANCE_RELATIVE = 0.1; // écart admis sur distance et hauteur

/**
 * Confronte les valeurs de l'étude à la configuration réellement saisie.
 *
 * L'angle est le juge de paix : une focale différente n'est un problème que si
 * elle change le champ couvert. Quand l'étude annonce une focale, elle est donc
 * convertie en angle avec le capteur réellement monté, et ce sont les deux
 * angles que l'on compare.
 *
 * @param {object} champs valeurs relevées dans l'étude
 * @param {object} pose configuration saisie : {angles, focale, capteur, resolution, distance, hauteur}
 * @param {(capteur: object, focale: number) => object} anglesDeChamp calcul optique injecté
 */
export function confronter(champs, pose, anglesDeChamp) {
  const lignes = [];
  const ajouter = (cle, libelle, etude, installe, conforme, remarque = '') => {
    lignes.push({ cle, libelle, etude, installe, conforme, remarque, source: champs[cle] || null });
  };

  let angleEtude = null;
  let axe = 'horizontal';
  if (champs.angle) {
    angleEtude = champs.angle.valeur;
    axe = champs.angle.axe || 'horizontal';
  } else if (champs.focale) {
    angleEtude = anglesDeChamp(pose.capteur, champs.focale.valeur).horizontal;
  }

  if (champs.focale) {
    const ecart = pose.focale - champs.focale.valeur;
    ajouter(
      'focale',
      'Focale',
      `${fr(champs.focale.valeur, 2)} mm`,
      `${fr(pose.focale, 2)} mm`,
      Math.abs(ecart) < 0.05,
      Math.abs(ecart) < 0.05 ? '' : `${signe(ecart)} mm`,
    );
  }

  if (angleEtude !== null) {
    const anglePose = pose.angles[axe];
    const ecart = anglePose - angleEtude;
    ajouter(
      'angle',
      `Angle de vue ${axe}`,
      `${fr(angleEtude)} °`,
      `${fr(anglePose)} °`,
      Math.abs(ecart) <= TOLERANCE_ANGLE_ETUDE,
      `${signe(ecart)} °${champs.angle ? '' : ' (angle déduit de la focale de l\'étude)'}`,
    );
  }

  if (champs.capteur) {
    ajouter('capteur', 'Capteur', champs.capteur.valeur, pose.capteurCle, champs.capteur.valeur === pose.capteurCle);
  }

  if (champs.resolution) {
    const { h, v } = champs.resolution.valeur;
    const conforme = pose.resolution.h >= h && pose.resolution.v >= v;
    ajouter(
      'resolution',
      'Résolution',
      `${h} × ${v} px`,
      `${pose.resolution.h} × ${pose.resolution.v} px`,
      conforme,
      conforme ? '' : 'définition inférieure à l\'étude',
    );
  }

  for (const [cle, libelle, valeurPose] of [
    ['distance', 'Distance à la scène', pose.distance],
    ['hauteur', 'Hauteur de pose', pose.hauteur],
  ]) {
    if (!champs[cle]) continue;
    const attendu = champs[cle].valeur;
    const ecart = valeurPose - attendu;
    ajouter(
      cle,
      libelle,
      `${fr(attendu, 2)} m`,
      `${fr(valeurPose, 2)} m`,
      Math.abs(ecart) <= Math.max(0.2, attendu * TOLERANCE_RELATIVE),
      Math.abs(ecart) < 0.05 ? '' : `${signe(ecart, 2)} m`,
    );
  }

  return lignes;
}
