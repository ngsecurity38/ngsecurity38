/**
 * Métré des câbles : longueurs, limite Ethernet, section des alimentations.
 *
 * Trois questions se posent dès qu'on quitte le plan pour le chantier, et
 * chacune a une réponse chiffrée, pas une réponse d'habitude :
 *
 * - « Combien de câble faut-il commander ? » → cheminement, puis bobines ;
 * - « Cette caméra est-elle trop loin ? » → la limite des 90 mètres ;
 * - « Du 6/10 suffit pour la ventouse ? » → la chute de tension tranche.
 *
 * La troisième est celle qui se paie. Une alimentation sous-dimensionnée ne
 * tombe pas en panne à la mise en service : elle fonctionne au banc, puis
 * lâche l'hiver quand la tension baisse et que le courant monte. On ne la
 * rattrape qu'en retirant le câble.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/* ------------------------------------------------------------ Ethernet */

/**
 * Le lien permanent : du panneau de brassage à la prise, 90 mètres.
 *
 * La norme (ISO/IEC 11801, TIA-568) compte 100 mètres pour le canal complet
 * et réserve les dix derniers aux cordons de brassage des deux bouts. Poser
 * 95 mètres de câble « puisque la limite est à 100 » revient à livrer une
 * liaison qui n'a plus de marge, et qui tombera au premier cordon ajouté.
 */
export const LIAISON_PERMANENTE = 90;

/** Le canal complet, cordons compris. Au-delà, plus rien ne garantit rien. */
export const CANAL_COMPLET = 100;

/**
 * Ce que devient une liaison d'une longueur donnée.
 *
 * Trois verdicts, et un seul est confortable. Le niveau `limite` n'est pas un
 * refus : c'est une liaison qui marchera et qu'on ne pourra plus rallonger,
 * ce qui se dit avant la pose et non après.
 *
 * @param {number} metres longueur du câble posé, cordons non compris
 * @returns {{niveau:'ok'|'limite'|'hors-norme', texte:string}}
 */
export function verdictEthernet(metres) {
  const l = Number(metres);
  if (!(l > 0)) return { niveau: 'ok', texte: 'Longueur non renseignée.' };
  if (l <= LIAISON_PERMANENTE) {
    return { niveau: 'ok', texte: `${arrondi(l)} m — dans la limite des ${LIAISON_PERMANENTE} m.` };
  }
  if (l <= CANAL_COMPLET) {
    return {
      niveau: 'limite',
      texte: `${arrondi(l)} m — au-delà du lien permanent de ${LIAISON_PERMANENTE} m. `
        + 'La liaison fonctionnera sans marge : aucun cordon ne pourra être ajouté.',
    };
  }
  return {
    niveau: 'hors-norme',
    texte: `${arrondi(l)} m — au-delà des ${CANAL_COMPLET} m du canal. `
      + 'Un relais actif (commutateur déporté) ou une fibre est nécessaire.',
  };
}

/* ---------------------------------------------------------- cheminement */

/** Réserve laissée à chaque extrémité : dépose en baie, boucle au support. */
export const RESERVE_BOUT = 1;

/** Détours non portés au plan : contournements, passages, remontées. */
export const MOU_DEFAUT = 0.1;

/**
 * Longueur d'un cheminement, en mètres.
 *
 * La distance à vol d'oiseau ne se pose pas : un câble suit les murs, les
 * chemins de câbles et les angles. La somme des deux écarts du plan
 * (|dx| + |dy|) en est l'approximation honnête — celle qui, si elle se
 * trompe, se trompe du bon côté.
 *
 * @param {object} p
 * @param {number} p.dx écart horizontal sur le plan, en mètres
 * @param {number} p.dy écart vertical sur le plan, en mètres
 * @param {number} [p.montee=0] hauteur de pose de l'appareil
 * @param {number} [p.descente=0] descente du chemin de câbles vers la baie
 * @param {number} [p.mou=MOU_DEFAUT] proportion de détours
 * @param {number} [p.reserveBout=RESERVE_BOUT] réserve à chaque extrémité
 * @returns {number} mètres
 */
export function cheminement({
  dx = 0, dy = 0, montee = 0, descente = 0,
  mou = MOU_DEFAUT, reserveBout = RESERVE_BOUT,
}) {
  const parcouru = Math.abs(dx) + Math.abs(dy)
    + Math.max(0, montee) + Math.max(0, descente);
  if (!(parcouru > 0)) return 0;
  return parcouru * (1 + Math.max(0, mou)) + 2 * Math.max(0, reserveBout);
}

/** Longueur standard d'une boîte de câble réseau, en mètres. */
export const BOBINE = 305;

/**
 * Nombre de boîtes à commander, et ce qui reste sur la dernière.
 *
 * Le reste n'est pas une curiosité : c'est ce dont on dispose le jour où une
 * liaison se révèle plus longue qu'au plan, ce qui arrive à chaque chantier.
 *
 * @returns {{boites:number, total:number, reste:number}}
 */
export function bobines(metres, parBoite = BOBINE) {
  const l = Number(metres);
  const b = Number(parBoite);
  if (!(l > 0) || !(b > 0)) return { boites: 0, total: 0, reste: 0 };
  const boites = Math.ceil(l / b);
  return { boites, total: boites * b, reste: boites * b - l };
}

/* -------------------------------------------------- alimentations continues */

/**
 * Résistivité du cuivre, en ohm·mm²/m, à vingt degrés.
 *
 * Elle monte avec la température : environ +0,4 % par degré. Un câble en
 * gaine, au soleil, ne travaille pas à vingt degrés — la marge prise sur la
 * chute admissible n'est pas de la coquetterie.
 */
export const RHO_CUIVRE = 0.0175;

/** Sections courantes du commerce, en mm². */
export const SECTIONS = [0.22, 0.34, 0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10];

/** Chute de tension admissible par défaut : un dixième de la tension. */
export const CHUTE_MAX = 0.1;

/**
 * Chute de tension d'une alimentation continue, en volts.
 *
 * Le facteur deux n'est pas décoratif : le courant fait l'aller ET le retour.
 * L'oublier divise la chute calculée par deux, et c'est l'erreur qui fait
 * poser du 6/10 là où il faut du 15/10.
 *
 * @param {object} p
 * @param {number} p.courant ampères
 * @param {number} p.longueur mètres, aller simple
 * @param {number} p.section mm²
 * @returns {number} volts perdus dans le câble
 */
export function chuteTension({ courant, longueur, section }) {
  if (!(courant > 0) || !(longueur > 0) || !(section > 0)) return 0;
  return (2 * RHO_CUIVRE * longueur * courant) / section;
}

/**
 * Section minimale d'une alimentation continue.
 *
 * @param {object} p
 * @param {number} p.courant ampères appelés par l'appareil
 * @param {number} p.longueur mètres, aller simple
 * @param {number} [p.tension=12] tension nominale
 * @param {number} [p.chuteMax=CHUTE_MAX] part admissible de la tension
 * @returns {{section:number, chute:number, part:number, horsCatalogue:boolean}|null}
 */
export function sectionContinu({ courant, longueur, tension = 12, chuteMax = CHUTE_MAX }) {
  if (!(courant > 0) || !(longueur > 0) || !(tension > 0)) return null;
  const admissible = tension * chuteMax;
  const theorique = (2 * RHO_CUIVRE * longueur * courant) / admissible;
  const retenue = SECTIONS.find((s) => s >= theorique);
  const section = retenue ?? SECTIONS[SECTIONS.length - 1];
  const chute = chuteTension({ courant, longueur, section });
  return {
    section,
    chute,
    part: chute / tension,
    // Aucune section du catalogue ne tient : il faut monter en tension
    // (24 V au lieu de 12 V divise le courant par deux, donc la chute par
    // quatre) ou rapprocher l'alimentation de l'appareil.
    horsCatalogue: retenue === undefined,
  };
}

/** Arrondi d'affichage : le mètre est la seule précision qu'un métré mérite. */
function arrondi(m) {
  return Math.round(m);
}
