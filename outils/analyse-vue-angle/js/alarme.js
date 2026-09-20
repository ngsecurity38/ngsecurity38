/**
 * Étude d'un système d'alarme anti-intrusion, à partir de ce qu'un
 * particulier sait dire de chez lui.
 *
 * Il ne connaît ni les zones, ni les groupes, ni la portée radio. Il sait en
 * revanche combien il a de portes, de fenêtres de plain-pied, s'il a un
 * garage, un chien, et s'il veut pouvoir armer en dormant chez lui. De ces
 * réponses-là on tire une installation cohérente.
 *
 * DEUX FAÇONS DE PROTÉGER, ET ELLES NE SE VALENT PAS
 *
 * - **Périmétrique** : des contacts sur les portes et les fenêtres. La
 *   détection a lieu AVANT que l'intrus soit entré, et le système peut rester
 *   armé pendant qu'on dort dans la maison. C'est la protection qui demande
 *   le plus de détecteurs.
 * - **Volumétrique** : des détecteurs de mouvement à l'intérieur. Moins
 *   d'appareils, donc moins cher — mais la détection n'a lieu qu'UNE FOIS
 *   L'INTRUS DEDANS, et le système ne peut plus être armé quand on est chez
 *   soi.
 *
 * Une installation sérieuse mêle les deux : le périmètre sur ce qui est
 * accessible, le volumétrique sur les circulations, en seconde ligne. Ce
 * module compose ce mélange, et dit ce qu'il laisse de côté — une étude qui
 * tait ses trous n'est pas une étude.
 *
 * Il ne choisit rien qui ne soit au tarif : à défaut, il le dit.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/** Types de logement, avec ce qu'ils supposent par défaut. */
export const TYPES_LOGEMENT = {
  plainPied: { label: 'Maison de plain-pied', niveaux: 1, surface: 100, exterieur: true },
  etage: { label: 'Maison à étage', niveaux: 2, surface: 130, exterieur: true },
  appartement: { label: 'Appartement', niveaux: 1, surface: 70, exterieur: false },
  local: { label: 'Local professionnel', niveaux: 1, surface: 150, exterieur: true },
};

/**
 * Présence d'animaux — la question qui change le plus une installation.
 *
 * `limite` est la masse au-delà de laquelle l'immunité annoncée par les
 * constructeurs ne tient plus. `grimpe` marque les animaux qui prennent de la
 * hauteur : l'immunité repose sur le fait que l'animal reste au sol, et un
 * chat sur un meuble se présente au détecteur comme un humain.
 */
export const ANIMAUX = {
  aucun: { label: 'Aucun animal', immunite: false, grimpe: false, masse: 0 },
  petitChien: { label: 'Un chien de moins de 20 kg', immunite: true, grimpe: false, masse: 20 },
  grandChien: { label: 'Un chien de plus de 20 kg', immunite: true, grimpe: false, masse: 40 },
  chat: { label: 'Un ou plusieurs chats', immunite: true, grimpe: true, masse: 6 },
  plusieurs: { label: 'Plusieurs animaux, dont un chat', immunite: true, grimpe: true, masse: 25 },
};

/** Ce qu'il y a côté garage. */
export const GARAGES = {
  aucun: { label: 'Pas de garage', porte: 0, volume: 0, detache: false },
  communicant: {
    label: 'Garage attenant, avec une porte vers la maison',
    porte: 2, volume: 1, detache: false,
  },
  attenant: { label: 'Garage attenant, sans porte vers la maison', porte: 1, volume: 1, detache: false },
  independant: { label: 'Garage ou dépendance à part', porte: 1, volume: 1, detache: true },
};

/**
 * Masse au-delà de laquelle l'immunité animale des détecteurs ne tient plus.
 *
 * Les constructeurs de détecteurs de mouvement annoncent couramment une
 * immunité jusqu'à une vingtaine de kilos et une cinquantaine de centimètres
 * au garrot. Au-delà, un chien déclenche comme un homme.
 *
 * À CONFIRMER sur la fiche du détecteur effectivement posé : ce seuil varie
 * d'un modèle à l'autre, et c'est sur lui que repose toute la suite.
 */
export const MASSE_IMMUNITE = 20;

/**
 * Surface desservie par un détecteur de mouvement, en mètres carrés.
 *
 * Ce n'est pas la portée du détecteur — un détecteur courant porte à une
 * douzaine de mètres sur 90°, soit bien plus. C'est la surface qu'il couvre
 * UTILEMENT dans un logement cloisonné, où les murs arrêtent l'infrarouge
 * avant la portée. Un détecteur par pièce de vie, en somme.
 */
export const SURFACE_PAR_DETECTEUR = 45;

/** Surface en deçà de laquelle un seul détecteur par niveau suffit. */
const SURFACE_PLANCHER = 50;

/** Au-delà, ce n'est plus un logement : c'est une étude sur place. */
const DETECTEURS_MAX = 14;

/**
 * Temps de pose, en heures.
 *
 * Un système radio ne se câble pas : l'essentiel du temps passe à fixer, à
 * appairer, à régler les zones et à former les occupants. Ces valeurs sont
 * celles de l'agence et se règlent : elles ne sortent d'aucune norme.
 */
export const POSE_DEFAUT = { base: 2.5, parDetecteur: 0.4, parSirene: 0.6 };

/**
 * Stratégie de protection retenue.
 *
 * Elle découle des animaux et de l'usage, pas d'un goût : un grand chien ou
 * un chat qui grimpe rendent le volumétrique peu fiable, et c'est alors le
 * périmètre qui porte la détection.
 */
export function strategie(reponses = {}) {
  const animal = ANIMAUX[reponses.animaux] || ANIMAUX.aucun;
  if (animal.masse > MASSE_IMMUNITE || animal.grimpe) return 'perimetrique';
  if (reponses.armerPresent) return 'mixte';
  return 'mixte';
}

/**
 * Un entier positif, jamais NaN.
 *
 * Ces réponses viennent d'un formulaire : un champ vidé à la main, un projet
 * relu d'un fichier édité, et l'on hérite d'une chaîne vide ou d'un texte.
 * `Math.round('x')` vaut NaN, qui se propage ensuite dans tout le comptage
 * sans rien casser — l'étude affiche alors « NaN détecteurs » au client.
 */
const entier = (v, defaut = 0, mini = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(mini, n) : Math.max(mini, defaut);
};

/**
 * Ce qui doit être protégé, avant tout choix de matériel.
 *
 * Séparé du chiffrage : c'est le raisonnement, et c'est lui qu'il faut
 * pouvoir relire. Les quantités qui en sortent ne dépendent d'aucun tarif.
 */
export function inventaire(reponses = {}) {
  const type = TYPES_LOGEMENT[reponses.typeLogement] ? reponses.typeLogement : 'plainPied';
  const defauts = TYPES_LOGEMENT[type];
  const niveaux = entier(reponses.niveaux ?? defauts.niveaux, defauts.niveaux, 1);
  const surface = entier(reponses.surface ?? defauts.surface, defauts.surface, 10);
  const garage = GARAGES[reponses.garage] || GARAGES.aucun;
  const animal = ANIMAUX[reponses.animaux] || ANIMAUX.aucun;
  const mode = strategie(reponses);

  const portes = entier(reponses.portes ?? 2, 2);
  const fenetres = entier(reponses.fenetresAccessibles ?? 4, 4);
  const hautes = entier(reponses.fenetresHautes ?? 0, 0);
  const baies = Math.min(fenetres, entier(reponses.baies ?? 0, 0));

  /*
   * Le périmètre.
   *
   * Une porte se protège toujours : c'est par là qu'on entre le plus souvent,
   * et c'est le seul point par lequel l'intrus ressortira chargé. Les fenêtres
   * comptées sont celles que le client a dites accessibles — de plain-pied, ou
   * au-dessus d'un garage, d'une véranda, d'un appentis.
   */
  const ouvertures = portes + fenetres + garage.porte;

  /*
   * Le bris de vitre.
   *
   * Un contact d'ouverture détecte qu'un battant s'ouvre. Il ne détecte pas
   * une vitre cassée à travers laquelle on passe le bras, ni une baie percée
   * puis enjambée. Une grande surface vitrée appelle donc un détecteur de
   * bris — sans quoi le périmètre a un trou de la taille de la baie.
   */
  const brisVitre = baies > 0 ? Math.max(1, Math.ceil(baies / 2)) : 0;

  /*
   * Le volumétrique.
   *
   * Un détecteur par niveau pour la circulation — entrée, palier, couloir :
   * c'est le passage obligé, quel que soit le point d'entrée. Puis un par
   * tranche de surface au-delà d'un petit logement.
   */
  const circulation = niveaux;
  const pieces = surface > SURFACE_PLANCHER
    ? Math.ceil((surface - SURFACE_PLANCHER) / SURFACE_PAR_DETECTEUR)
    : 0;
  let mouvements = Math.min(DETECTEURS_MAX, circulation + pieces + garage.volume);

  /*
   * Avec un animal que l'immunité ne couvre pas, le volumétrique se réduit à
   * ce qu'on peut lui fermer : la circulation, et le garage s'il n'y va pas.
   * Poser des détecteurs dans des pièces où l'animal passe, c'est fabriquer
   * des alertes qui finiront par faire désarmer le système pour de bon —
   * la panne la plus courante d'une alarme n'est pas technique.
   */
  const volumetriqueReduit = mode === 'perimetrique';
  if (volumetriqueReduit) mouvements = Math.min(mouvements, circulation + garage.volume);

  const dependance = reponses.dependance ? 1 : 0;

  return {
    type,
    labelType: defauts.label,
    niveaux,
    surface,
    portes,
    fenetres,
    fenetresHautes: hautes,
    baies,
    garage: reponses.garage && GARAGES[reponses.garage] ? reponses.garage : 'aucun',
    labelGarage: garage.label,
    animal,
    mode,
    volumetriqueReduit,
    ouvertures: ouvertures + dependance,
    brisVitre,
    mouvements: mouvements + dependance,
    /*
     * La portée radio ne se calcule pas depuis un salon : elle dépend des
     * murs, des planchers et de ce qu'il y a dedans. Ces trois cas sont ceux
     * où un relais est à PRÉVOIR AU BUDGET plutôt que découvert le jour de la
     * pose — ce qui n'est pas la même chose que de l'affirmer nécessaire.
     */
    relais: (garage.detache || dependance > 0 || niveaux >= 3 || surface > 200) ? 1 : 0,
    telecommandes: entier(reponses.occupants ?? 2, 2),
    // Sans box sur place, la transmission passe par le réseau mobile : il
    // faut une carte SIM, et le dire avant la facture.
    sansBox: reponses.internet === 'aucun',
    leveeDoute: !!reponses.leveeDoute,
    sireneExterieure: reponses.sireneExterieure !== false,
    dependance,
  };
}

/* ------------------------------------------------------------- chiffrage */

/** Prix servant au classement : celui de vente s'il existe, sinon l'achat. */
const prixRepere = (a) => (a.prixVente > 0 ? a.prixVente : a.prixAchat || 0);

/**
 * Articles d'un type donné, du moins cher au plus cher.
 *
 * Contrairement au devis vidéo, un article SANS PRIX reste candidat : le
 * tarif alarme peut n'être pas encore renseigné, et il vaut mieux une étude
 * complète dont les montants manquent qu'une étude amputée de son matériel.
 * Le devis signale ensuite chaque ligne non chiffrée.
 */
function candidats(tarif, type, filtre) {
  return (tarif || [])
    .filter((a) => a.type === type)
    .filter((a) => (filtre ? filtre(a) : true))
    .sort((a, b) => prixRepere(a) - prixRepere(b));
}

const moinsCher = (tarif, type, filtre) => candidats(tarif, type, filtre)[0] || null;

/**
 * Compose l'installation : le matériel, les quantités, les heures.
 *
 * @param {object} reponses ce que le client a indiqué
 * @param {object[]} tarif articles disponibles
 * @param {object} [options]
 * @returns {{inv: object, lignes: object[], heures: number, manques: string[]}}
 */
export function composerAlarme(reponses = {}, tarif = [], options = {}) {
  const inv = inventaire(reponses);
  const lignes = [];
  const manques = [];

  const poser = (type, quantite, role, filtre) => {
    if (!(quantite > 0)) return null;
    const a = moinsCher(tarif, type, filtre);
    if (a) {
      lignes.push({ article: a, quantite, role });
      return a;
    }
    manques.push(`Aucun article « ${role.toLowerCase()} » au tarif.`);
    return null;
  };

  /*
   * Le détecteur de mouvement dépend de l'animal, et c'est le seul choix
   * de ce module qui ne soit pas dicté par une quantité.
   */
  const besoinImmunite = inv.animal.immunite;
  const typeMouvement = inv.leveeDoute ? 'mouvementPhoto' : 'mouvement';
  const filtreMouvement = besoinImmunite ? (a) => a.immuniteAnimaux : null;
  const mouvement = moinsCher(tarif, typeMouvement, filtreMouvement)
    || moinsCher(tarif, typeMouvement);
  if (besoinImmunite && mouvement && !mouvement.immuniteAnimaux) {
    manques.push('Aucun détecteur de mouvement à immunité animale au tarif : '
      + 'le modèle retenu déclenchera au passage de l\'animal.');
  }

  // --- le cerveau : assez de place pour tout ce qui précède
  const appareils = inv.ouvertures + inv.brisVitre + inv.mouvements
    + inv.relais + inv.telecommandes + 1 + (inv.sireneExterieure ? 2 : 1);
  const hub = moinsCher(tarif, 'hub', (a) => !(a.capacite > 0) || a.capacite >= appareils);
  if (hub) lignes.push({ article: hub, quantite: 1, role: 'Centrale' });
  else if (candidats(tarif, 'hub').length) {
    manques.push(`Aucune centrale du tarif n'accepte ${appareils} appareils.`);
  } else manques.push('Aucune centrale au tarif.');

  poser('ouverture', inv.ouvertures, 'Détecteurs d\'ouverture');
  poser('brisVitre', inv.brisVitre, 'Détecteurs de bris de vitre');
  if (mouvement && inv.mouvements > 0) {
    lignes.push({
      article: mouvement,
      quantite: inv.mouvements,
      role: inv.leveeDoute ? 'Détecteurs de mouvement avec photo' : 'Détecteurs de mouvement',
    });
  } else if (inv.mouvements > 0) manques.push('Aucun détecteur de mouvement au tarif.');

  poser('clavier', 1, 'Clavier de commande');
  poser('telecommande', inv.telecommandes, 'Télécommandes');
  poser('sireneInt', 1, 'Sirène intérieure');
  if (inv.sireneExterieure) poser('sireneExt', 1, 'Sirène extérieure');
  poser('relais', inv.relais, 'Relais radio');

  const pose = { ...POSE_DEFAUT, ...(options.pose || {}) };
  const detecteurs = inv.ouvertures + inv.brisVitre + inv.mouvements;
  const sirenes = 1 + (inv.sireneExterieure ? 1 : 0);

  return {
    inv,
    appareils,
    lignes,
    heures: reponses.pose === false
      ? 0
      : pose.base + pose.parDetecteur * detecteurs + pose.parSirene * sirenes,
    manques,
  };
}

/* -------------------------------------------------------------- réserves */

/**
 * Ce que l'étude ne promet pas.
 *
 * Certaines réserves sont générales, d'autres naissent des réponses. Les
 * secondes valent plus cher : elles disent au client ce que SON installation
 * laisse de côté, pas ce qu'une installation laisse de côté en général.
 */
export function reservesAlarme(inv) {
  const r = [];

  if (inv.fenetresHautes > 0) {
    r.push(`${inv.fenetresHautes} ouverture${inv.fenetresHautes > 1 ? 's' : ''} en étage `
      + 'ne sont pas protégées : elles ont été déclarées inaccessibles sans échelle. '
      + 'Un intrus muni d\'une échelle entrerait par là sans déclencher le périmètre — '
      + 'il trouverait ensuite le détecteur de mouvement du palier.');
  }

  if (inv.animal.masse > MASSE_IMMUNITE) {
    r.push(`Un chien de cette taille dépasse l'immunité annoncée par les constructeurs `
      + `(de l'ordre de ${MASSE_IMMUNITE} kg). La détection repose donc sur le périmètre, `
      + 'et le volumétrique est limité aux pièces où l\'animal ne va pas.');
  } else if (inv.animal.grimpe) {
    r.push('L\'immunité animale des détecteurs suppose que l\'animal reste au sol. '
      + 'Un chat sur un meuble ou une rambarde se présente au détecteur comme un '
      + 'humain : le volumétrique est donc réduit aux circulations, et le périmètre '
      + 'porte la détection.');
  } else if (inv.animal.immunite) {
    r.push('Les détecteurs retenus sont à immunité animale. Le seuil exact '
      + '(masse et hauteur au garrot) est à vérifier sur la fiche du modèle posé : '
      + 'il varie d\'un détecteur à l\'autre.');
  }

  if (inv.brisVitre === 0 && inv.baies === 0) {
    r.push('Aucune grande surface vitrée n\'a été déclarée. Un contact d\'ouverture '
      + 'détecte un battant qui s\'ouvre, pas une vitre cassée : si une baie existe, '
      + 'signalez-la, elle appelle un détecteur de bris.');
  }

  if (inv.garage === 'communicant') {
    r.push('Le garage communique avec la maison : la porte intérieure est protégée '
      + 'au même titre qu\'une porte d\'entrée. Une porte de garage basculante se '
      + 'force en silence, et donne alors sur un local d\'où l\'on entre à l\'abri '
      + 'des regards.');
  }

  if (inv.relais > 0) {
    r.push('Un relais radio est prévu au budget. La portée réelle dépend des murs '
      + 'et des planchers et ne se mesure que sur place : il peut se révéler inutile, '
      + 'ou il peut en falloir deux.');
  }

  if (inv.sansBox) {
    r.push('Sans box sur place, la transmission des alertes passe par le réseau '
      + 'mobile : il faut une carte SIM et un abonnement de données, non compris ici.');
  }

  r.push('Une alarme n\'empêche pas d\'entrer : elle raccourcit la visite et prévient. '
    + 'Sans télésurveillance, l\'alerte arrive sur votre téléphone — quelqu\'un doit '
    + 'pouvoir y répondre.');
  r.push('Le nombre de détecteurs et leurs emplacements définitifs sont arrêtés lors '
    + 'du relevé sur place : la disposition des pièces et les habitudes des occupants '
    + 'les déplacent toujours un peu.');
  r.push('Si votre assureur impose une certification (NF A2P, grade 2), demandez-la '
    + 'expressément : elle porte sur des références précises et conditionne la prise '
    + 'en charge.');

  return r;
}

/**
 * Les trois lignes de défense, dans l'ordre où l'intrus les rencontre.
 *
 * Sert au schéma de la page. Le client comprend en un coup d'œil ce que
 * trois pages de désignations ne lui diraient pas : ce qu'il paie, c'est de
 * la détection de plus en plus tardive.
 */
export function couches(inv) {
  return [
    {
      cle: 'perimetre',
      titre: 'Au périmètre',
      quand: 'avant qu\'il soit entré',
      nombre: inv.ouvertures + inv.brisVitre,
      detail: `${inv.ouvertures} ouverture${inv.ouvertures > 1 ? 's' : ''}`
        + (inv.brisVitre ? `, ${inv.brisVitre} bris de vitre` : ''),
    },
    {
      cle: 'volume',
      titre: 'À l\'intérieur',
      quand: 'une fois entré, sur son passage',
      nombre: inv.mouvements,
      detail: `${inv.mouvements} détecteur${inv.mouvements > 1 ? 's' : ''} de mouvement`
        + (inv.leveeDoute ? ', avec photo à l\'alerte' : ''),
    },
    {
      cle: 'alerte',
      titre: 'À l\'alerte',
      quand: 'immédiatement, et chez vous',
      nombre: 1 + (inv.sireneExterieure ? 1 : 0),
      detail: inv.sireneExterieure
        ? 'sirène intérieure et sirène extérieure, notification sur votre téléphone'
        : 'sirène intérieure, notification sur votre téléphone',
    },
  ];
}
