/**
 * Page de présentation : comprendre avant de chiffrer.
 *
 * Elle ne calcule pas d'installation — c'est le rôle de la page d'étude. Elle
 * explique ce que l'outil fait, montre ce qu'une caméra permet vraiment de
 * voir, et renvoie vers les deux : l'étude et les caméras.
 *
 * Les deux destinations sont réglables dans `catalogue.json`. Par défaut elles
 * restent sur le site qui sert la page : rien à éditer quand tout tient sur un
 * seul domaine.
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
 * Adresses par défaut, relatives à la racine du site.
 *
 * Relatives, et non ancrées à la racine : les deux pages se trouvent ainsi
 * qu'elles soient sur le domaine, sous un sous-dossier d'hébergement de
 * pages, ou dans un cadre. `catalogue.json` — posé à côté de la page et relu
 * à chaque ouverture — porte les adresses complètes quand il le faut.
 */
const OUTIL = '../devis/';
const BOUTIQUE = '/';

/** Catalogue de secours, embarqué à la fabrication. */
const CATALOGUE_EMBARQUE = globalThis.__catalogue || null;

/**
 * Caméra servant d'exemple à l'échelle des paliers.
 *
 * C'est une caméra réelle, avec son champ annoncé par Hikvision : le
 * DS-2CD2T86G2-4I, le 4 K AcuSense le plus courant. L'illustration figure
 * au-dessus des fiches produits, et un exemple calculé sur un capteur
 * supposé y annoncerait d'autres distances que la fiche du même modèle,
 * trois centimètres plus bas.
 */
const EXEMPLE = {
  reference: 'Hikvision DS-2CD2T86G2-4I', modele: '4 K AcuSense à objectif 4 mm',
  resH: 3840, capteur: '1/1.8"', focale: 4, angleH: 87,
};

const ech = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** Charge le catalogue posé à côté de la page, sinon celui embarqué. */
async function chargerCatalogue() {
  // Depuis le disque, `fetch` est refusé et le refus s'inscrit dans la console
  // quoi qu'on l'attrape : sur une page publique, autant aller droit au but.
  // Collée dans une page existante, la page porte ses données avec elle :
  // aller les chercher à côté d'elle réclamerait un fichier qui n'y est pas,
  // et laisserait une erreur rouge dans la console du visiteur.
  if (!globalThis.__ngsIntegre && window.location.protocol !== 'file:') {
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
  $('#legende-dori').textContent = `Distances pour un ${EXEMPLE.modele} `
    + `(${EXEMPLE.reference}), le plus courant — il embrasse `
    + `${fr(a.largeur)} m de large à ${DISTANCE_VITRINE} m. Une caméra plus `
    + 'ouverte voit plus large mais moins loin ; une caméra plus serrée, '
    + 'l\'inverse. C\'est tout le travail de l\'étude que de trancher.';
}

/* ------------------------------------------------------------ produits */

/**
 * Ce que la caméra permet, et jusqu'où.
 *
 * Trois cas, et non un seul : un objectif qui ne zoome pas ne se règle pas
 * « au maximum » ; et quand l'éclairage s'arrête avant que les pixels ne
 * manquent, répéter deux fois la même distance donnerait l'air d'une panne.
 */
function portee(a) {
  const ou = a.ptz && a.zoom > 1.05 ? 'Au zoom maximal, l' : 'L';
  if (a.reconnaissance >= a.plafond - 0.05) {
    return `${ou}'image reste exploitable pour identifier quelqu'un sur toute
      la portée de son éclairage, <b>${ech(fr(a.plafond, 0))} m</b>. Au-delà,
      ce sont l'éclairage et l'air qui décident, plus les pixels.`;
  }
  return `${ou}a caméra reconnaît une personne jusqu'à
    <b>${ech(fr(a.reconnaissance))} m</b>, et identifie un inconnu jusqu'à
    <b>${ech(fr(a.identification))} m</b>.`;
}

/** Les vignettes produits, ou le mot qui explique leur absence. */
function afficherProduits(catalogue) {
  const boutique = destination('__ngsBoutique', catalogue?.boutique, BOUTIQUE);
  const produits = produitsAffichables(catalogue);

  $('#intro-produits').textContent = produits.length
    ? 'Les portées ci-dessous sont calculées sur l\'optique de chaque modèle, '
      + 'pas relevées sur une fiche commerciale.'
    : 'La sélection est en cours de constitution.';

  $('#produits').innerHTML = produits.map((p) => {
    const a = argumentaire(p);
    const c = capacites(p);
    // Une fiche sans adresse reste une fiche : elle informe, elle ne mène
    // nulle part. Un lien vide, lui, déçoit le clic.
    const [ouvre, ferme] = p.url
      ? [`<a class="produit" href="${ech(p.url)}">`, '</a>']
      : ['<div class="produit sans-lien">', '</div>'];
    return `${ouvre}
      ${p.image ? `<img src="${ech(p.image)}" alt="" loading="lazy">` : ''}
      <span class="nom">${ech(p.reference)}</span>
      ${a ? `<span class="optique">${ech(a.champ)}</span>
        <span class="portee">${portee(a)}${c.estSuppose ? '*' : ''}</span>
        ${a.ptz ? `<span class="note-fiche">Caméra mobile : elle ne regarde
          qu'une direction à la fois.</span>` : ''}`
    : '<span class="optique">Caractéristiques optiques sur la fiche produit.</span>'}
      ${p.prixTtc > 0 ? `<span class="prix">${ech(euros(p.prixTtc))} TTC</span>` : ''}
    ${ferme}`;
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
  // Libellés neutres : ils conviennent que les deux pages soient sur un seul
  // site ou sur deux domaines.
  $('#pied-liens').innerHTML = `<a href="${ech(boutique)}">Nos caméras</a>
    · <a href="${ech(destination('__ngsOutil', catalogue?.outil, OUTIL))}"
      >Estimer mon installation</a>`;
}

/* ------------------------------------------------------------ démarrage */

/**
 * Les deux destinations, par ordre de priorité.
 *
 * Un bloc collé dans un site porte son catalogue sur une seule ligne, longue
 * de dizaines de milliers de caractères : y retrouver une adresse relève de
 * l'exploit. Le bloc les redéclare donc en clair, en tête, et ce sont
 * celles-là qui gagnent.
 */
const destination = (cle, depuisCatalogue, defaut) => (
  globalThis[cle] || depuisCatalogue || defaut
);

async function demarrer() {
  const catalogue = await chargerCatalogue();
  const outil = destination('__ngsOutil', catalogue?.outil, OUTIL);
  $$('#lien-outil, #lien-outil-bas').forEach((a) => { a.href = outil; });

  dessinerEchelle();
  afficherProduits(catalogue);
}

demarrer();
