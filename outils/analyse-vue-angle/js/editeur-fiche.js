/**
 * Le dossier client, produit depuis l'éditeur.
 *
 * L'agence modifie l'étude sur son ordinateur, puis clique ici : il en sort
 * un fichier HTML autonome — plan, photos, tableaux, réserves — qui s'ouvre
 * dans n'importe quel navigateur, s'enregistre en PDF d'un bouton, et part
 * par courriel tel quel. Rien à installer, rien à commander en ligne.
 *
 * Autonome veut dire sans aucun lien vers l'extérieur : les images sont
 * dedans, le style est dedans. Un dossier qui irait chercher une image sur
 * un serveur s'afficherait vide chez le client le jour où le serveur
 * tombe — ou révélerait, par la requête, qu'il vient d'être ouvert.
 *
 * L'ordre des chapitres, leur intitulé, ceux qu'on écarte et les textes que
 * l'agence ajoute elle-même sont dans `etude.dossier`. Le dossier n'est donc
 * pas une sortie figée : c'est une mise en page que l'agence arrête.
 */

import { fr, frGroupe, echapper } from './format.js';
import { reglagesPdf, MARGES, pdfParDefaut } from './papier.js';
import { synoptique } from './synoptique.js';
import { bordereau } from './devis-etude.js';
import { tablesDevis, bandeauDevis, totauxHtml } from './devis-fiche.js';
import {
  bilanEtude, optiqueUtile, bandePhoto, porteesDori,
} from './etude-plan.js';
import { LIAISON_PERMANENTE } from './cable.js';

/** Un texte libre devient des paragraphes : une ligne vide sépare, une seule revient. */
const paragraphes = (t) => String(t ?? '')
  .split(/\n{2,}/)
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => `<p>${echapper(p).replace(/\n/g, '<br>')}</p>`)
  .join('');

/** Les chapitres que le dossier sait écrire tout seul, dans leur ordre naturel. */
export const SECTIONS_STANDARD = [
  { cle: 'chiffres', titre: 'Ce que l\'installation compte' },
  { cle: 'cameras', titre: 'Les caméras' },
  { cle: 'fiches', titre: 'Fiche technique des caméras' },
  { cle: 'plan', titre: 'Le plan d\'implantation' },
  { cle: 'synoptique', titre: 'Le synoptique de raccordement' },
  { cle: 'vues', titre: 'Le site, vue par vue' },
  { cle: 'cablage', titre: 'Câblage' },
  { cle: 'archive', titre: 'La profondeur d\'archive' },
  { cle: 'devis', titre: 'Le chiffrage' },
  { cle: 'garantie', titre: 'Garantie, maintenance et suivi' },
  { cle: 'reserves', titre: 'Réserves' },
];

export const dossierParDefaut = () => ({
  sautDePage: false,
  pdf: pdfParDefaut(),
  sections: SECTIONS_STANDARD.map((s) => ({ ...s, visible: true })),
});

/**
 * La liste des chapitres telle qu'on va l'écrire.
 *
 * Une étude enregistrée avant qu'un chapitre n'existe ne le connaît pas : on
 * l'ajoute à la fin plutôt que de perdre l'ordre choisi par l'agence. Et une
 * clé inconnue qui n'est pas un texte libre est écartée — sans quoi un
 * fichier bricolé ferait un trou dans le dossier.
 */
export function sectionsDuDossier(etude) {
  const d = etude.dossier;
  if (!d || !Array.isArray(d.sections) || !d.sections.length) return dossierParDefaut().sections;
  const connues = new Set(SECTIONS_STANDARD.map((s) => s.cle));
  const gardees = d.sections.filter((s) => s.type === 'texte' || connues.has(s.cle));
  const presentes = new Set(gardees.map((s) => s.cle));
  const manquantes = SECTIONS_STANDARD
    .filter((s) => !presentes.has(s.cle))
    .map((s) => ({ ...s, visible: true }));
  return [...gardees, ...manquantes];
}

const STYLE = (papier) => `
:root { --rouge:#c8102e; --encre:#1a1d23; --doux:#5b6472; --bord:#dde1e7; --fond:#f6f7f9; }
* { box-sizing:border-box; }
body { margin:0; background:var(--fond); color:var(--encre);
  font:15px/1.62 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.feuille { max-width:900px; margin:0 auto; background:#fff; padding:34px 40px 48px;
  border:1px solid var(--bord); }
.garde { border-bottom:3px solid var(--rouge); padding-bottom:18px; margin-bottom:26px; }
.bandeau { display:flex; gap:18px; align-items:flex-start; }
.bandeau img { width:96px; height:auto; }
.coord { font-size:13.5px; color:var(--doux); line-height:1.5; }
.coord .nom { font-size:19px; font-weight:800; color:var(--encre); margin:0 0 3px; }
.coord p { margin:0; }
.surtitre { color:var(--rouge); font-weight:700; letter-spacing:.1em; font-size:12px;
  margin:22px 0 6px; }
h1 { font-size:30px; margin:0 0 8px; }
h2 { font-size:19px; margin:34px 0 10px; padding-bottom:6px;
  border-bottom:2px solid var(--rouge); }
h3 { font-size:15.5px; margin:22px 0 8px; }
table { border-collapse:collapse; width:100%; font-size:14px; margin:10px 0; }
th, td { text-align:left; padding:7px 9px; border-bottom:1px solid var(--bord); }
th { font-size:11.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--doux); }
td.n, th.n { text-align:right; }
.fort { color:var(--rouge); font-weight:700; }
.meta p { margin:3px 0; font-size:14px; }
.point { border-left:3px solid var(--rouge); padding:2px 0 2px 16px; margin:16px 0; }
/* En grille, jamais en flex : cinq cases « flex:1 1 130px » tiennent sur une
   ligne au calcul, puis refusent de descendre sous leur contenu — et la
   cinquième sortait de la feuille A4 à l'impression. La grille, elle, replie. */
.chiffres { display:grid; grid-template-columns:repeat(auto-fit, minmax(128px, 1fr));
  gap:1px; background:var(--bord); border:1px solid var(--bord); margin:12px 0; }
.chiffres div { background:#fff; padding:9px 14px; min-width:0; }
.chiffres span { display:block; font-size:11.5px; color:var(--doux); }
.chiffres b { font-size:19px; }
figure { margin:14px 0 20px; }
figure svg, figure img { max-width:100%; height:auto; border:1px solid var(--bord);
  border-radius:8px; }
figcaption { font-size:13px; color:var(--doux); margin-top:6px; }
.report { position:relative; line-height:0; border-radius:8px; overflow:hidden;
  border:1px solid var(--bord); }
.report img { width:100%; display:block; }
.report .champ { position:absolute; top:0; bottom:0; background:rgba(200,16,46,.24);
  border-left:2px solid var(--rouge); border-right:2px solid var(--rouge); }
.report .champ.large { background:none; }
.report .champ span { position:absolute; top:5px; left:5px; font-size:11px;
  background:var(--rouge); color:#fff; padding:1px 6px; border-radius:3px;
  line-height:1.4; white-space:nowrap; }
ul.liste li { margin-bottom:7px; }
ul.contenu { margin:6px 0 2px; padding-left:18px; font-size:12px; }
ul.contenu li { margin-bottom:3px; }
.libre p { margin:10px 0; }
.archives { display:flex; gap:14px; flex-wrap:wrap; margin:12px 0; }
.archive { flex:1 1 240px; border:1px solid var(--bord); border-radius:10px;
  padding:12px 16px; }
.archive.retenu { border-color:var(--rouge); border-width:2px; }
.archive .surtitre { margin:0 0 4px; font-size:11px; }
.archive h3 { margin:0 0 6px; font-size:16px; }
.archive p { margin:0; font-size:13.5px; }
.modele { display:flex; gap:18px; align-items:flex-start; border:1px solid var(--bord);
  border-radius:10px; padding:14px 16px; margin:14px 0; }
.modele img { flex:0 0 168px; width:168px; height:auto; border-radius:8px;
  background:var(--fond); }
.modele-txt { flex:1 1 auto; min-width:0; }
.modele h3 { margin:0 0 4px; }
table.specs { margin:8px 0 0; font-size:13.5px; }
table.specs th { text-transform:none; letter-spacing:0; font-size:13px;
  width:200px; color:var(--doux); font-weight:600; vertical-align:top; }
figure.large svg { width:100%; }
/* Le chiffrage repris du devis : mêmes tableaux, donc mêmes règles. Les
   largeurs sont posées sur la classe et non sur tous les tableaux, sans
   quoi celui des caméras s'y plierait aussi. */
.chiffrage th:nth-child(2), .chiffrage td:nth-child(2) { width:58px; }
.chiffrage th:nth-child(3), .chiffrage td:nth-child(3) { width:62px; }
.chiffrage th:nth-child(4), .chiffrage td:nth-child(4) { width:94px; }
.chiffrage th:nth-child(5), .chiffrage td:nth-child(5) { width:100px; }
.chiffrage h3 { margin-top:20px; }
tr.option td { color:var(--doux); }
.marque-option { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em;
  color:var(--rouge); font-weight:700; }
.det { display:block; font-size:11.5px; color:var(--doux); margin-top:2px; }
.sous-total td { border-top:2px solid var(--encre); border-bottom:0;
  font-weight:700; font-size:14px; }
.avis { background:#fff4f5; border:1px solid #f0c8ce; border-left:4px solid var(--rouge);
  border-radius:6px; padding:11px 14px; margin:16px 0; font-size:13.5px; color:#7a0a1c; }
.total { margin:20px 0 0; border:1px solid var(--bord); border-radius:8px; overflow:hidden; }
.total div { display:flex; justify-content:space-between; padding:9px 14px;
  border-bottom:1px solid var(--bord); font-size:14px; }
.total div:last-child { border-bottom:0; background:var(--encre); color:#fff;
  font-size:17px; font-weight:800; }
.pied { color:var(--doux); font-size:13px; text-align:center; padding:22px 0 0;
  border-top:1px solid var(--bord); margin-top:34px; }
.pdf { position:fixed; right:20px; bottom:20px; z-index:9;
  background:var(--rouge); color:#fff; border:0; border-radius:999px;
  padding:13px 22px; font:600 15px/1 inherit; cursor:pointer;
  box-shadow:0 6px 20px rgba(0,0,0,.25); }
.pdf:hover { background:#a50d26; }
.pdf small { display:block; font-weight:400; font-size:11.5px; opacity:.85;
  margin-top:4px; }

/* Le PDF se fait par l'impression du navigateur : c'est le seul chemin qui
   ne demande ni logiciel ni connexion. Reste à ce que les pages tombent
   juste — un titre ne se sépare pas de son tableau, une photo ne se coupe
   pas en deux. */
@page { size:${papier.taille}; margin:${papier.marge}; }
@media print {
  body { background:#fff; font-size:11.5pt; }
  .feuille { border:0; max-width:none; padding:0; }
  .pdf { display:none; }
  h1 { font-size:22pt; }
  h2 { font-size:14pt; margin-top:20px; break-after:avoid; page-break-after:avoid; }
  h3 { break-after:avoid; page-break-after:avoid; }
  .modele, .archive { break-inside:avoid; page-break-inside:avoid; }
  figure, .report, .chiffres, .point, table, li, tr, .libre p {
    break-inside:avoid; page-break-inside:avoid; }
  /* Sauf les tableaux du chiffrage : sept lots insécables laissaient une
     demi-page blanche à chaque fois. Ils se coupent, mais jamais au milieu
     d'une ligne, et l'en-tête se répète en haut de page. */
  .chiffrage table { break-inside:auto; page-break-inside:auto; }
  .chiffrage thead { display:table-header-group; }
  figure img, .report img, figure svg { max-height:170mm; }
  .chiffres { grid-template-columns:repeat(auto-fit, minmax(112px, 1fr)); }
  .chiffres b { font-size:13pt; }
  .saut { break-before:page; page-break-before:always; }
  /* Le pied repartait seul sur une page, sous une page vide. Serré, il
     remonte avec le dernier chapitre. */
  .pied { position:relative; margin-top:16px; padding-top:12px;
    break-before:avoid; page-break-before:avoid; }
}`;

/**
 * Les deux profondeurs d'archive proposées.
 *
 * Quinze jours couvrent le délai courant entre un fait et sa réquisition.
 * Trente est le plafond que la loi autorise sans justification. La machine
 * a deux baies : la première suffit à quinze jours, la seconde se pose plus
 * tard sans rien changer d'autre. C'est une option, pas un chantier.
 */
function archive(etude, b) {
  const st = etude.stockage || {};
  const longue = st.variante && st.variante !== b.jours ? st.variante : null;
  const bl = longue ? bilanEtude(etude, { jours: longue }) : null;
  const carte = (jours, bil, retenu) => {
    const d = bil.disques && bil.disques.pool;
    return `<div class="archive ${retenu ? 'retenu' : ''}">
      <p class="surtitre">${retenu ? 'RETENU' : 'EN OPTION'}</p>
      <h3>${jours} jours d'enregistrement continu</h3>
      <p><b>${echapper(fr(bil.capaciteGo / 1000))} To</b> d'images à conserver.
        ${d ? `${d.nombre} disque${d.nombre > 1 ? 's' : ''} de ${d.unitaire} To
soit ${d.total} To installés sur les ${bil.disques.baies} baies
          du serveur.` : 'Aucune configuration de disque ne couvre ce besoin.'}</p>
    </div>`;
  };
  return `<div class="archives">
    ${carte(b.jours, b, true)}
    ${bl ? carte(longue, bl, false) : ''}
  </div>
  ${st.raison ? `<p class="point">${echapper(st.raison)}</p>` : ''}
  <p class="det">Les deux chiffres valent pour ${b.cameras} caméras
    enregistrant en continu, 24 heures sur 24, à ${echapper(fr(b.debitTotal))} Mbit/s
    cumulés. L'enregistrement sur détection, que ces caméras savent faire,
    allonge l'archive dans les mêmes disques.</p>`;
}

/**
 * La fiche technique des modèles posés.
 *
 * Un modèle n'y figure que s'il est au plan : une fiche pour une caméra
 * qu'on ne pose pas fait un dossier plus épais, pas plus vrai. Les angles
 * sont ceux retenus dans l'étude, réglage téléobjectif compris — pas les
 * angles du catalogue.
 */
function fiches(etude) {
  const poses = [...new Set(etude.cameras.map((c) => c.modele))];
  return poses.map((cle) => {
    const m = etude.modeles[cle];
    if (!m) return '';
    const sur = etude.cameras.filter((c) => c.modele === cle);
    const tele = sur.some((c) => c.tele);
    const p = porteesDori(m, false);
    const pt = m.angleHTele ? porteesDori(m, true) : null;
    const ligne = (t, v) => (v ? `<tr><th>${echapper(t)}</th><td>${v}</td></tr>` : '');
    return `<div class="modele">
      ${m.src ? `<img src="${m.src}" alt="${echapper(m.reference)}">` : ''}
      <div class="modele-txt">
        <h3>${echapper(m.reference)}</h3>
        <p class="det">${echapper(m.type || '')}. ${sur.length} exemplaire(s) au plan :
          ${echapper(sur.map((c) => c.cle).join(', '))}.</p>
        <table class="specs">
          ${ligne('Définition', `${m.resH} × ${m.resV} px`)}
          ${ligne('Champ horizontal retenu', m.angleHTele
    ? `${echapper(fr(m.angleH))}° au grand-angle, ${echapper(fr(m.angleHTele))}° au téléobjectif`
    : `${echapper(fr(m.angleH))}°`)}
          ${ligne('Optique', m.focaleMin
    ? `${echapper(fr(m.focaleMin))} – ${echapper(fr(m.focaleMax))} mm motorisé`
    : (m.focale ? `${echapper(fr(m.focale))} mm fixe${
  m.capteurUnique ? ' × 2 objectifs' : ''}` : null))}
          ${ligne('Infrarouge', m.ir ? `${m.ir} m` : null)}
          ${ligne('Alimentation', `${echapper(m.classePoe || 'PoE')}, ${echapper(fr(m.consoPoe))} W`)}
          ${ligne('Reconnaît jusqu\'à', `${echapper(fr(p.reconnaissance))} m${
  pt && tele ? ` · ${echapper(fr(pt.reconnaissance))} m au téléobjectif` : ''}`)}
          ${ligne('Identifie jusqu\'à', `<b class="fort">${echapper(fr(p.identification))} m</b>${
  pt && tele ? ` · <b class="fort">${echapper(fr(pt.identification))} m</b> au téléobjectif` : ''}`)}
        </table>
        ${m.noteCone ? `<p class="det">${echapper(m.noteCone)}</p>` : ''}
      </div>
    </div>`;
  }).join('');
}

/**
 * Compose le dossier.
 *
 * @param {object} etude
 * @param {object} agence
 * @param {string} planSvg le plan, déjà dessiné, sérialisé
 */
export function fiche(etude, agence, planSvg, devis = null) {
  const b = bilanEtude(etude);
  const r = reglagesPdf(etude);
  const papier = {
    taille: `${r.format} ${r.orientation}`,
    marge: MARGES[r.marges].css,
  };
  const date = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const lignes = etude.cameras.map((c) => {
    const m = etude.modeles[c.modele];
    const p = porteesDori(m, c.tele);
    const fort = p.identification > 5;
    return `<tr>
      <td><b>${echapper(c.cle)}</b></td>
      <td>${echapper(c.role || '')}</td>
      <td>${echapper(m.reference.replace('Hikvision ', ''))}${c.tele ? ' · télé' : ''}</td>
      <td class="n">${echapper(fr(p.reconnaissance))} m</td>
      <td class="n${fort ? ' fort' : ''}">${echapper(fr(p.identification))} m</td>
    </tr>`;
  }).join('');

  const vues = (etude.photos || []).map((ph) => {
    const bandes = (ph.reperes || []).map((r) => {
      const c = etude.cameras.find((x) => x.cle === r.camera);
      if (!c) return '';
      const m = etude.modeles[c.modele];
      const o = optiqueUtile(m, c.tele);
      const angle = m.capteurUnique ? 180 : o.angleH;
      const bd = bandePhoto(ph.champ, angle, r.bande);
      /*
       * Une panoramique de 180° couvre plus que la photo : son aplat rouge
       * la recouvrirait en entier, et deux caméras sur la même vue la
       * rendraient illisible. Au-delà de neuf dixièmes du cadre, on ne
       * garde que le trait et l'étiquette.
       */
      const noie = bd.largeur >= 0.9;
      return `<div class="champ${noie ? ' large' : ''}"
        style="left:${(bd.gauche * 100).toFixed(1)}%;
        width:${(bd.largeur * 100).toFixed(1)}%"><span>${echapper(c.cle)} · ${
  echapper(fr(angle))}°${bd.deborde ? ' · toute la vue' : ''}</span></div>`;
    }).join('');
    const cams = (ph.reperes || []).map((r) => r.camera);
    const detail = cams.map((cle) => {
      const c = etude.cameras.find((x) => x.cle === cle);
      if (!c) return '';
      const p = porteesDori(etude.modeles[c.modele], c.tele);
      return `<li><b>${echapper(c.cle)} : ${echapper(c.role || '')}.</b>
        ${c.attendu ? `${echapper(c.attendu)} ` : ''}
        Identifie jusqu'à <b>${echapper(fr(p.identification))} m</b>,
        reconnaît jusqu'à ${echapper(fr(p.reconnaissance))} m.
        ${c.pose ? `<span class="det">Pose : ${echapper(c.pose)}.</span>` : ''}</li>`;
    }).join('');
    return `<h3>${echapper(ph.titre || ph.cle)}</h3>
      <div class="report">${`<img src="${ph.src}" alt="${echapper(ph.titre || '')}">`}${bandes}</div>
      <figcaption>La bande rouge est le champ réel de la caméra, reporté à
        l'échelle de la prise de vue. Le champ de la photo est estimé à
        ${echapper(fr(ph.champ))}°.</figcaption>
      ${detail ? `<ul class="liste">${detail}</ul>` : ''}`;
  }).join('');

  const hors = b.horsNorme.length
    ? `<p class="point"><b>${b.horsNorme.length} liaison(s) au-delà de la limite.</b>
       ${b.horsNorme.map((l) => `${echapper(l.repere)} (${echapper(fr(l.longueur, 0))} m)`).join(', ')}.
       Une liaison Ethernet tient ${LIAISON_PERMANENTE} m de câble posé : au-delà,
       il faut un coffret déporté ou une fibre.</p>`
    : '';

  /*
   * Le chiffrage n'entre dans le dossier que si un devis est fourni. Sans
   * lui, le chapitre n'existe pas — il ne faut pas qu'un dossier sorte avec
   * un intertitre « Le chiffrage » suivi de rien.
   */
  let chiffrage = '';
  let avecPrix = false;
  if (devis) {
    const { lots, totaux: tdev } = bordereau(etude, devis);
    avecPrix = true;
    chiffrage = `<div class="chiffrage">${bandeauDevis(devis, tdev)}${
  tablesDevis(lots)}${totauxHtml(tdev)}</div>`;
  }

  /* Le corps de chaque chapitre, sans son titre : l'agence choisit le titre. */
  const corps = {
    chiffres: `<div class="chiffres">
  <div><span>Caméras</span><b>${b.cameras}</b></div>
  <div><span>Débit estimé</span><b>${echapper(fr(b.debitTotal))} Mbit/s</b></div>
  <div><span>Archive ${b.jours} jours</span><b>${echapper(fr(b.capaciteGo / 1000))} To</b></div>
  <div><span>PoE demandé</span><b>${echapper(fr(b.consoPoe))} W</b></div>
  <div><span>Câble réseau</span><b>${echapper(frGroupe(Math.round(b.reseau)))} m</b></div>
</div>`,

    cameras: `<table>
  <thead><tr><th>Repère</th><th>Rôle</th><th>Modèle</th>
    <th class="n">Reconnaît</th><th class="n">Identifie</th></tr></thead>
  <tbody>${lignes}</tbody>
</table>
<p class="point"><b>Identifier n'est pas voir.</b> La dernière colonne est la
  distance à laquelle un inconnu devient nommable, soit 250 pixels par mètre
  selon la norme EN 62676-4. En deçà, la caméra montre une silhouette ; elle
  ne prouve rien.</p>`,

    fiches: fiches(etude),

    plan: `<figure>${planSvg}
  <figcaption>Bâtiment de ${echapper(fr(etude.site.longueurBatiment, 0))} m.
    Chaque secteur montre trois profondeurs : en gris jusqu'où la caméra
    observe, en rouge pâle jusqu'où elle reconnaît, en rouge vif jusqu'où elle
    identifie.</figcaption>
</figure>`,

    vues,

    synoptique: `<figure class="large">${synoptique(etude)}
  <figcaption>Qui se raccorde à quoi, et par combien de mètres. Le schéma se
    lit de droite à gauche : l'équipement, son coffret, le local. Chaque trait
    porte la longueur relevée au cheminement ; un trait rouge signale une
    liaison au-delà de ce qu'une paire torsadée tient.</figcaption>
</figure>`,

    devis: chiffrage,

    archive: archive(etude, b),

    cablage: `<div class="chiffres">
  <div><span>Câble réseau</span><b>${echapper(frGroupe(Math.round(b.reseau)))} m</b></div>
  <div><span>À commander</span><b>${b.boites.boites} boîtes de 305 m</b></div>
  <div><span>Alimentation et commande</span><b>${echapper(frGroupe(Math.round(b.commande)))} m</b></div>
  <div><span>Liaisons hors norme</span><b>${b.horsNorme.length}</b></div>
</div>
${hors}`,

    garantie: `<div class="chiffres">
  <div><span>Garantie du matériel</span><b>3 ans</b></div>
  <div><span>Maintenance</span><b>1 an offert</b></div>
  <div><span>Formation</span><b>incluse</b></div>
</div>
<ul class="liste">
  <li><b>Garantie du matériel trois ans</b> à compter de la mise en service :
    caméras, serveur d'enregistrement, disques, commutateurs et coffrets. Un appareil
    défaillant est remplacé, pose comprise.</li>
  <li><b>Maintenance gratuite la première année.</b> Une visite annuelle :
    nettoyage des optiques, vérification des fixations et de l'étanchéité,
    contrôle de l'enregistrement et de la profondeur d'archive, mise à jour
    des microprogrammes. L'assistance à distance en cas de panne est
    comprise.</li>
  <li><b>Remise du dossier de fin d'installation :</b> plans de récolement,
    adresses réseau, identifiants, notices et procès-verbal de réception.</li>
  <li><b>Formation à l'exploitation</b> du système sur site, et connexion de
    l'application sur vos téléphones.</li>
  <li>Au-delà de la première année, la maintenance se poursuit par contrat
    annuel, sans obligation.</li>
</ul>`,

    reserves: `<ul class="liste">
  <li>${avecPrix
    ? `Le chiffrage porté ici vaut pour ${etude.cameras.length} caméras et le
       cheminement relevé en étude. Toute modification du parc ou du
       cheminement le change.`
    : `Ce document est une étude technique. Il ne vaut ni devis ni engagement
       de prix : aucun montant n'y figure.`}</li>
  <li>Les portées sont calculées sur l'optique annoncée par le constructeur et
    la norme EN 62676-4. Elles sont vraies pour ces caméras, où qu'on les
    pose.</li>
  <li>Les emplacements sont proposés d'après les vues transmises. Ils se
    confirment par un relevé sur place, qui arrête aussi le cheminement réel
    des câbles.</li>
  <li>Le plan est tracé sur une longueur de bâtiment de
    ${echapper(fr(etude.site.longueurBatiment, 0))} m. La profondeur et l'étendue
    de la cour restent proportionnelles au relevé sur vue aérienne.</li>
  <li>Une caméra qui filme au-delà de la propriété relève d'une autorisation
    préfectorale. Une caméra qui couvre un poste de travail obéit à des règles
    propres. À cadrer avant la pose.</li>
</ul>`,
  };

  const saut = etude.dossier && etude.dossier.sautDePage;
  let ecrits = 0;
  const chapitres = sectionsDuDossier(etude).map((s) => {
    if (s.visible === false) return '';
    let dedans;
    if (s.type === 'texte') {
      // Un chapitre dont le texte n'a pas encore été écrit ne doit pas sortir
      // son titre tout seul : le client lirait un intertitre suivi de rien.
      const ecrit = paragraphes(s.corps);
      dedans = ecrit ? `<div class="libre">${ecrit}</div>` : '';
    } else {
      dedans = corps[s.cle];
    }
    if (!dedans || !dedans.trim()) return '';
    const classe = saut && ecrits > 0 ? ' class="saut"' : '';
    ecrits += 1;
    const titre = s.titre ? `<h2${classe}>${echapper(s.titre)}</h2>` : `<div${classe}></div>`;
    return `${titre}\n${dedans}`;
  }).join('\n\n');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Étude technique · ${echapper(agence.nomCommercial || '')}</title>
<style>${STYLE(papier)}</style></head>
<body><div class="feuille">

<header class="garde">
  <div class="bandeau">
    ${agence.logo ? `<img src="${agence.logo}" alt="">` : ''}
    <div class="coord">
      <p class="nom">${echapper(agence.nomCommercial || '')}</p>
      <p>${echapper(agence.accroche || '')}</p>
      <p>${echapper(agence.adresse || '')}</p>
      <p>${echapper(agence.telephone || '')} · ${echapper(agence.courriel || '')}</p>
      <p>${echapper(agence.formeCourte || '')} · SIRET ${echapper(agence.siret || '')}
        · TVA ${echapper(agence.tva || '')}</p>
      <p>${echapper(agence.zone || '')}</p>
    </div>
  </div>
  <p class="surtitre">ÉTUDE TECHNIQUE</p>
  <h1>${echapper(etude.titre || 'Vidéosurveillance')}</h1>
  <div class="meta">
    ${etude.client ? `<p><b>Pour :</b> ${echapper(etude.client)}</p>` : ''}
    <p><b>Établie le :</b> ${echapper(date)}</p>
    <p><b>Référence :</b> ${echapper(etude.reference || '')}</p>
    <p><b>Parc :</b> ${b.cameras} caméras</p>
  </div>
</header>

${chapitres}

<p class="pied">${echapper(agence.nomCommercial || '')} ·
  ${echapper(agence.telephone || '')} · ${echapper(agence.courriel || '')}<br>
  Étude établie le ${echapper(date)}. Document de travail, à confirmer par un
  relevé sur place.</p>

</div>
<button type="button" class="pdf" onclick="window.print()"
  title="Ouvre la fenêtre d'impression : choisissez « Enregistrer au format PDF » comme imprimante.">
  Enregistrer en PDF<small>Imprimante : « Enregistrer au format PDF »</small></button>
</body></html>`;
}
