/**
 * Autonomie sur coupure de courant : ce qui continue à filmer, et combien de temps.
 *
 * Une installation de vidéosurveillance n'a pas de batterie. L'alarme en a
 * une par construction — c'est même une exigence de certification. La vidéo,
 * elle, s'arrête avec le courant, et c'est précisément au moment de la
 * coupure qu'on aimerait qu'elle filme.
 *
 * Ce module répond à deux questions, et à une troisième que personne ne pose
 * et qui coûte le plus cher :
 *
 * - « Combien de temps tiendra l'installation ? » → autonomie() ;
 * - « Quelle batterie pour tenir deux heures ? » → energieNecessaire() ;
 * - « Qu'est-ce que j'enregistrerai pendant ce temps-là ? » → bilan().
 *
 * La troisième est la bonne. Secourir l'enregistreur sans secourir les
 * caméras qui le nourrissent donne une installation qui fonctionne
 * parfaitement et qui enregistre du noir. C'est une dépense qui produit une
 * preuve vide, et personne ne s'en aperçoit avant d'en avoir besoin.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/**
 * Rendement de la chaîne batterie → sortie.
 *
 * L'onduleur convertit du continu en alternatif, et cette conversion chauffe.
 * Compter l'énergie de la batterie comme si elle arrivait entière à
 * l'appareil surestime l'autonomie d'environ un sixième — soit dix minutes
 * sur une heure annoncée.
 */
export const RENDEMENT = 0.85;

/**
 * Part de la batterie qu'on ne décharge pas.
 *
 * Une batterie au plomb vidée jusqu'au bout ne s'en remet pas : quelques
 * cycles profonds suffisent à lui retirer l'essentiel de sa capacité. Le
 * dimensionnement se fait sur ce qu'on peut vraiment prendre, pas sur ce qui
 * est écrit sur l'étiquette.
 */
export const RESERVE = 0.2;

/**
 * Durée tenue par une batterie donnée, en heures.
 *
 * @param {object} p
 * @param {number} p.energieWh énergie nominale de la batterie
 * @param {number} p.charge puissance consommée, en watts
 * @param {number} [p.rendement=RENDEMENT]
 * @param {number} [p.reserve=RESERVE]
 * @returns {number} heures, 0 si les données manquent
 */
export function autonomie({ energieWh, charge, rendement = RENDEMENT, reserve = RESERVE }) {
  if (!(energieWh > 0) || !(charge > 0)) return 0;
  return (energieWh * (1 - reserve) * rendement) / charge;
}

/**
 * Énergie de batterie nécessaire pour tenir une durée donnée, en wattheures.
 *
 * Réciproque exacte d'autonomie() : ce qui entre ici en ressort là.
 */
export function energieNecessaire({ charge, heures, rendement = RENDEMENT, reserve = RESERVE }) {
  if (!(charge > 0) || !(heures > 0)) return 0;
  return (charge * heures) / ((1 - reserve) * rendement);
}

/**
 * Puissance apparente correspondante, en voltampères.
 *
 * Les onduleurs s'achètent en VA, les appareils se consomment en W, et le
 * rapport entre les deux — le facteur de puissance — vaut couramment 0,6 sur
 * les modèles d'entrée de gamme. Un onduleur « 1000 VA » ne délivre alors
 * que six cents watts, et l'acheteur qui a compté en VA se retrouve avec
 * deux fois moins que prévu.
 */
export const FACTEUR_PUISSANCE = 0.6;

export function voltamperes(watts, facteur = FACTEUR_PUISSANCE) {
  if (!(watts > 0) || !(facteur > 0)) return 0;
  return watts / facteur;
}

/**
 * Calibre d'onduleur à retenir pour une charge donnée, en VA.
 *
 * L'arrondi se fait TOUJOURS vers le haut. Arrondir au plus proche descend
 * sous le besoin une fois sur deux : deux cents watts demandent 333 VA et se
 * verraient proposer un 300 VA. Un onduleur sous-dimensionné se met en
 * sécurité au basculement, c'est-à-dire au seul instant où on lui demande
 * quelque chose.
 *
 * @param {number} watts charge à tenir
 * @param {number} [pas=100] calibres du commerce, de cent en cent
 */
export function calibreOnduleur(watts, pas = 100) {
  const va = voltamperes(watts);
  if (!(va > 0) || !(pas > 0)) return 0;
  return Math.ceil(va / pas) * pas;
}

/**
 * Ce que l'installation enregistrera pendant la coupure.
 *
 * @param {object} p
 * @param {object[]} p.zones chacune : {cle, nom, secourue, charge, cameras[],
 *   enregistreur?}
 * @param {number} [p.heures] durée visée, pour chiffrer la batterie
 * @returns {object} bilan, avec `enregistreNoir` et les caméras perdues
 */
export function bilan({ zones = [], heures = 0, rendement = RENDEMENT, reserve = RESERVE } = {}) {
  const somme = (liste) => liste.reduce((s, z) => s + (z.charge > 0 ? z.charge : 0), 0);
  const secourues = zones.filter((z) => z.secourue);
  const abandonnees = zones.filter((z) => !z.secourue);
  const chargeSecourue = somme(secourues);

  const camerasPerdues = abandonnees.flatMap((z) => z.cameras || []);
  const camerasTenues = secourues.flatMap((z) => z.cameras || []);
  const zoneEnregistreur = zones.find((z) => z.enregistreur);

  /*
   * Le cas qui justifie ce module. L'enregistreur tient, des caméras
   * tombent : l'installation fonctionne, et ce qu'elle grave est vide.
   */
  const enregistreNoir = !!zoneEnregistreur && zoneEnregistreur.secourue
    && camerasPerdues.length > 0;

  return {
    chargeSecourue,
    chargeAbandonnee: somme(abandonnees),
    camerasTenues,
    camerasPerdues,
    enregistreNoir,
    energieWh: heures > 0
      ? energieNecessaire({ charge: chargeSecourue, heures, rendement, reserve })
      : 0,
    voltamperes: voltamperes(chargeSecourue),
  };
}
