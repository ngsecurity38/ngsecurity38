/**
 * Le catalogue de vente : ce que l'agence facture, prêt à poser sur une ligne.
 *
 * À ne pas confondre avec `catalogue.js`, qui tient les caméras et leurs
 * optiques pour l'étude. Celui-ci ne connaît que des articles, des unités et
 * des prix : c'est le tarif de l'agence, pas son matériel.
 *
 * Retaper une désignation à chaque facture, c'est trois fautes de frappe par
 * mois et deux prix qui divergent. Le catalogue tient la désignation, la
 * référence, l'unité et le prix ; la facture en prend une copie. Une copie,
 * et non un lien : une facture émise il y a six mois doit continuer de dire
 * ce qu'elle disait, même si le tarif a bougé depuis.
 *
 * Aucun prix n'est inventé ici. Ce qui n'a pas été relevé reste vide, et
 * l'article s'ajoute quand même — la désignation et l'unité sont déjà du
 * temps gagné, et le montant manquant se voit au lieu de passer pour un
 * zéro.
 *
 * Module pur (aucune dépendance au DOM), testé sous Node.
 */

import { arrondir } from './format.js';

/** Comment se dit une unité, en toutes lettres. */
export const UNITES = {
  u: 'à l\'unité',
  m: 'au mètre',
  h: 'de l\'heure',
  j: 'par jour',
  an: 'par an',
  forfait: 'au forfait',
  touret: 'par touret de 305 m',
  couronne: 'par couronne de 100 m',
};

/** Ce qu'un catalogue vaut quand il n'y en a pas. */
export const catalogueVide = () => ({
  maj: '', remise: 0, tva: 0.2, familles: {}, articles: [],
});

/**
 * Un catalogue lu d'un fichier, complété de ce qui lui manque.
 *
 * Un fichier retouché à la main perd facilement un champ. Mieux vaut un
 * article sans unité qu'un écran vide.
 */
export function assainirCatalogue(lu) {
  const c = { ...catalogueVide(), ...(lu || {}) };
  c.familles = (lu && lu.familles) || {};
  c.articles = Array.isArray(c.articles) ? c.articles.filter((a) => a && a.cle) : [];
  c.remise = Number.isFinite(Number(c.remise)) ? Number(c.remise) : 0;
  c.tva = Number.isFinite(Number(c.tva)) ? Number(c.tva) : 0.2;
  return c;
}

/**
 * Un nombre, ou rien.
 *
 * `Number(null)` vaut zéro. Un champ laissé à `null` parce que le prix n'est
 * pas connu passerait donc pour un article gratuit, et la facture sortirait
 * juste en apparence. Ici, vide veut dire vide.
 */
const chiffre = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Le prix auquel l'agence facture un article.
 *
 * Trois cas, dans cet ordre :
 *
 * - `prixVente` renseigné : c'est le prix, la remise ne s'y applique pas —
 *   il la contient déjà, ou n'en relève pas, comme un taux horaire ;
 * - `marche` renseigné : le prix de référence, moins la remise de l'agence.
 *   C'est la règle maison, et c'est déjà ce que le client a vu sur son devis ;
 * - ni l'un ni l'autre : `null`. Pas zéro. Un article non chiffré n'est pas
 *   un article gratuit, et les confondre fait sortir une facture fausse.
 */
export function prixVente(article, remise = 0) {
  const vente = chiffre(article?.prixVente);
  if (vente !== null) return arrondir(vente, 2);
  const marche = chiffre(article?.marche);
  if (marche === null) return null;
  const r = Math.min(1, Math.max(0, Number(remise) || 0));
  return arrondir(marche * (1 - r), 2);
}

/** Les articles qu'il reste à chiffrer, pour que l'écran puisse le dire. */
export function articlesSansPrix(catalogue) {
  const c = assainirCatalogue(catalogue);
  return c.articles.filter((a) => prixVente(a, c.remise) === null);
}

/**
 * Le texte sur lequel une recherche porte.
 *
 * Accents retirés : personne ne tape « caméra » avec son accent dans un
 * champ de recherche, et personne ne devrait avoir à le faire.
 */
const cherchable = (a) => [a.designation, a.reference, a.cle, a.famille]
  .filter(Boolean).join(' ')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase();

/**
 * Chercher un article.
 *
 * Tous les mots saisis doivent se retrouver, dans n'importe quel ordre :
 * « camera pano » et « pano camera » tombent sur la même. Une requête vide
 * rend tout le catalogue, dans l'ordre du fichier — c'est la liste de départ.
 *
 * @param {object} catalogue
 * @param {string} [requete]
 * @param {string} [famille] restreindre à une famille
 * @returns {object[]}
 */
export function chercher(catalogue, requete = '', famille = '') {
  const c = assainirCatalogue(catalogue);
  const mots = String(requete || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().split(/\s+/).filter(Boolean);
  return c.articles.filter((a) => {
    if (famille && a.famille !== famille) return false;
    if (!mots.length) return true;
    const texte = cherchable(a);
    return mots.every((m) => texte.includes(m));
  });
}

/**
 * Une ligne de facture, tirée d'un article du catalogue.
 *
 * La référence part en précision plutôt qu'en désignation : sur la facture,
 * le client lit d'abord ce qu'il a acheté, et ensuite seulement le numéro de
 * modèle. Et l'unité y figure quand elle n'est pas l'évidence — « 181 m » se
 * relit, « 181 » se discute.
 */
export function ligneDepuisArticle(article, catalogue = {}, quantite = 1) {
  const c = assainirCatalogue(catalogue);
  const prix = prixVente(article, c.remise);
  const details = [];
  if (article.reference) details.push(article.reference);
  if (article.unite && !['u', 'forfait'].includes(article.unite)) {
    details.push(`Prix ${UNITES[article.unite] || `par ${article.unite}`}`);
  }
  return {
    designation: article.designation || '',
    detail: details.join(' — '),
    quantite: Number(quantite) || 1,
    prixUnitaire: prix === null ? 0 : prix,
    tva: Number.isFinite(Number(article.tva)) ? Number(article.tva) : c.tva,
    cle: article.cle,
    // Ce que l'écran doit signaler : la ligne est posée, le montant reste dû.
    aChiffrer: prix === null,
  };
}
