/**
 * Le pays du chantier : la TVA, et ce que la loi y demande.
 *
 * L'agence intervient en France et en Belgique. Tant que les pages
 * calculaient à 20 %, un client belge recevait une estimation fausse de
 * plusieurs centaines d'euros — sur une page publique, présentée comme une
 * estimation de l'agence.
 *
 * Deux choses changent avec le pays, et elles ne sont pas du même ordre :
 *
 * - **le taux de TVA**, qui est un chiffre. Il se règle dans le fichier de
 *   tarif, comme les prix : un taux change par décision publique, pas par
 *   reconstruction d'une page ;
 * - **ce que la loi demande**, qui est une réserve. Elle n'est pas du même
 *   texte d'un pays à l'autre — une certification française ne veut rien dire
 *   à Bruxelles, et la Belgique impose des démarches que la France ignore.
 *
 * CE MODULE NE DONNE PAS D'AVIS JURIDIQUE. Il pose les questions qu'il faut
 * poser, en nommant le texte ou l'organisme, et en disant qu'il faut vérifier.
 * Les taux réduits, en particulier, dépendent de conditions que seule la
 * comptabilité de l'agence peut trancher.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

/**
 * Les pays servis, leurs taux et leurs obligations.
 *
 * `taux` : le premier est celui qui s'applique par défaut. Un taux réduit
 * n'est jamais choisi automatiquement — il dépend de conditions que la page
 * ne peut pas vérifier, et l'annoncer d'office ferait une estimation trop
 * basse que l'agence devrait ensuite reprendre.
 */
export const PAYS = {
  fr: {
    cle: 'fr',
    label: 'France',
    taux: [
      { cle: 'normal', taux: 0.20, label: 'TVA 20 % — taux normal' },
      {
        cle: 'reduit',
        taux: 0.10,
        label: 'TVA 10 % — logement de plus de deux ans',
        condition: 'Le taux réduit suppose un local d\'habitation achevé depuis '
          + 'plus de deux ans et une attestation signée par le client. '
          + 'L\'éligibilité est à confirmer par l\'agence : elle ne se déduit '
          + 'pas de vos réponses.',
      },
    ],
    /** Réserves propres au pays, page par page. */
    alarme: [
      'Si votre assureur impose une certification (NF A2P, grade 2), demandez-la '
        + 'expressément : elle porte sur des références précises et conditionne la '
        + 'prise en charge.',
    ],
    video: [
      'Une caméra qui filme au-delà de votre propriété — trottoir, voie publique, '
        + 'partie commune — relève d\'une autorisation préfectorale. Sur un lieu '
        + 'ouvert au public, l\'information des visiteurs et celle des salariés '
        + 'obéissent à des règles distinctes. À cadrer avant la pose.',
    ],
  },
  be: {
    cle: 'be',
    label: 'Belgique',
    taux: [
      { cle: 'normal', taux: 0.21, label: 'TVA 21 % — taux normal' },
      {
        cle: 'reduit',
        taux: 0.06,
        label: 'TVA 6 % — habitation de plus de dix ans',
        condition: 'Le taux réduit suppose une habitation privée achevée depuis '
          + 'plus de dix ans et une facture mentionnant les conditions. '
          + 'L\'éligibilité est à confirmer par l\'agence : elle ne se déduit '
          + 'pas de vos réponses.',
      },
    ],
    alarme: [
      'En Belgique, un système d\'alarme installé dans une habitation doit être '
        + 'déclaré aux autorités, et l\'installateur doit être une entreprise de '
        + 'sécurité agréée. Les assureurs s\'appuient couramment sur la '
        + 'certification INCERT plutôt que sur la NF A2P française. Ces points '
        + 'sont à vérifier pour votre situation avant la commande.',
    ],
    video: [
      'En Belgique, l\'installation de caméras de surveillance fait l\'objet '
        + 'd\'une déclaration et d\'un pictogramme réglementaire à l\'entrée des '
        + 'lieux filmés. Les règles diffèrent selon qu\'il s\'agit d\'un lieu '
        + 'fermé accessible au public, d\'un lieu fermé non accessible ou d\'un '
        + 'lieu ouvert. À cadrer avant la pose.',
    ],
  },
};

/** Le pays demandé, jamais indéfini. */
export const pays = (cle) => PAYS[cle] || PAYS.fr;

/**
 * Le taux applicable.
 *
 * `tauxParPays`, s'il vient du fichier de tarif, l'emporte : un taux de TVA
 * change par décision publique, et l'agence doit pouvoir le corriger sans
 * attendre une reconstruction des pages.
 */
export function tauxTva(clePays, cleTaux, tauxParPays) {
  const p = pays(clePays);
  const choisi = p.taux.find((t) => t.cle === cleTaux) || p.taux[0];
  /*
   * La surcharge doit être un taux plausible, strictement positif.
   *
   * `Number(null)` vaut 0 : un champ vidé par mégarde dans le fichier de
   * tarif passerait pour une TVA à 0 %, et la page annoncerait un total
   * toutes taxes égal au hors taxes sans que rien ne cloche à l'œil.
   */
  const taux = Number(tauxParPays?.[p.cle]?.[choisi.cle]);
  const admis = Number.isFinite(taux) && taux > 0 && taux < 1;
  return { pays: p, ...choisi, taux: admis ? taux : choisi.taux };
}

/** Les choix à proposer : « France — TVA 20 % », etc. */
export const choixTva = (tauxParPays) => Object.values(PAYS).flatMap(
  (p) => p.taux.map((t) => {
    const r = tauxTva(p.cle, t.cle, tauxParPays);
    return {
      valeur: `${p.cle}:${t.cle}`,
      label: `${p.label} — ${r.label.replace(/^TVA \d+(?:,\d+)? % — /, '')} `
        + `(${(r.taux * 100).toString().replace('.', ',')} %)`,
    };
  }),
);

/** Décode la valeur d'une liste déroulante : « be:reduit ». */
export function lireChoix(valeur) {
  const [p, t] = String(valeur || '').split(':');
  return { pays: PAYS[p] ? p : 'fr', taux: t || 'normal' };
}

/**
 * Les réserves du pays pour une page donnée.
 *
 * @param {string} clePays
 * @param {'video'|'alarme'} page
 * @param {object} [choix] le taux retenu, pour y joindre sa condition
 */
export function reservesPays(clePays, page, choix) {
  const p = pays(clePays);
  const r = [...(p[page] || [])];
  if (choix && choix.condition) r.unshift(choix.condition);
  return r;
}
