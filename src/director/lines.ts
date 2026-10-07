/**
 * Battute del regista — solo dati. Personalità: nervoso e ironico.
 * {label} viene sostituito col nome del momento.
 */
import { SPORT } from '../config';
import type { ShotSize } from '../scoring/scoring';

const CALCIO_LINES = {
  kickoff: ['Si parte! Occhi aperti.', 'In onda tra tre, due... vai!', 'Ok, siamo live. Non farmi pentire.'],
  // Indizi: la frase dell'evento + una direzione rispetto a dove stai guardando.
  left: ['A sinistra!', 'Guarda a sinistra!', 'Sinistra, sinistra!'],
  right: ['A destra!', 'Guarda a destra!', 'Destra, svelto!'],
  here: ['Ci sei, resta lì!', 'Non ti muovere!', 'Tienilo in quadro!'],
  up: ['In alto! Nel cielo!', 'Su, su, alza la camera!'],
  oops: ['Anzi no!', 'No, aspetta...', 'Correggo:'],
  goal: ['GOOOL! Dimmi che l\'hai preso!', 'Gol! Primo piano sul marcatore, ORA!', 'Rete! Stringi sull\'esultanza!'],
  orderOk: ['Bravo, così!', 'Perfetto, questa va in onda.', 'Visto? Quando mi ascolti...'],
  orderFail: ['Ti avevo chiesto un\'altra cosa...', 'Mi ascolti o no?', 'Va beh, faccio da solo.'],
  apology: ['Ok, quell\'ordine era sbagliato. Non dirlo a nessuno.', 'Ehm... era meglio seguire l\'azione. Colpa mia.'],
  great: ['Da manuale! Quasi mi commuovo.', 'Questa la mettiamo nel trailer.', 'Oh! Finalmente!'],
  bad: ['Bello il prato. La palla era altrove.', 'Hai inquadrato il nulla con grande stile.', 'Mia nonna col telefono fa meglio.'],
  missed: ['Ti sei perso: {label}!', 'E {label}? Dov\'eri?', 'C\'era {label}. Ma tu no.'],
  end: ['Triplice fischio. Vediamo cosa hai combinato.', 'Fine! Spegni tutto, si va al montaggio.'],
};

/** Basket: cambiano solo le battute legate allo sport. */
const BASKET_LINES: Partial<typeof CALCIO_LINES> = {
  kickoff: ['Palla a due! Occhi aperti.', 'Siamo live. Qui si cambia giocatore ogni secondo, stai sveglio.'],
  goal: ['Canestro! Primo piano!', 'Dentro! Stringi su chi ha segnato!', 'Ciuff! Dammi la faccia del tiratore!'],
  bad: ['Bello il parquet. La palla era altrove.', 'Hai inquadrato il nulla con grande stile.', 'Mia nonna col telefono fa meglio.'],
  end: ['Sirena finale. Vediamo cosa hai combinato.', 'Fine! Spegni tutto, si va al montaggio.'],
};

const SPORT_LINES: Partial<Record<typeof SPORT, Partial<typeof CALCIO_LINES>>> = {
  basket: BASKET_LINES,
  tennis: {
    kickoff: ['Si comincia! Servizio e risposta sempre in quadro.', 'Siamo live sul campo: segui lo scambio!'],
    goal: ['Punto! Dammi la reazione del tennista!'],
    bad: ['La palla passa la rete. La camera deve seguirla!', 'Hai perso la racchetta proprio sul colpo.'],
    end: ['Fine della sessione. Vediamo i tuoi game migliori.'],
  },
  boxe: {
    kickoff: ['Prima ripresa! Tieni entrambi i pugili in quadro.', 'Suona il gong: segui guantoni e volti!'],
    goal: ['Colpo pulito! Stringi sulla reazione!'],
    bad: ['Il colpo era nel ring. La camera era altrove.', 'Non tagliare il pugile quando parte la combinazione!'],
    end: ['Gong finale. Vediamo le tue riprese migliori.'],
  },
  pallavolo: {
    kickoff: ['Si parte dal servizio! Preparati ai tre tocchi.', 'Siamo live: ricezione, alzata, attacco!'],
    goal: ['Punto! Dammi la squadra che esulta!'],
    bad: ['La schiacciata è sopra la rete: alza la camera!', 'Devi passare dal palleggiatore allo schiacciatore!'],
    end: ['Fine della sessione. Vediamo i tuoi scambi migliori.'],
  },
};
export const LINES = { ...CALCIO_LINES, ...SPORT_LINES[SPORT] };

/** Giudizio finale in base alle stelle medie (soglia minima -> frase). */
export const VERDICTS: [number, string][] = [
  [4.5, ({ calcio: 'Ti voglio alla finale di Champions.', basket: 'Ti voglio alle finali NBA.',
    tennis: 'Ti voglio a Wimbledon.', boxe: 'Ti voglio a bordo ring per il titolo.', pallavolo: 'Ti voglio alla finale mondiale.' })[SPORT]],
  [3.8, 'Niente male, ragazzo. Domani ti richiamo.'],
  [3.0, 'Ho visto di peggio. Non molto peggio.'],
  [2.0, 'La prossima volta la camera la tiene il magazziniere.'],
  [0, 'Abbiamo mandato in onda la pubblicità. Per tutta la partita.'],
];

/** Ordini del regista: cosa inquadrare, con che taglia. */
export interface OrderDef {
  id: string;
  label: string;
  lines: string[];
  target: 'coach' | 'crowd' | 'keeper' | 'referee' | 'athlete';
  size: ShotSize;
}

const ALL_ORDERS: OrderDef[] = [
  { id: 'coach', label: 'Allenatore', lines: ['Inquadra l\'allenatore!', 'Dammi il mister, subito!'], target: 'coach', size: 'medium' },
  { id: 'crowd', label: 'Pubblico', lines: ['Stacca sul pubblico!', 'Fammi vedere la curva!'], target: 'crowd', size: 'close' },
  { id: 'keeper', label: 'Portiere', lines: ['Primo piano sul portiere!', 'Stringi sul portiere!'], target: 'keeper', size: 'close' },
  { id: 'referee', label: 'Arbitro', lines: ['Prendimi l\'arbitro!', 'L\'arbitro, voglio l\'arbitro!'], target: 'referee', size: 'medium' },
];

/** Il basket non ha portieri. */
export const ORDERS: OrderDef[] = [
  ...ALL_ORDERS.filter((o) => SPORT === 'calcio' || o.target !== 'keeper').map((o) =>
    SPORT === 'calcio' || SPORT === 'basket' ? o : { ...o, lines: o.target === 'coach'
      ? ['Primo piano sul coach!'] : o.target === 'crowd' ? ['Stacca sul pubblico!'] : ['Inquadra l’arbitro!'] }),
  ...(SPORT === 'boxe' || SPORT === 'tennis' || SPORT === 'pallavolo' ? [{
    id: 'athlete', label: SPORT === 'boxe' ? 'Pugile' : SPORT === 'tennis' ? 'Tennista' : 'Palleggiatore',
    lines: [SPORT === 'boxe' ? 'Primo piano sul pugile, guarda la guardia!' : SPORT === 'tennis' ? 'Stringi sul tennista prima del servizio!' : 'Dammi il palleggiatore!'],
    target: 'athlete' as const, size: 'medium' as const,
  }] : []),
];
