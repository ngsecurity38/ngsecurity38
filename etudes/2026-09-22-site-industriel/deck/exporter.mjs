/**
 * Extrait du dossier les chiffres dont la présentation a besoin.
 *
 *   node etudes/2026-09-22-site-industriel/deck/exporter.mjs
 *
 * Le générateur du dossier n'exporte rien de lui-même : il produit un
 * document. Ce script rouvre son code, en prend les constantes déjà
 * calculées et les écrit en JSON. La présentation ne recopie donc aucun
 * chiffre — elle lit ceux du dossier, et ne peut pas s'en écarter.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const etude = join(ici, '..', 'etude.mjs');
const src = readFileSync(etude, 'utf8');

/*
 * On coupe avant la composition du HTML : tout ce qui suit ne fait que
 * mettre en page, et l'exécuter produirait un document dont on n'a que
 * faire ici.
 */
const tampon = join(ici, '..', '_export.tmp.mjs');
writeFileSync(tampon, `${src.slice(0, src.indexOf('const AUJOURD_HUI'))}
export { CAMERAS, MODELES, EQUIPEMENTS, PARC, VUES, METRE, RESEAU_TOTAL,
  COMMANDE_TOTAL, BOBINES_RESEAU, RELAIS, debitTotal, stockage, disques30,
  consoPoeToutes, PORTS_UTILISES, DISTANCE_PORTAIL, PORTEES_C1, ZONES_SECOURS,
  SECOURS_PARTIEL, mosaiqueParc, SITE, ACCES, portees };
`);

try {
  const m = await import(`file://${tampon}`);
  const { ecranConseille } = await import('../../../outils/analyse-vue-angle/js/ecran.js');
  const { energieNecessaire, calibreOnduleur } = await import('../../../outils/analyse-vue-angle/js/secours.js');
  const agence = JSON.parse(readFileSync(join(ici, '..', '..', '..', 'agence.json'), 'utf8'));

  const donnees = {
    agence,
    site: m.SITE,
    cameras: m.CAMERAS.map((c) => {
      const mo = m.MODELES[c.modele];
      const p = m.portees(mo, c.tele);
      const v = m.VUES.find((x) => x.cle === c.vue);
      return {
        cle: c.cle, zone: v ? v.titre : '—', role: c.role, tele: !!c.tele,
        modele: mo.reference.replace('Hikvision ', ''), conso: mo.consoPoe,
        ident: p.identification, reco: p.reconnaissance, obs: p.observation,
      };
    }),
    nvr: m.EQUIPEMENTS.enregistreur,
    interphonie: m.EQUIPEMENTS.interphonie,
    debit: m.debitTotal,
    stock30: m.stockage(30) / 1000,
    disques: m.disques30,
    poe: m.consoPoeToutes,
    ports: m.PORTS_UTILISES,
    distancePortail: m.DISTANCE_PORTAIL,
    porteesC1: m.PORTEES_C1,
    reseau: m.RESEAU_TOTAL,
    commande: m.COMMANDE_TOTAL,
    boites: m.BOBINES_RESEAU,
    relais: Object.entries(m.RELAIS).map(([cle, r]) => ({
      cle, nom: r.nom, contenu: r.contenu, depuis: r.depuis,
      montante: m.METRE.find((l) => l.repere === cle).longueur,
    })),
    zones: m.ZONES_SECOURS.map((z) => ({ cle: z.cle, nom: z.nom, cameras: z.cameras })),
    perdues: m.SECOURS_PARTIEL.camerasPerdues,
    mosaique: m.mosaiqueParc,
    ecrans: [1.5, 2, 3].map((d) => {
      const e = ecranConseille({ cameras: m.PARC.length, distance: d });
      return { d, pouces: e.pouces, def: e.definition.label, tuile: `${e.tuile.largeur} × ${e.tuile.hauteur}` };
    }),
    batteries: [80, 120, 160, 200].map((w) => ({
      w,
      h1: Math.round(energieNecessaire({ charge: w, heures: 1 })),
      h2: Math.round(energieNecessaire({ charge: w, heures: 2 })),
      va: calibreOnduleur(w),
    })),
  };
  writeFileSync(join(ici, 'donnees.json'), `${JSON.stringify(donnees, null, 1)}\n`);
  console.log(`donnees.json — ${donnees.cameras.length} caméras, `
    + `${donnees.relais.length} coffrets, ${donnees.zones.length} zones de secours`);
} finally {
  unlinkSync(tampon);
}
