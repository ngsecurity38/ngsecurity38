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

/**
 * L'agence, telle qu'elle apparaît sur le document.
 *
 * `aCompleter` n'est pas un oubli : ce sont les mentions que seule l'agence
 * peut fournir, et qu'un document remis à un client doit porter. Elles
 * s'affichent en clair, en attente — plutôt que d'être inventées, ou tues.
 */
const AGENCE = {
  nom: 'NG Security 38',
  accroche: 'Vidéosurveillance et alarme anti-intrusion',
  courriel: 'contact@ngsecurity38.com',
  sites: ['ngsecurity38.fr', 'ngsecurity38.com'],
  zone: 'Intervention France et Belgique',
  /*
   * Relevées sur les pages publiques de l'agence — conditions de vente et
   * politique de confidentialité — par recherche documentaire. Les pages
   * elles-mêmes n'ont PAS pu être ouvertes depuis l'atelier : le réseau y
   * bloque le domaine. Ces mentions sont donc de seconde main, et le
   * document le dit tant qu'elles ne sont pas confirmées.
   */
  adresse: '2 rue des Drillons, 89150 Vernoy',
  rcs: 'RCS Sens 518 723 366',
  aConfirmer: [
    'L\'adresse et le RCS ci-dessus, relevés sur vos pages publiques.',
    'Le téléphone : deux numéros apparaissent sur vos pages, '
      + '07 56 87 61 71 et 07 56 87 62 72. Lequel figure sur un devis ?',
  ],
  aCompleter: [
    'Le SIRET complet, à quatorze chiffres. Le RCS relevé donne les neuf '
      + 'premiers (518 723 366, clé de Luhn vérifiée) ; les cinq derniers '
      + 'identifient l\'établissement et ne se devinent pas.',
    'Assurance responsabilité civile professionnelle : compagnie et numéro '
      + 'de police.',
  ],
};

/**
 * Passe à `true` le jour où les mentions ci-dessus sont confirmées par
 * l'agence : l'encadré de la page de garde disparaît alors, et le document
 * part au client sans rien qui ressemble à une note interne.
 *
 * Tant que c'est `false`, l'encadré reste — mieux vaut un rappel visible
 * qu'une adresse fausse imprimée sur un devis.
 */
const MENTIONS_CONFIRMEES = false;

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

/**
 * Les vues qui se trouvent dehors.
 *
 * C'est ce qui décide de la couleur d'un repère sur la vue aérienne : noir
 * dehors, bleu dedans. La distinction n'est pas décorative — une caméra
 * extérieure se pose sous un débord de toiture, subit le gel et le
 * ruissellement, et se câble depuis l'extérieur du volume.
 */
const VUES_EXTERIEURES = new Set(['entree', 'cour', 'quai']);
const dehors = (cam) => VUES_EXTERIEURES.has(cam.vue);

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

/**
 * Les vues d'ensemble : deux prises aériennes et la façade depuis la voie.
 *
 * Elles ne se mesurent pas — ce sont des vues obliques, où une même longueur
 * ne couvre pas le même nombre de pixels selon qu'elle est au premier ou à
 * l'arrière-plan. Elles disent en revanche ce qu'aucune photo au sol ne
 * montre : la forme du site, le nombre d'accès, ce qui borde la propriété.
 */
const ENSEMBLE = [
  {
    fichier: 'v1-aerienne-large.jpg',
    legende: 'Vue aérienne d\'ensemble. Le bâtiment principal occupe toute la '
      + 'longueur du site ; la cour le borde sur sa face la plus longue.',
  },
  {
    fichier: 'v2-aerienne-proche.jpg',
    legende: 'Vue rapprochée. On distingue l\'auvent et les portes de quai le '
      + 'long de la façade, et les véhicules stationnés en cour.',
  },
  {
    fichier: 'v3-facade.jpg',
    legende: 'La façade des bureaux depuis la voie. Deux niveaux, fenêtres '
      + 'alignées, et des projecteurs déjà fixés en toiture.',
  },
];

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
    cle: 'stock',
    fichier: 'p6-coin-stock.jpg',
    titre: 'Halle — angle de travail et stock',
    prise: 'Depuis l\'intérieur, vers l\'angle des deux murs.',
    observations: [
      'Un angle de murs est le meilleur point de fixation d\'une halle : un seul '
        + 'objectif grand-angle y couvre les deux directions à la fois, sans mur '
        + 'dans son dos et sans angle mort derrière lui. C\'est là que se pose la '
        + 'caméra de cette zone, et nulle part ailleurs.',
      'Rayonnage garni à portée de main. Ce n\'est pas du volume à surveiller, '
        + 'c\'est de la marchandise à prouver : l\'exigence y est l\'identification, '
        + 'et un objectif de 2,8 mm ne l\'atteint qu\'à quatre mètres et demi. La '
        + 'caméra doit donc être posée SUR la zone, pas à l\'autre bout de la halle.',
      'Aucune ouverture sur l\'extérieur dans cet angle : tout l\'éclairage y est '
        + 'artificiel. Lumières éteintes, il ne reste que l\'infrarouge — et ce qu\'il '
        + 'éclaire, il l\'éclaire en noir et blanc.',
      'La charpente métallique et le bandeau technique en partie haute offrent des '
        + 'appuis et un cheminement de câble déjà en place, à vérifier.',
    ],
    cameras: ['C9'],
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
  {
    cle: 'sas',
    fichier: 'p7-sas-secours.jpg',
    titre: 'Sas isolé et issue de secours',
    prise: 'Depuis le sas, vers le fond et l\'issue.',
    observations: [
      'Une issue de secours au fond, barre anti-panique et extincteur. Elle '
        + 's\'ouvre de l\'intérieur SANS clé, et c\'est la loi : on ne la '
        + 'condamne pas. Du point de vue du vol, c\'est donc une porte de '
        + 'sortie permanente — celle par laquelle la marchandise part une fois '
        + 'qu\'on est entré par ailleurs. Elle se surveille, elle ne se ferme pas.',
      'Un couloir est la meilleure position pour un objectif de 2,8 mm. Il force '
        + 'le passage dans un goulot étroit et à courte distance : les quatre '
        + 'mètres et demi d\'identification, insuffisants dans une cour, '
        + 'suffisent ici largement.',
      'Les deux portes isolantes, ouvertes, masquent une bonne part du volume. '
        + 'Une caméra posée derrière un battant ouvert ne voit rien : le point de '
        + 'fixation doit être choisi portes OUVERTES, pas portes fermées.',
      'Plafond bas et poutres apparentes, éclairage au néon uniquement. Aucune '
        + 'lumière du jour : si l\'éclairage est coupé, seul l\'infrarouge reste.',
      'Des locaux isolés donnent sur ce sas. S\'il s\'agit de chambres froides, '
        + 'la température et la condensation conditionnent le choix du matériel '
        + 'et sa fixation — à relever.',
    ],
    cameras: [],
    manque: 'Aucune des neuf caméras ne couvre ce sas ni son issue de secours. '
      + 'C\'est une lacune, pas un oubli de rédaction : le parc a été arrêté sur '
      + 'cinq vues, et cette zone n\'en faisait pas partie.',
  },
  {
    cle: 'chariots',
    fichier: 'p8-chariots.jpg',
    titre: 'Zone de manutention et parc de chariots',
    prise: 'Depuis l\'allée, vers le fond de la halle.',
    observations: [
      'Une rangée de chariots élévateurs au fond. C\'est la concentration de '
        + 'valeur la plus évidente du site : un chariot se vole, se charge sur un '
        + 'plateau, et ne se retrouve pas. Cette zone-là mérite une caméra à elle '
        + 'seule, et l\'exigence y est l\'identification.',
      'Racks à palettes sur plusieurs niveaux, avec mezzanine. Chaque rack est un '
        + 'mur : il coupe les champs, et ce qui se passe dans l\'allée voisine ne '
        + 'se voit pas. Une caméra par allée, ou rien.',
      'Zone en exploitation, circulation permanente de chariots. La détection y '
        + 'se déclenchera toute la journée : le réglage doit distinguer les heures '
        + 'ouvrées du reste, sinon les alertes deviennent du bruit et plus '
        + 'personne ne les regarde.',
      'Éclairage au néon sous charpente et lanterneaux : fort contraste entre les '
        + 'allées éclairées et le dessous des racks, qui reste sombre en plein jour.',
    ],
    cameras: [],
    manque: 'Ni le parc de chariots ni les allées de racks ne sont couverts.',
  },
  {
    cle: 'volumeArriere',
    fichier: 'p9-volume-arriere.jpg',
    titre: 'Volume arrière et second rideau',
    champForce: null,
    prise: 'Depuis le milieu de la halle, vers le fond.',
    observations: [
      'Un SECOND rideau métallique au fond, que les premières vues ne montraient '
        + 'pas. C\'est un accès véhicule de plus, et il n\'entrait dans aucun '
        + 'comptage jusqu\'ici.',
      'Volume très étendu et en grande partie libre. Les traces de pneus au sol '
        + 'disent que les chariots y circulent d\'un bout à l\'autre : c\'est un '
        + 'axe de passage, pas un fond de halle.',
      'Un escalier ou une plateforme au milieu du volume. Tout ce qui monte crée '
        + 'un angle mort en dessous et un poste d\'observation au-dessus : à '
        + 'relever précisément.',
      'La profondeur de ce volume dépasse de loin les dix-huit mètres où le '
        + 'turret 2,8 mm permet encore d\'observer. Une caméra placée à une '
        + 'extrémité ne rendra compte que du premier tiers.',
    ],
    cameras: [],
    manque: 'Le second rideau métallique et le volume arrière ne sont pas couverts.',
  },
  {
    cle: 'porteVitree',
    fichier: 'p10-racks-porte-vitree.jpg',
    titre: 'Allée de racks et porte vitrée',
    prise: 'Depuis l\'allée, vers la porte de fond.',
    observations: [
      'Une porte rouge largement VITRÉE au fond. Un contact d\'ouverture n\'y '
        + 'suffirait pas : on casse le vitrage sans ouvrir le battant. C\'est le '
        + 'genre d\'accès qui se traite en même temps côté alarme et côté caméra.',
      'Les palettes-caisses en bois sont empilées haut et déplacées chaque jour. '
        + 'Une caméra calée sur la configuration du jour sera masquée la semaine '
        + 'suivante : viser les circulations, pas les emplacements de stockage.',
      'L\'armoire électrique visible au fond à droite est un point sensible : '
        + 'couper l\'alimentation d\'une installation commence souvent là. À '
        + 'protéger, et à relever pour l\'alimentation des caméras.',
      'Barrières de chaîne et rubalise : la zone est en réorganisation. '
        + 'L\'implantation définitive doit attendre l\'état final des racks.',
    ],
    cameras: [],
    manque: 'L\'allée de racks et la porte vitrée de fond ne sont pas couvertes.',
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
    vue: 'stock',
    modele: 'turret',
    role: 'Angle de travail et stock',
    pose: 'En angle des deux murs, 3 m, bissectrice — emplacement exact à confirmer',
    bande: 0.5,
    attendu: 'Couvrir les deux directions d\'un seul appareil et tenir le rayonnage '
      + 'à portée d\'identification. Posée en angle à trois mètres, elle identifie '
      + 'jusqu\'à quatre mètres et demi : le rayonnage doit se trouver dans cette '
      + 'distance, sinon elle ne fera que reconnaître.',
  },

  /*
   * EXTENSION PROPOSÉE — elle ne fait pas partie du parc déclaré.
   *
   * Cinq caméras pour les quatre zones relevées sans couverture. Elles
   * reprennent les mêmes références que le parc initial : une ligne de plus
   * au bon de commande, pas un second matériel à apprendre et à maintenir.
   *
   * Leurs emplacements disent LA ZONE, pas le point de fixation : aucun relevé
   * intérieur n'a été fait, et la position exacte dépend des racks, des
   * portes ouvertes et des alimentations disponibles.
   */
  {
    cle: 'C10',
    vue: 'sas',
    modele: 'turret',
    extension: true,
    role: 'Sas et issue de secours',
    pose: 'En plafond du sas, 2,8 m, dans l\'axe du couloir',
    bande: 0.5,
    attendu: 'Identifier au passage. Un couloir force le passage dans un goulot '
      + 'étroit et à courte distance : c\'est la zone du site où le 2,8 mm est le '
      + 'plus à son aise. À poser portes ouvertes, pour qu\'un battant ne la masque pas.',
  },
  {
    cle: 'C11',
    vue: 'chariots',
    modele: 'varifocal',
    tele: true,
    extension: true,
    role: 'Parc de chariots élévateurs',
    pose: 'Sur poteau ou charpente, 4 m, dans l\'axe de la rangée',
    bande: 0.5,
    attendu: 'Identifier qui approche des chariots. C\'est la concentration de '
      + 'valeur la plus évidente du site, et la seule optique du parc capable '
      + 'd\'identifier au-delà de cinq mètres est le motorisé au téléobjectif.',
  },
  {
    cle: 'C12',
    vue: 'chariots',
    modele: 'turret',
    extension: true,
    role: 'Allée de manutention',
    pose: 'En tête d\'allée, 3,5 m, vers le fond',
    bande: 0.5,
    attendu: 'Rendre compte de la circulation dans l\'allée principale. Chaque '
      + 'rack est un mur : cette caméra ne voit QUE cette allée, et les autres '
      + 'resteront sans image tant qu\'on n\'en équipe pas chacune.',
  },
  {
    cle: 'C13',
    vue: 'volumeArriere',
    modele: 'turret',
    extension: true,
    role: 'Second rideau métallique',
    pose: 'À l\'aplomb du rideau, 3 m, vers l\'intérieur',
    bande: 0.5,
    attendu: 'Identifier au franchissement du second accès véhicule. Même règle '
      + 'que pour le premier rideau : à l\'aplomb, sinon elle ne fait plus que '
      + 'de la détection.',
  },
  {
    cle: 'C14',
    vue: 'porteVitree',
    modele: 'turret',
    extension: true,
    role: 'Porte vitrée de fond',
    pose: 'Au-dessus de la porte, 3 m, vers l\'allée',
    bande: 0.5,
    attendu: 'Identifier au franchissement. Le vitrage impose de la traiter aussi '
      + 'côté alarme : un contact d\'ouverture ne voit pas une vitre cassée.',
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

/* --------------------------------------------------------- le plan masse */

/**
 * LES DIMENSIONS DU SITE — TOUTES ESTIMÉES.
 *
 * Aucune n'a été mesurée. Elles sont déduites des proportions lues sur la vue
 * aérienne, rapportées à une longueur de bâtiment supposée. C'est écrit sur
 * le plan lui-même, en toutes lettres, et ce n'est pas une précaution de
 * style : un plan d'implantation que l'on croirait mesuré conduirait à
 * commander des câbles trop courts et à poser une caméra là où elle ne voit
 * rien.
 *
 * UNE SEULE VALEUR À CORRIGER. `longueurBatiment` ci-dessous. Tout le reste
 * en découle : les proportions, elles, viennent bien de la vue aérienne.
 */
const SITE = {
  longueurBatiment: 75,
  profondeurBatiment: 22,
  annexe: { longueur: 18, profondeur: 10 },
  cour: { profondeur: 62 },
  marge: 12,
  estime: true,
};

/** Repère du plan : mètres, origine en haut à gauche du terrain. */
const PLAN = (() => {
  const b = SITE.longueurBatiment;
  const p = SITE.profondeurBatiment;
  const m = SITE.marge;
  const bat = { x: m, y: m, l: b, p };
  const annexe = {
    x: bat.x + bat.l, y: bat.y, l: SITE.annexe.longueur, p: SITE.annexe.profondeur,
  };
  const cour = {
    x: 0, y: bat.y + bat.p, l: bat.l + annexe.l + m * 2, p: SITE.cour.profondeur,
  };
  return {
    bat,
    annexe,
    cour,
    quai: { x: bat.x + bat.l * 0.3, y: bat.y + bat.p, l: bat.l * 0.65, p: 3.5 },
    portail: { x: m * 0.4, y: cour.y + cour.p - 6, l: 7 },
    largeur: cour.l,
    hauteur: cour.y + cour.p + 4,
  };
})();

/**
 * Où va chaque caméra, et dans quelle direction.
 *
 * `azimut` en degrés, 0 = vers le haut du plan, sens horaire. Ce ne sont pas
 * des points relevés : ce sont les emplacements que les photos et la vue
 * aérienne désignent, à confirmer au passage.
 *
 * Les deux caméras d'entrée sont posées EN RETRAIT du portail et regardent
 * vers lui. C'est la seule façon de tenir une plaque : le véhicule entre dans
 * le champ de face, et le téléobjectif l'identifie à vingt-huit mètres. Une
 * caméra posée sur le portail même ne verrait que des toits de voiture.
 */
const IMPLANTATION = {
  C1: { x: PLAN.portail.x + 16, y: PLAN.portail.y - 22, azimut: 180 },
  C2: { x: PLAN.portail.x + 24, y: PLAN.portail.y - 22, azimut: 180 },
  C3: { x: PLAN.bat.x + PLAN.bat.l * 0.24, y: PLAN.cour.y + 1.5, azimut: 168 },
  C4: { x: PLAN.cour.x + PLAN.cour.l - 9, y: PLAN.cour.y + PLAN.cour.p * 0.5, azimut: 250 },
  C5: { x: PLAN.bat.x + PLAN.bat.l * 0.76, y: PLAN.cour.y + 1.5, azimut: 196 },
  C6: { x: PLAN.bat.x + PLAN.bat.l * 0.58, y: PLAN.cour.y + 1.5, azimut: 180 },
  C7: { x: PLAN.bat.x + 3.5, y: PLAN.bat.y + PLAN.bat.p * 0.62, azimut: 90 },
  C8: { x: PLAN.bat.x + PLAN.bat.l - 3.5, y: PLAN.bat.y + PLAN.bat.p * 0.62, azimut: 270 },
  // En angle : la bissectrice des deux murs, soit 135° dans ce coin du plan.
  C9: { x: PLAN.bat.x + PLAN.bat.l * 0.34, y: PLAN.bat.y + 2.5, azimut: 135 },
  // Extension : positions INDICATIVES, faute de relevé intérieur.
  C10: { x: PLAN.bat.x + PLAN.bat.l * 0.88, y: PLAN.bat.y + PLAN.bat.p * 0.3, azimut: 170 },
  C11: { x: PLAN.bat.x + PLAN.bat.l * 0.14, y: PLAN.bat.y + PLAN.bat.p * 0.28, azimut: 95 },
  C12: { x: PLAN.bat.x + PLAN.bat.l * 0.45, y: PLAN.bat.y + 2.5, azimut: 150 },
  C13: { x: PLAN.bat.x + PLAN.bat.l * 0.94, y: PLAN.bat.y + PLAN.bat.p * 0.8, azimut: 300 },
  C14: { x: PLAN.bat.x + PLAN.bat.l * 0.68, y: PLAN.bat.y + PLAN.bat.p * 0.86, azimut: 25 },
};

/**
 * Le plan d'implantation, à l'échelle de la longueur supposée.
 *
 * L'ordre de tracé compte : le fond, puis les bâtiments PLEINS, puis les
 * champs, puis les contours. Les champs des caméras intérieures se voyaient
 * autrement recouverts par la halle, et le plan donnait à croire qu'elles ne
 * couvraient rien.
 */
/**
 * @param {object} [options]
 * @param {string[]} [options.focus] n'éclairer que ces caméras. Les autres
 *   restent posées, en gris : le lecteur voit où il se trouve dans le site
 *   sans perdre de vue le reste du parc.
 * @param {boolean} [options.compact] version réduite, pour l'en-tête d'une vue.
 */
function planMasse(options = {}) {
  const focus = options.focus || null;
  const compact = !!options.compact;
  const E = compact ? 5.5 : 9; // pixels par mètre
  const L = PLAN.largeur * E;
  const H = PLAN.hauteur * E;
  const px = (m) => (m * E).toFixed(1);
  const rect = (r, attrs) => `<rect x="${px(r.x)}" y="${px(r.y)}" width="${px(r.l)}"
    height="${px(r.p)}" ${attrs}/>`;

  /** Un secteur circulaire, en mètres, sur le plan. */
  const secteur = (c, rayon, angle, couleur, opacite) => {
    const a0 = ((c.azimut - angle / 2) * Math.PI) / 180;
    const a1 = ((c.azimut + angle / 2) * Math.PI) / 180;
    const pt = (a) => [px(c.x + rayon * Math.sin(a)), px(c.y - rayon * Math.cos(a))];
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    const grand = angle > 180 ? 1 : 0;
    return `<path d="M ${px(c.x)} ${px(c.y)} L ${x0} ${y0} A ${px(rayon)} ${px(rayon)}
      0 ${grand} 1 ${x1} ${y1} Z" fill="${couleur}" opacity="${opacite}"/>`;
  };

  const champs = CAMERAS.filter((cam) => !focus || focus.includes(cam.cle)).map((cam) => {
    const c = IMPLANTATION[cam.cle];
    const m = MODELES[cam.modele];
    const o = optiqueUtile(m, cam.tele);
    const p = portees(m, cam.tele);
    // Le panoramique couvre le double de ce que dit son capteur unique.
    const angle = m.capteurUnique ? 180 : o.angleH;
    return `<g>
      ${secteur(c, p.observation, angle, '#5b6472', 0.16)}
      ${secteur(c, p.reconnaissance, angle, '#9d0c24', 0.22)}
      ${secteur(c, p.identification, angle, '#c8102e', 0.5)}
    </g>`;
  }).join('');

  const r = compact ? 6.5 : 8.5;
  const pastilles = CAMERAS.map((cam) => {
    const c = IMPLANTATION[cam.cle];
    const vif = !focus || focus.includes(cam.cle);
    return `<g opacity="${vif ? 1 : 0.35}">
      <circle cx="${px(c.x)}" cy="${px(c.y)}" r="${r}"
        fill="${vif ? (cam.extension ? '#9d0c24' : '#1a1d23') : '#8a9099'}"
        stroke="#fff" stroke-width="1.5"
        ${cam.extension ? 'stroke-dasharray="3 2"' : ''}/>
      <text x="${px(c.x)}" y="${(c.y * E + r * 0.4).toFixed(1)}"
        font-size="${compact ? 7.5 : 9.5}" font-weight="700" fill="#fff"
        text-anchor="middle">${ech(cam.cle)}</text>
    </g>`;
  }).join('');

  const cote = compact ? '' : `<g stroke="#1a1d23" stroke-width="1" fill="#1a1d23">
    <line x1="${px(PLAN.bat.x)}" y1="${px(PLAN.bat.y - 5)}"
      x2="${px(PLAN.bat.x + PLAN.bat.l)}" y2="${px(PLAN.bat.y - 5)}"/>
    <line x1="${px(PLAN.bat.x)}" y1="${px(PLAN.bat.y - 7)}" x2="${px(PLAN.bat.x)}"
      y2="${px(PLAN.bat.y - 3)}"/>
    <line x1="${px(PLAN.bat.x + PLAN.bat.l)}" y1="${px(PLAN.bat.y - 7)}"
      x2="${px(PLAN.bat.x + PLAN.bat.l)}" y2="${px(PLAN.bat.y - 3)}"/>
    <text x="${px(PLAN.bat.x + PLAN.bat.l / 2)}" y="${px(PLAN.bat.y - 7.5)}"
      font-size="12.5" font-weight="700" text-anchor="middle" stroke="none"
      >${ech(SITE.longueurBatiment)} m — longueur supposée, à confirmer</text>
  </g>`;

  const xE = PLAN.largeur - 30;
  const yE = PLAN.hauteur - 5;
  const echelle = compact ? '' : `<g stroke="#1a1d23" stroke-width="1.5" fill="#1a1d23">
    <line x1="${px(xE)}" y1="${px(yE)}" x2="${px(xE + 20)}" y2="${px(yE)}"/>
    <line x1="${px(xE)}" y1="${px(yE - 1.5)}" x2="${px(xE)}" y2="${px(yE + 1.5)}"/>
    <line x1="${px(xE + 20)}" y1="${px(yE - 1.5)}" x2="${px(xE + 20)}" y2="${px(yE + 1.5)}"/>
    <text x="${px(xE + 10)}" y="${px(yE - 2.5)}" font-size="11" text-anchor="middle"
      stroke="none">20 m</text>
  </g>`;

  return `<svg viewBox="0 0 ${L.toFixed(0)} ${H.toFixed(0)}"
    class="plan${compact ? ' compact' : ''}" role="img"
    aria-label="Plan d'implantation des neuf caméras, avec leurs champs">
    <defs><clipPath id="cadre">
      <rect x="0" y="0" width="${L.toFixed(0)}" height="${H.toFixed(0)}"/>
    </clipPath></defs>
    <g clip-path="url(#cadre)">
      ${rect(PLAN.cour, 'fill="#eceef1"')}
      ${rect(PLAN.bat, 'fill="#dfe3e9"')}
      ${rect(PLAN.annexe, 'fill="#eef0f3"')}
      ${champs}
      ${rect(PLAN.cour, 'fill="none" stroke="#c9cfd8" stroke-width="1"')}
      ${rect(PLAN.bat, 'fill="none" stroke="#5b6472" stroke-width="1.6"')}
      ${rect(PLAN.annexe, 'fill="none" stroke="#5b6472" stroke-width="1.6"')}
      ${rect(PLAN.quai, 'fill="none" stroke="#5b6472" stroke-width="1" stroke-dasharray="5 3"')}
      ${compact ? '' : `<text x="${px(PLAN.bat.x + 3)}" y="${px(PLAN.bat.y + 6)}"
        font-size="13" font-weight="700" fill="#5b6472">HALLE</text>`}
      ${compact ? '' : `<text x="${px(PLAN.annexe.x + PLAN.annexe.l / 2)}"
        y="${px(PLAN.annexe.y + 5.5)}" font-size="9.5" font-weight="700" fill="#5b6472"
        text-anchor="middle">BUREAUX</text>`}
      ${compact ? '' : `<text x="${px(PLAN.quai.x + 1.5)}" y="${px(PLAN.quai.y + 2.5)}"
        font-size="9.5" fill="#5b6472">quais de chargement</text>`}
      ${compact ? '' : `<text x="${px(PLAN.cour.x + 3)}" y="${px(PLAN.cour.y + 10)}"
        font-size="13" font-weight="700" fill="#8a9099">COUR</text>`}
      <rect x="${px(PLAN.portail.x)}" y="${px(PLAN.portail.y)}" width="${px(PLAN.portail.l)}"
        height="${px(0.8)}" fill="#1a1d23"/>
      ${compact ? '' : `<text x="${px(PLAN.portail.x)}" y="${px(PLAN.portail.y + 4)}"
        font-size="11" font-weight="700" fill="#1a1d23">PORTAIL</text>`}
      ${pastilles}
      ${cote}
      ${echelle}
    </g>
  </svg>`;
}


/* ------------------------------------------- le repérage sur vue aérienne */

/**
 * Où poser chaque repère sur la vue aérienne, en fraction de l'image.
 *
 * `x` et `y` de 0 à 1, `azimut` en degrés — 0 vers le haut de l'image, sens
 * horaire.
 *
 * CES POSITIONS SONT INDICATIVES, et le document le dit sous l'image. La vue
 * est OBLIQUE : une même longueur n'y couvre pas le même nombre de pixels
 * selon qu'elle est au premier ou à l'arrière-plan. On ne peut donc pas y
 * reporter une portée à l'échelle — seulement une DIRECTION. Les distances,
 * elles, sont au plan masse.
 */
const REPERAGE = {
  C1: { x: 0.300, y: 0.880, azimut: 200 },
  C2: { x: 0.362, y: 0.880, azimut: 190 },
  C3: { x: 0.245, y: 0.575, azimut: 160 },
  C4: { x: 0.830, y: 0.800, azimut: 285 },
  C5: { x: 0.655, y: 0.575, azimut: 200 },
  C6: { x: 0.500, y: 0.580, azimut: 180 },
  C7: { x: 0.160, y: 0.420, azimut: 95 },
  C8: { x: 0.660, y: 0.505, azimut: 275 },
  C9: { x: 0.320, y: 0.285, azimut: 145 },
  C10: { x: 0.800, y: 0.300, azimut: 205 },
  C11: { x: 0.175, y: 0.300, azimut: 105 },
  C12: { x: 0.400, y: 0.270, azimut: 165 },
  C13: { x: 0.805, y: 0.520, azimut: 310 },
  C14: { x: 0.545, y: 0.485, azimut: 25 },
};

/** Noir dehors, bleu dedans — c'est la clé de lecture de l'image. */
const COULEUR_DEHORS = '#111418';
const COULEUR_DEDANS = '#1d5fb4';

/**
 * La vue aérienne, avec les repères et les directions de visée.
 *
 * Le secteur tracé dit la DIRECTION, pas la portée : sa longueur est la même
 * pour toutes les caméras. Lui donner la portée réelle sur une vue oblique
 * reviendrait à afficher une mesure fausse.
 */
function repereAerien(vueAerienne) {
  const L = 1000;
  const H = 561;
  const marques = CAMERAS.map((cam) => {
    const r = REPERAGE[cam.cle];
    if (!r) return '';
    const couleur = dehors(cam) ? COULEUR_DEHORS : COULEUR_DEDANS;
    const x = r.x * L;
    const y = r.y * H;
    const angle = (cam.tele ? 26 : 74) / 2;
    const portee = cam.tele ? 92 : 62;
    const pt = (d) => {
      const a = ((r.azimut + d) * Math.PI) / 180;
      return `${(x + portee * Math.sin(a)).toFixed(1)} ${(y - portee * Math.cos(a)).toFixed(1)}`;
    };
    return `<g>
      <path d="M ${x.toFixed(1)} ${y.toFixed(1)} L ${pt(-angle)} L ${pt(angle)} Z"
        fill="${couleur}" opacity=".34" stroke="${couleur}" stroke-width="1.6"
        stroke-opacity=".8" ${cam.extension ? 'stroke-dasharray="6 4"' : ''}/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="${couleur}"
        stroke="#fff" stroke-width="2.4"
        ${cam.extension ? 'stroke-dasharray="4 3"' : ''}/>
      <text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11.5"
        font-weight="700" fill="#fff" text-anchor="middle">${ech(cam.cle)}</text>
    </g>`;
  }).join('');

  return `<figure class="aerien">
    <div class="calque">
      <img src="${vueAerienne.src}" alt="Vue aérienne du site avec le repérage des caméras">
      <svg viewBox="0 0 ${L} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${marques}
      </svg>
    </div>
    <figcaption>Repérage de principe sur la vue aérienne. Le secteur indique la
      <b>direction de visée</b>, pas la portée&nbsp;: la vue est oblique, une
      distance ne s'y mesure pas. Les portées à l'échelle sont au plan masse.</figcaption>
  </figure>

  <p class="cles">
    <span><i style="background:${COULEUR_DEHORS}"></i> caméra extérieure</span>
    <span><i style="background:${COULEUR_DEDANS}"></i> caméra intérieure</span>
    <span><i style="background:#fff;border:2px dashed ${COULEUR_DEDANS}"></i>
      cerclée de pointillés&nbsp;: extension proposée</span>
  </p>`;
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

    <div class="situation">
      ${planMasse({ focus: cams.length ? cams.map((c) => c.cle) : ['—'], compact: true })}
      <p>${cams.length
    ? `Où l'on se trouve dans le site, et ce que couvrent les caméras de cette
       vue — ${ech(cams.map((c) => c.cle).join(' et '))}. Le reste du parc reste
       posé, en gris.`
    : 'Aucun secteur n\'est éclairé : cette zone n\'est couverte par aucune des '
      + 'neuf caméras. Le parc figure en gris, à titre de repère.'}</p>
    </div>

    <h3>Ce que montre la vue</h3>
    <ul class="obs">${vue.observations.map((o) => `<li>${ech(o)}</li>`).join('')}</ul>

    ${vue.manque ? `<div class="avert">
      <b>Zone non couverte.</b> ${ech(vue.manque)}
      Deux façons d'y répondre, et elles n'ont pas le même prix&nbsp;:
      déplacer C7, qui ne fait aujourd'hui qu'une vue d'ensemble de la halle
      et dont l'apport est le plus faible du parc&nbsp;; ou ajouter une
      dixième caméra. Le choix appartient au client, et il se fait sur
      l'enjeu&nbsp;: ce qui est stocké derrière ces portes.
    </div>` : ''}

    <h3>${cams.length ? 'Caméras proposées' : 'Aucune caméra proposée à ce jour'}</h3>
    ${cams.map((c) => {
    const m = MODELES[c.modele];
    const p = portees(m, c.tele);
    return `<div class="camera">
        <h4><span class="puce${c.extension ? ' ext' : ''}">${ech(c.cle)}</span>
          ${ech(c.role)}${c.extension
    ? ' <span class="badge">extension proposée</span>' : ''}</h4>
        <div class="ligne-modele">
          ${m.vignetteSrc ? `<img class="mini" src="${m.vignetteSrc}"
            alt="${ech(m.reference)}">` : ''}
          <div>
            <p class="modele-nom">${ech(m.reference)}${
  c.tele ? ' — réglée au téléobjectif' : ''}</p>
            <p class="situe" style="color:${dehors(c) ? COULEUR_DEHORS : COULEUR_DEDANS}"
              >${dehors(c) ? '● Caméra extérieure' : '● Caméra intérieure'}</p>
          </div>
        </div>
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

for (const v of ENSEMBLE) v.src = image(join(ici, 'photos', v.fichier));

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

/*
 * Le compte des zones couvertes.
 *
 * Calculé, pas écrit : le parc a été arrêté sur cinq vues, et les photos
 * transmises depuis en montrent d'autres. Ce comptage est ce qui distingue
 * une étude d'une liste de matériel — il dit si l'un répond à l'autre.
 */
const PARC = CAMERAS.filter((c) => !c.extension);
const EXTENSION = CAMERAS.filter((c) => c.extension);
const couvertes = VUES.filter((v) => PARC.some((c) => c.vue === v.cle));
const decouvertes = VUES.filter((v) => !PARC.some((c) => c.vue === v.cle));
const restantes = VUES.filter((v) => !CAMERAS.some((c) => c.vue === v.cle));

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
  .bandeau-agence { display:flex; gap:22px; align-items:center; margin-bottom:26px;
    padding-bottom:20px; border-bottom:3px solid var(--rouge); }
  .bandeau-agence img { height:104px; width:auto; display:block; flex:none; }
  .coordonnees { font-size:13.5px; color:var(--doux); line-height:1.5; }
  .coordonnees p { margin:0; }
  .coordonnees .nom { font-size:19px; font-weight:800; color:var(--encre);
    letter-spacing:-.01em; }
  .garde .surtitre { color:var(--rouge); font-weight:700; letter-spacing:.1em;
    text-transform:uppercase; font-size:12px; margin-bottom:10px; }
  .garde .meta { margin-top:26px; border-top:1px solid var(--bord); padding-top:16px;
    color:var(--doux); font-size:14px; }
  .garde .meta b { color:var(--encre); }
  .avert { background:#fff8e6; border:1px solid #f0d9a0; border-radius:8px;
    padding:14px 16px; margin:18px 0; font-size:14px; }
  .avert b { color:#8a5a00; }
  .alerte { border:2px solid var(--rouge); border-radius:10px; padding:18px 20px;
    margin:22px 0; background:#fff5f6; page-break-inside:avoid; }
  .alerte h3 { margin-top:0; color:var(--rouge); font-size:18px; }
  .alerte p:last-child { margin-bottom:0; }
  ul.obs, ul.liste { margin:0 0 12px; padding-left:20px; }
  ul.obs li, ul.liste li { margin-bottom:8px; }
  .prise { color:var(--doux); font-size:14px; }
  figure.ensemble { margin:0 0 18px; page-break-inside:avoid; }
  figure.ensemble img { width:100%; display:block; border-radius:8px;
    border:1px solid var(--bord); }
  figure.ensemble figcaption { font-size:13.5px; color:var(--doux); margin-top:6px; }
  svg.plan { width:100%; height:auto; display:block; border:1px solid var(--bord);
    border-radius:8px; background:#fff; margin:14px 0 10px; }
  .legende-plan { font-size:13.5px; color:var(--doux); }
  .cles { display:flex; flex-wrap:wrap; gap:6px 22px; font-size:13px; color:var(--doux);
    margin:0 0 10px; }
  .cles span { display:flex; align-items:center; gap:7px; }
  .cles i { width:22px; height:12px; border-radius:3px; display:block;
    border:1px solid #c9cfd8; }
  .situation { display:flex; gap:16px; align-items:center; margin:12px 0 18px;
    padding:12px 14px; background:var(--fond); border:1px solid var(--bord);
    border-radius:10px; page-break-inside:avoid; }
  .situation svg.plan.compact { flex:1 1 320px; max-width:420px; margin:0;
    border:0; background:transparent; }
  .situation p { flex:1 1 200px; margin:0; font-size:13.5px; color:var(--doux); }
  .camera { border:1px solid var(--bord); border-radius:10px; padding:16px 18px;
    margin:16px 0; page-break-inside:avoid; }
  .puce { display:inline-block; min-width:34px; padding:2px 8px; border-radius:20px;
    background:var(--encre); color:#fff; font-size:13px; text-align:center; margin-right:6px; }
  .puce.ext { background:var(--rouge); border:2px dashed #fff; box-shadow:0 0 0 1px var(--rouge); }
  .badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:11px;
    font-weight:700; text-transform:uppercase; letter-spacing:.04em;
    background:#fff5f6; color:var(--rouge); border:1px solid var(--rouge); }
  tr.ext td { color:var(--rouge); }
  .alerte h3.sous { font-size:16px; margin:18px 0 8px; }
  .modele-nom { color:var(--doux); font-size:14px; margin-bottom:2px; }
  .ligne-modele { display:flex; gap:12px; align-items:center; margin-bottom:8px; }
  .ligne-modele .mini { width:62px; height:auto; flex:none; border:1px solid var(--bord);
    border-radius:6px; background:#fff; }
  .situe { font-size:12.5px; font-weight:700; margin:0; }
  figure.aerien { margin:0 0 10px; page-break-inside:avoid; }
  figure.aerien .calque { position:relative; line-height:0; }
  figure.aerien img { width:100%; display:block; border-radius:8px;
    border:1px solid var(--bord); }
  figure.aerien svg { position:absolute; inset:0; width:100%; height:100%; }
  figure.aerien figcaption { font-size:13.5px; color:var(--doux); margin-top:6px;
    line-height:1.5; }
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
  <div class="bandeau-agence">
    <img src="${logo}" alt="${ech(AGENCE.nom)}">
    <div class="coordonnees">
      <p class="nom">${ech(AGENCE.nom)}</p>
      <p>${ech(AGENCE.accroche)}</p>
      <p>${ech(AGENCE.adresse)}</p>
      <p>${ech(AGENCE.courriel)}</p>
      <p>${AGENCE.sites.map((s) => ech(s)).join(' · ')}</p>
      <p>${ech(AGENCE.rcs)} · ${ech(AGENCE.zone)}</p>
    </div>
  </div>
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

  ${MENTIONS_CONFIRMEES ? '' : `
  <div class="avert">
    <b>Mentions à vérifier avant remise.</b> Relevées sur les pages publiques
    de l'agence par recherche documentaire — les pages elles-mêmes n'ont pas pu
    être ouvertes. Une adresse ou un numéro faux sur un devis se retourne
    contre celui qui le signe&nbsp;:
    ${AGENCE.aConfirmer.map((x) => `<br>— ${ech(x)}`).join('')}
    <br><br><b>Et ce qui manque encore</b>, qui ne se devine pas&nbsp;:
    ${AGENCE.aCompleter.map((x) => `<br>— ${ech(x)}`).join('')}
  </div>`}
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

<h2>3. Le site vu d'ensemble</h2>

<p>Trois vues complètent les prises au sol : deux aériennes et la façade depuis
  la voie. Elles ne se mesurent pas — ce sont des vues obliques, où une même
  longueur ne couvre pas le même nombre de pixels selon qu'elle est au premier
  ou à l'arrière-plan. Elles disent en revanche ce qu'aucune photo au sol ne
  montre.</p>

${ENSEMBLE.map((v) => `<figure class="ensemble">
  <img src="${v.src}" alt="">
  <figcaption>${ech(v.legende)}</figcaption>
</figure>`).join('')}

<h3>Ce que la vue du ciel apprend</h3>
<ul class="obs">
  <li><b>Un seul bâtiment, très allongé.</b> La cour le borde sur sa face la
    plus longue : c'est cette face qui porte les quais, et c'est donc là que se
    concentre l'exposition.</li>
  <li><b>Un seul accès carrossable</b>, celui du portail photographié. Tout
    véhicule y passe — ce qui donne à la caméra d'identification de l'entrée
    une valeur que rien d'autre ne remplace.</li>
  <li><b>La cour est vaste et sans obstacle.</b> C'est le point dur de
    l'affaire, et il est chiffrable : au grand-angle, le bullet motorisé
    n'observe que jusqu'à
    ${ech(fr(portees(MODELES.varifocal, false).observation))}&nbsp;m et ne
    reconnaît personne au-delà de
    ${ech(fr(portees(MODELES.varifocal, false).reconnaissance))}&nbsp;m. Une
    cour de cinquante mètres ou plus ne se couvre donc pas d'un bout à l'autre
    avec ce parc — elle se couvre aux endroits qui comptent.</li>
  <li><b>La propriété est bordée d'arbres et d'une voie ferrée.</b> Aucune
    clôture continue n'apparaît sur les vues. Le périmètre n'est pas fermé :
    les caméras ne remplaceront pas ce qui manque, elles le constateront.</li>
  <li><b>Des projecteurs sont déjà en place</b> en toiture et en façade. Ils
    décideront de ce que les caméras voient la nuit bien plus que leur
    définition : à relever un par un lors du passage.</li>
</ul>

<h3>Repérage des caméras sur la vue aérienne</h3>

<p>Chaque caméra est posée sur la vue du ciel, avec sa direction de visée.
  <b>Les repères noirs sont les caméras extérieures</b>, les <b>bleus les
  caméras intérieures</b>. Un cercle en pointillés marque une caméra de
  l'extension proposée.</p>

${repereAerien(ENSEMBLE[0])}

<h3>Plan d'implantation</h3>

<p>Les proportions du plan ci-dessous sont relevées sur la vue aérienne. Sa
  dimension, elle, repose sur <b>une seule valeur supposée</b> : une longueur
  de bâtiment de ${ech(SITE.longueurBatiment)}&nbsp;m. Les champs des caméras,
  eux, sont exacts — ils ne dépendent que de l'optique. Ce que le plan montre
  donc, c'est le rapport entre ce que couvrent vos caméras et l'étendue du
  site&nbsp;; ce rapport se corrige d'un chiffre.</p>

${planMasse()}

<p class="cles">
  <span><i style="background:#c8102e;opacity:.5"></i> identifie un inconnu</span>
  <span><i style="background:#9d0c24;opacity:.22"></i> reconnaît une personne connue</span>
  <span><i style="background:#5b6472;opacity:.16"></i> observe une action</span>
</p>

<p class="legende-plan"><b>Lecture.</b> Chaque secteur montre trois profondeurs
  pour une même caméra&nbsp;: en gris clair jusqu'où elle permet d'observer une
  action, en rouge sombre jusqu'où elle permet de reconnaître une personne
  connue, en rouge vif jusqu'où elle identifie un inconnu. C'est le rouge vif
  qui compte devant un tribunal, et l'on voit d'un coup d'œil qu'il ne couvre
  presque rien de la cour&nbsp;: c'est voulu, et c'est la raison pour laquelle
  les turrets sont placées aux seuils et non en surplomb.</p>

<div class="avert">
  <b>Une longueur, et le plan devient exact.</b>
  La façade du bâtiment, la largeur du portail, l'entraxe de deux poteaux
  d'éclairage&nbsp;: n'importe laquelle suffit. Tout le reste se recale dessus,
  y compris les longueurs de câble et les distances de pose. Tant qu'elle n'est
  pas confirmée, <b>ce plan vaut comme schéma de principe, pas comme document
  d'exécution</b>.
</div>

<div class="alerte">
  <h3>Le parc et le site ne sont plus à la même échelle</h3>
  <p>Les ${ech(PARC.length)} caméras du parc déclaré ont été arrêtées sur
    <b>cinq vues</b>. Les photos transmises depuis en montrent
    <b>${ech(VUES.length)}</b>. Le compte est sans appel&nbsp;:
    <b>${ech(couvertes.length)} zones couvertes</b>,
    <b>${ech(decouvertes.length)} zones sans aucune caméra</b>.</p>
  <p>Ce ne sont pas des recoins. Il s'agit d'une issue de secours, d'un second
    rideau métallique, d'un parc de chariots élévateurs, d'une porte vitrée et
    de plusieurs allées de racks — autrement dit, d'accès et de valeurs.</p>
  <ul class="liste">
    ${decouvertes.map((v) => `<li><b>${ech(v.titre)}</b> — ${ech(v.manque || '')}</li>`).join('')}
  </ul>
  <p><b>Ce que cela veut dire, et ce que cela ne veut pas dire.</b> Les
    ${ech(PARC.length)} caméras retenues restent bien choisies pour ce qu'elles
    couvrent&nbsp;: rien n'est à jeter. Mais présenter cette installation comme
    couvrant le site serait inexact, et il vaut mieux le dire maintenant
    qu'après la pose.</p>

  <h3 class="sous">Extension proposée&nbsp;: ${ech(EXTENSION.length)} caméras</h3>
  <p>Elles reprennent les mêmes références que le parc initial — une ligne de
    plus au bon de commande, pas un second matériel à apprendre et à
    maintenir. Elles portent les repères ${ech(EXTENSION.map((c) => c.cle).join(', '))}
    et apparaissent partout en <b>rouge, cerclées de pointillés</b>, pour qu'on
    ne les confonde jamais avec le parc déclaré.</p>
  <table>
    <thead><tr><th>Repère</th><th>Zone</th><th>Modèle</th>
      <th class="n">Identifie&nbsp;jusqu'à</th></tr></thead>
    <tbody>${EXTENSION.map((c) => {
    const m = MODELES[c.modele];
    const v = VUES.find((x) => x.cle === c.vue);
    return `<tr><td><b>${ech(c.cle)}</b></td><td>${ech(v.titre)}</td>
      <td>${ech(m.reference.replace('Hikvision ', ''))}${c.tele ? ' (télé)' : ''}</td>
      <td class="n">${ech(fr(portees(m, c.tele).identification))} m</td></tr>`;
  }).join('')}</tbody>
  </table>
  <p><b>Ce que l'extension ne règle pas.</b> Une caméra par allée de racks
    serait nécessaire pour voir toutes les allées&nbsp;: C12 n'en couvre qu'une.
    Et la profondeur du volume arrière dépasse ce qu'une seule caméra rend.
    ${restantes.length === 0
    ? 'Chaque zone relevée reçoit au moins une caméra — ce qui n\'est pas la même chose que d\'être entièrement couverte.'
    : `${ech(restantes.length)} zone(s) resteraient sans image.`}</p>
  <p>Le client garde la main&nbsp;: <b>retenir l'extension</b>,
    <b>arbitrer</b> en actant par écrit que certaines zones restent sans image,
    ou <b>phaser</b> — les accès et les valeurs d'abord, le volume ensuite.
    Aucun de ces choix n'appartient à l'installateur.</p>
</div>

${VUES.map(sectionVue).join('')}

<h2>4. Synthèse du parc</h2>
<p><b>${ech(PARC.length)} caméras déclarées</b> pour ${ech(couvertes.length)} des
  ${ech(VUES.length)} zones relevées, et <b>${ech(EXTENSION.length)} proposées en
  extension</b> pour les ${ech(decouvertes.length)} autres — soit
  ${ech(CAMERAS.length)} au total si l'extension est retenue. Les lignes en
  rouge sont celles de l'extension&nbsp;: elles ne sont pas commandées.</p>
<table>
  <thead><tr><th>Repère</th><th>Emplacement</th><th>Modèle</th><th>Rôle</th>
    <th class="n">Identifie&nbsp;jusqu'à</th></tr></thead>
  <tbody>
    ${CAMERAS.map((c) => {
    const m = MODELES[c.modele];
    const vue = VUES.find((v) => v.cle === c.vue);
    return `<tr${c.extension ? ' class="ext"' : ''}>
        <td><b>${ech(c.cle)}</b></td>
        <td>${ech(vue.titre)}</td>
        <td>${ech(m.reference.replace('Hikvision ', ''))}${c.tele ? ' (télé)' : ''}</td>
        <td>${ech(c.role)}</td>
        <td class="n">${ech(fr(portees(m, c.tele).identification))} m</td>
      </tr>`;
  }).join('')}
  </tbody>
</table>

<h2>5. Réseau, enregistrement, stockage</h2>
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

<h2>6. Ce qu'il reste à mesurer sur place</h2>
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
  <li><b>La distance entre l'angle retenu et le rayonnage.</b> Elle décide si
    C9 identifie ou se contente de reconnaître : la bascule se fait à quatre
    mètres et demi.</li>
</ul>

<h2>7. Réserves et obligations</h2>
<ul class="liste">
  <li>Ce document est une étude technique. Il ne vaut ni devis ni engagement de
    prix&nbsp;: aucun montant n'y figure.</li>
  <li>Les caractéristiques optiques sont à confirmer sur les fiches
    constructeur des références exactes commandées.</li>
  <li>Le plan d'implantation est tracé pour une longueur de bâtiment supposée
    de ${ech(SITE.longueurBatiment)} m. Aucune dimension du site n'a été
    mesurée. Le plan est un schéma de principe ; il ne vaut pas plan
    d'exécution et ne doit pas servir à commander des longueurs de câble.</li>
  <li>Les vues aériennes proviennent d'un service de cartographie grand public.
    Elles datent de la prise de vue du service, pas d'aujourd'hui, et portent
    un repère commercial qui identifie le voisinage — à retirer si le document
    doit circuler.</li>
  <li>Les vues de matériel sont des visuels catalogue fournis par l'agence,
    rapprochés de chaque référence à la forme : deux objectifs pour le
    panoramique, un bullet à objectif motorisé pour le varifocal, un turret
    pour le modèle fixe. Le rapprochement est à confirmer, et l'aspect réel
    peut varier selon la révision livrée.</li>
  <li>Une caméra qui filme au-delà de la propriété — voie publique, parcelle
    voisine — relève d'une autorisation préfectorale. À cadrer avant la pose.</li>
  <li><b>Une caméra qui couvre un poste de travail n'obéit pas aux mêmes règles
    qu'une caméra de cour.</b> L'angle relevé en halle comporte des bureaux
    occupés : filmer en continu un salarié à son poste est encadré, et une
    installation qui le ferait sans justification proportionnée s'expose à être
    contestée — y compris par le salarié lui-même. Le champ de C9 est à orienter
    sur le rayonnage et les circulations, pas sur les plans de travail.
    L'information des salariés et la consultation des représentants du personnel
    obéissent par ailleurs à des règles propres, distinctes de l'information des
    visiteurs.</li>
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
