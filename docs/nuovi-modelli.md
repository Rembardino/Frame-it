# Personaggi e animazioni importati

Il branch `nuovi-modelli` sostituisce le figure procedurali con cinque modelli umani importati: `human/giocatore.fbx` di `new_asset`, il pugile Quaternius adattato da `RPG 3D`, due personaggi Mixamo con maglietta e polo e la tennista Carol (CC BY 4.0), forniti dall'utente. Il corpo femminile Quaternius non è più usato. Coprono giocatori, portieri, pugili, golfisti, tennisti, cestisti, pallavolisti, ciclisti, velisti, arbitri, allenatori e spettatori. Il pubblico delle tribune deriva dal calciatore. Gli altri 14 personaggi di `new_asset` sono creature fantasy e vengono usati **esclusivamente dalle mascotte**, come concordato.

Divise, calzettoni, scarpe, carnagione e capelli variano per personaggio e ruolo. Ci sono quattro sagome dei capelli e una variante rasata; i nuovi corpi aggiungono due acconciature ciascuno. Guantoni, guanti del portiere, caschi, copricapo, racchetta, bastone, sacca, numeri di maglia e scatola dell'anello seguono lo scheletro. I pugili usano il nuovo corpo a torso scoperto con pantaloncini; il corpo femminile ha una divisa sportiva opaca. Impiego e licenze delle aggiunte: [rpg-assets.md](rpg-assets.md).

## Esame degli asset

Sono stati esaminati tutti i 15 modelli, i 138 FBX di animazioni nella cartella principale e i 54 FBX contenuti in `Soccer Game Pack.zip`: **192 clip**, con confronto di dimensioni, hash del file e tracce d'animazione. Il risultato è **166 clip distinte utilizzabili**, 24 duplicati delle tracce e due animazioni `Stabbing` escluse perché rappresentano accoltellamenti. Le varianti numerate con movimenti diversi restano distinte. Il kit di grotte non riguarda personaggi e azioni sportive.

Il resoconto completo di `new_asset`, con ogni nome originale, dimensione, hash, duplicato, destinazione e intervallo effettivamente usato, è [asset-audit.json](asset-audit.json). Undici modelli erano FBX 6.1: sono stati convertiti tramite FBX SDK prima dell'ottimizzazione. Tutti i modelli sono stati visualizzati, comprese le creature fantasy. L'ulteriore esame delle 86 clip di `RPG 3D` aggiunge 32 movimenti compilati, per **198 clip complessive**, documentate in [rpg-asset-audit.json](rpg-asset-audit.json); la seconda revisione porta il totale a 199 e documenta correzioni e misure in [animation-review-2.md](animation-review-2.md).

| Contesto | Utilizzo |
| --- | --- |
| Calcio | Passaggi, tiri, rimesse, ricezioni, controllo di ginocchio, palleggi, rotazioni, colpi di testa, conclusioni acrobatiche sui cross, scivolate e inciampi |
| Portieri | Attesa, passi laterali, prese di altezze diverse, raccolte, tuffi, blocchi col corpo, errori, rilanci, rinvii, disposizione della palla e indicazioni ai compagni |
| Boxe | Jab, diretti, ganci e combinazioni, parate, schivate, reazioni a testa e corpo, knockdown, rialzate, ingresso e conteggio dell'arbitro |
| Golf | Drive, chip/approcci/bunker, putt, routine dopo il colpo, delusione ed esultanza |
| Comuni | Camminate, corse, movimenti laterali e all'indietro, cambi di direzione, cadute, recuperi, telefonate degli allenatori, danze, baci al pubblico ed esultanze inginocchiate |

Per i gesti specifici di basket, tennis, pallavolo, ciclismo e vela che non hanno una cattura corrispondente, la coreografia del gioco muove il nuovo scheletro. I momenti a due, come baci e abbracci tra spettatori, mantengono i contatti della coreografia condivisa. Le clip `Kiss` fornite sono usate come baci al pubblico nelle esultanze.

Le rotazioni vengono trasferite tra gli scheletri usando la posa di riferimento; il movimento orizzontale rimane controllato dalla simulazione. La scelta cambia fra personaggi, partite ed eventi ripetuti. Il campionamento dipende dallo stato registrato, e il replay conserva gesto, variante e aspetto della mascotte. Le vecchie clip restano leggibili.

I colpi usano un rimappamento temporale verso l'istante di contatto. Per il golf vengono isolati i segmenti attivi delle lunghe preparazioni. Il bastone è calibrato sulla presa e sul contatto previsto; le azioni procedurali adattano la lunghezza degli arti ai punti di contatto. I tuffi laterali possono essere specchiati per seguire il lato della parata.

## Dimensioni e caricamento

- Giocatore: da 48.140 a 5.952 triangoli, circa 541 kB con texture.
- Nuovi corpi Quaternius: pugile da 5.117 triangoli / 258 kB; atleta da 6.560 triangoli / 380 kB, incluse le texture.
- Pubblico: 666 triangoli per figura, con sei pose precalcolate e disegno tramite istanze sulla GPU.
- Texture: massimo 512 × 512, WebP; geometrie e texture condivise fra personaggi.
- Animazioni: 24 campioni al secondo, quaternioni e spostamento verticale quantizzati a 16 bit, compressi con gzip; circa 2,4 MB compressi. Nessun FBX originale è caricato durante il gioco.
- Tutti gli asset pronti per il gioco occupano circa 8 MB. Il pacchetto HTML offline completo occupa circa 11,7 MB e incorpora anche le mascotte.

La partita e gli esercizi diventano disponibili quando modelli e animazioni sono pronti. Il caricamento ha uno stato visibile nelle cinque lingue; un errore offre il pulsante per riprovare.

## Rigenerazione

Gli asset ottimizzati sono già nel repository; per giocare bastano `npm install` e `npm run dev`. Per rigenerarli dagli originali, i percorsi predefiniti sono `Downloads/new_asset` del profilo utente e `artifacts/asset-tools/FBX2glTF.exe`.

1. Scaricare il convertitore Windows dalla [release ufficiale FBX2glTF 0.9.7](https://github.com/facebookincubator/FBX2glTF/releases/tag/v0.9.7) e posizionarlo come indicato, oppure passare il percorso come secondo argomento a `convert-human-assets.mjs`.
2. Eseguire `node scripts/inspect-character-assets.mjs` per l'inventario dei FBX.
3. Eseguire `node scripts/convert-human-assets.mjs` per convertire i 15 modelli.
4. Eseguire `node scripts/prepare-models.mjs` per geometrie e texture pronte per il gioco.
5. Eseguire `node scripts/prepare-animations.mjs` per estrarre lo ZIP, confrontare le clip, creare la libreria binaria e aggiornare l'audit.
6. Eseguire `node scripts/prepare-mixamo-athletes.mjs [cartella]` per i corpi con maglietta, polo e la tennista Carol (`character.fbx`, `character (2).fbx`, `carol-tennis.fbx`; cartella predefinita `Downloads`). Dettagli in [animation-review-2.md](animation-review-2.md#35-bis-abbigliamento-sportivo-modelli-forniti-dallutente).
7. Eseguire `node scripts/prepare-rpg-models.mjs` e poi `node scripts/prepare-rpg-animations.mjs` per aggiungere corpi e animazioni Quaternius. Percorsi e procedura sono in [rpg-assets.md](rpg-assets.md).

Il primo argomento dei comandi di inventario e animazione può indicare una diversa cartella `new_asset`; il primo argomento della conversione indica direttamente la cartella `human`. Gli originali non vengono modificati. Le dipendenze di conversione sono solo di sviluppo.

## Verifiche

`npm run check:characters` carica gli otto sport in Chromium, rende un gesto reale per sport, verifica che atleti e pubblico usino i nuovi asset e confronta esattamente le trasformazioni dello scheletro prima e dopo un replay. Controlla anche che i replay precedenti mantengano il loro catalogo di animazioni. Le immagini sono in `artifacts/characters/`.

`npm run review:animations` rende ogni clip a due istanti, controlla che lo scheletro non contenga valori non finiti o deformazioni esplose e salva 70 tavole in `artifacts/animation-review/`. Per usare i nuovi corpi: `npm run review:animations -- --sport=boxe` oppure `--sport=pallavolo`; `--rpg-only` limita la revisione alle 32 aggiunte. `npm run check:characters:offline` ricrea il contenitore mobile e apre calcio, boxe e golf con la rete disabilitata, controllando che modelli e animazioni siano disponibili senza richieste HTTP.

Restano applicabili le verifiche di simulazione, movimento, gameplay, esercizi, clip persistenti, traduzioni e momenti segreti descritte nel README.
