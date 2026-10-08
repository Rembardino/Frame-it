# Funzioni mobile e servizi Android

Implementazione dell’8 ottobre 2026. Le configurazioni di riferimento erano in `FF/App.js`, `FF/app.json` e `FF/game/src/update.ts`; la cartella `FF/art` contieneva solo immagini. FF non è stato modificato e i suoi ID di produzione non vengono usati.

## Tutorial e controlli

Il pulsante di avvio apre il tutorial prima della prima partita. Completamento o salto sono salvati in `frameit.tutorial.v1` sul dispositivo; il pulsante Tutorial permette sempre di rileggerlo. La guida ha cinque pagine nelle cinque lingue del gioco, esempi visivi dei tre campi e consigli per calcio, basket, boxe, tennis e pallavolo. Leggere la guida dal menu non avvia la partita.

Il giroscopio si attiva esplicitamente nel menu o in diretta. È disattivato a ogni nuovo avvio/cambio sport. Ricentra prende la posizione attuale del telefono come nuovo riferimento senza riportare la camera al centro del campo. Trascinamento, pinch e zoom +/− rimangono utilizzabili. La rotazione è calibrata e trasformata rispetto all’orientamento dello schermo; i salti dei sensori vengono scartati. Durante trascinamento, replay, fine partita e background gli input del sensore non muovono la camera. Dopo una sospensione il primo campione ricentra il riferimento.

Android usa `expo-sensors` DeviceMotion a circa 30 Hz e invia le rotazioni al gioco offline. A questa frequenza i sensori di orientamento Android non richiedono un permesso runtime. Il permesso ACTIVITY_RECOGNITION del pacchetto è bloccato: il gioco non conta passi. Il browser usa DeviceOrientation, con richiesta del permesso su Safari dove applicabile, HTTPS e timeout se non arrivano eventi. In caso di errore rimangono i controlli touch; viene mostrato un messaggio.

## Pubblicità: disattivate durante i test attuali

`mobile/app.json` → `extra.frameit.ads` contiene `enabled: false` e `testAds: true`. Nessuna richiesta di consenso, inizializzazione JS dell’SDK o richiesta di annunci viene avviata quando `enabled` è false. Il modulo nativo è incluso nella build e usa l’App ID ufficiale di test, con inizializzazione della misurazione ritardata.

La configurazione può essere compilata nel JSON o tramite variabili d’ambiente lette da `mobile/app.config.js`:

| Variabile | Uso |
| --- | --- |
| `FRAMEIT_ADS_ENABLED` | `true` per attivare gli annunci, `false` per disattivarli |
| `FRAMEIT_ADS_MODE` | `test` per unità Google di test, `live` per gli ID Frame It |
| `FRAMEIT_ADMOB_APP_ID` | App ID Android Frame It, con separatore `~` |
| `FRAMEIT_ADMOB_BANNER_ID` | Unità banner Frame It, con separatore `/` |
| `FRAMEIT_ADMOB_INTERSTITIAL_ID` | Unità interstitial Frame It, con separatore `/` |

Per verificare gli annunci in una build nativa di test, impostare `enabled: true`, `testAds: true`; nessun ID di produzione è necessario. Per una build live, impostare `enabled: true`, `testAds: false` e fornire i tre ID Frame It. La configurazione rifiuta una build con annunci live attivi e ID mancanti/di formato errato. Le build in modalità sviluppo usano comunque unità di test. Le impostazioni sono incorporate nella build: cambiamenti a moduli/configurazioni native richiedono una nuova build Android, non il solo aggiornamento dell’HTML.

Il flusso UMP segue FF: prima raccoglie il consenso, recupera il risultato UMP salvato se il refresh fallisce e permette gli annunci soltanto con `canRequestAds`. Quando richiesto da UMP, il menu offre Opzioni privacy; il risultato viene riletto e gli annunci precaricati vengono rimossi se il consenso non li consente più. Gli errori SDK restano visibili nei log nativi.

Il banner è montato soltanto nel menu iniziale quando l’app è in primo piano; non compare nella guida, nell’album, nella partita o nei risultati. L’interstitial viene precaricato una volta durante ogni partita e ha una sola opportunità di visualizzazione al termine, dopo la chiusura delle valutazioni. A chiusura dell’annuncio il giocatore vede il riepilogo già preparato. Se non è pronto, manca consenso/rete, l’app è in background o l’SDK fallisce, il riepilogo rimane disponibile: nessuna attesa e nessun annuncio tardivo nella partita successiva. Nessun loop di retry né rewarded ad.

La versione di `react-native-google-mobile-ads` è fissata a **16.3.4**, come quella verificata nel riferimento FF, per evitare aggiornamenti automatici della dipendenza Android con Kotlin incompatibile. Google Play richiederà le dichiarazioni appropriate per gli SDK effettivamente inclusi/attivati prima della pubblicazione; le bozze legali esistenti restano da completare.

## Nuova versione disponibile

`expo-in-app-updates` **0.12.0**, come in FF, controlla Google Play all’avvio, senza attendere il risultato per far giocare. Il messaggio appare solo nel menu, con Aggiorna e Più tardi. Preferisce l’aggiornamento flessibile e usa quello immediato quando Play permette soltanto quest’ultimo. Il modulo completa l’installazione quando il download termina. Se il flusso non può partire, il pulsante apre la scheda Play di **com.frameitnow**, con fallback HTTPS.

Il controllo dipende da installazione firmata/distribuita tramite Play, account e track con una versione più recente accessibile. APK installati manualmente, Expo Go e assenza di Play Services/rete possono non restituire aggiornamenti. Non viene copiato un numero di versione o URL da Fast & Fertile; non serve un server aggiornamenti esterno.

## Verifiche

Comandi nella radice: `npm run check`, `npm run check:motion`, `npm run check:i18n`, `npm run check:native`, `npm run check:mobile`, `npm run build`.

Comandi in `mobile/`: `npm run bundle:game`, `npx expo install --check`, `npx expo export --platform android`, `npx expo config --type introspect --json`.

Le verifiche browser usano il sensore e il ponte nativo simulati. I test degli annunci eseguono il gestore reale con un SDK controllato. Export e introspezione controllano bundle e configurazione, senza compilare un AAB o pubblicare l’app. Sensibilità e assi del giroscopio sul telefono, form UMP, fill degli annunci e installazione di un aggiornamento Play richiedono ancora una prova su Android reale. Nessuna build cloud viene lanciata da questi controlli.

Fonti tecniche: [Expo DeviceMotion](https://docs.expo.dev/versions/latest/sdk/devicemotion/), [AdMob: consenso europeo](https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent), [AdMob: formati](https://docs.page/invertase/react-native-google-mobile-ads/ad-formats), [Expo In-App Updates](https://github.com/SohelIslamImran/expo-in-app-updates).
