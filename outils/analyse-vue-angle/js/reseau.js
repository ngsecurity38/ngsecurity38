/**
 * Synoptique de câblage : matériel posé sur le plan, liaisons, longueurs.
 *
 * Une fois le plan calibré (cf. `js/plan.js`), chaque mètre du plan vaut un
 * nombre connu de mètres réels. On peut donc y poser le matériel, tirer les
 * liaisons, et **mesurer le câble** au lieu de l'estimer — ce qui répond à la
 * question que pose tout client : « ça passe, en longueur ? »
 *
 * Deux longueurs cohabitent, et les confondre coûte cher :
 *
 * - la **longueur au plan**, celle du trait, à plat ;
 * - la **longueur de câble**, qui ajoute les descentes verticales aux deux
 *   extrémités et une réserve. C'est elle qu'on commande.
 *
 * Coordonnées normalisées par la largeur de l'image du plan, comme dans
 * `js/plan.js` : l'échelle s'exprime en mètres par unité normalisée.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/**
 * Longueur maximale d'un lien permanent en cuivre, en mètres.
 *
 * EN 50173-1 / ISO 11801 : 90 m de câble fixe, le canal complet tenant dans
 * 100 m une fois comptés les cordons de brassage aux deux bouts. Au-delà, il
 * faut un switch intermédiaire, un répéteur PoE ou de la fibre — ce n'est pas
 * une marge de confort, c'est la limite au-delà de laquelle le lien ne
 * fonctionne plus de façon garantie.
 */
export const LIMITE_LIEN = 90;

/** Réserve appliquée par défaut à la longueur mesurée : cheminement réel, mou, raccordement. */
export const RESERVE_DEFAUT = 0.1;

/** Matériel qu'on pose sur un synoptique. */
export const TYPES_MATERIEL = {
  camera: { label: 'Caméra', court: 'CAM', couleur: '#c8102e', alimente: true },
  switch: { label: 'Switch PoE', court: 'SW', couleur: '#2eae6a', alimente: false },
  nvr: { label: 'Enregistreur', court: 'NVR', couleur: '#c05cc0', alimente: false },
  ecran: { label: 'Écran', court: 'ÉCR', couleur: '#d99b1f', alimente: false },
  baie: { label: 'Baie / coffret', court: 'BAIE', couleur: '#3d8bfd', alimente: false },
};

/** Hauteur de pose supposée par type, en mètres, quand rien n'est saisi. */
const HAUTEUR_DEFAUT = { camera: 3.5, switch: 0, nvr: 0, ecran: 1.2, baie: 0 };

/**
 * Champs de fiche propres à chaque type, avec leur valeur de départ.
 *
 * Ils sont volontairement à zéro : un port, un canal ou un watt supposé ferait
 * passer un contrôle qui aurait dû alerter. Zéro veut dire « non renseigné », et
 * les contrôles se taisent sur ce qu'ils ignorent.
 */
const CHAMPS_TYPE = {
  camera: {
    debit: 0, conso: 0,
    // Orientation sur le plan : sans elle, pas de cône ni d'angle mort.
    azimut: 0, ouverture: 0, portee: 0,
    prixAchat: 0, prixVente: 0,
  },
  switch: { ports: 0, portsPoe: 0, budgetPoe: 0, prixAchat: 0, prixVente: 0 },
  nvr: { canaux: 0, capacite: 0, prixAchat: 0, prixVente: 0 },
  ecran: { prixAchat: 0, prixVente: 0 },
  baie: { prixAchat: 0, prixVente: 0 },
};

/** Un nombre saisi, jamais NaN. */
const champNumerique = (v, defaut = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : defaut);

let compteur = 0;
const identifiant = (prefixe) => `${prefixe}-${Date.now().toString(36)}-${(compteur += 1)}`;

/** Synoptique vierge. */
export const nouveauSynoptique = () => ({ noeuds: [], liens: [], murs: [] });

/**
 * Nouveau matériel posé sur le plan.
 * @param {string} type clé de TYPES_MATERIEL
 * @param {number} x abscisse normalisée
 * @param {number} y ordonnée normalisée
 * @param {object} [champs] nom, hauteur, référence…
 */
export function nouveauNoeud(type, x, y, champs = {}) {
  const connu = TYPES_MATERIEL[type] ? type : 'camera';
  const propres = {};
  for (const [cle, defaut] of Object.entries(CHAMPS_TYPE[connu] || {})) {
    propres[cle] = champNumerique(champs[cle], defaut);
  }
  return {
    id: champs.id || identifiant(connu),
    type: connu,
    nom: champs.nom || '',
    x,
    y,
    hauteur: Number.isFinite(champs.hauteur) ? champs.hauteur : HAUTEUR_DEFAUT[connu],
    reference: champs.reference || '',
    ip: String(champs.ip || '').trim(),
    ...propres,
  };
}

/** Champs de fiche d'un type de matériel, pour construire son formulaire. */
export const champsDeType = (type) => Object.keys(CHAMPS_TYPE[type] || {});

/** Étiquettes des champs de fiche matériel, en clair. */
export const LIBELLES_MATERIEL = {
  azimut: 'Orientation (°)',
  ouverture: 'Angle de champ (°)',
  portee: 'Portée utile (m)',
  debit: 'Débit (Mbit/s)',
  conso: 'Consommation PoE (W)',
  ports: 'Ports (total)',
  portsPoe: 'Ports PoE',
  budgetPoe: 'Budget PoE (W)',
  canaux: 'Canaux',
  capacite: 'Capacité installée (Go)',
  prixAchat: 'Prix d\'achat HT (€)',
  prixVente: 'Prix de vente HT (€)',
};

/** Nouvelle liaison entre deux matériels, avec ses points de passage éventuels. */
export function nouveauLien(de, vers, points = []) {
  return { id: identifiant('lien'), de, vers, points: points.map((p) => ({ x: p.x, y: p.y })) };
}

/** Le matériel désigné par un identifiant, ou null. */
export const noeudPar = (synoptique, id) => (synoptique?.noeuds || []).find((n) => n.id === id) || null;

/**
 * Suite des points d'un lien, extrémités comprises — `null` si un bout manque.
 *
 * Supprimer un matériel sans supprimer ses liaisons laisserait des liens
 * pendants ; plutôt que de mesurer n'importe quoi, on refuse de mesurer.
 */
export function trajet(synoptique, lien) {
  const a = noeudPar(synoptique, lien.de);
  const b = noeudPar(synoptique, lien.vers);
  if (!a || !b) return null;
  return [{ x: a.x, y: a.y }, ...(lien.points || []), { x: b.x, y: b.y }];
}

/** Longueur au plan d'une suite de points, en mètres. */
export function longueurTrajet(points, echelle) {
  if (!points || points.length < 2 || !(echelle > 0)) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total * echelle;
}

/**
 * Mesure complète d'une liaison.
 *
 * @param {object} synoptique
 * @param {object} lien
 * @param {number} echelle mètres par unité normalisée
 * @param {object} [options]
 * @param {number} [options.reserve=RESERVE_DEFAUT] part ajoutée au câble
 * @returns {object|null} `null` si le lien est pendant ou le plan non calibré
 */
export function mesurerLien(synoptique, lien, echelle, options = {}) {
  const points = trajet(synoptique, lien);
  if (!points || !(echelle > 0)) return null;

  const a = noeudPar(synoptique, lien.de);
  const b = noeudPar(synoptique, lien.vers);
  const auPlan = longueurTrajet(points, echelle);
  // Les descentes : un câble qui va d'une caméra à 4 m à un switch en baie
  // descend puis remonte, et ces mètres-là se paient aussi.
  const descentes = Math.max(0, a.hauteur || 0) + Math.max(0, b.hauteur || 0);
  const reserve = options.reserve ?? RESERVE_DEFAUT;
  const cable = (auPlan + descentes) * (1 + reserve);

  return {
    lien,
    de: a,
    vers: b,
    auPlan,
    descentes,
    cable,
    depasse: cable > LIMITE_LIEN,
  };
}

/**
 * Matériels reliés au départ d'un point donné, de proche en proche.
 * Sert à dire ce qui remonte réellement jusqu'à l'enregistreur.
 */
export function atteignables(synoptique, depart) {
  const vus = new Set();
  if (!noeudPar(synoptique, depart)) return vus;
  const aVoir = [depart];
  while (aVoir.length) {
    const id = aVoir.pop();
    if (vus.has(id)) continue;
    vus.add(id);
    for (const l of synoptique.liens || []) {
      if (l.de === id && !vus.has(l.vers)) aVoir.push(l.vers);
      if (l.vers === id && !vus.has(l.de)) aVoir.push(l.de);
    }
  }
  return vus;
}

/**
 * Récapitulatif du synoptique : ce qu'on commande, et ce qui cloche.
 *
 * Les défauts relevés sont ceux qui se voient sur le plan et se paient sur le
 * chantier : un lien trop long, un matériel oublié au bout d'aucun câble, une
 * caméra qui ne remonte à aucun enregistreur.
 */
export function recapitulatif(synoptique, echelle, options = {}) {
  const noeuds = synoptique?.noeuds || [];
  const liens = synoptique?.liens || [];

  const mesures = liens
    .map((l) => mesurerLien(synoptique, l, echelle, options))
    .filter(Boolean);

  const parType = {};
  for (const n of noeuds) parType[n.type] = (parType[n.type] || 0) + 1;

  const relies = new Set();
  for (const l of liens) { relies.add(l.de); relies.add(l.vers); }
  const orphelins = noeuds.filter((n) => !relies.has(n.id));

  // Une caméra doit rejoindre un enregistreur, directement ou par les switches.
  const enregistreurs = noeuds.filter((n) => n.type === 'nvr');
  const desservis = new Set();
  for (const e of enregistreurs) for (const id of atteignables(synoptique, e.id)) desservis.add(id);
  const sansEnregistreur = enregistreurs.length
    ? noeuds.filter((n) => n.type === 'camera' && !desservis.has(n.id))
    : [];

  const totalCable = mesures.reduce((s, m) => s + m.cable, 0);
  const plusLong = mesures.reduce((m, x) => (!m || x.cable > m.cable ? x : m), null);

  return {
    mesures,
    parType,
    totalCable,
    plusLong,
    depassements: mesures.filter((m) => m.depasse),
    orphelins,
    sansEnregistreur,
    // Un plan non calibré n'interdit pas de dessiner, mais interdit de chiffrer.
    mesurable: echelle > 0,
  };
}

/**
 * Disposition du synoptique **logique** : l'arborescence, indépendante du plan.
 *
 * Le plan dit où passent les câbles ; l'arborescence dit qui dépend de qui.
 * Les deux figurent au dossier parce qu'elles ne répondent pas à la même
 * question — et c'est la seconde qu'on lit pour comprendre l'installation.
 *
 * Les niveaux se déduisent des liaisons, en partant de l'enregistreur : écran
 * et enregistreur en haut, switches au milieu, caméras en bas.
 *
 * @returns {{noeuds: object[], liens: object[], niveaux: number}} coordonnées
 *   normalisées entre 0 et 1, prêtes à dessiner
 */
export function dispositionLogique(synoptique) {
  const noeuds = synoptique?.noeuds || [];
  const liens = synoptique?.liens || [];
  if (!noeuds.length) return { noeuds: [], liens: [], niveaux: 0 };

  const voisins = new Map(noeuds.map((n) => [n.id, []]));
  for (const l of liens) {
    if (voisins.has(l.de) && voisins.has(l.vers)) {
      voisins.get(l.de).push(l.vers);
      voisins.get(l.vers).push(l.de);
    }
  }

  // Racine : l'enregistreur, à défaut le switch, à défaut le premier matériel.
  const ordre = ['nvr', 'switch', 'baie', 'ecran', 'camera'];
  const racine = ordre.map((t) => noeuds.find((n) => n.type === t)).find(Boolean);

  const niveau = new Map();
  const file = [racine.id];
  niveau.set(racine.id, 0);
  while (file.length) {
    const id = file.shift();
    for (const v of voisins.get(id) || []) {
      if (!niveau.has(v)) { niveau.set(v, niveau.get(id) + 1); file.push(v); }
    }
  }
  // Ce qui n'est relié à rien se range sous le dernier niveau plutôt que de
  // disparaître du schéma : un matériel oublié doit se voir.
  const profondeur = Math.max(0, ...niveau.values());
  for (const n of noeuds) if (!niveau.has(n.id)) niveau.set(n.id, profondeur + 1);

  const niveaux = Math.max(...niveau.values()) + 1;
  const parNiveau = new Map();
  for (const n of noeuds) {
    const k = niveau.get(n.id);
    if (!parNiveau.has(k)) parNiveau.set(k, []);
    parNiveau.get(k).push(n);
  }

  const places = [];
  for (const [k, groupe] of parNiveau) {
    groupe.forEach((n, i) => places.push({
      ...n,
      niveau: k,
      x: (i + 1) / (groupe.length + 1),
      y: niveaux === 1 ? 0.5 : k / (niveaux - 1),
    }));
  }

  return { noeuds: places, liens, niveaux };
}

/** Désignation d'un matériel, repli sur son type quand il n'a pas de nom. */
export function nomNoeud(n, index = 0) {
  if (n.nom) return n.nom;
  const t = TYPES_MATERIEL[n.type];
  return `${t ? t.court : '?'} ${index + 1}`;
}
