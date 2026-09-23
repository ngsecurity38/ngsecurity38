/**
 * L'éditeur d'étude : le plan à l'écran, les caméras à la souris.
 *
 * Ce que l'agence fait ici, elle n'a plus à le demander : déplacer une
 * caméra, changer son modèle, la rattacher à un autre coffret, en ajouter
 * une, en retirer une. Tout se recalcule à l'instant — le métré, les
 * portées, le budget PoE, le stockage — et le fichier exporté regénère le
 * dossier et la présentation sans qu'une ligne soit ressaisie.
 *
 * Les calculs ne sont pas refaits ici : ils viennent de `etude-plan.js`,
 * le même module que le générateur du dossier. Un éditeur qui annoncerait
 * d'autres longueurs que l'étude qu'il modifie ne servirait qu'à se
 * tromper plus vite.
 */

import { $, $$ } from './dom.js';
import { fr, frGroupe, echapper } from './format.js';
import {
  geometrie, optiqueUtile, bilanEtude, bandePhoto, porteesDori,
} from './etude-plan.js';
import { LIAISON_PERMANENTE } from './cable.js';
import { fiche, dossierParDefaut, sectionsDuDossier } from './editeur-fiche.js';

const SVG = 'http://www.w3.org/2000/svg';

const el = (nom, attrs = {}) => {
  const n = document.createElementNS(SVG, nom);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/* --------------------------------------------------------------- l'état */

const etat = {
  etude: null,
  selection: null,
  photo: null,
  calage: false,
  echelle: 1,          // pixels par mètre
  histoire: [],        // pour défaire
  modifie: false,
};

/** Garde une copie avant chaque changement : défaire est un droit. */
function memoriser() {
  etat.histoire.push(JSON.stringify(etat.etude));
  if (etat.histoire.length > 60) etat.histoire.shift();
  etat.modifie = true;
}

function defaire() {
  const avant = etat.histoire.pop();
  if (!avant) return;
  etat.etude = JSON.parse(avant);
  if (!etat.etude.cameras.some((c) => c.cle === etat.selection)) etat.selection = null;
  tout();
}

/* --------------------------------------------------------------- le plan */

const COULEUR = {
  identification: '#c8102e',
  reconnaissance: '#d4657a',
  observation: '#b6bcc6',
};

/** Les trois portées d'une caméra, dans l'ordre où on les empile. */
/** Un secteur, en coordonnées du plan. */
function secteur(cx, cy, rayon, azimut, angle, E) {
  const r = rayon * E;
  const a0 = ((azimut - angle / 2) * Math.PI) / 180;
  const a1 = ((azimut + angle / 2) * Math.PI) / 180;
  const p = (a) => [cx * E + r * Math.sin(a), cy * E - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const grand = angle > 180 ? 1 : 0;
  return `M ${(cx * E).toFixed(1)} ${(cy * E).toFixed(1)} L ${x0.toFixed(1)} ${y0.toFixed(1)} `
    + `A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${grand} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
}

function dessinerPlan() {
  const svg = $('#plan');
  const e = etat.etude;
  const g = geometrie(e.site);
  const cadre = svg.parentElement.getBoundingClientRect();
  const E = Math.max(2, Math.min((cadre.width - 24) / g.largeur, (cadre.height - 24) / g.hauteur));
  etat.echelle = E;
  svg.setAttribute('viewBox', `0 0 ${g.largeur * E} ${g.hauteur * E}`);
  svg.setAttribute('width', g.largeur * E);
  svg.setAttribute('height', g.hauteur * E);
  svg.replaceChildren();

  /*
   * La vue aérienne, s'il y en a une, passe SOUS tout le reste : elle sert
   * à poser les caméras sur ce qui existe, pas à décorer. On la cale une
   * fois pour toutes sur une longueur connue, et le plan devient un calque
   * sur la photo du site.
   */
  if (e.fond && e.fond.src) {
    svg.append(el('image', {
      href: e.fond.src, x: e.fond.x * E, y: e.fond.y * E,
      width: e.fond.largeur * E,
      height: (e.fond.hauteur || e.fond.largeur * 0.6) * E,
      opacity: e.fond.opacite ?? 0.55,
      preserveAspectRatio: 'none',
    }));
  }

  const rect = (r, fill, stroke) => el('rect', {
    x: r.x * E, y: r.y * E, width: r.l * E, height: r.p * E,
    fill, stroke: stroke || 'none', 'stroke-width': 1.5,
  });
  const voile = e.fond && e.fond.src;
  svg.append(rect(g.cour, voile ? 'none' : '#eef0f3'));
  svg.append(rect(g.bat, voile ? 'rgba(255,255,255,.35)' : '#dfe3e9', '#6e7682'));
  svg.append(rect(g.annexe, voile ? 'rgba(255,255,255,.3)' : '#e7eaf0', '#9aa2ae'));
  const q = el('rect', {
    x: g.quai.x * E, y: g.quai.y * E, width: g.quai.l * E, height: g.quai.p * E,
    fill: 'none', stroke: '#9aa2ae', 'stroke-width': 1, 'stroke-dasharray': '4 3',
  });
  svg.append(q);
  svg.append(el('line', {
    x1: g.portail.x * E, y1: g.portail.y * E,
    x2: (g.portail.x + g.portail.l) * E, y2: g.portail.y * E,
    stroke: '#1a1d23', 'stroke-width': 5,
  }));

  const etiquette = (x, y, texte, taille = 11, couleur = '#8a9099') => {
    const t = el('text', { x: x * E, y: y * E, 'font-size': taille, fill: couleur });
    t.textContent = texte;
    return t;
  };
  svg.append(etiquette(g.bat.x + 1.5, g.bat.y + 4, `BÂTIMENT — ${fr(e.site.longueurBatiment, 0)} m`));
  svg.append(etiquette(1.5, g.cour.y + 5, 'COUR'));
  svg.append(etiquette(g.portail.x, g.portail.y + 4, 'PORTAIL', 11, '#1a1d23'));

  // Les champs, du plus large au plus serré : l'identification par-dessus.
  for (const c of e.cameras) {
    const m = e.modeles[c.modele];
    if (!m) continue;
    const p = porteesDori(m, c.tele);
    const vif = !etat.selection || etat.selection === c.cle;
    for (const cle of ['observation', 'reconnaissance', 'identification']) {
      svg.append(el('path', {
        d: secteur(c.x, c.y, p[cle], c.azimut, p.angle, E),
        fill: COULEUR[cle],
        opacity: vif ? (cle === 'identification' ? 0.55 : 0.25) : 0.08,
      }));
    }
  }

  // Le local, les coffrets, les accès : des repères, pas des caméras.
  const carre = (x, y, texte, couleur) => {
    const grp = el('g', {});
    grp.append(el('rect', {
      x: x * E - 9, y: y * E - 9, width: 18, height: 18, rx: 3,
      fill: couleur, stroke: '#fff', 'stroke-width': 1.5,
    }));
    const t = el('text', {
      x: x * E, y: y * E + 4, 'font-size': 9.5, 'font-weight': 700,
      fill: '#fff', 'text-anchor': 'middle',
    });
    t.textContent = texte;
    grp.append(t);
    return grp;
  };
  svg.append(carre(e.local.x, e.local.y, 'NVR', '#1a1d23'));
  for (const r of e.coffrets) svg.append(carre(r.x, r.y, r.cle, '#5b6472'));
  for (const a of e.acces) svg.append(carre(a.x, a.y, a.cle, '#8a5a00'));

  // Les caméras, saisissables.
  for (const c of e.cameras) {
    const grp = el('g', { class: 'pion', 'data-cle': c.cle, style: 'cursor:grab' });
    const choisie = etat.selection === c.cle;
    if (choisie) {
      grp.append(el('circle', {
        cx: c.x * E, cy: c.y * E, r: 17, fill: 'none',
        stroke: '#c8102e', 'stroke-width': 2, 'stroke-dasharray': '3 3',
      }));
      // La poignée d'orientation : on la tire, la caméra tourne.
      const a = (c.azimut * Math.PI) / 180;
      const hx = c.x * E + Math.sin(a) * 42;
      const hy = c.y * E - Math.cos(a) * 42;
      grp.append(el('line', {
        x1: c.x * E, y1: c.y * E, x2: hx, y2: hy, stroke: '#c8102e', 'stroke-width': 1.5,
      }));
      const h = el('circle', {
        cx: hx, cy: hy, r: 7, fill: '#fff', stroke: '#c8102e', 'stroke-width': 2,
        class: 'poignee', style: 'cursor:crosshair',
      });
      grp.append(h);
    }
    grp.append(el('circle', {
      cx: c.x * E, cy: c.y * E, r: 11,
      fill: choisie ? '#c8102e' : '#1a1d23', stroke: '#fff', 'stroke-width': 2,
    }));
    const t = el('text', {
      x: c.x * E, y: c.y * E + 4, 'font-size': 9.5, 'font-weight': 700,
      fill: '#fff', 'text-anchor': 'middle', style: 'pointer-events:none',
    });
    t.textContent = c.cle;
    grp.append(t);
    svg.append(grp);
  }

  // L'échelle, pour que l'œil garde la mesure.
  const barre = 20;
  const y = g.hauteur - 3;
  svg.append(el('line', {
    x1: (g.largeur - barre - 4) * E, y1: y * E, x2: (g.largeur - 4) * E, y2: y * E,
    stroke: '#1a1d23', 'stroke-width': 2,
  }));
  svg.append(etiquette(g.largeur - barre - 4, y - 1, `${barre} m`, 11, '#1a1d23'));
}

/* ------------------------------------------------------ saisie à la souris */

function metresDepuisEvenement(ev) {
  const svg = $('#plan');
  const r = svg.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) / etat.echelle,
    y: (ev.clientY - r.top) / etat.echelle,
  };
}

const arrondiDemi = (v) => Math.round(v * 2) / 2;

function brancherSouris() {
  const svg = $('#plan');
  let saisie = null;

  svg.addEventListener('pointerdown', (ev) => {
    // Mode « caler le fond » : la souris déplace l'image, pas les caméras.
    if (etat.calage && etat.etude.fond) {
      memoriser();
      const p = metresDepuisEvenement(ev);
      saisie = { mode: 'fond', dx: p.x - etat.etude.fond.x, dy: p.y - etat.etude.fond.y };
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    const poignee = ev.target.closest('.poignee');
    const pion = ev.target.closest('.pion');
    if (!pion && !poignee) { etat.selection = null; tout(); return; }
    const cle = (pion || poignee.parentElement).dataset.cle;
    etat.selection = cle;
    saisie = { cle, mode: poignee ? 'angle' : 'position' };
    memoriser();
    svg.setPointerCapture(ev.pointerId);
    tout();
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!saisie) return;
    if (saisie.mode === 'fond') {
      const p = metresDepuisEvenement(ev);
      etat.etude.fond.x = Math.round((p.x - saisie.dx) * 2) / 2;
      etat.etude.fond.y = Math.round((p.y - saisie.dy) * 2) / 2;
      dessinerPlan();
      return;
    }
    const c = etat.etude.cameras.find((x) => x.cle === saisie.cle);
    if (!c) return;
    const p = metresDepuisEvenement(ev);
    if (saisie.mode === 'position') {
      c.x = arrondiDemi(p.x);
      c.y = arrondiDemi(p.y);
    } else {
      const a = Math.atan2(p.x - c.x, -(p.y - c.y));
      c.azimut = (Math.round((a * 180) / Math.PI) + 360) % 360;
    }
    dessinerPlan();
    chiffres();
    remplirPanneau();
  });

  const fin = () => { saisie = null; };
  svg.addEventListener('pointerup', fin);
  svg.addEventListener('pointercancel', fin);
}

/* ------------------------------------------------------------ le panneau */

function remplirPanneau() {
  const p = $('#panneau');
  const c = etat.etude.cameras.find((x) => x.cle === etat.selection);
  $('#aucune').hidden = !!c;
  p.hidden = !c;
  if (!c) return;
  const m = etat.etude.modeles[c.modele];
  const po = porteesDori(m, c.tele);

  $('#p-cle').textContent = c.cle;
  $('#p-role').value = c.role || '';
  $('#p-modele').value = c.modele;
  $('#p-tele').checked = !!c.tele;
  $('#p-tele').disabled = !m.angleHTele;
  $('#p-hauteur').value = c.hauteur;
  $('#p-azimut').value = c.azimut;
  $('#p-azimut-txt').textContent = `${c.azimut}°`;
  $('#p-x').value = c.x;
  $('#p-y').value = c.y;
  $('#p-coffret').value = c.coffret || '';

  $('#p-portees').innerHTML = ['identification', 'reconnaissance', 'observation']
    .map((k) => `<div><span>${k === 'identification' ? 'Identifie' : k === 'reconnaissance' ? 'Reconnaît' : 'Observe'}</span>
      <b>${fr(po[k])} m</b></div>`).join('');

  const liaison = etat.bilan.liaisons.find((l) => l.repere === c.cle);
  const hors = liaison && liaison.verdict && liaison.verdict.niveau !== 'ok';
  $('#p-cable').innerHTML = liaison
    ? `<b>${fr(liaison.longueur, 0)} m</b> de câble depuis
       ${liaison.vers === 'local' ? 'le local' : liaison.vers}
       ${hors ? `<span class="alerte">— hors norme, la limite est à ${LIAISON_PERMANENTE} m</span>` : ''}`
    : '';
}

/* ------------------------------------------------------------ les photos */

/** Lit un fichier image et rend une adresse de données, utilisable hors ligne. */
function lireImage(fichier) {
  return new Promise((ok, non) => {
    const l = new FileReader();
    l.onload = () => ok(l.result);
    l.onerror = () => non(new Error(`Image illisible : ${fichier.name}`));
    l.readAsDataURL(fichier);
  });
}

/**
 * Champ horizontal supposé d'une photo, en degrés.
 *
 * Un téléphone tenu DROIT ne cadre pas comme un téléphone tenu en travers :
 * le capteur est le même, la moitié qu'on en garde ne l'est pas. Une image
 * au format portrait ou carré voit donc nettement moins large, et c'est la
 * plus fréquente sur un chantier.
 */
export const CHAMP_PAYSAGE = 67;
export const CHAMP_PORTRAIT = 52.8;
const champSuppose = (l, h) => (l > h * 1.25 ? CHAMP_PAYSAGE : CHAMP_PORTRAIT);

/** Le bloc d'une photo : l'image, et les bandes de champ dessus. */
function dessinerPhoto(photo) {
  const zone = $('#photo-zone');
  zone.replaceChildren();
  if (!photo) return;

  const cadre = document.createElement('div');
  cadre.className = 'report';
  const img = document.createElement('img');
  img.src = photo.src;
  img.alt = photo.titre || '';
  cadre.append(img);

  for (const r of photo.reperes || []) {
    const c = etat.etude.cameras.find((x) => x.cle === r.camera);
    if (!c) continue;
    const m = etat.etude.modeles[c.modele];
    const o = optiqueUtile(m, c.tele);
    const angle = m.capteurUnique ? 180 : o.angleH;
    const b = bandePhoto(photo.champ, angle, r.bande);
    const band = document.createElement('div');
    band.className = 'champ';
    band.dataset.camera = c.cle;
    band.style.left = `${(b.gauche * 100).toFixed(1)}%`;
    band.style.width = `${(b.largeur * 100).toFixed(1)}%`;
    const t = document.createElement('span');
    t.textContent = `${c.cle} — ${Math.round(angle)}°${b.deborde ? ' (déborde)' : ''}`;
    band.append(t);
    cadre.append(band);
  }
  zone.append(cadre);

  // La bande se tire à la souris : on vise sur la photo, pas au chiffre.
  let tirage = null;
  const position = (ev) => {
    const r = cadre.getBoundingClientRect();
    return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  };
  cadre.addEventListener('pointerdown', (ev) => {
    const band = ev.target.closest('.champ');
    if (!band) return;
    memoriser();
    tirage = band.dataset.camera;
    cadre.setPointerCapture(ev.pointerId);
  });
  cadre.addEventListener('pointermove', (ev) => {
    if (!tirage) return;
    const r = (photo.reperes || []).find((x) => x.camera === tirage);
    if (!r) return;
    r.bande = Math.round(position(ev) * 100) / 100;
    dessinerPhoto(photo);
  });
  const fin = () => { tirage = null; };
  cadre.addEventListener('pointerup', fin);
  cadre.addEventListener('pointercancel', fin);
}

function listePhotos() {
  const photos = etat.etude.photos || [];
  $('#photos').innerHTML = photos.map((p) => `<li data-cle="${p.cle}"
    class="${etat.photo === p.cle ? 'active' : ''}">
    <img src="${p.src}" alt="">
    <span class="nom">${p.titre || p.cle}</span>
    <span class="det">${(p.reperes || []).map((r) => r.camera).join(', ') || 'aucune caméra'}
      — champ ${fr(p.champ)}°</span>
  </li>`).join('') || '<li class="vide">Aucune photo. Ajoutez les vues du site : '
    + 'ce sont elles qui convainquent un client.</li>';
  $$('#photos li[data-cle]').forEach((n) => n.addEventListener('click', () => {
    etat.photo = n.dataset.cle;
    panneauPhoto();
    listePhotos();
  }));
}

function panneauPhoto() {
  const photo = (etat.etude.photos || []).find((p) => p.cle === etat.photo);
  $('#photo-panneau').hidden = !photo;
  if (!photo) { dessinerPhoto(null); return; }
  $('#ph-titre').value = photo.titre || '';
  $('#ph-champ').value = photo.champ;
  $('#ph-champ-txt').textContent = `${fr(photo.champ)}°`;
  $('#ph-cameras').innerHTML = etat.etude.cameras.map((c) => {
    const pose = (photo.reperes || []).some((r) => r.camera === c.cle);
    return `<label class="case-mini"><input type="checkbox" data-cam="${c.cle}"
      ${pose ? 'checked' : ''}> ${c.cle}</label>`;
  }).join('');
  $$('#ph-cameras input').forEach((n) => n.addEventListener('change', () => {
    memoriser();
    photo.reperes = photo.reperes || [];
    if (n.checked) photo.reperes.push({ camera: n.dataset.cam, bande: 0.5 });
    else photo.reperes = photo.reperes.filter((r) => r.camera !== n.dataset.cam);
    dessinerPhoto(photo);
    listePhotos();
  }));
  dessinerPhoto(photo);
}

async function ajouterPhotos(fichiers) {
  memoriser();
  etat.etude.photos = etat.etude.photos || [];
  for (const f of fichiers) {
    const src = await lireImage(f);
    const dim = await new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok({ l: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => ok({ l: 4, h: 3 });
      i.src = src;
    });
    const n = etat.etude.photos.length + 1;
    etat.etude.photos.push({
      cle: `V${n}`,
      titre: f.name.replace(/\.[^.]+$/, ''),
      src,
      champ: champSuppose(dim.l, dim.h),
      reperes: [],
    });
  }
  etat.photo = etat.etude.photos[etat.etude.photos.length - 1].cle;
  listePhotos();
  panneauPhoto();
  majFond();
  listeChapitres();
}

/* ------------------------------------------------------------- les chiffres */

function chiffres() {
  const b = bilanEtude(etat.etude);
  etat.bilan = b;
  const nvr = etat.etude.equipements.enregistreur;
  const mettre = (sel, valeur, alerte = false) => {
    const n = $(sel);
    n.textContent = valeur;
    n.classList.toggle('mauvais', alerte);
  };
  mettre('#f-cameras', `${b.cameras} / ${nvr.canaux}`, b.voiesLibres < 0);
  mettre('#f-debit', `${fr(b.debitTotal)} Mbit/s`, b.bandeSaturee);
  mettre('#f-stock', `${fr(b.capaciteGo / 1000)} To`,
    !!(b.disques && !b.disques.pool));
  mettre('#f-poe', `${fr(b.consoPoe)} W`, b.consoPoe > (nvr.budgetPoe || Infinity));
  mettre('#f-reseau', `${frGroupe(Math.round(b.reseau))} m`);
  mettre('#f-boites', `${b.boites.boites}`);
  mettre('#f-hors', b.horsNorme.length ? `${b.horsNorme.length}` : '0',
    b.horsNorme.length > 0);

  $('#alertes').innerHTML = b.horsNorme.length
    ? `<b>${b.horsNorme.length} liaison(s) hors norme :</b> ${b.horsNorme
      .map((l) => `${l.repere} (${fr(l.longueur, 0)} m)`).join(', ')}.
       Au-delà de ${LIAISON_PERMANENTE} m de câble posé, la liaison n'est plus garantie :
       rapprocher la caméra, ou la rattacher à un coffret.`
    : '';
  $('#alertes').hidden = !b.horsNorme.length;
}

/* ----------------------------------------------------------- la liste */

function listeCameras() {
  $('#liste').innerHTML = etat.etude.cameras.map((c) => {
    const m = etat.etude.modeles[c.modele];
    const po = porteesDori(m, c.tele);
    return `<li data-cle="${c.cle}" class="${etat.selection === c.cle ? 'active' : ''}">
      <span class="puce">${c.cle}</span>
      <span class="nom">${c.role || '—'}</span>
      <span class="det">${m.reference.replace('Hikvision ', '').replace(/ \(.*/, '')}${
  c.tele ? ' · télé' : ''} — identifie à ${fr(po.identification)} m</span>
    </li>`;
  }).join('');
  $$('#liste li').forEach((n) => n.addEventListener('click', () => {
    etat.selection = n.dataset.cle;
    tout();
  }));
}

/** Le bloc du fond n'a de sens que s'il y a un fond. */
function majFond() {
  const f = etat.etude.fond;
  $('#fond-reglages').hidden = !f;
  $('#b-fond').textContent = f ? 'Remplacer la vue aérienne…' : 'Ajouter une vue aérienne…';
  if (!f) { etat.calage = false; $('#f-calage').checked = false; $('#plan').classList.remove('calage'); return; }
  $('#f-opacite').value = Math.round((f.opacite ?? 0.55) * 100);
  $('#f-largeur').value = Math.round(f.largeur);
}

/* ------------------------------------------------------- le dossier client */

/** À quoi sert chaque chapitre, dit en une ligne sous son intitulé. */
const DESCRIPTION = {
  chiffres: 'Le bandeau de tête : caméras, débit, stockage, PoE, câble.',
  cameras: 'Le tableau des caméras et leurs distances d\'identification.',
  plan: 'Le plan tel qu\'il est à l\'écran, secteurs compris.',
  vues: 'Vos photos, avec le champ de chaque caméra reporté dessus.',
  cablage: 'Le métré, les boîtes à commander, les liaisons hors norme.',
  reserves: 'Ce que l\'étude ne promet pas. À garder.',
};

/**
 * Le dossier suit l'étude.
 *
 * Une étude enregistrée avant que ce réglage n'existe n'a pas de chapitres :
 * on lui donne l'ordre naturel plutôt que de lui sortir un dossier vide.
 */
function assurerDossier() {
  const d = (etat.etude.dossier && typeof etat.etude.dossier === 'object')
    ? etat.etude.dossier : {};
  const sections = sectionsDuDossier(etat.etude);
  etat.etude.dossier = {
    sautDePage: !!d.sautDePage,
    sections: sections.length ? sections : dossierParDefaut().sections,
  };
}

function deplacerChapitre(i, vers) {
  const l = etat.etude.dossier.sections;
  if (vers < 0 || vers >= l.length) return;
  memoriser();
  const [x] = l.splice(i, 1);
  l.splice(vers, 0, x);
  listeChapitres();
}

function ajouterTexte() {
  memoriser();
  const l = etat.etude.dossier.sections;
  const rang = l.filter((s) => s.type === 'texte').length + 1;
  l.push({
    cle: `texte-${Date.now().toString(36)}`,
    type: 'texte',
    titre: `Précision ${rang}`,
    corps: '',
    visible: true,
  });
  listeChapitres();
  const zone = $('#chapitres li:last-child textarea');
  if (zone) zone.focus();
}

/**
 * La liste des chapitres.
 *
 * On ne redessine pas à chaque frappe : le champ perdrait le curseur au
 * premier caractère. Le texte va droit dans l'étude, et la liste n'est
 * refaite que lorsque sa forme change — un chapitre déplacé, écarté, ajouté.
 */
function listeChapitres() {
  const d = etat.etude.dossier;
  $('#f-saut').checked = !!d.sautDePage;
  $('#chapitres').innerHTML = d.sections.map((s, i) => {
    const ecarte = s.visible === false;
    const libre = s.type === 'texte';
    return `<li data-i="${i}" class="${ecarte ? 'ecarte' : ''}">
      <div class="rang">
        <input type="checkbox" data-r="visible" ${ecarte ? '' : 'checked'}
          title="${ecarte ? 'Remettre ce chapitre' : 'Retirer ce chapitre du dossier'}">
        <input type="text" data-r="titre" maxlength="80" value="${echapper(s.titre || '')}"
          placeholder="Intitulé du chapitre">
        <button type="button" class="btn btn-puce" data-r="haut"
          ${i === 0 ? 'disabled' : ''} title="Monter">&#8593;</button>
        <button type="button" class="btn btn-puce" data-r="bas"
          ${i === d.sections.length - 1 ? 'disabled' : ''} title="Descendre">&#8595;</button>
        ${libre ? '<button type="button" class="btn btn-puce btn-retrait" '
          + 'data-r="retirer" title="Supprimer ce texte">&#215;</button>' : ''}
      </div>
      ${libre
    ? `<textarea data-r="corps" rows="4" placeholder="Votre texte. Une ligne vide sépare deux paragraphes.">${echapper(s.corps || '')}</textarea>`
    : `<small class="det">${echapper(DESCRIPTION[s.cle] || '')}</small>`}
    </li>`;
  }).join('');

  $$('#chapitres li').forEach((n) => {
    const i = Number(n.dataset.i);
    const sec = () => etat.etude.dossier.sections[i];
    const sur = (role, evenement, fait) => {
      const champ = n.querySelector(`[data-r="${role}"]`);
      if (champ) champ.addEventListener(evenement, () => fait(champ));
    };
    sur('visible', 'change', (c) => { memoriser(); sec().visible = c.checked; listeChapitres(); });
    sur('titre', 'focus', memoriser);
    sur('titre', 'input', (c) => { sec().titre = c.value; etat.modifie = true; });
    sur('corps', 'focus', memoriser);
    sur('corps', 'input', (c) => { sec().corps = c.value; etat.modifie = true; });
    sur('haut', 'click', () => deplacerChapitre(i, i - 1));
    sur('bas', 'click', () => deplacerChapitre(i, i + 1));
    sur('retirer', 'click', () => {
      memoriser();
      etat.etude.dossier.sections.splice(i, 1);
      listeChapitres();
    });
  });
}

function tout() {
  chiffres();
  dessinerPlan();
  listeCameras();
  remplirPanneau();
  listePhotos();
  panneauPhoto();
  majFond();
  listeChapitres();
}

/* ------------------------------------------------------------- commandes */

function prochaineCle() {
  const nums = etat.etude.cameras
    .map((c) => Number(String(c.cle).replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n));
  return `C${Math.max(0, ...nums) + 1}`;
}

function ajouter() {
  memoriser();
  const g = geometrie(etat.etude.site);
  const c = {
    cle: prochaineCle(),
    vue: null,
    modele: Object.keys(etat.etude.modeles)[0],
    tele: false,
    hauteur: 3,
    role: 'Nouvelle caméra',
    pose: 'À préciser au relevé',
    bande: 0.5,
    x: Math.round(g.bat.x + g.bat.l / 2),
    y: Math.round(g.cour.y + 8),
    azimut: 180,
    aerien: null,
    coffret: null,
  };
  etat.etude.cameras.push(c);
  etat.selection = c.cle;
  tout();
}

function supprimer() {
  if (!etat.selection) return;
  memoriser();
  etat.etude.cameras = etat.etude.cameras.filter((c) => c.cle !== etat.selection);
  etat.selection = null;
  tout();
}

/** Enregistre un fichier sans passer par le moindre serveur. */
function telecharger(nom, texte, type) {
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([texte], { type }));
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(lien.href);
}

/**
 * Le dossier client.
 *
 * Le plan part tel qu'il est à l'écran — on le désélectionne d'abord, sans
 * quoi le cercle de sélection et la poignée d'orientation se retrouveraient
 * imprimés chez le client.
 */
function produireFiche() {
  const garde = etat.selection;
  etat.selection = null;
  dessinerPlan();
  const svg = new XMLSerializer().serializeToString($('#plan'));
  etat.selection = garde;
  dessinerPlan();

  const agence = globalThis.__agence || {};
  const nom = `etude-${(etat.etude.reference || 'sans-reference')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-')}.html`;
  telecharger(nom, fiche(etat.etude, agence, svg), 'text/html;charset=utf-8');
}

function exporter() {
  telecharger('etude.json', `${JSON.stringify(etat.etude, null, 1)}\n`, 'application/json');
  etat.modifie = false;
}

async function importer(fichier) {
  const texte = await fichier.text();
  const lu = JSON.parse(texte);
  if (!lu.cameras || !lu.site || !lu.modeles) {
    throw new Error('Ce fichier n\'est pas une étude : il lui manque le site, '
      + 'les caméras ou les modèles.');
  }
  memoriser();
  etat.etude = lu;
  assurerDossier();
  etat.selection = null;
  tout();
}

/* --------------------------------------------------------------- montage */

export function monter(etude) {
  etat.etude = JSON.parse(JSON.stringify(etude));
  assurerDossier();

  $('#p-modele').innerHTML = Object.entries(etat.etude.modeles)
    .map(([cle, m]) => `<option value="${cle}">${m.reference.replace('Hikvision ', '')}</option>`)
    .join('');
  $('#p-coffret').innerHTML = '<option value="">Directement au local</option>'
    + etat.etude.coffrets.map((r) => `<option value="${r.cle}">${r.cle} — ${r.nom}</option>`).join('');

  const change = (sel, applique) => $(sel).addEventListener('change', () => {
    const c = etat.etude.cameras.find((x) => x.cle === etat.selection);
    if (!c) return;
    memoriser();
    applique(c, $(sel));
    tout();
  });
  change('#p-role', (c, n) => { c.role = n.value; });
  change('#p-modele', (c, n) => {
    c.modele = n.value;
    if (!etat.etude.modeles[c.modele].angleHTele) c.tele = false;
  });
  change('#p-tele', (c, n) => { c.tele = n.checked; });
  change('#p-hauteur', (c, n) => { c.hauteur = Number(n.value); });
  change('#p-x', (c, n) => { c.x = Number(n.value); });
  change('#p-y', (c, n) => { c.y = Number(n.value); });
  change('#p-coffret', (c, n) => { c.coffret = n.value || null; });

  // Le curseur d'orientation réagit en continu : on voit le champ tourner.
  $('#p-azimut').addEventListener('input', () => {
    const c = etat.etude.cameras.find((x) => x.cle === etat.selection);
    if (!c) return;
    c.azimut = Number($('#p-azimut').value);
    $('#p-azimut-txt').textContent = `${c.azimut}°`;
    dessinerPlan();
    chiffres();
  });
  $('#p-azimut').addEventListener('change', () => { etat.modifie = true; });

  // --- les photos
  $('#b-photos').addEventListener('click', () => $('#fichier-photos').click());
  $('#fichier-photos').addEventListener('change', async (ev) => {
    if (ev.target.files.length) await ajouterPhotos([...ev.target.files]);
    ev.target.value = '';
  });
  $('#ph-titre').addEventListener('change', () => {
    const p = (etat.etude.photos || []).find((x) => x.cle === etat.photo);
    if (!p) return;
    memoriser(); p.titre = $('#ph-titre').value; listePhotos();
  });
  $('#ph-champ').addEventListener('input', () => {
    const p = (etat.etude.photos || []).find((x) => x.cle === etat.photo);
    if (!p) return;
    p.champ = Number($('#ph-champ').value);
    $('#ph-champ-txt').textContent = `${fr(p.champ)}°`;
    dessinerPhoto(p);
  });
  $('#ph-champ').addEventListener('change', () => { etat.modifie = true; listePhotos(); });
  $('#b-photo-retirer').addEventListener('click', () => {
    if (!etat.photo) return;
    memoriser();
    etat.etude.photos = etat.etude.photos.filter((p) => p.cle !== etat.photo);
    etat.photo = null;
    listePhotos(); panneauPhoto();
  });

  // --- le fond de plan
  $('#b-fond').addEventListener('click', () => $('#fichier-fond').click());
  $('#fichier-fond').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    memoriser();
    const src = await lireImage(f);
    const dim = await new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok({ l: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => ok({ l: 4, h: 3 });
      i.src = src;
    });
    const g = geometrie(etat.etude.site);
    etat.etude.fond = {
      src, x: 0, y: 0, largeur: g.largeur,
      hauteur: (g.largeur * dim.h) / dim.l, opacite: 0.55,
    };
    ev.target.value = '';
    majFond();
    tout();
  });
  $('#f-opacite').addEventListener('input', () => {
    if (!etat.etude.fond) return;
    etat.etude.fond.opacite = Number($('#f-opacite').value) / 100;
    dessinerPlan();
  });
  $('#f-largeur').addEventListener('change', () => {
    if (!etat.etude.fond) return;
    memoriser();
    const f = etat.etude.fond;
    const rapport = f.hauteur / f.largeur;
    f.largeur = Number($('#f-largeur').value);
    f.hauteur = f.largeur * rapport;
    dessinerPlan();
  });
  $('#f-calage').addEventListener('change', () => {
    etat.calage = $('#f-calage').checked;
    $('#plan').classList.toggle('calage', etat.calage);
  });
  $('#b-fond-retirer').addEventListener('click', () => {
    memoriser();
    delete etat.etude.fond;
    majFond();
    tout();
  });

  $('#b-texte').addEventListener('click', ajouterTexte);
  $('#f-saut').addEventListener('change', () => {
    memoriser();
    etat.etude.dossier.sautDePage = $('#f-saut').checked;
  });

  $('#b-ajouter').addEventListener('click', ajouter);
  $('#b-supprimer').addEventListener('click', supprimer);
  $('#b-defaire').addEventListener('click', defaire);
  $('#b-exporter').addEventListener('click', exporter);
  $('#b-fiche').addEventListener('click', produireFiche);
  $('#b-importer').addEventListener('click', () => $('#fichier').click());
  $('#fichier').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      await importer(f);
    } catch (err) {
      $('#alertes').hidden = false;
      $('#alertes').innerHTML = `<b>Fichier refusé.</b> ${err.message}`;
    }
    ev.target.value = '';
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, select, textarea')) return;
    const c = etat.etude.cameras.find((x) => x.cle === etat.selection);
    if ((ev.key === 'z' || ev.key === 'Z') && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault(); defaire(); return;
    }
    if (!c) return;
    const pas = ev.shiftKey ? 5 : 0.5;
    const fleches = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] };
    if (fleches[ev.key]) {
      ev.preventDefault();
      memoriser();
      c.x += fleches[ev.key][0];
      c.y += fleches[ev.key][1];
      tout();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault(); supprimer();
    }
  });

  window.addEventListener('resize', dessinerPlan);
  window.addEventListener('beforeunload', (ev) => {
    if (!etat.modifie) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  brancherSouris();
  tout();
}

/**
 * Démarrage, quelle que soit la façon dont la page est servie.
 *
 * En fichier unique, l'étude est embarquée à la fabrication et posée sur
 * `__etude` : la page s'ouvre d'un double-clic depuis une clé, sans
 * serveur. Servie en dossier, elle va chercher `etude.json` à côté d'elle,
 * ce qui permet de garder les données à jour sans refaire la page.
 */
export async function demarrer() {
  if (globalThis.__etude) { monter(globalThis.__etude); return; }
  try {
    const reponse = await fetch('etude.json');
    if (!reponse.ok) throw new Error(String(reponse.status));
    monter(await reponse.json());
  } catch (err) {
    /*
     * Monter D'ABORD, avertir ensuite : le premier rendu réécrit la zone
     * d'alertes, et un message posé avant lui disparaissait sans trace.
     * Les commandes, elles, doivent rester vivantes — c'est par elles qu'on
     * ouvrira un fichier.
     */
    monter({
      site: { longueurBatiment: 60, profondeurBatiment: 20, marge: 10,
        annexe: { longueur: 0, profondeur: 0 }, cour: { profondeur: 40 } },
      local: { x: 30, y: 14, hauteurChemin: 3 },
      modeles: {},
      equipements: { enregistreur: {} },
      cameras: [], coffrets: [], acces: [],
    });
    const avis = $('#alertes');
    avis.hidden = false;
    avis.innerHTML = '<b>Aucune étude chargée.</b> Le fichier '
      + '<code>etude.json</code> est introuvable à côté de cette page. '
      + 'Ouvrez-en un avec « Ouvrir une étude… ».';
  }
}
