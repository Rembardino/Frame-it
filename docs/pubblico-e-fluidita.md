# Pubblico vivo, scenografia e fluidità

Lavoro del 10 novembre 2026 sul branch `nuovi-modelli`, dopo la 1.0.14. Non ancora pubblicato.

## Pubblico (`render/crowd.ts`, `createCrowdHumans` in `render/characters.ts`)

- **Aspetto**: carnagioni, capelli (calvi, corti, lunghi, cinque colori), pantaloni lunghi o corti, calze e scarpe diversi per ogni tifoso. Capelli e occhi sono dipinti nello shader della testa: le ciocche e la texture del modello semplificato lasciavano macchie. Due parti in meno da disegnare per tribuna e circa tre quarti di vertici in meno per tifoso.
- **Sedili**: la seduta è all'altezza giusta; chi è seduto sta sul sedile, chi è in piedi sta davanti.
- **Tifo**: ogni tifoso ha il suo modo (braccia al cielo, pugno alzato, applauso, salti) e lo fa a turno, non tutti insieme. Le braccia salgono con un arco e si muovono anche da seduti (ola).
- **Seguono l'azione**: il busto ruota verso la palla (nella boxe verso i pugili, nel ciclismo verso il gruppo: a bordo strada ci si volta molto di più).
- **Scenette fra il pubblico**: quando uno spettatore "vero" si inginocchia, bacia, balla, cade, saluta o protesta, chi gli sta intorno (entro `SPOT_RADIUS`, 4,5 m) si gira e applaude; chi sta dietro si alza, chi sta davanti resta seduto per non coprire. Il gesto è letto dagli attori registrati, quindi vale anche nei replay. Niente reazione prima che la scena cominci: il segreto resta un segreto.
- **Cielo**: chi indica la stella cadente o la navicella alza un braccio solo, col telefono acceso in mano.
- **Bandiere**: più piccole, col telo che ondeggia.

Limite tecnico: lo shader del pubblico usa 15 dei 16 attributi di vertice garantiti da WebGL2. Una posa in più richiede di toglierne un'altra o di impacchettare altri dati in `fanState`.

## Scenografia (`render/stage.ts`, `render/effects.ts`)

- Città all'orizzonte dietro le tribune (un cilindro, una texture): i campi piccoli non sono più nel vuoto.
- Cartelloni LED: dopo un gol o un punto passano per qualche secondo al nome e ai colori di chi ha segnato (6 s nel calcio, 2,5 s altrove), anche nel replay.
- Fasci dei fari che si spengono a metà strada.
- Coriandoli da tutte e due le curve al triplice fischio, in ogni sport da stadio.
- Corretta la scritta del maxischermo (`FRAME IT · LIVE`).

## Fluidità (`main.ts`, numeri in `CONFIG.render`)

Nitidezza adattiva: ogni 2 secondi di gioco si misura il ritmo. Sotto `adaptiveFps` (48) la ripresa si disegna con meno pixel, un gradino (`adaptiveStep`, 0,15) alla volta, mai sotto `adaptiveMin` (0,55). Se scendere non migliora il ritmo di almeno il 10% (telefono bloccato a 30 fotogrammi, o limite che non dipende dalla grafica) si torna alla nitidezza di prima e non si riprova. `adaptive: false` la spegne; `?fullres` nell'URL la spegne per quella partita (lo usano gli script dei video e degli screenshot dello store).

Non misurato su un telefono vero: in questo ambiente il browser disegna via software.

## Verifiche

- `npm run check:crowd`: attributi dello shader, pubblico calmo fermo, vicini che reagiscono a una scenetta e lontani no, esultanza, telefoni, nitidezza adattiva a 30 e 60 fotogrammi e con `?fullres`.
- Strumenti visivi (cartella `artifacts/`, non versionata): `look-shots.mjs <tag> [sport] [segreto]`, `crowd-lab.mjs <tag> [sport]`, `motion-strip.mjs`, `perf-probe.mjs`.
