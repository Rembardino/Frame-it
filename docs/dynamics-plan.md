# Dinamica di gioco: calci piazzati e scambi più veri

Piano del 30 ottobre 2026 (branch `new-visual`, seconda parte).

## Diagnosi

Dopo un fallo il gioco riparte con un giocatore che va sul pallone e lo porta via: niente rigori né punizioni, niente barriera, niente attesa del fischio. Il pallone che esce rimbalza su pareti invisibili. Nel tennis e nella pallavolo lo scambio di sottofondo è un ciclo fisso che non finisce mai da solo (la pallina arriva sempre, alla stessa velocità, nello stesso punto) e i punti li decidono solo i copioni. Nella boxe ogni pugno che arriva va a segno.

## Programma

1. **Calcio: calci piazzati** (`sim/match.ts`, `events/library.ts`, `events/director.ts`, `events/types.ts`)
   - Fallo in area → rigore: pallone sul dischetto, tutti fuori dall'area sull'arco, portiere sulla linea, fischio, rincorsa, tiro.
   - Fallo entro 26 m → punizione diretta: barriera di 3-4 uomini a 6,5 m, portiere sul palo scoperto, attaccanti in area, fischio, tiro.
   - Il Director li tratta come azioni principali (rigore, punizione): inquadratura ideale, indizio del regista, voto, replay. L'esito resta coerente col punteggio (`resolveOutcome`), con probabilità di gol più alta sul rigore.
   - Pallone fuori dal campo: rimessa laterale con le mani (posa `throw`), calcio d'angolo con cross in area e colpo di testa, rimessa dal fondo. Niente più rimbalzi sui bordi.
2. **Tennis** (`sim/sports/tennis.ts`)
   - Profondità e velocità variabili: palle corte, lunghe, angolate; durata del volo in base alla distanza.
   - Errori non forzati che chiudono lo scambio (rete o lungo), più probabili con lo scambio che si allunga; i copioni restano prioritari.
3. **Pallavolo** (`sim/sports/volleyball.ts`)
   - Attacchi di sottofondo con direzione variabile e qualche errore (fuori, rete) o difesa mancata: i punti arrivano anche dal gioco, non solo dai copioni.
4. **Boxe** (`sim/sports/boxing.ts`)
   - Colpi parati sulla guardia (nessun punto, suono attutito, piccola reazione) e schivate: il punteggio cresce con i colpi puliti.
5. **Verifiche**: `npm run check`, `check:motion`, `check:i18n`, `check:gameplay`, `build`.

## Stato

- [x] Calcio: rigori, punizioni, rimesse, corner
- [x] Tennis
- [x] Pallavolo
- [x] Boxe
- [x] Verifiche e documentazione

## Risultati

- **Calcio.** `Match.restartPlay` decide la ripresa in base al punto del fallo: in area → rigore (`startSetPiece('penalty')`), entro `match.freeKickRange` (26 m) → punizione diretta con barriera a `wallDistance` (6,5 m) spostata sul palo vicino e portiere sul palo scoperto, altrimenti ripresa rapida come prima. Il pallone che esce dal campo non rimbalza più: rimessa laterale con le mani (posa `throw`, lancio corto a parabola), calcio d'angolo con cross e tiro al volo di chi stacca, rimessa dal fondo. Ogni calcio piazzato emette un `MatchEvent` `setPiece` che fa partire gli eventi `rigore`, `punizione` e `angolo` della libreria (`trigger: 'penalty' | 'freeKick' | 'corner'`, ruolo `taker`): il passo `shoot` aspetta che il battitore sia sul pallone, con `goalChance` dedicata (rigore 0,75). `Director.resolveOutcome` è esposto alla partita (`match.resolveOutcome`) così anche i tiri decisi dalla simulazione rispettano il punteggio. Tempi: posizionamento 4,2 s (stacco TV per chi è in ritardo), fischio, rincorsa, battuta a ~5,5 s.
- **Tennis.** Dritto o rovescio secondo il lato da cui arriva la palla; profondità (7–10,8 m), angolo e velocità (15–22 m/s) cambiano a ogni colpo; dal terzo colpo cresce la probabilità di un errore non forzato (rete o lunga) che assegna il punto. I copioni restano prioritari (`ballScripted`). Il raccordo della palla verso chi batte dura in proporzione alla distanza (`NetBall.hold`).
- **Pallavolo.** Schiacciate dello scambio con direzione variabile; 14% di attacchi fuori o a rete e 7% di ricezioni sbagliate (non sulla battuta) che chiudono lo scambio.
- **Boxe.** Nello scambio di sottofondo un terzo dei colpi finisce sui guantoni: reazione breve, suono attutito, nessun punto; i colpi dei copioni e i knockdown vanno sempre a segno.

Verifiche passate: `npm run check` (otto sport), `check:motion`, `check:i18n` (640 chiavi × 5 lingue), `check:gameplay`, `build`. In una partita simulata di 3 minuti compaiono tipicamente 1-2 falli con rigore o punizione, senza copioni annullati, e la partita si chiude regolarmente.
