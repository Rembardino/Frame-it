# Frame It — Android / Expo EAS

Il progetto web rimane Vite/Three.js nella radice. `mobile/` contiene un'app Expo SDK 57 con React Native WebView che include il gioco offline nel bundle: non carica un sito esterno. Package name indicato dall'utente: `come.frameitnow`. Progetto EAS: `@rembardino/frame-it`, ID `f7b9a919-96e9-48db-86db-bb866c41ff62`.

Icona usata: `public/icons/frame-it-icon-concept-v3-action.png`. Orientamento landscape; camera/microfono e accesso ai file non richiesti. Salvataggi nel localStorage della WebView con origine stabile. Cambio sport e Rigioca usano un ponte con il contenitore, non URL remoti. App in background: simulazione sospesa. Non sono presenti pubblicità o acquisti in-app.

Lingua predefinita inglese, selettore English / Italiano / Español / Français / Deutsch nella schermata iniziale. Preferenza persistente nella WebView; il ponte permette di cambiare lingua offline e traduce anche i messaggi di recupero Android. Nessun caricamento remoto di traduzioni. Controllo deterministico: `npm run check:i18n` nella radice.

## Riprodurre la build

1. Nella radice: `npm ci`, `npm run check`, `npm run build`.
2. Dentro `mobile/`: `npm ci`, `npm run bundle:game`, `npx expo install --check`, `npx expo-doctor`.
3. Verificare il bundle: `npx expo export --platform android`.
4. Verificare accesso e progetto: `npx eas-cli@24.11.0 whoami`, `npx eas-cli@24.11.0 project:info`.
5. AAB: `npm run build:aab`. Profilo `production`, versione app 1.0.0, versionCode incrementato da EAS, firma gestita da EAS.
6. APK installabile per prove su dispositivo: `npx eas-cli@24.11.0 build --platform android --profile preview`.

`scripts/bundle-mobile.mjs` compila il gioco in IIFE e inserisce CSS e JS nell'HTML. Il risultato è `mobile/generated/game.js`, rigenerabile e ignorato da Git. L'hook EAS `eas-build-post-install` installa le dipendenze web dal lockfile e rigenera il gioco sul server prima del bundle nativo.

Un AAB non è un APK installabile direttamente: va distribuito tramite Google Play o strumenti per app bundle. Questa operazione crea il file, non invia automaticamente l'app allo store.

Monitor e download: dalla radice `node scripts/watch-aab.mjs BUILD_UUID`. Controlla il progetto e il package attesi, salva lo stato in `artifacts/eas-build-BUILD_UUID.json` e scarica l'AAB a build conclusa senza sovrascrivere file diversi. Verifica la firma con `jarsigner` se disponibile e registra SHA-256. Usa la sessione Expo locale senza salvarne le credenziali nel repository.

## Verifiche locali eseguite

- Test simulazione: tutti e cinque gli sport passano.
- Build web passa.
- Test delle traduzioni: 273 chiavi in cinque lingue, copertura dei cinque sport, messaggi composti della regia, HUD, album, riepilogo e ponte lingua passano. Inglese predefinito e precedenza URL/preferenza salvata verificati.
- Bundle HTML offline provato in browser con viewport mobile: avvio e rendering di ogni sport, ponte cambio sport, pausa/ripresa e conservazione localStorage passano.
- Gesti touch reali emulati via CDP: pulsante zoom, riepilogo fine partita e ponte Rigioca passano. Una partita chiusa senza punti non crea un nuovo record, come previsto dal gioco.
- Export Android Metro/Hermes passa.
- Expo Doctor: 21/21 controlli passano; dipendenze allineate a SDK 57.
- Prebuild Android passa; applicationId `come.frameitnow`, landscape e rimozione di camera/microfono/storage verificati nel progetto generato. Per mantenere `mobile/` gestito da CNG, la copia locale generata per controllo è conservata in `artifacts/android-prebuild-check`, non in `mobile/android`.

Queste verifiche non sostituiscono una prova su telefono Android reale della WebView, dei gesti e delle prestazioni. Nessun emulatore Android è disponibile nell'ambiente corrente.

`npm audit --omit=dev` segnala 22 vulnerabilità transitive (7 moderate, 15 high) nella catena Expo/React Native e degli strumenti di build. Non è stato applicato `npm audit fix --force`: propone downgrade incompatibili con l'SDK selezionato. Verificare gli aggiornamenti upstream prima della pubblicazione definitiva.

## Fonti

- [EAS: prima build](https://docs.expo.dev/build/setup/)
- [EAS: AAB e APK](https://docs.expo.dev/build-reference/apk/)
- [Expo: versioni SDK](https://docs.expo.dev/versions/latest/)
- [Expo: WebView](https://docs.expo.dev/versions/latest/sdk/webview/)
