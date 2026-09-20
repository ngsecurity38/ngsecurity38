/**
 * Page de devis client : le visiteur compose lui-même son installation.
 *
 * Elle partage les calculs de l'outil d'étude — dimensionnement du disque,
 * marges, TVA — pour qu'un client et un technicien ne lisent jamais deux
 * chiffres différents du même site.
 *
 * Aucun serveur : les prix viennent de `tarif.json`, posé à côté de la page.
 * C'est le seul fichier à modifier pour mettre un tarif à jour.
 */

import { $ } from './dom.js';
import { fr } from './format.js';
import { TYPES_SITE, RESERVES, composer } from './offre.js';
import { ligne, devis, euros, TVA_DEFAUT, MARGE_COMMERCIALE } from './prix.js';

/**
 * Où la demande d'étude est envoyée.
 *
 * À remplacer par l'adresse de l'agence avant mise en ligne. Laissée vide, le
 * bouton propose simplement d'imprimer : mieux vaut pas de lien qu'un lien
 * vers une adresse qui n'existe pas.
 */
const CONTACT = '';

/** Tarif de repli, celui embarqué à la fabrication du fichier unique. */
const TARIF_EMBARQUE = globalThis.__tarif || null;

const etat = { tarif: null };

/** Charge le tarif : celui posé à côté de la page, sinon celui embarqué. */
async function chargerTarif() {
  /*
   * Depuis le disque, on ne tente même pas.
   *
   * Les navigateurs refusent `fetch` sur `file://`, et le refus s'inscrit dans
   * la console quoi qu'on l'attrape. Sur une page publique, une erreur rouge
   * inquiète sans rien apprendre : mieux vaut aller droit au tarif embarqué.
   */
  if (window.location.protocol !== 'file:') {
    try {
      const reponse = await fetch('tarif.json', { cache: 'no-store' });
      if (reponse.ok) return await reponse.json();
    } catch {
      // Fichier absent à côté de la page : on se rabat sur l'embarqué.
    }
  }
  return TARIF_EMBARQUE;
}

/** Réponses du formulaire. */
const reponses = () => ({
  typeSite: $('#q-type').value,
  zones: parseInt($('#q-zones').value, 10),
  jours: parseInt($('#q-jours').value, 10),
  heuresParJour: parseInt($('#q-heures').value, 10),
  extension: parseInt($('#q-extension').value, 10),
  ecran: $('#q-ecran').checked,
  routeur: $('#q-routeur').checked,
  pose: $('#q-pose').checked,
});

/**
 * Le synoptique, en SVG.
 *
 * Il ne sert pas à décorer : le client comprend d'un coup pourquoi un switch
 * PoE figure au devis — les caméras y sont branchées, et c'est lui qui les
 * alimente. C'est ce que le cahier des charges appelle la pédagogie, et c'est
 * ce qui évite qu'on lui retire la ligne en croyant faire une économie.
 */
/** Échappe le texte : le tarif est un fichier que l'agence édite à la main. */
const ech = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function calculer() {
  const t = etat.tarif;
  if (!t) return;

  const r = reponses();
  const offre = composer(r, t.articles || [], {});
  const marge = t.marge ?? MARGE_COMMERCIALE;
  const tva = t.tva ?? TVA_DEFAUT;

  const lignes = offre.lignes.map((l) => ({
    ...ligne(l.article, l.quantite, { marge, tva }),
    role: l.role,
  }));
  const d = devis(lignes, {
    heures: offre.heures,
    tauxHoraire: t.tauxHoraire ?? 0,
    tva,
  });

  $('#resultat').hidden = false;
  $('#resume').textContent = resume(offre, r);
  $('#manques').innerHTML = offre.manques.length
    ? `<ul class="manques">${offre.manques.map((m) => `<li>${ech(m)}</li>`).join('')}
        <li>Ces éléments seront chiffrés lors de l'étude.</li></ul>`
    : '';

  $('#lignes').innerHTML = lignes.map((l) => `<tr>
      <td><b>${ech(l.role)}</b><br><span class="ref">${ech(l.article.reference)}</span></td>
      <td class="nombre">${l.quantite}</td>
      <td class="nombre">${euros(l.venteHt)}</td>
      <td class="nombre">${euros(l.totalHt)}</td>
    </tr>`).join('')
    + (d.mainOeuvreHt > 0 ? `<tr>
      <td><b>Installation et mise en service</b><br>
        <span class="ref">Pose, raccordement, réglage des caméras, formation</span></td>
      <td class="nombre">${fr(offre.heures, 1)} h</td>
      <td class="nombre">${euros(t.tauxHoraire ?? 0)}</td>
      <td class="nombre">${euros(d.mainOeuvreHt)}</td>
    </tr>` : '');

  $('#totaux').innerHTML = `
    <tr><td colspan="3">Total HT</td><td class="nombre">${euros(d.totalHt)}</td></tr>
    <tr><td colspan="3">TVA ${fr(tva * 100, 1)} %</td>
      <td class="nombre">${euros(d.montantTva)}</td></tr>
    <tr class="fort"><td colspan="3">Total TTC</td>
      <td class="nombre">${euros(d.totalTtc)}</td></tr>`;

  dessinerSchema(offre, r);
  $('#reserves').innerHTML = RESERVES.map((x) => `<li>${ech(x)}</li>`).join('');
  majContact(offre, r, d);
}

/**
 * Le synoptique, en SVG.
 *
 * Il ne sert pas à décorer : le client comprend d'un coup pourquoi un switch
 * PoE figure au devis — les caméras y sont branchées, et c'est lui qui les
 * alimente. C'est ce que le cahier des charges appelle la pédagogie, et c'est
 * ce qui évite qu'on lui retire la ligne en croyant faire une économie.
 */
function dessinerSchema(offre, r) {
  /*
   * La chaîne est dessinée en entier, toujours.
   *
   * Ce schéma explique comment l'installation tient debout ; il ne dresse pas
   * la liste de ce qui est au tarif. Un maillon absent du tarif y figure donc
   * en grisé — sinon le client verrait des caméras reliées à rien et croirait
   * l'architecture incomplète, alors que c'est seulement le tarif qui l'est.
   */
  const presents = new Set(offre.lignes.map((l) => l.role));
  const couleur = (c, role) => (!role || presents.has(role) ? c : '#b6bcc6');

  /*
   * Chaque maillon nomme son parent : le téléphone dépend du routeur, l'écran
   * de l'enregistreur. Relier chaque étage au précédent sans distinguer
   * traçait un lien de l'enregistreur au téléphone, qui n'existe pas.
   */
  const noeuds = [
    { id: 'cam', t: `${offre.cameras} caméra${offre.cameras > 1 ? 's' : ''}`,
      c: '#c8102e', role: 'Caméras', niveau: 0 },
    { id: 'sw', t: 'Switch PoE', c: '#2eae6a', role: 'Switch PoE', niveau: 1, parent: 'cam' },
    { id: 'nvr', t: 'Enregistreur', c: '#c05cc0', role: 'Enregistreur', niveau: 2, parent: 'sw' },
    r.routeur
      ? { id: 'box', t: 'Routeur', c: '#3d8bfd', role: 'Routeur', niveau: 2, parent: 'sw' }
      : null,
    r.ecran
      ? { id: 'ecr', t: 'Écran', c: '#d99b1f', role: 'Écran de supervision', niveau: 3, parent: 'nvr' }
      : null,
    r.routeur
      ? { id: 'tel', t: 'Mon téléphone', c: '#5b6472', niveau: 3, parent: 'box' }
      : null,
  ].filter(Boolean);

  const niveaux = Math.max(...noeuds.map((n) => n.niveau)) + 1;
  const L = 560;
  const hauteurEtage = 74;
  const H = niveaux * hauteurEtage + 8;
  const largeurBoite = 156;
  const hauteurBoite = 40;

  // Position : les maillons d'un même étage se répartissent sur la largeur.
  const place = new Map();
  for (let k = 0; k < niveaux; k += 1) {
    const etage = noeuds.filter((n) => n.niveau === k);
    etage.forEach((n, i) => place.set(n.id, {
      x: (L * (i + 1)) / (etage.length + 1),
      y: 26 + k * hauteurEtage,
    }));
  }

  const traits = noeuds.filter((n) => n.parent && place.has(n.parent)).map((n) => {
    const a = place.get(n.parent);
    const b = place.get(n.id);
    return `<line x1="${a.x}" y1="${a.y + hauteurBoite / 2}" `
      + `x2="${b.x}" y2="${b.y - hauteurBoite / 2}" stroke="#aab1bb" stroke-width="2"/>`;
  }).join('');

  const boites = noeuds.map((n) => {
    const p = place.get(n.id);
    return `<g>
      <rect x="${p.x - largeurBoite / 2}" y="${p.y - hauteurBoite / 2}"
        width="${largeurBoite}" height="${hauteurBoite}" rx="8"
        fill="${couleur(n.c, n.role)}" />
      <text x="${p.x}" y="${p.y + 5}" text-anchor="middle"
        fill="#fff" font-size="15" font-weight="600">${ech(n.t)}</text>
    </g>`;
  }).join('');

  // Un maillon grisé mérite son mot d'explication, sous le schéma.
  const absents = noeuds.filter((n) => n.role && !presents.has(n.role));
  const note = absents.length
    ? `<figcaption class="note-schema">En gris : `
      + `${absents.map((n) => n.t.toLowerCase()).join(', ')} — `
      + `nécessaire${absents.length > 1 ? 's' : ''} à l'installation, `
      + `chiffré${absents.length > 1 ? 's' : ''} lors de l'étude.</figcaption>`
    : '';

  $('#schema').innerHTML = `<svg viewBox="0 0 ${L} ${H}" role="img"
    aria-label="Schéma de raccordement de l'installation proposée">
    ${traits}${boites}
  </svg>${note}`;
}

/** Résumé en français courant, avant le tableau. */
function resume(offre, r) {
  const t = TYPES_SITE[r.typeSite];
  const type = t ? `${t.article} ${t.label.toLowerCase()}` : 'un site';
  const duree = offre.heuresParJour >= 24
    ? `${offre.jours} jours d'enregistrement continu`
    : `${offre.jours} jours d'enregistrement, ${offre.heuresParJour} h par jour`;
  return `Pour ${type} avec ${offre.cameras} caméra${offre.cameras > 1 ? 's' : ''} et `
    + `${duree}, il faut environ ${fr(offre.capaciteGo / 1000, 1)} To de disque.`;
}

/** Prépare la demande d'étude, résumé compris. */
function majContact(offre, r, d) {
  const bouton = $('#btn-contact');
  if (!CONTACT) {
    bouton.hidden = true;
    return;
  }
  const corps = [
    'Bonjour,',
    '',
    'Je souhaite une étude pour l\'installation suivante :',
    `- Type de site : ${TYPES_SITE[r.typeSite]?.label || r.typeSite}`,
    `- Zones à couvrir : ${offre.cameras}`,
    `- Conservation : ${offre.jours} jours, ${offre.heuresParJour} h/24`,
    `- Extension prévue : ${offre.prevues - offre.cameras} caméra(s)`,
    `- Câble estimé : ${offre.metresCable} m`,
    `- Écran de supervision : ${r.ecran ? 'oui' : 'non'}`,
    `- Installation par vos soins : ${r.pose ? 'oui' : 'non'}`,
    '',
    `Estimation obtenue sur votre site : ${euros(d.totalTtc)} TTC.`,
    '',
    'Mes coordonnées :',
    'Nom :',
    'Adresse du site :',
    'Téléphone :',
  ].join('\n');
  bouton.href = `mailto:${CONTACT}`
    + `?subject=${encodeURIComponent('Demande d\'étude vidéosurveillance')}`
    + `&body=${encodeURIComponent(corps)}`;
  bouton.hidden = false;
}

async function demarrer() {
  $('#q-type').innerHTML = Object.entries(TYPES_SITE)
    .map(([cle, t]) => `<option value="${cle}">${ech(t.label)}</option>`).join('');

  // Changer de type de site propose les valeurs habituelles de ce type, que le
  // visiteur reste libre de corriger.
  $('#q-type').addEventListener('change', () => {
    const t = TYPES_SITE[$('#q-type').value];
    if (t) {
      $('#q-zones').value = t.zones;
      $('#q-jours').value = t.jours;
    }
    calculer();
  });

  ['#q-zones', '#q-jours', '#q-heures', '#q-extension', '#q-ecran', '#q-routeur', '#q-pose']
    .forEach((id) => {
      $(id).addEventListener('change', calculer);
      $(id).addEventListener('input', calculer);
    });

  $('#btn-imprimer').addEventListener('click', () => window.print());

  etat.tarif = await chargerTarif();
  if (!etat.tarif) {
    $('#resultat').hidden = false;
    $('#resume').textContent = 'Tarif indisponible : le fichier tarif.json n\'a pas pu '
      + 'être chargé. Contactez-nous, nous établirons l\'étude directement.';
    return;
  }
  $('#bandeau-exemple').hidden = !etat.tarif.exemple;
  calculer();
}

demarrer();
