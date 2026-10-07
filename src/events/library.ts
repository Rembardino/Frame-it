/**
 * LIBRERIA DEGLI EVENTI — solo dati.
 * Per aggiungere un evento copia uno di questi oggetti e cambia ruoli, tempi e inquadrature
 * (formato spiegato in types.ts). Tempi in secondi dall'inizio dell'evento, distanze in metri.
 */
import { SPORT } from '../config';
import { BASKET } from './basket';
import type { EventDef, RolePick } from './types';

const OUTFIELD = ['def', 'mid', 'fwd'] as const;
const keeper = (label = 'Portiere'): RolePick => ({ label, pick: 'keeper', side: 'defense' });

const CALCIO: EventDef[] = [
  // ---------------------------------------------------------------- AZIONI PRINCIPALI
  {
    id: 'contropiede',
    label: 'Contropiede',
    outcomeLabels: { goal: 'Contropiede e gol!', save: 'Contropiede: parata!', wide: 'Contropiede: fuori!' },
    category: 'main',
    hint: 'Ripartenza veloce!',
    weight: 3,
    importance: 1,
    ownsBall: true,
    holderGoalDist: [22, 80],
    roles: {
      carrier: { label: 'Portatore', pick: 'holder' },
      striker: { label: 'Attaccante', pick: 'player', side: 'attack', roles: ['fwd', 'mid'], advanced: true },
      keeper: keeper(),
      chaser: { label: 'Difensore', pick: 'player', side: 'defense', roles: [...OUTFIELD], near: 'striker' },
    },
    steps: [
      { t: 0, do: 'move', who: 'carrier', to: { near: 'carrier', off: [7, 0] }, speed: 'run' },
      { t: 0, do: 'move', who: 'striker', to: { goal: [20, 5] }, speed: 'sprint' },
      { t: 0.3, do: 'follow', who: 'chaser', target: 'striker', off: [-1.5, -1], speed: 'run' },
      { t: 1.8, do: 'pass', from: 'carrier', to: 'striker' },
      { t: 2.0, do: 'release', who: ['carrier'] },
      { t: 2.2, do: 'move', who: 'striker', to: { goal: [12, 2] }, speed: 'run' },
      { t: 4.4, do: 'shoot', who: 'striker', outcome: 'goal' },
      { t: 4.4, do: 'release', who: ['chaser'] },
    ],
    cues: [
      { t: 1.1, signal: 'windUp', who: 'carrier', dur: 0.7 },   // rallenta e carica il lancio
      { t: 3.0, signal: 'crowdRise', who: 'striker' },
      { t: 3.5, signal: 'crouch', who: 'keeper', dur: 1.2 },     // il portiere si prepara
      { t: 3.7, signal: 'windUp', who: 'striker', dur: 0.7 },
    ],
    decisive: 4.4,
    duration: 6,
    shots: [
      { from: 0, size: 'wide', subjects: ['carrier', 'ball'] },
      { from: 2.2, size: 'medium', subjects: ['striker', 'ball', 'goal'] },
    ],
  },
  {
    id: 'tiro-parato',
    label: 'Tiro',
    outcomeLabels: { save: 'Grande parata!', goal: 'Gol!', wide: 'Tiro fuori' },
    category: 'main',
    hint: 'Stanno per tirare!',
    weight: 3,
    importance: 0.8,
    ownsBall: true,
    holderGoalDist: [12, 45],
    roles: {
      passer: { label: 'Rifinitore', pick: 'holder' },
      shooter: { label: 'Tiratore', pick: 'player', side: 'attack', roles: ['fwd', 'mid'], advanced: true },
      keeper: keeper(),
    },
    steps: [
      { t: 0, do: 'move', who: 'shooter', to: { goal: [17, -4] }, speed: 'run' },
      { t: 0, do: 'move', who: 'passer', to: { near: 'passer', off: [4, 0] }, speed: 'jog' },
      { t: 1.6, do: 'pass', from: 'passer', to: 'shooter' },
      { t: 1.8, do: 'release', who: ['passer'] },
      { t: 1.9, do: 'move', who: 'shooter', to: { goal: [15, -2] }, speed: 'jog' },
      { t: 3.6, do: 'shoot', who: 'shooter', outcome: 'save' },
    ],
    cues: [
      { t: 1.0, signal: 'windUp', who: 'passer', dur: 0.6 },
      { t: 2.6, signal: 'crowdRise', who: 'shooter' },
      { t: 2.9, signal: 'windUp', who: 'shooter', dur: 0.7 },
      { t: 3.0, signal: 'crouch', who: 'keeper', dur: 1.0 },
    ],
    decisive: 3.6,
    duration: 5.4,
    shots: [
      { from: 0, size: 'medium', subjects: ['shooter', 'ball', 'goal'] },
      { from: 3.6, size: 'medium', subjects: ['keeper', 'ball', 'goal', ['shooter', 0.5]] },
    ],
  },
  {
    id: 'tiro-distanza',
    label: 'Tiro dalla distanza',
    outcomeLabels: { goal: 'Gol da fuori!', save: 'Parata sul tiro da fuori', wide: 'Tiro da fuori: alto!' },
    category: 'main',
    hint: 'Quello calcia da lontano...',
    weight: 2,
    importance: 0.7,
    ownsBall: true,
    holderGoalDist: [20, 36],
    roles: {
      shooter: { label: 'Tiratore', pick: 'holder' },
      keeper: keeper(),
    },
    steps: [
      { t: 0, do: 'move', who: 'shooter', to: { goal: [23, 3] }, speed: 'run' },
      { t: 2.6, do: 'shoot', who: 'shooter' }, // esito deciso dal Director
    ],
    cues: [
      { t: 1.8, signal: 'windUp', who: 'shooter', dur: 0.8 },
      { t: 1.8, signal: 'crowdRise', who: 'shooter' },
      { t: 2.0, signal: 'crouch', who: 'keeper', dur: 1.0 },
    ],
    decisive: 2.6,
    duration: 4.6,
    shots: [
      { from: 0, size: 'medium', subjects: ['shooter', 'ball', 'goal'] },
      { from: 2.6, size: 'medium', subjects: ['ball', 'goal', 'keeper'] },
    ],
  },
  {
    id: 'fallo',
    label: 'Fallo e proteste',
    category: 'main',
    hint: 'Occhio, quello entra duro!',
    weight: 1.2,
    importance: 0.6,
    ownsBall: true,
    exclusive: true,
    holderGoalDist: [10, 60],
    roles: {
      victim: { label: 'Giocatore', pick: 'holder' },
      fouler: { label: 'Difensore', pick: 'player', side: 'defense', roles: [...OUTFIELD], near: 'victim' },
      referee: { label: 'Arbitro', pick: 'referee' },
      mate: { label: 'Compagno', pick: 'player', side: 'attack', roles: [...OUTFIELD], near: 'victim' },
    },
    steps: [
      { t: 0, do: 'move', who: 'victim', to: { near: 'victim', off: [8, 1] }, speed: 'run' },
      { t: 0, do: 'follow', who: 'fouler', target: 'victim', off: [-0.6, -0.4], speed: 'sprint' },
      { t: 1.9, do: 'pose', who: 'fouler', pose: 'tackle', dur: 0.9 },
      { t: 2.0, do: 'pose', who: 'victim', pose: 'fall', dur: 2.8 },
      { t: 2.3, do: 'whistle' },
      { t: 2.4, do: 'move', who: 'referee', to: { near: 'victim', off: [-1.5, -2.5] }, speed: 'run' },
      { t: 2.9, do: 'move', who: 'mate', to: { near: 'fouler', off: [1.2, 0.8] }, speed: 'run' },
      { t: 3.0, do: 'pose', who: 'fouler', pose: 'protest', dur: 3, face: 'referee' },
      { t: 3.8, do: 'pose', who: 'mate', pose: 'argue', dur: 2.6, face: 'fouler' },
      { t: 4.6, do: 'pose', who: 'referee', pose: 'card', dur: 1.8 },
      { t: 7.0, do: 'restart', side: 'attack' },
      { t: 7.0, do: 'release' },
    ],
    cues: [
      { t: 1.2, signal: 'crowdRise', who: 'victim' },
      { t: 1.3, signal: 'crouch', who: 'fouler', dur: 0.5 },   // si abbassa per entrare in scivolata
    ],
    decisive: 2.0,
    duration: 7.5,
    shots: [
      { from: 0, size: 'medium', subjects: ['victim', 'fouler', 'ball'] },
      { from: 2.6, size: 'medium', subjects: ['fouler', 'referee', ['mate', 0.7]] },
    ],
  },
  {
    id: 'esultanza',
    label: 'Esultanza',
    category: 'main',
    weight: 0,
    importance: 0.7,
    trigger: 'goal',
    roles: { scorer: { label: 'Marcatore', pick: 'scorer' } },
    steps: [], // l'esultanza la recita la partita stessa (corsa alla bandierina, abbracci)
    cues: [{ t: 0, signal: 'crowdRise', who: 'scorer' }],
    decisive: 2.0,
    duration: 3.6,
    shots: [{ from: 0, size: 'close', subjects: ['scorer'] }],
  },

  // ---------------------------------------------------------------- EVENTI RARI
  {
    id: 'stella',
    label: 'Stella cadente!',
    category: 'rare',
    hint: 'Ma la gente guarda in alto...',
    weight: 1,
    importance: 1,
    once: true,
    roles: {},
    steps: [{ t: 2.0, do: 'effect', effect: 'shootingStar' }],
    cues: [{ t: 0, signal: 'crowdLookUp', dur: 3.6 }], // il pubblico guarda il cielo 2 secondi prima
    decisive: 2.65,
    duration: 4.4,
    shots: [{ from: 0, size: 'close', subjects: ['star'] }],
  },

  // ---------------------------------------------------------------- DISTRAZIONI
  {
    id: 'caduta',
    label: 'Giocatore a terra',
    category: 'distraction',
    hint: 'Qualcuno non sta in piedi...',
    weight: 2,
    importance: 0.45,
    roles: {
      faller: { label: 'Giocatore', pick: 'player', side: 'attack', roles: [...OUTFIELD], farFromBall: true },
      helper: { label: 'Compagno', pick: 'player', side: 'attack', roles: [...OUTFIELD], near: 'faller' },
    },
    steps: [
      { t: 0, do: 'move', who: 'faller', to: { near: 'faller', off: [9, 3] }, speed: 'sprint' },
      { t: 1.8, do: 'pose', who: 'faller', pose: 'fall', dur: 3 },
      { t: 3.0, do: 'move', who: 'helper', to: { near: 'faller', off: [1.4, 0.6] }, speed: 'jog' },
      { t: 4.4, do: 'pose', who: 'helper', pose: 'protest', dur: 1.2, face: 'faller' }, // gli porge le mani
      { t: 6.0, do: 'release' },
    ],
    cues: [{ t: 0.9, signal: 'stumble', who: 'faller', dur: 0.9 }], // inciampa prima di cadere
    decisive: 1.8,
    duration: 6,
    shots: [
      { from: 0, size: 'medium', subjects: ['faller'] },
      { from: 3.0, size: 'medium', subjects: ['faller', ['helper', 0.6]] },
    ],
  },
  {
    id: 'discussione',
    label: 'Discussione',
    category: 'distraction',
    hint: 'Si stanno beccando!',
    weight: 2,
    importance: 0.5,
    roles: {
      a: { label: 'Giocatore', pick: 'player', side: 'attack', roles: [...OUTFIELD], farFromBall: true },
      b: { label: 'Avversario', pick: 'player', side: 'defense', roles: [...OUTFIELD], near: 'a' },
      peacemaker: { label: 'Compagno', pick: 'player', side: 'attack', roles: [...OUTFIELD], near: 'a' },
    },
    steps: [
      { t: 0, do: 'move', who: 'a', to: { near: 'a' }, speed: 'walk' },
      { t: 0, do: 'move', who: 'b', to: { near: 'a', off: [1.3, 0] }, speed: 'jog' },
      { t: 1.4, do: 'pose', who: 'b', pose: 'argue', dur: 1.6, face: 'a' },
      { t: 3.0, do: 'pose', who: 'b', pose: 'shove', dur: 0.6, face: 'a' },
      { t: 3.2, do: 'move', who: 'a', to: { near: 'a', off: [-1.8, 0] }, speed: 'run' }, // spinto indietro
      { t: 3.3, do: 'pose', who: 'a', pose: 'stumble', dur: 0.8 },
      { t: 3.6, do: 'move', who: 'peacemaker', to: { near: 'a', off: [0.7, 0.8] }, speed: 'run' },
      { t: 4.4, do: 'pose', who: 'peacemaker', pose: 'protest', dur: 1.6, face: 'b' },
      { t: 4.6, do: 'pose', who: 'a', pose: 'argue', dur: 1.5, face: 'b' },
      { t: 6.4, do: 'release' },
    ],
    cues: [
      { t: 0.4, signal: 'argue', who: 'a', dur: 2.6 },   // gesticola: sta per scaldarsi
      { t: 2.0, signal: 'crowdRise', who: 'a' },
    ],
    decisive: 3.0,
    duration: 6.4,
    shots: [
      { from: 0, size: 'medium', subjects: ['a', 'b'] },
      { from: 3.6, size: 'medium', subjects: ['a', 'b', ['peacemaker', 0.6]] },
    ],
  },
  {
    id: 'invasione',
    label: 'Invasione di campo',
    category: 'distraction',
    hint: "C'è uno che scavalca!",
    weight: 1,
    importance: 0.8,
    exclusive: true,
    once: true,
    fixedSide: true, // il tifoso arriva sempre dalla tribuna di fronte
    roles: {
      fan: { label: 'Tifoso', pick: 'extra', kind: 'fan', at: { pitch: [6, -24] } },
      s1: { label: 'Steward', pick: 'extra', kind: 'steward', at: { pitch: [-6, -23.5] } },
      s2: { label: 'Steward', pick: 'extra', kind: 'steward', at: { pitch: [16, -23.5] } },
      referee: { label: 'Arbitro', pick: 'referee' },
    },
    steps: [
      { t: 0, do: 'move', who: 'fan', to: { pitch: [4, -12] }, speed: 'sprint' },
      { t: 0.4, do: 'whistle' },
      { t: 0.6, do: 'pose', who: 'referee', pose: 'protest', dur: 1.5, face: 'fan' },
      { t: 1.0, do: 'follow', who: 's1', target: 'fan', off: [-1.2, -0.5], speed: 'run' },
      { t: 1.2, do: 'follow', who: 's2', target: 'fan', off: [1.2, -0.5], speed: 'run' },
      { t: 1.6, do: 'pose', who: 'fan', pose: 'wave', dur: 1.6 },
      { t: 2.0, do: 'move', who: 'fan', to: { pitch: [-3, -3] }, speed: 'sprint' },
      { t: 3.6, do: 'move', who: 'fan', to: { pitch: [5, 5] }, speed: 'sprint' },
      { t: 5.3, do: 'follow', who: 's1', target: 'fan', off: [-0.4, 0], speed: 'sprint' },
      { t: 5.6, do: 'pose', who: 's1', pose: 'tackle', dur: 1.0 },
      { t: 5.8, do: 'pose', who: 'fan', pose: 'fall', dur: 2.2 },
      { t: 8.0, do: 'move', who: 'fan', to: { pitch: [2, -25] }, speed: 'jog' },
      { t: 8.0, do: 'follow', who: 's1', target: 'fan', off: [-0.8, 0.5], speed: 'jog' },
      { t: 8.0, do: 'follow', who: 's2', target: 'fan', off: [0.8, 0.5], speed: 'jog' },
      { t: 9.0, do: 'restart', side: 'attack' },
    ],
    cues: [{ t: 0, signal: 'crowdRise', who: 'fan' }], // la tribuna da cui scavalca si alza per prima
    decisive: 5.8,
    duration: 13,
    shots: [
      { from: 0, size: 'wide', subjects: ['fan'] },
      { from: 4.6, size: 'medium', subjects: ['fan', 's1'] },
      { from: 8.0, size: 'wide', subjects: ['fan', 's1', 's2'] },
    ],
  },
];

/** La libreria dello sport in gioco. */
export const LIBRARY: EventDef[] = SPORT === 'basket' ? BASKET : CALCIO;
