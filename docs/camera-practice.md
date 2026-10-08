# Tutorial pratico della camera

Tre esercizi reali per ciascuno dei cinque sport, dopo le pagine introduttive o direttamente da `Allenamento camera` nel menu.

## Esempi

| Sport | Esercizio 1 | Esercizio 2 | Esercizio 3 |
| --- | --- | --- | --- |
| Calcio | Passaggio in contropiede, spazio davanti alla corsa | Parata: portiere, palla e porta | Primo piano sull'esultanza |
| Basket | Giro palla e ricezione | Tiro con palla e canestro in campo | Primo piano dopo il canestro |
| Boxe | Jab e contatto | Gancio e reazione | Knockdown con avversario e arbitro |
| Tennis | Servizio e spazio sopra la racchetta | Scambio incrociato | Avvicinamento a rete e volée |
| Pallavolo | Servizio | Schiacciata e muro | Muro vincente ai due lati della rete |

## Come funziona

Il gioco registra il copione della partita in una simulazione separata. Lo mostra per circa tre secondi con la camera guida, poi ferma il momento da imparare. La miniatura mostra la stessa scena nell'inquadratura ideale; le guide indicano le posizioni sullo schermo dei soggetti. Il giocatore regola la camera usando trascinamento, tastiera, pizzico, pulsanti zoom o giroscopio opzionale.

Il voto dell'esercizio usa copertura, taglia e composizione del sistema di punteggio delle partite, con gli stessi pesi normalizzati. L'esercizio supera il controllo dopo 0,7 secondi a 100/100. Il modello è calcolato per il formato attuale dello schermo. Il voto completo di una partita include anche fluidità e tempismo: il tutorial lo spiega e la dimostrazione lo ricorda.

Sono disponibili `Rivedi esempio`, guide ON/OFF, salto del singolo esercizio, ritorno alla guida o al menu e salto della pratica. Completare gli esercizi del primo tutorial avvia la partita; aprirli dal menu torna al menu. Il tutorial usa la chiave v2 per proporre il nuovo corso anche a chi aveva già visto le sole pagine della versione precedente. Record e album rimangono indipendenti dal tutorial.

## Piano e stato

- [x] Riutilizzare copioni, atleti e punti chiave della regia per 15 esempi reali.
- [x] Mostrare la dimostrazione, fermare l'azione e offrire miniatura, guide e feedback.
- [x] Verificare che la camera possa raggiungere il modello da 100/100 nei formati landscape.
- [x] Integrare il corso iniziale e l'accesso diretto dal menu, con comandi touch, tastiera e sensore.
- [x] Tenere cronometro, punti e stato della partita separati dalla pratica; nessun interstitial dopo gli esercizi.
- [x] Completare le verifiche del primo avvio e del bundle mobile.

## Verifiche completate

Build TypeScript/Vite, simulazioni delle partite e 355 chiavi in cinque lingue passano. I controlli dei modelli eseguono tre varianti di ogni esempio con quattro proporzioni dello schermo: tutti i 180 modelli valutati raggiungono 100/100 e rispettano i limiti della camera; le inquadrature di partenza richiedono una correzione.

Le prove Chromium dei cinque sport completano tutti i 15 esercizi: camera e zoom funzionano, il punteggio raggiunge 100/100, guide e ripetizione rispondono, l'uscita ripristina la camera e la partita iniziale. Nessun errore JavaScript, nessun punto o tempo aggiunto alla partita, nessun messaggio nativo di fine partita dalla pratica. Schermate in `artifacts/camera-practice/`.

Il primo corso viene verificato anche con il vecchio tutorial già salvato: il nuovo si apre, riproduce l'esempio, permette di tornare alla teoria e avvia la partita solo dopo l'ultima esercitazione. I controlli generali mobile di tutorial, zoom, giroscopio, layout, fine partita e ponte Android passano.

Il bundle offline è stato rigenerato e provato direttamente nel browser: un esercizio reale di tennis raggiunge 100/100 e torna correttamente al menu, senza far avanzare la partita. L'export Expo Android Metro/Hermes termina con 752 moduli. Nessuna nuova build APK/AAB è stata generata o pubblicata. Le verifiche in browser non sostituiscono una prova su telefono reale.
