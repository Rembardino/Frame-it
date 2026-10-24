/**
 * EVENTI DELLA VELA — solo dati. Partenza col colpo di cannone, virate, voli sui foil, scuffie,
 * giri di boa e arrivo (quando la barca in testa ci arriva: `when`). Distrazioni: delfini e gabbiani; rara: la balena.
 */
import { CONFIG } from '../config';
import type { Match } from '../sim/match';
import type { SailingSimulation } from '../sim/sports/sailing';
import type { EventDef } from './types';
import { animalEvent } from './golf';

const sim = (m: Match) => m.sportSimulation as SailingSimulation;
const racing = (m: Match) => sim(m).started && !sim(m).finished;
/** Quando la barca in testa si avvicina a una boa o all'arrivo, le altre azioni aspettano: il passaggio non si perde. */
const free = (m: Match) => racing(m) && sim(m).distToTarget(sim(m).lead) > 150;
const crew = { a: { label: 'Velista', pick: 'player' as const, side: 'attack' as const }, b: { label: 'Velista', pick: 'player' as const, side: 'attack' as const, near: 'a' } };
const S = CONFIG.sailing;

/** Barca in testa che arriva a una boa (o all'arrivo): parte a ~62 m, istante decisivo quando ci passa. */
function mark(id: string, label: string, hint: string, leg: number, speed: number, dist = 62): EventDef {
  return {
    id, label, hint, category: 'main', weight: 6, importance: 1, once: true,
    when: (m) => racing(m) && sim(m).lead.leg === leg && Math.abs(sim(m).distToTarget(sim(m).lead) - dist) < 6,
    roles: {}, steps: [], cues: [], decisive: dist / speed, duration: dist / speed + 3,
    shots: [{ from: 0, size: 'medium', subjects: ['leader', 'pin'], lead: 'leader' }],
  };
}

export const SAILING_EVENTS: EventDef[] = [
  {
    id: 'r-partenza', label: 'Partenza della regata!', hint: 'Sei secondi al colpo di partenza!', category: 'main', weight: 1, importance: 1, once: true,
    when: (m) => !sim(m).started,
    roles: { a: crew.a },
    steps: [{ t: 6, do: 'sport', action: 'gun', who: 'a' }],
    cues: [], decisive: 6, duration: 9,
    shots: [{ from: 0, size: 'wide', subjects: ['boats'] }],
  },
  {
    id: 'r-virata', label: 'Virata!', hint: 'Una barca sta per virare!', category: 'main', weight: 3, importance: 1,
    when: (m) => free(m) && sim(m).boats.every((b) => b.leg === 1),
    roles: crew, steps: [{ t: 1.5, do: 'sport', action: 'tack', who: 'a' }],
    cues: [], decisive: 1.5 + S.tackSec / 2, duration: 2 + S.tackSec + 1.5,
    shots: [{ from: 0, size: 'medium', subjects: ['a', 'b'] }],
  },
  {
    id: 'r-volo', label: 'In volo sui foil!', hint: 'Una barca accelera: si alza sui foil!', category: 'main', weight: 2, importance: 0.9,
    when: (m) => free(m) && sim(m).boosts < 3 && sim(m).boats.some((b) => b.leg >= 1 && b.leg <= 3),
    roles: crew, steps: [{ t: 1.2, do: 'sport', action: 'foil', who: 'a' }],
    cues: [], decisive: 2.4, duration: 5.5,
    shots: [{ from: 0, size: 'medium', subjects: ['a', 'b'] }],
  },
  {
    id: 'r-scuffia', label: 'Scuffia!', hint: 'Raffica forte: occhio alle barche!', category: 'main', weight: 1.5, importance: 1, once: true,
    when: (m) => free(m) && sim(m).lead.leg >= 2,
    roles: crew, steps: [{ t: 1.5, do: 'sport', action: 'capsize', who: 'a' }],
    cues: [], decisive: 2.1, duration: 7,
    shots: [{ from: 0, size: 'medium', subjects: ['a', 'b'] }],
  },
  mark('r-boa', 'Giro di boa!', 'La prima barca arriva alla boa di bolina!', 1, S.upwind),
  mark('r-cancello', 'Al cancello di poppa!', 'Si arriva al cancello: tieni barca e boa!', 2, S.downwind),
  { ...mark('r-arrivo', 'Arrivo!', 'Ultimi metri: l’arrivo!', 3, S.reach, 106), weight: 50, exclusive: true },
  {
    id: 'r-esultanza', label: 'Festa a bordo!', category: 'main', weight: 0, importance: 0.6, trigger: 'goal',
    roles: { scorer: { label: 'Velista', pick: 'scorer' } },
    steps: [], cues: [], decisive: 1.2, duration: 3,
    shots: [{ from: 0, size: 'medium', subjects: ['scorer'] }],
  },
  animalEvent('r-delfini', 'Delfini accanto alla barca!', 'Qualcosa salta vicino alle barche!', 'dolphin', 'swim', 4, 4.5, 9, racing),
  animalEvent('r-gabbiani', 'Gabbiani sulla regata', 'Guarda in alto sopra le barche!', 'gull', 'glide', 6, 6, 12, racing),
  { ...animalEvent('r-balena', 'Una balena!', 'Laggiù, in mare aperto...', 'whale', 'breach', 1, 5, 10, () => true), category: 'rare' },
];
