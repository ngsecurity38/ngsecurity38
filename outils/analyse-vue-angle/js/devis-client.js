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

import { $, $$ } from './dom.js';
import { fr, elider } from './format.js';
import { SEUILS_DORI } from './optique.js';
import { TYPES_SITE, RESERVES, composer } from './offre.js';
import { ligne, devis, euros, TVA_DEFAUT, MARGE_COMMERCIALE } from './prix.js';
import {
  etatPhotos, zoneCourante, reduire, mesureZone, couvertureReelle, niveauAtteint,
  porteeNiveau, position, dessiner, priseSous, transformer, appareilsClient,
} from './photo-client.js';

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
  // Une photo étudiée vaut mieux qu'un nombre déclaré : quand le visiteur en a
  // posé, ce sont elles qui commandent le nombre de caméras.
  const parPhotos = etatPhotos.zones.filter((z) => mesureZone(z)).length;
  const offre = composer(parPhotos ? { ...r, zones: parPhotos } : r, t.articles || [], {});
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
  majRecapPhotos();
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
    ...lignesEtude(),
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

/* ===================================================== étude par photo */

/** Une zone vierge, prête à recevoir ses repères. */
const nouvelleZone = (nom, dataUrl, img) => ({
  nom,
  dataUrl,
  img,
  image: { largeur: img.naturalWidth, hauteur: img.naturalHeight },
  hauteur: 3,
  appareil: appareilsClient()[0],
  d1: 10,
  d2: 25,
  r1: null,
  r2: null,
  zone: null,
});

/** Ajoute des photos, réduites, et ouvre la dernière. */
async function ajouterPhotos(fichiers) {
  for (const f of fichiers) {
    if (!f.type.startsWith('image/')) continue;
    const brut = await new Promise((ok) => {
      const l = new FileReader();
      l.onload = () => ok(l.result);
      l.readAsDataURL(f);
    });
    const dataUrl = await reduire(brut);
    const img = await new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.src = dataUrl;
    });
    etatPhotos.zones.push(nouvelleZone(`Zone ${etatPhotos.zones.length + 1}`, dataUrl, img));
  }
  etatPhotos.courante = etatPhotos.zones.length - 1;
  etatPhotos.etape = 'r1';
  majPhotos();
}

/** Consigne du moment : dire quoi faire vaut mieux que laisser chercher. */
function consignePhoto(z) {
  if (!z.r1) return 'Cliquez sur la photo un point dont vous connaissez la distance — '
    + 'le bas d\'un portail, un angle de mur, une place de parking.';
  if (etatPhotos.etape === 'r2' && !z.r2) {
    return 'Cliquez un second point, plus loin et plus haut dans la photo. '
      + 'L\'angle de vue sera alors mesuré et non supposé.';
  }
  if (!z.zone) return 'Entourez maintenant la zone que vous voulez surveiller, '
    + 'en faisant glisser votre doigt ou la souris.';
  return 'Ajustez la zone en la déplaçant ou en tirant ses coins : tout se recalcule.';
}

/** Vignettes, toile, consigne et résultat de la zone ouverte. */
function majPhotos() {
  const z = zoneCourante();

  $('#vignettes').innerHTML = etatPhotos.zones.map((x, i) => `
    <button type="button" class="vignette${i === etatPhotos.courante ? ' actif' : ''}"
      data-zone="${i}">
      <img src="${x.dataUrl}" alt="">
      <span>${ech(x.nom)}</span>
    </button>`).join('');
  $$('#vignettes [data-zone]').forEach((b) => b.addEventListener('click', () => {
    etatPhotos.courante = Number(b.dataset.zone);
    etatPhotos.etape = zoneCourante()?.zone ? null : 'r1';
    majPhotos();
  }));

  $('#etude-photo').hidden = !z;
  if (!z) { calculer(); return; }

  $('#p-hauteur').value = z.hauteur;
  $('#p-d1').value = z.d1;
  $('#p-d2').value = z.d2;
  $('#p-appareil').value = z.appareil;
  $('#photo-consigne').textContent = consignePhoto(z);
  $$('[data-etape]').forEach((b) => b.classList.toggle('actif', b.dataset.etape === etatPhotos.etape));

  dessiner($('#toile-photo'), z);
  majResultatPhoto(z);
  calculer();
}

/** Ce que la zone entourée demande, et la caméra du tarif qui y répond. */
function majResultatPhoto(z) {
  const m = mesureZone(z);
  if (!m) { $('#photo-resultat').innerHTML = ''; return; }

  const propose = cameraPour(m);
  const niveau = niveauAtteint(propose?.couv.densite || 0);

  $('#photo-resultat').innerHTML = `<div class="mesures-client">
      ${tuile('Angle de vue nécessaire', `${fr(m.angleRequis)} °`)}
      ${tuile('Zone la plus éloignée', `${fr(m.distanceMax)} m`)}
      ${tuile('Largeur à couvrir', `${fr(m.largeur)} m`)}
      ${tuile('Champ de la photo', `${fr(m.prise.angleH)} °`,
    m.prise.mesure ? 'mesuré sur vos deux repères' : 'supposé d\'après l\'appareil')}
    </div>
    ${conseil(m, propose, niveau)}`;
}

const tuile = (cle, valeur, note = '') => `<div class="tuile">
  <span class="cle">${ech(cle)}</span><span class="val">${ech(valeur)}</span>
  ${note ? `<span class="note-tuile">${ech(note)}</span>` : ''}</div>`;

/**
 * Ce que la caméra retenue donnera sur cette zone, en français courant.
 *
 * Tout y est dit de la caméra réelle : son champ est rarement celui qu'on
 * demande, et c'est ce champ-là qui décide du nombre de pixels au mètre.
 */
function conseil(m, propose, niveau) {
  if (!propose) {
    return `<p class="conseil-client">Aucune caméra du tarif ne porte ses
      caractéristiques optiques : le modèle sera arrêté lors de l'étude.</p>`;
  }
  const { camera, couv } = propose;

  if (couv.serre) {
    return `<p class="conseil-client">Cette zone demande ${fr(m.angleRequis)} °
      de champ. La caméra la plus ouverte du tarif
      (<b>${ech(camera.reference)}</b>) n'en couvre que ${fr(couv.angle)} ° :
      il en faudra <b>deux</b> pour la voir entière, ou resserrer la zone.</p>`;
  }

  const cadrage = couv.ecart > 8
    ? ` Son champ de ${fr(couv.angle)} ° dépasse les ${fr(m.angleRequis)} °
      demandés : vous verrez un peu plus large que la zone entourée.`
    : '';

  const suite = niveau.verbe
    ? `Elle permet d'y <b>${ech(niveau.verbe)}</b> jusqu'au fond,
       soit ${fr(niveau.densite, 0)} pixels par mètre.
       ${porteesLisibles(camera.resH || 0, couv, niveau)}`
    : `La zone reste cependant trop large pour être exploitable
       (${fr(niveau.densite, 0)} pixels par mètre) : resserrez-la,
       ou prévoyez deux caméras.`;

  return `<p class="conseil-client">
    <b>${ech(camera.reference)}</b> convient à cette zone.${cadrage} ${suite}</p>`;
}

/**
 * Ce que l'image permet de plus, plus près.
 *
 * Un niveau plus fin exige plus de pixels au mètre, donc se tient à distance
 * plus courte — jamais plus loin. On n'énumère que les niveaux au-dessus de
 * celui déjà tenu au fond de zone : redire celui-là ferait croire à une
 * limite supplémentaire.
 */
function porteesLisibles(resolutionH, couv, niveau) {
  const atteint = niveau.cle ? SEUILS_DORI[niveau.cle].ppm : 0;
  const lignes = [
    ['reconnaître une personne déjà connue', 'reconnaissance'],
    ['identifier un inconnu', 'identification'],
  ].filter(([, cle]) => SEUILS_DORI[cle].ppm > atteint).map(([texte, cle]) => {
    const d = porteeNiveau(couv, resolutionH, cle);
    return d > 0 ? `${texte} jusqu'à ${fr(d)} m` : null;
  }).filter(Boolean);
  return lignes.length
    ? `Plus près, elle permet encore ${lignes.map(elider).join(', et ')}.`
    : '';
}

/**
 * La caméra du tarif qui couvre le mieux la zone, et ce qu'elle y donnera.
 *
 * On écarte d'abord celles dont le champ est trop étroit : elles laisseraient
 * un morceau de la zone dehors. Parmi les autres, la plus serrée l'emporte —
 * c'est elle qui pose le plus de pixels sur la zone.
 *
 * Faute d'optique renseignée au tarif, on ne désigne personne : proposer un
 * modèle au hasard parce qu'il est le moins cher tromperait le client sur le
 * seul point qui compte ici.
 */
function cameraPour(m) {
  const candidats = (etat.tarif?.articles || [])
    .filter((a) => a.type === 'camera')
    .map((camera) => ({ camera, couv: couvertureReelle(m, camera) }))
    .filter((x) => x.couv);
  if (!candidats.length) return null;

  const large = candidats.filter((x) => !x.couv.serre);
  // Aucune ne couvre la zone entière : on garde la plus large, et on le dit.
  const choix = large.length ? large : candidats;
  return choix.reduce((meilleur, x) => (x.couv.angle < meilleur.couv.angle ? x : meilleur));
}

/**
 * Ce qu'une zone photographiée a donné : mesure, caméra retenue, niveau.
 *
 * Une seule fonction pour l'écran, le récapitulatif imprimé et le courriel :
 * trois endroits qui ne doivent jamais raconter trois choses différentes.
 */
function syntheseZone(z) {
  const m = mesureZone(z);
  if (!m) return null;
  const propose = cameraPour(m);
  return { m, propose, niveau: niveauAtteint(propose?.couv.densite || 0) };
}

/** Les zones mesurées, avec leur synthèse. */
const zonesMesurees = () => etatPhotos.zones
  .map((z) => ({ z, s: syntheseZone(z) }))
  .filter((x) => x.s);

/**
 * Récapitulatif photo par photo, sous le résumé.
 *
 * Sur la page, seule la zone ouverte est visible ; à l'impression, aucune ne
 * le serait. C'est pourtant ce récapitulatif que le client garde, et qui nous
 * revient en PDF ou en pièce jointe.
 */
function majRecapPhotos() {
  const mesurees = zonesMesurees();
  if (!mesurees.length) { $('#recap-photos').innerHTML = ''; return; }

  const toile = document.createElement('canvas');
  $('#recap-photos').innerHTML = mesurees.map(({ z, s }) => {
    dessiner(toile, z);
    const { m, propose, niveau } = s;
    const camera = propose && !propose.couv.serre && niveau.verbe
      ? `${ech(propose.camera.reference)} — ${ech(niveau.label.toLowerCase())}, `
        + `${fr(niveau.densite, 0)} pixels par mètre`
      : 'modèle à arrêter lors de l\'étude';
    return `<figure class="zone-recap">
      <img src="${toile.toDataURL('image/jpeg', 0.75)}" alt="${ech(z.nom)}">
      <figcaption>
        <b>${ech(z.nom)}</b> — ${fr(m.angleRequis)} ° de champ,
        jusqu'à ${fr(m.distanceMax)} m, ${fr(m.largeur)} m de large.
        <span class="note-tuile">Champ de la photo ${fr(m.prise.angleH)} °,
          ${m.prise.mesure ? 'mesuré sur deux repères' : 'supposé d\'après l\'appareil'}
          — caméra à ${fr(z.hauteur)} m.</span>
        <span class="note-tuile">${camera}</span>
      </figcaption>
    </figure>`;
  }).join('');
}

/** Les zones étudiées, en texte, pour la demande d'étude. */
function lignesEtude() {
  const mesurees = zonesMesurees();
  if (!mesurees.length) return [];
  return [
    '',
    'Zones étudiées depuis mes photos :',
    ...mesurees.map(({ z, s }) => {
      const { m, propose, niveau } = s;
      const camera = propose && !propose.couv.serre && niveau.verbe
        ? `${propose.camera.reference} (${niveau.label.toLowerCase()}, `
          + `${fr(niveau.densite, 0)} px/m)`
        : 'modèle à arrêter';
      return `- ${z.nom} : ${fr(m.angleRequis)} ° de champ, fond à `
        + `${fr(m.distanceMax)} m, ${fr(m.largeur)} m de large, caméra à `
        + `${fr(z.hauteur)} m — ${camera}. Champ de la photo `
        + `${m.prise.mesure ? 'mesuré sur deux repères' : 'supposé d\'après l\'appareil'}.`;
    }),
    '',
    'J\'ai enregistré mon projet depuis la page : le fichier .json joint '
      + 'contient mes photos, mes repères et mes zones.',
  ];
}

/* --------------------------------------------------------- interactions */

function brancherPhotos() {
  const zone = $('#depot-photo');
  const entree = $('#fichier-photo');
  zone.addEventListener('click', () => entree.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entree.click(); }
  });
  entree.addEventListener('change', () => {
    if (entree.files.length) ajouterPhotos([...entree.files]);
    entree.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('survol');
  }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('survol')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) ajouterPhotos([...e.dataTransfer.files]);
  });

  $('#p-appareil').innerHTML = appareilsClient()
    .map((a) => `<option value="${ech(a)}">${ech(a)}</option>`).join('');

  for (const [id, champ] of [['#p-hauteur', 'hauteur'], ['#p-d1', 'd1'],
    ['#p-d2', 'd2'], ['#p-appareil', 'appareil']]) {
    $(id).addEventListener('change', () => {
      const z = zoneCourante();
      if (!z) return;
      z[champ] = champ === 'appareil' ? $(id).value : parseFloat($(id).value) || 0;
      majPhotos();
    });
  }

  $$('[data-etape]').forEach((b) => b.addEventListener('click', () => {
    etatPhotos.etape = b.dataset.etape;
    if (b.dataset.etape === 'zone' && zoneCourante()) zoneCourante().zone = null;
    majPhotos();
  }));

  $('#photo-supprimer').addEventListener('click', () => {
    if (etatPhotos.courante < 0) return;
    etatPhotos.zones.splice(etatPhotos.courante, 1);
    etatPhotos.courante = Math.min(etatPhotos.courante, etatPhotos.zones.length - 1);
    majPhotos();
  });

  brancherToile();
}

function brancherToile() {
  const toile = $('#toile-photo');
  let trace = null;

  toile.addEventListener('pointerdown', (e) => {
    const z = zoneCourante();
    if (!z) return;
    const p = position(e, toile);

    if (etatPhotos.etape === 'r1' || (etatPhotos.etape === 'r2')) {
      z[etatPhotos.etape === 'r1' ? 'r1' : 'r2'] = { u: p.u, v: p.v };
      etatPhotos.etape = etatPhotos.etape === 'r1' ? 'r2' : (z.zone ? null : 'zone');
      majPhotos();
      return;
    }

    // Hors étape de repère, on trace ou l'on manipule la zone.
    const prise = etatPhotos.etape === 'zone' ? null : priseSous(p, z, toile.width);
    if (prise) {
      etatPhotos.glisse = { prise, depart: p, origine: { ...z.zone } };
    } else {
      trace = p;
      z.zone = { u1: p.u, v1: p.v, u2: p.u, v2: p.v };
    }
    toile.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  toile.addEventListener('pointermove', (e) => {
    const z = zoneCourante();
    if (!z) return;
    const p = position(e, toile);
    if (trace) {
      z.zone = { u1: trace.u, v1: trace.v, u2: p.u, v2: p.v };
      dessiner(toile, z);
    } else if (etatPhotos.glisse) {
      z.zone = transformer({ zone: etatPhotos.glisse.origine },
        etatPhotos.glisse.prise, etatPhotos.glisse.depart, p);
      dessiner(toile, z);
    } else if (etatPhotos.etape !== 'r1' && etatPhotos.etape !== 'r2') {
      toile.style.cursor = priseSous(p, z, toile.width) ? 'move' : 'crosshair';
    }
  });

  const relacher = () => {
    if (!trace && !etatPhotos.glisse) return;
    trace = null;
    etatPhotos.glisse = null;
    etatPhotos.etape = null;
    majPhotos();
  };
  toile.addEventListener('pointerup', relacher);
  toile.addEventListener('pointercancel', relacher);
}

/* ------------------------------------------------- enregistrer / reprendre */

const CLE_LOCALE = 'ngsecurity-devis-client';

/** Le projet, sans les images décodées — elles se rechargent à l'ouverture. */
function projet() {
  return {
    type: 'ng-devis-client',
    version: 1,
    enregistreLe: new Date().toISOString(),
    reponses: reponses(),
    zones: etatPhotos.zones.map((z) => ({ ...z, img: undefined })),
  };
}

function enregistrerProjet() {
  const contenu = projet();
  const blob = new Blob([JSON.stringify(contenu)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mon-projet-videosurveillance.json';
  a.click();
  URL.revokeObjectURL(a.href);
  memoriser();
}

/**
 * Mémorise le projet sur l'appareil du visiteur.
 *
 * Rien ne part ailleurs : ni serveur, ni compte. Le rangement peut échouer —
 * navigation privée, quota atteint, photos volumineuses — et ce n'est pas une
 * raison de casser la page.
 */
function memoriser() {
  try {
    window.localStorage.setItem(CLE_LOCALE, JSON.stringify(projet()));
  } catch {
    // Tant pis : le visiteur garde son fichier enregistré.
  }
}

async function restaurer(contenu) {
  if (!contenu || contenu.type !== 'ng-devis-client') return false;
  etatPhotos.zones = [];
  for (const z of contenu.zones || []) {
    if (!z.dataUrl) continue;
    const img = await new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.src = z.dataUrl;
    });
    etatPhotos.zones.push({ ...z, img });
  }
  etatPhotos.courante = etatPhotos.zones.length - 1;

  const r = contenu.reponses || {};
  for (const [id, cle] of [['#q-type', 'typeSite'], ['#q-zones', 'zones'],
    ['#q-jours', 'jours'], ['#q-heures', 'heuresParJour'], ['#q-extension', 'extension']]) {
    if (r[cle] !== undefined) $(id).value = r[cle];
  }
  for (const [id, cle] of [['#q-ecran', 'ecran'], ['#q-routeur', 'routeur'], ['#q-pose', 'pose']]) {
    if (r[cle] !== undefined) $(id).checked = !!r[cle];
  }
  majPhotos();
  return true;
}

function brancherProjet() {
  $('#btn-enregistrer').addEventListener('click', enregistrerProjet);
  $('#btn-reprendre').addEventListener('click', () => $('#fichier-projet').click());
  $('#fichier-projet').addEventListener('change', async () => {
    const f = $('#fichier-projet').files[0];
    if (!f) return;
    try {
      const ok = await restaurer(JSON.parse(await f.text()));
      if (!ok) window.alert('Ce fichier n\'est pas un projet enregistré ici.');
    } catch {
      window.alert('Fichier illisible.');
    }
    $('#fichier-projet').value = '';
  });

  try {
    const garde = window.localStorage.getItem(CLE_LOCALE);
    if (garde) restaurer(JSON.parse(garde));
  } catch {
    // Rien de mémorisé, ou rangement inaccessible : on démarre à vide.
  }
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
  brancherPhotos();
  brancherProjet();

  // Chaque réponse et chaque tracé sont mémorisés sur l'appareil du visiteur :
  // revenir sur la page ne doit pas effacer un quart d'heure de travail.
  document.addEventListener('change', memoriser);

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
