/**
 * Le dossier client, produit depuis l'éditeur.
 *
 * L'agence modifie l'étude sur son ordinateur, puis clique ici : il en sort
 * un fichier HTML autonome — plan, photos, tableaux, réserves — qui s'ouvre
 * dans n'importe quel navigateur et s'imprime en PDF. Rien à installer,
 * rien à commander en ligne, et le fichier part par courriel tel quel.
 *
 * Autonome veut dire sans aucun lien vers l'extérieur : les images sont
 * dedans, le style est dedans. Un dossier qui irait chercher une image sur
 * un serveur s'afficherait vide chez le client le jour où le serveur
 * tombe — ou révélerait, par la requête, qu'il vient d'être ouvert.
 */

import { fr, frGroupe } from './format.js';
import { bilanEtude, optiqueUtile, bandePhoto, geometrie } from './etude-plan.js';
import { distanceDori, SEUILS_DORI } from './optique.js';
import { LIAISON_PERMANENTE } from './cable.js';

const ech = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** Les quatre portées d'un modèle, en mètres. */
function portees(modele, tele) {
  const o = optiqueUtile(modele, tele);
  const d = {};
  for (const cle of Object.keys(SEUILS_DORI)) {
    d[cle] = distanceDori(o.resH, o.angleH, SEUILS_DORI[cle].ppm);
  }
  return d;
}

const STYLE = `
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
.chiffres { display:flex; flex-wrap:wrap; gap:1px; background:var(--bord);
  border:1px solid var(--bord); margin:12px 0; }
.chiffres div { background:#fff; padding:9px 14px; flex:1 1 130px; }
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
.report .champ span { position:absolute; top:5px; left:5px; font-size:11px;
  background:var(--rouge); color:#fff; padding:1px 6px; border-radius:3px;
  line-height:1.4; white-space:nowrap; }
ul.liste li { margin-bottom:7px; }
.pied { color:var(--doux); font-size:13px; text-align:center; padding:22px 0 0;
  border-top:1px solid var(--bord); margin-top:34px; }
@media print {
  body { background:#fff; }
  .feuille { border:0; max-width:none; padding:0; }
  h2 { page-break-after:avoid; }
  figure, .report { page-break-inside:avoid; }
}`;

/**
 * Compose le dossier.
 *
 * @param {object} etude
 * @param {object} agence
 * @param {string} planSvg le plan, déjà dessiné, sérialisé
 */
export function fiche(etude, agence, planSvg) {
  const b = bilanEtude(etude);
  const g = geometrie(etude.site);
  const date = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const lignes = etude.cameras.map((c) => {
    const m = etude.modeles[c.modele];
    const p = portees(m, c.tele);
    const fort = p.identification > 5;
    return `<tr>
      <td><b>${ech(c.cle)}</b></td>
      <td>${ech(c.role || '—')}</td>
      <td>${ech(m.reference.replace('Hikvision ', ''))}${c.tele ? ' · télé' : ''}</td>
      <td class="n">${ech(fr(p.reconnaissance))} m</td>
      <td class="n${fort ? ' fort' : ''}">${ech(fr(p.identification))} m</td>
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
      return `<div class="champ" style="left:${(bd.gauche * 100).toFixed(1)}%;
        width:${(bd.largeur * 100).toFixed(1)}%"><span>${ech(c.cle)} — ${
  ech(fr(angle))}°${bd.deborde ? ' · déborde du cadre' : ''}</span></div>`;
    }).join('');
    const cams = (ph.reperes || []).map((r) => r.camera);
    const detail = cams.map((cle) => {
      const c = etude.cameras.find((x) => x.cle === cle);
      if (!c) return '';
      const p = portees(etude.modeles[c.modele], c.tele);
      return `<li><b>${ech(c.cle)}</b> — ${ech(c.role || '')} :
        identifie jusqu'à <b>${ech(fr(p.identification))} m</b>,
        reconnaît jusqu'à ${ech(fr(p.reconnaissance))} m.</li>`;
    }).join('');
    return `<h3>${ech(ph.titre || ph.cle)}</h3>
      <div class="report">${`<img src="${ph.src}" alt="${ech(ph.titre || '')}">`}${bandes}</div>
      <figcaption>La bande rouge est le champ réel de la caméra, reporté à
        l'échelle de la prise de vue — champ de la photo estimé à
        ${ech(fr(ph.champ))}°.</figcaption>
      ${detail ? `<ul class="liste">${detail}</ul>` : ''}`;
  }).join('');

  const hors = b.horsNorme.length
    ? `<p class="point"><b>${b.horsNorme.length} liaison(s) au-delà de la limite.</b>
       ${b.horsNorme.map((l) => `${ech(l.repere)} (${ech(fr(l.longueur, 0))} m)`).join(', ')}.
       Une liaison Ethernet tient ${LIAISON_PERMANENTE} m de câble posé : au-delà,
       il faut un coffret déporté ou une fibre.</p>`
    : '';

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Étude technique — ${ech(agence.nomCommercial || '')}</title>
<style>${STYLE}</style></head>
<body><div class="feuille">

<header class="garde">
  <div class="bandeau">
    ${agence.logo ? `<img src="${agence.logo}" alt="">` : ''}
    <div class="coord">
      <p class="nom">${ech(agence.nomCommercial || '')}</p>
      <p>${ech(agence.accroche || '')}</p>
      <p>${ech(agence.adresse || '')}</p>
      <p>${ech(agence.telephone || '')} · ${ech(agence.courriel || '')}</p>
      <p>${ech(agence.formeCourte || '')} · SIRET ${ech(agence.siret || '')}
        · TVA ${ech(agence.tva || '')}</p>
      <p>${ech(agence.zone || '')}</p>
    </div>
  </div>
  <p class="surtitre">ÉTUDE TECHNIQUE</p>
  <h1>${ech(etude.titre || 'Vidéosurveillance')}</h1>
  <div class="meta">
    <p><b>Établie le :</b> ${ech(date)}</p>
    <p><b>Référence :</b> ${ech(etude.reference || '')}</p>
    <p><b>Parc :</b> ${b.cameras} caméras</p>
  </div>
</header>

<h2>Ce que l'installation compte</h2>
<div class="chiffres">
  <div><span>Caméras</span><b>${b.cameras}</b></div>
  <div><span>Débit estimé</span><b>${ech(fr(b.debitTotal))} Mbit/s</b></div>
  <div><span>Stockage 30 jours</span><b>${ech(fr(b.capaciteGo / 1000))} To</b></div>
  <div><span>PoE demandé</span><b>${ech(fr(b.consoPoe))} W</b></div>
  <div><span>Câble réseau</span><b>${ech(frGroupe(Math.round(b.reseau)))} m</b></div>
</div>

<h2>Les caméras</h2>
<table>
  <thead><tr><th>Repère</th><th>Rôle</th><th>Modèle</th>
    <th class="n">Reconnaît</th><th class="n">Identifie</th></tr></thead>
  <tbody>${lignes}</tbody>
</table>
<p class="point"><b>Identifier n'est pas voir.</b> La dernière colonne est la
  distance à laquelle un inconnu devient nommable — 250 pixels par mètre selon
  la norme EN 62676-4. En deçà, la caméra montre une silhouette ; elle ne
  prouve rien.</p>

<h2>Le plan d'implantation</h2>
<figure>${planSvg}
  <figcaption>Bâtiment de ${ech(fr(etude.site.longueurBatiment, 0))} m.
    Chaque secteur montre trois profondeurs : en gris jusqu'où la caméra
    observe, en rouge pâle jusqu'où elle reconnaît, en rouge vif jusqu'où elle
    identifie.</figcaption>
</figure>

${vues ? `<h2>Le site, vue par vue</h2>${vues}` : ''}

<h2>Câblage</h2>
<div class="chiffres">
  <div><span>Câble réseau</span><b>${ech(frGroupe(Math.round(b.reseau)))} m</b></div>
  <div><span>À commander</span><b>${b.boites.boites} boîtes de 305 m</b></div>
  <div><span>Alimentation et commande</span><b>${ech(frGroupe(Math.round(b.commande)))} m</b></div>
  <div><span>Liaisons hors norme</span><b>${b.horsNorme.length}</b></div>
</div>
${hors}

<h2>Réserves</h2>
<ul class="liste">
  <li>Ce document est une étude technique. Il ne vaut ni devis ni engagement
    de prix : aucun montant n'y figure.</li>
  <li>Les portées sont calculées sur l'optique annoncée par le constructeur et
    la norme EN 62676-4. Elles sont vraies pour ces caméras, où qu'on les
    pose.</li>
  <li>Les emplacements sont proposés d'après les vues transmises. Ils se
    confirment par un relevé sur place, qui arrête aussi le cheminement réel
    des câbles.</li>
  <li>Le plan est tracé sur une longueur de bâtiment de
    ${ech(fr(etude.site.longueurBatiment, 0))} m. La profondeur et l'étendue
    de la cour restent proportionnelles au relevé sur vue aérienne.</li>
  <li>Une caméra qui filme au-delà de la propriété relève d'une autorisation
    préfectorale. Une caméra qui couvre un poste de travail obéit à des règles
    propres. À cadrer avant la pose.</li>
</ul>

<p class="pied">${ech(agence.nomCommercial || '')} ·
  ${ech(agence.telephone || '')} · ${ech(agence.courriel || '')} —
  étude établie le ${ech(date)} — document de travail, à confirmer par un
  relevé sur place.</p>

</div></body></html>`;
}
