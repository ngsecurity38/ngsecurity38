/**
 * Le synoptique technique : qui se raccorde à quoi, et par combien de mètres.
 *
 * Le plan d'implantation dit OÙ sont les caméras. Il ne dit pas comment
 * elles remontent. Sur un site de cent mètres où trois coffrets se
 * cascadent, c'est pourtant la question que pose l'électricien qui reprend
 * le chantier, et celle que pose le client quand il demande ce qui tombe si
 * un coffret tombe.
 *
 * Le schéma se lit de droite à gauche : les équipements, leur coffret, le
 * local. Chaque trait porte sa longueur, et vire au rouge si la liaison
 * dépasse ce qu'une paire torsadée tient. Rien n'y est dessiné à la main —
 * tout vient du métré de l'étude.
 *
 * Module pur : il rend une chaîne SVG, sans DOM. Testé sous Node.
 */

import { bilanEtude } from './etude-plan.js';
import { LIAISON_PERMANENTE } from './cable.js';
import { fr, echapper } from './format.js';

const COULEUR_LIEN = {
  ok: '#9aa3ae',
  limite: '#b8860b',
  'hors-norme': '#c8102e',
};

const LARGEUR = 940;
/*
 * Le schéma est réduit à la largeur d'une page A4 : une ligne de 26 px y
 * tombait à six points, illisible sur papier. Deux lignes plus hautes, plus
 * grasses, et le modèle sous le rôle plutôt qu'à côté — le schéma s'allonge,
 * mais il se lit sur le chantier.
 */
const HAUT_LIGNE = 34;
const ESPACE_GROUPE = 20;
const X_LOCAL = 18;
const L_LOCAL = 168;
const X_COFFRET = 300;
const L_COFFRET = 196;
const X_EQUIP = 566;
const L_EQUIP = 356;

const ech = echapper;

/*
 * Le SVG ne sait pas couper une ligne. On compte donc les caractères, à la
 * largeur moyenne près : mieux vaut une désignation abrégée qu'un modèle de
 * caméra imprimé par-dessus le rôle qu'il décrit.
 */
const couper = (t, max) => {
  const s = String(t || '');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

/** Coupe un texte en lignes d'au plus `max` caractères, aux espaces. */
function lignesDe(texte, max, limite = 2) {
  const mots = String(texte || '').split(/\s+/).filter(Boolean);
  const out = [];
  let courante = '';
  for (const mot of mots) {
    if (!courante) courante = mot;
    else if (`${courante} ${mot}`.length <= max) courante += ` ${mot}`;
    else { out.push(courante); courante = mot; }
    if (out.length === limite) break;
  }
  if (out.length < limite && courante) out.push(courante);
  if (out.length === limite && mots.join(' ').length > out.join(' ').length) {
    out[limite - 1] = couper(`${out[limite - 1]}…`, max);
  }
  return out;
}

/** Le texte porté par un équipement : son repère, son rôle, son modèle. */
function etiquette(etude, cle) {
  const c = etude.cameras.find((x) => x.cle === cle);
  if (c) {
    const m = etude.modeles[c.modele];
    return {
      titre: `${c.cle} · ${c.role || 'caméra'}`,
      // Le synoptique nomme le modèle, pas son optique : les millimètres et
      // les suffixes de révision sont dans le tableau des caméras, et ici
      // ils passeraient par-dessus le rôle qu'ils sont censés préciser.
      detail: m ? m.reference.replace('Hikvision ', '').replace(/\s*\(.*$/, '') : '',
    };
  }
  const a = (etude.acces || []).find((x) => x.cle === cle);
  if (a) {
    return { titre: `${a.cle} · ${a.nom}`, detail: a.verrouillage || 'contrôle d\'accès' };
  }
  const o = (etude.autres || []).find((x) => x.cle === cle);
  if (o) return { titre: `${o.cle} · ${o.designation}`, detail: '' };
  return { titre: cle, detail: '' };
}

/**
 * Le squelette du schéma : les groupes, dans l'ordre où on les empile.
 *
 * Un équipement sans coffret remonte au local : il forme son propre groupe,
 * en dernier, parce que c'est l'exception et qu'une exception se lit mieux
 * en bas qu'au milieu.
 */
export function groupes(etude, liaisons) {
  /*
   * Un accès ne tire pas un câble mais cinq — alimentation du verrouillage,
   * lecteur, bouton, contact de porte, platine — que le métré repère
   * « A1·V », « A1·L »… On les regroupe et on retient la plus longue : c'est
   * elle qui décide si la liaison passe ou non.
   */
  const desc = (cle) => {
    const liens = liaisons.filter((l) => !l.montante
      && (l.repere === cle || String(l.repere).startsWith(`${cle}·`)));
    if (!liens.length) return null;
    const pire = liens.reduce((a, b) => (b.longueur > a.longueur ? b : a));
    return { ...pire, cables: liens.length };
  };

  const rattaches = (coffret) => [
    ...etude.cameras, ...(etude.acces || []), ...(etude.autres || []),
  ].filter((x) => (x.coffret || null) === coffret)
    .map((x) => ({ cle: x.cle, liaison: desc(x.cle) || null }));

  const liste = (etude.coffrets || []).map((r) => ({
    cle: r.cle,
    nom: r.nom,
    contenu: r.contenu || '',
    depuis: r.depuis || 'local',
    montante: liaisons.find((l) => l.repere === r.cle && l.montante) || null,
    equipements: rattaches(r.cle),
  }));

  const directs = rattaches(null);
  if (directs.length) {
    liste.push({
      cle: null, nom: 'Raccordé directement au local', contenu: '',
      depuis: 'local', montante: null, equipements: directs,
    });
  }
  return liste.filter((g) => g.equipements.length || g.cle);
}

const boite = (x, y, l, h, attrs = '') => `<rect x="${x}" y="${y}" width="${l}" height="${h}" rx="7" ${attrs}/>`;

/**
 * Dessine le synoptique.
 *
 * @param {object} etude
 * @returns {string} un SVG complet, autonome
 */
export function synoptique(etude) {
  const b = bilanEtude(etude);
  const gs = groupes(etude, b.liaisons);

  /* --- on empile les groupes et on retient la position de chaque ligne --- */
  let y = 54;
  const rangs = [];
  for (const g of gs) {
    const haut = g.equipements.length * HAUT_LIGNE;
    rangs.push({ groupe: g, y, haut, milieu: y + haut / 2 });
    y += haut + ESPACE_GROUPE;
  }
  const hauteur = Math.max(y + 24, 220);
  const yLocal = 54;
  const hLocal = Math.max(hauteur - 100, 120);
  const milieuLocal = yLocal + hLocal / 2;

  const traits = [];
  const blocs = [];

  /* ------------------------------------------------------- le local */
  const nvr = etude.equipements.enregistreur;
  blocs.push(`<g>
    ${boite(X_LOCAL, yLocal, L_LOCAL, hLocal, 'fill="#fff" stroke="#1a1d23" stroke-width="2"')}
    <text x="${X_LOCAL + 12}" y="${yLocal + 22}" class="t-titre">LOCAL TECHNIQUE</text>
    <text x="${X_LOCAL + 12}" y="${yLocal + 38}" class="t-det">${ech(
  etude.local && etude.local.etage ? 'à l\'étage' : 'rez-de-chaussée')}</text>
    ${boite(X_LOCAL + 12, milieuLocal - 42, L_LOCAL - 24, 46, 'fill="#1a1d23"')}
    <text x="${X_LOCAL + 22}" y="${milieuLocal - 24}" class="t-blanc">Enregistreur ${nvr.canaux} voies</text>
    <text x="${X_LOCAL + 22}" y="${milieuLocal - 10}" class="t-blanc-det">${ech(
  (nvr.reference || '').replace('Hikvision ', ''))}</text>
    ${boite(X_LOCAL + 12, milieuLocal + 8, L_LOCAL - 24, 34, 'fill="#f6f7f9" stroke="#dde1e7"')}
    <text x="${X_LOCAL + 22}" y="${milieuLocal + 22}" class="t-det">${b.ports} port(s) réseau utilisés</text>
    <text x="${X_LOCAL + 22}" y="${milieuLocal + 35}" class="t-det">${ech(fr(b.consoPoe))} W PoE · ${ech(fr(b.debitTotal))} Mbit/s</text>
  </g>`);

  /* -------------------------------------------- les coffrets et leurs liens */
  for (const r of rangs) {
    const g = r.groupe;
    const yc = r.milieu - 30;

    if (g.cle) {
      const parent = g.depuis === 'local' ? null : rangs.find((x) => x.groupe.cle === g.depuis);
      const v = g.montante && g.montante.verdict ? g.montante.verdict.niveau : 'ok';
      const depart = parent
        ? { x: X_COFFRET + L_COFFRET / 2, y: parent.milieu + 36 }
        : { x: X_LOCAL + L_LOCAL, y: milieuLocal };
      // Un coffret cascadé descend de son parent : le trait part du bas du
      // coffret amont, pas du local, sans quoi le schéma mentirait sur ce
      // qui tombe quand le coffret amont tombe.
      const d = parent
        ? `M ${depart.x} ${depart.y} V ${r.milieu} H ${X_COFFRET}`
        : `M ${depart.x} ${depart.y} H ${(X_LOCAL + L_LOCAL + X_COFFRET) / 2} V ${r.milieu} H ${X_COFFRET}`;
      traits.push(`<path d="${d}" fill="none" stroke="${COULEUR_LIEN[v]}" stroke-width="2.5"/>`);
      if (g.montante) {
        traits.push(`<text x="${parent ? depart.x + 8 : (X_LOCAL + L_LOCAL + X_COFFRET) / 2 + 8}" y="${
          r.milieu - 6}" class="t-lien" fill="${COULEUR_LIEN[v]}">${ech(fr(g.montante.longueur, 0))} m</text>`);
      }

      const poe = g.equipements.length;
      const contenu = lignesDe(g.contenu, 28, 2);
      const hBoite = 50 + contenu.length * 15;
      const yBoite = r.milieu - hBoite / 2;
      blocs.push(`<g>
        ${boite(X_COFFRET, yBoite, L_COFFRET, hBoite, `fill="#fff" stroke="${COULEUR_LIEN[v]}" stroke-width="2"`)}
        <text x="${X_COFFRET + 11}" y="${yBoite + 19}" class="t-titre">${ech(g.cle)} · ${ech(couper(g.nom, 19))}</text>
        ${contenu.map((t, n) => `<text x="${X_COFFRET + 11}" y="${yBoite + 37 + n * 15}" class="t-det">${ech(t)}</text>`).join('')}
        <text x="${X_COFFRET + 11}" y="${yBoite + hBoite - 9}" class="t-mini">${poe} équipements · depuis ${ech(g.depuis === 'local' ? 'le local' : g.depuis)}</text>
      </g>`);
    } else {
      blocs.push(`<g>
        <text x="${X_COFFRET + 11}" y="${r.milieu + 4}" class="t-det">${ech(g.nom)}</text>
      </g>`);
    }

    /* ----------------------------------------- les équipements du groupe */
    g.equipements.forEach((e, i) => {
      const ye = r.y + i * HAUT_LIGNE;
      const centre = ye + HAUT_LIGNE / 2;
      const l = e.liaison;
      // Les liaisons d'alimentation et de commande n'ont pas de verdict
      // Ethernet : elles ne sont pas des paires torsadées de 90 m.
      const v = l && l.verdict ? l.verdict.niveau : 'ok';
      const xDepart = g.cle ? X_COFFRET + L_COFFRET : X_LOCAL + L_LOCAL;
      const coude = g.cle ? X_COFFRET + L_COFFRET + 30 : X_EQUIP - 40;
      traits.push(`<path d="M ${xDepart} ${g.cle ? r.milieu : milieuLocal} H ${coude} V ${centre} H ${X_EQUIP}"
        fill="none" stroke="${COULEUR_LIEN[v]}" stroke-width="${v === 'ok' ? 1.4 : 2.2}"/>`);
      if (l) {
        // Calée à droite, contre la boîte : un accès porte cinq câbles et
        // son étiquette, alignée à gauche, finissait sous l'équipement.
        traits.push(`<text x="${X_EQUIP - 7}" y="${centre - 4}" text-anchor="end" class="t-lien" fill="${COULEUR_LIEN[v]}">${
          ech(fr(l.longueur, 0))} m${l.cables > 1 ? ` × ${l.cables}` : ''}</text>`);
      }
      const et = etiquette(etude, e.cle);
      const detail = couper(et.detail, 44);
      const titre = couper(et.titre, 44);
      blocs.push(`<g>
        ${boite(X_EQUIP, ye + 2, L_EQUIP, HAUT_LIGNE - 6,
    `fill="${v === 'ok' ? '#fff' : '#fff4f5'}" stroke="${v === 'ok' ? '#dde1e7' : COULEUR_LIEN[v]}"`)}
        <text x="${X_EQUIP + 11}" y="${centre - 2}" class="t-equip">${ech(titre)}</text>
        ${detail ? `<text x="${X_EQUIP + 11}" y="${centre + 12}" class="t-det">${ech(detail)}</text>` : ''}
      </g>`);
    });
  }

  const hors = b.horsNorme.length;
  const legende = `<g>
    <text x="${X_LOCAL}" y="${hauteur - 8}" class="t-det">Chaque trait porte la longueur de câble relevée au cheminement.
      ${hors ? `${hors} liaison(s) au-delà de ${LIAISON_PERMANENTE} m, en rouge.`
    : `Toutes les liaisons tiennent sous les ${LIAISON_PERMANENTE} m.`}</text>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR} ${hauteur}"
  role="img" aria-label="Synoptique de raccordement">
<style>
  .t-titre { font:700 14px -apple-system,"Segoe UI",Roboto,Arial,sans-serif; fill:#1a1d23; }
  .t-det { font:11.5px -apple-system,"Segoe UI",Roboto,Arial,sans-serif; fill:#5b6472; }
  .t-equip { font:600 14px -apple-system,"Segoe UI",Roboto,Arial,sans-serif; fill:#1a1d23; }
  /* Halo blanc : l'étiquette d'un accès à cinq câbles passait sur le trait
     vertical qui dessert le groupe. On la peint par-dessus. */
  .t-lien { font:11px -apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    stroke:#fff; stroke-width:3.5; paint-order:stroke; stroke-linejoin:round; }
  .t-blanc { font:700 13px -apple-system,"Segoe UI",Roboto,Arial,sans-serif; fill:#fff; }
  .t-blanc-det { font:11px -apple-system,"Segoe UI",Roboto,Arial,sans-serif; fill:#c9ced6; }
  .t-mini { font:10px -apple-system,"Segoe UI",Roboto,Arial,sans-serif; fill:#5b6472; }
  .t-entete { font:700 12.5px -apple-system,"Segoe UI",Roboto,Arial,sans-serif; fill:#5b6472;
    letter-spacing:.08em; }
</style>
<rect width="${LARGEUR}" height="${hauteur}" fill="#fff"/>
<text x="${X_LOCAL}" y="28" class="t-entete">LOCAL</text>
<text x="${X_COFFRET}" y="28" class="t-entete">COFFRETS DÉPORTÉS</text>
<text x="${X_EQUIP}" y="28" class="t-entete">ÉQUIPEMENTS</text>
${traits.join('\n')}
${blocs.join('\n')}
${legende}
</svg>`;
}
