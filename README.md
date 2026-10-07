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
- Tocca il replay per saltarlo e tornare alla diretta.

## Sport

- Calcio e basket: azioni, distrazioni, esultanze e punteggio dedicati.
- Boxe: due pugili, ring e guantoni, jab, ganci, montanti, contrattacchi e knockdown. La sessione arcade dura tre riprese; il tabellone conta i colpi puliti, con due punti per il knockdown.
- Tennis: singolare con racchette, servizio, dritto, rovescio, volée e smash. Il tabellone mostra game e punti 0/15/30/40, parità e vantaggio. La sessione termina dopo tre minuti di gioco.
- Pallavolo: sei contro sei, servizio, ricezione, alzata, schiacciata, primo tempo e muro. Ogni scambio decisivo assegna un punto; la sessione arcade dura tre minuti.

La regia, il replay, il voto dell'inquadratura e il record locale funzionano per ogni sport. Sono simulazioni arcade a copioni, con regole semplificate per dare priorità al lavoro di ripresa.

## Android AAB (Expo)

Il contenitore Expo in `mobile/` include il gioco offline e usa il progetto `@rembardino/frame-it`, package Android `come.frameitnow`.

Dopo `npm ci` nella radice, entra in `mobile/`, esegui `npm ci`, quindi `npm run build:aab`. Il profilo `production` genera un AAB; il profilo `preview` genera un APK per test diretti. Le istruzioni e i limiti delle verifiche sono in [docs/android-build.md](docs/android-build.md).

## Verifiche e build

```sh
npm run check
npm run check:i18n
npm run build
```

I test coprono tutti e cinque gli sport. Per boxe, tennis e pallavolo eseguono anche ogni azione da entrambi i lati, controllano campo, punteggio, traiettorie sopra la rete, ripristino del replay e fine della sessione.

Le configurazioni sono in `src/config.ts`. Le simulazioni dei nuovi sport sono separate in `src/sim/sports/`; i copioni sono in `src/events/racketAndRing.ts` e i campi in `src/render/sportCourts.ts`.
