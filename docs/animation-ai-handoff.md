# Passaggio di consegne: modelli, animazioni e revisione visiva

Documento per una seconda AI che deve cercare altro materiale utile nelle sorgenti locali e migliorare l'integrazione esistente. Commit di riferimento dell'implementazione: `ea6e71b`, preceduto da `9d3a7ab`, sul branch `nuovi-modelli`.

## 1. Richiesta e vincoli dell'utente

Frame It è un gioco arcade da cameraman sportivo, scritto in TypeScript con Three.js e Vite, con contenitore mobile Expo/Android e gioco HTML offline. Gli sport presenti sono calcio, basket, boxe, tennis, pallavolo, golf, ciclismo e vela.

L'utente ha chiesto di sostituire le figure umane con modelli importati, sfruttare le animazioni sportive e comuni disponibili, variare pelle/divise/capelli ed evitare di scartare varianti solo perché hanno lo stesso nome. Ha chiarito esplicitamente: **umani nello sport; fantasy solo come mascotte**.

Obiettivo della prossima AI: riesaminare sorgenti, selezione, impiego nelle scene e qualità visiva; recuperare eventuali clip utili trascurate e migliorare movimenti, contatti, transizioni e aspetto. Non serve cambiare motore o riscrivere la simulazione.

## 2. Percorsi e documenti

Repository attivo:

```text
C:\Users\P354606\OneDrive - Posti Oyj\Desktop\Frame it
```

Sorgenti originali, usate finora in sola lettura:

```text
C:\Users\P354606\Downloads\new_asset
C:\Users\P354606\OneDrive - Posti Oyj\Desktop\RPG 3D
```

Leggere nel repository:

- `docs/nuovi-modelli.md`: integrazione complessiva, dimensioni, rigenerazione e controlli.
- `docs/asset-audit.json`: modelli e tutte le 192 animazioni di `new_asset`, hash, duplicati, gruppi, trim e contatti.
- `docs/rpg-assets.md`: aggiunte dal progetto RPG e criteri di selezione.
- `docs/rpg-asset-audit.json`: tutte le 86 clip UAL, decisioni di inclusione/esclusione, sorgenti e dipendenze dei nuovi modelli.
- `src/assets/characters/animations.json`: catalogo effettivamente caricato dal gioco; l'audit descrive le sorgenti, il manifest descrive i dati compilati.

Il progetto RPG ha un proprio `AGENTS.md`, che rimanda a `SETTINGS_3D.md` e `CONTESTO_PER_AI.md`; se si lavora sul suo gioco, richiede anche aggiornamenti al diario Obsidian. Il lavoro finora ha importato copie in Frame It senza modificare il progetto RPG.

## 3. Cosa è stato esaminato e integrato

### `new_asset`

- `human/`: 15 modelli FBX, tutti visualizzati. `giocatore.fbx` è l'unico umano sportivo; gli altri 14 sono creature/mostri/zombie/fantasy, riservati alle mascotte.
- 138 FBX di animazione nella radice.
- 54 FBX di animazione dentro `Soccer Game Pack.zip`.
- Totale 192 clip sorgenti: 166 mantenute, 24 duplicati delle tracce, due `Stabbing` escluse perché mostrano accoltellamenti.
- I suffissi `(1)`, `(2)` ecc. non sono stati considerati motivo di esclusione. Il confronto usa dimensioni, hash del file e hash dei dati delle tracce.
- `kenney_modular-cave-kit_1.0.zip` riguarda ambienti, non animazioni umane sportive.
- Undici modelli sono FBX 6.1, convertiti con FBX2glTF/FBX SDK prima dell'ottimizzazione: non basta aprirli direttamente con FBXLoader.

I gruppi coprono calcio, portieri, boxe, golf, locomozione, danze, esultanze, cadute, rialzate, conteggio dell'arbitro e gesti comuni. Esempi di variabilità attuale: 17 clip `boxingRecoil`, 15 `boxingCombo`, 12 `boxingJab`, 8 `boxingHook`, 8 `keeperCatch`, 12 `run`, 9 `celebration`. Una clip può appartenere a più gruppi: la somma dei gruppi non è il numero di clip distinte.

### `RPG 3D`

Cartelle più pertinenti, relative alla radice RPG:

```text
assets/characters/humans/models/
assets/characters/humans/textures/
assets/characters/animations/humanoid/
3D asset download/People/Universal Base Characters[Standard]/
3D asset download/animation/Universal Animation Library[Standard]/
3D asset download/animation/Universal Animation Library 2[Standard]/
3D asset download/outfits/Modular Character Outfits - Fantasy[Standard]/
3D asset download/Guardaroba_Pietravalle/
3D asset download/Guardaroba_Pietravalle_Aderente/
```

File di animazione usati, con i doppi livelli di cartella reali:

```text
3D asset download/animation/Universal Animation Library[Standard]/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb
3D asset download/animation/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb
```

Sono presenti anche gli export `_RM.glb`, gli equivalenti Unity FBX e, nella seconda libreria, un Female Mannequin. Il README delle librerie identifica `_RM` come export con root motion; non va contato automaticamente come un altro insieme di gesti. Usare le versioni in-place per la simulazione esistente.

UAL1 e UAL2 contengono 43 clip ciascuna. Delle 86 clip logiche, 32 generano nuove clip compilate, tre sono frammenti uniti ad altre azioni e 51 non sono state importate. Le tre parti unite sono `Melee_Hook_Rec`, `Slide_Loop` e `Slide_Exit`. La libreria finale contiene **166 + 32 = 198 clip**.

UAL1 aggiunte:

```text
Crouch_Idle_Loop -> boxingDodge
Dance_Loop -> celebration
Death01 -> knockdown
Hit_Chest, Hit_Head -> boxingRecoil
Idle_Loop -> sidelineIdle
Idle_Talking_Loop -> talk
Jog_Fwd_Loop, Sprint_Loop -> run
PickUp_Table -> keeperCatch
Punch_Cross, Punch_Jab -> boxingJab
Push_Loop -> shove
Sitting_Enter -> crowdSitIn
Sitting_Exit -> crowdSitOut
Sitting_Idle_Loop -> crowdSit
Sitting_Talking_Loop -> crowdSitTalk
Walk_Formal_Loop, Walk_Loop -> walk
```

UAL2 aggiunte:

```text
Hit_Knockback -> knockdown
Idle_FoldArms_Loop -> sidelineIdle
Idle_No_Loop -> dejected
Idle_TalkingPhone_Loop -> phone
LayToIdle -> getUp
Melee_Hook + Melee_Hook_Rec -> boxingHook
OverhandThrow -> keeperThrow
Slide_Start + Slide_Loop + Slide_Exit -> footballTackle
Walk_Carry_Loop -> keeperCarry
Yes -> officialYes e celebration
Zombie_Idle_Loop -> mascotIdle
Zombie_Scratch -> mascotReact
Zombie_Walk_Fwd_Loop -> mascotWalk
```

I tre movimenti zombie sono riservati alle mascotte. `Hit_Knockback` è stato rivisto e classificato come caduta, non come una piccola reazione a un colpo.

### Limiti dell'inventario svolto

L'audit dettagliato RPG riguarda soprattutto queste due librerie e i modelli umani scelti. Non equivale a una revisione visiva completa di ogni modello, animazione incorporata e archivio dell'intero progetto RPG. Un inventario di file pertinenti è in `artifacts/rpg-asset-audit/files.json`, se ancora presente; non va considerato esaustivo di tutti i formati o archivi compressi.

Gli hash delle tracce originali individuano duplicati identici, ma non dimostrano che due gesti siano visivamente diversi quando cambiano rig, nomi, campionamento o export. I 32 dati compilati RPG hanno hash distinti tra loro; non è stato costruito un confronto visivo normalizzato di equivalenza tra tutte le clip RPG e tutte le 166 precedenti.

## 4. Altri candidati da riesaminare

Le esclusioni dell'audit sono decisioni di integrazione di questa prima passata, non una prova che il materiale sia inutilizzabile. Verificare il movimento completo prima di cambiare la selezione.

| Sorgente e clip non importate | Impiego possibile da verificare |
| --- | --- |
| UAL1 `Jump_Start`, `Jump_Loop`, `Jump_Land` | Fasi di salto/atterraggio per basket e pallavolo, eventualmente solo arti inferiori e bacino; preservare il contatto con palla e rete |
| UAL1 `Crouch_Fwd_Loop` | Spostamento basso dei portieri o schivata in movimento |
| UAL1 `Roll` | Recupero dopo tuffo/caduta di un portiere, se stile e traiettoria sono compatibili |
| UAL1 `Interact` | Staff, arbitri, strette di mano o interazioni col pubblico, dopo ispezione del gesto effettivo |
| UAL1 `Fixing_Kneeling` | Sistemarsi una scarpa o staff inginocchiato; verificare la dipendenza da oggetti |
| UAL2 `Idle_Rail_Call`, `Idle_Rail_Loop` | Tifosi e allenatori presso una transenna, con altezza e contatto delle mani adattati |
| UAL2 `Consume` | Spettatori che bevono/mangiano, fornendo l'oggetto e la presa corretti |
| UAL2 `ClimbUp_1m` | Solo per un evento coerente con un ostacolo reale; non un movimento ordinario dell'atleta |
| UAL2 `NinjaJump_Start`, `NinjaJump_Idle_Loop`, `NinjaJump_Land` | Eventuale uso parziale o da mascotte; verificare che l'esagerazione non rovini la resa sportiva |
| UAL1 `Swim_Fwd_Loop`, `Swim_Idle_Loop` | Solo se è prevista una scena di persona in acqua nella vela; non introdurre una nuova modalità solo per usare una clip |

Armi, scudi, magie, agricoltura e azioni medievali restano a priorità bassa per lo sport. Un eventuale riuso parziale richiede una ragione concreta e una revisione del risultato, senza forzare tutte le clip nel gioco.

Riesaminare anche le animazioni incorporate nei GLB/FBX di `assets/characters/animations/humanoid/` e nelle copie dei personaggi, e cercare ricorsivamente negli archivi. Non presumere che un GLB sia solo geometria. Gli script di `new_asset` attuali leggono la radice, `human` e lo ZIP noto: non sono un crawler generale ricorsivo di ogni sorgente.

Per l'aspetto ci sono anche `Hair_Beard.gltf`, `Hair_BuzzedFemale.gltf` ed eyebrow separati, oltre a vestiti e guardaroba RPG. Non sono stati tutti integrati. Gli abiti peasant/ranger non sono divise sportive senza adattamento; prima di aggiungere asset di altri autori, identificare la relativa licenza. Mostri e quadrupedi non sono automaticamente compatibili con il retargeting umano e restano candidati da mascotte.

## 5. Modelli e visuali attuali

| Asset finale | Origine e uso attuale | Costo indicativo |
| --- | --- | --- |
| `footballer.glb` | `new_asset/human/giocatore.fbx`; calciatori e numerosi altri ruoli umani | 5.952 triangoli, 541 kB |
| `rpg-boxer.glb` | `Superhero_Male_FullBody.gltf`; pugili a torso scoperto | 5.117 triangoli, 258 kB |
| `rpg-athlete-female.glb` | `Superhero_Female_FullBody.gltf`; squadra 1 in basket/tennis/pallavolo/golf e alcuni ruoli coach/steward/spectator | 6.560 triangoli, 380 kB |
| `crowd.glb` | Versione molto semplificata del calciatore | 666 triangoli per persona |
| `human-0.glb` ... `human-13.glb` | Creature di `new_asset` | Solo mascotte |

Tutti sono in `src/assets/characters/`. I nuovi corpi provengono da `RPG 3D/assets/characters/humans/models/`. Le texture chiare originali Quaternius sono usate per rendere tintabile la carnagione; il nome reale della texture maschile è `T_Superhero_Male_Ligh.png`, con questa grafia.

La divisa dei corpi RPG è ottenuta separando geometricamente superfici del corpo lungo piani, interpolando UV, normali e pesi: pantaloncini e calzettoni per l'uomo, più maglia opaca per la donna. È una soluzione aderente al corpo, non un indumento con spessore o simulazione di stoffa. Le scarpe sono trasferite dal calciatore usando posizione e direzione anatomica del piede. I capelli sono fissati alla testa; due acconciature per nuovo corpo, con tinture e variante rasata.

Guantoni, guanti dei portieri, caschi, cappelli, racchette, bastoni da golf, numeri e altri oggetti seguono socket delle ossa. Il golf calibra presa e lunghezza del bastone rispetto al contatto previsto. Per alcune pose con piedi a terra viene compensata l'altezza del personaggio; i modelli RPG usano anche i vertici delle suole.

Il pubblico usa instanze GPU e sei pose precalcolate interpolate: seduto, in piedi, esultanza, conversazione, sedersi e alzarsi. Le quattro clip da seduti non vengono riprodotte integralmente in tempo reale per ogni spettatore: vengono campionate per costruire queste pose.

Texture limitate a 512 px, WebP; animazioni a 24 fps con quaternioni int16 e spostamento verticale del bacino int16, poi gzip. Circa 2,4 MB per il binario delle animazioni, 6,3 MB per tutti gli asset dei personaggi e 9,5 MB per l'HTML offline completo. Sono riferimenti di costo attuali, non obiettivi assoluti di qualità.

## 6. Architettura da conoscere prima di intervenire

| File/area | Responsabilità |
| --- | --- |
| `scripts/asset-categories.mjs` | Classificazione dei nomi di `new_asset` in gruppi di gioco |
| `scripts/prepare-animations.mjs` | Import FBX, estrazione ZIP, deduplicazione delle tracce, contatti/trim, libreria base da 166 clip |
| `scripts/prepare-models.mjs` | Ottimizzazione dei 15 modelli e generazione del pubblico semplificato |
| `scripts/prepare-rpg-models.mjs` | Adattamento dei due corpi RPG, scarpe/capelli, ottimizzazione e audit delle dipendenze |
| `scripts/split-sport-uniform.mjs` | Taglio delle superfici e interpolazione dei pesi per la divisa |
| `scripts/prepare-rpg-animations.mjs` | Selezione UAL, unione dei frammenti, retargeting e append delle 32 clip |
| `scripts/character-skeleton.mjs` | Rimappatura Mixamo/Quaternius, incluse le dita |
| `scripts/read-character-gltf.mjs` | Lettura delle scene/clip in Node senza richiedere il caricamento DOM delle texture |
| `src/animation/assetMotion.ts` | Scelta pura del gruppo, variante, fase e catalogo dall'attore e dallo stato registrato |
| `src/render/characters.ts` | Selezione modello, stile, campionamento int16, retargeting, blend, IK, suole, socket, golf e pose del pubblico |
| `src/render/crowd.ts` | Stati e istanze del pubblico, transizioni e reazioni |
| `src/animation/motion.ts` | Coreografia procedurale e punti di contatto condivisi |
| `src/render/actors.ts`, `athlete.ts`, `equipment.ts` | Driver procedurali, viste ed equipaggiamento |
| `src/sim/match.ts` | Attori, gesti, varianti, calcio e collegamenti con simulazione/replay |
| `src/sim/sports/`, `src/events/` | Azioni specifiche e copioni; boxe in `boxing.ts` e `racketAndRing.ts`, golf in `golf.ts`, calcio soprattutto in `match.ts`/`library.ts` |
| `src/recorder/recorder.ts` | Stato registrato, ripristino e versione del catalogo |

Le rotazioni delle clip sono convertite in delta rispetto alla posa di riposo e applicate al rig destinazione. Mixamo e Quaternius hanno nomi e assi diversi; il bacino Quaternius può avere Z locale verticale. La conversione del bacino deve usare la trasformazione del parent, non assumere `position.y` locale come altezza. Il movimento orizzontale e la traiettoria della palla restano sotto controllo della simulazione.

Basket, tennis, pallavolo, ciclismo e vela conservano parecchie coreografie procedurali, trasferite al nuovo scheletro e adattate con IK. Anche le interazioni sincronizzate fra due persone, come baci e abbracci, mantengono la coreografia condivisa; le clip `Kiss` isolate servono alle esultanze verso il pubblico.

La scelta delle varianti dipende da gesto, ID, aspetto e stato salvato. Non introdurre selezioni casuali dipendenti dal clock del renderer. I replay precedenti senza `animationCatalog` vengono letti come catalogo 2; le nuove registrazioni usano 3. La compatibilità attuale filtra gli ID `quaternius_` per i cataloghi precedenti a 3 e conserva i vecchi gesti procedurali. **Non è un registro generale di versioni:** aggiungere o riordinare altre varianti richiede estendere la gestione del catalogo o registrare un ID di clip stabile, altrimenti il modulo sulla lunghezza del gruppo può cambiare i replay già salvati.

## 7. Priorità di miglioramento e limiti da valutare

Questa lista distingue aspetti osservabili nell'implementazione da possibili problemi da verificare in scena. Non tutti i punti sono difetti riprodotti.

1. **Qualità semantica della selezione.** Verificare tipo e intensità dei colpi: molte reazioni a testa e busto sono nello stesso gruppo, molte combinazioni hanno durate differenti. Distinguere colpi, guardia, lato, bersaglio e forza quando la simulazione fornisce l'informazione. Controllare anche partenze/finali delle cadute, `Death01`, `PickUp_Table` come presa del portiere e `Walk_Carry_Loop` come mantenimento della palla.
2. **Contatti reali.** Guardare frame per frame piedi/pallone, guanti/avversario, mani/palla, racchetta/palla e bastone/palla. Per la base FBX è stimato un contatto dalla traiettoria dell'arto; per le nuove clip UAL il contatto nel compilatore è ancora fissato a `duration * .32`. Il time warp del renderer non rende automaticamente corretta questa stima.
3. **Passi e transizioni.** Verificare slittamento dei piedi, velocità del ciclo rispetto alla velocità simulata, cambi di direzione, loop e blend tra clip diverse. Il mantenimento dell'altezza delle suole non equivale a un sistema completo di foot locking o IK sul terreno.
4. **Uso parziale delle clip.** I salti UAL potrebbero migliorare le gambe di basket/pallavolo preservando le braccia procedurali e i punti di contatto. Richiede una vera maschera delle ossa o un blend coerente, non l'assegnazione cieca dell'intero corpo.
5. **Copertura degli eventi.** Una clip presente nel manifest non prova che tutti i suoi impieghi siano corretti o frequenti in partita. Tracciare evento -> gruppo -> variante -> ID risolto. `root.userData.motion` e `root.userData.clip` aiutano. Nel pubblico alcune clip sono usate solo tramite campioni statici.
6. **Pubblico.** Valutare naturalezza di seduta, transizioni, contatto con sedie e transenne e sincronizzazione fra persone. Lo shader cambia le posizioni ma le normali sono calcolate dalla posa in piedi: l'illuminazione delle pose molto diverse può essere approssimata. Tenere conto del limite di attributi vertex sui dispositivi mobili se si aggiungono dati per pose/normali.
7. **Abiti, capelli e scarpe.** Migliorare silhouette, colli e maniche, vita dei pantaloncini e spessore delle divise. Controllare intersezioni di capelli rigidi, cappelli, guanti e attrezzatura nelle pose estreme. Valutare barba, altri capelli, proporzioni e distribuzione dei modelli fra ruoli/squadre. La distribuzione femminile attuale è deterministica per squadra/ruolo, non un sistema generale di scelta del personaggio.
8. **Materiali e luci.** Verificare pelle scura/chiara sotto i fari e nei primi piani. L'ottimizzazione ha rimosso normal map e altre mappe e usa materiali semplificati; reintrodurre dettaglio selettivo può essere utile, misurando peso e costo GPU. Non aumentare indiscriminatamente tutte le texture o tutti i poligoni.
9. **Retargeting completo.** Controllare spalle, polsi, dita, caviglie e orientamento degli oggetti su tutti e tre i corpi umani; un rig senza valori infiniti può comunque avere una posa poco naturale.
10. **Licenze e duplicati.** Verificare la provenienza prima di importare materiale diverso da quello documentato; confrontare il contenuto animato normalizzato, non solo dimensioni o nomi. CC0 è documentato per i pacchetti Quaternius usati, non per ogni file dell'intero progetto RPG o di `new_asset`.

## 8. Rigenerazione

Gli asset pronti sono già nel repository. Per avviare il gioco bastano `npm install` e `npm run dev`; non serve rigenerare tutto per cambiare il runtime.

Pipeline completa, dalla radice di Frame It:

```powershell
node scripts/inspect-character-assets.mjs
node scripts/convert-human-assets.mjs
node scripts/prepare-models.mjs
node scripts/prepare-animations.mjs
node scripts/prepare-rpg-models.mjs "C:\Users\P354606\OneDrive - Posti Oyj\Desktop\RPG 3D"
node scripts/prepare-rpg-animations.mjs "C:\Users\P354606\OneDrive - Posti Oyj\Desktop\RPG 3D"
```

La conversione FBX richiede `artifacts/asset-tools/FBX2glTF.exe`, oppure il convertitore passato come secondo argomento dopo la cartella `human`. I percorsi di default per la prima sorgente puntano a `Downloads/new_asset`. La pipeline RPG richiede che il primo script abbia prodotto `artifacts/rpg-asset-audit/models.json` prima del secondo.

**Attenzione alla rigenerazione:** `prepare-animations.mjs` riscrive la libreria base da 166 clip. Eseguire poi il passaggio RPG per ripristinare le 32 aggiunte. `prepare-rpg-animations.mjs` è idempotente sul catalogo attuale: elimina le proprie precedenti aggiunte e le ricompila, conservando il prefisso binario delle 166 clip. Se un'altra AI estende i gruppi sorgente, deve aggiornare anche selezione, audit e compatibilità dei replay.

Non rigenerare il binario delle animazioni mentre sono attivi i test browser: manifest e gzip devono corrispondere per tutta la durata della prova.

## 9. Verifiche già superate e come proseguirle

Nella fase finale delle aggiunte RPG sono passati:

```powershell
npm run build
npm run check
npm run check:motion
npm run check:characters
npm run check:clips
npm run check:gameplay
npm run check:practice
npm run check:characters:offline
```

`check:characters` carica gli otto sport, verifica i modelli attesi, gli attributi del pubblico e la parità delle trasformazioni prima/dopo un replay; include una prova con asset mancante e pulsante di riprova. L'offline prova calcio, boxe e golf nel contenitore HTML con rete disabilitata. Gameplay e camera practice coprono i cinque sport principali indicati dai rispettivi script.

Sono state rese tutte le 198 clip a due istanti sui due corpi RPG e le 32 nuove anche sul calciatore, con controllo di valori finiti e dimensioni dello scheletro e revisione delle tavole. È stato anche verificato che record e dati binari delle precedenti 166 clip siano preservati e che la rigenerazione RPG dia lo stesso gzip.

Comandi per la revisione:

```powershell
npm run review:animations
npm run review:animations -- --sport=boxe
npm run review:animations -- --sport=pallavolo
npm run review:animations -- --rpg-only
```

Le prove con due campioni per clip non sostituiscono una visione dell'intera animazione: possono sfuggire problemi di loop, contatti, accelerazioni, penetrazioni e transizioni. Per la prossima revisione sono utili brevi video o sequenze complete, anche rallentate, e controlli espliciti che l'ID risolto coincida con la clip che si voleva osservare.

Artefatti locali, se presenti:

```text
artifacts/characters/*.png
artifacts/characters/report.json
artifacts/animation-review/
artifacts/rpg-asset-audit/review-calcio/
artifacts/rpg-asset-audit/review-boxe/
artifacts/rpg-asset-audit/review-pallavolo/
artifacts/rpg-asset-audit/overview-0.jpg
artifacts/rpg-asset-audit/overview-1.jpg
artifacts/rpg-asset-audit/models/
artifacts/rpg-asset-audit/*.log
```

`artifacts/` è materiale locale ignorato da Git: potrebbe mancare in un altro checkout e può essere rigenerato. Il file `bounds.json` di ciascuna revisione riporta i campioni controllati; una revisione `--rpg-only` può sovrascrivere gli artefatti della revisione completa per quello sport.

## 10. Provenienza, stato Git e risultato atteso

Le dichiarazioni dei pacchetti Quaternius usati sono copiate in:

```text
docs/licenses/quaternius-base-characters.txt
docs/licenses/quaternius-ual1.txt
docs/licenses/quaternius-ual2.txt
```

L'autore è Quaternius, licenza dichiarata CC0 1.0 Universal. L'audit comprende hash dei modelli, dei buffer/texture dipendenti e delle librerie sorgenti.

Al termine del lavoro di implementazione non c'erano modifiche tracciate pendenti. Esistevano già questi file non tracciati dell'utente, estranei al lavoro; non cancellarli o includerli incidentalmente nei commit:

```text
docs/android-build-PSTA03975.md
mobile/app-PSTA03975.json
mobile/package-PSTA03975.json
mobile/package-lock-PSTA03975.json
store/video/compose-PSTA03975.py
store/video/frameit-ad-modes-50s.mp4
store/video/overlays-PSTA03975.mjs
store/video/record-PSTA03975.mjs
```

Consegna attesa dalla prossima AI: un inventario aggiornato delle nuove opportunità, con fonte, nome originale, durata, scheletro, contenuto effettivo, confronto con le varianti esistenti e motivazione; miglioramenti concreti integrati dove utili; screenshot/video prima e dopo; test mirati e resoconto dei limiti rimasti. Conservare la distinzione fra asset presente, clip compilata, evento raggiungibile e risultato visivamente verificato.
