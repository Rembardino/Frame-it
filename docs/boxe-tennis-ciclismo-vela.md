# Boxe, tennis, ciclismo e vela: seconda passata

Lavoro del 10 novembre 2026 sul branch `nuovi-modelli`, dopo [pubblico-e-fluidita.md](pubblico-e-fluidita.md). Non ancora pubblicato.
Risponde a quattro osservazioni: pugili che sembrano nudi e scambio povero; tennis con racchette enormi, colpi brutti e tabellone sbagliato; ciclismo con strade e paesi elementari; vela "non pronta".

## Boxe

- **Pantaloncini veri**: fascia alta in vita e gamba fino sopra il ginocchio, dipinte sul corpo attorno ai pantaloncini corti del modello (`styleSkin` in `render/skin.ts`, parametro `trunks`). La fascia prende il colore dei guantoni. Tolto lo stemma, che finiva sul cavallo; banda laterale sottile (`uniforms.ts`, motivo 8).
- **Capelli**: la calotta rasata del modello semplificato affondava a chiazze nella testa. Ora la rasatura è dipinta sul cuoio capelluto (parametro `scalp`), e chi ha i capelli lunghi ha i lati sfumati.
- **Guantoni** (`boxingGlove` in `render/equipment.ts`): sacco imbottito, nocche, pollice, polso lungo con la fascia. La punta resta a 0,225 m dal polso, la misura che usa `landPunch`.
- **Scambio** (`sim/sports/boxing.ts`): chi para o schiva risponde subito con uno o due colpi (`reply`), quindi nascono botta e risposta; pause più corte; il montante usa le riprese del gancio invece di una posa rigida.

## Tennis

- **Racchetta** a grandezza vera: 68 cm, ovale 25×33 cm, gola a V. Il centro delle corde è `RACKET_REACH` (0,46 m) in `animation/motion.ts`: lo usano sia il disegno sia il punto d'impatto.
- **Colpi** (`tennisStroke`): apertura con le spalle girate, impatto davanti e di fianco, finale sopra la spalla opposta. Rovescio a due mani. Mentre la palla arriva chi deve colpire apre già il colpo (`poseDir` ±1, anche correndo).
- **Servizio**: dura 1,5 s (`TENNIS_SERVE`): lancio di palla dal palmo libero, caricamento, impatto in alto. Va in diagonale e rimbalza nel rettangolo di battuta. Tra un punto e l'altro la palla sta in mano a chi serve.
- **Scambio**: niente più palle che rallentano in aria per farsi raggiungere. Se la palla è più veloce dell'avversario è un vincente e prosegue oltre il rimbalzo. Ogni tanto una palla corta. Corretto il lato del dritto, che era invertito rispetto al braccio della racchetta.
- **Maxischermo**: game vinti e punti del game (0, 15, 30, 40, AD), gli stessi del punteggio in alto (`board()` della simulazione).
- Eventi: `t-ace` e `t-smash` anticipano il servizio, che ora impiega 0,9 s ad arrivare all'impatto.

## Ciclismo

- **Strada** (`sim/sports/cyclingRoute.ts`): curve ampie di norma (raggio 55 m) e strette dove il punto lo chiede (terzo numero del punto: 13-14 = tornante). Tre tappe ridisegnate: due tornanti e una S in collina; quattro tornanti fino al passo e paese in riva al fiume in montagna; chicane sul lungomare nella tappa tecnica. Il paese è legato a due punti della strada (`village: [da, a]`), non a una frazione della lunghezza.
- **Paesaggio**: campi su una trama inclinata, alcuni divisi in due, con vigna e prato fiorito oltre a grano, erba medica, terra arata e girasoli; cascine con fienile e silo; balle di fieno; paracarri; guardrail all'esterno delle curve strette; muretti all'ingresso del paese.
- **Paese**: tre file di case invece di due muri, finestre con persiane a ogni piano, porte, comignoli, timpani chiusi, tende delle botteghe; chiesa con campanile e cuspide, piazza e fontana; festoni di bandierine sopra la via.
- **Corridori** (`sim/sports/cycling.ts`): il gruppo si rimescola (scambi di posto ogni pochi secondi), va in fila indiana nelle curve strette e nelle discese veloci, si allunga in salita; i meno scalatori perdono metri sulle rampe e rientrano dopo; qualcuno si alza sui pedali.
- **Eventi nuovi**: Gran premio della montagna (striscione e ala di folla in cima, solo se la tappa ha una salita vera: `SUMMIT_S`) e foratura (accosta, si ferma, riparte e insegue).

## Vela

- **Partenza**: le barche vanno avanti e indietro al traverso subito dietro la linea e al colpo di cannone orzano: partono lanciate e vicine, non più in tondo.
- **Regata**: ogni barca ha il suo passo (equipaggio, raffiche, un filo di vento in più a chi insegue), quindi la flotta resta vicina e i sorpassi capitano. In poppa si stramba a zig-zag invece di andare dritti alla boa. Chi ha una barca appena davanti rallenta invece di passarle attraverso.
- **Campo leggibile dal drone**: grafica da diretta TV sull'acqua (confini tratteggiati, linea di partenza verde fino a 8 s dopo il via, cerchio della boa di bolina, linea del cancello, arrivo a scacchi); boe più alte; una trentina di barche di spettatori lungo i confini e davanti all'arrivo; barca giuria con le bandiere.
- **Evento nuovo**: strambata.

## Verifiche e limiti

- `npm run check`, `check:motion` (soglia dell'altezza d'impatto del tennis portata a 0,9 m: il dritto ora si colpisce all'altezza del fianco), `check:courts`, `check:cycling-routes`, `check:i18n` (738 chiavi).
- Pendenze della tappa di montagna fino al 24%: dipende dalla forma della collina, come prima.
- Non fatto: pantaloncini da boxe larghi (il modello li ha aderenti), flotta di più di quattro barche, moto e ammiraglie al seguito dei ciclisti.
- Strumenti visivi in `artifacts/` (non versionati): `close-up.mjs`, `boxer-shot.mjs`, `world-shots.mjs`, `route-info.mjs`.
