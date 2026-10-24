/**
 * EVENTI DEL GOLF — solo dati, come le altre librerie.
 * Ogni colpo è un'azione: il marshal alza il cartello del silenzio, il golfista prova il gesto, poi colpisce.
 * L'evento sceglie l'esito (fairway, bunker, alberi, acqua, green, buca); `when` dice da dove si può giocare.
 * Istante decisivo: l'atterraggio della palla, o il momento in cui entra in buca (e la fine di ogni putt).
 * Tempi dei colpi in CONFIG.golf.
 */
import { CONFIG } from '../config';
import type { Match } from '../sim/match';
import type { GolfKind, GolfNext, GolfSimulation } from '../sim/sports/golf';
import type { SportAction } from '../sim/sports/types';
import type { EventDef, ShotPhase } from './types';
import type { Species } from '../sim/fauna';

/** Animali come distrazione: compaiono all'inizio, l'istante decisivo è il momento più bello (salto, decollo, attraversamento). */
export function animalEvent(id: string, label: string, hint: string, species: Species, route: string, n: number, decisive: number, duration: number,
  when: (m: Match) => boolean): EventDef {
  return {
    id, label, hint, category: 'distraction', weight: 1, importance: 0.6, once: true, when,
    roles: {}, steps: [{ t: 0, do: 'animal', species, route, n }], cues: [], decisive, duration,
    shots: [{ from: 0, size: 'medium', subjects: ['animal'] }],
  };
}

const G = CONFIG.golf;
const next = (m: Match): GolfNext => (m.sportSimulation as GolfSimulation).next;
const isKind = (kind: GolfKind, more: (n: GolfNext) => boolean = () => true) => (m: Match) => next(m).kind === kind && more(next(m));

const HINTS: Record<GolfKind, string> = {
  drive: 'Drive dal tee: segui la palla fino a terra!',
  tee3: 'Par 3: dritti al green, vola verso la bandiera!',
  wood: 'Colpo lungo dal fairway: segui la palla!',
  approach: 'Colpo al green: vola verso la bandiera!',
  chip: 'Colpo corto: stringi su palla e bandiera!',
  bunker: 'Esce dal bunker: occhio alla sabbia!',
  putt: 'Putt: palla e buca nella stessa inquadratura!',
};

/** end: dove finisce la palla. 'land' = fuori dal green, 'green' = sul green (si inquadra anche la bandiera), 'cup' = in buca. */
function shot(id: string, label: string, kind: GolfKind, action: SportAction, end: 'land' | 'green' | 'cup', weight: number,
  when: (m: Match) => boolean): EventDef {
  const putt = kind === 'putt';
  const swing = putt ? G.puttAt : G.swingAt;
  const hit = swing + (putt ? G.puttImpact : G.impact);
  const land = hit + G.carry[kind];
  // In acqua la palla sparisce subito (lo spruzzo dura poco).
  const after = putt ? G.putt[action] : action.endsWith('Water') ? 0.8 : G.roll[kind];
  const decisive = putt || end === 'cup' ? land + after : land;
  const pin = end === 'land' ? [] : ['pin'];
  const shots: ShotPhase[] = putt
    ? [{ from: 0, size: 'medium', subjects: ['golfer', 'roll', 'pin'] },
      { from: hit + 0.1, size: 'medium', subjects: ['roll', 'pin'] },
      { from: decisive - 0.8, size: 'close', subjects: ['roll', 'pin'] }]
    : [{ from: 0, size: 'medium', subjects: ['golfer', 'ball'] },
      // Dopo l'impatto conta solo la palla: va seguita in volo, poi dove atterra e rotola.
      { from: hit + 0.1, size: 'medium', subjects: ['flight'] },
      { from: Math.max(hit + 0.1, land - 1.2), size: 'medium', subjects: ['flight', ...pin] },
      { from: land + 0.6, size: 'medium', subjects: ['roll', ...pin] }];
  return {
    id, label, hint: HINTS[kind], category: 'main', weight, importance: 1, when,
    roles: { golfer: { label: 'Golfista', pick: 'holder' }, marshal: { label: 'Marshal', pick: 'referee' } },
    steps: [
      { t: 0.15, do: 'pose', who: 'marshal', pose: 'card', dur: swing + 1.4 },
      { t: 0.45, do: 'pose', who: 'golfer', pose: 'practice', dur: putt ? 0.9 : 1.1 },
      { t: swing, do: 'sport', action, who: 'golfer' },
    ],
    cues: [], decisive, duration: (putt || end === 'cup' ? decisive : land + after) + 1.6, shots,
  };
}

export const GOLF_EVENTS: EventDef[] = [
  // ---------------------------------------------------------------- dal tee (par 4 e 5)
  shot('g-drive', 'Drive in fairway', 'drive', 'drive', 'land', 4, isKind('drive')),
  shot('g-drive-bunker', 'Drive nel bunker', 'drive', 'driveBunker', 'land', 1.2, isKind('drive', (n) => n.fairwayBunker)),
  shot('g-drive-tree', 'Palla tra gli alberi!', 'drive', 'driveTree', 'land', 0.8, isKind('drive', (n) => n.tree)),
  shot('g-drive-water', 'Drive in acqua!', 'drive', 'driveWater', 'land', 1, isKind('drive', (n) => n.water)),
  // ---------------------------------------------------------------- dal tee dei par 3
  shot('g-tee3', 'Colpo sul green', 'tee3', 'approach', 'green', 3, isKind('tee3')),
  shot('g-tee3-close', 'Dritto sulla bandiera!', 'tee3', 'approachClose', 'green', 0.8, isKind('tee3')),
  shot('g-tee3-short', 'Corto, prima del green', 'tee3', 'approachShort', 'green', 1, isKind('tee3')),
  shot('g-tee3-bunker', 'Nel bunker del green', 'tee3', 'approachBunker', 'green', 1, isKind('tee3', (n) => n.greenBunker)),
  shot('g-tee3-water', 'In acqua!', 'tee3', 'approachWater', 'land', 1.2, isKind('tee3', (n) => n.water)),
  // ---------------------------------------------------------------- secondo colpo dei par 5
  shot('g-layup', 'Lay-up in fairway', 'wood', 'layup', 'land', 2, isKind('wood')),
  shot('g-wood-green', 'Legno sul green!', 'wood', 'approach', 'green', 1, isKind('wood')),
  shot('g-layup-water', 'Lay-up in acqua!', 'wood', 'layupWater', 'land', 0.8, isKind('wood', (n) => n.water)),
  // ---------------------------------------------------------------- al green
  shot('g-approach', 'Approccio sul green', 'approach', 'approach', 'green', 3, isKind('approach')),
  shot('g-approach-close', 'Approccio a un metro!', 'approach', 'approachClose', 'green', 0.8, isKind('approach')),
  shot('g-approach-short', 'Approccio corto', 'approach', 'approachShort', 'green', 1, isKind('approach')),
  shot('g-approach-bunker', 'Approccio nel bunker', 'approach', 'approachBunker', 'green', 1, isKind('approach', (n) => n.greenBunker)),
  shot('g-approach-water', 'Approccio in acqua!', 'approach', 'approachWater', 'land', 0.7, isKind('approach', (n) => n.water)),
  // ---------------------------------------------------------------- vicino al green
  shot('g-chip', 'Chip vicino alla buca', 'chip', 'chip', 'green', 3, isKind('chip')),
  shot('g-chip-in', 'Chip in buca!', 'chip', 'chipIn', 'cup', 0.6, isKind('chip')),
  shot('g-bunker', 'Uscita dal bunker', 'bunker', 'bunkerShot', 'green', 3, isKind('bunker')),
  shot('g-bunker-in', 'Dal bunker in buca!', 'bunker', 'bunkerIn', 'cup', 0.5, isKind('bunker')),
  // ---------------------------------------------------------------- putt (sotto 1,2 m entra sempre)
  shot('g-putt-short', 'Putt corto imbucato', 'putt', 'puttShort', 'cup', 5, isKind('putt', (n) => n.dist < 2.5)),
  shot('g-putt', 'Putt imbucato!', 'putt', 'putt', 'cup', 1.4, isKind('putt', (n) => n.dist >= 2.5 && n.dist < 8)),
  shot('g-putt-long', 'Putt lunghissimo… dentro!', 'putt', 'puttLong', 'cup', 0.8, isKind('putt', (n) => n.dist >= 8)),
  shot('g-putt-lag', 'Putt a un passo dalla buca', 'putt', 'puttLag', 'green', 2.6, isKind('putt', (n) => n.dist >= 2.5)),
  shot('g-putt-lip', 'Sul bordo… fuori!', 'putt', 'puttLip', 'green', 1, isKind('putt', (n) => n.dist >= 1.2)),
  // ---------------------------------------------------------------- raro: buca in uno (?rare la forza al primo par 3)
  { ...shot('g-ace', 'Buca in uno!', 'tee3', 'ace', 'cup', 1, isKind('tee3')),
    category: 'rare', once: true, exclusive: true, hint: 'Par 3… il pubblico trattiene il fiato!' },
  // ---------------------------------------------------------------- dopo un par o un birdie
  {
    id: 'g-esultanza', label: 'Esultanza sul green', category: 'main', weight: 0, importance: 0.6, trigger: 'goal',
    roles: { scorer: { label: 'Golfista', pick: 'scorer' } },
    steps: [{ t: 0.1, do: 'pose', who: 'scorer', pose: 'celebrate', dur: 2.6 }],
    cues: [], decisive: 1.2, duration: 3.2,
    shots: [{ from: 0, size: 'close', subjects: ['scorer'] }],
  },
  // ---------------------------------------------------------------- distrazioni: lontano, vicino al green
  {
    id: 'g-invasore', label: 'Invasore sul green!', hint: 'Qualcuno corre verso il green!',
    category: 'distraction', weight: 1, importance: 0.8, once: true, when: (m) => next(m).dist > 90,
    roles: {
      fan: { label: 'Tifoso', pick: 'extra', kind: 'fan', at: { spot: 'stand', off: [3, 4] } },
      s1: { label: 'Steward', pick: 'extra', kind: 'steward', at: { spot: 'stand', off: [2, -8] } },
      s2: { label: 'Steward', pick: 'extra', kind: 'steward', at: { spot: 'stand', off: [2, 12] } },
    },
    steps: [
      { t: 0, do: 'move', who: 'fan', to: { spot: 'pin', off: [3, 2] }, speed: 'sprint' },
      { t: 0.8, do: 'follow', who: 's1', target: 'fan', off: [-1.5, 0], speed: 'run' },
      { t: 1.2, do: 'follow', who: 's2', target: 'fan', off: [1.5, 0.5], speed: 'run' },
      { t: 3.0, do: 'pose', who: 'fan', pose: 'wave', dur: 1.4 },
      { t: 4.4, do: 'move', who: 'fan', to: { spot: 'pin', off: [-8, -5] }, speed: 'sprint' },
      { t: 5.4, do: 'follow', who: 's1', target: 'fan', off: [-0.4, 0], speed: 'sprint' },
      { t: 5.9, do: 'pose', who: 's1', pose: 'tackle', dur: 1 },
      { t: 6.1, do: 'pose', who: 'fan', pose: 'fall', dur: 2.2 },
      { t: 8.4, do: 'move', who: 'fan', to: { spot: 'stand', off: [2, 0] }, speed: 'jog' },
      { t: 8.4, do: 'follow', who: 's1', target: 'fan', off: [-0.8, 0.5], speed: 'jog' },
      { t: 8.4, do: 'follow', who: 's2', target: 'fan', off: [0.8, 0.5], speed: 'jog' },
    ],
    cues: [{ t: 0, signal: 'crowdRise', who: 'fan' }],
    decisive: 6.1, duration: 11,
    shots: [
      { from: 0, size: 'wide', subjects: ['fan'] },
      { from: 4.6, size: 'medium', subjects: ['fan', 's1'] },
      { from: 8.4, size: 'wide', subjects: ['fan', 's1', 's2'] },
    ],
  },
  // Animali nel bosco e uccelli in volo, lungo la buca che si sta giocando.
  animalEvent('g-cervi', 'Cervi al limitare del bosco', 'Qualcosa si muove tra gli alberi!', 'deer', 'peek', 3, 4.5, 8.5, () => true),
  animalEvent('g-volpe', 'Una volpe attraversa il fairway', 'Guarda il fairway, laggiù!', 'fox', 'cross', 1, 3, 6, () => true),
  animalEvent('g-lepri', 'Lepri sul fairway', 'C’è qualcosa che salta nell’erba!', 'rabbit', 'cross', 2, 3, 6, () => true),
  animalEvent('g-anatre', 'Anatre in volo dallo stagno', 'Movimento sull’acqua!', 'duck', 'takeoff', 5, 3.5, 9, () => true),
  animalEvent('g-stormo', 'Stormo in volo!', 'Guarda il cielo sopra la buca!', 'birds', 'sky', 22, 5, 10, () => true),
  {
    // Il caddie che aspetta vicino al green (quello dell'altro golfista) scivola nel bunker.
    id: 'g-caddie', label: 'Il caddie cade nel bunker!', hint: 'Guarda il caddie vicino al green!',
    category: 'distraction', weight: 1, importance: 0.6, once: true, when: (m) => next(m).dist > 90,
    roles: {
      golfer: { label: 'Golfista', pick: 'holder' },
      caddie: { label: 'Caddie', pick: 'coach', side: 'defense' },
    },
    steps: [
      { t: 0, do: 'move', who: 'caddie', to: { spot: 'bunker', off: [0, 0] }, speed: 'jog' },
      { t: 2.4, do: 'pose', who: 'caddie', pose: 'stumble', dur: 0.5 },
      { t: 2.9, do: 'pose', who: 'caddie', pose: 'fall', dur: 2.4 },
      { t: 5.4, do: 'pose', who: 'caddie', pose: 'dejected', dur: 1.6 },
    ],
    cues: [], decisive: 3.1, duration: 7.5,
    shots: [{ from: 0, size: 'medium', subjects: ['caddie'] }],
  },
];
