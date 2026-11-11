# Scenografia e gesti fatti con Blender

Lavoro dell'11 novembre 2026 sul branch `fable_test`, dopo [boxe-tennis-ciclismo-vela.md](boxe-tennis-ciclismo-vela.md). Non ancora pubblicato.
Blender 5.3 lavora senza interfaccia, guidato da script: tutto si rigenera con due comandi e nessun file `.blend` da conservare.

## Come si rigenera

- `npm run props`: modelli di scena (`scripts/blender/arena.py`, `country.py`, attrezzi comuni in `kit.py`) → `src/assets/props/arena.glb` (347 kB) e `country.glb` (498 kB). Anteprime in `artifacts/props/preview-*`.
- `npm run clips`: gesti animati (`scripts/blender/clips.py`) → aggiunti in coda a `src/assets/characters/animations.*`. Anteprime in `artifacts/clips/preview`. Va rilanciato dopo `prepare-animations` o `prepare-rpg-animations`, che ricostruiscono la libreria.
- Il percorso di Blender si cambia con la variabile `BLENDER`.

I modelli non hanno texture: ogni faccia ha un colore, e Blender (Cycles) cuoce le ombre di contatto nei colori dei vertici. Le facce sono divise in gruppi col nome del materiale (`paint`, `wall`, `roof`, `shutter`, `leaf`, `glass`, `glow`...), che il gioco tinge o sostituisce (`src/render/props.ts`).

## Basket

- Canestro vero: base su ruote con l'imbottitura verso il campo, braccio imbottito, tabellone di vetro con cornice, linee e protezione del bordo, ferro con staffe, retina a maglie, scatola del cronometro dei 24 secondi.
- Panchine: sedie imbottite nel colore della squadra (anche negli altri sport da stadio) e tavolo dei giudici con il fronte luminoso.
- Giocatori fermi in posizione d'attesa sulle gambe (ripresa `keeperIdle`), non più dritti con le braccia lungo i fianchi. Vale anche per la pallavolo.
- Tiro in sospensione animato in Blender (`basketShoot`): spinta sulle punte, braccio di tiro teso, polso spezzato, mano d'appoggio che si stacca, atterraggio morbido.

## Boxe

- Ring rialzato di un metro: pedana con la gonna fino a terra e le scritte, pali, tenditori, cuscini d'angolo rosso, blu e bianchi, quattro corde con i distanziali, scalette agli angoli, sgabelli e secchi, tavoli dei giudici con monitor e campana.
- Americana delle luci su quattro torri di traliccio, con otto fari sopra il ring.
- Il ring resta a quota zero: è tutto il resto (pavimento, tribune, pubblico, cartelloni, allenatori) a stare un metro più in basso (`FLOOR_Y` in `src/config.ts`). Pugili, camera e punteggi non cambiano. Le clip salvate prima (catalogo < 5) vengono corrette quando si rivedono.

## Ciclismo

- Paese: case a moduli (piano terra, piani, tetto) in tre stili. Collina: intonaco, persiane, balconi, fioriere, tetti di coppi a file. Montagna: pietra sotto e legno sopra, balcone coi gerani, tetto largo d'ardesia. Mare: tetti piani con terrazza, cisterna e pannello solare, balconcini bianchi. Botteghe con la tenda a righe.
- Chiesa con facciata, rosone, finestre ad arco, abside e campanile con l'orologio; sagrato aperto sulla strada con fontana, tavolini con ombrellone e lampioni. Selciato lungo la via del paese, lampioni ai lati.
- Campagna: alberi nuovi (abete, due latifoglie, cipresso) con la chioma ombreggiata, siepi lungo i campi, prati a chiazze invece del verde uniforme, fienili di legno e un'auto nelle cascine, ammiraglie con le bici sul tetto dopo il traguardo.
- Corretti due difetti che già c'erano: da lontano i campi si riempivano di chiazze verdi e il fiume spariva (precisione della profondità), e un campo sovrapposto al pascolo delle mucche sfarfallava.
- Gli alberi nuovi valgono anche per golf e vela.

## Pallavolo

- Schiacciata animata in Blender (`volleySpike`): rincorsa bassa, braccia in alto, arco all'indietro, frustata sulla palla, chiusura attraverso il corpo, atterraggio.

## Come funzionano i gesti di Blender

`clips.py` descrive ogni gesto con poche pose chiave in gradi (busto, anche, ginocchia, braccia, polsi). Blender le raccorda, calcola l'altezza del bacino che tiene il piede più basso a terra o segue il salto, e campiona il risultato nel formato delle altre riprese. Nel gioco il corpo viene dalla ripresa, ma le mani vanno dove la simulazione mette la palla (`touchBall` in `src/render/characters.ts`): la palla non si stacca mai dalle mani. Per aggiungere un gesto: una voce in `CLIPS`, il gruppo in `assetMotion.ts`, `npm run clips`.

## Catalogo 5

`ANIMATION_CATALOG` passa a 5 (ring rialzato e gesti di Blender). I replay registrati prima restano uguali: non vedono le riprese nuove e, nella boxe, chi stava fuori dal ring viene abbassato alla nuova quota.

## Verifiche e limiti

- `npm run build`, `check:characters`, `check:motion`, `check:courts`, `check:cycling-routes`, `check:race-ui`, `check:crowd`, `check:secrets`, `check:clips`.
- Peso: 845 kB di modelli in più nel pacchetto. Il paese del ciclismo passa a circa 310.000 triangoli (una mesh sola).
- Non misurato su un telefono vero.
- Non fatto: schiacciata a canestro, muro, alzata, bagher e battuta della pallavolo (restano procedurali), ammiraglie e moto al seguito del gruppo, colture in rilievo nei campi.
- Strumenti visivi nuovi in `artifacts/` (non versionati): `shot.mjs` (vedute libere), `pose-strip.mjs` (striscia di un gesto).
