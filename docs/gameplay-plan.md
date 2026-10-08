# Movimento degli atleti e leggibilità delle azioni

Piano dell'8 ottobre 2026.

1. Corsa con frenata nelle inversioni, arrivo graduale, rotazione limitata, passi laterali e all'indietro coerenti con la direzione.
2. Evitare gli incroci prima del contatto; ridurre le spinte tra corpi, dare priorità a chi esegue un gesto da fermo e rispettare i bordi del campo.
3. Calcio: supporto dei centrocampisti, inserimenti degli attaccanti e pressing meno affollato. Basket: tagli alternati delle ali e difensori rivolti al proprio avversario.
4. Tennis: anticipo della traiettoria e recupero verso il centro. Pallavolo: copertura per ruolo e preparazione del muro. Boxe: spostamenti circolari, passi brevi, arretramento al colpo e punti solo a distanza utile.
5. Verificare arrivo, evitamento, fluidità, colpi e replay, tutti i copioni e le partite complete dei cinque sport; controllare la scena nel browser e rigenerare il bundle offline.

## Stato

- [x] Prima implementazione di locomozione, animazioni e tattiche
- [x] Verifiche e correzioni
- [x] Bundle offline e documentazione dei risultati

## Risultati

La build TypeScript/Vite e le simulazioni dei cinque sport passano. Ogni copione di boxe, tennis e pallavolo viene eseguito da entrambi i lati, con punteggi, rete, ripristino del replay e chiusura della partita controllati. Nessun copione bloccato nelle sessioni simulate.

I controlli di movimento verificano accelerazione limitata, arresto alla destinazione, frenata prima di invertire la corsa, incroci longitudinali e laterali senza blocchi, movimento ridotto durante i gesti da fermo, colpi fuori portata senza punti e replay identici alla diretta. Verificano inoltre che un nuovo copione aspetti la palla in arrivo e che il battitore raggiunga il centrocampo prima della ripresa. In 60 secondi di gioco automatico, lo spostamento massimo degli atleti per fotogramma a 60 Hz rimane sotto 0,11 m.

Chromium rende e cattura un gesto sportivo animato per ciascuno dei cinque sport, senza errori JavaScript: immagini in `artifacts/gameplay/`. Le 314 chiavi nelle cinque lingue passano i controlli. Il bundle offline è stato rigenerato con i nuovi movimenti.

Passano anche i controlli browser del tutorial, zoom, giroscopio/calibrazione/pausa, voti semitrasparenti, layout landscape, fine partita, ponte Android e bundle offline. L'export Expo Android Metro/Hermes termina correttamente con 752 moduli. Non è stata generata o pubblicata una nuova build APK/AAB.

Restano simulazioni arcade guidate dai copioni; queste verifiche non sostituiscono una prova dei movimenti e delle prestazioni su un telefono reale.
