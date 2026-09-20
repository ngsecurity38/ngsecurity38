/** Mise en forme des nombres à la française, partagée par les modules. */

export const arrondir = (v, n = 1) => {
  const f = 10 ** n;
  return Math.round(v * f) / f;
};

/** « 6,4 » plutôt que « 6.4 » : ces valeurs sont lues sur le terrain. */
export const fr = (v, n = 1) => String(arrondir(v, n)).replace('.', ',');

/** Idem, avec le signe explicite : un écart se lit « +2,4 » ou « −1,1 ». */
export const signe = (v, n = 1) => (v > 0 ? `+${fr(v, n)}` : fr(v, n));

/**
 * Grands nombres avec séparateur de milliers : « 15 552 » se lit d'un coup
 * d'œil, « 15552 » se compte du doigt. L'espace est insécable, pour qu'un
 * retour à la ligne ne coupe pas le nombre en deux.
 */
export const frGroupe = (v, n = 0) => fr(v, n).replace(
  /\d(?=(\d{3})+(,|$))/g, '$&\u202f',
);

/**
 * Élide « de » devant une voyelle : « de reconnaître », mais « d'identifier ».
 *
 * Les textes de la page se composent à partir de listes de verbes, et l'un
 * d'eux commence par une voyelle une fois sur deux. Écrire « de identifier »
 * dans un document remis à un client se remarque immédiatement.
 *
 * Le h aspiré (« de hauteur » ne s'élide pas, « d'habitude » si) n'est pas
 * traité : aucun mot de nos listes ne commence par un h.
 */
export const elider = (mot) => (
  /^[aeiouyàâäéèêëîïôöùûü]/i.test(mot) ? `d'${mot}` : `de ${mot}`
);
