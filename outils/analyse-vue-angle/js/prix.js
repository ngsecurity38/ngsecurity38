/**
 * Chiffrage : prix du matériel, main-d'œuvre, devis.
 *
 * Un prix n'a de valeur que daté et sourcé. Trois provenances cohabitent, et
 * elles ne se valent pas :
 *
 * - **vendu** : un prix que l'agence a réellement pratiqué, tiré de ses ventes ;
 * - **relevé** : un prix vu chez un revendeur, un jour donné, qui aura bougé ;
 * - **saisi** : un prix entré à la main, sous la responsabilité de l'agence.
 *
 * Le devis dit toujours de laquelle il tient chaque ligne. Un prix relevé il y a
 * six mois et présenté comme ferme engage l'agence sur une marge qui n'existe
 * plus.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { fr } from './format.js';

/** Taux normal de TVA en France. */
export const TVA_DEFAUT = 0.2;

/** Marge commerciale appliquée par défaut au matériel. */
export const MARGE_COMMERCIALE = 0.25;

/** Provenances d'un prix, de la plus sûre à la moins. */
export const PROVENANCES = {
  vendu: { label: 'Prix pratiqué', marque: '✓' },
  saisi: { label: 'Saisi par l\'agence', marque: '✓' },
  releve: { label: 'Relevé chez un revendeur', marque: '~' },
  aucune: { label: 'Prix à renseigner', marque: '⋯' },
};

/**
 * Un nombre, jamais NaN, lu à la française.
 *
 * Les montants d'un export comptable arrivent écrits pour être lus :
 * « 2 056,00 € », avec un séparateur de milliers qui peut être une espace
 * ordinaire, insécable ou fine. `parseFloat` s'arrête au premier espace et lit
 * 2 au lieu de 2 056 — une erreur d'un facteur mille, silencieuse.
 */
const montant = (v, defaut = 0) => {
  const t = String(v ?? '')
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[€$£]/g, '')
    .replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : defaut;
};

/** Prix hors taxes à partir d'un prix toutes taxes comprises. */
export const htDepuisTtc = (ttc, tva = TVA_DEFAUT) => (tva > -1 ? ttc / (1 + tva) : ttc);

/** Et l'inverse. */
export const ttcDepuisHt = (ht, tva = TVA_DEFAUT) => ht * (1 + tva);

/**
 * Prix unitaire tiré d'un relevé de ventes.
 *
 * Les rapports de place de marché donnent un chiffre d'affaires et un nombre
 * d'unités : leur quotient est le prix réellement pratiqué. Sur une place de
 * marché grand public il est **toutes taxes comprises**, ce que l'appelant doit
 * savoir pour le ramener hors taxes avant de l'inscrire à un devis.
 *
 * @returns {number|null} prix unitaire, `null` si le quotient n'a pas de sens
 */
export function prixDepuisVentes(ventes, unites) {
  const ca = montant(ventes);
  const n = montant(unites);
  if (!(ca > 0) || !(n > 0)) return null;
  return ca / n;
}

/**
 * Prix d'un article, ramené hors taxes.
 *
 * `champ` vaut `prixAchat` ou `prixVente` : ce que l'agence paie, ou ce
 * qu'elle facture. **Les confondre fausse la marge dans un sens ou dans
 * l'autre** — un prix de vente relevé dans ses propres ventes, repris comme
 * prix d'achat, se verrait appliquer une marge qu'il contient déjà.
 *
 * @param {object} article
 * @param {string} [champ='prixAchat']
 * @param {number} [tvaDefaut]
 * @returns {number} prix hors taxes, 0 si ce prix-là n'est pas connu
 */
export function prixHt(article, champ = 'prixAchat', tvaDefaut = TVA_DEFAUT) {
  const p = montant(article?.[champ]);
  if (!(p > 0)) return 0;
  const ttc = champ === 'prixVente' ? article.venteTtc : article.achatTtc;
  return ttc ? htDepuisTtc(p, montant(article.tva, tvaDefaut)) : p;
}

/**
 * Provenance du prix retenu pour un article.
 *
 * Le prix de vente l'emporte quand il existe : c'est celui que l'agence
 * pratique, et il n'a pas à être recalculé depuis un coût d'achat.
 */
export function provenancePrix(article) {
  const vente = montant(article?.prixVente);
  const achat = montant(article?.prixAchat);
  if (!(vente > 0) && !(achat > 0)) return 'aucune';
  const source = vente > 0 ? article.sourceVente : article.sourceAchat;
  const p = source?.type;
  return PROVENANCES[p] ? p : 'saisi';
}

/**
 * Une ligne de devis.
 *
 * @param {object} article référence du catalogue, prix compris
 * @param {number} quantite
 * @param {object} [options]
 * @param {number} [options.marge] marge appliquée au prix d'achat
 * @param {number} [options.tva]
 */
export function ligne(article, quantite, options = {}) {
  const marge = options.marge ?? MARGE_COMMERCIALE;
  const achat = prixHt(article, 'prixAchat', options.tva);
  const venteSaisie = prixHt(article, 'prixVente', options.tva);
  // Un prix de vente connu s'impose ; sinon la marge le construit sur l'achat.
  const vente = venteSaisie > 0 ? venteSaisie : achat * (1 + marge);
  const q = Math.max(0, montant(quantite));
  return {
    article,
    quantite: q,
    achatHt: achat,
    venteHt: vente,
    totalHt: vente * q,
    // Une marge n'a de sens que si l'on connaît le coût d'achat.
    margeReelle: achat > 0 ? (vente - achat) / achat : null,
    provenance: provenancePrix(article),
  };
}

/**
 * Devis complet.
 *
 * @param {object[]} lignes issues de `ligne()`
 * @param {object} [reglages]
 * @param {number} [reglages.heures] main-d'œuvre, en heures
 * @param {number} [reglages.tauxHoraire] en euros hors taxes
 * @param {number} [reglages.remise] part retirée du total matériel
 * @param {number} [reglages.tva]
 */
export function devis(lignes, reglages = {}) {
  const tva = reglages.tva ?? TVA_DEFAUT;
  const remise = Math.min(1, Math.max(0, montant(reglages.remise)));

  const materielBrut = (lignes || []).reduce((s, l) => s + l.totalHt, 0);
  const montantRemise = materielBrut * remise;
  const materielHt = materielBrut - montantRemise;
  const mainOeuvreHt = Math.max(0, montant(reglages.heures))
    * Math.max(0, montant(reglages.tauxHoraire));

  const totalHt = materielHt + mainOeuvreHt;
  const montantTva = totalHt * tva;

  // Ce qui manque pour que le devis soit complet : une ligne sans prix n'est
  // pas une ligne à zéro euro, c'est une ligne qu'on a oublié de chiffrer.
  const sansPrix = (lignes || []).filter((l) => l.provenance === 'aucune');
  const releves = (lignes || []).filter((l) => l.provenance === 'releve');

  return {
    lignes: lignes || [],
    materielBrut,
    remise,
    montantRemise,
    materielHt,
    mainOeuvreHt,
    totalHt,
    tva,
    montantTva,
    totalTtc: totalHt + montantTva,
    sansPrix,
    releves,
    complet: sansPrix.length === 0,
  };
}

/**
 * Réserves à joindre au devis — vides quand tout est sourcé et chiffré.
 */
export function reservesDevis(d) {
  const reserves = [];
  if (d.sansPrix.length) {
    reserves.push(`${d.sansPrix.length} ligne${d.sansPrix.length > 1 ? 's' : ''} sans prix : `
      + `${d.sansPrix.map((l) => l.article.reference || l.article.nom || '?').join(', ')}. `
      + 'Le total ci-dessous est donc incomplet.');
  }
  if (d.releves.length) {
    const dates = [...new Set(d.releves
      .map((l) => (l.article.sourceVente || l.article.sourceAchat)?.date)
      .filter(Boolean))];
    reserves.push(`${d.releves.length} prix relevé${d.releves.length > 1 ? 's' : ''} chez un `
      + `revendeur${dates.length ? ` (${dates.join(', ')})` : ''} : à confirmer auprès du `
      + 'distributeur avant engagement — un tarif bouge.');
  }
  return reserves;
}

/** Montant en euros, à la française. */
export const euros = (v) => `${fr(v, 2)} €`;
