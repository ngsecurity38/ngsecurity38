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

/**
 * Rend un texte inoffensif avant de le coller dans du HTML.
 *
 * L'agence tape des intitulés et des paragraphes entiers ; une apostrophe
 * droite ou un chevron suffit à casser la page où on les recolle. La règle
 * vaut pour l'éditeur comme pour le dossier qu'il produit — d'où sa place
 * ici, dans le module que les deux partagent déjà.
 */
export const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/**
 * Un montant en euros.
 *
 * `frGroupe` laisse tomber les zéros de fin : 239,4 pour 239,40 et 163 pour
 * 163,00. Sur une facture, ça ne se fait pas — deux décimales, toujours,
 * même nulles. Le séparateur de milliers reste l'espace insécable.
 */
export const enEuros = (v, n = 2) => {
  if (!Number.isFinite(v)) return null;
  const [entier, decimales] = Math.abs(v).toFixed(n).split('.');
  const groupe = entier.replace(/\d(?=(\d{3})+$)/g, '$& ');
  return `${v < 0 ? '-' : ''}${groupe}${decimales ? `,${decimales}` : ''}`;
};
