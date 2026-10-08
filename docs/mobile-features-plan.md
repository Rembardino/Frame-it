# Tutorial, HUD mobile, giroscopio e servizi Android

Piano del 8 ottobre 2026. Conservare le modifiche già presenti nel gioco.

1. Tutorial al primo avvio della partita e pulsante per rileggerlo dal menu. Spiegare ruolo del cameraman, controlli desktop/touch, zoom, campi larghi/medi/primi piani, consigli per cinque sport e criteri del voto. Tradurre nelle cinque lingue esistenti.
2. HUD più piccolo su telefoni, con pannelli semitrasparenti, testo leggibile e centro del campo libero. Controllare anche schermi landscape bassi.
3. Giroscopio opzionale: attivazione esplicita, ricentratura, disponibilità/permessi, orientamento landscape, pausa durante replay/background. Sensore nativo Expo su Android; DeviceOrientation sui browser compatibili. Trascinamento e zoom rimangono utilizzabili.
4. Riprendere da FF la gestione nativa AdMob/UMP e Google Play In-App Updates. Banner soltanto nel menu iniziale; una possibilità di interstitial dopo ogni partita, prima del riepilogo. Errori, assenza di rete/consenso/annunci non bloccano il gioco. Avviso aggiornamento solo nel menu, rimandabile; aggiornamento flessibile con fallback allo store di `com.frameitnow`.
5. Verificare build web, simulazioni/traduzioni, tutorial e layout in browser mobile, ponte/sensori e ciclo degli annunci con test controllati, bundle offline, export/config Android. Documentare i limiti delle verifiche senza dispositivo reale.

## Configurazione confermata dall'utente

Gli ID di Fast & Fertile appartengono a un'altra app e non vengono trasferiti. Le pubblicità restano **disattivate** nelle build attuali. Preparare una configurazione separata: attivazione esplicita, modalità test e tre ID Frame It da fornire in seguito (App ID, banner, interstitial). Nessuna pubblicazione o build cloud richiesta.

## Stato

- [x] Tutorial e traduzioni
- [x] HUD mobile
- [x] Giroscopio
- [x] Annunci e aggiornamenti Android
- [x] Verifiche e documentazione

## Risultati

Build web, simulazioni dei cinque sport, continuità/replay, 314 chiavi in cinque lingue, ciclo AdMob con SDK controllato e prove browser mobile passano. Il browser verifica tutorial/salvataggio, zoom, sensore/calibrazione/pausa, voti compatti trasparenti, fine partita, album senza banner, aggiornamenti/privacy e bundle offline. Export Android Metro/Hermes e introspezione della configurazione passano; annunci disattivati, App ID di test, misurazione ritardata e permessi bloccati verificati. Expo Doctor: 20/21, unico avviso per la dipendenza `@expo/config-plugins` necessaria al plugin AdMob usato anche da FF. Nessuna build cloud o pubblicazione eseguita.

Le prove reali di giroscopio, UMP, annunci e aggiornamenti Play sono da fare su Android. Gli ID live verranno forniti successivamente dall’utente; non sono necessari per completare questa predisposizione con pubblicità disattivate.
