/**
 * Étude d'un système d'alarme anti-intrusion, à partir de ce que le client
 * sait dire de chez lui — maison, magasin, bureaux, dépôt ou chantier.
 *
 * DEUX FAÇONS DE PROTÉGER, ET ELLES NE SE VALENT PAS
 *
 * - **Périmétrique** : des contacts sur les portes, les fenêtres, le rideau.
 *   La détection a lieu AVANT que l'intrus soit entré, et le système peut
 *   rester armé pendant qu'on est dedans. C'est la protection qui demande le
 *   plus d'appareils.
 * - **Volumétrique** : des détecteurs de mouvement à l'intérieur. Moins
 *   d'appareils, donc moins cher — mais la détection n'a lieu qu'UNE FOIS
 *   L'INTRUS DEDANS.
 *
 * Une installation sérieuse mêle les deux. Ce module compose ce mélange, et
 * dit ce qu'il laisse de côté : une étude qui tait ses trous n'est pas une
 * étude.
 *
 * CINQ FAMILLES DE SITES, CINQ RAISONNEMENTS
 *
 * Un magasin n'est pas une maison avec une autre étiquette. Sa façade est en
 * verre, son point faible est la réserve, et le risque qu'on y craint n'est
 * pas seulement l'effraction de nuit. Un dépôt se compte en volume et non en
 * surface, sa charpente métallique avale la radio. Un chantier n'a ni mur, ni
 * courant, ni internet, et se déplace au fil des semaines. Chaque famille a
 * donc son profil — ce qu'elle protège, à quelle densité, et ce qu'on ne peut
 * pas lui promettre depuis un bureau.
 *
 * Il ne choisit rien qui ne soit au tarif : à défaut, il le dit.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/**
 * Familles de sites.
 *
 * `surfaceParDetecteur` n'est pas la portée d'un détecteur — un détecteur
 * courant porte à une douzaine de mètres sur 90°. C'est la surface qu'il
 * couvre UTILEMENT : dans un logement cloisonné les murs arrêtent
 * l'infrarouge bien avant la portée, tandis qu'un plateau de bureaux ou une
 * halle se traversent du regard.
 */
export const FAMILLES = {
  habitation: {
    surfaceParDetecteur: 45,
    plancher: 50,
    max: 14,
    animaux: true,
    garage: true,
    armerPresent: true,
  },
  commerce: {
    surfaceParDetecteur: 70,
    plancher: 40,
    max: 14,
    vitrine: true,
    agression: true,
    reserve: true,
  },
  tertiaire: { surfaceParDetecteur: 55, plancher: 40, max: 18, local: true },
  depot: { surfaceParDetecteur: 150, plancher: 100, max: 24, quais: true, hauteur: true },
  chantier: { surfaceParDetecteur: 0, plancher: 0, max: 0, exterieur: true },
};

/**
 * Sites proposés, avec ce qu'ils supposent par défaut.
 *
 * `portes` et `fenetres` sont des points de départ que le client corrige. Les
 * proposer par site et non en général évite le contresens : un chantier n'a
 * pas « deux portes et quatre fenêtres », un magasin en a une de plus côté
 * réserve et presque aucune fenêtre ouvrante.
 */
export const SITES = {
  plainPied: {
    label: 'Maison de plain-pied', court: 'maison de plain-pied', article: 'votre',
    famille: 'habitation',
    niveaux: 1, surface: 100, portes: 2, fenetres: 4,
  },
  etage: {
    label: 'Maison à étage', court: 'maison à étage', article: 'votre',
    famille: 'habitation',
    niveaux: 2, surface: 130, portes: 2, fenetres: 5,
  },
  appartement: {
    label: 'Appartement', court: 'appartement', article: 'votre',
    famille: 'habitation', immeuble: true,
    niveaux: 1, surface: 70, portes: 1, fenetres: 3,
  },
  commerce: {
    label: 'Magasin, commerce, restaurant', court: 'magasin', article: 'votre',
    famille: 'commerce',
    niveaux: 1, surface: 120, portes: 2, fenetres: 1,
  },
  bureaux: {
    label: 'Bureaux, cabinet, agence', court: 'bureaux', article: 'vos',
    famille: 'tertiaire',
    niveaux: 1, surface: 200, portes: 2, fenetres: 6,
  },
  depot: {
    label: 'Dépôt, entrepôt, atelier', court: 'dépôt', article: 'votre',
    famille: 'depot',
    niveaux: 1, surface: 600, portes: 2, fenetres: 2,
  },
  chantier: {
    label: 'Chantier, site temporaire', court: 'chantier', article: 'votre',
    famille: 'chantier',
    niveaux: 1, surface: 1500, portes: 0, fenetres: 0,
  },
};

/**
 * Présence d'animaux — la question qui change le plus une installation.
 *
 * `grimpe` marque les animaux qui prennent de la hauteur : l'immunité repose
 * sur le fait que l'animal reste au sol, et un chat sur un meuble se présente
 * au détecteur comme un humain.
 */
export const ANIMAUX = {
  aucun: { label: 'Aucun animal', immunite: false, grimpe: false, masse: 0 },
  petitChien: { label: 'Un chien de moins de 20 kg', immunite: true, grimpe: false, masse: 20 },
  grandChien: { label: 'Un chien de plus de 20 kg', immunite: true, grimpe: false, masse: 40 },
  chat: { label: 'Un ou plusieurs chats', immunite: true, grimpe: true, masse: 6 },
  plusieurs: { label: 'Plusieurs animaux, dont un chat', immunite: true, grimpe: true, masse: 25 },
};

/** Ce qu'il y a côté garage — habitation seulement. */
export const GARAGES = {
  aucun: { label: 'Pas de garage', porte: 0, volume: 0, detache: false },
  communicant: {
    label: 'Garage attenant, avec une porte vers la maison',
    porte: 2, volume: 1, detache: false,
  },
  attenant: {
    label: 'Garage attenant, sans porte vers la maison', porte: 1, volume: 1, detache: false,
  },
  independant: {
    label: 'Garage ou dépendance à part', porte: 1, volume: 1, detache: true,
  },
};

/**
 * Masse au-delà de laquelle l'immunité animale des détecteurs ne tient plus.
 *
 * Les constructeurs annoncent couramment une immunité jusqu'à une vingtaine
 * de kilos et une cinquantaine de centimètres au garrot. Au-delà, un chien
 * déclenche comme un homme.
 *
 * À CONFIRMER sur la fiche du détecteur effectivement posé : ce seuil varie
 * d'un modèle à l'autre, et c'est sur lui que repose toute la suite.
 */
export const MASSE_IMMUNITE = 20;

/**
 * Hauteur sous plafond au-delà de laquelle un détecteur ordinaire ne suffit
 * plus, en mètres.
 *
 * Un détecteur d'intérieur se pose vers 2,40 m et regarde vers le bas. Sous
 * une halle de sept mètres, il surveille une tranche au sol et laisse tout le
 * volume au-dessus — dont les lanterneaux et les bardages, par où l'on entre
 * dans un entrepôt.
 */
export const HAUTEUR_COURANTE = 4;

/**
 * Plafond de détecteurs intérieurs, à défaut d'indication de la famille.
 *
 * Au-delà, ce n'est plus un formulaire : c'est une étude sur place. Le
 * plafond dépend de la famille — quatorze détecteurs dans une maison signalent
 * qu'on a dépassé ce qu'un questionnaire sait faire, là où un entrepôt en
 * demande légitimement davantage.
 */
const DETECTEURS_MAX = 24;

/**
 * Temps de pose, en heures.
 *
 * Un système radio ne se câble pas : l'essentiel du temps passe à fixer, à
 * appairer, à régler les zones et à former les utilisateurs. Ces valeurs sont
 * celles de l'agence et se règlent : elles ne sortent d'aucune norme.
 */
export const POSE_DEFAUT = { base: 2.5, parDetecteur: 0.4, parSirene: 0.6 };

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

/** Le profil du site demandé, jamais indéfini. */
export function profil(cle) {
  const site = SITES[cle] ? SITES[cle] : SITES.plainPied;
  return { cle: SITES[cle] ? cle : 'plainPied', site, famille: FAMILLES[site.famille] };
}

/**
 * Stratégie de protection retenue.
 *
 * Elle découle du site et des animaux, pas d'un goût. Un grand chien ou un
 * chat qui grimpe rendent le volumétrique peu fiable, et c'est alors le
 * périmètre qui porte la détection. Un chantier n'a pas d'intérieur : tout s'y
 * joue dehors.
 */
export function strategie(reponses = {}) {
  const { famille } = profil(reponses.typeSite);
  if (famille.exterieur) return 'exterieur';
  if (!famille.animaux) return 'mixte';
  const animal = ANIMAUX[reponses.animaux] || ANIMAUX.aucun;
  if (animal.masse > MASSE_IMMUNITE || animal.grimpe) return 'perimetrique';
  return 'mixte';
}

/**
 * Ce qui doit être protégé, avant tout choix de matériel.
 *
 * Séparé du chiffrage : c'est le raisonnement, et c'est lui qu'il faut
 * pouvoir relire. Les quantités qui en sortent ne dépendent d'aucun tarif.
 */
export function inventaire(reponses = {}) {
  const { cle, site, famille } = profil(reponses.typeSite);
  const niveaux = entier(reponses.niveaux ?? site.niveaux, site.niveaux, 1);
  const surface = entier(reponses.surface ?? site.surface, site.surface, 10);
  const mode = strategie(reponses);

  const portes = entier(reponses.portes ?? site.portes, site.portes);
  const fenetres = entier(reponses.fenetresAccessibles ?? site.fenetres, site.fenetres);
  const hautes = entier(reponses.fenetresHautes ?? 0, 0);
  const baies = Math.min(fenetres, entier(reponses.baies ?? 0, 0));

  const garage = famille.garage ? (GARAGES[reponses.garage] || GARAGES.aucun) : GARAGES.aucun;
  const animal = famille.animaux ? (ANIMAUX[reponses.animaux] || ANIMAUX.aucun) : ANIMAUX.aucun;
  const dependance = famille.garage && reponses.dependance ? 1 : 0;

  /*
   * La vitrine.
   *
   * La façade d'un magasin est en verre : c'est la plus grande ouverture du
   * site, et la seule qu'on ne puisse pas équiper d'un simple contact. Chaque
   * vitrine reçoit donc un détecteur de bris, et le rideau métallique — quand
   * il y en a un — son propre contact : baissé, il est la vraie porte.
   */
  const vitrines = famille.vitrine ? entier(reponses.vitrines ?? 1, 1) : 0;
  const rideau = famille.vitrine && reponses.rideau ? 1 : 0;

  /*
   * La réserve, l'arrière-boutique, le quai.
   *
   * C'est par là qu'on entre dans un commerce : une porte de livraison donne
   * sur une cour ou une ruelle, hors de vue de la rue. Le client la déclare à
   * part parce qu'il l'oublie en comptant « ses portes » — il pense à celles
   * par lesquelles entrent ses clients.
   */
  const livraison = famille.reserve && reponses.reserve ? 1 : 0;
  const quais = famille.quais ? entier(reponses.quais ?? 1, 1) : 0;

  const localTechnique = famille.local && reponses.localTechnique ? 1 : 0;

  /*
   * Le chantier.
   *
   * Ni mur, ni fenêtre : ce qui s'y protège, ce sont les bases-vie, les
   * containers et les accès. La détection se fait dehors.
   */
  const basesVie = famille.exterieur ? entier(reponses.basesVie ?? 1, 1) : 0;
  const acces = famille.exterieur ? entier(reponses.acces ?? 1, 1) : 0;

  const ouvertures = portes + fenetres + garage.porte + dependance
    + rideau + livraison + quais + basesVie;

  /*
   * Le bris de vitre.
   *
   * Un contact d'ouverture détecte qu'un battant s'ouvre. Il ne détecte pas
   * une vitre cassée à travers laquelle on passe le bras, ni une baie percée
   * puis enjambée.
   */
  const brisVitre = vitrines + (baies > 0 ? Math.max(1, Math.ceil(baies / 2)) : 0);

  /*
   * Le volumétrique.
   *
   * Un détecteur par niveau pour la circulation — entrée, palier, couloir :
   * c'est le passage obligé, quel que soit le point d'entrée. Puis un par
   * tranche de surface, à la densité de la famille.
   */
  let mouvements = 0;
  if (!famille.exterieur) {
    const circulation = niveaux;
    const pieces = surface > famille.plancher
      ? Math.ceil((surface - famille.plancher) / famille.surfaceParDetecteur)
      : 0;
    mouvements = circulation + pieces + garage.volume + dependance
      + localTechnique + livraison;
  }

  /*
   * Avec un animal que l'immunité ne couvre pas, le volumétrique se réduit à
   * ce qu'on peut lui fermer. Poser des détecteurs dans des pièces où
   * l'animal passe, c'est fabriquer des alertes qui finiront par faire
   * désarmer le système pour de bon — la panne la plus courante d'une alarme
   * n'est pas technique.
   */
  const volumetriqueReduit = mode === 'perimetrique';
  if (volumetriqueReduit) mouvements = Math.min(mouvements, niveaux + garage.volume + dependance);
  mouvements = Math.min(famille.max ?? DETECTEURS_MAX, mouvements);

  /*
   * Le volumétrique extérieur.
   *
   * Un chantier se surveille dehors : un détecteur par base-vie et un par
   * accès, deux au minimum — un seul appareil sur un terrain ne détecte
   * jamais qu'une direction.
   */
  const exterieurs = famille.exterieur ? Math.max(2, basesVie + acces) : 0;

  const hauteur = famille.hauteur ? entier(reponses.hauteur ?? 3, 3, 2) : 0;
  const metallique = !!(famille.hauteur && reponses.metallique);

  return {
    typeSite: cle,
    labelSite: site.label,
    // Le nom court et son article : « votre magasin », « vos bureaux ».
    // Le libellé de la liste énumère des synonymes — « Magasin, commerce,
    // restaurant » — qui se lisent mal au milieu d'une phrase.
    nomCourt: site.court,
    article: site.article,
    famille: site.famille,
    profil: famille,
    niveaux,
    surface,
    portes,
    fenetres,
    fenetresHautes: hautes,
    baies,
    vitrines,
    rideau,
    livraison,
    quais,
    localTechnique,
    basesVie,
    acces,
    hauteur,
    metallique,
    garage: famille.garage && GARAGES[reponses.garage] ? reponses.garage : 'aucun',
    labelGarage: garage.label,
    animal,
    mode,
    volumetriqueReduit,
    ouvertures,
    brisVitre,
    mouvements,
    exterieurs,
    /*
     * Le relais radio.
     *
     * La portée ne se calcule pas depuis un bureau : elle dépend des murs,
     * des planchers et de ce qu'il y a dedans. Ces cas sont ceux où un relais
     * est à PRÉVOIR AU BUDGET plutôt que découvert le jour de la pose — ce
     * qui n'est pas la même chose que de l'affirmer nécessaire. Une charpente
     * métallique et un chantier étendu en demandent souvent deux.
     */
    relais: (() => {
      if (famille.exterieur) return surface > 2000 ? 2 : 1;
      let n = 0;
      if (garage.detache || dependance > 0 || niveaux >= 3 || surface > 200) n = 1;
      if (metallique || surface > 800) n = Math.max(n, 2);
      return n;
    })(),
    /*
     * Les claviers.
     *
     * Un par entrée utilisée tous les jours : sur un site professionnel, la
     * porte du personnel et celle des livraisons ne sont pas la même, et
     * traverser le magasin dans le noir pour désarmer n'est pas une méthode.
     */
    claviers: famille.garage ? 1 : Math.max(1, entier(reponses.entrees ?? 1, 1, 1)),
    telecommandes: entier(reponses.occupants ?? 2, 2),
    /*
     * Le bouton d'agression.
     *
     * Ce n'est pas de l'anti-intrusion : c'est un appel au secours déclenché
     * par quelqu'un qui est là, sous la contrainte. Il n'a de sens que là où
     * l'on tient une caisse.
     */
    agression: famille.agression && reponses.agression !== false ? 1 : 0,
    // Sans box sur place, la transmission passe par le réseau mobile : il
    // faut une carte SIM, et le dire avant la facture.
    sansBox: reponses.internet === 'aucun' || !!famille.exterieur,
    sansCourant: !!(famille.exterieur && reponses.electricite === 'aucune'),
    immeuble: !!site.immeuble || !!reponses.immeuble,
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
   * Le détecteur de mouvement dépend de l'animal, et c'est le seul choix de
   * ce module qui ne soit pas dicté par une quantité.
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
  const appareils = inv.ouvertures + inv.brisVitre + inv.mouvements + inv.exterieurs
    + inv.relais + inv.telecommandes + inv.claviers + inv.agression
    + (inv.sireneExterieure ? 2 : 1);
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

  poser('exterieur', inv.exterieurs, 'Détecteurs de mouvement extérieurs');
  poser('agression', inv.agression, 'Bouton d\'alarme discret');
  poser('clavier', inv.claviers, 'Claviers de commande');
  poser('telecommande', inv.telecommandes, 'Télécommandes');
  poser('sireneInt', 1, 'Sirène intérieure');
  if (inv.sireneExterieure) poser('sireneExt', 1, 'Sirène extérieure');
  poser('relais', inv.relais, 'Relais radio');

  const pose = { ...POSE_DEFAUT, ...(options.pose || {}) };
  const detecteurs = inv.ouvertures + inv.brisVitre + inv.mouvements + inv.exterieurs;
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
    r.push(`${inv.fenetresHautes} ouverture${inv.fenetresHautes > 1 ? 's' : ''} en hauteur `
      + 'ne sont pas protégées : elles ont été déclarées inaccessibles sans échelle. '
      + 'Un intrus muni d\'une échelle entrerait par là sans déclencher le périmètre — '
      + 'il trouverait ensuite le détecteur de mouvement intérieur.');
  }

  if (inv.animal.masse > MASSE_IMMUNITE) {
    r.push('Un chien de cette taille dépasse l\'immunité annoncée par les constructeurs '
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

  if (inv.brisVitre === 0 && inv.baies === 0 && inv.vitrines === 0) {
    r.push('Aucune grande surface vitrée n\'a été déclarée. Un contact d\'ouverture '
      + 'détecte un battant qui s\'ouvre, pas une vitre cassée : s\'il y a une baie ou '
      + 'une vitrine, signalez-la, elle appelle un détecteur de bris.');
  }

  if (inv.garage === 'communicant') {
    r.push('Le garage communique avec la maison : la porte intérieure est protégée '
      + 'au même titre qu\'une porte d\'entrée. Une porte de garage basculante se '
      + 'force en silence, et donne alors sur un local d\'où l\'on entre à l\'abri '
      + 'des regards.');
  }

  if (inv.famille === 'commerce') {
    r.push('Le bouton d\'alarme discret ne relève pas de l\'anti-intrusion : c\'est un '
      + 'appel au secours déclenché sous la contrainte, pendant les heures d\'ouverture. '
      + 'Il suppose que quelqu\'un reçoive l\'alerte et sache quoi en faire.');
    if (!inv.rideau) {
      r.push('Aucun rideau métallique n\'a été déclaré. S\'il y en a un, il mérite son '
        + 'propre contact : baissé, c\'est lui la vraie porte, et un contact posé '
        + 'seulement sur la porte vitrée derrière ne verrait rien tant qu\'il est fermé.');
    }
  }

  if (inv.famille === 'depot') {
    if (inv.hauteur > HAUTEUR_COURANTE) {
      r.push(`Sous ${inv.hauteur} m de hauteur, un détecteur d'intérieur posé vers `
        + '2,40 m ne surveille qu\'une tranche au sol. Les lanterneaux, les bardages et '
        + 'le volume au-dessus lui échappent : à cette hauteur, le relevé sur place et '
        + 'des détecteurs adaptés (longue portée, barrières, rideaux) ne sont pas '
        + 'optionnels.');
    }
    if (inv.metallique) {
      r.push('Une charpente ou un bardage métallique dégrade fortement la portée radio. '
        + 'Deux relais sont prévus au budget ; leur nombre et leur position ne se '
        + 'décident qu\'après un essai de portée sur place.');
    }
    r.push('Un dépôt non chauffé expose les détecteurs au froid et à la condensation. '
      + 'La plage de température admise est à vérifier sur la fiche de chaque modèle.');
  }

  if (inv.famille === 'chantier') {
    r.push('Un chantier n\'est pas un bâtiment : il n\'a ni mur fermé, ni installation '
      + 'définitive, et son périmètre change chaque mois. Ce chiffrage est un ordre de '
      + 'grandeur pour une base-vie et ses accès, à revoir à chaque phase.');
    r.push('Sur un chantier, l\'alarme seule ne suffit presque jamais : sans levée de '
      + 'doute — photo ou vidéo — une alerte nocturne en rase campagne ne déclenche '
      + 'aucune intervention. Prévoyez-la, ou une télésurveillance.');
    if (inv.sansCourant) {
      r.push('Sans alimentation électrique sur place, tout le matériel fonctionne sur '
        + 'batterie : l\'autonomie réelle et le rythme de remplacement sont à arrêter '
        + 'ensemble, ils conditionnent le coût d\'exploitation.');
    }
  }

  if (inv.immeuble) {
    r.push('En immeuble ou en copropriété, une sirène extérieure peut être encadrée par '
      + 'le règlement ou un arrêté municipal. À vérifier avant la pose.');
  }

  if (inv.relais > 0) {
    r.push(`${inv.relais > 1 ? 'Deux relais radio sont prévus' : 'Un relais radio est prévu'} `
      + 'au budget. La portée réelle dépend des murs et des planchers et ne se mesure que '
      + 'sur place : il peut se révéler inutile, ou il peut en falloir davantage.');
  }

  if (inv.sansBox) {
    r.push('Sans box sur place, la transmission des alertes passe par le réseau '
      + 'mobile : il faut une carte SIM et un abonnement de données, non compris ici.');
  }

  r.push('Une alarme n\'empêche pas d\'entrer : elle raccourcit la visite et prévient. '
    + 'Sans télésurveillance, l\'alerte arrive sur votre téléphone — quelqu\'un doit '
    + 'pouvoir y répondre.');
  r.push('Le nombre de détecteurs et leurs emplacements définitifs sont arrêtés lors '
    + 'du relevé sur place : la disposition des lieux et les habitudes des occupants '
    + 'les déplacent toujours un peu.');
  r.push('Si votre assureur impose une certification (NF A2P, grade 2), demandez-la '
    + 'expressément : elle porte sur des références précises et conditionne la prise '
    + 'en charge.');

  return r;
}

/**
 * Les trois lignes de défense, dans l'ordre où l'intrus les rencontre.
 *
 * Sert au schéma de la page. Le client comprend en un coup d'œil ce que trois
 * pages de désignations ne lui diraient pas : ce qu'il paie, c'est de la
 * détection de plus en plus tardive.
 */
export function couches(inv) {
  const dehors = inv.exterieurs > 0;
  const details = [];
  if (inv.ouvertures > 0) {
    details.push(`${inv.ouvertures} ouverture${inv.ouvertures > 1 ? 's' : ''}`);
  }
  if (inv.brisVitre > 0) details.push(`${inv.brisVitre} bris de vitre`);
  if (dehors) details.push(`${inv.exterieurs} détecteurs extérieurs`);

  return [
    {
      cle: 'perimetre',
      titre: dehors ? 'Aux accès' : 'Au périmètre',
      quand: dehors ? 'dès qu\'il approche' : 'avant qu\'il soit entré',
      nombre: inv.ouvertures + inv.brisVitre + inv.exterieurs,
      detail: details.join(', ') || 'rien de déclaré',
    },
    {
      cle: 'volume',
      titre: 'À l\'intérieur',
      quand: dehors ? 'dans les bases-vie' : 'une fois entré, sur son passage',
      nombre: inv.mouvements,
      detail: inv.mouvements > 0
        ? `${inv.mouvements} détecteur${inv.mouvements > 1 ? 's' : ''} de mouvement`
          + (inv.leveeDoute ? ', avec photo à l\'alerte' : '')
        : 'aucun volume intérieur à surveiller',
    },
    {
      cle: 'alerte',
      titre: 'À l\'alerte',
      quand: 'immédiatement, où que vous soyez',
      nombre: 1 + (inv.sireneExterieure ? 1 : 0) + inv.agression,
      detail: [
        inv.sireneExterieure ? 'sirène intérieure et sirène extérieure' : 'sirène intérieure',
        inv.agression ? 'bouton d\'alarme discret' : '',
        'notification sur votre téléphone',
      ].filter(Boolean).join(', '),
    },
  ];
}
