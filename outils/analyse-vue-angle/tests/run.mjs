/**
 * Tests des modules de calcul — exécution : node outils/analyse-vue-angle/tests/run.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPTEURS, anglesDeChamp, couverture, focaleRequise, pixelsParMetre,
  distanceDori, niveauDori, fractionVersAngle, zoneMorte, angleInclinaison,
} from '../js/optique.js';
import { creerImage, estimerTransformation, correlation, redimensionner } from '../js/alignement.js';
import { diagnostiquer, noter } from '../js/diagnostic.js';
import { elider, fr, frGroupe } from '../js/format.js';

const proche = (a, b, tol, message) => assert.ok(
  Math.abs(a - b) <= tol,
  `${message || ''} — attendu ${b} ± ${tol}, obtenu ${a}`,
);

/* ------------------------------------------------------------------ optique */

test('angle de champ : capteur 1/2.8" et focale 4 mm ≈ 65,7°', () => {
  const a = anglesDeChamp(CAPTEURS['1/2.8"'], 4);
  proche(a.horizontal, 65.7, 0.5, 'HFOV');
  proche(a.vertical, 40.1, 0.5, 'VFOV');
  assert.ok(a.diagonal > a.horizontal && a.horizontal > a.vertical);
});

test('angle de champ : une focale plus longue resserre le champ', () => {
  const court = anglesDeChamp(CAPTEURS['1/2.8"'], 2.8).horizontal;
  const long = anglesDeChamp(CAPTEURS['1/2.8"'], 12).horizontal;
  assert.ok(court > long);
});

test('couverture et focale requise sont réciproques', () => {
  const capteur = CAPTEURS['1/2.8"'];
  const f = focaleRequise(capteur.largeur, 8, 20); // 8 m de large à 20 m
  const largeur = couverture(anglesDeChamp(capteur, f).horizontal, 20);
  proche(largeur, 8, 0.01, 'largeur couverte');
});

test('pixels par mètre et distances DORI cohérents', () => {
  const angleH = anglesDeChamp(CAPTEURS['1/2.8"'], 4).horizontal;
  const dIdent = distanceDori(1920, angleH, 250);
  proche(pixelsParMetre(1920, angleH, dIdent), 250, 0.5, 'PPM à la distance d\'identification');
  assert.equal(niveauDori(pixelsParMetre(1920, angleH, dIdent)), 'identification');
  assert.ok(distanceDori(1920, angleH, 25) > dIdent);
  assert.equal(niveauDori(10), 'insuffisant');
});

test('fractionVersAngle : un décalage d\'une demi-image vaut un demi-angle de champ', () => {
  proche(fractionVersAngle(0.5, 90), 45, 1e-9, 'demi-champ');
  proche(fractionVersAngle(0, 90), 0, 1e-12, 'décalage nul');
  // Non linéaire : un quart d'image vaut plus que la moitié du demi-champ
  // (26,6° et non 22,5°), car la projection est en tangente.
  proche(fractionVersAngle(0.25, 90), 26.565, 0.01, 'quart d\'image');
});

test('géométrie de pose : inclinaison et zone morte', () => {
  proche(angleInclinaison(4, 4), 45, 1e-9, 'inclinaison à 45°');
  // Caméra à 3 m, inclinée de 45°, champ vertical 40° : bord bas à 65°.
  proche(zoneMorte(3, 45, 40), 3 / Math.tan((65 * Math.PI) / 180), 1e-9, 'zone morte');
});

/* --------------------------------------------------------------- alignement */

/** Générateur pseudo-aléatoire déterministe. */
function prng(graine) {
  let s = graine >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Scène synthétique texturée : la graine change aussi la structure, pas seulement le bruit. */
function sceneTest(largeur, hauteur, graine = 42) {
  const alea = prng(graine);
  const f1 = 8 + alea() * 12;
  const f2 = 5 + alea() * 10;
  const f3 = 15 + alea() * 20;
  const fSol = 20 + alea() * 45;
  const hSol = 0.55 + alea() * 0.2;
  const img = creerImage(largeur, hauteur);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      const u = x / largeur;
      const v = y / hauteur;
      let val = 0.45 + 0.2 * Math.sin(u * f1) * Math.cos(v * f2) + 0.12 * Math.sin((u + v) * f3);
      if (v > hSol) val += 0.18 * Math.sin(u * fSol); // sol texturé
      img.data[y * largeur + x] = val + 0.03 * alea();
    }
  }
  // Ouvertures franches : de vraies structures pour la corrélation.
  const rect = (x0, y0, x1, y1, val) => {
    for (let y = Math.round(y0 * hauteur); y < Math.round(y1 * hauteur); y += 1) {
      for (let x = Math.round(x0 * largeur); x < Math.round(x1 * largeur); x += 1) {
        img.data[y * largeur + x] = val;
      }
    }
  };
  for (let i = 0; i < 4; i += 1) {
    const x0 = 0.05 + alea() * 0.6;
    const y0 = 0.1 + alea() * 0.6;
    rect(x0, y0, x0 + 0.08 + alea() * 0.12, y0 + 0.08 + alea() * 0.14, alea() > 0.5 ? 0.95 : 0.05);
  }
  return img;
}

/** Applique une transformation connue pour fabriquer la « vue réglée ». */
function deformer(ref, { tx = 0, ty = 0, echelle = 1, rotation = 0, gain = 1, offset = 0 }) {
  const out = creerImage(ref.largeur, ref.hauteur);
  const cos = Math.cos((-rotation * Math.PI) / 180);
  const sin = Math.sin((-rotation * Math.PI) / 180);
  const cx = (ref.largeur - 1) / 2;
  const cy = (ref.hauteur - 1) / 2;
  for (let y = 0; y < ref.hauteur; y += 1) {
    for (let x = 0; x < ref.largeur; x += 1) {
      const dx = (x - cx - tx * ref.largeur) / echelle;
      const dy = (y - cy - ty * ref.largeur) / echelle;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);
      const v = sx >= 0 && sy >= 0 && sx < ref.largeur && sy < ref.hauteur
        ? ref.data[sy * ref.largeur + sx]
        : 0.5;
      out.data[y * ref.largeur + x] = v * gain + offset;
    }
  }
  return out;
}

test('recalage : images identiques → transformation neutre', () => {
  const ref = sceneTest(320, 180);
  const t = estimerTransformation(ref, ref);
  proche(t.tx, 0, 0.01, 'tx');
  proche(t.ty, 0, 0.01, 'ty');
  proche(t.echelle, 1, 0.03, 'échelle');
  proche(t.rotation, 0, 0.8, 'rotation');
  assert.ok(t.zncc > 0.95, `corrélation trop faible : ${t.zncc}`);
});

test('recalage : translation pure retrouvée', () => {
  const ref = sceneTest(320, 180);
  const act = deformer(ref, { tx: 0.08, ty: -0.05 });
  const t = estimerTransformation(ref, act);
  proche(t.tx, 0.08, 0.015, 'tx');
  proche(t.ty, -0.05, 0.015, 'ty');
});

test('recalage : zoom retrouvé', () => {
  const ref = sceneTest(320, 180);
  const act = deformer(ref, { echelle: 1.15 });
  const t = estimerTransformation(ref, act);
  proche(t.echelle, 1.15, 0.04, 'échelle');
});

test('recalage : roulis retrouvé', () => {
  const ref = sceneTest(320, 180);
  const act = deformer(ref, { rotation: 4 });
  const t = estimerTransformation(ref, act);
  proche(t.rotation, 4, 1.2, 'rotation');
});

test('recalage : insensible à un fort changement d\'exposition', () => {
  const ref = sceneTest(320, 180);
  const act = deformer(ref, { tx: 0.06, gain: 0.35, offset: 0.3 });
  const t = estimerTransformation(ref, act);
  proche(t.tx, 0.06, 0.02, 'tx malgré l\'exposition');
  assert.ok(t.zncc > 0.8, `corrélation trop faible : ${t.zncc}`);
});

/** Image sans structure commune avec la scène de référence. */
function imageSansRapport(largeur, hauteur, graine) {
  const alea = prng(graine);
  const img = creerImage(largeur, hauteur);
  for (let i = 0; i < img.data.length; i += 1) img.data[i] = alea();
  return img;
}

test('recalage : une image sans rapport est signalée comme non fiable', () => {
  const ref = sceneTest(320, 180);
  const t = estimerTransformation(ref, imageSansRapport(320, 180, 77));
  assert.ok(t.zncc < 0.2, `corrélation anormalement élevée : ${t.zncc}`);
  const d = diagnostiquer(t, { horizontal: 65.7, vertical: 40.1 });
  assert.equal(d.fiable, false);
  assert.equal(d.verdict, 'indetermine');
  assert.match(d.consignes[0].texte, /pas fiable/);
});

test('recalage : la corrélation sépare nettement une vraie paire d\'une fausse', () => {
  const ref = sceneTest(320, 180);
  const vraie = estimerTransformation(ref, deformer(ref, { tx: 0.05, gain: 0.6, offset: 0.2 }));
  const fausse = estimerTransformation(ref, imageSansRapport(320, 180, 404));
  assert.ok(vraie.zncc > fausse.zncc + 0.5, `marge insuffisante : ${vraie.zncc} vs ${fausse.zncc}`);
});

test('corrélation : le recouvrement décroît quand on décale', () => {
  const ref = redimensionner(sceneTest(320, 180), 64, 36);
  const centre = correlation(ref, ref, { tx: 0, ty: 0, echelle: 1, rotation: 0 });
  const decale = correlation(ref, ref, { tx: 0.4, ty: 0, echelle: 1, rotation: 0 });
  assert.equal(centre.recouvrement, 1);
  assert.ok(decale.recouvrement < 0.65);
});

/* ---------------------------------------------------------------- diagnostic */

const ANGLES = { horizontal: 65.7, vertical: 40.1 };

test('notation : 100 sans écart, 80 à la tolérance, 0 à trois fois la tolérance', () => {
  proche(noter(0, 2), 100, 1e-9);
  proche(noter(2, 2), 80, 1e-9);
  proche(noter(6, 2), 0, 1e-9);
  proche(noter(-2, 2), 80, 1e-9, 'écart négatif');
});

test('diagnostic : vue conforme', () => {
  const d = diagnostiquer({ tx: 0, ty: 0, echelle: 1, rotation: 0, zncc: 0.97, recouvrement: 1 }, ANGLES);
  assert.equal(d.verdict, 'conforme');
  assert.equal(d.score, 100);
  assert.equal(d.consignes.length, 1);
  assert.match(d.consignes[0].texte, /aucune intervention/i);
});

test('diagnostic : caméra pointant trop à droite → consigne vers la gauche', () => {
  // Le contenu décalé vers la gauche (tx < 0) traduit une caméra trop à droite.
  const d = diagnostiquer({ tx: -0.1, ty: 0, echelle: 1, rotation: 0, zncc: 0.9, recouvrement: 0.9 }, ANGLES);
  assert.ok(d.ecarts.pan > 0, 'écart de pan positif');
  proche(d.ecarts.pan, fractionVersAngle(0.1, ANGLES.horizontal), 0.01, 'pan');
  assert.match(d.consignes[0].texte, /vers la gauche/);
});

test('diagnostic : caméra trop basse → consigne de relevage', () => {
  // Caméra inclinée vers le bas : le contenu remonte dans l'image (ty < 0).
  const d = diagnostiquer({ tx: 0, ty: -0.09, echelle: 1, rotation: 0, zncc: 0.9, recouvrement: 0.9 }, ANGLES);
  assert.ok(d.ecarts.site > 0);
  assert.match(d.consignes[0].texte, /Relever/);
});

test('diagnostic : cadrage trop serré → élargir, focale conseillée', () => {
  const d = diagnostiquer(
    { tx: 0, ty: 0, echelle: 1.2, rotation: 0, zncc: 0.9, recouvrement: 0.9 },
    ANGLES,
    { focale: 6 },
  );
  proche(d.ecarts.zoom, 20, 0.01, 'écart de zoom');
  assert.match(d.consignes[0].texte, /Élargir/);
  assert.match(d.consignes[0].texte, /5 mm/); // 6 / 1,2
});

test('diagnostic : écart modéré → ajustement, écart important → non conforme', () => {
  const leger = diagnostiquer({ tx: -0.04, ty: 0, echelle: 1, rotation: 0, zncc: 0.9, recouvrement: 0.9 }, ANGLES);
  assert.equal(leger.verdict, 'ajustement');
  const lourd = diagnostiquer({ tx: -0.25, ty: 0.1, echelle: 1, rotation: 0, zncc: 0.9, recouvrement: 0.9 }, ANGLES);
  assert.equal(lourd.verdict, 'non-conforme');
  assert.ok(lourd.score < leger.score);
});

test('diagnostic : décalage traduit en mètres sur la scène', () => {
  const d = diagnostiquer(
    { tx: -0.1, ty: 0, echelle: 1, rotation: 0, zncc: 0.9, recouvrement: 0.9 },
    ANGLES,
    { distance: 20 },
  );
  const attendu = 20 * Math.tan((d.ecarts.pan * Math.PI) / 180);
  proche(d.decalageScene.horizontal, attendu, 0.02, 'décalage horizontal');
});

test('diagnostic : tolérances personnalisables', () => {
  const t = { tx: -0.02, ty: 0, echelle: 1, rotation: 0, zncc: 0.9, recouvrement: 0.9 };
  assert.equal(diagnostiquer(t, ANGLES, { tolerances: { angle: 3 } }).verdict, 'conforme');
  assert.notEqual(diagnostiquer(t, ANGLES, { tolerances: { angle: 0.3 } }).verdict, 'conforme');
});

/* ------------------------------------------------------------------- format */

test('élision : « de reconnaître », mais « d\'identifier »', () => {
  assert.equal(elider('reconnaître une personne'), 'de reconnaître une personne');
  assert.equal(elider('repérer une présence'), 'de repérer une présence');
  assert.equal(elider('identifier un inconnu'), "d'identifier un inconnu");
  assert.equal(elider('observer ce qui se passe'), "d'observer ce qui se passe");
  assert.equal(elider('Élargir'), "d'Élargir", 'la majuscule accentuée compte aussi');
});

test('nombres : virgule française et milliers insécables', () => {
  assert.equal(fr(6.42), '6,4');
  assert.equal(frGroupe(15552), '15\u202f552');
});
