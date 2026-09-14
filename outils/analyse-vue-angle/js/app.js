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
import { champsPourCamera, confronter } from './lecture-etude.js';
import {
  TYPE_FICHE, VERSION_FICHE, migrer, nouvelleCamera, nomDeFichier,
} from './fiche.js';

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

  synchroniserCurseurs();
  majOptique();
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

function majVisionneuse() {
  const pret = etat.reference && etat.reglee;
  $('#message-vide').hidden = !!(etat.reference || etat.reglee);
  $('#paire').hidden = etat.mode !== 'cote' || !(etat.reference || etat.reglee);
  $('#fusion').hidden = etat.mode === 'cote' || !pret;
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
    cameras: etat.cameras,
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
  etat.cameras = f.cameras;
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
      <p style="font-size:9pt;margin-top:2mm">
        Valeurs relevées dans ${ech(etat.etude.fichier)}${etat.etude.ocr
    ? ' par lecture optique (document scanné), après vérification du technicien'
    : ''}
        ${etude.filter((l) => !l.conforme).length
    ? `— ${plur(etude.filter((l) => !l.conforme).length, 'écart')} entre le matériel annoncé et le matériel posé.`
    : '— le matériel posé correspond à l\'étude.'}
      </p>
    </section>` : ''}

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
  brancherTracageZones();

  $('#btn-analyser').addEventListener('click', analyser);
  ['#man-tx', '#man-ty', '#man-echelle', '#man-rotation'].forEach((s) => {
    $(s).addEventListener('input', recalageManuel);
  });
  $('#btn-reinit-manuel').addEventListener('click', () => {
    $('#man-tx').value = 0; $('#man-ty').value = 0;
    $('#man-echelle').value = 1; $('#man-rotation').value = 0;
    recalageManuel();
  });

  $$('.mode').forEach((b) => b.addEventListener('click', () => {
    $$('.mode').forEach((x) => x.classList.toggle('actif', x === b));
    etat.mode = b.dataset.mode;
    majVisionneuse();
  }));
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
}

remplirSelecteurs();
basculerChampsLibres();
brancher();
etat.cameras = [nouvelleCamera('CAM 01')];
chargerCamera(0);
majEtiquettesCurseurs();
