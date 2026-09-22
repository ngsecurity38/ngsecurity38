/**
 * Composition automatique d'une installation, à partir de ce qu'un client sait
 * dire de son site.
 *
 * Un particulier ne connaît ni focale, ni budget PoE, ni codec. Il sait en
 * revanche combien d'accès il veut couvrir, s'ils sont dehors, et combien de
 * temps il veut garder les images. De ces trois réponses on tire une
 * installation cohérente : les caméras, le switch qui les alimente,
 * l'enregistreur qui les reçoit et le disque qui tient la durée demandée.
 *
 * Ce module **ne choisit rien qui ne soit au tarif**. S'il manque un switch
 * assez grand ou un disque assez gros, il le dit au lieu de composer une
 * installation qui ne se commande pas.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { capaciteNecessaire, debitEstime } from './stockage.js';
import { cheminement, verdictEthernet, bobines, BOBINE } from './cable.js';

/**
 * Types de site proposés au client, avec ce qu'ils impliquent d'ordinaire.
 *
 * `zones` est une **suggestion de départ**, pas une règle : le client la
 * corrige. `jours` reprend les durées de conservation habituelles — un
 * commerce garde plus longtemps qu'un particulier.
 */
export const TYPES_SITE = {
  maison: { label: 'Maison', article: 'une', zones: 3, jours: 15, exterieur: true },
  commerce: { label: 'Commerce', article: 'un', zones: 4, jours: 30, exterieur: false },
  entrepot: { label: 'Entrepôt', article: 'un', zones: 6, jours: 30, exterieur: true },
  parking: { label: 'Parking', article: 'un', zones: 4, jours: 30, exterieur: true },
  copropriete: { label: 'Copropriété', article: 'une', zones: 6, jours: 30, exterieur: true },
  chantier: { label: 'Chantier', article: 'un', zones: 4, jours: 15, exterieur: true },
};

/**
 * Temps de pose, en heures.
 *
 * Une base pour le coffret, le réseau et la mise en service, puis un forfait
 * par caméra — percement, fixation, tirage, réglage. Ces valeurs sont celles de
 * l'agence et se règlent : elles ne sortent d'aucune norme.
 */
export const POSE_DEFAUT = { base: 3, parCamera: 1.5 };

/** Un port d'uplink est réservé sur le switch : il relie le routeur. */
const PORTS_RESERVES = 1;

/**
 * Distance supposée entre l'enregistreur et une caméra, en mètres, à PLAT.
 *
 * Une moyenne de chantier, pas une mesure : le cheminement réel ne se connaît
 * qu'au relevé. Elle sert à ce que le câble figure au budget plutôt que d'être
 * découvert à la facture.
 *
 * C'est une distance sur le plan, pas une longueur de câble : celle-ci se
 * calcule à partir d'elle, hauteur de pose et détours compris.
 */
export const METRES_PAR_CAMERA = 30;

/** Hauteur de pose supposée quand le client n'en dit rien, en mètres. */
export const HAUTEUR_SUPPOSEE = 3;

/** Hauteur du coffret ou de la baie où descendent les câbles, en mètres. */
const DESCENTE_COFFRET = 2;

/** Consommation supposée d'une caméra quand le tarif ne la donne pas, en watts. */
const CONSO_SUPPOSEE = 8;

/** Articles d'un type donné, du moins cher au plus cher. */
function candidats(tarif, type, filtre) {
  return (tarif || [])
    .filter((a) => a.type === type)
    .filter((a) => (filtre ? filtre(a) : true))
    .filter((a) => prixRepere(a) > 0)
    .sort((a, b) => prixRepere(a) - prixRepere(b));
}

/** Prix servant au classement : celui de vente s'il existe, sinon l'achat. */
const prixRepere = (a) => (a.prixVente > 0 ? a.prixVente : a.prixAchat || 0);

/** Le moins cher qui convient, ou `null`. */
const moinsCher = (tarif, type, filtre) => candidats(tarif, type, filtre)[0] || null;

/**
 * Compose une installation.
 *
 * @param {object} reponses ce que le client a indiqué
 * @param {string} reponses.typeSite clé de TYPES_SITE
 * @param {number} reponses.zones nombre d'accès à couvrir
 * @param {number} reponses.jours durée de conservation
 * @param {boolean} [reponses.ecran] poste de visualisation sur place
 * @param {object[]} tarif articles disponibles, avec leurs prix
 * @param {object} [options]
 * @param {object} [options.pose] base et forfait par caméra, en heures
 * @returns {{lignes: object[], heures: number, manques: string[], capaciteGo: number}}
 */
export function composer(reponses = {}, tarif = [], options = {}) {
  const type = TYPES_SITE[reponses.typeSite] ? reponses.typeSite : 'maison';
  const defauts = TYPES_SITE[type];
  const cameras = Math.max(1, Math.round(reponses.zones ?? defauts.zones));
  const jours = Math.max(1, Math.round(reponses.jours ?? defauts.jours));
  const heuresParJour = Math.min(24, Math.max(1, reponses.heuresParJour ?? 24));

  const lignes = [];
  const manques = [];

  // --- la caméra : la moins chère du tarif, puisque c'est ce qu'on demande
  const camera = moinsCher(tarif, 'camera');
  if (camera) lignes.push({ article: camera, quantite: cameras, role: 'Caméras' });
  else manques.push('Aucune caméra au tarif.');

  /*
   * Le dimensionnement se fait sur le nombre de caméras **prévues**, extension
   * comprise : poser un switch à huit ports pour huit caméras, c'est condamner
   * la neuvième à un second switch.
   */
  const prevues = cameras + Math.max(0, Math.round(reponses.extension ?? 0));

  // --- le switch : assez de ports PoE, assez de ports, et assez de watts
  const portsRequis = prevues + PORTS_RESERVES;
  const consoCamera = camera?.conso > 0 ? camera.conso : CONSO_SUPPOSEE;
  const budgetRequis = consoCamera * prevues;
  const sw = moinsCher(tarif, 'switch', (a) => a.portsPoe >= prevues
    && a.ports >= portsRequis
    && (!(a.budgetPoe > 0) || a.budgetPoe >= budgetRequis));
  if (sw) lignes.push({ article: sw, quantite: 1, role: 'Switch PoE' });
  else if (candidats(tarif, 'switch').length) {
    manques.push(`Aucun switch du tarif n'offre ${prevues} ports PoE, `
      + `${portsRequis} ports et ${Math.round(budgetRequis)} W de budget PoE.`);
  } else manques.push('Aucun switch au tarif.');

  // --- l'enregistreur : assez de canaux
  const nvr = moinsCher(tarif, 'nvr', (a) => a.canaux >= prevues);
  if (nvr) lignes.push({ article: nvr, quantite: 1, role: 'Enregistreur' });
  else if (candidats(tarif, 'nvr').length) {
    manques.push(`Aucun enregistreur du tarif n'offre ${prevues} canaux.`);
  } else manques.push('Aucun enregistreur au tarif.');

  // --- le routeur : la porte vers l'extérieur, sans laquelle pas d'accès distant
  if (reponses.routeur !== false) {
    const routeur = moinsCher(tarif, 'routeur');
    if (routeur) lignes.push({ article: routeur, quantite: 1, role: 'Routeur' });
    else if (candidats(tarif, 'routeur').length === 0 && reponses.routeur) {
      manques.push('Aucun routeur au tarif.');
    }
  }

  // --- le disque : dimensionné sur la durée demandée
  const debit = camera?.debit > 0
    ? camera.debit
    : debitEstime({ resH: camera?.resH || 2560, resV: camera?.resV || 1440 });
  const capaciteGo = capaciteNecessaire({ debitTotal: debit * cameras, jours, heuresParJour });
  const disque = moinsCher(tarif, 'disque', (a) => a.capacite >= capaciteGo);
  if (disque) lignes.push({ article: disque, quantite: 1, role: 'Disque de surveillance' });
  else if (candidats(tarif, 'disque').length) {
    manques.push(`Aucun disque du tarif ne couvre ${Math.round(capaciteGo)} Go.`);
  } else manques.push('Aucun disque au tarif.');

  // --- l'écran, si le client en veut un
  if (reponses.ecran) {
    const ecran = moinsCher(tarif, 'ecran');
    if (ecran) lignes.push({ article: ecran, quantite: 1, role: 'Écran de supervision' });
    else manques.push('Aucun écran au tarif.');
  }

  /*
   * Le câble et la connectique.
   *
   * Ils ne se voient pas sur une photo et se retrouvent pourtant sur toutes
   * les factures. Les compter d'emblée évite l'écart le plus fréquent entre
   * l'estimation et la note finale.
   */
  /*
   * Une distance sur le plan n'est pas une longueur de câble.
   *
   * Le câble monte au support, redescend au coffret, contourne ce qui se
   * trouve sur son chemin et laisse de quoi raccorder aux deux bouts. Trente
   * mètres à plat en font près de trente-sept une fois posés — et ce sont ces
   * sept mètres, multipliés par le nombre de caméras, qui séparent
   * l'estimation de la facture.
   */
  const aPlat = Math.max(0, reponses.metresParCamera ?? METRES_PAR_CAMERA);
  const hauteur = Math.max(0, reponses.hauteurPose ?? HAUTEUR_SUPPOSEE);
  // Une distance déclarée nulle n'est pas une caméra posée sur l'enregistreur :
  // c'est le client qui retire le câble du budget, parce qu'il le fournit ou
  // qu'il est déjà tiré. On ne lui compte alors ni descente ni réserves.
  const parCamera = aPlat > 0
    ? cheminement({ dx: aPlat, montee: hauteur, descente: DESCENTE_COFFRET })
    : 0;
  const metres = parCamera * cameras;
  const verdictCable = verdictEthernet(parCamera);
  const boites = bobines(metres);
  if (metres > 0) {
    const cable = moinsCher(tarif, 'cable');
    if (cable) {
      lignes.push({ article: cable, quantite: Math.ceil(metres), role: 'Câble réseau' });
    } else manques.push('Aucun câble réseau au tarif.');
  }
  /*
   * Une liaison hors norme n'est pas un détail de métré : c'est une caméra
   * qui ne fonctionnera pas. Elle remonte donc avec les manques, là où le
   * client la lira, et non dans une note de bas de page.
   */
  if (verdictCable.niveau === 'hors-norme') {
    manques.push(`À ${Math.round(aPlat)} m de l'enregistreur, une liaison `
      + `réseau dépasse les 100 m admis : ${verdictCable.texte} `
      + 'Cette distance ne relève plus d\'une estimation en ligne.');
  } else if (verdictCable.niveau === 'limite') {
    manques.push(`À ${Math.round(aPlat)} m de l'enregistreur, la liaison est `
      + 'à la limite de la norme : elle fonctionnera, sans marge.');
  }
  for (const [type, role] of [['connectique', 'Connectique et supports'],
    ['coffret', 'Coffret réseau']]) {
    const a = moinsCher(tarif, type);
    if (a) lignes.push({ article: a, quantite: type === 'connectique' ? cameras : 1, role });
  }

  const pose = { ...POSE_DEFAUT, ...(options.pose || {}) };
  return {
    cameras,
    prevues,
    metresCable: metres,
    metresParCamera: parCamera,
    boitesCable: boites,
    verdictCable,
    jours,
    heuresParJour,
    capaciteGo,
    debitTotal: debit * cameras,
    lignes,
    heures: reponses.pose === false ? 0 : pose.base + pose.parCamera * cameras,
    manques,
  };
}

/**
 * Ce que l'installation composée ne saurait promettre.
 *
 * Une configuration tirée de trois réponses n'est pas une étude. Le dire au
 * client n'affaiblit pas la proposition : cela évite qu'il découvre sur place
 * qu'il faut une caméra de plus, et que l'écart lui soit reproché.
 */
export const RESERVES = [
  'Cette configuration est établie à partir de vos réponses, sans visite du '
    + 'site. Le nombre de caméras et leur emplacement définitif sont arrêtés '
    + 'lors du relevé technique.',
  'Les angles de vue, les longueurs de câble et les obstacles (murs, portails, '
    + 'végétation) ne peuvent être évalués à distance.',
  'Les prix sont donnés hors taxes et sous réserve de disponibilité des '
    + 'références au moment de la commande.',
  'La longueur de câble est une moyenne de chantier, pas une mesure : le '
    + 'cheminement réel ne se connaît qu\'au relevé. Elle est calculée à '
    + 'partir de la distance que vous indiquez, hauteur de pose, détours et '
    + 'réserves de raccordement compris.',
  `Le câble réseau se vend en boîtes de ${BOBINE} m. Le métré ci-dessus est `
    + 'la longueur posée ; la commande se fait en boîtes entières, et le '
    + 'reste sert le jour où une liaison se révèle plus longue qu\'au plan.',
];
