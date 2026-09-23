/**
 * Le devis remis au client.
 *
 * Même feuille que le dossier technique — même rouge, même en-tête, même
 * façon de tomber juste en A4. Un client qui reçoit l'étude puis le devis
 * doit voir deux pièces d'un même dossier, pas deux logiciels.
 *
 * Ce document ne calcule rien : il met en page ce que `devis-etude.js` a
 * monté. Et il refuse de mentir sur ce qu'il ne sait pas — une ligne sans
 * prix s'imprime « — », le total dit combien de lignes manquent, et tant que
 * `exemple` vaut true un bandeau prévient que rien n'est contractuel.
 */

import { fr, echapper, enEuros } from './format.js';
import { bordereau } from './devis-etude.js';
import { reglagesPdf, MARGES } from './papier.js';

const euros = (v) => (Number.isFinite(v) ? `${enEuros(v)} €` : '');

const STYLE_DEVIS = (papier) => `
:root { --rouge:#c8102e; --encre:#1a1d23; --doux:#5b6472; --bord:#dde1e7; --fond:#f6f7f9; }
* { box-sizing:border-box; }
body { margin:0; background:var(--fond); color:var(--encre);
  font:15px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.feuille { max-width:900px; margin:0 auto; background:#fff; padding:34px 40px 48px;
  border:1px solid var(--bord); }
.garde { border-bottom:3px solid var(--rouge); padding-bottom:18px; margin-bottom:22px; }
.bandeau { display:flex; gap:18px; align-items:flex-start; }
.bandeau img { width:96px; height:auto; }
.coord { font-size:13.5px; color:var(--doux); line-height:1.5; }
.coord .nom { font-size:19px; font-weight:800; color:var(--encre); margin:0 0 3px; }
.coord p { margin:0; }
.surtitre { color:var(--rouge); font-weight:700; letter-spacing:.1em; font-size:12px;
  margin:20px 0 6px; }
h1 { font-size:28px; margin:0 0 8px; }
h2 { font-size:17px; margin:26px 0 8px; padding-bottom:5px;
  border-bottom:2px solid var(--rouge); }
.meta p { margin:3px 0; font-size:14px; }
.avis { background:#fff4f5; border:1px solid #f0c8ce; border-left:4px solid var(--rouge);
  border-radius:6px; padding:11px 14px; margin:18px 0; font-size:13.5px; color:#7a0a1c; }
table { border-collapse:collapse; width:100%; font-size:13.5px; margin:8px 0 4px; }
th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--bord);
  vertical-align:top; }
th { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--doux); }
td.n, th.n { text-align:right; white-space:nowrap; }
/* Colonnes figées : sans cela chaque lot se donnait sa propre largeur et
   les six tableaux ne s'alignaient pas d'un lot à l'autre. */
th:nth-child(2), td:nth-child(2) { width:58px; }
th:nth-child(3), td:nth-child(3) { width:58px; }
th:nth-child(4), td:nth-child(4) { width:94px; }
th:nth-child(5), td:nth-child(5) { width:100px; }
tr.option td { color:var(--doux); }
.marque-option { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em;
  color:var(--rouge); font-weight:700; }
.det { display:block; font-size:11.5px; color:var(--doux); margin-top:2px; }
/* Ce que contient un ensemble vendu d'un bloc : le client doit pouvoir le
   lire sans que chaque élément devienne une ligne qu'il pourrait retirer. */
ul.contenu { margin:6px 0 2px; padding-left:18px; font-size:12px; color:var(--encre); }
ul.contenu li { margin-bottom:3px; }
.sous-total td { border-top:2px solid var(--encre); border-bottom:0; font-weight:700;
  font-size:14px; }
.total { margin:22px 0 0; border:1px solid var(--bord); border-radius:8px;
  overflow:hidden; }
.total div { display:flex; justify-content:space-between; padding:9px 14px;
  border-bottom:1px solid var(--bord); font-size:14px; }
.total div:last-child { border-bottom:0; background:var(--encre); color:#fff;
  font-size:17px; font-weight:800; }
.apres-total { margin:14px 0 0; font-size:13.5px; }
.titre-options { margin-top:26px; }
.mentions { font-size:12.5px; color:var(--doux); }
.mentions li { margin-bottom:6px; }
.signature { display:flex; gap:24px; margin-top:26px; }
.signature div { flex:1; border:1px solid var(--bord); border-radius:8px; padding:12px 14px;
  min-height:96px; font-size:12.5px; color:var(--doux); }
.pied { color:var(--doux); font-size:12.5px; text-align:center; padding:20px 0 0;
  border-top:1px solid var(--bord); margin-top:28px; }
.pdf { position:fixed; right:20px; bottom:20px; z-index:9;
  background:var(--rouge); color:#fff; border:0; border-radius:999px;
  padding:13px 22px; font:600 15px/1 inherit; cursor:pointer;
  box-shadow:0 6px 20px rgba(0,0,0,.25); }
.pdf:hover { background:#a50d26; }
.pdf small { display:block; font-weight:400; font-size:11.5px; opacity:.85; margin-top:4px; }

@page { size:${papier.taille}; margin:${papier.marge}; }
@media print {
  body { background:#fff; font-size:10.5pt; }
  .feuille { border:0; max-width:none; padding:0; }
  .pdf { display:none; }
  h1 { font-size:20pt; }
  h2 { font-size:13pt; break-after:avoid; page-break-after:avoid; }
  table, .total, .signature, .avis { break-inside:avoid; page-break-inside:avoid; }
  tr, li { break-inside:avoid; page-break-inside:avoid; }
}`;

/**
 * Les tableaux du bordereau, sans en-tête de document.
 *
 * Le devis les imprime seuls ; le dossier technique les reprend tels quels
 * dans son chapitre « Le chiffrage ». Un seul rendu pour les deux : deux
 * mises en page du même tableau finiraient par ne plus dire la même chose.
 */
export function tablesDevis(lots) {
  return lots.map((lot) => {
    const opt = lot.cle === 'options';
    return `<h3${opt ? ' class="titre-options"' : ''}>${echapper(lot.titre)}</h3>
${opt ? `<p class="det">Ce qui suit n'est pas compris dans le prix ci-dessus.
  Chaque option s'ajoute à la commande, ou plus tard, sans reprendre
  l'installation.</p>` : ''}
<table>
  <thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">Un.</th>
    <th class="n">P.U. HT</th><th class="n">Total HT</th></tr></thead>
  <tbody>${lignesHtml(lot)}
    <tr class="sous-total"><td colspan="4">${opt
  ? 'Total des options, à ajouter au prix ci-dessus'
  : `Sous-total ${echapper(lot.titre.toLowerCase())}`}</td>
      <td class="n">${euros(lot.total)}</td></tr>
  </tbody>
</table>
${lot.sansPrix ? `<p class="det">${lot.sansPrix} ligne(s) de ce lot ne sont pas encore chiffrées.</p>` : ''}`;
  }).join('\n');
}

/** Le bandeau qui dit ce que le chiffrage vaut — ou ne vaut pas encore. */
export function bandeauDevis(devis, t) {
  if (devis.exemple) {
    return `<div class="avis"><b>Devis non contractuel.</b> Les prix et les
      temps de pose ne sont pas encore saisis : ce document sert à valider le
      contenu de la prestation, pas son montant.</div>`;
  }
  if (!t.complet) {
    return `<div class="avis"><b>Chiffrage partiel.</b> ${t.sansPrix} ligne(s)
      sur ${t.lignes} n'ont pas de prix. Le total ci-dessous ne vaut que pour
      les lignes chiffrées.</div>`;
  }
  return '';
}

/** Le bloc des totaux, repris à l'identique par le dossier. */
export function totauxHtml(t) {
  const m = (v) => euros(t.complet || t.ht ? v : null);
  return `<div class="total">
  <div><span>Total HT</span><b>${m(t.ht)}</b></div>
  <div><span>TVA ${echapper(fr(t.tauxTva * 100, 1))} %</span><b>${m(t.montantTva)}</b></div>
  <div><span>Total TTC</span><b>${m(t.ttc)}</b></div>
</div>
<p class="apres-total">Ce prix comprend la fourniture du matériel, sa pose, son
  raccordement, la mise en service, le réglage de chaque caméra sur son champ,
  la formation de vos équipes et le dossier de fin d'installation. Le matériel
  est garanti <b>trois ans</b> et la maintenance vous est offerte la
  <b>première année</b>.</p>`;
}

function lignesHtml(lot) {
  return lot.lignes.map((l) => `<tr class="${l.option ? 'option' : ''}">
    <td>${echapper(l.designation)}${l.option && !l.venantDe ? ' <span class="marque-option">option</span>' : ''}
      ${l.venantDe ? `<span class="det">${echapper(l.venantDe)}</span>` : ''}
      ${l.reference && l.reference !== l.designation
    ? `<span class="det">Réf. ${echapper(l.reference)}</span>` : ''}
      ${l.note ? `<span class="det">${echapper(l.note)}</span>` : ''}
      ${l.contenu ? `<ul class="contenu">${l.contenu
    .map((x) => `<li>${echapper(x)}</li>`).join('')}</ul>` : ''}
      ${l.aConfirmer ? `<span class="det"><b>À arrêter :</b> ${echapper(l.aConfirmer)}</span>` : ''}</td>
    <td class="n">${echapper(fr(l.quantite, 2))}</td>
    <td class="n">${echapper(l.unite)}</td>
    <td class="n">${euros(l.prix)}</td>
    <td class="n">${euros(l.total)}</td>
  </tr>`).join('');
}

/**
 * Compose le devis.
 *
 * @param {object} etude
 * @param {object} devis
 * @param {object} agence
 */
export function ficheDevis(etude, devis, agence) {
  const { lots, totaux: t } = bordereau(etude, devis);
  const r = reglagesPdf(etude);
  const papier = { taille: `${r.format} ${r.orientation}`, marge: MARGES[r.marges].css };
  const date = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const tables = tablesDevis(lots).replace(/<h3>/g, '<h2>').replace(/<\/h3>/g, '</h2>');
  const avis = bandeauDevis(devis, t);

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Devis · ${echapper(agence.nomCommercial || '')}</title>
<style>${STYLE_DEVIS(papier)}</style></head>
<body><div class="feuille">

<header class="garde">
  <div class="bandeau">
    ${agence.logo ? `<img src="${agence.logo}" alt="">` : ''}
    <div class="coord">
      <p class="nom">${echapper(agence.nomCommercial || '')}</p>
      <p>${echapper(agence.adresse || '')}</p>
      <p>${echapper(agence.telephone || '')} · ${echapper(agence.courriel || '')}</p>
      <p>${echapper(agence.formeCourte || '')} · SIRET ${echapper(agence.siret || '')}
        · TVA ${echapper(agence.tva || '')}</p>
      <p>APE ${echapper(agence.naf || '')}</p>
    </div>
  </div>
  <p class="surtitre">DEVIS</p>
  <h1>${echapper(etude.titre || 'Vidéosurveillance')}</h1>
  <div class="meta">
    ${etude.client ? `<p><b>Client :</b> ${echapper(etude.client)}</p>` : ''}
    <p><b>Devis n° :</b> ${echapper(devis.reference || '')}</p>
    <p><b>Établi le :</b> ${echapper(date)}</p>
    <p><b>Validité :</b> ${echapper(String(devis.validite || 30))} jours</p>
    <p><b>Étude de référence :</b> ${echapper(etude.reference || '')}</p>
  </div>
</header>

${avis}

${tables}

${totauxHtml(t)}

<h2>Ce que le prix comprend</h2>
<ul class="mentions">
  <li>La fourniture et la pose de l'ensemble décrit ci-dessus, la mise en
    service, l'adressage et le paramétrage de l'enregistrement.</li>
  <li>La formation à l'exploitation du système et la connexion de
    l'application sur vos téléphones.</li>
  <li>Le dossier de fin d'installation : plans de récolement, adresses,
    codes et notices.</li>
  <li>La garantie du matériel trois ans et la maintenance gratuite un an.</li>
</ul>

<h2>Ce qu'il ne comprend pas</h2>
<ul class="mentions">
  <li>Les travaux de maçonnerie, de percement de dalle et de reprise
    d'étanchéité.</li>
  <li>La location de nacelle ou d'échafaudage, si le relevé la rend
    nécessaire.</li>
  <li>L'abonnement internet, la ligne et le forfait de télésurveillance.</li>
  <li>Les autorisations administratives : une caméra qui filme au-delà de la
    propriété relève d'une autorisation préfectorale, et un dispositif
    biométrique d'une analyse d'impact préalable.</li>
</ul>

<h2>Conditions</h2>
<ul class="mentions">
  <li>Devis valable ${echapper(String(devis.validite || 30))} jours à compter
    de sa date d'établissement.</li>
  <li>Les quantités de câble sont relevées au cheminement d'étude. Le relevé
    sur place peut les faire varier ; toute variation est signalée avant
    exécution.</li>
  <li>Les emplacements sont ceux de l'étude technique de référence. Un
    déplacement demandé après pose fait l'objet d'un avenant.</li>
  <li>Bon pour accord à retourner daté et signé, avec la mention manuscrite
    « bon pour accord ».</li>
</ul>

<div class="signature">
  <div><b>L'entreprise</b><br>${echapper(agence.nomCommercial || '')}<br>
    ${echapper(agence.dirigeant || '')}</div>
  <div><b>Le client</b><br>Date, signature et mention « bon pour accord »</div>
</div>

<p class="pied">${echapper(agence.nomCommercial || '')} ·
  ${echapper(agence.adresse || '')} · ${echapper(agence.telephone || '')} ·
  ${echapper(agence.courriel || '')}<br>
  ${echapper(agence.formeCourte || '')} · SIRET ${echapper(agence.siret || '')} ·
  TVA ${echapper(agence.tva || '')} · APE ${echapper(agence.naf || '')}</p>

</div>
<button type="button" class="pdf" onclick="window.print()"
  title="Ouvre la fenêtre d'impression : choisissez « Enregistrer au format PDF ».">
  Enregistrer en PDF<small>Imprimante : « Enregistrer au format PDF »</small></button>
</body></html>`;
}
