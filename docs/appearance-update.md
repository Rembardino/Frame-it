# Squadre, divise e personaggi — 4 novembre 2026

Il catalogo in `src/teams.ts` contiene dodici club con stemmi originali e dodici nomi per ciascuno degli otto sport. I nomi dei club e le sigle sono tradotti in inglese, italiano, spagnolo, francese e tedesco; le chiavi italiane rimangono nei salvataggi. Tennis, golf e boxe usano nomi di persone, conservati nella forma originale; il loro stemma indica il club. Un'estrazione senza ripetizioni fa ruotare le squadre e applica una divisa da trasferta quando i colori principali si assomigliano.

Gli stemmi sono stati generati con lo strumento integrato image_gen e la skill imagegen: i dodici prompt completi e i percorsi di ogni asset sono in [team-logos.json](team-logos.json). Gli originali PNG sono conservati in `artifacts/team-logos/originals/`; i WebP trasparenti da 384 px utilizzati dal gioco sono in `src/assets/teams/`. `scripts/prepare-team-logos.mjs` prepara gli asset e l'anteprima `artifacts/team-logos/preview.png`.

Le divise usano righe, bande diagonali, fasce orizzontali, metà a contrasto, V, rombi e righe sottili. Stemmi e numeri seguono la deformazione della maglia. Nel calcio c'è un solo numero sulla schiena: eliminati sia la stampa originale del modello sia i piani aggiuntivi che si sovrapponevano. Basket e pallavolo hanno anche un numero sul petto.

Basket e pallavolo hanno stature, corporature, larghezze del viso, carnagioni, capelli e barba diversi. Le scarpe dei pugili sono stivaletti con suola piatta, sostegno alla caviglia e lacci; gli scarpini del modello importato sono nascosti. Il cane del ciclismo è un modello tricolore con occhi, muso, orecchie morbide, collare, quattro zampe articolate e coda animata.

Gli oggetti enormi nello screenshot erano accessori applicati direttamente a ossa con scale differenti: il modello Carol richiede un fattore di normalizzazione di circa 106. Ora ogni accessorio espresso in metri ha un supporto che compensa la scala del personaggio. La verifica copre tutti e quattro i costumi sia sul modello maschile sia su Carol.

Le clip nuove conservano nomi, colori, fantasie e identità dei club; gli stemmi vengono risolti dall'ID del club anche se l'URL degli asset cambia tra due build. Al termine o al salto del replay tornano le squadre della partita corrente.

Verifiche: `npm run check:appearance` controlla i cataloghi, la rotazione completa, le trasparenze, la varietà dei giocatori, i numeri, le scarpe e la scala degli accessori in tutti gli otto sport. I primi piani delle rose, del cane e dei menu sono in `artifacts/appearance/`. `npm run check:clips` controlla anche la conservazione delle squadre nei replay e il ripristino al termine.
