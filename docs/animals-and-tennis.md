# Nuovi animali e varianti della tennista

I quattro archivi forniti in `Downloads/new_animals` sono stati esaminati senza modificare gli originali. L'inventario completo è in `artifacts/animals/inventory.json`; le scelte e le dimensioni finali sono in [animal-asset-audit.json](animal-asset-audit.json).

- Da `eagle.zip` viene usata l'aquila con scheletro e animazione del volo: circa 4.500 triangoli e 375 KiB dopo l'ottimizzazione.
- Dal pacchetto grande viene estratto il lupo animato, adattato a un cane da sentiero con muso e coda più compatti e collare. Conserva l'andatura originale, usa la texture del pelo fornita e pesa circa 561 KiB. La colorazione rossa/nera della scena dimostrativa era vernice sui vertici: è stata rimossa dal modello usato nel gioco.
- La seconda aquila è stata convertita e conservata come alternativa in `artifacts/animals/eagle-alternative.glb`.
- Il rinoceronte non viene incluso: non ci sono eventi che lo usano. Gli altri animali del grande pacchetto sono un'unica scena statica; non vengono caricati nel gioco perché non hanno animazioni separate utilizzabili.

Gli asset attivi sono `src/assets/animals/eagle.glb` e `src/assets/animals/husky.glb`. `scripts/prepare-animal-models.mjs` genera i modelli ottimizzati dai sorgenti estratti e convertiti. Le animazioni vengono campionate dalla distanza percorsa e dal tempo assoluto della simulazione, così un replay o un salto temporale riproducono la stessa posa. La schermata iniziale aspetta anche il caricamento di questi modelli, inclusi nel bundle offline.

La tennista usa sei varianti dello stesso modello importato: capelli lunghi con visiera, caschetto, taglio corto, chignon, coda e riga laterale. Cambiano anche colore dei capelli, carnagione e proporzioni del viso. Le geometrie vengono conservate in cache; ossa, snodi e animazioni originali rimangono disponibili. Il campo `appearance`, già registrato nelle clip, seleziona anche la variante durante il replay. Le varianti sono usate anche dalla golfista e dagli altri personaggi che condividono il modello Carol.

Nomi e sigle dei club sono tradotti nelle cinque lingue dell'app in `src/i18n/teams.ts`, compresi menu, tabellone, schermo nello stadio e ticker dei replay. I nomi personali di pugili, tennisti e golfisti mantengono la grafia originale. I salvataggi continuano a conservare chiavi e ID indipendenti dalla lingua.

Controlli mirati: `npm run check:animals`, `npm run check:tennis-looks`, `node scripts/check-i18n.mjs --teams`, build e controllo offline. Anteprime: `artifacts/animals/review/` e `artifacts/tennis-looks/six-styles.png`.
