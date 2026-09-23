/**
 * Enregistrement et alimentation : stockage, budget PoE, contrôles d'ensemble.
 *
 * Trois questions que le client pose toujours, et qui se chiffrent :
 *
 * - « Combien de jours je garde les images ? » → capacité de l'enregistreur ;
 * - « Le switch suffit ? » → nombre de ports et budget PoE ;
 * - « Tout est bien branché ? » → canaux, adresses, alimentations.
 *
 * Les valeurs de débit sont **les vôtres** : celles de la fiche technique ou de
 * l'étude. L'estimation fournie ici n'est qu'un ordre de grandeur pour démarrer,
 * et l'outil le dit — un débit supposé faux se paie en téraoctets.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { fr, frGroupe } from './format.js';

/**
 * Un mégabit par seconde pendant vingt-quatre heures.
 *
 * 1 Mbit/s × 86 400 s = 86 400 Mbit = 10 800 Mo = 10,8 Go. Les gigaoctets sont
 * décimaux (10⁹ octets), comme les étiquettes des disques : c'est la seule
 * convention qui permette de comparer un besoin à une référence du commerce.
 */
export const GO_PAR_MBPS_JOUR = 10.8;

/** Marge appliquée par défaut à la capacité calculée. */
export const MARGE_DEFAUT = 0.2;

/**
 * Compression : bits par pixel et par image, par codec.
 *
 * Ordres de grandeur, pas des valeurs de fiche technique. Ils servent à
 * proposer un débit quand on n'en a aucun, jamais à contredire celui que porte
 * l'étude.
 */
const BITS_PAR_PIXEL = { h264: 0.07, h265: 0.035, 'h265+': 0.025 };

/** Codecs proposés, du plus ancien au plus économe. */
export const CODECS = [
  { cle: 'h264', label: 'H.264' },
  { cle: 'h265', label: 'H.265' },
  { cle: 'h265+', label: 'H.265+ / Smart codec' },
];

/** Capacités de disques de vidéosurveillance couramment disponibles, en To. */
const DISQUES = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

/**
 * Débit estimé d'une caméra, en Mbit/s.
 *
 * @param {object} camera résolution, images par seconde, codec
 * @returns {number} estimation, 0 si les données manquent
 */
export function debitEstime({ resH, resV, ips = 25, codec = 'h265' }) {
  const pixels = (resH || 0) * (resV || 0);
  const bpp = BITS_PAR_PIXEL[codec] ?? BITS_PAR_PIXEL.h265;
  if (!(pixels > 0) || !(ips > 0)) return 0;
  return (pixels * ips * bpp) / 1e6;
}

/**
 * Capacité nécessaire, en gigaoctets.
 *
 * @param {object} p
 * @param {number} p.debitTotal somme des débits, en Mbit/s
 * @param {number} p.jours durée de conservation
 * @param {number} [p.heuresParJour=24] enregistrement continu ou sur plage
 * @param {number} [p.marge=MARGE_DEFAUT] réserve de sécurité
 * @returns {number} gigaoctets décimaux
 */
export function capaciteNecessaire({ debitTotal, jours, heuresParJour = 24, marge = MARGE_DEFAUT }) {
  if (!(debitTotal > 0) || !(jours > 0) || !(heuresParJour > 0)) return 0;
  const parJour = debitTotal * GO_PAR_MBPS_JOUR * (Math.min(heuresParJour, 24) / 24);
  return parJour * jours * (1 + marge);
}

/**
 * Durée de conservation qu'une capacité donnée permet réellement.
 * L'installateur raisonne souvent dans l'autre sens : « j'ai un 8 To, ça tient
 * combien de jours ? »
 */
export function joursTenus({ debitTotal, capaciteGo, heuresParJour = 24, marge = MARGE_DEFAUT }) {
  if (!(debitTotal > 0) || !(capaciteGo > 0)) return 0;
  const parJour = debitTotal * GO_PAR_MBPS_JOUR * (Math.min(heuresParJour, 24) / 24) * (1 + marge);
  return capaciteGo / parJour;
}

/**
 * Disques du commerce couvrant un besoin.
 *
 * Rendu en téraoctets décimaux, comme les étiquettes des fabricants. Un disque
 * annoncé 8 To offre bien 8 × 10¹² octets ; c'est l'affichage du système, en
 * Tio, qui montrera 7,3 — la différence est d'unité, pas de capacité perdue.
 *
 * @returns {{unitaire:number, nombre:number, total:number}|null}
 */
export function disqueRecommande(go) {
  if (!(go > 0)) return null;
  const to = go / 1000;
  // Un seul disque quand une capacité courante suffit.
  const unique = DISQUES.find((d) => d >= to);
  if (unique) return { unitaire: unique, nombre: 1, total: unique };
  // Sinon, plusieurs du plus gros format courant.
  const plusGros = DISQUES[DISQUES.length - 1];
  const nombre = Math.ceil(to / plusGros);
  return { unitaire: plusGros, nombre, total: plusGros * nombre };
}

/**
 * Comment remplir un enregistreur à N baies.
 *
 * Deux baies ne veulent pas dire deux fois la capacité : cela dépend de ce
 * qu'on en fait, et le choix n'est pas technique mais commercial.
 *
 * - en **pool**, les disques s'additionnent. On a toute la capacité, et la
 *   perte d'un disque emporte la part des images qu'il portait ;
 * - en **miroir**, chaque disque porte la même chose. On a la moitié de la
 *   capacité, et un disque peut mourir sans qu'une image manque.
 *
 * Un disque de vidéosurveillance écrit vingt-quatre heures sur vingt-quatre.
 * Il ne meurt pas « peut-être » : il meurt, et la seule question est de
 * savoir si ce jour-là on avait besoin des images. La fonction rend les deux
 * hypothèses chiffrées plutôt que d'en imposer une.
 *
 * Deux garde-fous, et ils viennent de la machine, pas de l'arithmétique :
 *
 * - `capaciteMax` est ce qu'une baie accepte. Proposer un disque plus gros
 *   revient à proposer un disque qui ne sera pas reconnu, et cela ne se
 *   découvre qu'une fois acheté ;
 * - `raid` dit si l'enregistreur sait faire un miroir. Beaucoup de
 *   deux-baies ne le savent pas : ils écrivent sur les deux disques à la
 *   suite, sans redondance. Annoncer un miroir sur une machine qui n'en
 *   fait pas, c'est vendre une sécurité qui n'existe pas.
 *
 * @param {number} go capacité nécessaire, en gigaoctets
 * @param {number} [baies=2] nombre d'emplacements de disque
 * @param {object} [machine] {capaciteMax, raid} — contraintes de l'appareil
 * @returns {{baies:number, pool:object|null, miroir:object|null}|null}
 */
export function disquesPourBaies(go, baies = 2, machine = {}) {
  if (!(go > 0) || !(baies >= 1)) return null;
  const { capaciteMax = Infinity, raid = true } = machine;
  const to = go / 1000;
  const disponibles = DISQUES.filter((d) => d <= capaciteMax);
  const choisir = (besoinParDisque, nombre) => {
    const unitaire = disponibles.find((d) => d >= besoinParDisque);
    if (!unitaire) return null;
    return { unitaire, nombre, total: unitaire * nombre };
  };
  /*
   * On n'occupe que les baies nécessaires.
   *
   * Remplir les deux baies d'une machine qui en a deux fait acheter un
   * disque dont personne n'a besoin — et interdit d'allonger l'archive plus
   * tard sans tout remplacer. Un disque libre est une option de vente.
   */
  const minimal = () => {
    for (let n = 1; n <= baies; n += 1) {
      const c = choisir(to / n, n);
      if (c && c.total >= to) return c;
    }
    return choisir(to / baies, baies);
  };

  return {
    baies,
    capaciteMax: Number.isFinite(capaciteMax) ? capaciteMax : null,
    raid,
    pool: minimal(),
    // Le miroir n'a de sens qu'à baies paires, et que si la machine le fait.
    miroir: raid && baies % 2 === 0 ? choisir(to / (baies / 2), baies) : null,
  };
}

/* --------------------------------------------------------------- PoE */

/**
 * Classes d'alimentation par Ethernet.
 *
 * La puissance utile au bout du câble est inférieure à celle fournie par le
 * port : la différence part en échauffement du câble. Dimensionner un switch
 * sur la puissance des caméras sans cette perte, c'est le sous-dimensionner.
 */
export const CLASSES_POE = [
  { cle: 'af', label: 'PoE (802.3af)', port: 15.4, appareil: 12.95 },
  { cle: 'at', label: 'PoE+ (802.3at)', port: 30, appareil: 25.5 },
  { cle: 'bt3', label: 'PoE++ type 3 (802.3bt)', port: 60, appareil: 51 },
  { cle: 'bt4', label: 'PoE++ type 4 (802.3bt)', port: 100, appareil: 71 },
];

/** Classe PoE minimale capable d'alimenter un appareil, ou null si hors norme. */
export function classePour(watts) {
  if (!(watts > 0)) return CLASSES_POE[0];
  return CLASSES_POE.find((c) => watts <= c.appareil) || null;
}

/* -------------------------------------------------- contrôles d'ensemble */

/** Adresse IPv4 bien formée ? */
export function ipValide(ip) {
  const t = String(ip || '').trim();
  if (!t) return true; // une adresse non renseignée n'est pas une adresse fausse
  const m = t.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((x) => Number(x) <= 255 && String(Number(x)) === x);
}

/**
 * Contrôles automatiques du dossier.
 *
 * Chaque anomalie porte un `niveau` : `bloquant` empêche l'installation de
 * fonctionner, `avertissement` la rend fragile ou hors règle. Un contrôle ne
 * dit jamais « peut-être » : s'il manque une donnée pour trancher, il se tait
 * plutôt que d'alarmer à tort.
 *
 * @param {object} synoptique matériel et liaisons, cf. js/reseau.js
 * @param {object} reglages jours, heures, marge, capacité installée
 * @returns {object[]} anomalies, les bloquantes en tête
 */
export function controler(synoptique, reglages = {}) {
  const noeuds = synoptique?.noeuds || [];
  const liens = synoptique?.liens || [];
  const anomalies = [];
  const ajouter = (niveau, texte) => anomalies.push({ niveau, texte });

  const nom = (n) => n.nom || n.type;
  const cameras = noeuds.filter((n) => n.type === 'camera');
  const switches = noeuds.filter((n) => n.type === 'switch');
  const enregistreurs = noeuds.filter((n) => n.type === 'nvr');

  // --- adresses en double, adresses mal formées
  const parIp = new Map();
  for (const n of noeuds) {
    const ip = String(n.ip || '').trim();
    if (!ip) continue;
    if (!ipValide(ip)) ajouter('bloquant', `${nom(n)} : « ${ip} » n'est pas une adresse IPv4.`);
    if (!parIp.has(ip)) parIp.set(ip, []);
    parIp.get(ip).push(n);
  }
  for (const [ip, liste] of parIp) {
    if (liste.length > 1) {
      ajouter('bloquant', `Adresse ${ip} attribuée à ${liste.length} appareils : `
        + `${liste.map(nom).join(', ')}.`);
    }
  }

  // --- ports et budget PoE de chaque switch
  for (const sw of switches) {
    const relies = liens
      .filter((l) => l.de === sw.id || l.vers === sw.id)
      .map((l) => noeuds.find((n) => n.id === (l.de === sw.id ? l.vers : l.de)))
      .filter(Boolean);
    const alimentes = relies.filter((n) => n.type === 'camera');

    if (sw.ports > 0 && relies.length > sw.ports) {
      ajouter('bloquant', `${nom(sw)} : ${relies.length} appareils raccordés pour `
        + `${sw.ports} ports.`);
    }
    if (sw.portsPoe >= 0 && sw.portsPoe < alimentes.length) {
      ajouter('bloquant', `${nom(sw)} : ${alimentes.length} caméras à alimenter pour `
        + `${sw.portsPoe} port${sw.portsPoe > 1 ? 's' : ''} PoE.`);
    }
    const conso = alimentes.reduce((s, n) => s + (n.conso > 0 ? n.conso : 0), 0);
    if (sw.budgetPoe > 0 && conso > sw.budgetPoe) {
      ajouter('bloquant', `${nom(sw)} : budget PoE dépassé — ${fr(conso, 1)} W demandés `
        + `pour ${fr(sw.budgetPoe, 0)} W disponibles.`);
    }
    for (const c of alimentes) {
      if (c.conso > 0 && !classePour(c.conso)) {
        ajouter('avertissement', `${nom(c)} demande ${c.conso} W : au-delà du PoE++ type 4. `
          + 'Alimentation séparée à prévoir.');
      }
    }
  }

  // --- caméra raccordée à un matériel qui n'alimente pas
  for (const c of cameras) {
    const voisins = liens
      .filter((l) => l.de === c.id || l.vers === c.id)
      .map((l) => noeuds.find((n) => n.id === (l.de === c.id ? l.vers : l.de)))
      .filter(Boolean);
    if (!voisins.length) continue;
    const alimentee = voisins.some((v) => v.type === 'switch' && (v.portsPoe ?? 1) > 0);
    if (!alimentee && c.conso > 0) {
      ajouter('avertissement', `${nom(c)} n'est raccordée à aucun port PoE : `
        + 'injecteur ou alimentation locale à prévoir.');
    }
  }

  // --- canaux de l'enregistreur
  for (const nvr of enregistreurs) {
    if (!(nvr.canaux > 0)) continue;
    if (cameras.length > nvr.canaux) {
      ajouter('bloquant', `${nom(nvr)} : ${cameras.length} caméras pour ${nvr.canaux} canaux.`);
    }
  }

  // --- capacité installée face à la conservation demandée
  const debitTotal = cameras.reduce((s, c) => s + (c.debit > 0 ? c.debit : 0), 0);
  const { jours, heuresParJour = 24, marge = MARGE_DEFAUT, capaciteInstallee = 0 } = reglages;
  if (debitTotal > 0 && jours > 0 && capaciteInstallee > 0) {
    const besoin = capaciteNecessaire({ debitTotal, jours, heuresParJour, marge });
    if (capaciteInstallee < besoin) {
      const tenus = joursTenus({ debitTotal, capaciteGo: capaciteInstallee, heuresParJour, marge });
      ajouter('bloquant', `Capacité installée insuffisante : ${frGroupe(capaciteInstallee)} Go `
        + `pour ${frGroupe(besoin)} Go nécessaires — ${fr(tenus, 1)} jours tenus `
        + `au lieu de ${jours}.`);
    }
  }
  if (cameras.length && cameras.some((c) => !(c.debit > 0))) {
    const sans = cameras.filter((c) => !(c.debit > 0)).length;
    ajouter('avertissement', `${sans} caméra${sans > 1 ? 's' : ''} sans débit renseigné : `
      + 'le stockage calculé est incomplet.');
  }

  const rang = { bloquant: 0, avertissement: 1 };
  return anomalies.sort((a, b) => rang[a.niveau] - rang[b.niveau]);
}

/**
 * Bilan d'enregistrement et d'alimentation, prêt à afficher.
 */
export function bilan(synoptique, reglages = {}) {
  const noeuds = synoptique?.noeuds || [];
  const liens = synoptique?.liens || [];
  const cameras = noeuds.filter((n) => n.type === 'camera');
  const debitTotal = cameras.reduce((s, c) => s + (c.debit > 0 ? c.debit : 0), 0);

  const { jours = 30, heuresParJour = 24, marge = MARGE_DEFAUT } = reglages;
  const go = capaciteNecessaire({ debitTotal, jours, heuresParJour, marge });

  const poe = noeuds.filter((n) => n.type === 'switch').map((sw) => {
    const alimentes = liens
      .filter((l) => l.de === sw.id || l.vers === sw.id)
      .map((l) => noeuds.find((n) => n.id === (l.de === sw.id ? l.vers : l.de)))
      .filter((n) => n && n.type === 'camera');
    return {
      noeud: sw,
      alimentes: alimentes.length,
      conso: alimentes.reduce((s, n) => s + (n.conso > 0 ? n.conso : 0), 0),
      budget: sw.budgetPoe > 0 ? sw.budgetPoe : 0,
    };
  });

  return {
    cameras: cameras.length,
    debitTotal,
    jours,
    heuresParJour,
    marge,
    capaciteGo: go,
    disque: disqueRecommande(go),
    poe,
    anomalies: controler(synoptique, reglages),
  };
}
