/**
 * Page de présentation, pour la boutique (ngsecurity38.com).
 *
 * Elle ne calcule pas d'installation : c'est le rôle de l'outil d'étude, sur
 * l'espace professionnel. Elle explique ce que l'outil fait, montre ce qu'une
 * caméra permet vraiment de voir, et renvoie vers les deux — l'étude et les
 * produits.
 *
 * Les chiffres de l'échelle et des fiches produits sortent des mêmes fonctions
 * optiques que l'outil d'étude. Une vitrine qui annonce d'autres portées que
 * l'étude est une vitrine qui ment à moitié.
 */

import { $, $$ } from './dom.js';
import { fr } from './format.js';
import { SEUILS_DORI } from './optique.js';
// Le même formatage de montant que le devis : « 289,90 € », jamais « 289,9 € ».
import { euros } from './prix.js';
import {
  DISTANCE_VITRINE, USAGES, capacites, argumentaire, produitsAffichables,
  reservesCatalogue,
} from './boutique.js';

/**
 * Adresses à régler avant mise en ligne.
 *
 * Elles sont ici, en clair et en tête de fichier, pour être trouvées sans
 * fouiller. `catalogue.json`, posé à côté de la page, peut les redéfinir : la
 * page se met alors à jour sans reconstruction.
 */
const OUTIL = 'https://ngsecurity38.fr/outils/devis/';
const BOUTIQUE = 'https://ngsecurity38.com/';

/** Catalogue de secours, embarqué à la fabrication. */
const CATALOGUE_EMBARQUE = globalThis.__catalogue || null;

/**
 * Caméra servant d'exemple à l'échelle des paliers.
 *
 * Elle n'est pas présentée comme un produit : elle sert à montrer l'ordre de
 * grandeur, et la légende dit laquelle c'est. Sans cela, les distances
 * affichées ne voudraient rien dire.
 */
const EXEMPLE = { reference: 'exemple', url: '#', resH: 3840, focale: 4 };

const ech = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** Charge le catalogue posé à côté de la page, sinon celui embarqué. */
async function chargerCatalogue() {
  // Depuis le disque, `fetch` est refusé et le refus s'inscrit dans la console
  // quoi qu'on l'attrape : sur une page publique, autant aller droit au but.
  if (window.location.protocol !== 'file:') {
    try {
      const r = await fetch('catalogue.json', { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {
      // Fichier absent : le catalogue embarqué fera l'affaire.
    }
  }
  return CATALOGUE_EMBARQUE;
}

/* --------------------------------------------------------- échelle DORI */

/**
 * L'échelle des quatre paliers, dessinée à l'échelle des distances.
 *
 * Une barre par palier, longue comme la distance à laquelle il tient encore.
 * Le rapport entre « repérer » et « identifier » — un facteur dix — se voit
 * alors d'un coup d'œil, là où un tableau de chiffres se lit.
 */
function dessinerEchelle() {
  const c = capacites(EXEMPLE);
  const ordre = ['detection', 'observation', 'reconnaissance', 'identification'];
  const max = c.portees.detection;

  const L = 720;
  const hauteurLigne = 46;
  // De quoi loger « reconnaître quelqu'un que vous connaissez » sans que la
  // légende ne passe sous sa propre barre.
  const marge = 230;
  const H = ordre.length * hauteurLigne + 26;

  const barres = ordre.map((cle, i) => {
    const d = c.portees[cle];
    const y = i * hauteurLigne + 16;
    const l = Math.max(2, ((L - marge - 64) * d) / max);
    return `<g>
      <text x="0" y="${y + 15}" font-size="13" font-weight="600" fill="#1a1d23"
        >${ech(SEUILS_DORI[cle].label)}</text>
      <text x="0" y="${y + 31}" font-size="11" fill="#5b6472"
        >${ech(USAGES[cle])}</text>
      <rect x="${marge}" y="${y + 4}" width="${l}" height="20" rx="4"
        fill="${['#8a9099', '#5b6472', '#9d0c24', '#c8102e'][i]}"/>
      <text x="${marge + l + 8}" y="${y + 19}" font-size="13" font-weight="600"
        fill="#1a1d23">${ech(fr(d))} m</text>
    </g>`;
  }).join('');

  $('#schema-dori').innerHTML = `<svg viewBox="0 0 ${L} ${H}" role="img"
    aria-label="Distances auxquelles chaque palier est encore tenu">
    ${barres}
  </svg>`;

  const a = argumentaire(EXEMPLE);
  $('#legende-dori').textContent = 'Distances pour une caméra 4K à '
    + `${a.optique}, l'exemple le plus courant — elle embrasse `
    + `${fr(a.largeur)} m de large à ${DISTANCE_VITRINE} m. Une caméra plus `
    + 'ouverte voit plus large mais moins loin ; une caméra plus serrée, '
    + 'l\'inverse. C\'est tout le travail de l\'étude que de trancher.';
}

/* ------------------------------------------------------------ produits */

/** Les vignettes produits, ou le mot qui explique leur absence. */
function afficherProduits(catalogue) {
  const boutique = catalogue?.boutique || BOUTIQUE;
  const produits = produitsAffichables(catalogue);

  $('#intro-produits').textContent = produits.length
    ? 'Les portées ci-dessous sont calculées sur l\'optique de chaque modèle, '
      + 'pas relevées sur une fiche commerciale.'
    : 'La sélection est en cours de constitution.';

  $('#produits').innerHTML = produits.map((p) => {
    const a = argumentaire(p);
    const c = capacites(p);
    return `<a class="produit" href="${ech(p.url)}">
      ${p.image ? `<img src="${ech(p.image)}" alt="" loading="lazy">` : ''}
      <span class="nom">${ech(p.reference)}</span>
      ${a ? `<span class="optique">${ech(a.champ)}</span>
        <span class="portee">Reconnaît une personne jusqu'à
          <b>${ech(fr(a.reconnaissance))} m</b>, identifie un inconnu jusqu'à
          <b>${ech(fr(a.identification))} m</b>${c.estSuppose ? '*' : ''}</span>`
    : '<span class="optique">Caractéristiques optiques sur la fiche produit.</span>'}
      ${p.prixTtc > 0 ? `<span class="prix">${ech(euros(p.prixTtc))} TTC</span>` : ''}
    </a>`;
  }).join('');

  const reserves = reservesCatalogue(catalogue);
  const suppose = produits.some((p) => capacites(p)?.estSuppose);
  if (suppose) {
    reserves.push('* Portées calculées en supposant un capteur 1/2.8", format '
      + 'courant de ces caméras. La fiche produit fait foi.');
  }
  $('#reserves-produits').innerHTML = reserves
    .map((r) => `<li>${ech(r)}</li>`).join('');

  for (const id of ['#lien-boutique']) $(id).href = boutique;
  $('#pied-liens').innerHTML = `<a href="${ech(boutique)}">Retour à la boutique</a>
    · <a href="${ech(catalogue?.outil || OUTIL)}">Espace professionnels</a>`;
}

/* ------------------------------------------------------------ démarrage */

async function demarrer() {
  const catalogue = await chargerCatalogue();
  const outil = catalogue?.outil || OUTIL;
  $$('#lien-outil, #lien-outil-bas').forEach((a) => { a.href = outil; });

  dessinerEchelle();
  afficherProduits(catalogue);
}

demarrer();
