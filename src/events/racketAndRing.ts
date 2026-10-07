import type { EventDef, RolePick, ShotPhase, Step } from './types';
import type { SportAction } from '../sim/sports/types';

const rivals: Record<string, RolePick> = {
  a: { label: 'Attaccante', pick: 'player', side: 'attack' },
  b: { label: 'Avversario', pick: 'player', side: 'defense' },
};

function tennis(id: string, label: string, hint: string, actions: [number, string, SportAction][], decisive: number): EventDef {
  const shots: ShotPhase[] = actions.map(([t, who]) => ({ from: Math.max(0, t - 0.55), size: 'medium', subjects: [who, 'ball', [who === 'a' ? 'b' : 'a', 0.5]] }));
  return {
    id, label, hint, category: 'main', weight: 1, importance: 1, ownsBall: true,
    roles: { a: { ...rivals.a, label: 'Tennista' }, b: { ...rivals.b, label: 'Avversario' } },
    steps: actions.map(([t, who, action]) => ({ t, do: 'sport', action, who, target: who === 'a' ? 'b' : 'a' })),
    cues: [{ t: 0, signal: 'crowdRise', who: 'a' }], decisive, duration: decisive + 2,
    shots: [{ from: 0, size: 'wide', subjects: ['a', 'b', 'ball'] }, ...shots],
  };
}

export const TENNIS: EventDef[] = [
  tennis('t-ace', 'Ace!', 'Sta per servire: tieni racchetta e palla!', [[1.6, 'a', 'ace']], 1.6),
  tennis('t-incrociato', 'Dritto incrociato vincente', 'Scambio da fondo: segui entrambi!',
    [[0.8, 'a', 'forehand'], [2.3, 'b', 'backhand'], [3.8, 'a', 'winner']], 3.8),
  tennis('t-rovescio', 'Rovescio lungolinea', 'Si prepara al rovescio!',
    [[0.8, 'b', 'forehand'], [2.3, 'a', 'backhand'], [3.8, 'b', 'forehand'], [5.3, 'a', 'backhandWinner']], 5.3),
  tennis('t-volée', 'Volée a rete', 'Scende a rete, anticipa lo spostamento!',
    [[0.8, 'a', 'forehand'], [2.3, 'b', 'backhand'], [3.8, 'a', 'volleyWinner']], 3.8),
  tennis('t-smash', 'Smash!', 'Palla alta! Non tagliare la racchetta!',
    [[0.8, 'a', 'serve'], [2.3, 'b', 'lob'], [3.8, 'a', 'smash']], 3.8),
];
TENNIS[3].steps.splice(2, 0, { t: 2.5, do: 'move', who: 'a', to: { pitch: [-2.2, 1.3] }, speed: 'sprint' });

function boxing(id: string, label: string, hint: string, actions: [number, string, SportAction][]): EventDef {
  const decisive = actions[actions.length - 1][0];
  return {
    id, label, hint, category: 'main', weight: 1, importance: 1, ownsBall: true,
    roles: { a: { ...rivals.a, label: 'Pugile' }, b: { ...rivals.b, label: 'Avversario' } },
    steps: actions.map(([t, who, action]) => ({ t, do: 'sport', action, who, target: who === 'a' ? 'b' : 'a' })),
    cues: [{ t: 0.2, signal: 'crowdRise', who: 'a' }], decisive, duration: decisive + 3,
    shots: [{ from: 0, size: 'medium', subjects: ['a', 'b'] }],
  };
}

export const BOXING: EventDef[] = [
  boxing('x-jab', 'Jab e diretto', 'Parte la combinazione! Tieni entrambi nel ring!', [[1.5, 'a', 'jab'], [2.4, 'a', 'jab']]),
  boxing('x-hook', 'Gancio al volto', 'Occhio al gancio!', [[1.5, 'a', 'hook']]),
  boxing('x-counter', 'Schivata e contrattacco', 'Guarda la risposta dopo il colpo!', [[1.3, 'b', 'jab'], [2.3, 'a', 'counter']]),
  boxing('x-uppercut', 'Montante!', 'Si avvicina: arriva il montante!', [[1.5, 'a', 'uppercut']]),
  boxing('x-knockdown', 'Knockdown! Si rialza', 'Non perdere chi cade e il conteggio!', [[1.2, 'a', 'jab'], [2.3, 'a', 'knockdown']]),
];
BOXING[2].steps.splice(1, 0, { t: 1.9, do: 'pose', who: 'a', pose: 'crouch', dur: 0.4, face: 'b' });
BOXING[4].roles.ref = { label: 'Arbitro', pick: 'referee' };
BOXING[4].steps.push({ t: 2.4, do: 'pose', who: 'ref', pose: 'card', dur: 2.5 });
BOXING[4].shots.push({ from: 2.3, size: 'wide', subjects: ['b', 'a', 'ref'] });

function volleyball(id: string, label: string, hint: string, last: SportAction, fast = false): EventDef {
  const roles: Record<string, RolePick> = {
    receiver: { label: 'Ricevitore', pick: 'player', side: 'attack', roles: ['def'] },
    setter: { label: 'Palleggiatore', pick: 'player', side: 'attack', roles: ['mid'] },
    hitter: { label: 'Schiacciatore', pick: 'player', side: 'attack', roles: ['fwd'] },
    defender: { label: 'Avversario', pick: 'player', side: 'defense', roles: ['fwd'] },
  };
  const steps: Step[] = fast
    ? [{ t: 0, do: 'move', who: 'receiver', to: { pitch: [-8.2, 2.5] }, speed: 'run' },
      { t: 2, do: 'sport', action: 'ace', who: 'receiver', target: 'defender' }]
    : [{ t: 0.6, do: 'sport', action: 'serve', who: 'defender', target: 'receiver' },
      { t: 1.9, do: 'sport', action: 'receive', who: 'receiver', target: 'setter' },
      { t: 3.2, do: 'sport', action: 'set', who: 'setter', target: 'hitter' },
      { t: 4.6, do: 'sport', action: last, who: last === 'block' ? 'defender' : 'hitter', target: last === 'block' ? 'hitter' : 'defender' }];
  return {
    id, label, hint, category: 'main', weight: 1, importance: 1, ownsBall: true, roles, steps,
    cues: [{ t: 0.1, signal: 'crowdRise', who: fast ? 'receiver' : 'hitter' }],
    decisive: fast ? 2 : 4.6, duration: fast ? 4 : 6.6,
    shots: fast ? [{ from: 0, size: 'medium', subjects: ['receiver', 'ball'] }]
      : [{ from: 0, size: 'wide', subjects: ['defender', 'receiver', 'ball'] },
        { from: 1.5, size: 'medium', subjects: ['receiver', 'setter', 'ball'] },
        { from: 2.8, size: 'medium', subjects: ['setter', 'hitter', 'ball'] },
        { from: 4, size: 'medium', subjects: ['hitter', 'defender', 'ball'] }],
  };
}

export const VOLLEYBALL: EventDef[] = [
  volleyball('v-ace', 'Ace al servizio!', 'Va al servizio: segui la palla!', 'ace', true),
  volleyball('v-spike', 'Ricezione, alzata e schiacciata!', 'Tre tocchi! Passa dal ricevitore allo schiacciatore!', 'spike'),
  volleyball('v-block', 'Muro vincente!', 'Si alzano a rete: tienili entrambi!', 'block'),
  volleyball('v-quick', 'Primo tempo!', 'Alzata corta al centro, stringi a rete!', 'spike'),
];
VOLLEYBALL[3].steps.splice(1, 0, { t: 1.1, do: 'move', who: 'hitter', to: { pitch: [-1.2, 0] }, speed: 'sprint' });

export function sideEvents(prefix: string): EventDef[] {
  return [
    { id: `${prefix}-coach`, label: 'Allenatore in protesta', hint: 'Il coach si agita a bordo campo!',
      category: 'distraction', weight: 1, importance: 0.4,
      roles: { ref: { label: 'Allenatore', pick: 'coach', side: 'attack' } },
      steps: [{ t: 1.5, do: 'pose', who: 'ref', pose: 'argue', dur: 2 }],
      cues: [], decisive: 1.5, duration: 4,
      shots: [{ from: 0, size: 'close', subjects: ['ref'] }] },
    { id: `${prefix}-stella`, label: 'Stella cadente!', hint: 'Il pubblico guarda in alto...', category: 'rare', weight: 1, importance: 1, once: true,
      roles: {}, steps: [{ t: 2, do: 'effect', effect: 'shootingStar' }], cues: [{ t: 0, signal: 'crowdLookUp', dur: 3.6 }],
      decisive: 2.65, duration: 4.4, shots: [{ from: 0, size: 'close', subjects: ['star'] }] },
  ];
}
