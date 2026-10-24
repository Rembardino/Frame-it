/**
 * EVENTI DEL CICLISMO — solo dati. Il gruppo si riprende come in TV: largo sulla corsa, stretto su chi scatta,
 * cade o vince. Curve, paese e ponte arrivano quando il gruppo ci passa (`when`); la volata negli ultimi 250 m.
 * Distrazioni: il tifoso che corre accanto ai corridori, e gli animali di campagna.
 */
import { CONFIG } from '../config';
import type { Match } from '../sim/match';
import type { CyclingSimulation } from '../sim/sports/cycling';
import type { EventDef } from './types';
import { animalEvent } from './golf';

const sim = (m: Match) => m.sportSimulation as CyclingSimulation;
const racing = (m: Match) => !sim(m).finished && sim(m).toFinish > 420;
/** Vicino a curva, paese o ponte le altre azioni aspettano: così il passaggio non si perde. */
const free = (m: Match) => racing(m) && Math.min(sim(m).ahead('bend'), sim(m).ahead('bridge'), sim(m).ahead('village')) > 130;
const rider = (label = 'Corridore') => ({ label, pick: 'player' as const, side: 'attack' as const });

/** Passaggio del gruppo in un punto della strada: parte quando mancano ~52 m, istante decisivo all'arrivo lì. */
function passage(id: string, label: string, hint: string, what: 'bend' | 'bridge' | 'village', size: 'medium' | 'wide'): EventDef {
  return {
    id, label, hint, category: 'main', weight: 4, importance: 0.8, once: what !== 'bend',
    when: (m) => racing(m) && sim(m).ahead(what) > 46 && sim(m).ahead(what) < 58,
    roles: {}, steps: [], cues: [], decisive: 52 / 12, duration: 52 / 12 + 3,
    shots: [{ from: 0, size, subjects: ['pack'] }],
  };
}

export const CYCLING_EVENTS: EventDef[] = [
  {
    id: 'c-scatto', label: 'Scatto dal gruppo!', hint: 'Qualcuno sta per scattare!', category: 'main', weight: 3, importance: 1,
    when: (m) => free(m) && !sim(m).breakaway && sim(m).attacks < 2 && sim(m).toFinish > 600,
    roles: { a: rider('Attaccante') },
    steps: [{ t: 1.4, do: 'sport', action: 'attack', who: 'a' }],
    cues: [], decisive: 3.6, duration: 7,
    shots: [{ from: 0, size: 'medium', subjects: ['pack'] }, { from: 1.2, size: 'medium', subjects: ['a', 'pack'], lead: 'a' }, { from: 4.5, size: 'medium', subjects: ['a'] }],
  },
  {
    id: 'c-ripreso', label: 'Il gruppo riprende il fuggitivo', hint: 'Il gruppo si avvicina alla fuga!', category: 'main', weight: 5, importance: 0.8,
    when: (m) => free(m) && !!sim(m).breakaway && sim(m).breakaway!.s - sim(m).packS > 25,
    roles: { a: rider() },
    steps: [{ t: 0.3, do: 'sport', action: 'catch', who: 'a' }],
    cues: [], decisive: 4.8, duration: 7,
    shots: [{ from: 0, size: 'medium', subjects: ['pack'] }],
  },
  passage('c-curva', 'Curva a gomito!', 'Curva secca in arrivo: anticipa la svolta!', 'bend', 'medium'),
  passage('c-paese', 'Il gruppo attraversa il paese', 'Entrano in paese: c’è lo strappo!', 'village', 'wide'),
  passage('c-ponte', 'Sul ponte!', 'Il gruppo arriva al ponte sul fiume!', 'bridge', 'wide'),
  {
    id: 'c-caduta', label: 'Caduta nel gruppo!', hint: 'Il gruppo è nervoso, occhio!', category: 'main', weight: 1.5, importance: 1, once: true,
    when: (m) => free(m) && sim(m).toFinish > 500,
    roles: { a: rider() },
    steps: [{ t: 1.6, do: 'sport', action: 'crash', who: 'a' }],
    cues: [], decisive: 1.8, duration: 6.5,
    shots: [{ from: 0, size: 'medium', subjects: ['pack'] }, { from: 1.4, size: 'medium', subjects: ['a'] }],
  },
  {
    id: 'c-volata', label: 'Volata finale!', hint: 'Ultimi 250 metri: arriva la volata!', category: 'main', weight: 50, importance: 1, once: true, exclusive: true,
    when: (m) => !sim(m).finished && sim(m).toFinish < 270,
    roles: { a: { label: 'Velocista', pick: 'player', side: 'attack', roles: ['fwd'] } },
    steps: [{ t: 0.3, do: 'sport', action: 'sprintFinish', who: 'a' }],
    cues: [{ t: 0.3, signal: 'crowdRise', who: 'a' }],
    decisive: 0.3 + CONFIG.cycling.sprintSec, duration: CONFIG.cycling.sprintSec + 2.5,
    shots: [
      { from: 0, size: 'medium', subjects: ['pack'] },
      { from: CONFIG.cycling.sprintSec - 3, size: 'medium', subjects: ['a', 'pack'], lead: 'a' },
      { from: CONFIG.cycling.sprintSec - 0.8, size: 'medium', subjects: ['a'] },
    ],
  },
  {
    id: 'c-esultanza', label: 'Braccia al cielo!', category: 'main', weight: 0, importance: 0.6, trigger: 'goal',
    roles: { scorer: { label: 'Vincitore', pick: 'scorer' } },
    steps: [], cues: [], decisive: 1.2, duration: 3,
    shots: [{ from: 0, size: 'medium', subjects: ['scorer'] }],
  },
  // ---------------------------------------------------------------- distrazioni
  {
    id: 'c-tifoso', label: 'Tifoso che corre col gruppo!', hint: 'Un tifoso scatenato a bordo strada!',
    category: 'distraction', weight: 3, importance: 0.8, once: true, when: (m) => sim(m).inVillage,
    roles: { fan: { label: 'Tifoso', pick: 'extra', kind: 'fan', at: { spot: 'ahead', off: [25, 7] } }, a: rider() },
    steps: [{ t: 0, do: 'sport', action: 'runAlong', who: 'fan', target: 'a' }],
    cues: [{ t: 0, signal: 'crowdRise', who: 'fan' }], decisive: 3, duration: 7,
    shots: [{ from: 0, size: 'medium', subjects: ['fan'] }, { from: 1.5, size: 'medium', subjects: ['fan', 'a'] }],
  },
  animalEvent('c-cane', 'Un cane attraversa la strada!', 'Attenzione, un cane vicino alla strada!', 'dog', 'cross', 1, 3, 6, (m) => racing(m)),
  animalEvent('c-mucche', 'Mucche al pascolo', 'Guarda le mucche nel prato!', 'cow', 'graze', 4, 5, 10, (m) => racing(m)),
  animalEvent('c-cervi', 'Cervi vicino al bosco!', 'Qualcosa si muove tra gli alberi!', 'deer', 'peek', 2, 4.5, 8.5, (m) => racing(m) && sim(m).nearWoods),
  animalEvent('c-stormo', 'Stormo in volo!', 'Guarda il cielo sopra il gruppo!', 'birds', 'sky', 20, 5, 10, (m) => racing(m)),
  { ...animalEvent('c-aquila', 'Un’aquila sopra il gruppo!', 'Il pubblico guarda in alto...', 'eagle', 'glide', 1, 6, 12, () => true),
    category: 'rare', cues: [{ t: 0, signal: 'crowdLookUp', dur: 6 }] },
];
