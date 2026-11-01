# Asset riutilizzati da RPG 3D

Integrazione sul branch `nuovi-modelli`, dalla cartella locale `RPG 3D`. Il progetto Godot originale è stato consultato e lasciato invariato.

## Persone

I corpi `Superhero_Male_FullBody` e `Superhero_Female_FullBody` del kit Quaternius Universal Base Characters diventano due modelli sportivi:

| Modello nel gioco | Impiego | Triangoli | Dimensione |
| --- | --- | ---: | ---: |
| `rpg-boxer` | Pugili a torso scoperto con pantaloncini e guantoni | 5.117 | 258 kB |
| `rpg-athlete-female` | Atlete della seconda squadra in basket, tennis, pallavolo e golf; parte di allenatori, steward e spettatori | 6.560 | 380 kB |

Il calciatore di `new_asset` resta disponibile per gli altri ruoli umani. I personaggi fantasy restano esclusivamente mascotte.

Le superfici dei corpi vengono tagliate lungo piani precisi, interpolando anche i pesi dello scheletro, per ottenere bordi regolari di maglia, pantaloncini e calzettoni. La divisa femminile ha maglia e pantaloncini opachi. Le scarpe derivano dal calciatore già integrato. Carnagione, divise, scarpe, colore e forma dei capelli variano come sugli altri umani. Sono importate due vere acconciature per ciascun nuovo corpo, più la variante rasata. Non vengono usati abiti medievali, armi o capelli di altri autori senza una licenza identificata.

## Animazioni

Le due Universal Animation Library contengono **43 clip ciascuna**. L'audit registra tutte le **86 animazioni**, le dimensioni e gli hash delle librerie, dei modelli e delle loro dipendenze. Gli export Unity e le versioni `_RM` rappresentano gli stessi movimenti; il gioco usa le versioni senza spostamento della radice, perché la posizione è controllata dalla simulazione.

Sono aggiunte **32 clip compilate**, portando la libreria da 166 a **198**:

| Contesto | Movimenti aggiunti |
| --- | --- |
| Boxe | Jab, diretto, gancio con recupero, schivata, reazioni a testa e busto, due cadute e rialzata |
| Calcio e portieri | Scivolata con ingresso, tratto centrale e uscita; raccolta, trasporto e rilancio della palla |
| Comuni | Camminate, jogging, sprint, danza, conversazione, telefono, braccia conserte, gesti di assenso e dissenso, spinta |
| Pubblico | Sedersi, alzarsi, stare seduti e parlare da seduti |
| Solo mascotte | Attesa, camminata e grattata da zombie |

`Melee_Hook_Rec` viene unita al gancio; `Slide_Loop` e `Slide_Exit` vengono unite a `Slide_Start`: sono parti della stessa azione, non varianti estratte artificialmente. Le altre varianti restano distinte. `Hit_Knockback`, che mostra una vera caduta, viene usata come knockdown. Le animazioni con spade, scudi, pistole, magie e attività senza un impiego sportivo sono escluse. Ogni decisione è in [rpg-asset-audit.json](rpg-asset-audit.json).

Lo scheletro Quaternius usa nomi e assi diversi da Mixamo. L'importazione rimappa articolazioni e dita e trasferisce le rotazioni rispetto alla posa di riposo. Lo spostamento del bacino è convertito nell'asse verticale del gioco, anche quando il bacino sorgente ha l'asse locale Z verticale. I nuovi movimenti vengono usati anche dal calciatore esistente.

Il pubblico usa sei pose precalcolate e interpolate sulla GPU: seduto, in piedi, esultanza, conversazione, sedersi e alzarsi. Le nuove pose non richiedono uno scheletro animato per ciascuna persona in tribuna. Le registrazioni salvano la versione del catalogo: i vecchi replay continuano a scegliere le precedenti varianti e i precedenti gesti procedurali.

## Provenienza e rigenerazione

Autore: **Quaternius**. I tre pacchetti sorgente includono la dichiarazione **CC0 1.0 Universal / Public Domain Dedication**. Le dichiarazioni originali sono conservate in [Base Characters](licenses/quaternius-base-characters.txt), [UAL1](licenses/quaternius-ual1.txt) e [UAL2](licenses/quaternius-ual2.txt). Le modifiche sportive e l'ottimizzazione sono generate dagli script del repository.

Dopo aver preparato gli asset di `new_asset` come descritto in [nuovi-modelli.md](nuovi-modelli.md), eseguire dalla radice:

```powershell
node scripts/prepare-rpg-models.mjs "C:\Users\P354606\OneDrive - Posti Oyj\Desktop\RPG 3D"
node scripts/prepare-rpg-animations.mjs "C:\Users\P354606\OneDrive - Posti Oyj\Desktop\RPG 3D"
```

Senza argomento, gli script cercano `RPG 3D` nella stessa posizione sotto il profilo utente. L'importazione delle animazioni può essere ripetuta: sostituisce le proprie aggiunte, conservando i dati binari delle precedenti 166 clip. L'audit dei modelli viene prodotto dal primo comando e incorporato dal secondo. Per giocare non servono gli originali: i GLB e la libreria compressa sono già nel repository.

## Verifiche

- Build TypeScript/Vite e simulazioni automatiche.
- Otto sport in Chromium, modello atteso per ciascun ruolo provato, pose del pubblico, caricamento e recupero da errore degli asset.
- Confronto esatto delle trasformazioni prima e dopo un replay; compatibilità del catalogo precedente e delle clip persistenti.
- Tutte le 198 clip rese a due istanti sui nuovi corpi maschile e femminile; le 32 aggiunte anche sul calciatore. Controllo delle deformazioni e revisione delle tavole in `artifacts/rpg-asset-audit/`.
- Calcio, boxe e golf avviati dal contenitore mobile HTML con la rete disabilitata.

Le immagini dei modelli nel gioco sono in `artifacts/characters/`. Geometrie, texture, manifest e animazioni di tutti i personaggi occupano insieme circa **6,3 MB**; il contenitore HTML offline completo circa **9,5 MB**.
