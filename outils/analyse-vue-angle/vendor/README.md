# Bibliothèque tierce

`pdf.min.js` et `pdf.worker.min.js` proviennent de **PDF.js** (Mozilla),
version 3.11.174, distribué sous licence Apache 2.0 — texte complet dans
`LICENSE-pdfjs.txt`.

Ces fichiers servent à ouvrir le PDF de l'étude directement dans l'outil, sans
connexion Internet. Ils sont livrés tels quels, sans modification.

Mise à jour : `npm pack pdfjs-dist@<version>`, puis reprendre `build/pdf.min.js`
et `build/pdf.worker.min.js` depuis l'archive. Rester sur une version 3.x : ce
sont les dernières à fournir des fichiers utilisables sans module ES, condition
pour que la page fonctionne en ouverture directe depuis le disque.
