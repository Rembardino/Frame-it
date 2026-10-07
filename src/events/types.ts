/**
 * Formato degli eventi. Un evento è un COPIONE DI DATI: chi recita (ruoli), cosa fa e quando (steps),
 * i segnali premonitori (cues), l'istante decisivo e l'inquadratura ideale.
 * Aggiungere un evento = aggiungere un oggetto in library.ts, senza toccare il codice.
 */
import type { EffectName, Pose, Role, ShotOutcome } from '../sim/match';
import type { ShotSize } from '../scoring/scoring';
import type { SportAction } from '../sim/sports/types';

/** order = ordine del regista (non sta in libreria: lo crea la Director Voice). */
export type Category = 'main' | 'distraction' | 'rare' | 'order';
export type Speed = 'walk' | 'jog' | 'run' | 'sprint';
/** attack = squadra che attacca nell'evento (chi ha palla, o scelta a caso), defense = l'altra. */
export type Side = 'attack' | 'defense';

/** Come scegliere chi recita un ruolo. I ruoli si risolvono nell'ordine in cui sono scritti. */
export type RolePick = { label: string } & (
  | { pick: 'holder' }                       // chi ha la palla
  | { pick: 'player'; side: Side; roles?: Role[]; near?: string; farFromBall?: boolean; advanced?: boolean }
  | { pick: 'keeper'; side: Side }
  | { pick: 'referee' }
  | { pick: 'coach'; side: Side }
  | { pick: 'extra'; kind: 'fan' | 'steward'; at: Point }
  | { pick: 'scorer' }                       // solo per eventi scatenati da un gol
);

/**
 * Punti sul campo, sempre "visti dalla squadra che attacca" (si ribaltano da soli).
 * Laterale positivo = verso la camera; ogni evento viene ribaltato a caso (salvo fixedSide).
 */
export type Point =
  | { goal: [number, number] }                 // [metri dalla porta attaccata verso il centro, laterale]
  | { near: string; off?: [number, number] }   // [avanti verso la porta attaccata, laterale] da un attore
  | { pitch: [number, number] };               // [x verso la porta attaccata (0 = centrocampo), laterale]

/** Azioni a tempo (t = secondi dall'inizio). Passaggio e tiro aspettano che l'attore abbia la palla. */
export type Step = { t: number } & (
  | { do: 'move'; who: string; to: Point; speed?: Speed }
  | { do: 'follow'; who: string; target: string; off?: [number, number]; speed?: Speed }
  | { do: 'pass'; from: string; to: string }
  | { do: 'shoot'; who: string; outcome?: ShotOutcome }    // senza esito decide il Director (punteggio coerente)
  | { do: 'pose'; who: string; pose: Pose; dur: number; face?: string }
  | { do: 'whistle' }                                      // gioco fermo
  | { do: 'restart'; side: Side }                          // riprende il gioco
  | { do: 'release'; who?: string[] }                      // restituisce gli attori al gioco automatico (tutti se omesso)
  | { do: 'effect'; effect: EffectName }                   // effetto speciale (stella cadente...), preparato a inizio evento
  | { do: 'sport'; action: SportAction; who: string; target?: string }
);

/**
 * Segnale premonitore leggibile: una posa breve su un attore, o il pubblico vicino che si alza.
 * windUp = rallenta e carica la gamba: fallo finire nell'istante del passaggio/tiro (t + dur).
 */
export interface Cue {
  t: number;
  /** crowdLookUp = tutto il pubblico si ferma e guarda/indica il cielo (non serve who). */
  signal: 'windUp' | 'crouch' | 'stumble' | 'argue' | 'crowdRise' | 'crowdLookUp';
  who?: string;
  dur?: number;
}

/** Inquadratura ideale da un certo istante dell'evento in poi. */
export interface ShotPhase {
  from: number;
  size: ShotSize;
  /** Ruoli, 'ball', 'goal' (la porta attaccata) o 'star' (la stella cadente). [nome, peso] per cambiarne il peso. */
  subjects: (string | [string, number])[];
  /** Soggetto principale (taglia, composizione). Default: il primo. */
  lead?: string;
}

export interface EventDef {
  id: string;
  label: string;
  /** Etichetta in base all'esito del tiro. */
  outcomeLabels?: Partial<Record<ShotOutcome, string>>;
  category: Category;
  /** Cosa dice il regista in cuffia quando l'evento parte (se dà l'indizio). */
  hint?: string;
  /** Probabilità relativa di essere scelto. 0 = solo su trigger. */
  weight: number;
  /** 0..1: quanto conta (intensità degli indicatori ai bordi, riepilogo). */
  importance: number;
  /** Parte da solo quando succede qualcosa (es. dopo un gol). */
  trigger?: 'goal';
  /** Distanza (m) dalla porta attaccata entro cui deve trovarsi chi ha palla. */
  holderGoalDist?: [number, number];
  /** La palla è dell'evento (azioni d'attacco): niente decisioni automatiche. */
  ownsBall?: boolean;
  /** Ferma tutto: nessun altro evento in parallelo. */
  exclusive?: boolean;
  /** Al massimo una volta per partita. */
  once?: boolean;
  /** Non ribaltare il lato. */
  fixedSide?: boolean;
  roles: Record<string, RolePick>;
  steps: Step[];
  cues: Cue[];
  /** Istante decisivo (s dall'inizio): pesa il triplo nel voto. */
  decisive: number;
  duration: number;
  shots: ShotPhase[];
}
