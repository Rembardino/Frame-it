# Frame It: Live Sports TV

Gioco arcade da cameraman: riprendi le azioni sportive, segui gli ordini della regia e rivedi i tuoi momenti migliori al rallentatore.

## Avvio

```sh
npm install
npm run dev
```

Scegli lo sport nella schermata iniziale: Calcio, Basket, Boxe, Tennis o Pallavolo. Puoi anche aprire direttamente `?sport=boxe`, `?sport=tennis` o `?sport=pallavolo`.

La lingua iniziale è l'inglese. Il menu Language permette di scegliere English, Italiano, Español, Français o Deutsch e salva la scelta sul dispositivo, senza cambiare record e clip. Puoi forzarla con `?lang=it` (combinabile con `sport`). Interfaccia, regia, voti e riepilogo sono tradotti; i nomi propri delle squadre rimangono invariati.

## Controlli

- Trascinamento, frecce o WASD: inquadratura.
- E o +: zoom avanti. Q o −: zoom indietro. Anche rotella del mouse.
- Su telefono: trascina, pizzica o tieni premuti i pulsanti +/−.
- Giroscopio opzionale: attivalo nel menu o in partita, poi ruota il telefono per inquadrare. `Ricentra` ricalibra la posizione; trascinamento e zoom restano disponibili. Su browser servono HTTPS e sensori/permessi compatibili.
- Tocca il replay per saltarlo e tornare alla diretta.

Al primo avvio della partita compare un tutorial in cinque passaggi, seguito da tre esercizi pratici dello sport scelto. Guarda una breve azione reale con la camera guida, poi ricrea l'inquadratura sul momento fermo: miniatura del modello da 100/100, guide sovrapposte, consigli e voto in tempo reale aiutano a regolare camera e zoom. Mantieni 100/100 per un istante per passare all'esercizio successivo. Puoi rivedere l'esempio, togliere le guide o saltare un esercizio. Il menu `Allenamento camera` apre direttamente la pratica; `Tutorial` ripete anche la spiegazione. Nessun esercizio fa avanzare la partita o assegna punti al record. Dettagli ed esempi: [docs/camera-practice.md](docs/camera-practice.md).

I pannelli dei voti e il tabellone sono più piccoli e semitrasparenti su telefono.

## Sport

- Calcio e basket: azioni, distrazioni, esultanze e punteggio dedicati.
- Boxe: due pugili, ring e guantoni, jab, ganci, montanti, contrattacchi e knockdown. La sessione arcade dura tre riprese; il tabellone conta i colpi puliti, con due punti per il knockdown.
- Tennis: singolare con racchette, servizio, dritto, rovescio, volée e smash. Il tabellone mostra game e punti 0/15/30/40, parità e vantaggio. La sessione termina dopo tre minuti di gioco.
- Pallavolo: sei contro sei, servizio, ricezione, alzata, schiacciata, primo tempo e muro. Ogni scambio decisivo assegna un punto; la sessione arcade dura tre minuti.

La regia, il replay, il voto dell'inquadratura e il record locale funzionano per ogni sport. Sono simulazioni arcade a copioni, con regole semplificate per dare priorità al lavoro di ripresa.

Gli atleti frenano prima di invertire la corsa, evitano gli incroci e riducono il movimento durante tiri e salti. Passi laterali e all'indietro seguono la direzione effettiva. Calcio e basket hanno supporto, inserimenti, tagli e marcature; i tennisti anticipano la palla e recuperano il centro, la pallavolo prepara copertura e muro, i pugili si spostano attorno all'avversario e arretrano ai colpi. Le azioni dei giochi di rete aspettano la traiettoria in corso; dopo un gol il battitore torna al centro senza teletrasportarsi. Piano e verifiche: [docs/gameplay-plan.md](docs/gameplay-plan.md).

## Android AAB (Expo)

Il contenitore Expo in `mobile/` include il gioco offline e usa il progetto `@rembardino/frame-it`, package Android `com.frameitnow`.

Dopo `npm ci` nella radice, entra in `mobile/`, esegui `npm ci`, quindi `npm run build:aab`. Il profilo `production` genera un AAB; il profilo `preview` genera un APK per test diretti. Le istruzioni e i limiti delle verifiche sono in [docs/android-build.md](docs/android-build.md).

## Verifiche e build

```sh
npm run check
npm run check:motion
npm run check:gameplay
npm run check:lessons
npm run check:practice
npm run check:i18n
npm run check:native
npm run check:mobile
npm run build
```

I test coprono tutti e cinque gli sport. Per boxe, tennis e pallavolo eseguono anche ogni azione da entrambi i lati, controllano campo, punteggio, traiettorie sopra la rete, ripristino del replay e fine della sessione.

`check:motion` verifica accelerazione, frenata, arresto, incroci, gesti da fermo, sincronizzazione dei colpi, ripresa da centrocampo e replay. `check:gameplay` rende in Chromium un'azione animata per ogni sport e salva le schermate in `artifacts/gameplay/`.

`check:lessons` verifica i 15 esempi reali, tre varianti per esempio e quattro formati landscape, controllando che il modello sia raggiungibile e valga 100/100. `check:practice` usa il browser per comandi, punteggio, ripetizione, uscita, isolamento della partita, guide, layout e avvio del gioco dopo il corso. Le immagini sono in `artifacts/camera-practice/`.

`check:native` verifica il ciclo degli annunci con SDK controllato; `check:mobile` usa Playwright/Chromium (installazione browser: `npx playwright install chromium`, oppure Edge su Windows) per tutorial, zoom, sensore simulato, layout, fine partita e ponte Android. Le schermate sono salvate in `artifacts/mobile-features/`.

Le pubblicità Android sono predisposte ma **disattivate**. Quando saranno attivate: banner solo nel menu iniziale, interstitial dopo ciascuna partita se disponibile e consentito. Gli ID di Frame It sono separati da FF. L’avviso di una nuova versione usa Google Play e compare nel menu; il controllo non blocca il gioco offline. Configurazione e limiti delle verifiche: [docs/mobile-services.md](docs/mobile-services.md). Piano: [docs/mobile-features-plan.md](docs/mobile-features-plan.md).

Le configurazioni sono in `src/config.ts`. Le simulazioni dei nuovi sport sono separate in `src/sim/sports/`; i copioni sono in `src/events/racketAndRing.ts` e i campi in `src/render/sportCourts.ts`.
