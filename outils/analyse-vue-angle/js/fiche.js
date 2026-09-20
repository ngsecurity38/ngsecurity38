/**
 * Format de la fiche enregistrée (.json) et compatibilité entre versions.
 *
 * Une fiche décrit un dossier de chantier : les renseignements communs, les
 * tolérances de réception, l'étude de référence, et une entrée par caméra.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

export const TYPE_FICHE = 'ng-vue-angle';
export const VERSION_FICHE = 2;

/** Optique par défaut d'une caméra : capteur 1/2.8", 4 mm, Full HD. */
export const OPTIQUE_DEFAUT = {
  capteur: '1/2.8"',
  capteurLargeur: 5.18,
  capteurHauteur: 2.92,
  focale: 4,
  resolution: '0',
  resH: 1920,
  resV: 1080,
  distance: 15,
  hauteur: 3.5,
  inclinaison: 15,
};

/** Caméra vierge. */
export function nouvelleCamera(nom = 'Caméra 1') {
  return {
    nom,
    optique: { ...OPTIQUE_DEFAUT },
    commentaire: '',
    repereEtude: null,
    images: { reference: null, reglee: null },
    plan: null, // tracé du champ sur une vue aérienne, cf. js/plan.js
    etude3d: null, // zone entourée sur une photo de repérage, cf. js/photo.js
    zones: [],
    transformation: null,
    manuel: false,
  };
}

/**
 * Ramène une fiche lue sur disque au format courant.
 *
 * La version 1 ne portait qu'une caméra, avec le repère rangé parmi les
 * renseignements de chantier. Les fiches déjà enregistrées par les techniciens
 * doivent continuer à s'ouvrir : elles sont converties en dossier d'une caméra.
 *
 * @throws {Error} si le fichier n'est pas une fiche de vue d'angle
 */
export function migrer(brut) {
  if (!brut || brut.type !== TYPE_FICHE) {
    throw new Error('Ce fichier n\'est pas une fiche de vue d\'angle.');
  }
  if (brut.version >= VERSION_FICHE) return completer(brut);

  const ancien = brut.chantier || {};
  const camera = {
    ...nouvelleCamera(ancien.camera || 'Caméra 1'),
    optique: { ...OPTIQUE_DEFAUT, ...(brut.camera || {}) },
    commentaire: ancien.commentaire || '',
    repereEtude: brut.etude?.repere || null,
    images: {
      reference: brut.images?.reference || null,
      reglee: brut.images?.reglee || null,
    },
    zones: Array.isArray(brut.zones) ? brut.zones : [],
    transformation: brut.transformation || null,
    manuel: !!brut.manuel,
  };

  return completer({
    type: TYPE_FICHE,
    version: VERSION_FICHE,
    enregistreLe: brut.enregistreLe || new Date().toISOString(),
    chantier: {
      client: ancien.client || '',
      site: ancien.site || '',
      technicien: ancien.technicien || '',
      date: ancien.date || '',
      affaire: ancien.affaire || '',
    },
    tolerances: brut.tolerances || {},
    etude: brut.etude ? { fichier: brut.etude.fichier, analyse: brut.etude.analyse } : null,
    cameras: [camera],
  });
}

/** Complète les manques d'une fiche : un fichier tronqué ne doit pas tout casser. */
function completer(f) {
  const cameras = (Array.isArray(f.cameras) ? f.cameras : [])
    .map((c, i) => ({
      ...nouvelleCamera(c.nom || `Caméra ${i + 1}`),
      ...c,
      optique: { ...OPTIQUE_DEFAUT, ...(c.optique || {}) },
      images: { reference: null, reglee: null, ...(c.images || {}) },
      zones: Array.isArray(c.zones) ? c.zones : [],
    }));
  return {
    ...f,
    chantier: f.chantier || {},
    tolerances: f.tolerances || {},
    etude: f.etude || null,
    // Le synoptique décrit le site entier, pas une caméra : il vit donc à la
    // racine de la fiche, à côté des caméras et non dans l'une d'elles.
    synoptique: {
      image: null,
      etalon: null,
      reserve: 0.1,
      ...(f.synoptique || {}),
      noeuds: Array.isArray(f.synoptique?.noeuds) ? f.synoptique.noeuds : [],
      liens: Array.isArray(f.synoptique?.liens) ? f.synoptique.liens : [],
      murs: Array.isArray(f.synoptique?.murs) ? f.synoptique.murs : [],
    },
    cameras: cameras.length ? cameras : [nouvelleCamera()],
  };
}

/** Nom de fichier proposé au téléchargement. */
export function nomDeFichier(chantier, cameras) {
  const parties = [chantier.affaire, chantier.client].map((s) => (s || '').trim()).filter(Boolean);
  if (cameras.length === 1 && cameras[0].nom) parties.push(cameras[0].nom.trim());
  const base = parties.length ? parties.join('-') : 'vue-angle';
  return `${base.replace(/[^\w\-À-ÿ ]+/g, '').replace(/\s+/g, '-').toLowerCase()}.json`;
}
