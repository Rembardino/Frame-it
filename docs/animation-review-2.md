# Seconda revisione di animazioni e modelli

Continuazione di [animation-ai-handoff.md](animation-ai-handoff.md) sul branch `nuovi-modelli`. Vincolo invariato: umani nello sport, personaggi fantasy solo come mascotte. Le sorgenti `RPG 3D` e `new_asset` sono state lette senza modificarle; il progetto RPG non è stato toccato, quindi il suo diario Obsidian non è stato aggiornato.

Ogni voce distingue quattro livelli: **asset trovato** (esiste nelle sorgenti), **clip compilata** (presente in `animations.json`), **evento raggiungibile** (una situazione di gioco la seleziona) e **verificato visivamente** (guardata in sequenza completa o in video, non solo in due istantanee).

## 1. Inventario ricorsivo di `RPG 3D`

Dettaglio completo in [rpg-animation-inventory.json](rpg-animation-inventory.json).

- Esaminati 1.436 file GLB/GLTF/FBX, comprese 30 voci dentro archivi ZIP lette in memoria. Per i GLB/GLTF si leggono animazioni e scheletri dal JSON; per gli FBX binari e ASCII i nomi degli `AnimStack`.
- **Animazioni umanoidi: solo le Universal Animation Library.** UAL1 e UAL2 esistono come GLB in-place, GLB `_RM` e FBX Unity (più `_RM`): stesse 43 + 43 clip già censite in [rpg-asset-audit.json](rpg-asset-audit.json).
- **100 modelli del Guardaroba Pietravalle** contengono 8 clip incorporate (`Crouch_Idle`, `Idle`, `Idle_Talking`, `Interact`, `Jog_Fwd`, `Sitting_Idle`, `Sword_Attack`, `Walk`). Confronto numerico su `Male_Guardia.glb` e `Female_Oste.glb`: stessi nomi e durate di UAL1, rotazioni delle ossa con `1-|dot|` medio 7–9·10⁻⁴ in quattro fasi. Sono riesportazioni, nessun movimento nuovo.
- `Female_Peasant_Body.gltf` degli outfit modulari contiene solo `Jog_Fwd_Loop` (copia UAL1).
- Il resto delle animazioni (55 file di creature, 26 di animali, 26 oggetti come forzieri, pozzi, giostre) non usa uno scheletro umano: al massimo materiale per mascotte, non retargetizzabile sugli atleti.
- 40 archivi opachi (`.rar`, `.blend`, `.unitypackage`): 27 oggetti, 9 creature, 3 animali e un `Mannequin_F.blend` della UAL2 (stesso pacchetto già importato). Non sono leggibili senza strumenti aggiuntivi; i capelli in `.rar`/`.zip` di altri autori non hanno una licenza identificata.

Conclusione: oltre a UAL1/UAL2 non esistono altre animazioni umane nelle sorgenti locali.

## 2. Candidati esclusi rivalutati

Ogni clip è stata resa per intero (12 fotogrammi, laterale e tre quarti) dal file sorgente; tavole in `artifacts/review2/source/`.

| Clip (durata) | Contenuto effettivo osservato | Decisione |
| --- | --- | --- |
| UAL1 `Interact` (2,00 s) | Braccio teso in avanti che indica, poi ritorno | **Integrata** come `officialPoint`: l'arbitro indica il punto di battuta |
| UAL1 `Jump_Start` (1,33 s), `Jump_Loop` (2,50 s), `Jump_Land` (1,27 s) | Stacco da accosciato, volo con un ginocchio raccolto, atterraggio molto profondo di oltre 1 s | Non integrate: il salto procedurale di schiacciata/muro/tiro parte già in volo (`sin(πu)`, senza caricamento) e i contatti con palla e rete dipendono dalle braccia procedurali; servirebbero maschera ossea e nuovi tempi di simulazione |
| UAL1 `Crouch_Fwd_Loop` (2,00 s) | Camminata furtiva accovacciata, mani basse | No: non è lo spostamento laterale del portiere |
| UAL1 `Roll` (1,47 s) | Tuffo in avanti, capriola, rialzata | No: i tuffi del portiere sono laterali |
| UAL1 `Fixing_Kneeling` (5,20 s) | In ginocchio, mani a terra davanti | No: nessun evento lo richiede |
| UAL2 `Idle_Rail_Call`, `Idle_Rail_Loop` (2,50 s) | Appoggiati in avanti a una transenna, una mano alla bocca per chiamare | No: nessuna transenna dove stanno persone animate; il pubblico è a sei pose precalcolate e il budget di attributi è già usato |
| UAL2 `Consume` (1,33 s) | Braccio teso con palmo in su (porgere) | No: **non** è un gesto di bere o mangiare |
| UAL2 `NinjaJump_*` | Salto acrobatico esagerato | No |
| UAL1 `Swim_*` | Nuoto | No: nessuna scena in acqua |

Già integrata ma da segnalare: UAL2 `Melee_Hook` è un affondo da rissa con busto quasi orizzontale, non un gancio di boxe. Resta nel gruppo per non alterare i replay del catalogo 3; il contatto ora è misurato.

## 3. Difetti trovati e correzioni

### 3.1 Pugili e atlete che affondano o galleggiano (grave)

La compensazione dell'altezza con i vertici delle suole (solo corpi RPG: pugili e atlete della squadra 1) leggeva i vertici con `bindMatrixInverse` del render precedente. Ogni fotogramma reintroduceva l'offset del precedente: in boxe il pugile sprofondava nel ring fino a mostrare solo la testa (−2,2 m in 6 s) o fluttuava. I test non lo vedevano perché non rendevano tra un aggiornamento e l'altro. Correzione in `src/render/characters.ts` (`root.updateMatrixWorld(true)`, che aggiorna anche `bindMatrixInverse`). Nuovo controllo in `check:characters`: deriva 1,09 m prima, sotto 0,2 m dopo.

### 3.2 Slittamento dei piedi

Il gioco avanzava ogni clip di locomozione di un ciclo ogni ~2,4–3,1 m, qualunque fosse il passo reale della clip. Ora `scripts/annotate-clips.mjs` misura sul rig del gioco quanto avanza il piede d'appoggio in un ciclo (`cycle`) e la direzione (`travel`), poi ottimizza la lunghezza minimizzando lo scivolamento; il renderer usa `metri percorsi / cycle`. Calibrazione verificata: scalando tutti i cicli di 0,7 o 1,3 lo scivolamento delle corse e camminate aumenta.

Velocità media del piede d'appoggio (m/s, più basso è meglio) con la stessa metrica, codice originale contro attuale:

| Caso | Prima | Dopo |
| --- | ---: | ---: |
| Calcio camminata 1,8 m/s | 1,02 | 0,29 |
| Calcio corsa 6,5 m/s | 2,77 | 0,80 |
| Calcio scatto 8,2 m/s | 3,24 | 1,08 |
| Calcio all'indietro 2,5 m/s | 1,91 | 1,27 |
| Passo laterale sinistro / destro | 1,84 / 1,73 | 0,98 / 0,80 |
| Portiere passo laterale | 2,00 | 1,79 |
| Boxe all'indietro | 1,01 | 0,24 |
| Boxe passi avanti / camminata | 0,25 / 0,98 | 0,29 / 0,89 |

Il passo laterale del portiere viene specchiato quando la clip va nel verso opposto al movimento. Dati per clip in `artifacts/review2/skate-compare.txt`.

### 3.3 Clip incoerenti con il loro gruppo (dal catalogo 4)

Misurate, non giudicate dal nome:

- Spostamenti sul posto (meno di 0,5 m per ciclo): `walking_1_` (in realtà laterale), `step_backward`, `step_backward_1_` (avanzano appena e in avanti), `short_left_side_step`, `short_right_side_step`, `left_turn`, `dribble_1_` (palleggio da fermo usato in corsa).
- Diagonali nei gruppi rettilinei (oltre ~37°): `soccer_game_pack_jog_forward_diagonal`, `_2_` in `run`; `soccer_game_pack_jog_backward_diagonal`, `_2_` in `backward`.
- `idle_1_` nel gruppo `idle` della boxe: postura rilassata a mani sui fianchi, non una guardia. Metà dei pugili restava a guardia abbassata.
- `strike_foward_jog` nel gruppo `run`: è una corsa che finisce con un tiro. Circa un giocatore su dieci in corsa sembrava calciare a vuoto ogni 1,3 s (segnalato giocando). Ora è una variante di `footballShot`: un tiro in corsa, solo dal catalogo 4 (campo `added`).

### 3.3 bis Scelta per velocità (dal catalogo 4)

Dopo la sincronizzazione del passo, chi si spostava piano all'indietro o di lato usava clip di corsa al rallentatore: falcate enormi che sembravano calci. Ora la clip si sceglie anche in base alla velocità, confrontata con quella naturale misurata (rig da 1,92 m):

- corsa: `runJog` (sotto 2,8 m/s), `runMid` (fino a 4,6), `runSprint` (oltre). Le corse UAL "a balzi" stanno solo nello scatto;
- sotto 1 m/s all'indietro e di lato: `backwardSlow`, `stepLeftSlow`, `stepRightSlow`, piccoli passi riprodotti alla loro cadenza.

### 3.4 Colpi compressi e contatti

- I colpi venivano compressi nell'intera durata del gesto simulato: un gancio di 2,9 s veniva eseguito in 0,65 s, un rigore di 1,5 s in 0,45 s. Ora jab, gancio, tiro e passaggio sono riprodotti a velocità naturale attorno al contatto; le reazioni ai colpi a velocità ×1,25 dall'inizio.
- Contatto delle clip UAL misurato sul movimento (massima estensione in avanti della mano che colpisce) invece di `durata × 0,32`: `Punch_Jab` 0,206 s (era 0,278), `Punch_Cross` 0,292 s (0,320), `Melee_Hook` 0,287 s (0,342).
- **Guantone sul bersaglio.** A 1,24 m fra i centri i pugni si fermavano in media a 0,34 m dal volto. Ora la simulazione porta i pugili a ~1,04 m durante lo scambio e un IK porta il guantone sul volto (o sul busto) attorno al contatto, senza toccare caricamento e ritorno: distanza media 0,08 m sulle 32 combinazioni clip × bersaglio. Controllo automatico in `check:characters` (fallisce se si toglie l'IK).
- **Testa e busto.** Un jab su tre va al busto (`boxingBodyJab`): il guantone punta al busto e chi lo subisce usa una reazione al busto (`boxingRecoilBody`: `big_kidney_hit`, `hit_to_body`, `kidney_hit`, `rib_hit_1_`, `Hit_Chest`); gli altri colpi usano solo reazioni alla testa. La scelta è un contatore, non `Math.random`, quindi il resto dell'incontro non cambia.
- **Tiro in ritardo.** La palla parte quando inizia la posa `kick`, ma il piede la raggiungeva 0,14 s dopo, preceduto da un caricamento accelerato di quasi 6 volte. Ora il contatto cade entro un fotogramma (1/30 s) dalla partenza; nei calci piazzati il battitore carica la gamba fino alla battuta invece di "ricevere" un pallone fermo; per i colpi la fusione con la posa precedente dura 0,08 s invece di 0,18.

### 3.5 Aspetto

- Barba Quaternius (`Hair_Beard`) per metà dei pugili, indipendente dall'acconciatura e senza la deformazione usata per variare i capelli; rasatura femminile (`Hair_BuzzedFemale`) come terza acconciatura delle atlete. Stesso pacchetto CC0 già documentato.
- `rpg-boxer.glb` 257,7 → 271,2 kB, `rpg-athlete-female.glb` 380,1 → 407,4 kB.

### 3.5 bis Abbigliamento sportivo (modelli forniti dall'utente)

Tre personaggi forniti dall'utente sostituiscono la divisa da calcio fuori dal calcio e il corpo femminile Quaternius, la cui maglia ricavata dal corpo sembrava un top a spalle scoperte. Hanno tutti lo scheletro Mixamo del calciatore, quindi animazioni e misure del passo valgono senza modifiche. `scripts/prepare-mixamo-athletes.mjs` li converte e li ottimizza; sorgenti, hash e dimensioni sono in [mixamo-athletes.json](mixamo-athletes.json).

| Modello | Sorgente | Abiti | Uso |
| --- | --- | --- | --- |
| `athlete-tee` | `character.fbx` (Mixamo Ch42), 50.182 → 6.377 triangoli | maglietta, pantaloncini, scarpe da ginnastica | uomini di basket e pallavolo (entrambe le squadre), tennis, ciclismo e vela; spettatori e invasori |
| `athlete-polo` | `character (2).fbx` (Mixamo Ch01), 42.812 → 6.501 triangoli | polo, pantaloni lunghi | golfista, arbitri fuori dal calcio, allenatori, steward, spettatori |
| `athlete-carol` | `carol-tennis.fbx`: "Carol Tennis Player Girl" di agra_aoe (Sketchfab, CC BY 4.0), con rig automatico Mixamo; 64.507 → 8.793 triangoli | polo, gonnellino, visiera | tennista e golfista; allenatrici, steward e spettatrici |

Interventi sui modelli:

- Maglie, pantaloni e gonnellino sono a tinta unita, così prendono il colore della squadra senza stampe, jeans o cuciture scure.
- Il FBX esportava tutti i materiali come trasparenti; in gioco si vedevano gli strati interni dei vestiti come schegge scure (anche "maglietta al contrario"). Ora sono opachi.
- Il foulard al collo della polo diventava frastagliato una volta semplificato ed è stato tolto.
- Il corpo calvo della polo riceve i capelli del modello con la maglietta.
- Le variazioni di forma dei capelli restano solo sul calciatore, per cui erano state fatte: sugli altri schiacciavano i capelli dentro la testa.
- L'arbitro della boxe ha la camicia chiara: quella nera spariva nella penombra del ring.
- Il cappellino da golf procedurale resta solo sul calciatore: sulle altre teste diventava un anello bucato dai capelli.

Attribuzione di Carol: [licenses/carol-tennis-player.txt](licenses/carol-tennis-player.txt).

Esaminati e non integrati:

- `man-player.zip`: personaggio Character Creator (144 ossa, FBX da 150 MB) con scarpe da calcio senza calzettoni, stesso uso di `athlete-tee`, senza file di licenza nello ZIP.
- `v0-stylized-basketball-team-player-3d-character.zip`: modello statico da 265.480 triangoli; il rig automatico di Mixamo non ha funzionato.

### 3.5 ter Catamarano della vela

Non esiste un modello gratuito di catamarano da regata a foil: le ricerche su Sketchfab, Poly Pizza e Kenney hanno dato solo modelli a pagamento o barche giocattolo. Il `Watercraft Kit` di Kenney (CC0, scaricato in `Downloads/new_asset_2`) ha due derive tozze non adatte. La barca procedurale di `src/render/sailing.ts` è stata quindi rifatta:

- l'ala rigida ha un profilo alare simmetrico in due elementi, principale e flap con fessura, e si rastrema verso l'alto;
- gli scafi hanno una coperta piatta antiscivolo scura sopra la carena colorata;
- le traverse sono carenate;
- sono stati aggiunti il bompresso del gennaker e le sartie dell'ala;
- i foil sono a L e i timoni hanno l'aletta.

Dimensioni e punti d'appoggio dell'equipaggio non cambiano. Le immagini prima/dopo sono in `artifacts/new-models/boat/`.

### 3.5 quater Pubblico del ciclismo, palline, prova del golf

- **Pubblico a bordo strada (ciclismo).** Era seduto su panche e alto circa 1,3 m, accanto a corridori e spettatori veri di circa 2 m. Ora sta in piedi dietro una transenna bassa, alto circa 1,85 m e un po' più distanziato (`standing` in `SeatRow`). La tribuna dell'arrivo resta seduta.
- **Palline.** Tennis da 3,5 a 1,8 volte la misura reale; pallavolo da 1,8 a 1,2.
- **Swing di prova del golf.** Prima era il drive completo compresso in 1,1 s. Ora è un mezzo swing (`golfChip`), o un putt prima dei putt, alla velocità della clip. La presa del bastone ha una calibrazione propria, separata da quella dei colpi veri, così il bastone segue lo swing. I replay già salvati mostrano la prova alla velocità naturale.

### 3.6 Altre correzioni dal primo test in gioco

- **Pallone del calcio** da 2× a 1,3× la misura reale (`CONFIG.visuals.ballScale`): i giocatori sono già 1,12×.
- **Regole del golf.** Prima la coppia giocava a colpi alternati sulla stessa palla (foursome). Ora ognuno ha la sua palla: dal tee parte prima chi ha fatto meno colpi alla buca precedente, poi tira sempre chi è più lontano dalla bandiera, e la buca finisce quando hanno imbucato tutti e due. Punteggio separato sul tabellone, seconda palla visibile e registrata nei replay. Il controllo automatico verifica l'ordine a ogni colpo. Il giro dura circa 5 minuti: il tetto di sicurezza della partita di golf passa da 300 a 420 s.
- **Pulsante ◎ "Torna sulla palla"** (tasto B), sotto quelli dello zoom: con la telecamera inquadra subito la palla (nella boxe i due pugili, nelle gare il gruppo); col drone lo riporta vicino alla palla, dal lato in cui si trovava, e la inquadra. Etichette tradotte nelle cinque lingue.

### 3.7 Fluidità delle transizioni

Misura (`artifacts/review2/pops.mjs`): 45 s di gioco per sport con regia attiva, conteggio dei fotogrammi in cui un'articolazione principale ruota più di 40° in 1/30 s, per 1000 fotogrammi di ciascun personaggio.

| Sport | Prima | Dopo |
| --- | ---: | ---: |
| Calcio | 64,5 | 21,9 |
| Basket | 61,8 | 22,5 |
| Pallavolo | 55,2 | 15,5 |
| Tennis | 50,1 | 19,7 |
| Boxe | 27,6 | 12,3 |
| Golf | 9,3 | 5,9 |
| Ciclismo | 1,9 | 1,8 |
| Vela | 0 | 0 |

Correzioni:
- Cambi d'andatura in dissolvenza: vicino a una soglia di velocità o di direzione si mescolano le due clip invece di saltare dall'una all'altra.
- La scelta dell'andatura segue una velocità smorzata (~0,25 s) calcolata dalla simulazione e registrata nei replay (`gaitVel`): anche una frenata brusca dura una dissolvenza.
- Le pose procedurali (colpi di tennis e pallavolo, tiri del basket) entrano ed escono in dissolvenza come le clip; prima la posa precedente restava ferma 0,18 s e poi scattava.
- I gesti espressivi (esultanze, proteste, gesti dei portieri, controlli di palla) restano fra 0,6× e 1,4× della loro velocità naturale invece di essere compressi nella posa.
- L'appoggio dei piedi a terra si attenua insieme alle clip che lo richiedono.

Quel che resta riguarda soprattutto pugni e colpi veloci (rapidi anche nella realtà) e i colpi procedurali di rete.

### 3.8 Esultanze

Chi esultava mentre si spostava scivolava con l'animazione di festa (circa metà dei fotogrammi di un'esultanza dopo un gol). Ora chi esulta e si muove corre; fermo, esulta. Il marcatore corre al massimo 8 m verso la bandierina e lì balla (`celebrationDance`: solo vere danze, in loop alla loro velocità); i compagni che lo raggiungono e si fermano ballano con lui. Fotogrammi scivolati in un'esultanza di prova: da 104 su 210 a 0.

## 4. Replay e catalogo

- Nuove registrazioni: `animationCatalog: 4` (`ANIMATION_CATALOG` in `src/animation/assetMotion.ts`).
- Ogni clip ha `since` (catalogo in cui entra) e, se serve, `retired: { gruppo: catalogo }`. `resolveAssetClip` filtra con questi campi: è il registro generale delle versioni che mancava. Un replay usa sempre il pool del proprio catalogo.
- `scripts/fixtures/animation-pools.json` congela i pool dei cataloghi 2 e 3 generati dal manifest originale; `check:characters` verifica che ogni gruppo e variante risolva ancora la stessa clip.
- I dati binari delle 198 clip precedenti sono identici bit per bit; l'unica clip nuova (`quaternius_ual1_interact`, `since: 4`) aggiunge 5,7 kB compressi.
- Le correzioni di resa (suole, sincronizzazione del passo, colpi, IK) valgono anche per i vecchi replay: cambiano come viene mostrata una clip, non quale clip viene scelta.

## 5. Stato per elemento

| Elemento | Asset trovato | Clip compilata | Evento raggiungibile | Verificato visivamente |
| --- | --- | --- | --- | --- |
| `Interact` → `officialPoint` | UAL1 | sì (199 clip) | ogni calcio piazzato | sì, rig e partita (`media/arbitro-indica.jpg`) |
| Barba / rasata femminile | Base Characters | — | pugili pari / atlete id%3=2 | sì, primo piano boxe |
| Sincronizzazione passo | — | 39 clip con `cycle` | locomozione di tutti gli sport con clip | sì, video locomozione e misura |
| Clip ritirate | — | restano nel binario | non più scelte dal catalogo 4 | misura e pool congelati |
| Contatto guantone, testa/busto | — | 12 jab, 8 ganci | scambi di boxe | sì, primi piani e video |
| Tiro a contatto | — | 4 clip tiro/passaggio | tutti i tiri e passaggi di piede | sì, rigore |
| Correzione suole | — | — | corpi RPG in tutti gli sport | sì, video boxe |
| Jump, Rail, Consume, Roll, ecc. | UAL1/UAL2 | no | — | sì, sorgente completa (esclusi) |

## 6. Prima/dopo

In `artifacts/review2/` (cartella locale, ignorata da Git):

- `media/boxe-prima-dopo.mp4`: stesso incontro con seme fisso; a sinistra i pugili sprofondano nel ring.
- `media/rigore-prima-dopo.mp4`: stesso rigore; al fotogramma 187, con la palla già partita, prima la gamba non ha ancora colpito, dopo è in accompagnamento sul punto della palla.
- `media/locomozione-prima-dopo.mp4`: camminata, corsa, corsa all'indietro, passo laterale e portiere su griglia.
- `punch-before-after.png`: quattro jab all'istante del contatto.
- `source/*.png`: candidati UAL resi per intero.

Strumenti usati: `video.mjs` (scena deterministica con `requestAnimationFrame` bloccato e `Math.random` con seme), `skate.mjs`, `punch-contact.mjs`, `clipstrip.mjs`, `strips.mjs`, `locovid.mjs`, `sheet.py`.

## 7. Verifiche

`npm run build`, `check:motion`, `check:characters` (con i nuovi controlli su suole, pool congelati, guardia e guantone), `check:clips`, `check:gameplay`, `check:practice`, `check:characters:offline`, `check:secrets`: superati. `npm run check` è instabile anche sul codice originale (fallito 1 volta su 3 con "troppi pochi ordini"); sul codice attuale è fallito nelle prime 3 esecuzioni, svolte in parallelo ad altri test browser, e poi è passato 4 volte su 4.

## 8. Limiti rimasti

- La sincronizzazione usa una cadenza nominale per gruppo (2,12 corsa, 2,5 camminata, 5 boxe), non quella esatta della simulazione: resta circa ±10% di scivolamento. Corsa all'indietro e portiere migliorano poco. A velocità molto diverse da quella naturale la clip accelera visibilmente.
- Il passaggio fra camminata, corsa e passi lenti avviene senza dissolvenza: si vede uno scatto quando la velocità attraversa una soglia.
- Il guantone può compenetrare i guantoni in guardia dell'avversario; l'uppercut resta procedurale perché non esiste una clip adatta.
- `Melee_Hook` resta un affondo eccessivo nel pool dei ganci.
- Al tiro il contatto cade fra due fotogrammi a 30 fps dopo la partenza della palla: anticiparlo richiede di ritardare la palla nella simulazione.
- Il pubblico, le normali delle pose precalcolate, i capelli rigidi e lo spessore delle divise non sono stati rivisti in questa passata.
- Gli uomini con la maglietta hanno i tatuaggi della texture Mixamo. Carol ha uno stile più cartoon degli altri personaggi.

## 9. Rigenerazione

La pipeline resta quella di [animation-ai-handoff.md](animation-ai-handoff.md). `prepare-rpg-animations.mjs` ora chiama `annotateClips()` alla fine; dopo una modifica manuale del manifest basta `node scripts/annotate-clips.mjs`. L'annotazione è idempotente e non tocca il binario. Una clip aggiunta in futuro deve avere `since` del catalogo successivo, e `ANIMATION_CATALOG` va incrementato.
