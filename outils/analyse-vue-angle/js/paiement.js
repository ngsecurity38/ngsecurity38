/**
 * Les moyens de paiement acceptés, tels qu'ils s'affichent sur un document.
 *
 * Une ligne de texte « Par virement bancaire » se lit ; une rangée de
 * pictogrammes se voit. Sur une facture, le client cherche d'abord comment
 * payer : autant que ce soit la première chose qui saute aux yeux.
 *
 * LES PICTOGRAMMES SONT LES NÔTRES, PAS DES MARQUES. Les logos Visa,
 * Mastercard ou PayPal sont des marques déposées : leurs propriétaires en
 * publient les fichiers officiels et en fixent l'usage. On ne les redessine
 * pas de mémoire — un logo approximatif se voit, et il n'a rien à faire sur
 * un document commercial. Ce module trace donc des symboles neutres, et
 * laisse la place : dès qu'un fichier officiel est déposé dans
 * `agence.logosPaiement`, il remplace le pictogramme.
 *
 * Nommer PayPal en toutes lettres, en revanche, ne pose aucune question :
 * c'est le nom du service, et il faut bien le dire.
 *
 * Les dessins sont en trait, d'une seule couleur, et tiennent au noir et
 * blanc : une facture s'imprime souvent sur une machine de bureau.
 */

import { echapper } from './format.js';

/*
 * Chaque symbole tient dans une boîte de 28 x 20, en `currentColor` : il
 * prend la couleur du texte autour, et reste lisible sur un fax comme sur
 * un écran.
 */
const CARTE = `<svg viewBox="0 0 28 20" aria-hidden="true">
  <rect x="1" y="2.5" width="26" height="15" rx="2.5" fill="none"
    stroke="currentColor" stroke-width="1.4"/>
  <path d="M1 7.5h26" stroke="currentColor" stroke-width="2.6"/>
  <rect x="4" y="11" width="5" height="3.5" rx="0.8" fill="currentColor"/>
</svg>`;

const VIREMENT = `<svg viewBox="0 0 28 20" aria-hidden="true">
  <path d="M14 2.2 2.5 7.5h23L14 2.2Z" fill="currentColor"/>
  <path d="M5 9v6M11 9v6M17 9v6M23 9v6" stroke="currentColor" stroke-width="1.6"/>
  <path d="M2 17.3h24" stroke="currentColor" stroke-width="1.8"/>
</svg>`;

const ENLIGNE = `<svg viewBox="0 0 28 20" aria-hidden="true">
  <rect x="2" y="4" width="24" height="12.5" rx="2.5" fill="none"
    stroke="currentColor" stroke-width="1.4"/>
  <path d="M18.5 10.2h5.5" stroke="currentColor" stroke-width="1.4"/>
  <circle cx="16" cy="10.2" r="1.7" fill="currentColor"/>
  <path d="M2 8h9" stroke="currentColor" stroke-width="1.4"/>
</svg>`;

const CHEQUE = `<svg viewBox="0 0 28 20" aria-hidden="true">
  <rect x="1.5" y="3.5" width="25" height="13" rx="1.5" fill="none"
    stroke="currentColor" stroke-width="1.4"/>
  <path d="M4.5 8h11M4.5 11h7" stroke="currentColor" stroke-width="1.3"/>
  <path d="M17 13.5c2-3.5 3.5-3.5 5.5 0" fill="none" stroke="currentColor"
    stroke-width="1.3"/>
</svg>`;

const ESPECES = `<svg viewBox="0 0 28 20" aria-hidden="true">
  <rect x="1.5" y="4" width="25" height="12" rx="1.5" fill="none"
    stroke="currentColor" stroke-width="1.4"/>
  <circle cx="14" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path d="M4.5 10h1.5M22 10h1.5" stroke="currentColor" stroke-width="1.4"/>
</svg>`;

/**
 * Les moyens connus de l'outil.
 *
 * `label` est ce que lit le client, en un mot : la rangée tient alors sur une
 * ligne, et une facture gagne une ligne comme elle peut. Le nom du service
 * est donné quand il y en a un — un client qui lit « Paiement en ligne » se
 * demande lequel.
 */
export const MOYENS = {
  virement: { label: 'Virement', symbole: VIREMENT },
  carte: { label: 'Carte', symbole: CARTE },
  paypal: { label: 'PayPal', symbole: ENLIGNE },
  cheque: { label: 'Chèque', symbole: CHEQUE },
  especes: { label: 'Espèces', symbole: ESPECES },
};

/** Ce qu'une agence accepte, à défaut d'avoir répondu : le virement. */
export const MOYENS_DEFAUT = ['virement'];

/**
 * Les moyens retenus par l'agence, dans l'ordre où elle les a écrits.
 *
 * Un nom inconnu est écarté plutôt que dessiné au hasard : mieux vaut une
 * rangée courte qu'un symbole qui ne veut rien dire.
 */
export function moyensAcceptes(agence) {
  const liste = Array.isArray(agence?.paiements) && agence.paiements.length
    ? agence.paiements : MOYENS_DEFAUT;
  return liste.map(String).filter((cle) => MOYENS[cle]);
}

/**
 * La rangée de moyens de paiement, en HTML.
 *
 * Un logo officiel déposé dans `agence.logosPaiement[cle]` — une image
 * complète, `data:` de préférence pour que le document reste autonome —
 * prend la place du pictogramme. Le nom, lui, reste écrit dessous : un logo
 * seul ne se lit pas en noir et blanc, et ne se lit pas du tout par un
 * lecteur d'écran.
 */
export function badgesPaiement(agence) {
  const logos = (agence && agence.logosPaiement) || {};
  const moyens = moyensAcceptes(agence);
  if (!moyens.length) return '';
  return `<div class="moyens">${moyens.map((cle) => {
    const m = MOYENS[cle];
    const image = typeof logos[cle] === 'string' && logos[cle]
      ? `<img src="${echapper(logos[cle])}" alt="">`
      : m.symbole;
    return `<span class="moyen">${image}<b>${echapper(m.label)}</b></span>`;
  }).join('')}</div>`;
}
