# Points à traiter avant remise — ETU-2026-09-22

Établi le 22 septembre 2026, avec le document. Ce fichier ne part PAS au
client : il ne contient que ce que l'agence doit lever de son côté.

## Identité de l'agence

Relevé Insee du 22/09/2026 : SAS créée le 1er juin 2026,
SIREN 104 732 458, APE 8020Z. Tout est dans agence.json, à la
racine du dépôt, et tout document du dépôt le lit là. Rien à ressaisir.

Ce que le relevé Insee ne donne pas, et qu'une SAS porte sur ses
documents commerciaux :

- Capital social.
- Ville du greffe, pour la mention RCS. Le NUMÉRO est acquis — c'est le SIREN. Seule la ville manque.
- Assurance responsabilité civile professionnelle : compagnie et numéro de police.

## À corriger sur le site, pas dans les documents

Les pages publiques du site (mentions légales, CGV) annoncent encore
« NGS38, entreprise individuelle » et « RCS Sens 518 723 366 ». C'est
la structure précédente : la SAS ci-dessus a été créée le 1er juin 2026.
À corriger sur le site, pas dans les documents.

## Fiches constructeur à ouvrir

Aucune fiche n'a pu être consultée à la source depuis l'atelier : le
réseau y bloque hikvision.com comme les sites qui en hébergent des copies.
Tout ce qui suit vient de recherches documentaires.

Deux familles de chiffres en dépendent, et pas au même titre :

- les OPTIQUES commandent toutes les portées DORI du document. Une
  optique fausse les fausse toutes ;
- les CONSOMMATIONS commandent le budget PoE et le dimensionnement de
  l'onduleur : 9 W, 15 W, 12.5 W.

- Hikvision DS-2CD2346G2H-IU (2,8 mm) — Champ horizontal 100,2° et définition 2688 × 1520 relevés par recherche documentaire (fiche DS-2CD2346G2H-I(U), éd. 13/05/2024). Infrarouge 30 m annoncé par plusieurs revendeurs. À CONFIRMER sur la fiche.
- Hikvision DS-2CD2683G2-IZS (2,8–12 mm motorisé) — Champ horizontal 108° à 30° et définition 3840 × 2160 relevés par recherche documentaire (fiche DS-2CD2683G2-IZS V5.5.113). Portée infrarouge NON RELEVÉE. À CONFIRMER sur la fiche.
- Hikvision DS-2CD2346G2P-ISU/SL (2,8 mm)(C) — Deux objectifs de 2,8 mm assemblés en 180°, définition 3040 × 1368, infrarouge 30 m : relevés par recherche documentaire (fiche DS-2CD2346G2P-ISU/SL, éd. 27/03/2024). À CONFIRMER sur la fiche.

## Enregistreur

- Les trois chiffres relevés par recherche, à confirmer sur la fiche : budget PoE total de 200 W, 10 To par baie, absence de RAID. Les serveurs de fiches sont bloqués depuis l'atelier et aucun n'a pu être ouvert à la source.
- Le plafond par baie selon la RÉVISION livrée. Les éditions courantes annoncent 10 To, la révision (D) 16 To. Le dossier retient 10 : se tromper vers le bas fait acheter un disque de trop, vers le haut un disque inutilisable.
- Comment les coffrets déportés s'y raccordent. Un commutateur placé derrière un port PoE d'enregistreur Hikvision fonctionne, mais sort de la reconnaissance automatique : les caméras qui sont derrière s'ajoutent alors à la main, par leur adresse. Le raccordement par le port réseau est plus sain. À arrêter à la mise en service, pas sur le chantier.

## Interphonie

- Le nombre de ports du commutateur fourni, et son budget PoE. Le kit alimente au moins la platine et le moniteur ; savoir s'il peut porter davantage évite d'en acheter un second.
- Les contacts de commande disponibles sur la platine : nature (sec ou alimenté), nombre, pouvoir de coupure. C'est ce qui décide si la platine commande directement le verrouillage ou passe par un relais.
- La compatibilité des badges déjà en service sur le site, le cas échéant. Le 13,56 MHz recouvre plusieurs protocoles qui ne se lisent pas entre eux.

## À vérifier sur le document lui-même

- La vue aérienne porte un repère commercial qui identifie le voisinage.
  À retirer si le dossier doit circuler au-delà du client.
- Les visuels de matériel ont été rapprochés des références à la forme
  seulement. Vérifier que chaque image correspond bien à la référence.

## Hypothèses du plan

- Longueur de bâtiment supposée : 75 m. Tout le plan
  et tout le métré en dépendent. Une seule cote relevée les recale.
- Emplacement du local technique supposé, côté bureaux. Le déplacer change
  toutes les longueurs de câble.
- Arrivée 230 V au portail : nécessaire au coffret d'entrée, non vérifiée.

