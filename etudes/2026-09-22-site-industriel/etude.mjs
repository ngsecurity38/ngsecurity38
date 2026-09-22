/**
 * Étude technique de vidéosurveillance — site industriel.
 *
 *   node etudes/2026-09-22-site-industriel/etude.mjs
 *
 * Produit un document HTML autonome, prêt à imprimer en PDF et à remettre au
 * client. Photos embarquées : le fichier se transmet seul, par courriel ou
 * par clé.
 *
 * TOUS LES CHIFFRES VIENNENT DES MÊMES FONCTIONS QUE LES PAGES DU SITE.
 * Une étude remise au client qui annoncerait d'autres portées que l'outil
 * public ne vaudrait rien : c'est le même calcul, sur les mêmes optiques
 * constructeur.
 *
 * CE QUE LE DOCUMENT AFFIRME, ET CE QU'IL PROPOSE — la distinction est tenue
 * partout :
 *
 *   - les portées DORI sont CALCULÉES sur l'optique annoncée. Elles ne
 *     dépendent ni du site ni d'une hypothèse : elles sont vraies ;
 *   - les emplacements sont PROPOSÉS d'après les photos. Ils se confirment
 *     au relevé, et le document le dit à chaque page.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { distanceDori, couverture, SEUILS_DORI } from '../../outils/analyse-vue-angle/js/optique.js';
import { debitEstime, capaciteNecessaire } from '../../outils/analyse-vue-angle/js/stockage.js';
import { fr, frGroupe } from '../../outils/analyse-vue-angle/js/format.js';

const ici = dirname(fileURLToPath(import.meta.url));
const racineOutil = join(ici, '..', '..', 'outils', 'analyse-vue-angle');

const ech = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const image = (chemin, type = 'jpeg') => `data:image/${type};base64,`
  + readFileSync(chemin).toString('base64');

/* ------------------------------------------------------------- le parc */

/**
 * Les trois modèles, avec leur optique.
 *
 * `source` dit d'où vient le chiffre. Aucune fiche constructeur n'a pu être
 * ouverte depuis l'atelier — l'accès réseau y bloque les serveurs qui les
 * hébergent — et le document le porte écrit. Ces valeurs sont à confirmer
 * avant remise au client.
 */
const MODELES = {
  turret: {
    cle: 'turret',
    reference: 'Hikvision DS-2CD2346G2H-IU (2,8 mm)',
    type: 'Turret 4 MP AcuSense, micro intégré',
    vignette: 'm-turret.jpg',
    resH: 2688,
    resV: 1520,
    angleH: 100.2,
    focale: 2.8,
    ir: 30,
    source: 'Champ horizontal 100,2° et définition 2688 × 1520 relevés par recherche '
      + 'documentaire (fiche DS-2CD2346G2H-I(U), éd. 13/05/2024). Infrarouge 30 m '
      + 'annoncé par plusieurs revendeurs. À CONFIRMER sur la fiche.',
  },
  varifocal: {
    cle: 'varifocal',
    reference: 'Hikvision DS-2CD2683G2-IZS (2,8–12 mm motorisé)',
    type: 'Bullet 8 MP AcuSense, objectif motorisé',
    vignette: 'm-varifocal.jpg',
    resH: 3840,
    resV: 2160,
    angleH: 108,
    angleHTele: 30,
    focaleMin: 2.8,
    focaleMax: 12,
    ir: null,
    source: 'Champ horizontal 108° à 30° et définition 3840 × 2160 relevés par '
      + 'recherche documentaire (fiche DS-2CD2683G2-IZS V5.5.113). Portée '
      + 'infrarouge NON RELEVÉE. À CONFIRMER sur la fiche.',
  },
  panoramique: {
    cle: 'panoramique',
    reference: 'Hikvision DS-2CD2346G2P-ISU/SL (2,8 mm)(C)',
    type: 'Turret panoramique 4 MP, 180°, stroboscope et alarme sonore',
    vignette: 'm-panoramique.jpg',
    resH: 3040,
    resV: 1368,
    angleH: 180,
    ir: 30,
    /*
     * Deux capteurs de 1520 px côte à côte, chacun couvrant la moitié du champ.
     * C'est ainsi qu'il faut la calculer : appliquer 3040 px à 180° d'un seul
     * tenant n'a pas de sens — une optique rectiligne de 180° n'existe pas, et
     * la formule y divise par l'infini.
     */
    capteurUnique: { resH: 1520, angleH: 90 },
    noteCone: 'Le schéma montre UN des deux objectifs, soit la moitié du champ. '
      + 'L\'appareil en couvre le double, à la même densité de pixels : les '
      + 'portées ci-contre valent pour les 180°.',
    source: 'Deux objectifs de 2,8 mm assemblés en 180°, définition 3040 × 1368, '
      + 'infrarouge 30 m : relevés par recherche documentaire (fiche '
      + 'DS-2CD2346G2P-ISU/SL, éd. 27/03/2024). À CONFIRMER sur la fiche.',
  },
};

/** L'optique servant au calcul : un capteur pour le panoramique. */
const optiqueUtile = (m, tele = false) => (
  m.capteurUnique
    ? m.capteurUnique
    : { resH: m.resH, angleH: tele && m.angleHTele ? m.angleHTele : m.angleH }
);

/** Les quatre portées DORI d'un modèle, en mètres. */
function portees(m, tele = false) {
  const o = optiqueUtile(m, tele);
  const d = {};
  for (const cle of Object.keys(SEUILS_DORI)) {
    d[cle] = distanceDori(o.resH, o.angleH, SEUILS_DORI[cle].ppm);
  }
  return d;
}

/* ------------------------------------------------------- les emplacements */

/**
 * Les photos, telles qu'elles ont été prises.
 *
 * `champ` est le champ horizontal de la PHOTO, indispensable pour reporter
 * dessus le champ d'une caméra. Un téléphone donne environ 67° sur son
 * objectif principal ; une photo recadrée au carré depuis un capteur 4/3 en
 * conserve la hauteur et perd de la largeur — d'où 53,4°.
 */
const CHAMP_TELEPHONE = 67;

/**
 * Dimensions d'un JPEG, lues dans le fichier.
 *
 * Déduire le champ d'une photo de son cadrage suppose de connaître ce
 * cadrage. Le lire ici plutôt que de le noter à la main évite l'erreur qui
 * s'est déjà produite une fois : trois de ces photos sont en portrait, et une
 * étiquette d'orientation ignorée les avait couchées dans le document.
 */
function dimensionsJpeg(chemin) {
  const o = readFileSync(chemin);
  let i = 2;
  while (i < o.length) {
    if (o[i] !== 0xff) { i += 1; continue; }
    const marqueur = o[i + 1];
    // SOF0..SOF15, hors marqueurs qui n'en sont pas (DHT, JPG, DAC).
    if (marqueur >= 0xc0 && marqueur <= 0xcf
      && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
      return { hauteur: o.readUInt16BE(i + 5), largeur: o.readUInt16BE(i + 7) };
    }
    i += 2 + o.readUInt16BE(i + 2);
  }
  throw new Error(`Dimensions illisibles : ${chemin}`);
}

/**
 * Champ horizontal d'une photo de téléphone, d'après son cadrage.
 *
 * Le capteur est en 4/3 et couvre environ 67° sur sa GRANDE dimension. Tenu
 * en portrait, ou recadré au carré, l'appareil n'en utilise plus que les
 * trois quarts en largeur : le champ horizontal tombe à 53°. C'est une
 * différence qui compte — reporter 67° sur une photo qui n'en couvre que 53
 * ferait paraître chaque caméra plus étroite qu'elle n'est.
 */
function champHorizontal(chemin) {
  const { largeur, hauteur } = dimensionsJpeg(chemin);
  const paysage = largeur / hauteur > 1.2;
  const part = paysage ? 1 : 0.75;
  return (2 * Math.atan(Math.tan((CHAMP_TELEPHONE * Math.PI) / 360) * part) * 180) / Math.PI;
}

const VUES = [
  {
    cle: 'entree',
    fichier: 'p1-entree.jpg',
    titre: 'Entrée du site — portail',
    prise: 'Depuis la voie, face au portail.',
    observations: [
      'Accès unique par un portail double à barreaudage. C\'est le point de '
        + 'passage obligé de tout véhicule : c\'est donc là, et nulle part '
        + 'ailleurs, que se joue l\'identification.',
      'Le bâtiment à droite offre un point de fixation en hauteur, à une '
        + 'quinzaine de mètres du portail — distance à mesurer.',
      'Soleil rasant au moment de la prise de vue. Une caméra placée dans '
        + 'l\'axe du soleil levant ou couchant perd son image aux heures '
        + 'précises où l\'on entre et où l\'on sort. L\'orientation définitive '
        + 'doit en tenir compte.',
      'Aucune clôture n\'est visible de part et d\'autre du portail : la haie '
        + 'et le talus ne sont pas un obstacle. Le portail protège du véhicule, '
        + 'pas du piéton.',
    ],
    cameras: ['C1', 'C2'],
  },
  {
    cle: 'cour',
    fichier: 'p2-cour.jpg',
    titre: 'Cour de manœuvre',
    prise: 'Depuis la cour, vers la limite arrière boisée.',
    observations: [
      'Grande aire ouverte, sans obstacle. C\'est la zone où une caméra couvre '
        + 'le plus de surface pour le moins d\'appareils — et celle où elle '
        + 'distingue le moins de détails, faute de pixels au loin.',
      'La limite du site est un bois, sans clôture visible. C\'est le point '
        + 'faible : on y entre à pied sans passer par le portail.',
      'Éclairage nocturne non constaté. Au-delà de la portée de l\'infrarouge, '
        + 'une caméra ne voit rien la nuit, quels que soient ses pixels.',
    ],
    cameras: ['C3', 'C4'],
  },
  {
    cle: 'quai',
    fichier: 'p3-quai.jpg',
    titre: 'Quai de chargement',
    prise: 'Depuis la cour, face au quai.',
    observations: [
      'Quai avec rampe et porte de grande hauteur. C\'est par là que sort la '
        + 'marchandise : le vol s\'y fait de jour, à visage découvert, et se '
        + 'conteste ensuite sur la vidéo. L\'exigence y est l\'identification, '
        + 'pas la détection.',
      'Les blocs béton en cours de stockage font écran : ils masquent le bas '
        + 'du champ et se déplacent d\'une semaine à l\'autre. Une caméra posée '
        + 'trop bas sera aveuglée par le prochain lot.',
      'Un projecteur est déjà fixé en façade, au-dessus de la porte : point '
        + 'd\'alimentation possible, à vérifier.',
    ],
    cameras: ['C5', 'C6'],
  },
  {
    cle: 'halle',
    fichier: 'p4-halle.jpg',
    titre: 'Halle — volume principal',
    prise: 'Depuis l\'allée, vers le mur de refend.',
    observations: [
      'Charpente métallique et lanterneaux. Deux conséquences : la portée '
        + 'radio y est dégradée si des équipements sans fil sont envisagés, et '
        + 'les lanterneaux créent un contre-jour violent au zénith — une caméra '
        + 'orientée vers eux perdra le détail au sol en milieu de journée.',
      'Hauteur sous charpente estimée à six ou sept mètres. Une caméra posée '
        + 'haut couvre plus de surface mais regarde le sol de plus en plus '
        + 'obliquement : les visages s\'y lisent mal. Pour l\'identification, il '
        + 'faut redescendre.',
      'Volume libre au moment de la prise de vue. Le jour où les racks seront '
        + 'remontés, ils couperont les champs : l\'implantation doit être '
        + 'arrêtée sur le plan de stockage définitif, pas sur une halle vide.',
    ],
    cameras: ['C7'],
  },
  {
    cle: 'rideau',
    fichier: 'p5-rideau.jpg',
    titre: 'Halle — rideau métallique et zone de stockage',
    prise: 'Depuis l\'intérieur, le long du mur pignon.',
    observations: [
      'Rideau métallique de grande largeur : deuxième accès véhicule au volume. '
        + 'Baissé, c\'est lui la porte ; un champ réglé sur la porte vitrée '
        + 'derrière ne verrait rien.',
      'Des panneaux sont appuyés contre le mur, à l\'aplomb du rideau. '
        + 'Stockés là durablement, ils masqueraient une caméra fixée bas.',
      'Racks en cours de montage sur la droite : ils définiront les allées, '
        + 'donc les seuls axes où une caméra voit quelque chose.',
    ],
    cameras: ['C8', 'C9'],
  },
];

/**
 * Les neuf caméras.
 *
 * `bande` est la position, en fraction de la largeur de la photo, du centre
 * du champ proposé. 0,5 = dans l'axe de la prise de vue.
 */
const CAMERAS = [
  {
    cle: 'C1',
    vue: 'entree',
    modele: 'varifocal',
    tele: true,
    role: 'Identification à l\'entrée',
    pose: 'Angle du bâtiment, à 4 m environ, orientée vers le portail',
    bande: 0.5,
    attendu: 'Plaque d\'immatriculation et conducteur. C\'est la seule caméra du '
      + 'parc capable d\'identifier au-delà de cinq mètres : elle doit être '
      + 'réglée au téléobjectif et tenue sur cet axe.',
  },
  {
    cle: 'C2',
    vue: 'entree',
    modele: 'turret',
    role: 'Contexte de l\'entrée',
    pose: 'Même support, à 3 m, champ large',
    bande: 0.5,
    attendu: 'Le contexte : qui accompagne le véhicule, dans quel sens, à quelle '
      + 'heure. Elle ne remplace pas C1 — au-delà de 4,5 m elle ne permet plus '
      + 'd\'identifier qui que ce soit.',
  },
  {
    cle: 'C3',
    vue: 'cour',
    modele: 'varifocal',
    tele: false,
    role: 'Surveillance générale de la cour',
    pose: 'En façade, 4 à 5 m, champ large',
    bande: 0.5,
    attendu: 'La présence et le trajet. Réglée au grand-angle elle couvre '
      + 'largement mais ne reconnaît personne au-delà d\'une douzaine de mètres.',
  },
  {
    cle: 'C4',
    vue: 'cour',
    modele: 'panoramique',
    role: 'Limite arrière et dissuasion',
    pose: 'Sur mât ou angle de bâtiment, 3,5 m, face au bois',
    bande: 0.5,
    attendu: 'Couvrir d\'un seul appareil l\'angle mort du fond, et dissuader : '
      + 'stroboscope et message sonore se déclenchent sur détection humaine. '
      + 'Caméra de contexte — elle n\'identifie pas au-delà de trois mètres.',
  },
  {
    cle: 'C5',
    vue: 'quai',
    modele: 'varifocal',
    tele: true,
    role: 'Abords du quai',
    pose: 'En façade, 4 m, orientée vers la rampe',
    bande: 0.5,
    attendu: 'Reconnaître les personnes qui approchent du quai et lire les '
      + 'plaques des véhicules à la rampe.',
  },
  {
    cle: 'C6',
    vue: 'quai',
    modele: 'turret',
    role: 'Porte de quai',
    pose: 'Au-dessus de la porte, 3 m, plongée sur le seuil',
    bande: 0.5,
    attendu: 'Identifier au passage du seuil. Elle doit être À L\'APLOMB de la '
      + 'porte : à quinze mètres elle ne ferait plus que de la détection.',
  },
  {
    cle: 'C7',
    vue: 'halle',
    modele: 'turret',
    role: 'Volume de la halle',
    pose: 'Sous charpente, 4 m, dans l\'axe de l\'allée',
    bande: 0.5,
    attendu: 'Détecter une présence et suivre un déplacement dans le volume. '
      + 'Pas de lecture de visage à cette distance.',
  },
  {
    cle: 'C8',
    vue: 'rideau',
    modele: 'turret',
    role: 'Rideau métallique',
    pose: 'À l\'aplomb du rideau, 3 m, vers l\'intérieur',
    bande: 0.5,
    attendu: 'Identifier au franchissement. Même règle que C6 : à l\'aplomb, '
      + 'sinon elle perd tout intérêt.',
  },
  {
    cle: 'C9',
    vue: 'rideau',
    modele: 'turret',
    role: 'Zone de stockage',
    pose: 'Angle opposé, 4 m, vers les racks',
    bande: 0.5,
    attendu: 'Détecter une présence entre les racks. Champ à reprendre une fois '
      + 'le plan de stockage arrêté.',
  },
];

/* ----------------------------------------------------------- les dessins */

const COULEURS = {
  detection: '#8a9099',
  observation: '#5b6472',
  reconnaissance: '#9d0c24',
  identification: '#c8102e',
};
const ORDRE = ['detection', 'observation', 'reconnaissance', 'identification'];

/**
 * Le champ vu de dessus, à l'échelle, avec les quatre paliers.
 *
 * C'est le seul dessin du document qui n'ait besoin d'aucune hypothèse : il
 * ne dépend que de l'optique annoncée par le constructeur.
 */
function cone(m, tele = false) {
  const o = optiqueUtile(m, tele);
  const p = portees(m, tele);
  const L = 700;
  const H = 400;
  const cx = L / 2;
  const cy = H - 26;
  const max = Math.max(p.detection, 1);
  const rayonPx = (d) => (d / max) * (H - 60);
  const demi = (o.angleH * Math.PI) / 360;

  const secteur = (d, couleur, opacite) => {
    const r = rayonPx(d);
    // Au-delà de 90° de demi-champ un secteur circulaire ne se trace plus en
    // un seul arc : le panoramique se dessine donc en deux moitiés.
    const bord = Math.min(demi, Math.PI / 2 - 0.001);
    const x1 = cx - r * Math.sin(bord);
    const x2 = cx + r * Math.sin(bord);
    const y = cy - r * Math.cos(bord);
    return `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y.toFixed(1)} `
      + `A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y.toFixed(1)} Z" `
      + `fill="${couleur}" opacity="${opacite}"/>`;
  };

  const secteurs = [...ORDRE].reverse().map(
    (cle, i) => secteur(p[cle], COULEURS[cle], 0.22 + i * 0.12),
  ).join('');

  /*
   * Les repères s'écartent de l'axe d'autant plus qu'ils sont proches de la
   * caméra : aux courtes portées, identification et reconnaissance ne sont
   * séparées que de quelques pixels et leurs libellés se chevauchaient.
   */
  const reperes = ORDRE.map((cle, i) => {
    const r = rayonPx(p[cle]);
    const decal = 14 + (ORDRE.length - 1 - i) * 26;
    return `<line x1="${cx}" y1="${(cy - r).toFixed(1)}" x2="${cx + decal - 5}"
        y2="${(cy - r).toFixed(1)}" stroke="#1a1d23" stroke-width="1" opacity=".55"/>
      <text x="${cx + decal}" y="${(cy - r + 4).toFixed(1)}" font-size="12" fill="#1a1d23">
        ${ech(SEUILS_DORI[cle].label)} — ${ech(fr(p[cle]))} m</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${L} ${H}" class="cone" role="img"
    aria-label="Champ de la caméra vu de dessus, avec les quatre paliers de la norme">
    ${secteurs}
    ${reperes}
    <circle cx="${cx}" cy="${cy}" r="5" fill="#1a1d23"/>
    <text x="${cx}" y="${cy + 20}" font-size="12" text-anchor="middle" fill="#5b6472"
      >caméra — champ ${ech(fr(o.angleH))}°</text>
  </svg>`;
}

/**
 * La photo, avec le champ de la caméra reporté dessus.
 *
 * Le report repose sur une hypothèse, et le document la porte écrite : la
 * photo a été prise au téléphone, objectif principal, soit environ 67° de
 * champ horizontal. La bande devient une mesure — et non plus une
 * illustration — le jour où deux distances connues sont relevées sur la
 * photo. C'est exactement ce que fait la page d'étude du site.
 */
function bandeSurPhoto(vue, cam) {
  const m = MODELES[cam.modele];
  const o = optiqueUtile(m, cam.tele);
  const t = (a) => Math.tan((a * Math.PI) / 360);
  const part = t(o.angleH) / t(vue.champ);
  const largeur = Math.min(1, part);
  const gauche = Math.max(0, cam.bande - largeur / 2);
  const deborde = part > 1;

  return `<div class="report">
    <img src="${vue.src}" alt="${ech(vue.titre)}">
    <div class="champ" style="left:${(gauche * 100).toFixed(1)}%;
      width:${(largeur * 100).toFixed(1)}%">
      <span>${ech(cam.cle)} — ${ech(fr(o.angleH))}°</span>
    </div>
    ${deborde ? `<p class="deborde">${ech(cam.cle)} voit
      ${ech(fr(part, 1))} fois plus large que cette photo : son champ déborde du
      cadre des deux côtés.</p>` : ''}
  </div>`;
}

/* ------------------------------------------------------------ le document */

const lignesDori = (m, tele) => {
  const p = portees(m, tele);
  return ORDRE.map((cle) => `<tr>
    <td>${ech(SEUILS_DORI[cle].label)}</td>
    <td class="n">${ech(SEUILS_DORI[cle].ppm)} px/m</td>
    <td class="n"><b>${ech(fr(p[cle]))} m</b></td>
  </tr>`).join('');
};

function ficheModele(m) {
  const reglages = m.angleHTele
    ? [['Grand-angle (2,8 mm)', false], ['Téléobjectif (12 mm)', true]]
    : [[null, false]];
  return `<section class="modele">
    <div class="entete-modele">
      ${m.vignetteSrc ? `<img class="vignette" src="${m.vignetteSrc}"
        alt="${ech(m.reference)}">` : ''}
      <div>
        <h3>${ech(m.reference)}</h3>
        <p class="type">${ech(m.type)} — ${ech(frGroupe(m.resH))} × ${ech(frGroupe(m.resV))} px
          ${m.ir ? `· infrarouge ${ech(m.ir)} m` : '· portée infrarouge à relever'}</p>
      </div>
    </div>
    ${reglages.map(([titre, tele]) => `<div class="reglage">
      ${titre ? `<h4>${ech(titre)}</h4>` : ''}
      <div class="paire">
        ${cone(m, tele)}
        <table class="dori">
          <thead><tr><th>Palier</th><th class="n">Exigence</th><th class="n">Jusqu'à</th></tr></thead>
          <tbody>${lignesDori(m, tele)}</tbody>
        </table>
      </div>
      <p class="largeur">Largeur couverte à 20 m :
        <b>${ech(fr(couverture(optiqueUtile(m, tele).angleH, 20)))} m</b>${
  m.capteurUnique ? ' par objectif, soit le double sur les 180°' : ''}.</p>
      ${m.noteCone ? `<p class="note-cone">${ech(m.noteCone)}</p>` : ''}
    </div>`).join('')}
    <p class="source">${ech(m.source)}</p>
  </section>`;
}

function sectionVue(vue) {
  const cams = CAMERAS.filter((c) => c.vue === vue.cle);
  return `<section class="vue">
    <h2>${ech(vue.titre)}</h2>
    <p class="prise">${ech(vue.prise)} — champ de la photo estimé à
      ${ech(fr(vue.champ))}°.</p>

    <h3>Ce que montre la vue</h3>
    <ul class="obs">${vue.observations.map((o) => `<li>${ech(o)}</li>`).join('')}</ul>

    <h3>Caméras proposées</h3>
    ${cams.map((c) => {
    const m = MODELES[c.modele];
    const p = portees(m, c.tele);
    return `<div class="camera">
        <h4><span class="puce">${ech(c.cle)}</span> ${ech(c.role)}</h4>
        <p class="modele-nom">${ech(m.reference)}${c.tele ? ' — réglée au téléobjectif' : ''}</p>
        <p class="pose"><b>Pose proposée :</b> ${ech(c.pose)}</p>
        <p>${ech(c.attendu)}</p>
        ${bandeSurPhoto(vue, c)}
        <table class="dori serree">
          <tr><th>Repérer</th><th>Observer</th><th>Reconnaître</th><th>Identifier</th></tr>
          <tr><td>${ech(fr(p.detection))} m</td><td>${ech(fr(p.observation))} m</td>
            <td>${ech(fr(p.reconnaissance))} m</td><td>${ech(fr(p.identification))} m</td></tr>
        </table>
      </div>`;
  }).join('')}
  </section>`;
}

/* --------------------------------------------------------- l'assemblage */

for (const m of Object.values(MODELES)) {
  if (m.vignette) m.vignetteSrc = image(join(ici, 'photos', m.vignette));
}

for (const v of VUES) {
  const chemin = join(ici, 'photos', v.fichier);
  v.src = image(chemin);
  v.champ = champHorizontal(chemin);
}
const logo = image(join(racineOutil, 'img', 'logo.png'), 'png');

const parc = [
  ['turret', 5], ['varifocal', 3], ['panoramique', 1],
];
const debitTotal = parc.reduce((s, [cle, n]) => {
  const m = MODELES[cle];
  return s + n * debitEstime({ resH: m.resH, resV: m.resV, codec: 'h265' });
}, 0);
const stockage = (j) => capaciteNecessaire({ debitTotal, jours: j, heuresParJour: 24 });

const AUJOURD_HUI = new Date().toLocaleDateString('fr-FR', {
  day: '2-digit', month: 'long', year: 'numeric',
});

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Étude technique de vidéosurveillance — NG Security 38</title>
<style>
  :root { --rouge:#c8102e; --encre:#1a1d23; --doux:#5b6472; --bord:#dde1e7; --fond:#f6f7f9; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--fond); color:var(--encre);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; }
  .feuille { max-width:900px; margin:0 auto 24px; background:#fff; padding:44px 52px;
    border:1px solid var(--bord); }
  h1 { font-size:30px; line-height:1.15; margin:0 0 6px; }
  h2 { font-size:22px; margin:34px 0 14px; padding-bottom:8px;
    border-bottom:3px solid var(--rouge); }
  h3 { font-size:17px; margin:24px 0 8px; }
  h4 { font-size:15px; margin:18px 0 6px; }
  p { margin:0 0 10px; }
  .garde { text-align:left; }
  .garde img { height:120px; display:block; margin-bottom:22px; }
  .garde .surtitre { color:var(--rouge); font-weight:700; letter-spacing:.1em;
    text-transform:uppercase; font-size:12px; margin-bottom:10px; }
  .garde .meta { margin-top:26px; border-top:1px solid var(--bord); padding-top:16px;
    color:var(--doux); font-size:14px; }
  .garde .meta b { color:var(--encre); }
  .avert { background:#fff8e6; border:1px solid #f0d9a0; border-radius:8px;
    padding:14px 16px; margin:18px 0; font-size:14px; }
  .avert b { color:#8a5a00; }
  ul.obs, ul.liste { margin:0 0 12px; padding-left:20px; }
  ul.obs li, ul.liste li { margin-bottom:8px; }
  .prise { color:var(--doux); font-size:14px; }
  .camera { border:1px solid var(--bord); border-radius:10px; padding:16px 18px;
    margin:16px 0; page-break-inside:avoid; }
  .puce { display:inline-block; min-width:34px; padding:2px 8px; border-radius:20px;
    background:var(--rouge); color:#fff; font-size:13px; text-align:center; margin-right:6px; }
  .modele-nom { color:var(--doux); font-size:14px; margin-bottom:6px; }
  .report { position:relative; margin:12px 0; }
  .report img { width:100%; display:block; border-radius:8px; }
  .report .champ { position:absolute; top:0; bottom:0; border-left:2px solid var(--rouge);
    border-right:2px solid var(--rouge); background:rgba(200,16,46,.18); }
  .report .champ span { position:absolute; top:6px; left:6px; background:var(--rouge);
    color:#fff; font-size:12px; font-weight:700; padding:2px 7px; border-radius:4px; }
  .deborde { font-size:13px; color:#8a5a00; margin-top:6px; }
  table { border-collapse:collapse; width:100%; font-size:14px; }
  th, td { text-align:left; padding:7px 9px; border-bottom:1px solid var(--bord); }
  th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--doux); }
  td.n, th.n { text-align:right; }
  .dori.serree { margin-top:10px; text-align:center; }
  .dori.serree th, .dori.serree td { text-align:center; }
  .modele { border:1px solid var(--bord); border-radius:10px; padding:18px 20px;
    margin:16px 0; page-break-inside:avoid; }
  .modele .type { color:var(--doux); font-size:14px; }
  .entete-modele { display:flex; gap:18px; align-items:flex-start; margin-bottom:12px; }
  .entete-modele > div { flex:1 1 auto; min-width:0; }
  .entete-modele h3 { margin-top:0; }
  .vignette { flex:none; width:132px; height:auto; border:1px solid var(--bord);
    border-radius:8px; background:#fff; }
  .paire { display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap; }
  .cone { flex:1 1 340px; max-width:440px; height:auto; }
  .paire table { flex:1 1 240px; }
  .largeur { font-size:14px; color:var(--doux); margin-top:8px; }
  .note-cone { font-size:13px; color:var(--doux); font-style:italic; margin-top:4px; }
  .source { font-size:12.5px; color:#8a5a00; background:#fff8e6; border-radius:6px;
    padding:9px 11px; margin-top:12px; }
  .pied { color:var(--doux); font-size:13px; text-align:center; padding:8px 0 30px; }
  @media print {
    body { background:#fff; }
    .feuille { border:0; margin:0; max-width:none; padding:0; }
    h2 { page-break-after:avoid; }
    .vue, .modele { page-break-before:always; }
  }
</style>
</head>
<body>
<div class="feuille">

<header class="garde">
  <img src="${logo}" alt="NG Security 38">
  <p class="surtitre">Étude technique</p>
  <h1>Vidéosurveillance d'un site industriel</h1>
  <p>Implantation des caméras extérieures et intérieures, portées calculées,
    points à mesurer sur place.</p>
  <div class="meta">
    <p><b>Établie le :</b> ${ech(AUJOURD_HUI)}</p>
    <p><b>Par :</b> NG Security 38</p>
    <p><b>Sur la base de :</b> cinq vues du site et de trois références matériel
      communiquées par le client.</p>
    <p><b>Référence :</b> ETU-2026-09-22</p>
  </div>
</header>

<h2>1. Ce que cette étude affirme, et ce qu'elle propose</h2>

<p>Le document distingue deux choses, et la distinction tient d'un bout à
  l'autre.</p>

<ul class="liste">
  <li><b>Les portées sont calculées</b>, pas estimées. Elles découlent de
    l'optique annoncée par le constructeur et de la norme
    EN&nbsp;62676-4, qui fixe le nombre de pixels par mètre nécessaire à
    chaque usage. Elles ne dépendent ni du site ni d'une hypothèse : elles
    sont vraies pour ces caméras, où qu'on les pose.</li>
  <li><b>Les emplacements sont proposés</b>, d'après les photos. Ils se
    confirment au relevé sur place. Aucune distance du site n'a été mesurée à
    ce jour.</li>
</ul>

<div class="avert">
  <b>Deux réserves à lever avant remise au client.</b>
  Les caractéristiques optiques ci-après ont été relevées par recherche
  documentaire&nbsp;: les fiches constructeur elles-mêmes n'ont pas pu être
  ouvertes. Elles sont à confirmer référence par référence.
  Et les distances du site restent à mesurer&nbsp;: tant qu'elles manquent, le
  report des champs sur les photos est une illustration, pas une mesure.
</div>

<h2>2. Le matériel et ce qu'il permet vraiment</h2>

<p>Une caméra ne «&nbsp;voit&nbsp;» pas&nbsp;: elle pose un certain nombre de
  pixels sur chaque mètre de terrain, et ce nombre diminue avec la distance.
  La norme EN&nbsp;62676-4 fixe quatre paliers — repérer une silhouette,
  observer une action, reconnaître une personne connue, identifier un inconnu.
  C'est ce qui suit qui décide de ce que la vidéo permettra de prouver.</p>

${Object.values(MODELES).map(ficheModele).join('')}

<div class="avert">
  <b>Le point à retenir.</b> Sur les neuf caméras, <b>une seule identifie
  au-delà de cinq mètres</b>&nbsp;: le bullet motorisé réglé au téléobjectif,
  qui identifie jusqu'à ${ech(fr(portees(MODELES.varifocal, true).identification))}&nbsp;m.
  Les cinq turrets identifient jusqu'à
  ${ech(fr(portees(MODELES.turret).identification))}&nbsp;m, la panoramique
  jusqu'à ${ech(fr(portees(MODELES.panoramique).identification))}&nbsp;m.
  Cela ne les disqualifie pas — elles sont faites pour couvrir, pas pour
  prouver — mais cela impose leur place&nbsp;: à l'aplomb des passages, et non
  en surplomb d'une cour.
</div>

${VUES.map(sectionVue).join('')}

<h2>Synthèse du parc</h2>
<table>
  <thead><tr><th>Repère</th><th>Emplacement</th><th>Modèle</th><th>Rôle</th>
    <th class="n">Identifie&nbsp;jusqu'à</th></tr></thead>
  <tbody>
    ${CAMERAS.map((c) => {
    const m = MODELES[c.modele];
    const vue = VUES.find((v) => v.cle === c.vue);
    return `<tr>
        <td><b>${ech(c.cle)}</b></td>
        <td>${ech(vue.titre)}</td>
        <td>${ech(m.reference.replace('Hikvision ', ''))}${c.tele ? ' (télé)' : ''}</td>
        <td>${ech(c.role)}</td>
        <td class="n">${ech(fr(portees(m, c.tele).identification))} m</td>
      </tr>`;
  }).join('')}
  </tbody>
</table>

<h2>Réseau, enregistrement, stockage</h2>
<p>Neuf caméras alimentées par le réseau. Le dimensionnement ci-dessous est un
  ordre de grandeur, calculé sur un codec H.265 et un enregistrement continu.
  Un débit réel relevé sur site le remplacera.</p>
<table>
  <tbody>
    <tr><td>Ports PoE nécessaires</td><td class="n"><b>9</b>, plus un port de
      liaison — un commutateur de 16 ports laisse la place d'une extension</td></tr>
    <tr><td>Débit estimé, toutes caméras</td>
      <td class="n"><b>${ech(fr(debitTotal))} Mbit/s</b></td></tr>
    <tr><td>Enregistreur</td><td class="n">au moins <b>9 voies</b> en 8 MP</td></tr>
    <tr><td>Stockage, 15 jours continus</td>
      <td class="n"><b>${ech(fr(stockage(15) / 1000))} To</b></td></tr>
    <tr><td>Stockage, 30 jours continus</td>
      <td class="n"><b>${ech(fr(stockage(30) / 1000))} To</b></td></tr>
  </tbody>
</table>
<p class="largeur">L'enregistrement sur détection au lieu du continu divise ces
  volumes, dans une proportion qui dépend de l'activité du site. À arbitrer
  avec le client&nbsp;: la durée de conservation est aussi une question
  juridique.</p>

<h2>Ce qu'il reste à mesurer sur place</h2>
<ul class="liste">
  <li><b>Les distances.</b> Pour chaque vue, deux longueurs connues suffisent —
    la largeur du portail, l'entraxe de deux poteaux, la longueur d'une
    remorque. Le report des champs devient alors une mesure.</li>
  <li><b>Les hauteurs de pose disponibles</b>, et ce qui les limite&nbsp;:
    débord de toiture, descente d'eau pluviale, hauteur libre sous charpente.</li>
  <li><b>Le cheminement des câbles</b> et la distance de chaque caméra au
    local technique — au-delà de cent mètres, le réseau ne passe plus sans
    relais.</li>
  <li><b>L'éclairage nocturne existant</b> dans la cour et au quai. Au-delà de
    la portée de l'infrarouge, une caméra ne voit rien la nuit&nbsp;: c'est
    l'éclairage qui décide, pas les pixels.</li>
  <li><b>Le plan de stockage définitif</b> de la halle. Une implantation
    arrêtée sur une halle vide sera coupée par les racks.</li>
  <li><b>Les limites de propriété</b>, et ce que chaque caméra verra au-delà.</li>
</ul>

<h2>Réserves et obligations</h2>
<ul class="liste">
  <li>Ce document est une étude technique. Il ne vaut ni devis ni engagement de
    prix&nbsp;: aucun montant n'y figure.</li>
  <li>Les caractéristiques optiques sont à confirmer sur les fiches
    constructeur des références exactes commandées.</li>
  <li>Les vues de matériel sont des visuels catalogue fournis par l'agence,
    rapprochés de chaque référence à la forme : deux objectifs pour le
    panoramique, un bullet à objectif motorisé pour le varifocal, un turret
    pour le modèle fixe. Le rapprochement est à confirmer, et l'aspect réel
    peut varier selon la révision livrée.</li>
  <li>Une caméra qui filme au-delà de la propriété — voie publique, parcelle
    voisine — relève d'une autorisation préfectorale. À cadrer avant la pose.</li>
  <li>Sur un lieu de travail, l'information des salariés et la consultation des
    représentants du personnel obéissent à des règles propres, distinctes de
    l'information des visiteurs.</li>
  <li>La durée de conservation des images doit être arrêtée et justifiée. Elle
    conditionne le dimensionnement du stockage retenu plus haut.</li>
</ul>

<p class="pied">NG Security 38 — étude établie le ${ech(AUJOURD_HUI)} —
  document de travail, à confirmer par un relevé sur place.</p>

</div>
</body>
</html>
`;

const sortie = join(ici, 'etude.html');
writeFileSync(sortie, html);
console.log(`${sortie} — ${(html.length / 1024 / 1024).toFixed(2)} Mo`);
