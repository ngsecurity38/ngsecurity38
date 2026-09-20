/**
 * Analyse de vue d'angle — interface.
 *
 * Toute la logique de calcul vit dans optique.js / alignement.js / diagnostic.js,
 * qui sont testés sous Node. Ce fichier ne fait que l'assemblage : formulaire,
 * chargement des images, rendu des toiles, rapport.
 */

import {
  CAPTEURS, SEUILS_DORI, anglesDeChamp, couverture, focaleRequise,
  pixelsParMetre, tableauDori, niveauDori, zoneMorte, radians,
} from './optique.js';
import {
  versGris, redimensionner, pretraiter, correlation, estimerTransformation,
} from './alignement.js';
import { diagnostiquer, LIBELLES_VERDICT, TOLERANCES_DEFAUT } from './diagnostic.js';
import { estPdf, ouvrirSelecteurPdf } from './etude-pdf.js';
import { $, $$ } from './dom.js';
import { frGroupe } from './format.js';
import { champsPourCamera, confronter } from './lecture-etude.js';
import {
  TYPE_FICHE, VERSION_FICHE, migrer, nouvelleCamera, nomDeFichier,
} from './fiche.js';
import {
  echelleDuPlan, dimensionner, polygoneCone, ouverturePourFocale,
} from './plan.js';
import {
  APPAREILS, dimensionnerDepuisPhoto, inclinaisonPourDistance,
  ordonneePourDistance, porteeUtile, calibrerDeuxPoints, champVertical,
} from './photo.js';
import {
  CATALOGUE_INITIAL, normaliserEntree, proposer, conseil, estFixe,
  nomComplet, versCsv, depuisCsv, depuisReleveCommercial, estComplete, aConfirmer,
} from './catalogue.js';
import {
  LIMITE_LIEN, TYPES_MATERIEL, nouveauSynoptique, nouveauNoeud, nouveauLien,
  noeudPar, trajet, mesurerLien, recapitulatif, dispositionLogique, nomNoeud,
  champsDeType, LIBELLES_MATERIEL,
} from './reseau.js';
import {
  CODECS, MARGE_DEFAUT, debitEstime, bilan, classePour,
} from './stockage.js';
import {
  nouveauMur, longueurMur, balayage, partVisible, anglesMorts,
} from './murs.js';
import {
  PROVENANCES, ligne, devis, reservesDevis, euros,
} from './prix.js';

const nb = (el, defaut = 0) => {
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : defaut;
};
const fmt = (v, n = 1) => (Number.isFinite(v) ? v.toFixed(n).replace('.', ',') : '—');

/** Accord en nombre : un procès-verbal client ne s'écrit pas avec des « (s) ». */
const plur = (n, mot, suffixe = 's') => `${n} ${mot}${n > 1 ? suffixe : ''}`;

/** Échappe le texte saisi : une fiche .json peut venir d'un autre poste. */
const ech = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const RESOLUTIONS = [
  { label: '2 MP — 1920 × 1080', h: 1920, v: 1080 },
  { label: '4 MP — 2560 × 1440', h: 2560, v: 1440 },
  { label: '5 MP — 2592 × 1944', h: 2592, v: 1944 },
  { label: '8 MP / 4K — 3840 × 2160', h: 3840, v: 2160 },
  { label: '12 MP — 4000 × 3000', h: 4000, v: 3000 },
  { label: '1 MP — 1280 × 720', h: 1280, v: 720 },
  { label: 'Thermique — 256 × 192', h: 256, v: 192 },
  { label: 'Thermique — 384 × 288', h: 384, v: 288 },
  { label: 'Thermique — 640 × 512', h: 640, v: 512 },
  { label: 'Autre…', h: 0, v: 0 },
];

const TAILLE_ANALYSE = 480; // largeur de travail pour le recalage
const TAILLE_RENDU = 1280; // largeur maximale des toiles
const COULEURS_ZONES = ['#3d8bfd', '#2eae6a', '#d99b1f', '#c8102e', '#a45cd6', '#00b8c4'];

/**
 * Un dossier de chantier, plusieurs caméras.
 *
 * `cameras` conserve l'état de chacune ; les champs de travail (`reference`,
 * `reglee`, `transformation`…) portent la caméra affichée. Passer d'un onglet à
 * l'autre range la caméra courante puis déplie la suivante.
 */
const etat = {
  cameras: [], // fiches caméra, cf. js/fiche.js
  index: 0, // caméra affichée

  reference: null, // { nom, dataUrl, img, largeur, hauteur, source }
  reglee: null,
  cache: null, // images prétraitées pour le recalage manuel
  transformation: null,
  manuel: false,
  diagnostic: null,
  zones: [],

  etude: null, // { fichier, analyse } — valeurs lues dans le PDF d'étude, commun au dossier
  catalogue: [], // matériel de l'agence, cf. js/catalogue.js
  planEtape: null, // étape de tracé en cours sur le plan
  reseauOutil: null, // outil actif sur le synoptique : calage, poser, relier…
  reseauDepuis: null, // premier matériel d'une liaison en cours
  reseauPoints: [], // points de passage de la liaison en cours
  reseauChoisi: null, // matériel sélectionné
  murDebut: null, // premier point d'un mur en cours de tracé
  murChoisi: null, // mur sélectionné
  ficheRendue: null, // ce que porte le formulaire de fiche affiché
  synoptique: null, // câblage du site, cf. js/reseau.js
  photoEtape: null, // étape en cours sur la photo de repérage
  document: 'pv', // 'pv' ou 'proposition' — ce que l'impression doit produire
  mode: 'cote',
  tracage: false,
  dernierDepot: 'reference',
};

const cameraCourante = () => etat.cameras[etat.index];

/* ====================================================== initialisation UI */

function remplirSelecteurs() {
  const selCapteur = $('#cam-capteur');
  Object.keys(CAPTEURS).forEach((cle) => {
    selCapteur.append(new Option(`${cle} (${CAPTEURS[cle].largeur} × ${CAPTEURS[cle].hauteur} mm)`, cle));
  });
  selCapteur.append(new Option('Autre…', 'libre'));
  selCapteur.value = '1/2.8"';

  const selRes = $('#cam-resolution');
  RESOLUTIONS.forEach((r, i) => selRes.append(new Option(r.label, String(i))));
  selRes.value = '0';

  const selApp = $('#photo-appareil');
  Object.keys(APPAREILS).forEach((cle) => selApp.append(new Option(cle, cle)));

  $('#ch-date').value = new Date().toISOString().slice(0, 10);
}

/** Valeurs d'optique telles que le formulaire les porte. */
function lireOptique() {
  return {
    capteur: $('#cam-capteur').value,
    capteurLargeur: nb($('#cam-capteur-l'), 5.18),
    capteurHauteur: nb($('#cam-capteur-h'), 2.92),
    focale: nb($('#cam-focale'), 4),
    resolution: $('#cam-resolution').value,
    resH: nb($('#cam-res-h'), 1920),
    resV: nb($('#cam-res-v'), 1080),
    distance: nb($('#cam-distance'), 15),
    hauteur: nb($('#cam-hauteur'), 3.5),
    inclinaison: nb($('#cam-inclinaison'), 15),
  };
}

function ecrireOptique(o) {
  $('#cam-capteur').value = o.capteur;
  $('#cam-capteur-l').value = o.capteurLargeur;
  $('#cam-capteur-h').value = o.capteurHauteur;
  $('#cam-focale').value = o.focale;
  $('#cam-resolution').value = o.resolution;
  $('#cam-res-h').value = o.resH;
  $('#cam-res-v').value = o.resV;
  $('#cam-distance').value = o.distance;
  $('#cam-hauteur').value = o.hauteur;
  $('#cam-inclinaison').value = o.inclinaison;
  basculerChampsLibres();
}

/**
 * Configuration exploitable à partir de valeurs d'optique enregistrées.
 * Passer par cette fonction plutôt que par le formulaire permet de traiter
 * n'importe quelle caméra du dossier, pas seulement celle affichée.
 */
function configDe(o) {
  const capteur = o.capteur === 'libre'
    ? { largeur: o.capteurLargeur, hauteur: o.capteurHauteur }
    : (CAPTEURS[o.capteur] || CAPTEURS['1/2.8"']);
  const r = RESOLUTIONS[parseInt(o.resolution, 10)] || RESOLUTIONS[0];
  return {
    capteur,
    capteurCle: o.capteur,
    focale: o.focale,
    resolution: r.h ? { h: r.h, v: r.v } : { h: o.resH, v: o.resV },
    distance: o.distance,
    hauteur: o.hauteur,
    inclinaison: o.inclinaison,
    angles: anglesDeChamp(capteur, o.focale),
  };
}

function tolerancesActuelles() {
  return {
    angle: nb($('#tol-angle'), TOLERANCES_DEFAUT.angle),
    roulis: nb($('#tol-roulis'), TOLERANCES_DEFAUT.roulis),
    zoom: nb($('#tol-zoom'), TOLERANCES_DEFAUT.zoom),
  };
}

const configCamera = () => configDe(lireOptique());

/** Diagnostic d'une caméra enregistrée, recalculé depuis ses propres valeurs. */
function diagnosticDe(cam) {
  if (!cam || !cam.transformation) return null;
  const c = configDe(cam.optique);
  return diagnostiquer(cam.transformation, c.angles, {
    tolerances: tolerancesActuelles(),
    distance: c.distance,
    focale: c.focale,
  });
}

/* ======================================================= mesures optiques */

function mesure(cle, valeur, unite, large = false) {
  return `<div class="mesure${large ? ' large' : ''}">
      <span class="cle">${cle}</span>
      <span class="val">${valeur}<span class="unite">${unite ? ` ${unite}` : ''}</span></span>
    </div>`;
}

function majOptique() {
  const c = configCamera();
  const largeur = couverture(c.angles.horizontal, c.distance);
  const hauteurVue = couverture(c.angles.vertical, c.distance);
  const ppm = pixelsParMetre(c.resolution.h, c.angles.horizontal, c.distance);
  const niveau = niveauDori(ppm);
  const morte = zoneMorte(c.hauteur, c.inclinaison, c.angles.vertical);

  $('#mesures-optique').innerHTML = [
    mesure('Champ horizontal', fmt(c.angles.horizontal), '°'),
    mesure('Champ vertical', fmt(c.angles.vertical), '°'),
    mesure(`Largeur vue à ${fmt(c.distance)} m`, fmt(largeur), 'm'),
    mesure(`Hauteur vue à ${fmt(c.distance)} m`, fmt(hauteurVue), 'm'),
    mesure('Densité sur la scène', fmt(ppm, 0), 'px/m'),
    mesure('Niveau atteint', niveau === 'insuffisant' ? 'Insuffisant' : SEUILS_DORI[niveau].label, ''),
    mesure('Zone morte au pied', Number.isFinite(morte) ? fmt(morte) : '—', 'm', true),
  ].join('');

  $('#tableau-dori').innerHTML = `<table class="dori">
      <thead><tr><th>Niveau</th><th>Exigence</th><th>Portée max.</th></tr></thead>
      <tbody>${tableauDori(c.resolution.h, c.angles.horizontal).map((l) => `
        <tr><td>${l.label}</td><td>${l.ppm} px/m</td><td>${fmt(l.distance)} m</td></tr>`).join('')}
      </tbody></table>`;

  majAideFocale(c);
  if (cameraCourante()?.etude3d?.image) majPhoto();
  if (cameraCourante()?.plan?.image) majPlan();
  if (etat.etude) majEtude();
  if (etat.transformation) majDiagnostic();
}

function majAideFocale(c) {
  const largeurCible = nb($('#aide-largeur'), 8);
  const distance = nb($('#aide-distance'), 15);
  const f = focaleRequise(c.capteur.largeur, largeurCible, distance);
  const ppm = f > 0 ? c.resolution.h / largeurCible : 0;
  const niveau = niveauDori(ppm);
  $('#aide-resultat').innerHTML = [
    mesure('Focale nécessaire', fmt(f, 1), 'mm'),
    mesure('Densité obtenue', fmt(ppm, 0), 'px/m'),
    mesure('Niveau', niveau === 'insuffisant' ? 'Insuffisant' : SEUILS_DORI[niveau].label, '', true),
  ].join('');
}

/* ================================================ caméras du dossier */

/** Range la caméra affichée dans le dossier avant de passer à une autre. */
function sauverCameraCourante() {
  const cam = cameraCourante();
  if (!cam) return;
  cam.nom = $('#ch-camera').value;
  cam.optique = lireOptique();
  cam.commentaire = $('#ch-commentaire').value;
  cam.zones = etat.zones;
  cam.transformation = etat.transformation;
  cam.manuel = etat.manuel;
  // Les éléments image décodés ne se sérialisent pas : seules les sources
  // partent dans la fiche, et sont redécodées au rechargement.
  cam.images = {
    reference: etat.reference && {
      nom: etat.reference.nom, dataUrl: etat.reference.dataUrl, source: etat.reference.source,
      largeur: etat.reference.largeur, hauteur: etat.reference.hauteur,
    },
    reglee: etat.reglee && {
      nom: etat.reglee.nom, dataUrl: etat.reglee.dataUrl, source: etat.reglee.source,
      largeur: etat.reglee.largeur, hauteur: etat.reglee.hauteur,
    },
  };
}

/** Vide les cadres d'images sans toucher au dossier. */
function viderVues() {
  ['reference', 'reglee'].forEach((role) => {
    etat[role] = null;
    const suffixe = role === 'reference' ? 'reference' : 'reglee';
    $(`#vignette-${suffixe}`).hidden = true;
    $(`#vignette-${suffixe}`).removeAttribute('src');
    $(`#depot-${suffixe} .depot-texte`).hidden = false;
    $(`#info-${suffixe}`).textContent = '';
  });
}

/** Déplie une caméra du dossier dans le formulaire et la visionneuse. */
async function chargerCamera(i) {
  etat.index = Math.max(0, Math.min(i, etat.cameras.length - 1));
  const cam = cameraCourante();
  $('#ch-camera').value = cam.nom || '';
  $('#ch-commentaire').value = cam.commentaire || '';
  ecrireOptique(cam.optique);

  etat.cache = null;
  etat.transformation = cam.transformation || null;
  etat.manuel = !!cam.manuel;
  etat.diagnostic = null;
  etat.zones = cam.zones || [];
  $('#verdict').hidden = true;

  viderVues();
  if (cam.images?.reference) {
    await definirImage('reference', cam.images.reference.dataUrl,
      cam.images.reference.nom, cam.images.reference.source, false);
  }
  if (cam.images?.reglee) {
    await definirImage('reglee', cam.images.reglee.dataUrl,
      cam.images.reglee.nom, cam.images.reglee.source, false);
  }

  $('#vignette-plan').hidden = true;
  $('#vignette-plan').removeAttribute('src');
  $('#depot-plan .depot-texte').hidden = false;
  $('#info-plan').textContent = '';
  $('#plan-reglages').hidden = true;
  etat.planEtape = null;
  $('#vignette-photo').hidden = true;
  $('#vignette-photo').removeAttribute('src');
  $('#depot-photo .depot-texte').hidden = false;
  $('#info-photo').textContent = '';
  $('#photo-reglages').hidden = true;
  etat.photoEtape = null;
  if (cam.etude3d?.image?.dataUrl) {
    cam.etude3d.image.img = await chargerImage(cam.etude3d.image.dataUrl);
    $('#vignette-photo').src = cam.etude3d.image.dataUrl;
    $('#vignette-photo').hidden = false;
    $('#depot-photo .depot-texte').hidden = true;
    $('#info-photo').textContent = cam.etude3d.image.nom || 'photo';
  }
  if (cam.plan?.image?.dataUrl) {
    cam.plan.image.img = await chargerImage(cam.plan.image.dataUrl);
    $('#vignette-plan').src = cam.plan.image.dataUrl;
    $('#vignette-plan').hidden = false;
    $('#depot-plan .depot-texte').hidden = true;
    $('#info-plan').textContent = cam.plan.image.nom || 'plan';
  }

  synchroniserCurseurs();
  majOptique();
  majPhoto();
  majPlan();
  majEtude();
  majZones();
  if (etat.transformation) majDiagnostic();
  else majVisionneuse();
  majOnglets();
}

async function allerACamera(i) {
  if (i === etat.index) return;
  sauverCameraCourante();
  await chargerCamera(i);
}

/** Nom proposé pour une nouvelle caméra : on suit la numérotation en cours. */
function nomSuivant() {
  const numeros = etat.cameras
    .map((c) => (c.nom || '').match(/(\d+)/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const suivant = numeros.length ? Math.max(...numeros) + 1 : etat.cameras.length + 1;
  return `CAM ${String(suivant).padStart(2, '0')}`;
}

async function ajouterCamera(nom, optique) {
  sauverCameraCourante();
  const cam = nouvelleCamera(nom || nomSuivant());
  // La nouvelle caméra hérite de l'optique de la précédente : sur un même
  // chantier, le matériel est le plus souvent identique d'un poste à l'autre.
  cam.optique = optique || { ...(cameraCourante()?.optique || cam.optique) };
  etat.cameras.push(cam);
  await chargerCamera(etat.cameras.length - 1);
}

async function supprimerCamera() {
  if (etat.cameras.length < 2) {
    $('#etat-analyse').textContent = 'Un dossier comporte au moins une caméra.';
    $('#etat-analyse').classList.add('erreur');
    return;
  }
  const cam = cameraCourante();
  if (!window.confirm(`Retirer « ${cam.nom || 'cette caméra'} » du dossier ?`)) return;
  etat.cameras.splice(etat.index, 1);
  await chargerCamera(Math.min(etat.index, etat.cameras.length - 1));
}

/** Onglets des caméras, avec la pastille de verdict de chacune. */
function majOnglets() {
  sauverCameraCourante();
  const boite = $('#onglets-cameras');
  boite.innerHTML = etat.cameras.map((cam, i) => {
    const d = i === etat.index ? etat.diagnostic : diagnosticDe(cam);
    const classe = d ? d.verdict : 'vide';
    const titre = d ? `${LIBELLES_VERDICT[d.verdict]}${d.fiable ? ` — ${d.score}/100` : ''}` : 'Analyse non faite';
    return `<button type="button" class="onglet ${i === etat.index ? 'actif' : ''}" data-camera="${i}"
        title="${ech(titre)}"><span class="puce ${classe}"></span><span class="nom">${ech(cam.nom || `Caméra ${i + 1}`)}</span></button>`;
  }).join('');
  $$('#onglets-cameras button[data-camera]').forEach((b) => {
    b.addEventListener('click', () => allerACamera(Number(b.dataset.camera)));
  });
  $('#btn-supprimer-camera').disabled = etat.cameras.length < 2;
  majSyntheseCourte();
}

function majSyntheseCourte() {
  const diagnostics = etat.cameras.map((cam, i) => (i === etat.index ? etat.diagnostic : diagnosticDe(cam)));
  const faits = diagnostics.filter(Boolean);
  if (!faits.length) {
    $('#synthese-courte').textContent = `${plur(etat.cameras.length, 'caméra')} — aucune analysée`;
    return;
  }
  const conformes = faits.filter((d) => d.verdict === 'conforme').length;
  const reste = etat.cameras.length - faits.length;
  $('#synthese-courte').textContent = `${conformes}/${faits.length} conforme${conformes > 1 ? 's' : ''}`
    + (reste ? ` — ${plur(reste, 'caméra')} à analyser` : '');
}

/** Exporte le catalogue en CSV, pour le compléter au tableur. */
function exporterCatalogue() {
  const blob = new Blob([`\ufeff${versCsv(etat.catalogue)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'catalogue-cameras.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Charge un CSV, qu'il soit un catalogue ou un relevé commercial.
 *
 * Les deux ne se chargent pas de la même façon, et c'est voulu. Un catalogue
 * porte les colonnes de l'outil : il **remplace** le catalogue en place, c'est
 * un fichier complet. Un relevé commercial — export d'une place de marché,
 * tarif distributeur — ne porte que des intitulés : ses références s'**ajoutent**
 * à ce qui existe, sans écraser un travail de saisie.
 */
async function importerCatalogue(fichier) {
  const texte = await fichier.text();

  const catalogue = depuisCsv(texte);
  if (catalogue.length) {
    etat.catalogue = catalogue;
    appliquerCatalogue(`Catalogue remplacé — ${plur(catalogue.length, 'référence')}.`);
    return;
  }

  const releve = depuisReleveCommercial(texte, { source: `Relevé ${fichier.name}` });
  if (releve.length) {
    const connues = new Set(etat.catalogue.map((e) => e.reference.toLowerCase()));
    const ajouts = releve.filter((e) => !connues.has(e.reference.toLowerCase()));
    etat.catalogue = etat.catalogue.concat(ajouts);
    const incompletes = ajouts.filter((e) => !estComplete(e)).length;
    appliquerCatalogue(`${plur(ajouts.length, 'référence')} relevée${ajouts.length > 1 ? 's' : ''} `
      + `dans ${fichier.name}`
      + (incompletes ? ` — ${incompletes} sans focale ni définition, à compléter.` : '.'));
    return;
  }

  $('#etat-analyse').textContent = 'Aucune ligne exploitable : il faut soit les colonnes '
    + 'reference / focaleMin / focaleMax, soit une colonne d\'intitulés nommée « Titre ».';
  $('#etat-analyse').classList.add('erreur');
}

/** Enregistre le catalogue, rafraîchit ce qui en dépend et le dit. */
function appliquerCatalogue(message) {
  enregistrerCatalogue();
  majCatalogue();
  majPlan();
  majPhoto();
  $('#etat-analyse').textContent = message;
  $('#etat-analyse').classList.remove('erreur');
}

/* ============================================ étude depuis la photo */

/** Distances jalonnées sur la photo, en mètres. */
const JALONS = [5, 10, 15, 20, 30, 40, 50, 75, 100];

/** Étude photo de la caméra affichée, créée à la demande. */
function photoCourante() {
  const cam = cameraCourante();
  if (!cam) return null;
  if (!cam.etude3d) {
    cam.etude3d = {
      image: null, hauteur: 4.5, appareil: 'Téléphone — objectif principal',
      reperes: [], distance: 10, distance2: 30,
      inclinaison: null, angleH: null, zone: null,
    };
  }
  return cam.etude3d;
}

/** Paramètres de prise de vue, champ vertical déduit du format de l'image. */
function priseDeVue(etude) {
  if (!etude?.image) return null;
  const rapport = etude.image.hauteur / etude.image.largeur;
  // Le champ mesuré sur deux repères l'emporte sur celui du catalogue
  // d'appareils : il est constaté, pas supposé.
  const angleH = etude.angleH || APPAREILS[etude.appareil] || configCamera().angles.horizontal;
  return {
    hauteur: etude.hauteur,
    inclinaison: etude.inclinaison ?? 0,
    angleH,
    angleV: champVertical(angleH, rapport),
  };
}

/**
 * Recalcule le calage de la photo.
 *
 * Deux repères lèvent les deux inconnues — champ de vision et inclinaison.
 * Avec un seul, il faut se rabattre sur le champ déclaré de l'appareil.
 */
function recalerPhoto(etude) {
  const reperes = etude.reperes || [];
  const rapport = etude.image ? etude.image.hauteur / etude.image.largeur : 0;

  if (reperes.length >= 2) {
    const r = calibrerDeuxPoints(reperes[0], reperes[1], { hauteur: etude.hauteur, rapport });
    if (r) {
      etude.angleH = r.angleH;
      etude.inclinaison = r.inclinaison;
      etude.calageAuto = true;
      return;
    }
    // Repères incohérents : on le dira, plutôt que d'annoncer un faux champ.
    etude.calageAuto = false;
  }
  etude.angleH = null;
  etude.calageAuto = false;
  if (reperes.length >= 1) {
    const prise = priseDeVue(etude);
    etude.inclinaison = inclinaisonPourDistance(
      reperes[0].u, reperes[0].v, reperes[0].distance, prise,
    ) || null;
  } else {
    etude.inclinaison = null;
  }
}

/** Étude de la zone entourée, ou null tant qu'il manque une pièce. */
function mesurePhotoDe(cam) {
  const etude = cam?.etude3d;
  if (!etude?.image || !etude.zone || etude.inclinaison === null) return null;
  const prise = { ...priseDeVue(etude), inclinaison: etude.inclinaison };
  const c = configDe(cam.optique);
  return { ...dimensionnerDepuisPhoto(etude.zone, prise, c.capteur, c.resolution), prise };
}

const mesurePhoto = () => {
  const cam = cameraCourante();
  if (!cam?.etude3d?.image) return null;
  return mesurePhotoDe({ ...cam, optique: lireOptique() });
};

const CONSIGNES_PHOTO = {
  calage: 'Repère proche : cliquer sur la photo un point du sol dont vous connaissez la distance (saisie ci-dessus).',
  calage2: 'Repère lointain : cliquer un second point, plus haut dans l\'image. Ces deux repères suffisent à mesurer l\'angle de vue — plus rien n\'est supposé.',
  zone: 'Zone : tracer par cliquer-glisser le rectangle que le client veut voir couvert.',
  pret: 'Analyse faite : angle de vue mesuré, matériel proposé ci-dessous.',
  aCaler: 'Commencer par poser les deux repères : sans eux, aucune distance n\'est mesurable.',
  aSecond: 'Un second repère, plus haut dans l\'image, permettra de mesurer l\'angle de vue au lieu de le supposer.',
  aTracer: 'Photo calée. Entourer maintenant la zone à couvrir.',
};

function majConsignePhoto() {
  const etude = photoCourante();
  const etape = etat.photoEtape;
  let texte;
  const n = (etude.reperes || []).length;
  if (etape) texte = CONSIGNES_PHOTO[etape];
  else if (!n) texte = CONSIGNES_PHOTO.aCaler;
  else if (n === 1) texte = CONSIGNES_PHOTO.aSecond;
  else if (!etude.zone) texte = CONSIGNES_PHOTO.aTracer;
  else texte = CONSIGNES_PHOTO.pret;
  $('#photo-consigne').textContent = texte;
  $$('[data-photo-etape]').forEach((b) => {
    b.classList.toggle('actif', b.dataset.photoEtape === etape);
    const fait = { calage: n >= 1, calage2: n >= 2, zone: !!etude.zone }[b.dataset.photoEtape];
    b.classList.toggle('fait', !!fait);
  });
}

function majPhoto() {
  const etude = photoCourante();
  const pret = !!etude?.image;
  $('#photo-reglages').hidden = !pret;
  if (!pret) return;

  $('#photo-hauteur').value = etude.hauteur;
  $('#photo-distance').value = etude.distance;
  $('#photo-distance2').value = etude.distance2;
  $('#photo-appareil').value = etude.appareil;

  const m = mesurePhoto();
  const boite = $('#photo-mesures');
  if (!m) {
    boite.innerHTML = etude.inclinaison !== null
      ? mesure(etude.calageAuto ? 'Champ mesuré' : 'Champ supposé',
        fmt(priseDeVue(etude).angleH), '°')
        + mesure('Inclinaison déduite', fmt(etude.inclinaison), '°')
      : '';
    $('#photo-conseil').textContent = '';
    $('#photo-propositions').innerHTML = '';
    $('#photo-portees').innerHTML = '';
    majConsignePhoto();
    majVisionneuse();
    return;
  }

  const c = configCamera();
  const niveau = niveauDori(m.densite);
  boite.innerHTML = [
    mesure(etude.calageAuto ? 'Champ de la photo (mesuré)' : 'Champ de la photo (supposé)',
      fmt(m.prise.angleH), '°'),
    mesure('Inclinaison de la photo', fmt(m.prise.inclinaison), '°'),
    mesure('Angle de vue nécessaire', fmt(m.angleRequis), '°'),
    mesure('Focale à poser', fmt(m.focale, 1), 'mm'),
    mesure('Zone la plus proche', fmt(m.distanceMin), 'm'),
    mesure('Zone la plus éloignée', fmt(m.distanceMax), 'm'),
    mesure('Largeur au fond de zone', fmt(m.largeur), 'm'),
    mesure('Définition au fond', fmt(m.densite, 0), 'px/m'),
    mesure('Niveau garanti', niveau === 'insuffisant' ? 'Insuffisant' : SEUILS_DORI[niveau].label, '', true),
  ].join('');

  const type = /^Thermique/i.test(c.capteurCle) ? 'thermique' : 'visible';
  const propositions = proposer(etat.catalogue, m.focale, { type });
  $('#photo-conseil').textContent = conseil(m.focale, propositions).texte;
  $('#photo-propositions').innerHTML = propositions.length
    ? `<ul class="propositions">${propositions.slice(0, MAX_PROPOSITIONS).map((p) => {
      const reglage = estFixe(p.entree) ? `fixe ${fmt(p.entree.focaleMin, 1)} mm` : `zoom ${fmt(p.reglage, 1)} mm`;
      return `<li><span>${ech(nomComplet(p.entree))}`
        + `${reserveCourte(p.entree)}</span>`
        + `<span class="reglage">${reglage}</span></li>`;
    }).join('')}</ul>${resteProposition(propositions)}`
    : '';

  $('#photo-portees').innerHTML = `<table class="dori">
      <thead><tr><th>Ce que permet l'image</th><th>Jusqu'à</th></tr></thead>
      <tbody>${tableauPortees(m, c).map((l) => `
        <tr><td>${l.label}</td><td>${l.distance >= m.distanceMax ? 'toute la zone' : `${fmt(l.distance)} m`}</td></tr>`).join('')}
      </tbody></table>`;

  majConsignePhoto();
  majVisionneuse();
}

/** Portée utile de chaque niveau d'exploitation, avec l'angle retenu. */
function tableauPortees(m, c) {
  return Object.values(SEUILS_DORI).map((s) => ({
    label: s.label,
    distance: porteeUtile(c.resolution.h, m.angleRequis, s.ppm),
  }));
}

/* ------------------------------------------- tracé d'angle, vue en plan */

/**
 * Schéma du champ couvert, vu de dessus.
 *
 * C'est le tracé qui figure sur les études : la caméra, son cône, et jusqu'où
 * porte chaque niveau d'exploitation. Il est produit sans plan ni vue aérienne,
 * à partir des seules mesures faites sur la photo.
 */
function dessinerSchemaAngle(ctx, L, H, m, c, nom, hauteurPose) {
  const marge = { haut: 46, bas: 54, cote: 20 };
  const apex = { x: L / 2, y: H - marge.bas };
  const portee = Math.max(m.distanceMax, 1) * 1.08;
  const echelle = (apex.y - marge.haut) / portee; // pixels par mètre
  const demi = radians(m.angleRequis) / 2;
  const police = getComputedStyle(document.body).fontFamily;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, L, H);

  /** Point du schéma pour une distance et un écart angulaire donnés. */
  const pt = (d, a) => ({
    x: apex.x + Math.sin(a) * d * echelle,
    y: apex.y - Math.cos(a) * d * echelle,
  });

  const secteur = (d1, d2, remplissage) => {
    ctx.beginPath();
    ctx.moveTo(pt(d1, -demi).x, pt(d1, -demi).y);
    ctx.lineTo(pt(d2, -demi).x, pt(d2, -demi).y);
    for (let i = 0; i <= 32; i += 1) ctx.lineTo(pt(d2, -demi + (2 * demi * i) / 32).x, pt(d2, -demi + (2 * demi * i) / 32).y);
    ctx.lineTo(pt(d1, demi).x, pt(d1, demi).y);
    for (let i = 32; i >= 0; i -= 1) ctx.lineTo(pt(d1, -demi + (2 * demi * i) / 32).x, pt(d1, -demi + (2 * demi * i) / 32).y);
    ctx.closePath();
    ctx.fillStyle = remplissage;
    ctx.fill();
  };

  // Le champ entier, puis la zone effectivement demandée par-dessus.
  secteur(0, m.distanceMax, 'rgba(232, 86, 20, .14)');
  secteur(m.distanceMin, m.distanceMax, 'rgba(232, 86, 20, .34)');

  // Portées d'exploitation : jusqu'où l'image reste utilisable.
  const niveaux = tableauPortees(m, c).reverse(); // du plus exigeant au moins
  const couleurs = ['#1b7a45', '#2eae6a', '#d99b1f', '#c8102e'];
  ctx.font = `600 13px ${police}`;
  niveaux.forEach((n, i) => {
    if (n.distance <= 0 || n.distance > portee) return;
    ctx.beginPath();
    for (let k = 0; k <= 40; k += 1) {
      const p = pt(n.distance, -demi + (2 * demi * k) / 40);
      if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
    ctx.strokeStyle = couleurs[i % couleurs.length];
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    const bord = pt(n.distance, demi);
    ctx.fillStyle = couleurs[i % couleurs.length];
    ctx.fillText(`${n.label} — ${fmt(n.distance)} m`, Math.min(L - 190, bord.x + 8), bord.y + 4);
  });

  // Les deux bords du champ et l'axe de visée.
  ctx.strokeStyle = '#e85614';
  ctx.lineWidth = 2.5;
  [-demi, demi].forEach((a) => {
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(pt(m.distanceMax, a).x, pt(m.distanceMax, a).y);
    ctx.stroke();
  });
  ctx.strokeStyle = 'rgba(40, 40, 40, .45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(apex.x, apex.y);
  ctx.lineTo(pt(m.distanceMax, 0).x, pt(m.distanceMax, 0).y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arc de l'angle, à la racine du cône.
  const rayonArc = Math.min(64, m.distanceMax * echelle * 0.35);
  ctx.beginPath();
  ctx.arc(apex.x, apex.y, rayonArc, -Math.PI / 2 - demi, -Math.PI / 2 + demi);
  ctx.strokeStyle = '#e85614';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#c8102e';
  ctx.font = `700 17px ${police}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${fmt(m.angleRequis)}°`, apex.x, apex.y - rayonArc - 10);

  // La caméra.
  ctx.beginPath();
  ctx.arc(apex.x, apex.y, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#e85614';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#111';
  ctx.font = `700 15px ${police}`;
  ctx.fillText(nom || 'Caméra', apex.x, H - 16);
  ctx.font = `400 13px ${police}`;
  // La focale citée est celle qu'il faut poser pour obtenir ce champ, pas celle
  // qui se trouve encore dans la configuration.
  ctx.fillText(`objectif ${fmt(m.focale, 1)} mm · ${c.resolution.h} × ${c.resolution.v} px · `
    + `pose à ${fmt(hauteurPose ?? c.hauteur)} m`, apex.x, H - 34);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#111';
  ctx.font = `700 15px ${police}`;
  ctx.fillText('Champ couvert — vue en plan', marge.cote, 26);
  ctx.font = `400 13px ${police}`;
  ctx.fillStyle = '#555';
  ctx.fillText(`zone demandée de ${fmt(m.distanceMin)} à ${fmt(m.distanceMax)} m · `
    + `${fmt(m.largeur)} m de large au fond · ${fmt(m.densite, 0)} px/m`, marge.cote, 42);
}

/** Schéma d'angle d'une caméra, prêt à exporter ou à imprimer. */
function schemaAngle(cam) {
  const m = mesurePhotoDe(cam);
  if (!m) return null;
  const toile = document.createElement('canvas');
  toile.width = 1000;
  toile.height = 640;
  dessinerSchemaAngle(toile.getContext('2d'), 1000, 640, m, configDe(cam.optique),
    cam.nom, cam.etude3d?.hauteur);
  return toile;
}

/* ------------------------------------------------------------ rendu photo */

function rendrePhoto() {
  const etude = photoCourante();
  if (!etude?.image?.img) return;
  const toile = $('#toile-photo');
  const { l, h } = dimensionsRendu(etude.image.img);
  toile.width = l;
  toile.height = h;
  const ctx = toile.getContext('2d');
  ctx.drawImage(etude.image.img, 0, 0, l, h);
  dessinerAnnotationsPhoto(ctx, l, h, etude, mesurePhoto());

  const m = mesurePhoto();
  const schema = $('#toile-schema');

  /*
   * La place du tracé d'angle et celle des résultats sont réservées dès que la
   * photo est chargée, pas à l'apparition de la mesure.
   *
   * Les faire surgir plus tard paraissait plus propre, mais les faisait surgir
   * **pendant** que l'utilisateur trace : la colonne passait de une à deux, la
   * photo rétrécissait sous le curseur, et le rectangle obtenu n'était plus
   * celui qu'on croyait dessiner. Une géométrie qui bouge en cours de geste est
   * pire qu'un panneau vide.
   */
  $('#photo-vue').classList.add('avec-schema');
  $('#photo-resultats').hidden = false;
  $('.scene').classList.add('avec-resultats');
  schema.hidden = !m;
  $('#photo-attente').hidden = !!m;

  // La toile du tracé prend ses dimensions tout de suite, mesure ou pas : les
  // lui donner plus tard changeait la hauteur de la rangée en cours de tracé,
  // et la visionneuse, qui centre son contenu, remontait la photo sous le
  // curseur.
  schema.width = l;
  schema.height = Math.round(l * 0.62);
  if (m) {
    dessinerSchemaAngle(schema.getContext('2d'), schema.width, schema.height,
      m, configCamera(), cameraCourante()?.nom, etude.hauteur);
  }
}

function dessinerAnnotationsPhoto(ctx, l, h, etude, m) {
  const trait = Math.max(1.5, l / 600);
  const prise = { ...priseDeVue(etude), inclinaison: etude.inclinaison ?? 0 };
  ctx.save();
  ctx.lineWidth = trait;

  // Lignes de distance : la preuve visuelle que l'échelle est juste.
  if (etude.inclinaison !== null && $('#photo-distances').checked) {
    ctx.setLineDash([10, 6]);
    // Près de l'horizon les jalons se tassent : on saute ceux qui se
    // chevaucheraient, une échelle illisible ne prouve rien.
    let precedent = Infinity;
    for (const d of JALONS) {
      const v = ordonneePourDistance(0.5, d, prise);
      if (v === null) continue;
      const y = v * h;
      if (precedent - y < trait * 16) continue;
      precedent = y;
      ctx.strokeStyle = 'rgba(255, 212, 0, .75)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(l, y);
      ctx.stroke();
      etiquette(ctx, `${d} m`, 8, Math.max(0, y - trait * 12), l);
    }
    ctx.setLineDash([]);
  }

  (etude.reperes || []).forEach((r, i) => {
    const p = { x: r.u * l, y: r.v * h };
    ctx.strokeStyle = '#3d8bfd';
    ctx.lineWidth = trait * 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, trait * 5, 0, Math.PI * 2);
    ctx.moveTo(p.x - trait * 8, p.y);
    ctx.lineTo(p.x + trait * 8, p.y);
    ctx.stroke();
    etiquette(ctx, `repère ${i + 1} — ${fmt(r.distance)} m`, p.x + trait * 8, p.y - trait * 8, l);
  });

  if (etude.zone) {
    const z = etude.zone;
    const x = Math.min(z.u1, z.u2) * l;
    const y = Math.min(z.v1, z.v2) * h;
    const larg = Math.abs(z.u2 - z.u1) * l;
    const haut = Math.abs(z.v2 - z.v1) * h;
    ctx.fillStyle = 'rgba(232, 86, 20, .22)';
    ctx.fillRect(x, y, larg, haut);
    ctx.strokeStyle = '#e85614';
    ctx.lineWidth = trait * 1.6;
    ctx.strokeRect(x, y, larg, haut);

    // Poignées : la zone se déplace et se retaille après coup, sans retracer.
    const r = Math.max(5, trait * 3.2);
    [[x, y], [x + larg, y], [x, y + haut], [x + larg, y + haut],
      [x + larg / 2, y], [x + larg / 2, y + haut],
      [x, y + haut / 2], [x + larg, y + haut / 2]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.rect(px - r, py - r, r * 2, r * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#e85614';
      ctx.lineWidth = trait;
      ctx.stroke();
    });
    ctx.strokeStyle = '#e85614';
    ctx.lineWidth = trait * 1.6;

    if (m) {
      etiquette(ctx, `${fmt(m.angleRequis)}° · ${fmt(m.focale, 1)} mm · ${fmt(m.densite, 0)} px/m`,
        x + 6, Math.max(0, y - trait * 14), l);
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------ interactions photo */

/** Rayon d'accroche des poignées, en pixels de la toile. */
const ACCROCHE = 14;

/** Nouvelle zone après déplacement d'un coin ou d'un bord. */
function redimensionnerZone(depart, prise, p) {
  let g = Math.min(depart.u1, depart.u2);
  let d = Math.max(depart.u1, depart.u2);
  let h = Math.min(depart.v1, depart.v2);
  let b = Math.max(depart.v1, depart.v2);
  const coin = prise.coin || '';
  const bord = prise.bord || '';
  if (coin.includes('o') || bord === 'gauche') g = p.u;
  if (coin.includes('e') || bord === 'droite') d = p.u;
  if (coin.startsWith('n') || bord === 'haut') h = p.v;
  if (coin.startsWith('s') || bord === 'bas') b = p.v;
  return { u1: Math.min(g, d), v1: Math.min(h, b), u2: Math.max(g, d), v2: Math.max(h, b) };
}

/**
 * Élément saisi sous le pointeur : poignée de zone, zone entière, ou repère.
 *
 * Tout se teste en pixels de la toile plutôt qu'en coordonnées normalisées :
 * une poignée doit s'attraper aussi facilement en haut qu'en bas de l'image,
 * quel que soit le format de la photo.
 */
function priseSousPointeur(px, etude, L, H) {
  const pres = (x, y) => Math.hypot(px.x - x, px.y - y) <= ACCROCHE;

  const reperes = etude.reperes || [];
  for (let i = reperes.length - 1; i >= 0; i -= 1) {
    if (pres(reperes[i].u * L, reperes[i].v * H)) return { type: 'repere', index: i };
  }

  const z = etude.zone;
  if (!z) return null;
  const g = Math.min(z.u1, z.u2) * L;
  const d = Math.max(z.u1, z.u2) * L;
  const h = Math.min(z.v1, z.v2) * H;
  const b = Math.max(z.v1, z.v2) * H;

  for (const [nom, x, y] of [['no', g, h], ['ne', d, h], ['so', g, b], ['se', d, b]]) {
    if (pres(x, y)) return { type: 'coin', coin: nom };
  }
  for (const [nom, x, y] of [
    ['gauche', g, (h + b) / 2], ['droite', d, (h + b) / 2],
    ['haut', (g + d) / 2, h], ['bas', (g + d) / 2, b],
  ]) {
    if (pres(x, y)) return { type: 'bord', bord: nom };
  }
  if (px.x >= g && px.x <= d && px.y >= h && px.y <= b) return { type: 'deplacer' };
  return null;
}

/** Curseur annonçant ce qui est manipulable sous le pointeur. */
function curseurPour(prise) {
  if (!prise) return 'crosshair';
  if (prise.type === 'repere') return 'grab';
  if (prise.type === 'deplacer') return 'move';
  if (prise.type === 'coin') return (prise.coin === 'no' || prise.coin === 'se') ? 'nwse-resize' : 'nesw-resize';
  return (prise.bord === 'gauche' || prise.bord === 'droite') ? 'ew-resize' : 'ns-resize';
}

function brancherPhoto() {
  const toile = $('#toile-photo');
  const position = (e) => {
    const r = toile.getBoundingClientRect();
    return {
      u: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      v: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      x: ((e.clientX - r.left) / r.width) * toile.width,
      y: ((e.clientY - r.top) / r.height) * toile.height,
    };
  };
  const enCalage = () => etat.photoEtape === 'calage' || etat.photoEtape === 'calage2';

  let saisie = null;

  toile.addEventListener('pointerdown', (e) => {
    const etude = photoCourante();
    if (!etude?.image || enCalage()) return;
    const p = position(e);
    // Le bouton « Entourer la zone » demande explicitement un nouveau tracé :
    // partir du milieu de l'ancienne zone ne doit pas la déplacer à la place.
    const prise = etat.photoEtape === 'zone'
      ? null
      : priseSousPointeur(p, etude, toile.width, toile.height);
    if (prise) {
      saisie = { prise, depart: p, zoneDepart: etude.zone ? { ...etude.zone } : null };
    } else {
      saisie = { prise: { type: 'tracer' }, depart: p, zoneDepart: null };
      etude.zone = { u1: p.u, v1: p.v, u2: p.u, v2: p.v };
    }
    toile.setPointerCapture(e.pointerId);
  });

  toile.addEventListener('pointermove', (e) => {
    const etude = photoCourante();
    if (!etude?.image) return;
    const p = position(e);

    if (!saisie) {
      toile.style.cursor = enCalage()
        ? 'crosshair'
        : curseurPour(priseSousPointeur(p, etude, toile.width, toile.height));
      return;
    }

    const { prise, depart, zoneDepart } = saisie;
    if (prise.type === 'repere') {
      etude.reperes[prise.index] = { ...etude.reperes[prise.index], u: p.u, v: p.v };
      recalerPhoto(etude);
    } else if (prise.type === 'tracer') {
      etude.zone = { u1: depart.u, v1: depart.v, u2: p.u, v2: p.v };
    } else if (prise.type === 'deplacer') {
      const du = p.u - depart.u;
      const dv = p.v - depart.v;
      etude.zone = {
        u1: zoneDepart.u1 + du, v1: zoneDepart.v1 + dv,
        u2: zoneDepart.u2 + du, v2: zoneDepart.v2 + dv,
      };
    } else {
      etude.zone = redimensionnerZone(zoneDepart, prise, p);
    }
    majPhoto();
  });

  const relacher = () => {
    if (!saisie) return;
    const etude = photoCourante();
    const z = etude.zone;
    // Un rectangle dégénéré ne veut rien dire : mieux vaut l'écarter que de
    // calculer un angle sur rien.
    if (z && (Math.abs(z.u2 - z.u1) < 0.02 || Math.abs(z.v2 - z.v1) < 0.02)) etude.zone = null;
    else if (saisie.prise.type === 'tracer') etat.photoEtape = null;
    saisie = null;
    majPhoto();
  };
  toile.addEventListener('pointerup', relacher);
  toile.addEventListener('pointercancel', relacher);

  toile.addEventListener('click', (e) => {
    const etude = photoCourante();
    if (!etude?.image) return;
    const rang = { calage: 0, calage2: 1 }[etat.photoEtape];
    if (rang === undefined) return;
    const p = position(e);
    etude.reperes = etude.reperes || [];
    etude.reperes[rang] = {
      u: p.u, v: p.v,
      distance: nb($(rang ? '#photo-distance2' : '#photo-distance'), rang ? 30 : 10),
    };
    etude.reperes = etude.reperes.filter(Boolean);
    recalerPhoto(etude);
    etat.photoEtape = etude.reperes.length < 2 ? 'calage2' : (etude.zone ? null : 'zone');
    majPhoto();
  });

  $$('[data-photo-etape]').forEach((b) => b.addEventListener('click', () => {
    etat.photoEtape = b.dataset.photoEtape;
    if (etat.mode !== 'photo') basculerMode('photo');
    majConsignePhoto();
  }));

  ['#photo-hauteur', '#photo-distance', '#photo-distance2'].forEach((sel) => {
    $(sel).addEventListener('input', () => {
      const etude = photoCourante();
      etude.hauteur = nb($('#photo-hauteur'), 4.5);
      etude.distance = nb($('#photo-distance'), 10);
      etude.distance2 = nb($('#photo-distance2'), 30);
      // Les distances des repères changent : tout le calage se refait.
      if (etude.reperes?.[0]) etude.reperes[0].distance = etude.distance;
      if (etude.reperes?.[1]) etude.reperes[1].distance = etude.distance2;
      recalerPhoto(etude);
      majPhoto();
    });
  });
  $('#photo-appareil').addEventListener('change', () => {
    const etude = photoCourante();
    etude.appareil = $('#photo-appareil').value;
    recalerPhoto(etude);
    majPhoto();
  });
  $('#photo-distances').addEventListener('change', () => majVisionneuse());
  $('#photo-effacer').addEventListener('click', () => {
    const etude = photoCourante();
    etude.zone = null;
    etude.reperes = [];
    etude.inclinaison = null;
    etude.angleH = null;
    etude.calageAuto = false;
    etat.photoEtape = 'calage';
    majPhoto();
  });
  $('#photo-reprendre').addEventListener('click', () => {
    const m = mesurePhoto();
    if (!m) return;
    $('#cam-focale').value = Math.round(m.focale * 10) / 10;
    $('#cam-distance').value = Math.round(m.distanceMax * 10) / 10;
    $('#cam-hauteur').value = photoCourante().hauteur;
    majOptique();
    majPhoto();
  });
  $('#photo-exporter').addEventListener('click', () => {
    const cam = cameraCourante();
    const base = (cam?.nom || 'camera').replace(/\s+/g, '-').toLowerCase();
    const enregistrer = (toileExport, suffixe, type, qualite) => {
      if (!toileExport) return;
      const a = document.createElement('a');
      a.href = toileExport.toDataURL(type, qualite);
      a.download = `${base}-${suffixe}`;
      a.click();
    };
    enregistrer(photoAnnotee(cam), 'zone.jpg', 'image/jpeg', 0.9);
    enregistrer(schemaAngle(cam), 'angle.png', 'image/png');
  });
  $('#photo-depuis-reglee').addEventListener('click', () => {
    if (!etat.reglee) {
      $('#etat-analyse').textContent = 'Charger d\'abord l\'image réglée dans le bloc 3.';
      $('#etat-analyse').classList.add('erreur');
      return;
    }
    definirPhoto(etat.reglee.dataUrl, etat.reglee.nom);
    photoCourante().appareil = 'Caméra en place (champ calculé au bloc 2)';
    majPhoto();
  });
}

/** Photo annotée en pleine définition, pour l'export et la proposition. */
function photoAnnotee(cam) {
  const etude = cam?.etude3d;
  if (!etude?.image?.img) return null;
  const toile = document.createElement('canvas');
  const l = etude.image.img.naturalWidth;
  const h = etude.image.img.naturalHeight;
  toile.width = l;
  toile.height = h;
  const ctx = toile.getContext('2d');
  ctx.drawImage(etude.image.img, 0, 0);
  dessinerAnnotationsPhoto(ctx, l, h, etude, mesurePhotoDe(cam));
  return toile;
}

async function definirPhoto(dataUrl, nom) {
  const img = await chargerImage(dataUrl);
  const etude = photoCourante();
  etude.image = { nom, dataUrl, img, largeur: img.naturalWidth, hauteur: img.naturalHeight };
  $('#vignette-photo').src = dataUrl;
  $('#vignette-photo').hidden = false;
  $('#depot-photo .depot-texte').hidden = true;
  $('#info-photo').textContent = `${nom} — ${img.naturalWidth} × ${img.naturalHeight} px`;
  if (etude.inclinaison === null) etat.photoEtape = 'calage';
  basculerMode('photo');
  majPhoto();
}

/* ================================================== champ tracé sur plan */

const CLE_CATALOGUE = 'ng-vue-angle-catalogue';

function chargerCatalogue() {
  try {
    const brut = JSON.parse(window.localStorage.getItem(CLE_CATALOGUE) || 'null');
    if (Array.isArray(brut) && brut.length) return brut.map(normaliserEntree);
  } catch {
    // Stockage refusé ou contenu abîmé : on repart du catalogue de départ.
  }
  return CATALOGUE_INITIAL.map(normaliserEntree);
}

function enregistrerCatalogue() {
  try {
    window.localStorage.setItem(CLE_CATALOGUE, JSON.stringify(etat.catalogue));
  } catch {
    // Navigation privée : le catalogue vaut pour la session, et part avec la fiche.
  }
}

/** Plan de la caméra affichée, créé à la demande. */
function planCourant() {
  const cam = cameraCourante();
  if (!cam) return null;
  if (!cam.plan) {
    cam.plan = {
      image: null, etalon: null, sommet: null, vise: null,
      ouverture: 60, lieeFocale: false,
    };
  }
  return cam.plan;
}

/** Dimensionnement du tracé d'une caméra donnée, ou null s'il est incomplet. */
function mesurePlanDe(cam) {
  const plan = cam?.plan;
  if (!plan?.etalon || !plan.sommet || !plan.vise) return null;
  const echelle = echelleDuPlan(plan.etalon.a, plan.etalon.b, plan.etalon.metres);
  if (!echelle) return null;
  const c = configDe(cam.optique);
  return {
    ...dimensionner(
      { sommet: plan.sommet, vise: plan.vise, ouverture: plan.ouverture },
      echelle, c.capteur, c.resolution.h,
    ),
    echelle,
  };
}

/** Dimensionnement de la caméra affichée, d'après le formulaire en cours. */
function mesurePlan() {
  const cam = cameraCourante();
  if (!cam?.plan?.image) return null;
  return mesurePlanDe({ ...cam, optique: lireOptique() });
}

const CONSIGNES = {
  etalon: 'Saisir la distance connue ci-dessus, puis cliquer les deux points correspondants sur le plan — un marquage au sol, une façade, un portail.',
  etalonB: 'Cliquer le second point de la distance connue.',
  sommet: 'Cliquer l\'emplacement de la caméra sur le plan.',
  vise: 'Cliquer le point le plus éloigné de la zone à couvrir.',
  pret: 'Tracé complet. Ajuster l\'ouverture au curseur, ou la lier à la focale saisie.',
};

function majConsigne() {
  const plan = planCourant();
  const etape = etat.planEtape;
  let texte;
  if (etape === 'etalon') texte = plan.etalonPartiel ? CONSIGNES.etalonB : CONSIGNES.etalon;
  else if (etape) texte = CONSIGNES[etape];
  else if (!plan.etalon) texte = 'Commencer par étalonner le plan : sans échelle, aucune distance n\'est mesurable.';
  else if (!plan.sommet) texte = 'Placer la caméra sur le plan.';
  else if (!plan.vise) texte = 'Viser la zone à couvrir.';
  else texte = CONSIGNES.pret;
  $('#plan-consigne').textContent = texte;

  $$('.etapes [data-etape]').forEach((b) => {
    b.classList.toggle('actif', b.dataset.etape === etape);
    const fait = { etalon: !!plan.etalon, sommet: !!plan.sommet, vise: !!plan.vise }[b.dataset.etape];
    b.classList.toggle('fait', !!fait);
  });
}

function majPlan() {
  const plan = planCourant();
  const pret = !!plan?.image;
  $('#plan-reglages').hidden = !pret;
  if (!pret) return;

  // L'ouverture peut suivre l'objectif saisi plutôt que le curseur : c'est
  // alors le champ réel de la caméra qui se dessine sur le plan.
  const c = configCamera();
  if (plan.lieeFocale) plan.ouverture = ouverturePourFocale(c.capteur, c.focale);
  $('#plan-ouverture').value = plan.ouverture;
  $('#plan-ouverture').disabled = plan.lieeFocale;
  $('#plan-lier').checked = plan.lieeFocale;
  $('#out-ouverture').textContent = `${fmt(plan.ouverture)} °`;

  const m = mesurePlan();
  const boite = $('#plan-mesures');
  if (!m) {
    boite.innerHTML = '';
    $('#plan-conseil').textContent = '';
    $('#plan-propositions').innerHTML = '';
    majConsigne();
    majVisionneuse();
    return;
  }

  const niveau = niveauDori(m.densite);
  boite.innerHTML = [
    mesure('Portée visée', fmt(m.portee), 'm'),
    mesure('Azimut', fmt(m.azimut, 0), '°'),
    mesure('Largeur couverte', fmt(m.largeur), 'm'),
    mesure('Focale nécessaire', fmt(m.focale, 1), 'mm'),
    mesure('Densité à la portée', fmt(m.densite, 0), 'px/m'),
    mesure('Niveau atteint', niveau === 'insuffisant' ? 'Insuffisant' : SEUILS_DORI[niveau].label, ''),
  ].join('');

  const type = /^Thermique/i.test(c.capteurCle) ? 'thermique' : 'visible';
  const propositions = proposer(etat.catalogue, m.focale, { type });
  $('#plan-conseil').textContent = conseil(m.focale, propositions).texte;
  $('#plan-propositions').innerHTML = propositions.length
    ? `<ul class="propositions">${propositions.slice(0, MAX_PROPOSITIONS).map((p) => {
      const reglage = estFixe(p.entree)
        ? `fixe ${fmt(p.entree.focaleMin, 1)} mm`
        : `zoom ${fmt(p.reglage, 1)} mm`;
      return `<li><span>${ech(nomComplet(p.entree))}`
        + `${reserveCourte(p.entree)}</span>`
        + `<span class="reglage">${reglage}</span></li>`;
    }).join('')}</ul>${resteProposition(propositions)}`
    : '';

  majConsigne();
  majVisionneuse();
}

/* ------------------------------------------------------------- rendu du plan */

function rendrePlan() {
  const plan = planCourant();
  if (!plan?.image?.img) return;
  const toile = $('#toile-plan');
  const { l, h } = dimensionsRendu(plan.image.img);
  toile.width = l;
  toile.height = h;
  const ctx = toile.getContext('2d');
  ctx.drawImage(plan.image.img, 0, 0, l, h);
  dessinerTracePlan(ctx, l, plan, mesurePlan());
}

/** Coordonnées normalisées (fractions de largeur) vers pixels de la toile. */
const versToile = (p, l) => ({ x: p.x * l, y: p.y * l });

function dessinerTracePlan(ctx, l, plan, m) {
  const trait = Math.max(1.5, l / 500);
  ctx.save();
  ctx.lineWidth = trait;

  if (plan.etalon) {
    const a = versToile(plan.etalon.a, l);
    const b = versToile(plan.etalon.b, l);
    ctx.strokeStyle = '#ffd400';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    [a, b].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, trait * 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd400';
      ctx.fill();
    });
    etiquette(ctx, `${fmt(plan.etalon.metres)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2, l);
  }

  if (plan.sommet && plan.vise) {
    const rayon = Math.hypot(plan.vise.x - plan.sommet.x, plan.vise.y - plan.sommet.y);
    const points = polygoneCone(plan.sommet, m ? m.azimut : 0, plan.ouverture, rayon)
      .map((p) => versToile(p, l));
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(232, 86, 20, .35)';
    ctx.fill();
    ctx.strokeStyle = '#e85614';
    ctx.stroke();
    if (m) {
      const s = versToile(plan.sommet, l);
      etiquette(ctx, `${fmt(plan.ouverture, 0)}° · ${fmt(m.portee)} m · ${fmt(m.focale, 1)} mm`,
        s.x + trait * 4, s.y + trait * 4, l);
    }
  }

  if (plan.sommet) {
    const s = versToile(plan.sommet, l);
    ctx.beginPath();
    ctx.arc(s.x, s.y, trait * 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#e85614';
    ctx.lineWidth = trait * 1.6;
    ctx.stroke();
  }
  ctx.restore();
}

/* --------------------------------------------------------- interactions plan */

function brancherPlan() {
  const toile = $('#toile-plan');
  const position = (e) => {
    const r = toile.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: ((e.clientY - r.top) / r.height) * (toile.height / toile.width),
    };
  };

  toile.addEventListener('click', (e) => {
    const plan = planCourant();
    if (!plan?.image || !etat.planEtape) return;
    const p = position(e);

    if (etat.planEtape === 'etalon') {
      if (!plan.etalonPartiel) {
        plan.etalonPartiel = p;
      } else {
        const metres = nb($('#plan-etalon-metres'), 0);
        if (metres > 0) plan.etalon = { a: plan.etalonPartiel, b: p, metres };
        plan.etalonPartiel = null;
        etat.planEtape = plan.sommet ? null : 'sommet';
      }
    } else if (etat.planEtape === 'sommet') {
      plan.sommet = p;
      etat.planEtape = plan.vise ? null : 'vise';
    } else if (etat.planEtape === 'vise') {
      plan.vise = p;
      etat.planEtape = null;
    }
    majPlan();
  });

  $$('.etapes [data-etape]').forEach((b) => b.addEventListener('click', () => {
    // Affectation et non bascule : l'outil arme l'étape suivante tout seul, et
    // re-cliquer sur un bouton doit la reprendre, pas l'annuler.
    etat.planEtape = b.dataset.etape;
    planCourant().etalonPartiel = null;
    if (etat.mode !== 'plan') basculerMode('plan');
    majConsigne();
  }));

  $('#plan-etalon-metres').addEventListener('input', () => {
    const plan = planCourant();
    if (!plan?.etalon) return;
    plan.etalon.metres = nb($('#plan-etalon-metres'), plan.etalon.metres);
    majPlan();
  });
  $('#plan-ouverture').addEventListener('input', (e) => {
    planCourant().ouverture = nb(e.target, 60);
    majPlan();
  });
  $('#plan-lier').addEventListener('change', (e) => {
    planCourant().lieeFocale = e.target.checked;
    majPlan();
  });
  $('#plan-effacer').addEventListener('click', () => {
    const plan = planCourant();
    plan.sommet = null;
    plan.vise = null;
    plan.etalonPartiel = null;
    etat.planEtape = 'sommet';
    majPlan();
  });
  $('#plan-reprendre').addEventListener('click', () => {
    const m = mesurePlan();
    if (!m) return;
    // Le tracé fixe la focale et la distance : le bloc 2 les reprend, et toute
    // l'analyse de cadrage s'aligne sur ce qui a été dessiné.
    $('#cam-focale').value = Math.round(m.focale * 10) / 10;
    $('#cam-distance').value = Math.round(m.portee * 10) / 10;
    majOptique();
    majPlan();
  });
  $('#plan-exporter').addEventListener('click', exporterPlan);
}

/** Plan annoté du tracé, en pleine définition — pour l'export et le rapport. */
function planAnnote(cam) {
  const plan = cam?.plan;
  if (!plan?.image?.img) return null;
  const toile = document.createElement('canvas');
  const l = plan.image.img.naturalWidth;
  toile.width = l;
  toile.height = plan.image.img.naturalHeight;
  const ctx = toile.getContext('2d');
  ctx.drawImage(plan.image.img, 0, 0);
  dessinerTracePlan(ctx, l, plan, mesurePlanDe(cam));
  return toile;
}

function exporterPlan() {
  const toile = planAnnote(cameraCourante());
  if (!toile) return;
  const a = document.createElement('a');
  a.href = toile.toDataURL('image/png');
  a.download = `${(cameraCourante()?.nom || 'camera').replace(/\s+/g, '-').toLowerCase()}-plan.png`;
  a.click();
}

/* -------------------------------------------------------------- catalogue */

/**
 * Au-delà de quatre, la liste de matériel cesse d'aider : les varifocaux d'une
 * même plage donnent tous le même réglage, et le choix se fait alors sur le
 * boîtier, le prix ou l'habitude — pas sur l'optique.
 */
const MAX_PROPOSITIONS = 4;

/** Réserve en quelques mots, pour tenir sur la ligne d'une proposition. */
function reserveCourte(entree) {
  const restes = aConfirmer(entree)
    .map((r) => (r === 'le format de capteur' ? 'capteur' : 'référence'));
  return restes.length ? ` <em>(${restes.join(' et ')} à confirmer)</em>` : '';
}

/** Ce que la liste tronquée ne montre pas. */
function resteProposition(propositions) {
  const reste = propositions.length - MAX_PROPOSITIONS;
  return reste > 0
    ? `<p class="note">${reste} autre${reste > 1 ? 's' : ''} référence${reste > 1 ? 's' : ''}
       du catalogue couvre${reste > 1 ? 'nt' : ''} aussi cette focale.</p>`
    : '';
}

/** Pastille de provenance d'une entrée : ce qui est sourcé, ce qui ne l'est pas. */
function pastilleProvenance(e) {
  if (!estComplete(e)) {
    return {
      marque: '⋯',
      titre: 'Focale ou définition manquante — cette référence ne sera pas proposée '
        + 'tant qu\'elle n\'est pas complétée.',
    };
  }
  const restes = aConfirmer(e);
  const origine = e.source ? ` Source : ${e.source}.` : '';
  if (!restes.length) return { marque: '✓', titre: `Référence et optique vérifiées.${origine}` };
  return {
    marque: restes.includes('la référence') ? '?' : '~',
    titre: `${restes.join(' et ')} à confirmer sur la fiche technique du modèle.${origine}`,
  };
}

function majCatalogue() {
  const lignes = etat.catalogue.map((e, i) => `<tr class="${estComplete(e) ? (aConfirmer(e).length ? 'a-confirmer' : '') : 'a-completer'}">
      <td><input type="text" data-cat="${i}" data-champ="marque" value="${ech(e.marque || '')}" placeholder="Marque"></td>
      <td><input type="text" data-cat="${i}" data-champ="reference" value="${ech(e.reference)}" placeholder="Référence"></td>
      <td><input type="text" data-cat="${i}" data-champ="voie" value="${ech(e.voie)}" placeholder="voie"></td>
      <td><input type="text" data-cat="${i}" data-champ="focaleMin" value="${fmt(e.focaleMin, 1)}"></td>
      <td><input type="text" data-cat="${i}" data-champ="focaleMax" value="${fmt(e.focaleMax, 1)}"></td>
      <td><select data-cat="${i}" data-champ="type">
        <option value="visible"${e.type === 'visible' ? ' selected' : ''}>visible</option>
        <option value="thermique"${e.type === 'thermique' ? ' selected' : ''}>thermique</option>
      </select></td>
      <td title="${ech(pastilleProvenance(e).titre)}">${pastilleProvenance(e).marque}</td>
      <td><button type="button" class="btn btn-fantome btn-petit" data-cat-suppr="${i}">×</button></td>
    </tr>`).join('');

  const incompletes = etat.catalogue.filter((e) => !estComplete(e)).length;
  const supposees = etat.catalogue.filter((e) => estComplete(e) && aConfirmer(e).length).length;
  $('#catalogue-liste').innerHTML = `<div class="defilant"><table class="catalogue">
      <thead><tr><th>Marque</th><th>Référence</th><th>Voie</th><th>f min</th><th>f max</th>
        <th>Type</th><th>✓</th><th></th></tr></thead>
      <tbody>${lignes}</tbody></table></div>
    ${supposees ? `<p class="note">${plur(supposees, 'référence')} marquée${supposees > 1 ? 's' : ''}
      « ~ » : la référence et la focale viennent d'un document, mais le format de capteur n'y
      figure pas — il ne se lit que sur la fiche technique. Corriger la ligne la passe en « ✓ ».</p>` : ''}
    ${incompletes ? `<p class="note">${plur(incompletes, 'référence')} marquée${incompletes > 1 ? 's' : ''}
      « ⋯ » : focale ou définition manquante. Elles restent listées pour mémoire mais ne sont
      jamais proposées au client.</p>` : ''}`;

  $$('#catalogue-liste [data-cat]').forEach((el) => el.addEventListener('change', () => {
    const i = Number(el.dataset.cat);
    etat.catalogue[i] = normaliserEntree(
      { ...etat.catalogue[i], verifie: true, [el.dataset.champ]: el.value }, i,
    );
    enregistrerCatalogue();
    majCatalogue();
    majPlan();
    majPhoto();
  }));
  $$('#catalogue-liste [data-cat-suppr]').forEach((el) => el.addEventListener('click', () => {
    etat.catalogue.splice(Number(el.dataset.catSuppr), 1);
    enregistrerCatalogue();
    majCatalogue();
    majPlan();
    majPhoto();
  }));
}

/* ====================================================== relevé de l'étude */

/** Valeurs de l'étude qui s'appliquent à la caméra retenue. */
function champsEtude() {
  if (!etat.etude) return {};
  return champsPourCamera(etat.etude.analyse, cameraCourante()?.repereEtude);
}

/** Confrontation étude / pose, telle qu'elle est affichée et imprimée. */
function comparaisonEtude() {
  if (!etat.etude) return [];
  return confronter(champsEtude(), configCamera(), anglesDeChamp);
}

/**
 * Matériel annoncé par l'étude, et garde-fou sur les caméras thermiques.
 *
 * Un microbolomètre ne se désigne pas en pouces : laisser un format visible
 * sélectionné sur une caméra thermique donnerait un angle de champ faux, donc
 * un écart de pointage faux, sans que rien ne le signale.
 */
function majMateriel() {
  const champs = champsEtude();
  const infos = [];
  if (champs.modele) infos.push(`Matériel prévu : <strong>${ech(champs.modele.valeur)}</strong>`);
  if (champs.type) infos.push(`type ${ech(champs.type.valeur.toLowerCase())}`);
  $('#etude-materiel').innerHTML = infos.join(' — ');
  $('#etude-materiel').hidden = !infos.length;

  const annonceeThermique = /thermi/i.test(champs.type?.valeur || '')
    || /thermi/i.test(champs.modele?.valeur || '');
  const capteurThermique = /^Thermique/i.test(configCamera().capteurCle);
  $('#etude-thermique').hidden = !(annonceeThermique && !capteurThermique);
}

/** Libellés des caractéristiques, pour dire clairement ce qui manque. */
const LIBELLES_CHAMPS = {
  focale: 'focale', angle: 'angle de vue', capteur: 'capteur',
  resolution: 'résolution', distance: 'distance à la scène',
  hauteur: 'hauteur de pose', densite: 'densité px/m', niveau: 'niveau attendu',
};

/**
 * Montre ce que l'outil a réellement lu, passages retenus surlignés.
 *
 * C'est le seul moyen de comprendre, sans le document sous les yeux, pourquoi
 * une caractéristique manque : mauvaise formulation, colonne de tableau non
 * rattachée, ou page simplement absente du texte.
 */
function majTexteLu() {
  const bloc = $('#etude-diagnostic');
  const pages = etat.etude?.pages || [];
  bloc.hidden = !pages.length;
  if (!pages.length) return;

  const champs = champsEtude();
  const manquants = Object.keys(LIBELLES_CHAMPS).filter((c) => !champs[c]);
  $('#etude-manquant').textContent = manquants.length
    ? `Non relevé pour cette caméra : ${manquants.map((c) => LIBELLES_CHAMPS[c]).join(', ')}.`
    : 'Toutes les caractéristiques attendues ont été relevées.';

  // Toutes les lignes retenues, caméras comprises : ce sont elles qu'on surligne.
  const retenues = new Set();
  const collecter = (o) => Object.values(o || {}).forEach((v) => v?.extrait && retenues.add(v.extrait));
  collecter(etat.etude.analyse.entete);
  collecter(etat.etude.analyse.champs);
  etat.etude.analyse.cameras.forEach((c) => collecter(c.champs));

  $('#etude-texte').innerHTML = pages.map((texte, i) => {
    const lignes = String(texte || '').split('\n').filter((l) => l.trim());
    const corps = lignes.length
      ? lignes.map((l) => {
        const marque = [...retenues].some((e) => l.trim().startsWith(e.slice(0, 40)));
        return marque ? `<p><mark>${ech(l)}</mark></p>` : `<p>${ech(l)}</p>`;
      }).join('')
      : '<p class="vide">(aucun texte sur cette page)</p>';
    return `<h4>Page ${i + 1}</h4>${corps}`;
  }).join('');
}

const APPLICABLES = new Set(['focale', 'capteur', 'resolution', 'distance', 'hauteur', 'angle']);

/** Recopie une valeur de l'étude dans le bloc « Caméra et optique ». */
function reprendre(cle) {
  const champs = champsEtude();
  const champ = champs[cle];
  if (!champ) return;

  if (cle === 'focale') $('#cam-focale').value = champ.valeur;
  if (cle === 'distance') $('#cam-distance').value = champ.valeur;
  if (cle === 'hauteur') $('#cam-hauteur').value = champ.valeur;

  if (cle === 'capteur' && CAPTEURS[champ.valeur]) $('#cam-capteur').value = champ.valeur;

  if (cle === 'resolution') {
    const { h, v } = champ.valeur;
    const index = RESOLUTIONS.findIndex((r) => r.h === h && r.v === v);
    if (index >= 0) {
      $('#cam-resolution').value = String(index);
    } else {
      $('#cam-resolution').value = String(RESOLUTIONS.length - 1); // « Autre… »
      $('#cam-res-h').value = h;
      $('#cam-res-v').value = v;
    }
  }

  // Un angle ne se règle pas directement : on remonte à la focale qui le donne
  // avec le capteur effectivement monté.
  if (cle === 'angle' && !champs.focale) {
    const capteur = capteurActuel();
    const dimension = {
      horizontal: capteur.largeur,
      vertical: capteur.hauteur,
      diagonal: Math.hypot(capteur.largeur, capteur.hauteur),
    }[champ.axe || 'horizontal'];
    const f = dimension / (2 * Math.tan(radians(champ.valeur) / 2));
    $('#cam-focale').value = Math.round(f * 10) / 10;
  }

  basculerChampsLibres();
  majOptique();
  majEtude();
}

/** Crée une fiche caméra par repère de l'étude encore absent du dossier. */
async function creerCamerasDeLEtude(manquantes) {
  sauverCameraCourante();
  const vide = (c) => !c.images?.reference && !c.images?.reglee && !c.transformation;
  for (const m of manquantes) {
    // La première caméra du dossier, si elle est encore vierge, sert de support
    // plutôt que de laisser une fiche vide traîner à côté.
    const cible = etat.cameras.length === 1 && vide(etat.cameras[0])
      ? etat.cameras[0]
      : (etat.cameras.push(nouvelleCamera(m.repere)), etat.cameras[etat.cameras.length - 1]);
    cible.nom = m.repere;
    cible.repereEtude = m.repere;
  }
  await chargerCamera(etat.index);
}

/** Met le texte lu dans le presse-papiers, pour le transmettre tel quel. */
async function copierTexteLu() {
  const bouton = $('#etude-copier');
  const texte = (etat.etude?.pages || [])
    .map((p, i) => `--- Page ${i + 1} ---\n${p}`).join('\n\n');
  try {
    await navigator.clipboard.writeText(texte);
    bouton.textContent = 'Texte copié';
  } catch {
    // Le presse-papiers est refusé à une page ouverte depuis le disque sur
    // certains navigateurs : on sélectionne alors le texte, à copier à la main.
    const plage = document.createRange();
    plage.selectNodeContents($('#etude-texte'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(plage);
    bouton.textContent = 'Texte sélectionné — Ctrl+C';
  }
  setTimeout(() => { bouton.textContent = 'Copier le texte'; }, 4000);
}

function reprendreEntete() {
  const { entete } = etat.etude?.analyse || {};
  if (!entete) return;
  if (entete.client) $('#ch-client').value = entete.client.valeur;
  if (entete.site) $('#ch-site').value = entete.site.valeur;
  if (entete.affaire) $('#ch-affaire').value = entete.affaire.valeur;
  // Action explicitement demandée : le repère de l'étude l'emporte sur le nom
  // provisoire de la caméra.
  const repere = cameraCourante()?.repereEtude;
  if (repere) {
    $('#ch-camera').value = repere;
    majOnglets();
  }
}

function majEtude() {
  const bloc = $('#bloc-etude');
  if (!etat.etude) { bloc.hidden = true; return; }
  bloc.hidden = false;

  const { cameras } = etat.etude.analyse;
  const choix = $('#etude-choix-camera');
  choix.hidden = !cameras.length;
  if (cameras.length) {
    const select = $('#etude-camera');
    select.innerHTML = '';
    cameras.forEach((c) => select.append(new Option(`${c.repere} (page ${c.page})`, c.repere)));
    select.value = cameraCourante()?.repereEtude || cameras[0].repere;
    if (cameraCourante()) cameraCourante().repereEtude = select.value;
  }

  // Une étude qui décrit plus de caméras que le dossier n'en compte : proposer
  // de créer les fiches manquantes d'un coup.
  const manquantes = cameras.filter(
    (c) => !etat.cameras.some((x) => x.repereEtude === c.repere),
  );
  const bouton = $('#etude-creer-cameras');
  bouton.hidden = manquantes.length === 0;
  bouton.textContent = manquantes.length > 1
    ? `Créer les ${manquantes.length} caméras manquantes`
    : 'Créer la caméra manquante';
  bouton.onclick = () => creerCamerasDeLEtude(manquantes);

  $('#etude-ocr').hidden = !etat.etude.ocr;
  majMateriel();
  majTexteLu();

  const lignes = comparaisonEtude();
  const tableau = $('#etude-tableau');
  if (!lignes.length) {
    tableau.innerHTML = '<p class="etude-vide">Aucune caractéristique technique reconnue dans le '
      + 'texte de ce PDF. L\'étude est peut-être scannée en image, ou rédigée dans une forme que '
      + 'l\'outil ne sait pas lire : saisir les valeurs à la main dans le bloc 2.</p>';
    return;
  }

  tableau.innerHTML = `<table class="etude">
      <colgroup><col class="carac"><col class="val"><col class="val"><col class="action"></colgroup>
      <thead><tr><th>Caractéristique</th><th>Étude</th><th>Posé</th><th></th></tr></thead>
      <tbody>${lignes.map((l) => `
        <tr class="${l.conforme ? 'ok' : 'ko'}">
          <td title="${l.source ? `Page ${l.source.page} : « ${ech(l.source.extrait)} »` : ''}">${l.libelle}</td>
          <td class="valeur">${ech(l.etude)}</td>
          <td class="valeur">${ech(l.installe)}${l.remarque ? `<span class="remarque">${ech(l.remarque)}</span>` : ''}</td>
          <td>${APPLICABLES.has(l.cle) && l.source
            ? `<button type="button" class="btn btn-fantome btn-petit" data-reprendre="${l.cle}">Reprendre</button>`
            : ''}</td>
        </tr>`).join('')}</tbody></table>`;

  $$('#etude-tableau button[data-reprendre]').forEach((b) => {
    b.addEventListener('click', () => reprendre(b.dataset.reprendre));
  });
}

/* ======================================================== chargement images */

function chargerImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = dataUrl;
  });
}

function lireFichier(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(lecteur.result);
    lecteur.onerror = () => reject(new Error('Lecture impossible'));
    lecteur.readAsDataURL(fichier);
  });
}

/**
 * Installe une image dans l'un des deux cadres.
 * `reinitialiser` est mis à faux au rechargement d'une caméra du dossier : on
 * remet alors en place une analyse déjà faite, il ne faut pas l'effacer.
 */
async function definirImage(role, dataUrl, nom, source = null, reinitialiser = true) {
  const img = await chargerImage(dataUrl);
  etat[role] = {
    nom: nom || 'image', dataUrl, img, source,
    largeur: img.naturalWidth, hauteur: img.naturalHeight,
  };
  const suffixe = role === 'reference' ? 'reference' : 'reglee';
  const vignette = $(`#vignette-${suffixe}`);
  vignette.src = dataUrl;
  vignette.hidden = false;
  $(`#depot-${suffixe} .depot-texte`).hidden = true;
  $(`#info-${suffixe}`).textContent = `${etat[role].nom} — ${img.naturalWidth} × ${img.naturalHeight} px`
    + (source?.type === 'pdf' && source.recadre ? ' (recadrée)' : '');

  $('#btn-analyser').disabled = !(etat.reference && etat.reglee);
  if (reinitialiser) {
    etat.cache = null;
    etat.transformation = null;
    etat.diagnostic = null;
    $('#verdict').hidden = true;
    $('#etat-analyse').textContent = etat.reference && etat.reglee
      ? 'Les deux vues sont chargées : lancer l\'analyse.' : '';
    $('#etat-analyse').classList.remove('erreur');
    majVisionneuse();
    majOnglets();
  }
}

/** Installe le plan d'implantation de la caméra affichée. */
async function definirPlan(dataUrl, nom) {
  const img = await chargerImage(dataUrl);
  const plan = planCourant();
  plan.image = { nom, dataUrl, img, largeur: img.naturalWidth, hauteur: img.naturalHeight };
  $('#vignette-plan').src = dataUrl;
  $('#vignette-plan').hidden = false;
  $('#depot-plan .depot-texte').hidden = true;
  $('#info-plan').textContent = `${nom} — ${img.naturalWidth} × ${img.naturalHeight} px`;
  if (!plan.etalon) etat.planEtape = 'etalon';
  basculerMode('plan');
  majPlan();
}

async function traiterPlan(fichier) {
  if (estPdf(fichier)) {
    await ouvrirSelecteurPdf(fichier, 'plan', (dataUrl, source) => {
      definirPlan(dataUrl, `${source.fichier} — page ${source.page}`);
    });
    return;
  }
  if (!fichier || !fichier.type.startsWith('image/')) {
    $('#etat-analyse').textContent = 'Format non reconnu : déposer une image ou un PDF.';
    $('#etat-analyse').classList.add('erreur');
    return;
  }
  await definirPlan(await lireFichier(fichier), fichier.name);
}

async function traiterFichier(role, fichier) {
  if (estPdf(fichier)) {
    await ouvrirSelecteurPdf(fichier, role, (dataUrl, source, etude) => {
      if (etude) {
        etat.etude = etude;
        // La caméra courante est rattachée à la section d'étude qui porte la
        // page retenue : c'est presque toujours la bonne.
        const section = etude.analyse.cameras.find((c) => c.page === source.page)
          || etude.analyse.cameras[0];
        if (section && cameraCourante()) cameraCourante().repereEtude = section.repere;
      }
      definirImage(role, dataUrl, `${source.fichier} — page ${source.page}`, source)
        .then(majEtude);
    });
    return;
  }
  if (!fichier || !fichier.type.startsWith('image/')) {
    $('#etat-analyse').textContent = 'Format non reconnu : déposer une image ou un PDF.';
    $('#etat-analyse').classList.add('erreur');
    return;
  }
  await definirImage(role, await lireFichier(fichier), fichier.name);
}

/** Dépôt de la photo de repérage. */
function brancherDepotPhoto() {
  const zone = $('#depot-photo');
  const entree = $('#fichier-photo');
  const traiter = async (fichier) => {
    if (!fichier || !fichier.type.startsWith('image/')) {
      $('#etat-analyse').textContent = 'La photo de repérage doit être une image.';
      $('#etat-analyse').classList.add('erreur');
      return;
    }
    await definirPhoto(await lireFichier(fichier), fichier.name);
  };
  zone.addEventListener('click', () => { etat.dernierDepot = 'photo'; entree.click(); });
  // Le même geste depuis l'écran d'accueil, où l'on cherche par quoi commencer.
  $('#demarrer-photo').addEventListener('click', () => {
    etat.dernierDepot = 'photo';
    zone.scrollIntoView({ block: 'center', behavior: 'smooth' });
    entree.click();
  });
  zone.addEventListener('focus', () => { etat.dernierDepot = 'photo'; });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entree.click(); }
  });
  entree.addEventListener('change', () => {
    if (entree.files[0]) traiter(entree.files[0]);
    entree.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('survol'); etat.dernierDepot = 'photo';
  }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('survol')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) traiter(e.dataTransfer.files[0]);
  });
  etat.traiterPhoto = traiter;
}

/** Dépôt du plan : même geste que pour les vues, autre destination. */
function brancherDepotPlan() {
  const zone = $('#depot-plan');
  const entree = $('#fichier-plan');
  zone.addEventListener('click', () => { etat.dernierDepot = 'plan'; entree.click(); });
  zone.addEventListener('focus', () => { etat.dernierDepot = 'plan'; });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entree.click(); }
  });
  entree.addEventListener('change', () => {
    if (entree.files[0]) traiterPlan(entree.files[0]);
    entree.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('survol'); etat.dernierDepot = 'plan';
  }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('survol')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) traiterPlan(e.dataTransfer.files[0]);
  });
}

function brancherDepot(role) {
  const suffixe = role === 'reference' ? 'reference' : 'reglee';
  const zone = $(`#depot-${suffixe}`);
  const entree = $(`#fichier-${suffixe}`);

  zone.addEventListener('click', () => { etat.dernierDepot = role; entree.click(); });
  zone.addEventListener('focus', () => { etat.dernierDepot = role; });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entree.click(); }
  });
  entree.addEventListener('change', () => {
    if (entree.files[0]) traiterFichier(role, entree.files[0]);
    entree.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('survol'); etat.dernierDepot = role;
  }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('survol')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) traiterFichier(role, e.dataTransfer.files[0]);
  });
}

document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  if (etat.dernierDepot === 'plan') {
    traiterPlan(item.getAsFile());
    return;
  }
  if (etat.dernierDepot === 'photo') {
    etat.traiterPhoto(item.getAsFile());
    return;
  }
  const role = etat.reference ? etat.dernierDepot : 'reference';
  traiterFichier(role, item.getAsFile());
});

/* ============================================================== analyse */

/** Extrait les niveaux de gris d'une image, réduite à `largeurCible`. */
function grisDepuisImage(img, largeurCible) {
  const l = Math.min(largeurCible, img.naturalWidth);
  const h = Math.max(1, Math.round((l * img.naturalHeight) / img.naturalWidth));
  const toile = document.createElement('canvas');
  toile.width = l;
  toile.height = h;
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, l, h);
  return versGris(ctx.getImageData(0, 0, l, h));
}

/** Prépare les images prétraitées servant au recalage manuel. */
function preparerCache() {
  if (etat.cache) return etat.cache;
  const largeur = 192;
  const prep = (img) => {
    const gris = grisDepuisImage(img, TAILLE_ANALYSE);
    const h = Math.max(16, Math.round((largeur * gris.hauteur) / gris.largeur));
    return pretraiter(redimensionner(gris, largeur, h));
  };
  etat.cache = { ref: prep(etat.reference.img), act: prep(etat.reglee.img) };
  return etat.cache;
}

function analyser() {
  if (!etat.reference || !etat.reglee) return;
  const info = $('#etat-analyse');
  info.classList.remove('erreur');
  info.textContent = 'Recalage en cours…';
  $('#btn-analyser').disabled = true;

  // Laisse le navigateur peindre le message avant le calcul synchrone.
  setTimeout(() => {
    try {
      const debut = performance.now();
      const ref = grisDepuisImage(etat.reference.img, TAILLE_ANALYSE);
      const act = grisDepuisImage(etat.reglee.img, TAILLE_ANALYSE);
      etat.transformation = estimerTransformation(ref, act, {
        rotationLibre: $('#opt-rotation').checked,
        echelleLibre: $('#opt-echelle').checked,
      });
      etat.manuel = false;
      synchroniserCurseurs();
      majDiagnostic();
      info.textContent = `Recalage effectué en ${Math.round(performance.now() - debut)} ms — `
        + `corrélation ${fmt(etat.transformation.zncc, 2)}, `
        + `recouvrement ${fmt(etat.transformation.recouvrement * 100, 0)} %.`;
    } catch (err) {
      info.textContent = `Échec du recalage : ${err.message}`;
      info.classList.add('erreur');
    } finally {
      $('#btn-analyser').disabled = false;
    }
  }, 20);
}

function synchroniserCurseurs() {
  const t = etat.transformation;
  if (!t) return;
  $('#man-tx').value = t.tx;
  $('#man-ty').value = t.ty;
  $('#man-echelle').value = t.echelle;
  $('#man-rotation').value = t.rotation;
  majEtiquettesCurseurs();
}

function majEtiquettesCurseurs() {
  $('#out-tx').textContent = `${fmt(nb($('#man-tx')) * 100, 1)} %`;
  $('#out-ty').textContent = `${fmt(nb($('#man-ty')) * 100, 1)} %`;
  $('#out-echelle').textContent = `× ${fmt(nb($('#man-echelle'), 1), 3)}`;
  $('#out-rotation').textContent = `${fmt(nb($('#man-rotation')))} °`;
}

function recalageManuel() {
  if (!etat.reference || !etat.reglee) return;
  const t = {
    tx: nb($('#man-tx')),
    ty: nb($('#man-ty')),
    echelle: nb($('#man-echelle'), 1),
    rotation: nb($('#man-rotation')),
  };
  const cache = preparerCache();
  const { zncc, recouvrement } = correlation(cache.ref, cache.act, t);
  etat.transformation = { ...t, zncc, recouvrement };
  etat.manuel = true;
  majEtiquettesCurseurs();
  majDiagnostic();
}

/* ============================================================== verdict */

function majDiagnostic() {
  if (!etat.transformation) return;
  const c = configCamera();
  etat.diagnostic = diagnostiquer(etat.transformation, c.angles, {
    tolerances: tolerancesActuelles(),
    distance: c.distance,
    focale: c.focale,
  });
  rendreVerdict(etat.diagnostic, c);
  majVisionneuse();
  majZones();
  majOnglets();
}

function rendreVerdict(d, c) {
  const boite = $('#verdict');
  boite.hidden = false;
  const decalage = d.decalageScene
    ? `<span class="note">Sur la scène à ${fmt(c.distance)} m : ${fmt(Math.abs(d.decalageScene.horizontal), 2)} m
       ${d.decalageScene.horizontal > 0 ? 'à droite' : 'à gauche'} et
       ${fmt(Math.abs(d.decalageScene.vertical), 2)} m
       ${d.decalageScene.vertical > 0 ? 'trop bas' : 'trop haut'} du point demandé.</span>`
    : '';

  boite.innerHTML = `
    <div class="verdict-entete">
      <span class="pastille ${d.verdict}">${LIBELLES_VERDICT[d.verdict]}</span>
      <span class="score">${d.fiable ? d.score : '—'}<small> / 100</small></span>
      ${etat.manuel ? '<span class="note">Recalage manuel</span>' : ''}
      <span class="note">Corrélation ${fmt(d.qualiteRecalage.zncc, 2)} ·
        recouvrement ${fmt(d.qualiteRecalage.recouvrement * 100, 0)} %</span>
      ${decalage}
    </div>
    <div class="criteres">
      ${d.criteres.map((cr) => `
        <div class="critere ${cr.conforme ? 'ok' : 'ko'}">
          <span class="cle">${cr.label}</span>
          <span class="val">${cr.ecart > 0 ? '+' : ''}${fmt(cr.ecart, 2)} ${cr.unite}</span>
          <span class="tol">tolérance ± ${fmt(cr.tolerance, 1)} ${cr.unite} · note ${cr.note}</span>
        </div>`).join('')}
    </div>
    <ul class="consignes">
      ${d.consignes.map((x) => `<li><span class="axe">${x.axe}</span><span>${x.texte}</span></li>`).join('')}
    </ul>`;
}

/* ============================================================ visionneuse */

/** Matrice amenant les pixels de la vue demandée dans le repère de la vue réglée. */
function matriceRecalage(t, refL, refH, actL) {
  const k = (actL / refL) * t.echelle;
  const a = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cxR = (refL - 1) / 2;
  const cyR = (refH - 1) / 2;
  return {
    a: k * cos, b: k * sin, c: -k * sin, d: k * cos,
    e: t.tx * actL - k * (cxR * cos - cyR * sin),
    f: t.ty * actL - k * (cxR * sin + cyR * cos),
    k,
  };
}

/** Applique la matrice à un point du repère « vue demandée ». */
function projeter(m, x, y, cxA, cyA) {
  return { x: m.a * x + m.c * y + m.e + cxA, y: m.b * x + m.d * y + m.f + cyA };
}

function dimensionsRendu(img) {
  const l = Math.min(TAILLE_RENDU, img.naturalWidth);
  return { l, h: Math.max(1, Math.round((l * img.naturalHeight) / img.naturalWidth)) };
}

function transformationCourante() {
  return etat.transformation && $('#opt-recalage').checked
    ? etat.transformation
    : { tx: 0, ty: 0, echelle: 1, rotation: 0 };
}

function basculerMode(mode) {
  $$('.mode').forEach((x) => x.classList.toggle('actif', x.dataset.mode === mode));
  etat.mode = mode;
  majVisionneuse();
}

function majVisionneuse() {
  const pret = etat.reference && etat.reglee;
  const plan = cameraCourante()?.plan;
  const etudePhoto = cameraCourante()?.etude3d;
  const surPlan = etat.mode === 'plan';
  const surPhoto = etat.mode === 'photo';
  $('#message-vide').hidden = !!(etat.reference || etat.reglee) || surPlan || surPhoto
    || etat.mode === 'reseau';
  $('#paire').hidden = etat.mode !== 'cote' || !(etat.reference || etat.reglee);
  $('#fusion').hidden = surPlan || surPhoto || etat.mode === 'reseau' || etat.mode === 'cote' || !pret;
  $('#plan-vue').hidden = !(surPlan && plan?.image?.img);
  $('#photo-vue').hidden = !(surPhoto && etudePhoto?.image?.img);
  const surReseau = etat.mode === 'reseau';
  $('#reseau-vue').hidden = !(surReseau && etat.synoptique?.image?.img);
  if (!surPhoto || !etudePhoto?.image?.img) {
    $('#photo-resultats').hidden = true;
  }
  if (!surReseau || !etat.synoptique?.image?.img) $('#reseau-resultats').hidden = true;
  if (!(surPhoto && etudePhoto?.image?.img) && !(surReseau && etat.synoptique?.image?.img)) {
    $('.scene').classList.remove('avec-resultats');
  }
  if (surReseau) {
    if (etat.synoptique?.image?.img) {
      $('#reseau-resultats').hidden = false;
      $('.scene').classList.add('avec-resultats');
      rendreReseau();
    } else {
      $('#message-vide').hidden = false;
      $('#message-vide').innerHTML = '<h3>Charger une vue aérienne du site</h3>'
        + '<p>Le matériel se pose dessus, les liaisons se tirent entre eux,<br>'
        + 'et les longueurs de câble se mesurent.</p>';
    }
    return;
  }
  if (surPhoto) {
    if (etudePhoto?.image?.img) rendrePhoto();
    else {
      $('#message-vide').hidden = false;
      $('#message-vide').innerHTML = '<h3>Charger une photo de repérage</h3>'
        + '<p>Une photo prise depuis l\'emplacement prévu de la caméra.<br>'
        + 'La zone à couvrir se trace dessus.</p>';
    }
    return;
  }
  if (surPlan) {
    if (plan?.image?.img) rendrePlan();
    else {
      $('#message-vide').hidden = false;
      $('#message-vide').innerHTML = '<h3>Charger un plan d\'implantation</h3>'
        + '<p>Une vue aérienne du site, ou la page de plan de l\'étude.<br>'
        + 'Le tracé du champ se fait dessus.</p>';
    }
    return;
  }
  $('#ctrl-opacite').hidden = etat.mode !== 'superposition';
  $('#ctrl-rideau').hidden = etat.mode !== 'rideau';

  if (etat.mode === 'cote') rendrePaire();
  else if (pret) rendreFusion();
}

function rendrePaire() {
  $$('#paire figure')[0].hidden = !etat.reference;
  $$('#paire figure')[1].hidden = !etat.reglee;
  if (etat.reference) {
    const { l, h } = dimensionsRendu(etat.reference.img);
    const toile = $('#toile-reference');
    toile.width = l; toile.height = h;
    const ctx = toile.getContext('2d');
    ctx.drawImage(etat.reference.img, 0, 0, l, h);
    if ($('#opt-grille').checked) dessinerGrille(ctx, l, h);
    dessinerZonesReference(ctx, l, h);
    if ($('#opt-reticule').checked) dessinerCroix(ctx, l / 2, h / 2, '#3d8bfd', l);
    toile.style.cursor = etat.tracage ? 'crosshair' : 'default';
  }
  if (etat.reglee) {
    const { l, h } = dimensionsRendu(etat.reglee.img);
    const toile = $('#toile-reglee');
    toile.width = l; toile.height = h;
    const ctx = toile.getContext('2d');
    ctx.drawImage(etat.reglee.img, 0, 0, l, h);
    if ($('#opt-grille').checked) dessinerGrille(ctx, l, h);
    if (etat.transformation) {
      dessinerZonesProjetees(ctx, l, h);
      if ($('#opt-reticule').checked) dessinerEcart(ctx, l, h);
    } else if ($('#opt-reticule').checked) {
      dessinerCroix(ctx, l / 2, h / 2, '#c8102e', l);
    }
  }
}

function rendreFusion() {
  const { l, h } = dimensionsRendu(etat.reglee.img);
  const toile = $('#toile-fusion');
  toile.width = l; toile.height = h;
  const ctx = toile.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, l, h);
  ctx.drawImage(etat.reglee.img, 0, 0, l, h);

  const t = transformationCourante();
  const ref = etat.reference.img;
  const m = matriceRecalage(t, ref.naturalWidth, ref.naturalHeight, l);
  const cxA = (l - 1) / 2;
  const cyA = (h - 1) / 2;

  ctx.save();
  if (etat.mode === 'rideau') {
    const x = (nb($('#rideau'), 50) / 100) * l;
    ctx.beginPath();
    ctx.rect(0, 0, x, h);
    ctx.clip();
  } else if (etat.mode === 'superposition') {
    ctx.globalAlpha = nb($('#opacite'), 50) / 100;
  } else if (etat.mode === 'difference') {
    ctx.globalCompositeOperation = 'difference';
  }
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e + cxA, m.f + cyA);
  ctx.drawImage(ref, 0, 0, ref.naturalWidth, ref.naturalHeight);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (etat.mode === 'rideau') {
    const x = (nb($('#rideau'), 50) / 100) * l;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, l / 500);
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    etiquette(ctx, 'Vue demandée', 8, 8, l);
    etiquette(ctx, 'Image réglée', x + 8, 8, l);
  }

  if ($('#opt-grille').checked) dessinerGrille(ctx, l, h);
  dessinerZonesProjetees(ctx, l, h);
  if ($('#opt-reticule').checked && etat.transformation) dessinerEcart(ctx, l, h);
}

function etiquette(ctx, texte, x, y, largeurRef) {
  const taille = Math.max(11, largeurRef / 60);
  ctx.font = `600 ${taille}px ${getComputedStyle(document.body).fontFamily}`;
  const m = ctx.measureText(texte);
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(x, y, m.width + 12, taille + 10);
  ctx.fillStyle = '#fff';
  ctx.fillText(texte, x + 6, y + taille + 2);
}

function dessinerGrille(ctx, l, h) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = Math.max(1, l / 900);
  ctx.setLineDash([6, 6]);
  for (let i = 1; i < 3; i += 1) {
    ctx.beginPath(); ctx.moveTo((l * i) / 3, 0); ctx.lineTo((l * i) / 3, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, (h * i) / 3); ctx.lineTo(l, (h * i) / 3); ctx.stroke();
  }
  ctx.restore();
}

function dessinerCroix(ctx, x, y, couleur, largeurRef) {
  const r = Math.max(8, largeurRef / 40);
  ctx.save();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = Math.max(1.5, largeurRef / 500);
  ctx.beginPath();
  ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Réticule demandé (bleu), réticule réel (rouge) et flèche de correction. */
function dessinerEcart(ctx, l, h) {
  const ref = etat.reference.img;
  const m = matriceRecalage(etat.transformation, ref.naturalWidth, ref.naturalHeight, l);
  const cxA = (l - 1) / 2;
  const cyA = (h - 1) / 2;
  const centreDemande = projeter(m, (ref.naturalWidth - 1) / 2, (ref.naturalHeight - 1) / 2, cxA, cyA);

  dessinerCroix(ctx, cxA, cyA, '#c8102e', l);
  dessinerCroix(ctx, centreDemande.x, centreDemande.y, '#3d8bfd', l);

  ctx.save();
  ctx.strokeStyle = '#ffd400';
  ctx.fillStyle = '#ffd400';
  ctx.lineWidth = Math.max(1.5, l / 450);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cxA, cyA);
  ctx.lineTo(centreDemande.x, centreDemande.y);
  ctx.stroke();
  const angle = Math.atan2(centreDemande.y - cyA, centreDemande.x - cxA);
  const p = Math.max(7, l / 90);
  if (Math.hypot(centreDemande.x - cxA, centreDemande.y - cyA) > p) {
    ctx.beginPath();
    ctx.moveTo(centreDemande.x, centreDemande.y);
    ctx.lineTo(centreDemande.x - p * Math.cos(angle - 0.4), centreDemande.y - p * Math.sin(angle - 0.4));
    ctx.lineTo(centreDemande.x - p * Math.cos(angle + 0.4), centreDemande.y - p * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (etat.diagnostic && etat.diagnostic.fiable) {
    const e = etat.diagnostic.ecarts;
    etiquette(ctx, `Écart ${fmt(e.pan, 1)}° / ${fmt(e.site, 1)}°`, 8, h - Math.max(28, l / 40), l);
  }
}

/* ================================================== zones d'intérêt */

function dessinerZonesReference(ctx, l, h) {
  etat.zones.forEach((z, i) => {
    ctx.save();
    ctx.strokeStyle = COULEURS_ZONES[i % COULEURS_ZONES.length];
    ctx.lineWidth = Math.max(2, l / 400);
    ctx.strokeRect(z.x * l, z.y * h, z.l * l, z.h * h);
    ctx.fillStyle = ctx.strokeStyle;
    etiquetteZone(ctx, z.nom || `Zone ${i + 1}`, z.x * l, z.y * h, l);
    ctx.restore();
  });
}

function etiquetteZone(ctx, texte, x, y, largeurRef) {
  const taille = Math.max(10, largeurRef / 70);
  ctx.font = `600 ${taille}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.fillText(texte, x + 4, Math.max(taille, y - 4));
}

/** Projette les zones (définies sur la vue demandée) dans le repère de la vue réglée. */
function dessinerZonesProjetees(ctx, l, h) {
  if (!etat.zones.length || !etat.transformation) return;
  const ref = etat.reference.img;
  const t = etat.mode === 'cote' ? etat.transformation : transformationCourante();
  const m = matriceRecalage(t, ref.naturalWidth, ref.naturalHeight, l);
  const cxA = (l - 1) / 2;
  const cyA = (h - 1) / 2;

  etat.zones.forEach((z, i) => {
    const coins = [
      [z.x, z.y], [z.x + z.l, z.y], [z.x + z.l, z.y + z.h], [z.x, z.y + z.h],
    ].map(([u, v]) => projeter(m, u * ref.naturalWidth, v * ref.naturalHeight, cxA, cyA));
    ctx.save();
    ctx.strokeStyle = COULEURS_ZONES[i % COULEURS_ZONES.length];
    ctx.lineWidth = Math.max(2, l / 400);
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    coins.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    etiquetteZone(ctx, z.nom || `Zone ${i + 1}`, coins[0].x, coins[0].y, l);
    ctx.restore();
  });
}

/**
 * Part de la zone demandée réellement couverte par l'image réglée.
 *
 * Ne travaille que sur des dimensions et une transformation, pour pouvoir
 * chiffrer aussi les caméras du dossier qui ne sont pas à l'écran.
 *
 * @param {object} z zone, en fractions de la vue demandée
 * @param {{largeur:number, hauteur:number}} ref dimensions de la vue demandée
 * @param {{largeur:number, hauteur:number}} act dimensions de la vue réglée
 * @param {object} t transformation trouvée par le recalage
 */
function couvertureZone(z, ref, act, t) {
  if (!t || !ref || !act) return null;
  const m = matriceRecalage(t, ref.largeur, ref.hauteur, act.largeur);
  const cxA = (act.largeur - 1) / 2;
  const cyA = (act.hauteur - 1) / 2;
  const N = 24;
  let dedans = 0;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const u = (z.x + (z.l * (i + 0.5)) / N) * ref.largeur;
      const v = (z.y + (z.h * (j + 0.5)) / N) * ref.hauteur;
      const p = projeter(m, u, v, cxA, cyA);
      if (p.x >= 0 && p.y >= 0 && p.x <= act.largeur && p.y <= act.hauteur) dedans += 1;
    }
  }
  return dedans / (N * N);
}

/** Couverture des zones d'une caméra enregistrée du dossier. */
const couvertureZoneDe = (cam, z) => couvertureZone(z, cam.images?.reference, cam.images?.reglee, cam.transformation);

function majZones() {
  const liste = $('#zones-liste');
  if (!etat.zones.length) { liste.innerHTML = ''; return; }
  const seuil = nb($('#tol-zone'), 95) / 100;
  liste.innerHTML = `<h3>Zones d'intérêt</h3>${etat.zones.map((z, i) => {
    const c = couvertureZone(z, etat.reference, etat.reglee, etat.transformation);
    const pct = c === null ? '—' : `${fmt(c * 100, 0)} %`;
    const classe = c === null ? '' : (c >= seuil ? 'ok' : 'ko');
    return `<div class="zone-ligne">
        <span class="zone-pastille" style="background:${COULEURS_ZONES[i % COULEURS_ZONES.length]}"></span>
        <input type="text" data-zone="${i}" value="${ech(z.nom || '')}"
               placeholder="Zone ${i + 1}">
        <span>Couverte à <span class="zone-couv ${classe}">${pct}</span></span>
        <button type="button" class="btn btn-fantome btn-petit" data-suppr="${i}">Supprimer</button>
      </div>`;
  }).join('')}`;

  $$('#zones-liste input[data-zone]').forEach((el) => {
    el.addEventListener('input', () => { etat.zones[+el.dataset.zone].nom = el.value; majVisionneuse(); });
  });
  $$('#zones-liste button[data-suppr]').forEach((el) => {
    el.addEventListener('click', () => {
      etat.zones.splice(+el.dataset.suppr, 1);
      majZones(); majVisionneuse();
    });
  });
}

function brancherTracageZones() {
  const toile = $('#toile-reference');
  let depart = null;

  const position = (e) => {
    const r = toile.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  toile.addEventListener('pointerdown', (e) => {
    if (!etat.tracage || !etat.reference) return;
    depart = position(e);
    toile.setPointerCapture(e.pointerId);
  });
  toile.addEventListener('pointermove', (e) => {
    if (!depart) return;
    const p = position(e);
    apercuZone(depart, p);
  });
  toile.addEventListener('pointerup', (e) => {
    if (!depart) return;
    const p = position(e);
    const z = {
      x: Math.min(depart.x, p.x), y: Math.min(depart.y, p.y),
      l: Math.abs(p.x - depart.x), h: Math.abs(p.y - depart.y),
      nom: '',
    };
    depart = null;
    if (z.l > 0.02 && z.h > 0.02) etat.zones.push(z);
    etat.tracage = false;
    $('#btn-zones').textContent = 'Tracer une zone d\'intérêt';
    majZones();
    majVisionneuse();
  });
}

function apercuZone(a, b) {
  rendrePaire();
  const toile = $('#toile-reference');
  const ctx = toile.getContext('2d');
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = Math.max(2, toile.width / 400);
  ctx.strokeRect(
    Math.min(a.x, b.x) * toile.width, Math.min(a.y, b.y) * toile.height,
    Math.abs(b.x - a.x) * toile.width, Math.abs(b.y - a.y) * toile.height,
  );
  ctx.restore();
}

/* ============================================================== synoptique */

/** Police des toiles : celle de la page, pour que schémas et écran s'accordent. */
const policeToile = () => getComputedStyle(document.body).fontFamily;

/** Rayon d'un pictogramme de matériel, en pixels de toile. */
const RAYON_NOEUD = 18;

/** Synoptique du site, créé à la demande. */
function synoptiqueCourant() {
  if (!etat.synoptique) etat.synoptique = { ...nouveauSynoptique(), image: null, etalon: null };
  return etat.synoptique;
}

/** Échelle du plan de câblage — 0 tant qu'il n'est pas calibré. */
function echelleReseau() {
  const r = etat.synoptique;
  return r?.etalon ? echelleDuPlan(r.etalon.a, r.etalon.b, r.etalon.metres) : 0;
}

/** Récapitulatif courant, réserve prise au formulaire. */
function recapReseau() {
  const r = synoptiqueCourant();
  return recapitulatif(r, echelleReseau(), { reserve: nb($('#reseau-reserve'), 10) / 100 });
}

async function definirPlanReseau(dataUrl, nom, bascule = true) {
  const img = await chargerImage(dataUrl);
  const r = synoptiqueCourant();
  r.image = { nom, dataUrl, img, largeur: img.naturalWidth, hauteur: img.naturalHeight };
  $('#vignette-reseau').src = dataUrl;
  $('#vignette-reseau').hidden = false;
  $('#depot-reseau .depot-texte').hidden = true;
  $('#info-reseau').textContent = `${nom} — ${img.naturalWidth} × ${img.naturalHeight} px`;
  if (!r.etalon) etat.reseauOutil = 'calage';
  if (bascule) basculerMode('reseau');
  majReseau();
}

/** Consigne du moment : dire quoi faire vaut mieux que laisser chercher. */
function consigneReseau() {
  const r = synoptiqueCourant();
  if (!r.image) return 'Chargez une vue aérienne du site.';
  if (!r.etalon) {
    return etat.etalonReseauPartiel
      ? 'Cliquez le second point de la distance connue.'
      : 'Calibrer : saisissez une distance connue, puis cliquez ses deux extrémités.';
  }
  if (etat.reseauOutil === 'poser') return 'Cliquez pour poser le matériel choisi.';
  if (etat.reseauOutil === 'relier') {
    return etat.reseauDepuis
      ? 'Cliquez le matériel d\'arrivée — ou un point de passage pour contourner.'
      : 'Cliquez le matériel de départ.';
  }
  if (etat.reseauOutil === 'mur') {
    return etat.murDebut
      ? 'Cliquez la fin du mur.'
      : 'Cliquez le début d\'un mur — sa hauteur est celle saisie ci-dessous.';
  }
  if (etat.reseauOutil === 'deplacer') return 'Faites glisser un matériel pour le replacer.';
  if (etat.reseauOutil === 'supprimer') return 'Cliquez un matériel ou une liaison à supprimer.';
  return 'Plan calibré. Posez le matériel, puis tirez les liaisons.';
}

function majReseau() {
  const r = synoptiqueCourant();
  $('#reseau-reglages').hidden = !r.image;
  $('#reseau-consigne').textContent = consigneReseau();
  $$('[data-reseau-outil]').forEach((b) => b.classList.toggle(
    'actif', b.dataset.reseauOutil === etat.reseauOutil,
  ));

  const recap = recapReseau();
  majTableauReseau(recap);
  majSelectionReseau();
  majCouverture();
  majDevis();
  const b = majEnregistrement();
  // Les alertes des deux familles — câblage et exploitation — sont rendues
  // ensemble : sur le chantier elles se traitent d'un même mouvement.
  majAlertesReseau(recap, b);
  majVisionneuse();
}

/** Tableau des liaisons, récapitulatif et alertes. */
function majTableauReseau(recap) {
  const aQuelqueChose = recap.mesures.length > 0;
  const liens = synoptiqueCourant().liens.length;
  $('#reseau-attente').hidden = aQuelqueChose || liens > 0;

  $('#reseau-tableau').innerHTML = aQuelqueChose
    ? `<table class="dori liaisons">
        <thead><tr><th>Liaison</th><th>Au plan</th><th>Descentes</th><th>Câble</th></tr></thead>
        <tbody>${recap.mesures.map((m, i) => `
          <tr class="${m.depasse ? 'depasse' : ''}">
            <td>${ech(nomNoeud(m.de, i))} → ${ech(nomNoeud(m.vers, i))}</td>
            <td>${fmt(m.auPlan)} m</td>
            <td>${fmt(m.descentes)} m</td>
            <td><b>${fmt(m.cable)} m</b>${m.depasse ? ' ⚠' : ''}</td>
          </tr>`).join('')}
        </tbody></table>`
    : '';

  const inventaire = Object.entries(recap.parType)
    .map(([t, n]) => mesure(TYPES_MATERIEL[t]?.label || t, String(n), ''))
    .join('');
  $('#reseau-mesures').innerHTML = aQuelqueChose || inventaire
    ? inventaire
      + mesure('Câble total', fmt(recap.totalCable), 'm', true)
      + (recap.plusLong ? mesure('Liaison la plus longue', fmt(recap.plusLong.cable), 'm') : '')
    : '';

  majAlertesReseau(recap, null, liens);
}

/**
 * Alertes du synoptique : ce qui empêchera l'installation de fonctionner, puis
 * ce qui la rend fragile.
 */
function majAlertesReseau(recap, b, nbLiens) {
  const liens = nbLiens ?? synoptiqueCourant().liens.length;
  const alertes = [];
  if (!recap.mesurable && synoptiqueCourant().noeuds.length) {
    alertes.push(`Plan non calibré : le matériel se pose et ${liens > 1 ? 'les' : 'la'} `
      + `${plur(liens, 'liaison')} se trace${liens > 1 ? 'nt' : ''}, mais aucune longueur ne `
      + 'peut être chiffrée tant qu\'une distance connue n\'a pas été relevée.');
  }
  for (const m of recap.depassements) {
    alertes.push(`${ech(nomNoeud(m.de))} → ${ech(nomNoeud(m.vers))} : ${fmt(m.cable)} m, `
      + `au-delà des ${LIMITE_LIEN} m admis en cuivre. Prévoir un switch intermédiaire, `
      + 'un répéteur PoE ou de la fibre.');
  }
  if (recap.orphelins.length) {
    alertes.push(`${plur(recap.orphelins.length, 'matériel')} au bout d'aucun câble : `
      + recap.orphelins.map((n, i) => ech(nomNoeud(n, i))).join(', ') + '.');
  }
  if (recap.sansEnregistreur.length) {
    alertes.push(`${plur(recap.sansEnregistreur.length, 'caméra')} ne remonte`
      + `${recap.sansEnregistreur.length > 1 ? 'nt' : ''} à aucun enregistreur : `
      + recap.sansEnregistreur.map((n, i) => ech(nomNoeud(n, i))).join(', ') + '.');
  }
  // Anomalies d'exploitation : adresses, ports, budget PoE, canaux, capacité.
  const bloquantes = [];
  for (const a of b?.anomalies || []) {
    (a.niveau === 'bloquant' ? bloquantes : alertes).push(ech(a.texte));
  }

  const ligne = (t, grave) => `<li${grave ? ' class="grave"' : ''}>${t}</li>`;
  $('#reseau-alertes').innerHTML = bloquantes.length || alertes.length
    ? `<ul class="alertes">${bloquantes.map((t) => ligne(t, true)).join('')}`
      + `${alertes.map((t) => ligne(t, false)).join('')}</ul>`
    : '';
}

/* ------------------------------------------------------------ rendu */

function rendreReseau() {
  const r = synoptiqueCourant();
  if (!r.image?.img) return;
  const toile = $('#toile-reseau');
  const { l, h } = dimensionsRendu(r.image.img);
  toile.width = l;
  toile.height = h;
  const ctx = toile.getContext('2d');
  ctx.drawImage(r.image.img, 0, 0, l, h);
  // Du fond vers la surface : couverture, murs, câblage, matériel. Les champs
  // de vision doivent passer sous les murs qui les découpent.
  dessinerCouverture(ctx, l, bilanCouverture());
  dessinerMurs(ctx, l, r, echelleReseau());
  dessinerReseau(ctx, l, r, recapReseau());

  const arbre = $('#toile-arbre');
  arbre.width = l;
  arbre.height = Math.round(l * 0.62);
  dessinerArbre(arbre.getContext('2d'), arbre.width, arbre.height, r);
}

function dessinerReseau(ctx, l, r, recap) {
  const trait = Math.max(1.5, l / 500);
  const pt = (p) => ({ x: p.x * l, y: p.y * l });
  ctx.save();
  ctx.lineWidth = trait * 1.6;
  ctx.font = `600 ${Math.max(10, Math.round(l / 70))}px ${policeToile()}`;
  ctx.textBaseline = 'middle';

  if (r.etalon) {
    const a = pt(r.etalon.a);
    const b = pt(r.etalon.b);
    ctx.strokeStyle = '#ffd400';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    cartouche(ctx, `${fmt(r.etalon.metres)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2, '#ffd400');
  }
  if (etat.etalonReseauPartiel) {
    const a = pt(etat.etalonReseauPartiel);
    ctx.fillStyle = '#ffd400';
    ctx.beginPath();
    ctx.arc(a.x, a.y, trait * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /*
   * Les liaisons d'abord : le matériel doit rester lisible par-dessus.
   *
   * On les dessine depuis le synoptique, pas depuis les mesures : sans plan
   * calibré il n'y a pas de mesure, et le câblage tracé disparaîtrait de
   * l'écran alors qu'il existe bel et bien. La longueur, elle, n'est écrite
   * que lorsqu'elle est connue.
   */
  const mesureDe = new Map(recap.mesures.map((m) => [m.lien, m]));
  for (const lien of r.liens) {
    const brut = trajet(r, lien);
    if (!brut) continue;
    const points = brut.map(pt);
    const m = mesureDe.get(lien);
    ctx.strokeStyle = m?.depasse ? '#e8394f' : '#6f5bd6';
    ctx.setLineDash(m?.depasse ? [8, 5] : []);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (m) {
      const milieu = pointMedian(points);
      cartouche(ctx, `${fmt(m.cable)} m`, milieu.x, milieu.y, m.depasse ? '#e8394f' : '#fff');
    }
  }

  // Liaison en cours de tracé.
  if (etat.reseauDepuis) {
    const depart = noeudPar(r, etat.reseauDepuis);
    if (depart) {
      const points = [pt(depart), ...etat.reseauPoints.map(pt)];
      ctx.strokeStyle = '#6f5bd6';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  r.noeuds.forEach((n, i) => {
    const p = pt(n);
    const t = TYPES_MATERIEL[n.type] || TYPES_MATERIEL.camera;
    const rayon = Math.max(RAYON_NOEUD, l / 45);
    ctx.fillStyle = t.couleur;
    ctx.strokeStyle = n.id === etat.reseauChoisi ? '#fff' : '#101317';
    ctx.lineWidth = n.id === etat.reseauChoisi ? trait * 2.5 : trait * 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rayon, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(t.court, p.x, p.y);
    ctx.textAlign = 'left';
    cartouche(ctx, nomNoeud(n, i), p.x + rayon + 4, p.y, '#fff');
  });
  ctx.restore();
}

/**
 * Point situé à mi-longueur d'une polyligne.
 *
 * Prendre le point du milieu de la liste revenait, pour une liaison droite, à
 * prendre l'extrémité : l'étiquette de longueur se retrouvait cachée sous le
 * pictogramme du matériel.
 */
function pointMedian(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  let parcouru = 0;
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (parcouru + d >= total / 2) {
      const t = d > 0 ? (total / 2 - parcouru) / d : 0;
      return {
        x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
      };
    }
    parcouru += d;
  }
  return points[points.length - 1];
}

/**
 * Étiquette lisible sur n'importe quel fond : un cartouche sombre, du texte
 * clair.
 *
 * La hauteur du cartouche se prend sur le texte lui-même, mesuré par le
 * navigateur. Elle se déduisait auparavant de `ctx.font`, ce qui marchait tant
 * que la police n'avait pas de graisse : avec « 600 16px … », `parseInt` lit
 * 600 et non 16, et chaque étiquette traînait derrière elle un rectangle noir
 * de six cents pixels de haut.
 */
function cartouche(ctx, texte, x, y, couleur) {
  const m = ctx.measureText(texte);
  const large = m.width;
  const haut = (m.actualBoundingBoxAscent || 8) + (m.actualBoundingBoxDescent || 3) + 6;
  ctx.save();
  ctx.fillStyle = 'rgba(16, 19, 23, .78)';
  ctx.fillRect(x - 3, y - haut / 2, large + 6, haut);
  ctx.fillStyle = couleur;
  ctx.fillText(texte, x, y);
  ctx.restore();
}

/** Arborescence : qui dépend de qui, indépendamment du chemin des câbles. */
function dessinerArbre(ctx, l, h, r) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, l, h);
  const d = dispositionLogique(r);
  const marge = Math.max(30, l / 14);
  const police = Math.max(9, Math.round(l / 78));
  ctx.font = `600 ${police}px ${policeToile()}`;
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#101317';
  ctx.textAlign = 'left';
  ctx.fillText('Synoptique — arborescence', 10, 14);

  if (!d.noeuds.length) {
    ctx.fillStyle = '#6b7482';
    ctx.textAlign = 'center';
    ctx.fillText('Aucun matériel posé', l / 2, h / 2);
    return;
  }

  const pt = (n) => ({ x: marge + n.x * (l - 2 * marge), y: marge + n.y * (h - 2 * marge) });
  const place = new Map(d.noeuds.map((n) => [n.id, pt(n)]));

  ctx.strokeStyle = '#6f5bd6';
  ctx.lineWidth = 1.4;
  for (const lien of d.liens) {
    const a = place.get(lien.de);
    const b = place.get(lien.vers);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  d.noeuds.forEach((n, i) => {
    const p = place.get(n.id);
    const t = TYPES_MATERIEL[n.type] || TYPES_MATERIEL.camera;
    const rayon = Math.max(12, l / 62);
    ctx.fillStyle = t.couleur;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rayon, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(t.court, p.x, p.y);
    ctx.fillStyle = '#101317';
    ctx.fillText(nomNoeud(n, i), p.x, p.y + rayon + police);
  });
  ctx.textAlign = 'left';
}

/* --------------------------------------------------------- interactions */

/** Matériel sous le pointeur, ou null. */
function noeudSous(p, l) {
  const r = synoptiqueCourant();
  const rayon = Math.max(RAYON_NOEUD, l / 45) / l;
  let trouve = null;
  let meilleure = rayon;
  for (const n of r.noeuds) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= meilleure) { meilleure = d; trouve = n; }
  }
  return trouve;
}

/** Liaison passant sous le pointeur, ou null. */
function lienSous(p, l) {
  const r = synoptiqueCourant();
  const seuil = Math.max(6, l / 120) / l;
  for (const lien of r.liens) {
    const points = trajet(r, lien);
    if (!points) continue;
    for (let i = 1; i < points.length; i += 1) {
      if (distancePointSegment(p, points[i - 1], points[i]) <= seuil) return lien;
    }
  }
  return null;
}

/** Mur passant sous le pointeur, ou null. */
function murSous(p, l) {
  const r = synoptiqueCourant();
  const seuil = Math.max(6, l / 120) / l;
  return (r.murs || []).find((m) => distancePointSegment(p, m.a, m.b) <= seuil) || null;
}

/** Distance d'un point à un segment, en unités normalisées. */
function distancePointSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const carre = dx * dx + dy * dy;
  if (carre < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / carre));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Supprime un matériel et, avec lui, les liaisons qui y aboutissaient. */
function supprimerNoeud(id) {
  const r = synoptiqueCourant();
  r.noeuds = r.noeuds.filter((n) => n.id !== id);
  // Laisser des liaisons pendantes donnerait un synoptique qui ne se mesure
  // plus : on les retire avec le matériel.
  r.liens = r.liens.filter((l) => l.de !== id && l.vers !== id);
  if (etat.reseauChoisi === id) etat.reseauChoisi = null;
  if (etat.reseauDepuis === id) { etat.reseauDepuis = null; etat.reseauPoints = []; }
}

function brancherReseau() {
  const toile = $('#toile-reseau');
  const position = (e) => {
    const rect = toile.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: ((e.clientY - rect.top) / rect.height) * (toile.height / toile.width),
    };
  };

  let glisse = null;

  toile.addEventListener('pointerdown', (e) => {
    const r = synoptiqueCourant();
    if (!r.image) return;
    const p = position(e);
    const l = toile.width;

    if (etat.reseauOutil === 'calage') {
      if (!etat.etalonReseauPartiel) {
        etat.etalonReseauPartiel = p;
      } else {
        const metres = nb($('#reseau-etalon'), 0);
        if (metres > 0) r.etalon = { a: etat.etalonReseauPartiel, b: p, metres };
        etat.etalonReseauPartiel = null;
        etat.reseauOutil = 'poser';
      }
      majReseau();
      return;
    }

    if (etat.reseauOutil === 'poser') {
      const type = $('#reseau-type').value;
      const rang = r.noeuds.filter((n) => n.type === type).length;
      r.noeuds.push(nouveauNoeud(type, p.x, p.y, {
        nom: `${TYPES_MATERIEL[type].court} ${rang + 1}`,
      }));
      majReseau();
      return;
    }

    if (etat.reseauOutil === 'relier') {
      const n = noeudSous(p, l);
      if (!etat.reseauDepuis) {
        if (n) { etat.reseauDepuis = n.id; etat.reseauPoints = []; }
      } else if (n && n.id !== etat.reseauDepuis) {
        r.liens.push(nouveauLien(etat.reseauDepuis, n.id, etat.reseauPoints));
        etat.reseauDepuis = null;
        etat.reseauPoints = [];
      } else if (!n) {
        // Un clic dans le vide pose un point de passage : c'est ainsi qu'on
        // fait contourner un bâtiment au câble au lieu de le faire voler.
        etat.reseauPoints.push(p);
      }
      majReseau();
      return;
    }

    if (etat.reseauOutil === 'mur') {
      if (!etat.murDebut) etat.murDebut = p;
      else {
        r.murs.push(nouveauMur(etat.murDebut, p, nb($('#mur-hauteur'), 2.5)));
        etat.murDebut = null;
      }
      majReseau();
      return;
    }

    if (etat.reseauOutil === 'supprimer') {
      const n = noeudSous(p, l);
      if (n) supprimerNoeud(n.id);
      else {
        const lien = lienSous(p, l);
        const mur = lien ? null : murSous(p, l);
        if (lien) r.liens = r.liens.filter((x) => x !== lien);
        else if (mur) r.murs = r.murs.filter((x) => x !== mur);
      }
      majReseau();
      return;
    }

    const n = noeudSous(p, l);
    etat.reseauChoisi = n ? n.id : null;
    etat.murChoisi = n ? null : (murSous(p, l)?.id || null);
    if (n && etat.reseauOutil === 'deplacer') {
      glisse = { id: n.id, dx: n.x - p.x, dy: n.y - p.y };
      toile.setPointerCapture(e.pointerId);
    }
    majReseau();
  });

  toile.addEventListener('pointermove', (e) => {
    const r = synoptiqueCourant();
    if (!r.image) return;
    if (glisse) {
      const p = position(e);
      const n = noeudPar(r, glisse.id);
      if (n) { n.x = p.x + glisse.dx; n.y = p.y + glisse.dy; }
      rendreReseau();
      return;
    }
    toile.style.cursor = curseurReseau(position(e), toile.width);
  });

  const relacher = () => {
    if (!glisse) return;
    glisse = null;
    majReseau();
  };
  toile.addEventListener('pointerup', relacher);
  toile.addEventListener('pointercancel', relacher);
}

/** Le curseur dit ce que fera le clic. */
function curseurReseau(p, l) {
  if (etat.reseauOutil === 'calage' || etat.reseauOutil === 'poser'
    || etat.reseauOutil === 'mur') return 'crosshair';
  const n = noeudSous(p, l);
  if (etat.reseauOutil === 'supprimer') {
    return n || lienSous(p, l) || murSous(p, l) ? 'pointer' : 'default';
  }
  if (etat.reseauOutil === 'relier') return n ? 'pointer' : 'crosshair';
  if (etat.reseauOutil === 'deplacer') return n ? 'grab' : 'default';
  return n ? 'pointer' : 'default';
}

/** Fiche du matériel sélectionné : nom, hauteur, référence. */
function majSelectionReseau() {
  const boite = $('#reseau-selection');

  /*
   * La fiche n'est reconstruite que lorsque la sélection change.
   *
   * La reconstruire à chaque rafraîchissement paraissait sans conséquence.
   * Elle en avait une, vicieuse : en passant d'un champ au suivant, le
   * navigateur envoie le `change` du champ quitté, ce qui rafraîchissait tout
   * et **remplaçait le champ qu'on venait d'atteindre**. La saisie suivante
   * partait alors dans un élément déjà détaché et se perdait — un champ sur
   * deux, sans le moindre message.
   *
   * Les valeurs affichées sont de toute façon celles que l'utilisateur vient
   * de saisir : il n'y a rien à redessiner tant qu'il reste sur la même fiche.
   */
  const cle = `${etat.reseauChoisi || ''}|${etat.murChoisi || ''}|${echelleReseau().toFixed(3)}`;
  if (cle === etat.ficheRendue) return;
  etat.ficheRendue = cle;
  const mur = (synoptiqueCourant().murs || []).find((m) => m.id === etat.murChoisi);
  if (mur && !etat.reseauChoisi) {
    boite.innerHTML = `<div class="grille2">
      <label>Hauteur du mur (m)
        <input type="number" data-mur="hauteur" value="${mur.hauteur}" min="0.1" max="30" step="0.1">
      </label>
      <label>Longueur
        <input type="text" value="${fmt(longueurMur(mur, echelleReseau()))} m" disabled>
      </label>
    </div>`;
    $('[data-mur="hauteur"]').addEventListener('change', (e) => {
      mur.hauteur = nb(e.target, 2.5);
      majReseau();
    });
    return;
  }

  const n = noeudPar(synoptiqueCourant(), etat.reseauChoisi);
  if (!n) { boite.innerHTML = ''; return; }

  const champs = champsDeType(n.type)
    .map((c) => `<label>${ech(LIBELLES_MATERIEL[c] || c)}
      <input type="number" data-materiel="${c}" value="${n[c] || ''}" min="0" step="0.1">
    </label>`).join('');

  boite.innerHTML = `<div class="grille2">
      <label>Repère<input type="text" data-materiel-texte="nom" value="${ech(n.nom)}"></label>
      <label>Hauteur de pose (m)
        <input type="number" data-materiel="hauteur" value="${n.hauteur}" min="0" max="40" step="0.1">
      </label>
      <label>Référence
        <input type="text" data-materiel-texte="reference" value="${ech(n.reference)}">
      </label>
      <label>Adresse IP
        <input type="text" data-materiel-texte="ip" value="${ech(n.ip)}" placeholder="192.168.1.4">
      </label>
      ${champs}
    </div>
    ${n.type === 'camera' && n.conso > 0 ? `<p class="note">${ech(etiquettePoe(n.conso))}</p>` : ''}`;

  $$('#reseau-selection [data-materiel]').forEach((el) => el.addEventListener('change', () => {
    n[el.dataset.materiel] = nb(el, 0);
    majReseau();
  }));
  $$('#reseau-selection [data-materiel-texte]').forEach((el) => el.addEventListener('change', () => {
    n[el.dataset.materielTexte] = el.value.trim();
    majReseau();
  }));
}

/** Classe PoE exigée par une consommation, dite en clair. */
function etiquettePoe(watts) {
  const c = classePour(watts);
  return c
    ? `${watts} W : ${c.label} suffit (${c.appareil} W utiles au bout du câble).`
    : `${watts} W : au-delà du PoE++ type 4. Alimentation séparée à prévoir.`;
}

/** Réglages d'enregistrement saisis au formulaire. */
function reglagesEnregistrement() {
  const nvr = (etat.synoptique?.noeuds || []).filter((n) => n.type === 'nvr');
  return {
    jours: parseInt($('#nvr-jours').value, 10) || 30,
    heuresParJour: nb($('#nvr-heures'), 24),
    marge: nb($('#nvr-marge'), 20) / 100,
    // Ce que porte réellement l'enregistreur : c'est à cette capacité que la
    // durée demandée sera confrontée.
    capaciteInstallee: nvr.reduce((s, n) => s + (n.capacite > 0 ? n.capacite : 0), 0),
  };
}

/** Bilan d'enregistrement et d'alimentation, affiché sous le synoptique. */
function majEnregistrement() {
  const b = bilan(synoptiqueCourant(), reglagesEnregistrement());
  const aDesCameras = b.cameras > 0;

  $('#nvr-mesures').innerHTML = aDesCameras
    ? mesure('Débit total', fmt(b.debitTotal, 1), 'Mbit/s')
      + mesure('Conservation', `${b.jours}`, `jour${b.jours > 1 ? 's' : ''}`)
      + mesure('Capacité nécessaire', frGroupe(b.capaciteGo), 'Go', true)
      + (b.disque ? mesure('Disques', b.disque.nombre > 1
        ? `${b.disque.nombre} × ${fmt(b.disque.unitaire, 0)} To`
        : `${fmt(b.disque.unitaire, 0)} To`, '', true) : '')
      + b.poe.map((p) => mesure(
        `PoE — ${nomNoeud(p.noeud)}`,
        p.budget ? `${fmt(p.conso, 1)} / ${fmt(p.budget, 0)}` : fmt(p.conso, 1),
        'W',
      )).join('')
    : '';

  $('#nvr-conseil').textContent = aDesCameras && b.capaciteGo > 0
    ? `Pour ${plur(b.cameras, 'caméra')} totalisant ${fmt(b.debitTotal, 1)} Mbit/s, `
      + `enregistrée${b.cameras > 1 ? 's' : ''} ${b.heuresParJour} h/24 pendant ${b.jours} jours, `
      + `la capacité recommandée est de ${fmt(b.capaciteGo / 1000, 1)} To `
      + `(marge de ${Math.round(b.marge * 100)} % comprise).`
    : '';

  return b;
}

/** Estime les débits manquants depuis la définition de chaque caméra du dossier. */
function estimerDebits() {
  const r = synoptiqueCourant();
  const codec = $('#nvr-codec').value;
  const ips = nb($('#nvr-ips'), 25);
  let faits = 0;
  for (const n of r.noeuds.filter((x) => x.type === 'camera' && !(x.debit > 0))) {
    // On cherche la caméra du dossier portant le même repère : c'est elle qui
    // connaît sa définition. À défaut, le Full HD sert de base.
    const cam = etat.cameras.find((c) => c.nom === n.nom);
    const resH = nb2(cam?.optique?.resH, 1920);
    const resV = nb2(cam?.optique?.resV, 1080);
    const d = debitEstime({ resH, resV, ips, codec });
    if (d > 0) { n.debit = Math.round(d * 10) / 10; faits += 1; }
  }
  majReseau();
  $('#etat-analyse').textContent = faits
    ? `${plur(faits, 'débit')} estimé${faits > 1 ? 's' : ''} — à remplacer par les valeurs `
      + 'de la fiche technique dès que vous les avez.'
    : 'Tous les débits sont déjà renseignés.';
  $('#etat-analyse').classList.remove('erreur');
}

/** Pose une caméra par entrée de la fiche, alignées, prêtes à être déplacées. */
function poserCamerasDeLaFiche() {
  const r = synoptiqueCourant();
  const dejaLa = new Set(r.noeuds.filter((n) => n.type === 'camera').map((n) => n.nom));
  let posees = 0;
  etat.cameras.forEach((cam, i) => {
    if (dejaLa.has(cam.nom)) return;
    r.noeuds.push(nouveauNoeud('camera', 0.1 + (i % 6) * 0.13, 0.1 + Math.floor(i / 6) * 0.12, {
      nom: cam.nom,
      hauteur: nb2(cam.optique?.hauteur, 3.5),
    }));
    posees += 1;
  });
  etat.reseauOutil = 'deplacer';
  majReseau();
  $('#etat-analyse').textContent = posees
    ? `${plur(posees, 'caméra')} posée${posees > 1 ? 's' : ''} — faites-les glisser à leur place.`
    : 'Toutes les caméras de la fiche figurent déjà au synoptique.';
  $('#etat-analyse').classList.remove('erreur');
}

/** Valeur numérique d'une donnée de fiche, repli sur un défaut. */
const nb2 = (v, defaut) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : defaut);

/** Exporte le plan câblé et l'arborescence, en pleine définition. */
function exporterReseau() {
  for (const [id, suffixe] of [['#toile-reseau', 'plan'], ['#toile-arbre', 'arborescence']]) {
    const a = document.createElement('a');
    a.href = $(id).toDataURL('image/png');
    a.download = `synoptique-${suffixe}.png`;
    a.click();
  }
}

/** Dépôt du plan de câblage — même mécanique que le plan du bloc B. */
function brancherDepotReseau() {
  const zone = $('#depot-reseau');
  const entree = $('#fichier-reseau');
  const traiter = async (fichier) => {
    if (estPdf(fichier)) {
      await ouvrirSelecteurPdf(fichier, 'reseau', (dataUrl, source) => {
        definirPlanReseau(dataUrl, `${source.fichier} — page ${source.page}`);
      });
      return;
    }
    if (!fichier || !fichier.type.startsWith('image/')) {
      $('#etat-analyse').textContent = 'Format non reconnu : déposer une image ou un PDF.';
      $('#etat-analyse').classList.add('erreur');
      return;
    }
    await definirPlanReseau(await lireFichier(fichier), fichier.name);
  };
  zone.addEventListener('click', () => { etat.dernierDepot = 'reseau'; entree.click(); });
  zone.addEventListener('focus', () => { etat.dernierDepot = 'reseau'; });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entree.click(); }
  });
  entree.addEventListener('change', () => {
    if (entree.files[0]) traiter(entree.files[0]);
    entree.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('survol'); etat.dernierDepot = 'reseau';
  }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('survol')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) traiter(e.dataTransfer.files[0]);
  });
}

/** Commandes du bloc synoptique. */
function brancherCommandesReseau() {
  $('#reseau-type').innerHTML = Object.entries(TYPES_MATERIEL)
    .map(([cle, t]) => `<option value="${cle}">${t.label}</option>`).join('');

  /*
   * Cliquer une étape l'active, toujours.
   *
   * Un basculement paraissait plus malin — recliquer pour arrêter — mais avec
   * des boutons numérotés « 1 · 2 · 3 » on reclique l'étape en cours sans y
   * penser, et l'outil se désarmait en silence : les clics suivants ne
   * faisaient plus rien. Pour arrêter, il y a Échap.
   */
  $$('[data-reseau-outil]').forEach((b) => b.addEventListener('click', () => {
    etat.reseauOutil = b.dataset.reseauOutil;
    etat.reseauDepuis = null;
    etat.reseauPoints = [];
    etat.etalonReseauPartiel = null;
    etat.murDebut = null;
    majReseau();
  }));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || etat.mode !== 'reseau') return;
    if (!etat.reseauOutil && !etat.reseauDepuis && !etat.murDebut) return;
    etat.reseauOutil = null;
    etat.reseauDepuis = null;
    etat.murDebut = null;
    etat.reseauPoints = [];
    etat.etalonReseauPartiel = null;
    majReseau();
  });

  $('#reseau-etalon').addEventListener('change', () => {
    const r = synoptiqueCourant();
    const metres = nb($('#reseau-etalon'), 0);
    // Corriger la distance saisie après coup doit corriger toutes les
    // longueurs, sans obliger à recliquer les deux points.
    if (r.etalon && metres > 0) { r.etalon.metres = metres; majReseau(); }
  });
  $('#reseau-reserve').addEventListener('change', majReseau);

  $('#reseau-depuis-plan').addEventListener('click', () => {
    const plan = cameraCourante()?.plan;
    if (!plan?.image) {
      $('#etat-analyse').textContent = 'Aucun plan chargé dans le bloc B.';
      $('#etat-analyse').classList.add('erreur');
      return;
    }
    const r = synoptiqueCourant();
    definirPlanReseau(plan.image.dataUrl, plan.image.nom).then(() => {
      // L'étalonnage du bloc B vaut pour la même image : le reprendre évite de
      // recliquer une distance déjà relevée.
      if (plan.etalon && !r.etalon) { r.etalon = { ...plan.etalon }; etat.reseauOutil = 'poser'; }
      majReseau();
    });
  });

  $('#nvr-codec').innerHTML = CODECS
    .map((c) => `<option value="${c.cle}"${c.cle === 'h265' ? ' selected' : ''}>${c.label}</option>`)
    .join('');
  ['#nvr-jours', '#nvr-heures', '#nvr-marge', '#nvr-codec', '#nvr-ips']
    .forEach((id) => $(id).addEventListener('change', majReseau));
  $('#nvr-estimer').addEventListener('click', estimerDebits);
  ['#devis-marge', '#devis-remise', '#devis-heures', '#devis-taux', '#devis-tva']
    .forEach((id) => $(id).addEventListener('change', majReseau));
  $('#devis-prix-releves').addEventListener('click', chargerPrixReleves);
  $('#mur-hauteur').addEventListener('change', majReseau);
  $('#opt-couverture').addEventListener('change', majReseau);
  $('#nvr-marge').value = Math.round(MARGE_DEFAUT * 100);

  $('#reseau-cameras').addEventListener('click', poserCamerasDeLaFiche);
  $('#reseau-exporter').addEventListener('click', exporterReseau);
  $('#reseau-effacer').addEventListener('click', () => {
    if (!window.confirm('Effacer tout le matériel et toutes les liaisons du synoptique ?')) return;
    const r = synoptiqueCourant();
    r.noeuds = [];
    r.liens = [];
    r.murs = [];
    etat.murChoisi = null;
    etat.murDebut = null;
    etat.reseauChoisi = null;
    etat.reseauDepuis = null;
    etat.reseauPoints = [];
    majReseau();
  });

  brancherReseau();
  brancherDepotReseau();
}

/* ------------------------------------------------------- murs et couverture */

/**
 * Couleurs de couverture, selon la légende du cahier des charges.
 *
 * Le dégradé suit la densité de pixels : plus on s'éloigne, moins l'image est
 * exploitable. Le gris hachuré des angles morts n'est pas dessiné — c'est
 * l'absence de couleur qui les montre, et un trou se voit mieux qu'un motif.
 */
const COULEURS_DORI = {
  identification: 'rgba(200, 16, 46, .38)',
  reconnaissance: 'rgba(232, 126, 24, .34)',
  observation: 'rgba(217, 155, 31, .30)',
  detection: 'rgba(46, 174, 106, .26)',
};

/** Portée utile d'une caméra du synoptique, sa saisie l'emportant sur le calcul. */
function porteeNoeud(n) {
  if (n.portee > 0) return n.portee;
  // À défaut, la portée de détection du matériel configuré : mieux qu'un cône
  // arbitraire, et cohérent avec le reste du dossier.
  const cam = etat.cameras.find((c) => c.nom === n.nom);
  const c = cam ? configDe(cam.optique) : configCamera();
  return porteeUtile(c.resolution.h, c.angles.horizontal, SEUILS_DORI.detection.ppm);
}

/** Angle de champ d'une caméra du synoptique, sa saisie l'emportant. */
function ouvertureNoeud(n) {
  if (n.ouverture > 0) return n.ouverture;
  const cam = etat.cameras.find((c) => c.nom === n.nom);
  const c = cam ? configDe(cam.optique) : configCamera();
  return c.angles.horizontal;
}

/** Caméras du synoptique orientées, prêtes à être balayées. */
function camerasOrientees() {
  const r = synoptiqueCourant();
  return r.noeuds
    .filter((n) => n.type === 'camera')
    .map((n) => ({
      noeud: n,
      camera: {
        x: n.x,
        y: n.y,
        hauteur: n.hauteur > 0 ? n.hauteur : 3.5,
        azimut: n.azimut,
        ouverture: ouvertureNoeud(n),
      },
      portee: porteeNoeud(n),
    }))
    .filter((c) => c.camera.ouverture > 0 && c.portee > 0);
}

/** Bilan de couverture : part visible, angles morts, caméras sans orientation. */
function bilanCouverture() {
  const r = synoptiqueCourant();
  const echelle = echelleReseau();
  if (!echelle) return null;

  const cameras = camerasOrientees();
  const parCamera = cameras.map((c) => {
    const rayons = balayage(c.camera, r.murs, echelle, c.portee, { pas: 1.5 });
    return {
      ...c,
      rayons,
      part: partVisible(rayons, c.portee),
      trous: anglesMorts(rayons, c.portee, 2),
    };
  });

  const sansOrientation = r.noeuds.filter(
    (n) => n.type === 'camera' && !(ouvertureNoeud(n) > 0 && porteeNoeud(n) > 0),
  );

  return {
    parCamera,
    sansOrientation,
    murs: r.murs.length,
    longueurMurs: r.murs.reduce((s, m) => s + longueurMur(m, echelle), 0),
  };
}

/** Panneau « couverture et angles morts ». */
function majCouverture() {
  const b = bilanCouverture();
  const boite = $('#couverture-mesures');
  if (!b || (!b.parCamera.length && !b.murs)) {
    boite.innerHTML = '';
    $('#couverture-legende').innerHTML = '';
    return b;
  }

  const genes = b.parCamera.filter((c) => c.part < 0.995);
  boite.innerHTML = mesure('Murs tracés', String(b.murs), '')
    + mesure('Longueur de murs', fmt(b.longueurMurs), 'm')
    + (b.parCamera.length ? mesure('Caméras orientées', String(b.parCamera.length), '') : '')
    + genes.map((c) => mesure(
      `Champ dégagé — ${nomNoeud(c.noeud)}`,
      fmt(c.part * 100, 0), '%',
      c.part < 0.8,
    )).join('');

  $('#couverture-legende').innerHTML = b.parCamera.length
    ? `<ul class="legende">
        <li><span style="background:${COULEURS_DORI.identification}"></span>Identification</li>
        <li><span style="background:${COULEURS_DORI.reconnaissance}"></span>Reconnaissance</li>
        <li><span style="background:${COULEURS_DORI.observation}"></span>Observation</li>
        <li><span style="background:${COULEURS_DORI.detection}"></span>Détection</li>
        <li><span class="vide"></span>Angle mort</li>
      </ul>`
    : '';

  return b;
}

/** Dessine les champs de vision, découpés par les murs. */
function dessinerCouverture(ctx, l, bilanC) {
  if (!bilanC || !$('#opt-couverture').checked) return;
  const echelle = echelleReseau();
  if (!echelle) return;

  ctx.save();
  for (const c of bilanC.parCamera) {
    const sommet = { x: c.camera.x * l, y: c.camera.y * l };
    const seuils = tableauPorteesNoeud(c.noeud);

    /*
     * Un quadrilatère par rayon et par bande : c'est ce qui permet de
     * représenter un angle mort **au milieu** du cône. Un polygone unique ne
     * saurait montrer qu'un cône tronqué, alors qu'un muret cache une bande et
     * laisse voir au-delà.
     */
    for (let i = 1; i < c.rayons.length; i += 1) {
      const a = c.rayons[i - 1];
      const b = c.rayons[i];
      for (const [d0, d1] of a.intervalles) {
        // La bande du rayon voisin qui recouvre celle-ci, pour fermer le quad.
        const jumelle = b.intervalles.find(([e0, e1]) => e1 > d0 && e0 < d1);
        if (!jumelle) continue;
        const debut = Math.max(d0, jumelle[0]);
        const fin = Math.min(d1, jumelle[1]);
        if (fin <= debut) continue;
        bandesDori(ctx, sommet, a.direction, b.direction, debut, fin, seuils, echelle, l);
      }
    }
  }
  ctx.restore();
}

/** Portées d'exploitation d'une caméra du synoptique, du plus exigeant au moins. */
function tableauPorteesNoeud(n) {
  const cam = etat.cameras.find((c) => c.nom === n.nom);
  const c = cam ? configDe(cam.optique) : configCamera();
  return ['identification', 'reconnaissance', 'observation', 'detection'].map((cle) => ({
    cle,
    distance: porteeUtile(c.resolution.h, c.angles.horizontal, SEUILS_DORI[cle].ppm),
  }));
}

/** Découpe un morceau de secteur selon les niveaux d'exploitation. */
function bandesDori(ctx, sommet, dirA, dirB, debut, fin, seuils, echelle, l) {
  const versPlan = (m) => m / echelle * l;
  let curseur = debut;
  for (const s of seuils) {
    if (s.distance <= curseur) continue;
    const borne = Math.min(s.distance, fin);
    if (borne > curseur) {
      quadrilatere(ctx, sommet, dirA, dirB, versPlan(curseur), versPlan(borne),
        COULEURS_DORI[s.cle]);
      curseur = borne;
    }
    if (curseur >= fin) return;
  }
  // Au-delà de la détection, l'image ne vaut plus rien : on ne colorie pas.
}

function quadrilatere(ctx, sommet, dirA, dirB, r0, r1, couleur) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(sommet.x + dirA.x * r0, sommet.y + dirA.y * r0);
  ctx.lineTo(sommet.x + dirA.x * r1, sommet.y + dirA.y * r1);
  ctx.lineTo(sommet.x + dirB.x * r1, sommet.y + dirB.y * r1);
  ctx.lineTo(sommet.x + dirB.x * r0, sommet.y + dirB.y * r0);
  ctx.closePath();
  ctx.fill();
}

/** Dessine les murs, avec leur longueur et leur hauteur. */
function dessinerMurs(ctx, l, r, echelle) {
  const trait = Math.max(2, l / 320);
  ctx.save();
  ctx.lineWidth = trait;
  ctx.lineCap = 'round';
  ctx.font = `600 ${Math.max(10, Math.round(l / 78))}px ${policeToile()}`;
  ctx.textBaseline = 'middle';

  for (const mur of r.murs || []) {
    const a = { x: mur.a.x * l, y: mur.a.y * l };
    const b = { x: mur.b.x * l, y: mur.b.y * l };
    ctx.strokeStyle = mur.id === etat.murChoisi ? '#fff' : '#101317';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (echelle > 0) {
      cartouche(ctx, `${fmt(longueurMur(mur, echelle))} m · ${fmt(mur.hauteur)} m de haut`,
        (a.x + b.x) / 2 + trait * 2, (a.y + b.y) / 2, '#fff');
    }
  }

  if (etat.murDebut) {
    const p = { x: etat.murDebut.x * l, y: etat.murDebut.y * l };
    ctx.fillStyle = '#101317';
    ctx.beginPath();
    ctx.arc(p.x, p.y, trait * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* -------------------------------------------------------------- devis */

/**
 * Prix relevés chez des revendeurs français le 20/09/2026.
 *
 * Ce sont des **prix publics affichés un jour donné**, pas un tarif négocié.
 * Ils portent leur date et leur source, l'outil les marque « ~ », et le devis
 * rappelle de les confirmer avant engagement. Un tarif bouge ; celui-ci aura
 * vieilli avant d'avoir servi deux fois.
 */
const PRIX_RELEVES = [
  ['DS-2CD2T86G2', 214.57, 'Getic.fr'],
  ['DS-3E0310HP-E', 86.62, 'Getic.fr'],
];

/** Date du relevé de prix ci-dessus. */
const DATE_RELEVE = '20/09/2026';

/** Réglages du devis, saisis au formulaire. */
function reglagesDevis() {
  return {
    marge: nb($('#devis-marge'), 25) / 100,
    remise: nb($('#devis-remise'), 0) / 100,
    heures: nb($('#devis-heures'), 0),
    tauxHoraire: nb($('#devis-taux'), 55),
    tva: nb($('#devis-tva'), 20) / 100,
  };
}

/**
 * Devis du chantier, bâti sur le matériel réellement posé au synoptique.
 *
 * Les matériels identiques sont regroupés : un devis qui liste huit fois la
 * même caméra sur huit lignes se lit mal et se discute mal.
 */
function devisCourant() {
  const r = synoptiqueCourant();
  const reglages = reglagesDevis();

  const groupes = new Map();
  for (const n of r.noeuds) {
    const cle = `${n.type}|${n.reference || ''}|${n.prixAchat || 0}|${n.prixVente || 0}`;
    if (!groupes.has(cle)) groupes.set(cle, { modele: n, quantite: 0 });
    groupes.get(cle).quantite += 1;
  }

  const lignes = [...groupes.values()].map((g) => ligne(
    {
      ...g.modele,
      // Le repère d'un exemplaire ne vaut pas pour le groupe : on désigne par
      // le type et la référence.
      nom: TYPES_MATERIEL[g.modele.type]?.label || g.modele.type,
    },
    g.quantite,
    { marge: reglages.marge, tva: reglages.tva },
  ));

  return devis(lignes, reglages);
}

/** Panneau du devis, sous le synoptique. */
function majDevis() {
  const d = devisCourant();
  const aQuelqueChose = d.lignes.length > 0 || d.mainOeuvreHt > 0;

  $('#devis-tableau').innerHTML = aQuelqueChose
    ? `<table class="dori devis">
        <thead><tr><th>Désignation</th><th>Qté</th><th>PU HT</th><th>Total HT</th><th></th></tr></thead>
        <tbody>${d.lignes.map((l) => `<tr class="${l.provenance === 'aucune' ? 'a-completer' : ''}">
          <td>${ech(l.article.reference || l.article.nom)}</td>
          <td>${l.quantite}</td>
          <td>${l.venteHt > 0 ? euros(l.venteHt) : '—'}</td>
          <td><b>${l.venteHt > 0 ? euros(l.totalHt) : '—'}</b></td>
          <td title="${ech(PROVENANCES[l.provenance].label)}">${PROVENANCES[l.provenance].marque}</td>
        </tr>`).join('')}</tbody>
      </table>`
    : '';

  $('#devis-mesures').innerHTML = aQuelqueChose
    ? mesure('Matériel HT', euros(d.materielHt), '')
      + (d.mainOeuvreHt > 0 ? mesure('Main-d\'œuvre HT', euros(d.mainOeuvreHt), '') : '')
      + (d.montantRemise > 0 ? mesure('Remise', `− ${euros(d.montantRemise)}`, '') : '')
      + mesure('Total HT', euros(d.totalHt), '', true)
      + mesure(`TVA ${fmt(d.tva * 100, 1)} %`, euros(d.montantTva), '')
      + mesure('Total TTC', euros(d.totalTtc), '', true)
    : '';

  // Ce qui empêche ce devis d'être ferme se dit ici, pas seulement au document.
  const reserves = reservesDevis(d);
  $('#devis-tableau').insertAdjacentHTML('beforeend', reserves.length
    ? `<ul class="alertes">${reserves.map((x) => `<li>${ech(x)}</li>`).join('')}</ul>`
    : '');

  return d;
}

/**
 * Applique les prix relevés au matériel dont la référence correspond.
 *
 * N'écrase jamais un prix déjà saisi : celui de l'agence vaut mieux que
 * celui d'une vitrine.
 */
function chargerPrixReleves() {
  const r = synoptiqueCourant();
  let faits = 0;
  for (const n of r.noeuds) {
    if (n.prixAchat > 0 || n.prixVente > 0) continue;
    const trouve = PRIX_RELEVES.find(([ref]) => (n.reference || '').toUpperCase().includes(ref));
    if (!trouve) continue;
    const [, prix, source] = trouve;
    n.prixAchat = prix;
    n.sourceAchat = { type: 'releve', date: DATE_RELEVE, source };
    faits += 1;
  }
  majReseau();
  $('#etat-analyse').textContent = faits
    ? `${plur(faits, 'prix', '')} relevé${faits > 1 ? 's' : ''} appliqué${faits > 1 ? 's' : ''} `
      + `(${DATE_RELEVE}) — à confirmer auprès de votre distributeur.`
    : 'Aucune référence du synoptique ne figure au relevé de prix. '
      + 'Saisissez la référence exacte sur la fiche du matériel.';
  $('#etat-analyse').classList.remove('erreur');
}

/** Section « devis » des documents. */
function sectionDevis() {
  const d = devisCourant();
  if (!d.lignes.length && !(d.mainOeuvreHt > 0)) return '';
  const reserves = reservesDevis(d);

  return `<section class="saut">
      <h2>Devis</h2>
      <table>
        <thead><tr><th>Désignation</th><th>Qté</th><th>PU HT</th><th>Total HT</th></tr></thead>
        <tbody>${d.lignes.map((l) => `<tr>
          <td>${ech(l.article.reference || l.article.nom)}</td>
          <td>${l.quantite}</td>
          <td>${l.venteHt > 0 ? euros(l.venteHt) : 'à chiffrer'}</td>
          <td>${l.venteHt > 0 ? euros(l.totalHt) : '—'}</td>
        </tr>`).join('')}
        ${d.mainOeuvreHt > 0 ? `<tr>
          <td>Pose et mise en service</td>
          <td>${fmt(nb($('#devis-heures'), 0), 1)} h</td>
          <td>${euros(nb($('#devis-taux'), 0))}</td>
          <td>${euros(d.mainOeuvreHt)}</td></tr>` : ''}
        ${d.montantRemise > 0 ? `<tr>
          <td colspan="3">Remise commerciale (${fmt(d.remise * 100, 0)} %)</td>
          <td>− ${euros(d.montantRemise)}</td></tr>` : ''}
        <tr><td colspan="3"><b>Total HT</b></td><td><b>${euros(d.totalHt)}</b></td></tr>
        <tr><td colspan="3">TVA ${fmt(d.tva * 100, 1)} %</td><td>${euros(d.montantTva)}</td></tr>
        <tr><td colspan="3"><b>Total TTC</b></td><td><b>${euros(d.totalTtc)}</b></td></tr>
      </tbody>
      </table>
      ${reserves.length ? `<ul>${reserves.map((x) => `<li>${ech(x)}</li>`).join('')}</ul>` : ''}
      <p class="note">Devis valable un mois. Prix hors taxes, TVA au taux en
        vigueur. La mise en œuvre est soumise au relevé définitif sur site.</p>
    </section>`;
}

/* ================================================== fiche : enregistrer / ouvrir */

function fiche() {
  sauverCameraCourante();
  return {
    type: TYPE_FICHE,
    version: VERSION_FICHE,
    enregistreLe: new Date().toISOString(),
    chantier: {
      client: $('#ch-client').value,
      site: $('#ch-site').value,
      technicien: $('#ch-technicien').value,
      date: $('#ch-date').value,
      affaire: $('#ch-affaire').value,
    },
    tolerances: { ...tolerancesActuelles(), zone: nb($('#tol-zone'), 95) },
    etude: etat.etude,
    catalogue: etat.catalogue,
    synoptique: etat.synoptique
      ? {
        ...etat.synoptique,
        image: etat.synoptique.image
          ? { ...etat.synoptique.image, img: undefined } : null,
      }
      : null,
    cameras: etat.cameras.map((cam) => ({
      ...cam,
      plan: cam.plan?.image
        ? { ...cam.plan, image: { ...cam.plan.image, img: undefined } } : cam.plan,
      etude3d: cam.etude3d?.image
        ? { ...cam.etude3d, image: { ...cam.etude3d.image, img: undefined } } : cam.etude3d,
    })),
  };
}

function enregistrerFiche() {
  const contenu = fiche();
  const blob = new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomDeFichier(contenu.chantier, contenu.cameras);
  a.click();
  URL.revokeObjectURL(url);
}

async function ouvrirFiche(fichier) {
  let f;
  try {
    f = migrer(JSON.parse(await fichier.text()));
  } catch (err) {
    $('#etat-analyse').textContent = err instanceof SyntaxError
      ? 'Fichier illisible : ce n\'est pas une fiche JSON valide.'
      : err.message;
    $('#etat-analyse').classList.add('erreur');
    return;
  }

  const ch = f.chantier;
  $('#ch-client').value = ch.client || '';
  $('#ch-site').value = ch.site || '';
  $('#ch-technicien').value = ch.technicien || '';
  $('#ch-date').value = ch.date || '';
  $('#ch-affaire').value = ch.affaire || '';

  const t = f.tolerances;
  if (t.angle) $('#tol-angle').value = t.angle;
  if (t.roulis) $('#tol-roulis').value = t.roulis;
  if (t.zoom) $('#tol-zoom').value = t.zoom;
  if (t.zone) $('#tol-zone').value = t.zone;

  etat.etude = f.etude;
  if (Array.isArray(f.catalogue) && f.catalogue.length) {
    etat.catalogue = f.catalogue.map(normaliserEntree);
    enregistrerCatalogue();
    majCatalogue();
  }
  etat.cameras = f.cameras;
  etat.synoptique = f.synoptique || null;
  if (etat.synoptique?.image?.dataUrl) {
    await definirPlanReseau(etat.synoptique.image.dataUrl, etat.synoptique.image.nom, false);
  }
  await chargerCamera(0);

  $('#etat-analyse').textContent = `Fiche chargée — ${plur(f.cameras.length, 'caméra')}.`;
  $('#etat-analyse').classList.remove('erreur');
}

function nouvelleFiche() {
  if (!window.confirm('Effacer le dossier en cours et repartir d\'une fiche vierge ?')) return;
  window.location.reload();
}

/* ================================================================ rapport */

/** Origine d'une vue, citée dans le procès-verbal. */
function provenance(image) {
  const src = image.source;
  if (src?.type === 'pdf') {
    return `Source : ${ech(src.fichier)}, page ${src.page}${src.recadre ? ' (recadrée)' : ''}`;
  }
  return `Source : ${ech(image.nom)}`;
}

/** Confrontation étude / pose pour une caméra donnée du dossier. */
function comparaisonEtudeDe(cam) {
  if (!etat.etude) return [];
  return confronter(
    champsPourCamera(etat.etude.analyse, cam.repereEtude),
    configDe(cam.optique),
    anglesDeChamp,
  );
}

/** Tableau de tête : où en est chaque caméra du chantier. */
function sectionSynthese(lignes) {
  const conformes = lignes.filter((l) => l.d && l.d.verdict === 'conforme').length;
  const analysees = lignes.filter((l) => l.d).length;
  return `<section>
    <h2>Synthèse du chantier</h2>
    <table class="synthese">
      <thead><tr>
        <th>Caméra</th><th>Pointage H</th><th>Pointage V</th><th>Aplomb</th>
        <th>Cadrage</th><th>Matériel</th><th>Note</th><th>Verdict</th>
      </tr></thead>
      <tbody>${lignes.map(({ cam, d, etude }) => {
    const e = d ? d.ecarts : null;
    const ecartsMateriel = etude.filter((x) => !x.conforme).length;
    return `<tr>
          <td>${ech(cam.nom || 'Caméra')}</td>
          <td>${e ? `${fmt(e.pan, 1)} °` : '—'}</td>
          <td>${e ? `${fmt(e.site, 1)} °` : '—'}</td>
          <td>${e ? `${fmt(e.roulis, 1)} °` : '—'}</td>
          <td>${e ? `${fmt(e.zoom, 1)} %` : '—'}</td>
          <td>${etude.length ? (ecartsMateriel ? plur(ecartsMateriel, 'écart') : 'Conforme') : '—'}</td>
          <td>${d && d.fiable ? d.score : '—'}</td>
          <td class="verdict-${d ? d.verdict : 'indetermine'}">${d ? LIBELLES_VERDICT[d.verdict] : 'Non analysée'}</td>
        </tr>`;
  }).join('')}</tbody>
    </table>
    <p style="font-size:9pt;margin-top:2mm">
      ${plur(analysees, 'caméra')} ${analysees > 1 ? 'analysées' : 'analysée'} sur ${lignes.length} —
      ${plur(conformes, 'conforme')} à la vue demandée.
      ${lignes.length - analysees
    ? `${plur(lignes.length - analysees, 'caméra')} ${lignes.length - analysees > 1 ? 'restent' : 'reste'} à contrôler.`
    : ''}
    </p>
  </section>`;
}

/** Bloc détaillé d'une caméra. */
function sectionCamera({ cam, d, etude }, rang, seule) {
  const c = configDe(cam.optique);
  const seuilZone = nb($('#tol-zone'), 95) / 100;
  const zones = (cam.zones || []).map((z, i) => {
    const cov = couvertureZoneDe(cam, z);
    return `<tr><td>${ech(z.nom || `Zone ${i + 1}`)}</td>
      <td>${cov === null ? '—' : `${fmt(cov * 100, 0)} %`}</td>
      <td>${cov === null ? '—' : (cov >= seuilZone ? 'Conforme' : 'Insuffisante')}</td></tr>`;
  }).join('');

  return `
    <div class="${rang > 0 ? 'saut' : ''}">
    ${seule ? '' : `<p class="camera-titre">${ech(cam.nom || `Caméra ${rang + 1}`)}</p>`}

    <section>
      <h2>Configuration optique</h2>
      <table>
        <tr><th>Capteur</th><td>${c.capteurCle === 'libre' ? `${c.capteur.largeur} × ${c.capteur.hauteur} mm` : c.capteurCle}</td>
            <th>Focale</th><td>${fmt(c.focale)} mm</td></tr>
        <tr><th>Résolution</th><td>${c.resolution.h} × ${c.resolution.v} px</td>
            <th>Champ H × V</th><td>${fmt(c.angles.horizontal)}° × ${fmt(c.angles.vertical)}°</td></tr>
        <tr><th>Distance scène</th><td>${fmt(c.distance)} m</td>
            <th>Largeur couverte</th><td>${fmt(couverture(c.angles.horizontal, c.distance))} m</td></tr>
        <tr><th>Hauteur de pose</th><td>${fmt(c.hauteur)} m</td>
            <th>Densité</th><td>${fmt(pixelsParMetre(c.resolution.h, c.angles.horizontal, c.distance), 0)} px/m</td></tr>
      </table>
    </section>

    ${etude.length ? `<section>
      <h2>Conformité à l'étude${cam.repereEtude ? ` — ${ech(cam.repereEtude)}` : ''}</h2>
      <table>
        <thead><tr><th>Caractéristique</th><th>Étude</th><th>Posé</th><th>Source</th><th>Résultat</th></tr></thead>
        <tbody>${etude.map((l) => `<tr>
          <td>${l.libelle}</td>
          <td>${ech(l.etude)}</td>
          <td>${ech(l.installe)}${l.remarque ? ` (${ech(l.remarque)})` : ''}</td>
          <td>${l.source ? `p. ${l.source.page}` : '—'}</td>
          <td>${l.conforme ? 'Conforme' : 'Écart'}</td></tr>`).join('')}</tbody>
      </table>
      ${(() => {
    const champs = champsPourCamera(etat.etude.analyse, cam.repereEtude);
    const bouts = [];
    if (champs.modele) bouts.push(`matériel prévu : ${ech(champs.modele.valeur)}`);
    if (champs.type) bouts.push(`type ${ech(champs.type.valeur.toLowerCase())}`);
    return bouts.length
      ? `<p style="font-size:9pt;margin:2mm 0 0">Étude — ${bouts.join(', ')}.</p>` : '';
  })()}
      <p style="font-size:9pt;margin-top:2mm">
        Valeurs relevées dans ${ech(etat.etude.fichier)}${etat.etude.ocr
    ? ' par lecture optique (document scanné), après vérification du technicien'
    : ''}
        ${etude.filter((l) => !l.conforme).length
    ? `— ${plur(etude.filter((l) => !l.conforme).length, 'écart')} entre le matériel annoncé et le matériel posé.`
    : '— le matériel posé correspond à l\'étude.'}
      </p>
    </section>` : ''}

    ${(() => {
    const m = mesurePlanDe(cam);
    if (!m) return '';
    const type = /^Thermique/i.test(c.capteurCle) ? 'thermique' : 'visible';
    const propositions = proposer(etat.catalogue, m.focale, { type });
    const avis = conseil(m.focale, propositions);
    const niveau = niveauDori(m.densite);
    const champs = etat.etude ? champsPourCamera(etat.etude.analyse, cam.repereEtude) : {};
    return `<section>
      <h2>Fiche d'implantation — champ à réaliser</h2>
      <table>
        <tr><th>N° caméra</th><td>${ech(cam.nom || '')}</td></tr>
        <tr><th>Type de caméra</th><td>${ech(champs.type?.valeur || (type === 'thermique' ? 'THERMIQUE' : 'VISIBLE'))}</td></tr>
        <tr><th>Objectif</th><td>${fmt(m.focale, 1)} mm — ${ech(avis.texte)}</td></tr>
        <tr><th>Référence caméra</th><td>${propositions.length
      ? ech([propositions[0].entree.reference, propositions[0].entree.voie].filter(Boolean).join(' — '))
      : (champs.modele ? ech(champs.modele.valeur) : 'à choisir')}</td></tr>
        <tr><th>Nombre pixel/m</th><td>${fmt(m.densite, 0)} px/m à ${fmt(m.portee)} m —
          ${niveau === 'insuffisant' ? 'insuffisant' : SEUILS_DORI[niveau].label}</td></tr>
        <tr><th>Hauteur d'implantation</th><td>${fmt(c.hauteur)} m</td></tr>
      </table>
      <table style="margin-top:2mm">
        <thead><tr><th>Azimut</th><th>Portée</th><th>Ouverture</th><th>Largeur couverte</th></tr></thead>
        <tbody><tr>
          <td>${fmt(m.azimut, 0)} °</td><td>${fmt(m.portee)} m</td>
          <td>${fmt(m.ouverture, 0)} °</td><td>${fmt(m.largeur)} m</td>
        </tr></tbody>
      </table>
      ${cam.plan?.image?.img
      ? `<figure style="margin:3mm 0 0"><img src="${planAnnote(cam).toDataURL('image/png')}" alt="" style="width:100%;border:1px solid #999">
           <figcaption style="font-size:8pt">Champ tracé sur ${ech(cam.plan.image.nom || 'le plan')} — échelle relevée sur site.</figcaption></figure>`
      : ''}
    </section>`;
  })()}

    <section>
      <h2>Vues comparées</h2>
      <div class="images">
        <figure><figcaption>Vue demandée par le client</figcaption>
          ${cam.images?.reference ? `<img src="${cam.images.reference.dataUrl}" alt="">
            <p style="font-size:8pt;margin:1mm 0 0">${provenance(cam.images.reference)}</p>` : '<p>Non fournie</p>'}</figure>
        <figure><figcaption>Image réglée sur la caméra</figcaption>
          ${cam.images?.reglee ? `<img src="${cam.images.reglee.dataUrl}" alt="">
            <p style="font-size:8pt;margin:1mm 0 0">${provenance(cam.images.reglee)}</p>` : '<p>Non fournie</p>'}</figure>
      </div>
    </section>

    ${d ? `<section>
      <h2>Résultat de l'analyse</h2>
      <p class="bandeau">${LIBELLES_VERDICT[d.verdict]}${d.fiable ? ` — note ${d.score} / 100` : ''}</p>
      <table>
        <thead><tr><th>Critère</th><th>Écart mesuré</th><th>Tolérance</th><th>Résultat</th></tr></thead>
        <tbody>${d.criteres.map((cr) => `<tr>
          <td>${cr.label}</td>
          <td>${cr.ecart > 0 ? '+' : ''}${fmt(cr.ecart, 2)} ${cr.unite}</td>
          <td>± ${fmt(cr.tolerance, 1)} ${cr.unite}</td>
          <td>${cr.conforme ? 'Conforme' : 'Hors tolérance'}</td></tr>`).join('')}</tbody>
      </table>
      <p style="font-size:9pt;margin-top:2mm">
        Recalage ${cam.manuel ? 'manuel' : 'automatique'} —
        corrélation ${fmt(d.qualiteRecalage.zncc, 2)},
        recouvrement ${fmt(d.qualiteRecalage.recouvrement * 100, 0)} %.
        ${d.decalageScene ? `Décalage sur la scène à ${fmt(c.distance)} m :
          ${fmt(d.decalageScene.horizontal, 2)} m horizontalement,
          ${fmt(d.decalageScene.vertical, 2)} m verticalement.` : ''}
      </p>
    </section>

    <section>
      <h2>Consignes de reprise</h2>
      <ul>${d.consignes.map((x) => `<li><strong>${x.axe} :</strong> ${x.texte}</li>`).join('')}</ul>
    </section>` : '<section><h2>Résultat</h2><p>Analyse non effectuée sur cette caméra.</p></section>'}

    ${zones ? `<section>
      <h2>Zones d'intérêt (exigence ${fmt(seuilZone * 100, 0)} % de couverture)</h2>
      <table><thead><tr><th>Zone</th><th>Couverture</th><th>Résultat</th></tr></thead>
        <tbody>${zones}</tbody></table>
    </section>` : ''}

    ${cam.commentaire?.trim() ? `<section><h2>Observations</h2>
      <p>${ech(cam.commentaire.trim()).replace(/\n/g, '<br>')}</p></section>` : ''}
    </div>`;
}

/**
 * Proposition d'implantation remise au client.
 *
 * Document commercial, distinct du procès-verbal de réception : il dit ce qui
 * est proposé et ce que le client pourra en faire, avec la photo du site à
 * l'appui. Les hypothèses y figurent en toutes lettres — une proposition qui
 * tait ses conditions de validité n'engage personne.
 */
function construireProposition() {
  sauverCameraCourante();
  const ch = {
    client: ech($('#ch-client').value) || '—',
    site: ech($('#ch-site').value) || '—',
    affaire: ech($('#ch-affaire').value) || '—',
    date: ech($('#ch-date').value) || '—',
    technicien: ech($('#ch-technicien').value) || '—',
  };

  const etudes = etat.cameras.map((cam) => {
    const m = mesurePhotoDe(cam);
    const c = configDe(cam.optique);
    const type = /^Thermique/i.test(c.capteurCle) ? 'thermique' : 'visible';
    const propositions = m ? proposer(etat.catalogue, m.focale, { type }) : [];
    return { cam, m, c, propositions, avis: m ? conseil(m.focale, propositions) : null };
  });
  const retenues = etudes.filter((e) => e.m);

  const materiel = (e) => (e.propositions.length
    ? ech(nomComplet(e.propositions[0].entree))
      + (aConfirmer(e.propositions[0].entree).length
        ? ` — ${ech(aConfirmer(e.propositions[0].entree).join(' et '))} à confirmer`
        : '')
    : `objectif ${fmt(e.avis.focale, 1)} mm — référence à arrêter`);

  $('#rapport').innerHTML = `
    <h1>Proposition d'implantation vidéoprotection</h1>
    <p class="sous-titre">NG Security 38 — étude de couverture et matériel préconisé</p>

    <section>
      <h2>Affaire</h2>
      <table>
        <tr><th>Client</th><td>${ch.client}</td><th>N° d'affaire</th><td>${ch.affaire}</td></tr>
        <tr><th>Site</th><td>${ch.site}</td><th>Date</th><td>${ch.date}</td></tr>
        <tr><th>Caméras proposées</th><td>${retenues.length}</td><th>Établie par</th><td>${ch.technicien}</td></tr>
      </table>
    </section>

    ${retenues.length ? `<section>
      <h2>Synthèse de la couverture</h2>
      <table class="synthese">
        <thead><tr>
          <th>Poste</th><th>Zone couverte</th><th>Angle de vue</th>
          <th>Matériel préconisé</th><th>Exploitation garantie</th>
        </tr></thead>
        <tbody>${retenues.map((e) => {
    const niveau = niveauDori(e.m.densite);
    return `<tr>
            <td>${ech(e.cam.nom || 'Caméra')}</td>
            <td>de ${fmt(e.m.distanceMin)} à ${fmt(e.m.distanceMax)} m</td>
            <td>${fmt(e.m.angleRequis)} °</td>
            <td>${materiel(e)}</td>
            <td>${niveau === 'insuffisant' ? 'insuffisante' : SEUILS_DORI[niveau].label.toLowerCase()}
              jusqu'à ${fmt(e.m.distanceMax)} m</td>
          </tr>`;
  }).join('')}</tbody>
      </table>
    </section>` : '<section><h2>Synthèse</h2><p>Aucune zone n\'a encore été étudiée sur photo.</p></section>'}

    ${retenues.map((e, i) => {
    const niveau = niveauDori(e.m.densite);
    const portees = tableauPortees(e.m, e.c);
    const photo = photoAnnotee(e.cam);
    return `<div class="${i > 0 ? 'saut' : ''}">
      <p class="camera-titre">${ech(e.cam.nom || `Caméra ${i + 1}`)}</p>

      ${photo ? `<section>
        <h2>Zone à couvrir</h2>
        <img src="${photo.toDataURL('image/jpeg', 0.85)}" alt="" style="width:100%;border:1px solid #999">
        <p style="font-size:8pt;margin:1mm 0 0">
          Photo prise depuis l'emplacement prévu, à ${fmt(e.cam.etude3d.hauteur)} m de hauteur.
          En orange, la zone retenue ; en pointillés jaunes, les distances relevées sur le terrain.
          ${e.cam.etude3d.calageAuto
      ? `Angle de vue de la photo mesuré sur deux repères : ${fmt(e.m.prise.angleH)}°.`
      : 'Angle de vue de la photo d\'après les caractéristiques de l\'appareil.'}
        </p>
      </section>` : ''}

      ${(() => {
      const schema = schemaAngle(e.cam);
      return schema ? `<section>
        <h2>Champ couvert — tracé d'angle</h2>
        <img src="${schema.toDataURL('image/png')}" alt="" style="width:100%;border:1px solid #999">
        <p style="font-size:8pt;margin:1mm 0 0">
          Vue en plan du champ de la caméra préconisée. Les arcs en pointillés marquent
          la distance au-delà de laquelle chaque niveau d'exploitation n'est plus tenu.
        </p>
      </section>` : '';
    })()}

      <section>
        <h2>Matériel préconisé</h2>
        <table>
          <tr><th>Caméra</th><td colspan="3">${materiel(e)}</td></tr>
          <tr><th>Objectif</th><td>${fmt(e.m.focale, 1)} mm</td>
              <th>Angle de vue</th><td>${fmt(e.m.angleRequis)} °</td></tr>
          <tr><th>Hauteur de pose</th><td>${fmt(e.cam.etude3d.hauteur)} m</td>
              <th>Définition</th><td>${e.c.resolution.h} × ${e.c.resolution.v} px</td></tr>
          <tr><th>Zone couverte</th><td>de ${fmt(e.m.distanceMin)} à ${fmt(e.m.distanceMax)} m</td>
              <th>Largeur au fond</th><td>${fmt(e.m.largeur)} m</td></tr>
        </table>
        ${e.avis ? `<p style="font-size:9pt;margin-top:2mm">${ech(e.avis.texte)}</p>` : ''}
      </section>

      <section>
        <h2>Ce que permettra l'image</h2>
        <table>
          <thead><tr><th>Niveau d'exploitation</th><th>Ce que l'on peut en faire</th><th>Jusqu'à</th></tr></thead>
          <tbody>
            <tr><td>Détection</td><td>constater qu'une personne est présente</td>
                <td>${fmt(portees[0].distance)} m</td></tr>
            <tr><td>Observation</td><td>suivre ses déplacements, décrire sa tenue</td>
                <td>${fmt(portees[1].distance)} m</td></tr>
            <tr><td>Reconnaissance</td><td>reconnaître une personne déjà connue</td>
                <td>${fmt(portees[2].distance)} m</td></tr>
            <tr><td>Identification</td><td>identifier un inconnu, exploitable en justice</td>
                <td>${fmt(portees[3].distance)} m</td></tr>
          </tbody>
        </table>
        <p class="bandeau">Sur la zone demandée, jusqu'à ${fmt(e.m.distanceMax)} m :
          ${niveau === 'insuffisant'
    ? 'la définition reste insuffisante — resserrer la zone ou rapprocher la caméra'
    : `${SEUILS_DORI[niveau].label.toLowerCase()} (${fmt(e.m.densite, 0)} pixels par mètre)`}</p>
      </section>
      </div>`;
  }).join('')}

    ${sectionSynoptique(true)}

    ${sectionDevis()}

    <section class="saut">
      <h2>Méthode et hypothèses</h2>
      <ul>
        <li>Les distances sont mesurées sur les photos du site, à partir de la
          hauteur de prise de vue et d'un point de distance connue relevé sur place.</li>
        <li>Le sol est supposé plan sur la zone étudiée ; un relief marqué modifie
          les distances annoncées.</li>
        <li>Les niveaux d'exploitation suivent la norme EN 62676-4 : 25 pixels par
          mètre pour détecter, 62 pour observer, 125 pour reconnaître, 250 pour identifier.</li>
        <li>Les valeurs annoncées valent de jour, par temps clair. De nuit, la portée
          utile dépend de l'éclairage du site et de la portée infrarouge du matériel.</li>
        <li>La mise en œuvre est soumise au relevé définitif sur site : hauteurs
          réelles de fixation, cheminements de câbles et contraintes d'accès.</li>
      </ul>
    </section>

    <div class="signatures">
      <div>NG Security 38 — ${ch.technicien}<br>Date et signature :</div>
      <div>Le client — ${ch.client}<br>Date, signature et mention « bon pour accord » :</div>
    </div>`;
}

/**
 * Couverture réelle et angles morts, au dossier.
 *
 * Un cône tracé sans les murs promet plus que l'installation ne tiendra. Dès
 * qu'un mur figure au plan, le document dit quelle part du champ reste
 * réellement dégagée — c'est une réserve, pas un argument de vente, et elle a
 * sa place dans les deux documents.
 */
function sectionCouverture() {
  const b = bilanCouverture();
  if (!b || !b.murs || !b.parCamera.length) return '';

  const genes = b.parCamera.filter((c) => c.part < 0.995);
  return `<h3>Couverture réelle</h3>
    <p>${plur(b.murs, 'mur')} au plan, ${fmt(b.longueurMurs)} m au total. La part
      dégagée tient compte des angles morts qu'ils créent : un mur plus bas que la
      caméra se laisse survoler et ne cache qu'une bande de terrain, un mur plus
      haut arrête la vue.</p>
    ${genes.length ? `<table>
      <thead><tr><th>Caméra</th><th>Champ dégagé</th><th>Angle mort le plus étendu</th></tr></thead>
      <tbody>${genes.map((c) => `<tr>
        <td>${ech(nomNoeud(c.noeud))}</td>
        <td>${fmt(c.part * 100, 0)} %</td>
        <td>${c.trous.length
          ? `${fmt(c.trous[0].debut)} à ${fmt(c.trous[0].fin)} m`
          : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p>Aucune caméra n\'est gênée par les murs relevés.</p>'}`;
}

/**
 * Enregistrement et alimentation, au dossier.
 *
 * Le calcul est écrit en toutes lettres plutôt que réduit à son résultat : un
 * client qui voit « 16 To » sans savoir d'où ça sort n'a aucun moyen de
 * discuter la durée de conservation, qui est pourtant le premier levier sur le
 * prix.
 */
function sectionEnregistrement() {
  const b = bilan(synoptiqueCourant(), reglagesEnregistrement());
  if (!(b.debitTotal > 0)) return '';

  const parJour = b.debitTotal * 10.8 * (Math.min(b.heuresParJour, 24) / 24);
  const anomalies = b.anomalies.filter((a) => a.niveau === 'bloquant');

  return `<h3>Enregistrement</h3>
    <table>
      <tbody>
        <tr><td>Caméras enregistrées</td><td>${b.cameras}</td></tr>
        <tr><td>Débit cumulé</td><td>${fmt(b.debitTotal, 1)} Mbit/s</td></tr>
        <tr><td>Volume par jour</td><td>${frGroupe(parJour)} Go</td></tr>
        <tr><td>Durée de conservation</td><td>${b.jours} jours,
          ${b.heuresParJour} h/24</td></tr>
        <tr><td>Marge de sécurité</td><td>${Math.round(b.marge * 100)} %</td></tr>
        <tr><td><b>Capacité nécessaire</b></td>
          <td><b>${frGroupe(b.capaciteGo)} Go — ${fmt(b.capaciteGo / 1000, 1)} To</b></td></tr>
        ${b.disque ? `<tr><td><b>Disques à prévoir</b></td><td><b>${b.disque.nombre > 1
          ? `${b.disque.nombre} × ${fmt(b.disque.unitaire, 0)} To`
          : `${fmt(b.disque.unitaire, 0)} To`}</b></td></tr>` : ''}
      </tbody>
    </table>
    <p class="note">Téraoctets décimaux, comme les étiquettes des fabricants.
      Le calcul suppose le débit constant : un enregistrement sur détection
      consomme moins, un trafic dense davantage.</p>

    ${b.poe.length ? `<h3>Alimentation PoE</h3>
    <table>
      <thead><tr><th>Switch</th><th>Caméras alimentées</th><th>Puissance</th></tr></thead>
      <tbody>${b.poe.map((p) => `<tr>
        <td>${ech(nomNoeud(p.noeud))}</td>
        <td>${p.alimentes}</td>
        <td>${fmt(p.conso, 1)} W${p.budget ? ` sur ${fmt(p.budget, 0)} W` : ''}</td>
      </tr>`).join('')}</tbody>
    </table>` : ''}

    ${anomalies.length ? `<h3>Anomalies relevées</h3>
      <ul>${anomalies.map((a) => `<li>${ech(a.texte)}</li>`).join('')}</ul>` : ''}`;
}

/**
 * Section « synoptique de câblage » des documents.
 *
 * Elle ne figure que si le matériel a été posé : un dossier ne doit pas porter
 * une page vide qui laisserait croire qu'un câblage a été étudié.
 */
function sectionSynoptique(pourClient = false) {
  const r = etat.synoptique;
  if (!r?.image?.img || !(r.noeuds.length || r.murs?.length)) return '';
  const recap = recapReseau();
  const plan = $('#toile-reseau').toDataURL('image/png');
  const arbre = $('#toile-arbre').toDataURL('image/png');

  const inventaire = Object.entries(recap.parType)
    .map(([t, n]) => `<li>${n} × ${ech(TYPES_MATERIEL[t]?.label || t)}</li>`).join('');

  const reserves = [];
  for (const m of recap.depassements) {
    reserves.push(`${ech(nomNoeud(m.de))} → ${ech(nomNoeud(m.vers))} : ${fmt(m.cable)} m, `
      + `au-delà des ${LIMITE_LIEN} m admis en cuivre — switch intermédiaire, répéteur PoE `
      + 'ou fibre à prévoir.');
  }
  if (recap.orphelins.length) {
    reserves.push(`Matériel non raccordé au synoptique : `
      + recap.orphelins.map((n, i) => ech(nomNoeud(n, i))).join(', ') + '.');
  }
  if (recap.sansEnregistreur.length) {
    reserves.push('Caméra ne remontant à aucun enregistreur : '
      + recap.sansEnregistreur.map((n, i) => ech(nomNoeud(n, i))).join(', ') + '.');
  }

  return `<section class="saut">
      <h2>Synoptique de câblage</h2>
      <div class="images">
        <figure><figcaption>Cheminement sur le site</figcaption>
          <img src="${plan}" alt="Plan de câblage"></figure>
        <figure><figcaption>Arborescence</figcaption>
          <img src="${arbre}" alt="Arborescence du réseau"></figure>
      </div>

      <h3>Matériel</h3>
      <ul>${inventaire}</ul>

      ${recap.mesurable ? `<h3>Longueurs de câble</h3>
      <table>
        <thead><tr><th>Liaison</th><th>Au plan</th><th>Descentes</th><th>Câble à prévoir</th></tr></thead>
        <tbody>${recap.mesures.map((m, i) => `<tr>
          <td>${ech(nomNoeud(m.de, i))} → ${ech(nomNoeud(m.vers, i))}</td>
          <td>${fmt(m.auPlan)} m</td>
          <td>${fmt(m.descentes)} m</td>
          <td><b>${fmt(m.cable)} m</b></td></tr>`).join('')}
          <tr><td colspan="3"><b>Total</b></td><td><b>${fmt(recap.totalCable)} m</b></td></tr>
        </tbody>
      </table>
      <p class="note">Longueur de câble = trajet mesuré sur le plan + descentes
        verticales aux deux extrémités + ${fmt(nb($('#reseau-reserve'), 10), 0)} % de réserve.
        Les longueurs sont relevées sur un plan calibré sur une distance connue ;
        elles servent au chiffrage et non à la commande au mètre près.</p>`
    : '<p>Le plan n\'ayant pas été calibré sur une distance connue, les longueurs '
      + 'de câble ne sont pas chiffrées.</p>'}

      ${sectionCouverture()}

      ${sectionEnregistrement()}

      ${reserves.length ? `<h3>Points à traiter</h3>
        <ul>${reserves.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
      ${pourClient ? '<p class="note">Les cheminements figurés sont ceux retenus à '
        + 'l\'étude. Le relevé définitif sur site peut les modifier.</p>' : ''}
    </section>`;
}

function construireRapport() {
  sauverCameraCourante();
  const ch = {
    client: ech($('#ch-client').value) || '—',
    site: ech($('#ch-site').value) || '—',
    technicien: ech($('#ch-technicien').value) || '—',
    date: ech($('#ch-date').value) || '—',
    affaire: ech($('#ch-affaire').value) || '—',
  };

  const lignes = etat.cameras.map((cam) => ({
    cam,
    d: diagnosticDe(cam),
    etude: comparaisonEtudeDe(cam),
  }));
  const seule = lignes.length === 1;

  $('#rapport').innerHTML = `
    <h1>Procès-verbal d'analyse de vue d'angle</h1>
    <p class="sous-titre">NG Security 38 — comparaison des vues demandées et des réglages réalisés</p>

    <section>
      <h2>Chantier</h2>
      <table>
        <tr><th>Client</th><td>${ch.client}</td><th>N° d'affaire</th><td>${ch.affaire}</td></tr>
        <tr><th>Site</th><td>${ch.site}</td><th>Date</th><td>${ch.date}</td></tr>
        <tr><th>Caméras</th><td>${lignes.length}</td><th>Technicien</th><td>${ch.technicien}</td></tr>
      </table>
    </section>

    ${seule ? '' : sectionSynthese(lignes)}

    ${lignes.map((l, i) => sectionCamera(l, seule ? 0 : i, seule)).join('')}

    ${sectionSynoptique()}

    <div class="signatures">
      <div>Technicien — ${ch.technicien}<br>Date et signature :</div>
      <div>Client — ${ch.client}<br>Date, signature et mention « bon pour accord » :</div>
    </div>`;
}

/* ============================================================== câblage */

function basculerChampsLibres() {
  $('#capteur-libre').hidden = $('#cam-capteur').value !== 'libre';
  const r = RESOLUTIONS[parseInt($('#cam-resolution').value, 10)];
  $('#resolution-libre').hidden = !!(r && r.h);
  if ($('#cam-capteur').value === 'libre' && !$('#cam-capteur-l').value) {
    $('#cam-capteur-l').value = 5.18;
    $('#cam-capteur-h').value = 2.92;
  }
  if (!$('#resolution-libre').hidden && !$('#cam-res-h').value) {
    $('#cam-res-h').value = 1920;
    $('#cam-res-v').value = 1080;
  }
}

function brancher() {
  ['#cam-capteur', '#cam-resolution'].forEach((s) => $(s).addEventListener('change', () => {
    basculerChampsLibres();
    majOptique();
  }));
  ['#cam-focale', '#cam-distance', '#cam-hauteur', '#cam-inclinaison',
    '#cam-capteur-l', '#cam-capteur-h', '#cam-res-h', '#cam-res-v',
    '#aide-largeur', '#aide-distance'].forEach((s) => $(s).addEventListener('input', majOptique));
  ['#tol-angle', '#tol-roulis', '#tol-zoom'].forEach((s) => $(s).addEventListener('input', () => {
    if (etat.transformation) majDiagnostic();
    else majOnglets(); // les tolérances valent pour tout le dossier
  }));
  $('#tol-zone').addEventListener('input', majZones);

  brancherDepot('reference');
  brancherDepot('reglee');
  brancherDepotPlan();
  brancherDepotPhoto();
  brancherPlan();
  brancherCommandesReseau();
  brancherPhoto();
  brancherTracageZones();
  $('#catalogue-exporter').addEventListener('click', exporterCatalogue);
  $('#catalogue-importer').addEventListener('click', () => $('#fichier-catalogue').click());
  $('#fichier-catalogue').addEventListener('change', (e) => {
    if (e.target.files[0]) importerCatalogue(e.target.files[0]);
    e.target.value = '';
  });
  $('#catalogue-ajouter').addEventListener('click', () => {
    etat.catalogue.push(normaliserEntree({ reference: '', focaleMin: 4, focaleMax: 4 }, etat.catalogue.length));
    enregistrerCatalogue();
    majCatalogue();
  });

  $('#btn-analyser').addEventListener('click', analyser);
  ['#man-tx', '#man-ty', '#man-echelle', '#man-rotation'].forEach((s) => {
    $(s).addEventListener('input', recalageManuel);
  });
  $('#btn-reinit-manuel').addEventListener('click', () => {
    $('#man-tx').value = 0; $('#man-ty').value = 0;
    $('#man-echelle').value = 1; $('#man-rotation').value = 0;
    recalageManuel();
  });

  $$('.mode').forEach((b) => b.addEventListener('click', () => basculerMode(b.dataset.mode)));
  ['#opacite', '#rideau'].forEach((s) => $(s).addEventListener('input', () => {
    $('#out-opacite').textContent = `${$('#opacite').value} %`;
    majVisionneuse();
  }));
  ['#opt-recalage', '#opt-grille', '#opt-reticule'].forEach((s) => {
    $(s).addEventListener('change', majVisionneuse);
  });

  $('#btn-zones').addEventListener('click', () => {
    if (!etat.reference) {
      $('#etat-analyse').textContent = 'Charger d\'abord la vue demandée : les zones se tracent dessus.';
      $('#etat-analyse').classList.add('erreur');
      return;
    }
    etat.tracage = !etat.tracage;
    $('#btn-zones').textContent = etat.tracage ? 'Tracer : cliquer-glisser à gauche' : 'Tracer une zone d\'intérêt';
    if (etat.tracage && etat.mode !== 'cote') {
      $$('.mode').forEach((x) => x.classList.toggle('actif', x.dataset.mode === 'cote'));
      etat.mode = 'cote';
    }
    majVisionneuse();
  });

  $('#ch-camera').addEventListener('input', majOnglets);
  $('#btn-ajouter-camera').addEventListener('click', () => ajouterCamera());
  $('#btn-supprimer-camera').addEventListener('click', supprimerCamera);

  $('#etude-camera').addEventListener('change', (e) => {
    if (cameraCourante()) cameraCourante().repereEtude = e.target.value;
    majEtude();
  });
  $('#etude-tout').addEventListener('click', () => {
    const champs = champsEtude();
    ['capteur', 'resolution', 'focale', 'angle', 'distance', 'hauteur']
      .filter((cle) => champs[cle]).forEach(reprendre);
  });
  $('#etude-entete').addEventListener('click', reprendreEntete);
  $('#etude-copier').addEventListener('click', copierTexteLu);

  $('#btn-enregistrer').addEventListener('click', enregistrerFiche);
  $('#btn-nouveau').addEventListener('click', nouvelleFiche);
  $('#btn-ouvrir').addEventListener('click', () => $('#fichier-fiche').click());
  $('#fichier-fiche').addEventListener('change', (e) => {
    if (e.target.files[0]) ouvrirFiche(e.target.files[0]);
    e.target.value = '';
  });
  $('#btn-rapport').addEventListener('click', () => {
    construireRapport();
    window.print();
  });
  $('#btn-proposition').addEventListener('click', () => {
    construireProposition();
    window.print();
  });
}

remplirSelecteurs();
basculerChampsLibres();
brancher();
etat.catalogue = chargerCatalogue();
majCatalogue();
etat.cameras = [nouvelleCamera('CAM 01')];
chargerCamera(0);
majEtiquettesCurseurs();
