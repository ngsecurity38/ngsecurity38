/**
 * Tests du tracé de champ sur plan et du choix d'objectif.
 * Exécution : node --test tests/plan.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  distance, echelleDuPlan, azimut, portee, polygoneCone, dimensionner, ouverturePourFocale,
} from '../js/plan.js';
import { CAPTEURS, anglesDeChamp, niveauDori } from '../js/optique.js';
import {
  CATALOGUE_INITIAL, proposer, conseil, focaleCourante, normaliserEntree, estFixe,
  nomComplet, versCsv, depuisCsv, estComplete, aConfirmer, reserve,
  depuisReleveCommercial, focaleDepuisIntitule, definitionDepuisIntitule,
  referenceDepuisIntitule, marqueDepuisReference, decouperCsv,
} from '../js/catalogue.js';

const proche = (a, b, tol, m) => assert.ok(
  Math.abs(a - b) <= tol, `${m || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/* ------------------------------------------------------------------- plan */

test('échelle : une distance connue donne les mètres par unité de plan', () => {
  // Deux repères écartés d'un quart de la largeur du plan valent 20 m sur le terrain.
  const e = echelleDuPlan({ x: 0.2, y: 0.5 }, { x: 0.45, y: 0.5 }, 20);
  proche(e, 80, 1e-9, 'la largeur entière du plan vaut donc 80 m');
  assert.equal(echelleDuPlan({ x: 0.2, y: 0.5 }, { x: 0.2, y: 0.5 }, 20), 0, 'deux points confondus');
  assert.equal(echelleDuPlan({ x: 0, y: 0 }, { x: 1, y: 0 }, 0), 0, 'distance nulle');
});

test('azimut : le nord est en haut du plan, le sens est horaire', () => {
  const o = { x: 0.5, y: 0.5 };
  proche(azimut(o, { x: 0.5, y: 0.1 }), 0, 1e-9, 'vers le haut');
  proche(azimut(o, { x: 0.9, y: 0.5 }), 90, 1e-9, 'vers la droite');
  proche(azimut(o, { x: 0.5, y: 0.9 }), 180, 1e-9, 'vers le bas');
  proche(azimut(o, { x: 0.1, y: 0.5 }), 270, 1e-9, 'vers la gauche');
});

test('portée : longueur du tracé convertie par l\'échelle', () => {
  const e = echelleDuPlan({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 50); // 100 m par unité
  proche(portee({ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.5 }, e), 30, 1e-9);
});

test('dimensionnement : ouverture tracée, focale et densité obtenues', () => {
  const echelle = 100; // 1 unité de plan = 100 m
  const trace = {
    sommet: { x: 0.5, y: 0.9 },
    vise: { x: 0.5, y: 0.5 }, // 0,4 unité vers le haut, soit 40 m
    ouverture: 60,
  };
  const d = dimensionner(trace, echelle, CAPTEURS['1/2.8"'], 1920);
  proche(d.portee, 40, 1e-9, 'portée');
  proche(d.azimut, 0, 1e-9, 'visée plein nord');
  proche(d.largeur, 2 * 40 * Math.tan(Math.PI / 6), 1e-9, 'largeur couverte');
  proche(d.focale, 5.18 / (2 * Math.tan(Math.PI / 6)), 1e-9, 'focale nécessaire');
  proche(d.densite, 1920 / d.largeur, 1e-9, 'densité');
  assert.equal(niveauDori(d.densite), 'detection', 'à 40 m en grand angle, on détecte seulement');
});

test('dimensionnement : resserrer le champ allonge la focale et densifie', () => {
  const base = { sommet: { x: 0.5, y: 0.9 }, vise: { x: 0.5, y: 0.5 } };
  const large = dimensionner({ ...base, ouverture: 90 }, 100, CAPTEURS['1/2.8"'], 1920);
  const serre = dimensionner({ ...base, ouverture: 30 }, 100, CAPTEURS['1/2.8"'], 1920);
  assert.ok(serre.focale > large.focale, 'un champ étroit demande une focale plus longue');
  assert.ok(serre.densite > large.densite, 'et donne plus de pixels par mètre');
  assert.ok(serre.surface < large.surface);
});

test('focale et ouverture sont réciproques', () => {
  const capteur = CAPTEURS['1/2.8"'];
  const trace = { sommet: { x: 0.5, y: 0.9 }, vise: { x: 0.5, y: 0.4 }, ouverture: 47 };
  const d = dimensionner(trace, 100, capteur, 1920);
  proche(ouverturePourFocale(capteur, d.focale), 47, 1e-9, 'aller-retour');
  proche(anglesDeChamp(capteur, d.focale).horizontal, 47, 1e-9, 'cohérent avec le calcul optique');
});

test('cône : sommet en tête, arc symétrique autour de la visée', () => {
  const sommet = { x: 0.5, y: 0.8 };
  const p = polygoneCone(sommet, 0, 60, 0.3, 12);
  assert.equal(p.length, 14, 'sommet + 13 points d\'arc');
  assert.deepEqual(p[0], sommet);
  proche(distance(sommet, p[1]), 0.3, 1e-9, 'premier bord à la portée');
  proche(distance(sommet, p[p.length - 1]), 0.3, 1e-9, 'second bord aussi');
  proche(azimut(sommet, p[1]), 330, 1e-9, 'bord gauche à -30°');
  proche(azimut(sommet, p[p.length - 1]), 30, 1e-9, 'bord droit à +30°');
});

test('un champ dégénéré ne produit pas de focale absurde', () => {
  const t = { sommet: { x: 0.5, y: 0.5 }, vise: { x: 0.5, y: 0.2 }, ouverture: 0 };
  assert.equal(dimensionner(t, 100, CAPTEURS['1/2.8"'], 1920).focale, 0);
  const plat = { ...t, ouverture: 200 };
  assert.equal(dimensionner(plat, 100, CAPTEURS['1/2.8"'], 1920).focale, 0);
});

/* -------------------------------------------------------------- catalogue */

test('catalogue de départ : chaque entrée nomme sa source', () => {
  assert.ok(CATALOGUE_INITIAL.length >= 20, 'le catalogue de départ est fourni');
  for (const e of CATALOGUE_INITIAL) {
    assert.ok(e.source, `${e.reference} sans source`);
    assert.ok(e.verifie, `${e.reference} : la référence vient d'un document`);
    assert.ok(estComplete(e), `${e.reference} : focale et définition connues`);
  }
  assert.ok(CATALOGUE_INITIAL.some((e) => /hikvision/i.test(e.marque)), 'Hikvision présent');
  assert.ok(CATALOGUE_INITIAL.some((e) => /dahua/i.test(e.marque)), 'Dahua présent');
});

test('catalogue de départ : le capteur reste supposé partout sauf sur l\'étude', () => {
  // L'étude du client donne le capteur ; les brochures commerciales, jamais.
  const sures = CATALOGUE_INITIAL.filter((e) => !e.capteurSuppose);
  assert.equal(sures.length, 2, 'seules les deux voies lues sur l\'étude sont complètes');
  assert.ok(sures.every((e) => estFixe(e)), 'les deux objectifs sont fixes');
  assert.equal(sures.find((e) => e.type === 'thermique').focaleMin, 3.5);
  assert.ok(sures.every((e) => aConfirmer(e).length === 0), 'rien à confirmer sur celles-là');

  const supposees = CATALOGUE_INITIAL.filter((e) => e.capteurSuppose);
  assert.ok(supposees.length > 15, 'les références de brochure sont nombreuses');
  for (const e of supposees) {
    assert.deepEqual(aConfirmer(e), ['le format de capteur']);
    assert.match(reserve(e), /capteur reste à confirmer/);
  }
});

test('catalogue de départ : la plage réellement couverte, et rien de plus', () => {
  // Ce que les documents attestent : de 2,8 à 13,5 mm.
  for (const focale of [2.8, 4, 5.5, 8, 12, 13]) {
    assert.ok(proposer(CATALOGUE_INITIAL, focale).length > 0, `rien ne couvre ${focale} mm`);
  }
  // Au-delà, l'outil dit qu'il ne sait pas plutôt que d'inventer une longue portée.
  for (const focale of [20, 30]) {
    assert.equal(proposer(CATALOGUE_INITIAL, focale).length, 0, `${focale} mm ne doit rien donner`);
    assert.match(conseil(focale, []).texte, /Aucun matériel du catalogue/);
  }
});

test('proposition : le matériel vérifié de l\'étude sort en tête à sa focale', () => {
  const p = proposer(CATALOGUE_INITIAL, 4, { type: 'thermique' });
  assert.equal(p.length, 1, 'une seule voie thermique au catalogue');
  const visible = proposer(CATALOGUE_INITIAL, 4, { type: 'visible' });
  assert.ok(visible.length > 1, '4 mm : plusieurs objectifs conviennent');
  assert.ok(visible.some((x) => x.entree.reference === 'DHI-TPC-BF1241'), 'le 4 mm exact figure parmi eux');
});

test('proposition : restriction à une technologie', () => {
  const p = proposer(CATALOGUE_INITIAL, 3.6, { type: 'thermique' });
  assert.equal(p.length, 1);
  assert.equal(p[0].entree.voie, 'thermique');
});

test('proposition : un varifocal couvrant passe avant un fixe approchant', () => {
  const catalogue = [
    normaliserEntree({ reference: 'Fixe 6', focaleMin: 6, focaleMax: 6 }),
    normaliserEntree({ reference: 'Vari 2,7-13,5', focaleMin: 2.7, focaleMax: 13.5 }),
  ];
  const p = proposer(catalogue, 5.2);
  assert.equal(p[0].entree.reference, 'Vari 2,7-13,5');
  assert.equal(p[0].dans, true);
  proche(p[0].reglage, 5.2, 1e-9, 'le zoom se règle sur la focale voulue');
});

test('conseil : varifocal, focale fixe, et catalogue muet', () => {
  const vari = [normaliserEntree({ reference: 'Vari', focaleMin: 2.7, focaleMax: 13.5 })];
  const c1 = conseil(5.24, proposer(vari, 5.24));
  assert.match(c1.texte, /régler le zoom sur 5,2 mm/);

  const c2 = conseil(4, proposer(CATALOGUE_INITIAL, 4));
  assert.match(c2.texte, /focale fixe 4 mm, rien à régler/);

  const c3 = conseil(9.3, []);
  assert.match(c3.texte, /Aucun matériel du catalogue/);
  assert.equal(c3.focale, 8, 'la focale du commerce la plus proche');
});

test('focale du commerce la plus proche', () => {
  assert.equal(focaleCourante(3.4), 3.6);
  assert.equal(focaleCourante(5.2), 6);
  assert.equal(focaleCourante(0), 0);
});

test('une entrée saisie à la main est assainie', () => {
  const e = normaliserEntree({ reference: '  Test  ', focaleMin: '13,5', focaleMax: '2.7' });
  assert.equal(e.reference, 'Test');
  assert.equal(e.focaleMin, 2.7, 'les bornes sont remises dans l\'ordre');
  assert.equal(e.focaleMax, 13.5);
  assert.equal(e.type, 'visible');
  assert.ok(e.id, 'un identifiant est attribué');
});


/* ------------------------------------- désignation et échange du catalogue */

test('désignation complète : marque, référence et voie', () => {
  assert.equal(nomComplet({ marque: 'Dahua', reference: 'IPC-HFW', voie: 'contexte' }),
    'Dahua IPC-HFW contexte');
  assert.equal(nomComplet({ marque: '', reference: 'X-1', voie: '' }), 'X-1');
  assert.equal(nomComplet({}), '');
});

test('une entrée corrigée à la main passe pour vérifiée', () => {
  const brute = { reference: 'Test', focaleMin: 4, focaleMax: 4, verifie: false };
  assert.equal(normaliserEntree(brute).verifie, false, 'le drapeau est respecté');
  assert.equal(normaliserEntree({ ...brute, verifie: true }).verifie, true);
  assert.equal(normaliserEntree({ reference: 'Test', focaleMin: 4 }).verifie, true,
    'sans mention, une saisie est tenue pour vérifiée');
});

test('export CSV : en-têtes, point-virgule et virgule décimale', () => {
  const csv = versCsv([normaliserEntree({
    marque: 'Dahua', reference: 'IPC-1', voie: 'contexte',
    focaleMin: 2.7, focaleMax: 13.5, resolution: { h: 2688, v: 1520 },
  })]);
  const [entete, ligne] = csv.split('\r\n');
  assert.match(entete, /^marque;reference;voie;type;capteur;focaleMin;focaleMax;resH;resV;source$/);
  assert.match(ligne, /^Dahua;IPC-1;contexte;visible;/);
  assert.match(ligne, /2,7;13,5;2688;1520;/, 'focales à la française');
});

test('import CSV : colonnes dans n\'importe quel ordre, lignes vides ignorées', () => {
  const csv = [
    'reference;marque;focaleMax;focaleMin;type;resH;resV',
    'IPC-A;Dahua;13,5;2,7;visible;2688;1520',
    ';;;;;;',
    'DS-B;Hikvision;12;2.8;visible;3840;2160',
    'sans focale;Marque;;;visible;;',
  ].join('\n');
  const entrees = depuisCsv(csv);
  assert.equal(entrees.length, 2, 'les lignes inexploitables sont écartées');
  assert.equal(entrees[0].reference, 'IPC-A');
  assert.equal(entrees[0].focaleMin, 2.7);
  assert.equal(entrees[1].marque, 'Hikvision');
  assert.equal(entrees[1].focaleMax, 12);
  assert.ok(entrees.every((e) => e.verifie), 'ce qui vient du distributeur est vérifié');
});

test('import CSV : un fichier vide ou sans en-tête ne casse rien', () => {
  assert.deepEqual(depuisCsv(''), []);
  assert.deepEqual(depuisCsv('reference;focaleMin'), []);
  assert.deepEqual(depuisCsv(null), []);
});

test('aller-retour CSV : le catalogue se retrouve intact', () => {
  const depart = CATALOGUE_INITIAL.map((e, i) => normaliserEntree(e, i));
  const retour = depuisCsv(versCsv(depart));
  assert.equal(retour.length, depart.length);
  retour.forEach((e, i) => {
    assert.equal(e.reference, depart[i].reference);
    assert.equal(e.marque, depart[i].marque);
    assert.equal(e.focaleMin, depart[i].focaleMin);
    assert.equal(e.focaleMax, depart[i].focaleMax);
    assert.equal(e.type, depart[i].type);
  });
});

/* ---------------------------------------- relevé d'un catalogue commercial */

test('intitulé : focale fixe, plage, et suffixe Dahua', () => {
  assert.deepEqual(focaleDepuisIntitule('Hikvision 4K AcuSense Bullet DS-2CD2T86G2-4I F4'), { min: 4, max: 4 });
  assert.deepEqual(focaleDepuisIntitule('DS-2CD2T87G2H-LI - ColorVu Bullet 2.8mm'), { min: 2.8, max: 2.8 });
  assert.deepEqual(
    focaleDepuisIntitule('Hikvision DS-2CD3786G2T-IZS (2,7-13,5 mm) AcuSense 8MP'),
    { min: 2.7, max: 13.5 }, 'décimale à la française',
  );
  assert.deepEqual(
    focaleDepuisIntitule('Dahua DH-IPC-HDW5842TMP-ASE-0280B-S3 Wizmind'),
    { min: 2.8, max: 2.8 }, 'les quatre chiffres du suffixe Dahua donnent la focale',
  );
});

test('intitulé : « (F1) » est une révision de matériel, pas une focale', () => {
  // Sans cette réserve, la speed dome DS-2DE3A400BW-DE se verrait poser un
  // objectif de 1 mm — et l'angle annoncé au client serait absurde.
  assert.equal(focaleDepuisIntitule('Hikvision 4 MP ColorVu Speed Dome DS-2DE3A400BW-DE(F1)(T5)'), null);
});

test('intitulé : un intitulé qui se contredit ne donne pas de focale', () => {
  // Celui-ci annonce « F2.8 » et « 2.8-12 mm » : la fiche technique tranchera.
  assert.equal(
    focaleDepuisIntitule('Hikvision IP Dome DS-2CD2186G2-ISU F2.8/8MP/2.8-12 mm/111°/H.265+'),
    null,
  );
});

test('intitulé : aucune focale plutôt qu\'une focale devinée', () => {
  assert.equal(focaleDepuisIntitule('DAHUA Caméra IP Poe 5MP WizSense IPC-HFW3549T1-AS-PV-S4'), null);
  assert.equal(focaleDepuisIntitule('Axis P3265-LVE High-Perf Fixed Dome CAM W/DLPU'), null);
});

test('intitulé : définition annoncée en pixels, en 4K ou en mégapixels', () => {
  assert.deepEqual(definitionDepuisIntitule('Axis Q3517-LVE Dôme 3072 x 1728 Pixels'), { h: 3072, v: 1728 });
  assert.deepEqual(definitionDepuisIntitule('Axis Q6078-E PTZ UHD 4K 50 Hz'), { h: 3840, v: 2160 });
  assert.deepEqual(definitionDepuisIntitule('Hikvision DS-2CE56D0T-IRPF dôme 1080p 2MP'), { h: 1920, v: 1080 });
  assert.deepEqual(definitionDepuisIntitule('Hikvision 8 MP AcuSense Fixed Bullet'), { h: 3840, v: 2160 });
  assert.equal(definitionDepuisIntitule('Hikvision DS-2CD2786G2-IZS(C) (Noir)'), null);
});

test('intitulé : la référence se distingue du bruit', () => {
  assert.equal(referenceDepuisIntitule('Hikvision Dome DS-2CD1353G0-I F2.8'), 'DS-2CD1353G0-I');
  assert.equal(
    referenceDepuisIntitule('AXIS Q6075-E 50 Hz - Caméra réseau - extérieur - 1920 x 1080-1080p'),
    'Q6075-E', 'un morceau de définition n\'est pas une référence',
  );
});

test('marque déduite du préfixe quand l\'intitulé la tait', () => {
  assert.equal(marqueDepuisReference('DS-2CD2T87G2H-LI'), 'Hikvision');
  assert.equal(marqueDepuisReference('iDS-2CD75C5G0-IZHSY'), 'Hikvision');
  assert.equal(marqueDepuisReference('DH-IPC-HDW5842TMP'), 'Dahua');
  assert.equal(marqueDepuisReference('PNO-A9081R'), 'Hanwha');
  assert.equal(marqueDepuisReference('RG-EG210G-P'), '', 'un routeur ne se voit pas attribuer de marque');
});

test('découpage CSV : les virgules d\'un intitulé restent dans l\'intitulé', () => {
  const lignes = decouperCsv('ASIN,Titre,Ventes\nB01,"Caméra 8 MP, IP67, blanc",12\n');
  assert.equal(lignes.length, 2);
  assert.deepEqual(lignes[1], ['B01', 'Caméra 8 MP, IP67, blanc', '12']);
});

test('relevé commercial : seules les caméras, sans doublon', () => {
  const csv = [
    'ASIN (parent),Titre,Sessions',
    'B01,"Hikvision 4K AcuSense Bullet Camera DS-2CD2T86G2-4I F4",112',
    'B02,"Hikvision 4K AcuSense Bullet Camera DS-2CD2T86G2-4I F4",9',
    'B03,"Ruijie Reyee 24-Port Gigabit Layer 2 Managed Switch RG-NBS3200-24GT4XS",1',
    'B04,"Axis P3265-LVE High-Perf Fixed Dome CAM W/DLPU",17',
  ].join('\n');
  const e = depuisReleveCommercial(csv, { source: 'Relevé de mars' });

  assert.equal(e.length, 2, 'le switch est écarté, le doublon aussi');
  assert.equal(e[0].reference, 'DS-2CD2T86G2-4I');
  assert.equal(e[0].source, 'Relevé de mars');
  assert.ok(estComplete(e[0]), 'focale et définition lues dans l\'intitulé');

  // La seconde n'annonce ni focale ni définition : elle est rendue quand même,
  // marquée incomplète, plutôt que de disparaître sans que personne le sache.
  assert.equal(e[1].reference, 'P3265-LVE');
  assert.ok(!estComplete(e[1]), 'sans focale, elle n\'est pas exploitable');
});

test('relevé commercial : une entrée incomplète n\'est jamais proposée', () => {
  const catalogue = depuisReleveCommercial([
    'Titre',
    '"Axis P3265-LVE High-Perf Fixed Dome CAM W/DLPU"',
    '"Hikvision 8 MP AcuSense Fixed Bullet Camera DS-2CD2T86G2-4I F2.8"',
  ].join('\n'));
  assert.equal(catalogue.length, 2);
  const p = proposer(catalogue, 2.8);
  assert.equal(p.length, 1, 'seule la référence complète est proposable');
  assert.equal(p[0].entree.reference, 'DS-2CD2T86G2-4I');
});

test('relevé commercial : sans colonne d\'intitulés, rien n\'est inventé', () => {
  assert.deepEqual(depuisReleveCommercial('ASIN,Ventes\nB01,12\n'), []);
  assert.deepEqual(depuisReleveCommercial(''), []);
});

test('réserve : le capteur supposé se dit dans le conseil au client', () => {
  const entree = normaliserEntree({
    marque: 'Hikvision', reference: 'DS-2CD2083G2-I', focaleMin: 4, focaleMax: 4,
    resolution: { h: 3840, v: 2160 }, capteurSuppose: true, source: 'Brochure',
  });
  const texte = conseil(4, proposer([entree], 4)).texte;
  assert.match(texte, /DS-2CD2083G2-I/);
  assert.match(texte, /capteur reste à confirmer sur la fiche technique/);
});
