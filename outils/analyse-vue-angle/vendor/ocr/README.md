# Moteur OCR

Lecture des études **scannées**, c'est-à-dire des PDF qui ne contiennent aucun
texte, seulement l'image d'une page papier.

| Fichier | Provenance |
| --- | --- |
| `tesseract.min.js`, `worker.min.js` | Tesseract.js 5.1.1 |
| `tesseract-core-simd-lstm.wasm.js` | tesseract.js-core 5.1.1 (moteur WebAssembly, variante LSTM) |
| `fra.traineddata.gz` | modèle de langue française (`@tesseract.js-data/fra`, variante `4.0.0_best_int`) |

Le tout est distribué sous licence Apache 2.0 — texte complet dans
`LICENSE-tesseractjs.txt` — et livré sans modification.

## Pourquoi ces fichiers précis

Le moteur doit fonctionner **hors ligne, page ouverte depuis le disque**. Dans
ce contexte, un worker ne peut ni importer un second script mémoire, ni lire un
fichier voisin. `js/ocr.js` assemble donc moteur, modèle de langue et worker en
un seul script, et détourne la requête réseau que la bibliothèque ferait pour
aller chercher le modèle.

C'est la raison du choix de la variante `*-simd-lstm.wasm.js` : elle embarque le
WebAssembly dans le JavaScript, et évite un second téléchargement impossible à
satisfaire dans ce contexte.

## Mise à jour

```bash
npm pack tesseract.js@<version>
npm pack tesseract.js-core@<version>
npm pack @tesseract.js-data/fra
```

Puis reprendre les fichiers ci-dessus. Vérifier ensuite que
`npm run test:navigateur` passe toujours : la version 5.1.1 construit le nom de
langue à partir des données binaires lorsqu'on les fournit en mémoire, ce qui
oblige à passer par l'interception de requête plutôt que par l'API prévue. Si ce
défaut est corrigé en amont, le contournement pourra être simplifié.
