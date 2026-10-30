# Nuova visuale: meno finto, più ripresa TV

Piano del 30 ottobre 2026 (branch `new-visual`).

## Diagnosi

La scena oggi è leggibile ma "da plastilina": luce piatta e uguale ovunque, erba e parquet senza rilievo né usura, tribune fatte di scatole con un pubblico di cilindri tutti uguali e immobili, nessuna traccia delle azioni (niente polvere, niente scia della palla, niente flash dai distinti). Le tre cose che un occhio riconosce subito come "finte" sono: l'illuminazione, la folla e l'assenza di conseguenze fisiche dei gesti.

## Obiettivo

Una ripresa serale da stadio, credibile a colpo d'occhio: fari che illuminano davvero, superfici con grana e consumo, tribune strutturate e vive, atleti con più dettaglio nel vestiario, effetti che seguono le azioni (terra sollevata, scia e schiacciamento della palla, flash, coriandoli, bandiere). Tutto procedurale, senza asset scaricati, con costo compatibile con i telefoni medi (instancing, poche luci, nessun post-processing pesante).

## Programma

1. **Luce e atmosfera** (`render/stage.ts`)
   - Ombre morbide (PCFSoft), esposizione e fog tarati per la sera; luce di riempimento fredda dal cielo e calda dai fari.
   - Fari che "lavorano": coni di luce volumetrici additivi dalle torri verso il campo, alone più grande, lampade a griglia di proiettori.
   - Cielo con foschia all'orizzonte, velature di nuvole procedurali e luna; le stelle restano.
2. **Superfici** (`render/stage.ts`, `render/sportCourts.ts`, `render/surfaces.ts`)
   - Erba: due tagli incrociati, rumore a fili d'erba, zone consumate (aree di porta, cerchio di centrocampo, fascia dei raccattapalle), linee leggermente imperfette, bump map per il rilievo.
   - Parquet con assi e venature, zona di terra battuta con righe dei piedi, pavimento del palazzetto con riflesso leggero.
   - Mappa di rugosità/rilievo generata insieme al colore, così il controluce dei fari dà "grana" alle superfici.
3. **Stadio** (`render/stage.ts`)
   - Tribune a settori con scale/vomitori, parapetto frontale, muro di fondo e corridoio dietro l'ultima fila.
   - Cartelloni LED che scorrono (offset UV animato), maxischermo di fondo con punteggio e orologio aggiornati dalla partita.
   - Postazioni TV e fotografi a bordo campo, tunnel, panchine coperte.
4. **Pubblico** (`render/crowd.ts`)
   - Varietà: altezza, corporatura, colori di maglia/sciarpa, qualcuno seduto e qualcuno in piedi.
   - Dinamica: ci si alza in piedi quando sale l'eccitazione, ola che percorre la tribuna lunga, braccia al cielo nei gol, applausi.
   - Bandiere sventolanti nelle curve (instanced, colore squadra), flash delle macchine fotografiche che aumentano nei momenti caldi.
5. **Atleti** (`render/athlete.ts`)
   - Divise più ricche: colletto, polsini, numero anche sul pantaloncino, fascia di capitano, parastinchi, scarpe di colori diversi, calzettoni con bordo.
   - Volti: barba per alcuni, sopracciglia più marcate; pelle e tessuto con rugosità diverse.
6. **Effetti delle azioni** (nuovo `render/effects.ts`, hook in `main.ts`)
   - Lettura delle cue della partita (calcio, rimbalzo, contrasto, pugno, gol, punto) prima dell'audio.
   - Particelle: zolle/polvere su calci e scivolate, terra rossa sui rimbalzi della pallina, sudore sui colpi di boxe, coriandoli e flash sui gol.
   - Palla: scia quando è veloce, schiacciamento al rimbalzo, ombra che si allarga col volo.
7. **Finitura TV** (`style.css`)
   - Leggera vignettatura e grana sulla ripresa, senza toccare l'HUD.
8. **Verifiche**
   - `npm run build`, `npm run check`, `npm run check:gameplay` (screenshot in `artifacts/gameplay/`), `npm run check:mobile`.
   - Confronto visivo prima/dopo per i cinque sport da stadio; i mondi del drone (golf, ciclismo, vela) non cambiano.

## Stato

- [x] Luce e atmosfera
- [x] Superfici
- [x] Stadio
- [x] Pubblico
- [x] Atleti
- [x] Effetti delle azioni
- [x] Finitura TV
- [x] Verifiche e documentazione

## Risultati

Tutto resta procedurale (nessun asset esterno) e il bundle offline si ricostruisce con `npm run build`.

- **Luce**: ombre morbide, due fari incrociati (caldo principale con ombre, caldo secondario, controluce freddo), cielo con foschia all'orizzonte, velature e luna. I coni di luce nella foschia partono solo dalle torri di fronte alla camera: quelle alle sue spalle li proietterebbero attraverso l'obiettivo e sbiancherebbero l'inquadratura. Boxe: platea in penombra e riflettore sul ring.
- **Superfici**: erba con taglio incrociato, fili d'erba, usura nelle aree di porta, sul dischetto e a centrocampo, bordo campo meno curato, bump map per il rilievo. Parquet con assi sfalsate, venature e finitura lucida. `courtSurface` accetta una mappa di rilievo opzionale (`reliefTile`).
- **Stadio**: tribune a settori con scale, parapetto, muro di fondo e corridoio; cartelloni LED che scorrono; maxischermo con squadre, punteggio e minuto aggiornati dalla partita (`stage.update`); due postazioni TV in tribuna.
- **Pubblico**: scala realistica (≈1,3 m), corporature diverse, sciarpe, braccia lungo i fianchi; seduti quando la partita è tranquilla, in piedi con l'eccitazione (le curve quasi sempre in piedi), ola periodica sulla tribuna lunga, braccia alzate nell'esultanza, bandiere sventolanti nelle curve, flash delle fotocamere più fitti nei momenti caldi.
- **Atleti**: polsini, colletto, striscia sui pantaloncini, bordo dei calzettoni, parastinchi nel calcio, scarpe di colori diversi per giocatore, fascia di capitano, barbe e qualche calvo, maglia a strisce per la seconda squadra di calcio e basket, sponsor e stemma.
- **Effetti** (`render/effects.ts`): zolle sui calci, tiri, parate, contrasti e passi di corsa; terra rossa sui rimbalzi e sulle scivolate nel tennis; sudore sui colpi di boxe; coriandoli dalla curva al gol; scia della palla sopra i 9 m/s; schiacciamento della palla al rimbalzo (`ActorViews.bounce`). Le cue vengono lette prima che l'audio le consumi; nessuna modifica alla simulazione.
- **TV**: vignettatura leggera sui bordi della ripresa (`#app::after`), fuori dall'HUD e dalle foto dell'album (che leggono il canvas).

Verifiche: `npm run build`, `npm run check`, `npm run check:gameplay` (screenshot in `artifacts/gameplay/`), `npm run check:mobile`. I mondi del drone (golf, ciclismo, vela) usano solo il nuovo pubblico; il resto non cambia. Le prestazioni su telefono vanno provate su un dispositivo reale: i costi aggiunti sono pochi draw call in più per il pubblico (instancing), un sistema di particelle da 700 punti e una sola luce in più nella boxe.
