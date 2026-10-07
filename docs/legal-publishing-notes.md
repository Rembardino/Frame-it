# Pubblicazione dei documenti di Frame It

Stato: bozze in inglese del 7 ottobre 2026. Dati forniti dall'utente: Luca Retattino, luca.retattino@gmail.com. Modello previsto: app gratuita con pubblicità o acquisti. Il codice attuale non implementa account, advertising SDK, acquisti, analytics o cloud save.

Testi: `public/legal/privacy-en.md` e `public/legal/terms-en.md`. Pagine: `public/privacy.html` e `public/terms.html`. Non sono ancora collegate dal gioco. Non sono testi legalmente approvati né una EULA personalizzata per lo store.

Prima della pubblicazione:

1. Completare data di efficacia, indirizzo e Paese, eventuali dati societari, audience e age rating. Non riutilizzare data o descrizione di Fast & Fertile.
2. Confermare monetizzazione, SDK/versione, partner, formati pubblicitari, premi e acquisti effettivi. AdMob è un'ipotesi basata sul modello fornito, non un SDK attualmente integrato. Rimuovere sezioni inutilizzate e aggiornare quelle condizionali quando vengono attivate. Nessuna gemma, continue o acquisto specifico è stato inventato.
3. Verificare hosting e log, servizio email e conservazione, eventuali ricevute di acquisto, trasferimenti e salvaguardie. Compilare i campi corrispondenti. Email e IP possono essere dati personali: non dichiarare genericamente che nessun dato è trattato.
4. Implementare le scelte privacy richieste prima di attivare pubblicità, compreso il percorso per modificarle. La policy non implementa consenso. Per annunci personalizzati in SEE, UK e Svizzera verificare CMP certificata Google e integrazione UMP; verificare separatamente requisiti Apple ATT ove applicabili. Annunci non personalizzati non significano necessariamente assenza di trattamento.
5. Confermare age rating e audience e configurare correttamente eventuali servizi per minori. Allineare Google Play Data safety e App Store App Privacy a TUTTI gli SDK della build distribuita, incluso il wrapper nativo.
6. Verificare diritti del consumatore, attribuzioni e presentazione/accettazione dei termini. La bozza non impone rinunce automatiche al recesso né fori esclusivi inventati. Per Apple mantenere la EULA standard salvo scelta esplicita: questa bozza non contiene tutti i termini minimi per sostituirla.
7. Far revisionare i testi per sede e mercati, sostituire tutti i campi tra parentesi quadre, rimuovere Draft e `noindex`, quindi collegare le pagine dall'app e usare URL pubblici stabili negli store.

Fonti ufficiali consultate il 7 ottobre 2026:

- [Google Mobile Ads SDK: dati](https://developers.google.com/admob/android/privacy/play-data-disclosure)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [AdMob: consenso e provider](https://support.google.com/admob/answer/7666519?hl=en)
- [AdMob: requisiti CMP](https://support.google.com/admob/answer/13554116?hl=en)
- [Clausole abusive — Your Europe](https://europa.eu/youreurope/citizens/consumers/unfair-treatment/unfair-contract-terms/index_en.htm)
- [Contratti digitali — Commissione europea](https://commission.europa.eu/topics/business-and-industry/contract-rules/digital-contracts/digital-contract-rules_en)
- [Informazioni contrattuali — Your Europe](https://europa.eu/youreurope/citizens/consumers/shopping/contract-information/index_en.htm)
- [EULA standard — Apple](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/)
- [EULA personalizzata — Apple Developer](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement)
