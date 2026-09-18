/**
 * Tests du synoptique de câblage.
 * Exécution : node --test tests/reseau.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITE_LIEN, RESERVE_DEFAUT, TYPES_MATERIEL,
  nouveauSynoptique, nouveauNoeud, nouveauLien, noeudPar, trajet, longueurTrajet,
  mesurerLien, atteignables, recapitulatif, dispositionLogique, nomNoeud,
} from '../js/reseau.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/** Petit site : deux caméras, un switch, un enregistreur. Échelle : 100 m par unité. */
function site() {
  const s = nouveauSynoptique();
  const cam1 = nouveauNoeud('camera', 0, 0, { nom: 'CAM 01', hauteur: 4 });
  const cam2 = nouveauNoeud('camera', 0.3, 0, { nom: 'CAM 02', hauteur: 4 });
  const sw = nouveauNoeud('switch', 0, 0.1, { nom: 'SW local', hauteur: 0 });
  const nvr = nouveauNoeud('nvr', 0.1, 0.1, { nom: 'NVR', hauteur: 0 });
  s.noeuds.push(cam1, cam2, sw, nvr);
  s.liens.push(nouveauLien(cam1.id, sw.id), nouveauLien(cam2.id, sw.id), nouveauLien(sw.id, nvr.id));
  return { s, cam1, cam2, sw, nvr, echelle: 100 };
}

/* ------------------------------------------------------------- longueurs */

test('longueur au plan : une polyligne se mesure segment par segment', () => {
  const points = [{ x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.4 }];
  proche(longueurTrajet(points, 100), 70, 1e-9, '30 m puis 40 m');
});

test('longueur au plan : sans échelle, rien n\'est mesurable', () => {
  assert.equal(longueurTrajet([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0), 0);
  assert.equal(longueurTrajet([{ x: 0, y: 0 }], 100), 0, 'un point seul n\'a pas de longueur');
});

test('longueur de câble : les descentes et la réserve s\'ajoutent au trait', () => {
  const { s, cam1, sw, echelle } = site();
  const m = mesurerLien(s, s.liens[0], echelle);
  // 0,1 unité × 100 = 10 m au plan, plus 4 m de descente caméra, plus 10 %.
  proche(m.auPlan, 10, 1e-9, 'longueur au plan');
  proche(m.descentes, 4, 1e-9, 'la caméra est à 4 m, le switch au sol');
  proche(m.cable, (10 + 4) * 1.1, 1e-9, 'réserve de 10 %');
  assert.equal(m.de.id, cam1.id);
  assert.equal(m.vers.id, sw.id);
  assert.equal(m.depasse, false);
});

test('longueur de câble : la réserve est réglable', () => {
  const { s, echelle } = site();
  const sans = mesurerLien(s, s.liens[0], echelle, { reserve: 0 });
  proche(sans.cable, 14, 1e-9, 'sans réserve, câble = plan + descentes');
  assert.equal(RESERVE_DEFAUT, 0.1);
});

test('longueur de câble : les points de passage rallongent le trajet', () => {
  const { s, cam1, sw, echelle } = site();
  const direct = mesurerLien(s, nouveauLien(cam1.id, sw.id), echelle).auPlan;
  const contourne = mesurerLien(
    s, nouveauLien(cam1.id, sw.id, [{ x: 0.2, y: 0 }, { x: 0.2, y: 0.1 }]), echelle,
  ).auPlan;
  proche(direct, 10, 1e-9);
  proche(contourne, 50, 1e-9, '20 m, 10 m, puis 20 m de retour');
  assert.ok(contourne > direct, 'contourner coûte du câble');
});

test('au-delà de 90 m, le lien est signalé', () => {
  const s = nouveauSynoptique();
  const a = nouveauNoeud('camera', 0, 0, { hauteur: 4 });
  const b = nouveauNoeud('switch', 0, 0.85, { hauteur: 0 });
  s.noeuds.push(a, b);
  s.liens.push(nouveauLien(a.id, b.id));
  const m = mesurerLien(s, s.liens[0], 100);
  proche(m.auPlan, 85, 1e-9);
  proche(m.cable, (85 + 4) * 1.1, 1e-9);
  assert.ok(m.cable > LIMITE_LIEN, 'le câble dépasse la limite même si le trait ne la dépasse pas');
  assert.equal(m.depasse, true, 'c\'est la longueur de câble qui compte, pas celle du trait');
});

test('un lien pendant ne se mesure pas', () => {
  const { s, echelle } = site();
  const lien = nouveauLien('inexistant', s.noeuds[0].id);
  assert.equal(trajet(s, lien), null);
  assert.equal(mesurerLien(s, lien, echelle), null);
});

test('un plan non calibré interdit de chiffrer, pas de dessiner', () => {
  const { s } = site();
  assert.equal(mesurerLien(s, s.liens[0], 0), null);
  const r = recapitulatif(s, 0);
  assert.equal(r.mesurable, false);
  assert.equal(r.mesures.length, 0);
  assert.equal(r.parType.camera, 2, 'le matériel posé reste compté');
});

/* ------------------------------------------------------------- topologie */

test('atteignables : ce qui remonte jusqu\'à l\'enregistreur', () => {
  const { s, nvr, cam1, cam2 } = site();
  const vus = atteignables(s, nvr.id);
  assert.ok(vus.has(cam1.id) && vus.has(cam2.id), 'les deux caméras passent par le switch');
  assert.equal(atteignables(s, 'inexistant').size, 0);
});

test('récapitulatif : total, plus long lien, inventaire par type', () => {
  const { s, echelle } = site();
  const r = recapitulatif(s, echelle);
  assert.equal(r.mesures.length, 3);
  assert.deepEqual(r.parType, { camera: 2, switch: 1, nvr: 1 });
  const somme = r.mesures.reduce((x, m) => x + m.cable, 0);
  proche(r.totalCable, somme, 1e-9);
  assert.equal(r.plusLong.de.nom, 'CAM 02', 'la caméra la plus éloignée du switch');
  assert.equal(r.depassements.length, 0);
});

test('récapitulatif : un matériel au bout d\'aucun câble est signalé', () => {
  const { s, echelle } = site();
  const seul = nouveauNoeud('camera', 0.9, 0.9, { nom: 'CAM 09' });
  s.noeuds.push(seul);
  const r = recapitulatif(s, echelle);
  assert.equal(r.orphelins.length, 1);
  assert.equal(r.orphelins[0].nom, 'CAM 09');
});

test('récapitulatif : une caméra qui ne remonte à aucun enregistreur est signalée', () => {
  const { s, echelle } = site();
  const isolee = nouveauNoeud('camera', 0.9, 0.9, { nom: 'CAM 09' });
  const swSeul = nouveauNoeud('switch', 0.9, 0.8, { nom: 'SW orphelin' });
  s.noeuds.push(isolee, swSeul);
  s.liens.push(nouveauLien(isolee.id, swSeul.id));
  const r = recapitulatif(s, echelle);
  assert.equal(r.orphelins.length, 0, 'elle est bien câblée…');
  assert.equal(r.sansEnregistreur.length, 1, '…mais vers rien');
  assert.equal(r.sansEnregistreur[0].nom, 'CAM 09');
});

test('récapitulatif : sans enregistreur au plan, on ne reproche rien', () => {
  const s = nouveauSynoptique();
  const a = nouveauNoeud('camera', 0, 0);
  const b = nouveauNoeud('switch', 0, 0.1);
  s.noeuds.push(a, b);
  s.liens.push(nouveauLien(a.id, b.id));
  assert.equal(recapitulatif(s, 100).sansEnregistreur.length, 0);
});

/* ------------------------------------------------------ synoptique logique */

test('disposition logique : l\'enregistreur en haut, les caméras en bas', () => {
  const { s, nvr, cam1 } = site();
  const d = dispositionLogique(s);
  assert.equal(d.noeuds.length, 4);
  assert.equal(d.niveaux, 3, 'NVR, switch, caméras');
  const place = (id) => d.noeuds.find((n) => n.id === id);
  assert.equal(place(nvr.id).niveau, 0);
  assert.equal(place(cam1.id).niveau, 2);
  assert.ok(place(nvr.id).y < place(cam1.id).y, 'le NVR est au-dessus');
  for (const n of d.noeuds) {
    assert.ok(n.x > 0 && n.x < 1, `${n.nom} hors cadre : x = ${n.x}`);
    assert.ok(n.y >= 0 && n.y <= 1, `${n.nom} hors cadre : y = ${n.y}`);
  }
});

test('disposition logique : les caméras d\'un même niveau sont réparties', () => {
  const { s, cam1, cam2 } = site();
  const d = dispositionLogique(s);
  const a = d.noeuds.find((n) => n.id === cam1.id);
  const b = d.noeuds.find((n) => n.id === cam2.id);
  assert.notEqual(a.x, b.x, 'deux caméras ne se superposent pas');
  proche(a.y, b.y, 1e-9, 'mais elles sont sur la même ligne');
});

test('disposition logique : un matériel relié à rien reste au schéma', () => {
  const { s } = site();
  const seul = nouveauNoeud('camera', 0.9, 0.9, { nom: 'CAM 09' });
  s.noeuds.push(seul);
  const d = dispositionLogique(s);
  const place = d.noeuds.find((n) => n.id === seul.id);
  assert.ok(place, 'un matériel oublié doit se voir, pas disparaître');
  assert.equal(place.niveau, 3, 'rangé sous le dernier niveau');
});

test('disposition logique : un synoptique vide ne casse rien', () => {
  const d = dispositionLogique(nouveauSynoptique());
  assert.deepEqual(d, { noeuds: [], liens: [], niveaux: 0 });
});

test('disposition logique : un seul matériel se place au milieu', () => {
  const s = nouveauSynoptique();
  s.noeuds.push(nouveauNoeud('nvr', 0.5, 0.5));
  const d = dispositionLogique(s);
  assert.equal(d.niveaux, 1);
  proche(d.noeuds[0].y, 0.5, 1e-9, 'une seule ligne : au centre, pas collé au bord');
});

/* ------------------------------------------------------------- désignation */

test('désignation : le nom saisi, sinon le type et le rang', () => {
  assert.equal(nomNoeud({ type: 'camera', nom: 'CAM 04' }), 'CAM 04');
  assert.equal(nomNoeud({ type: 'switch', nom: '' }, 0), 'SW 1');
  assert.equal(nomNoeud({ type: 'nvr', nom: '' }, 2), 'NVR 3');
});

test('chaque type de matériel a son étiquette et sa couleur', () => {
  for (const [cle, t] of Object.entries(TYPES_MATERIEL)) {
    assert.ok(t.label, `${cle} sans étiquette`);
    assert.match(t.couleur, /^#[0-9a-f]{6}$/i, `${cle} : couleur invalide`);
    assert.ok(t.court.length <= 4, `${cle} : abréviation trop longue`);
  }
});

test('identifiants : deux matériels créés d\'affilée ne se confondent pas', () => {
  const a = nouveauNoeud('camera', 0, 0);
  const b = nouveauNoeud('camera', 0, 0);
  assert.notEqual(a.id, b.id);
  assert.equal(noeudPar({ noeuds: [a, b] }, b.id).id, b.id);
});
