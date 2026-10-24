/**
 * Momenti da valutare e soggetti con i loro punti chiave.
 * Ponte tra lo stato della partita (sim) e lo Scoring Module puro.
 */
import { CONFIG, SPORT } from '../config';
import type { Actor, Ball, Match } from '../sim/match';
import { BODY, type Animal } from '../sim/fauna';
import {
  evaluateFrame, scoreMoment,
  type Component, type FrameEval, type FrameInput, type Keypoint, type MomentSample,
  type ScoreResult, type ShotSize, type SubjectFrame, type Vec3, type View,
} from './scoring';

/** Un soggetto "vivo": rilegge posizione e punti chiave a ogni frame. */
export interface Subject {
  label: string;
  kind: SubjectFrame['kind'];
  weight: number;
  points(): Keypoint[];
  vel(): Vec3;
}

/** Finestra di valutazione, in tempi assoluti (Match.time). */
export interface Moment {
  label: string;
  start: number;
  decisive: number;
  end: number;
}

const S = (a?: Actor) => a?.role === 'spectator' ? CONFIG.visuals.spectatorScale : CONFIG.visuals.playerScale;

export function actorSubject(a: Actor, label: string, weight = 1): Subject {
  return {
    label,
    kind: 'player',
    weight,
    vel: () => a.vel,
    points() {
      const s = S(a);
      const { x, z } = a.pos;
      const fx = Math.cos(a.heading), fz = Math.sin(a.heading);
      // Mani ai lati del corpo (perpendicolari alla direzione in cui guarda).
      const rx = -fz * 0.4 * s;
      const rz = fx * 0.4 * s;
      // In bici si sta piegati: la testa è più in basso.
      const rider = SPORT === 'ciclismo' && a.role !== 'fan' && a.role !== 'steward' && a.role !== 'spectator' && a.pose !== 'fall';
      let head = { x, y: (rider ? 1.45 : 1.78) * s, z };
      let body = { x, y: (rider ? 1.0 : 1.2) * s, z };
      if (a.pose === 'dive') {
        head = { x, y: 0.7 * s, z: z + a.poseDir * 1.1 * s };
        body = { x, y: 0.6 * s, z: z + a.poseDir * 0.6 * s };
      } else if (a.pose === 'fall') {
        // Lungo disteso in avanti.
        head = { x: x + fx * 1.6 * s, y: 0.3 * s, z: z + fz * 1.6 * s };
        body = { x: x + fx * 0.9 * s, y: 0.3 * s, z: z + fz * 0.9 * s };
      } else if (a.pose === 'tackle') {
        head = { x: x - fx * 0.9 * s, y: 0.9 * s, z: z - fz * 0.9 * s };
        body = { x: x - fx * 0.4 * s, y: 0.6 * s, z: z - fz * 0.4 * s };
      } else if (a.pose === 'celebrate' || a.pose === 'wave') {
        head.y += 0.2; // saltelli
      } else if (a.pose === 'hide' || a.pose === 'kneel') {
        head.y -= 0.45 * s; body.y -= 0.35 * s; // rannicchiato o in ginocchio
      }
      if (a.pose === 'spike' || a.pose === 'block') {
        const lift = 0.9 * Math.sin(Math.min(1, a.poseTime / a.poseDur) * Math.PI) * s;
        head.y += lift; body.y += lift;
      }
      const raised = ['serve', 'set', 'spike', 'block'].includes(a.pose);
      const handsY = raised ? head.y + (SPORT === 'tennis' ? 1.2 : 0.55) * s : 1 * s;
      // Gli spettatori in tribuna stanno più in alto del campo.
      const y0 = a.pos.y;
      return [
        { p: { ...head, y: head.y + y0 }, kind: 'head' },
        { p: { ...body, y: body.y + y0 }, kind: 'body' },
        { p: { x, y: 0.05 + y0, z }, kind: 'feet' },
        { p: { x: x + rx, y: handsY + y0, z: z + rz }, kind: 'hands' },
        { p: { x: x - rx, y: handsY + y0, z: z - rz }, kind: 'hands' },
      ];
    },
  };
}

export function ballSubject(b: Ball, weight = 1.2): Subject {
  const v = { x: 0, y: 0, z: 0 };
  return {
    label: 'Palla',
    kind: 'ball',
    weight,
    points: () => [{ p: b.pos, kind: 'ball' }],
    vel() {
      if (b.flight) {
        const f = b.flight;
        v.x = (f.to.x - f.from.x) / f.dur;
        v.z = (f.to.z - f.from.z) / f.dur;
        return v;
      }
      return b.holder ? b.holder.vel : b.vel;
    },
  };
}

const ANIMAL: Record<Animal['species'], string> = {
  deer: 'Cervo', fox: 'Volpe', rabbit: 'Lepre', duck: 'Anatra', birds: 'Uccelli', cow: 'Mucca', dog: 'Cane',
  dolphin: 'Delfino', gull: 'Gabbiano', eagle: 'Aquila', whale: 'Balena',
};

/** Animali di un evento: testa, corpo e zampe di chi cammina; il corpo intero di chi vola o nuota. */
export function animalSubject(match: Match, a: Animal, weight = 1): Subject {
  const b = BODY[a.species], v = { x: 0, y: 0, z: 0 };
  return {
    label: ANIMAL[a.species],
    kind: 'player',
    weight,
    vel() {
      const p = match.fauna.at(a, 0, match.time).pos, q = match.fauna.at(a, 0, match.time + 0.1).pos;
      v.x = (q.x - p.x) * 10; v.z = (q.z - p.z) * 10;
      return v;
    },
    points() {
      const out: Keypoint[] = [];
      for (let i = 0; i < a.n; i++) {
        const { pos, heading } = match.fauna.at(a, i, match.time);
        const fx = Math.cos(heading) * b.len * 0.5, fz = Math.sin(heading) * b.len * 0.5;
        if (b.fly || b.swim) out.push({ p: { x: pos.x + fx, y: pos.y + b.h * 0.5, z: pos.z + fz }, kind: 'area' }, { p: { x: pos.x - fx, y: pos.y, z: pos.z - fz }, kind: 'area' });
        else out.push({ p: { x: pos.x + fx, y: pos.y + b.h, z: pos.z + fz }, kind: 'head' }, { p: { x: pos.x, y: pos.y + b.h * 0.6, z: pos.z }, kind: 'body' }, { p: { x: pos.x, y: pos.y, z: pos.z }, kind: 'feet' });
      }
      return out;
    },
  };
}

/** Il gruppo dei ciclisti (chi non è caduto) o tutti gli equipaggi della regata: un soggetto solo. */
export function groupSubject(match: Match, label: string, weight = 1, list?: () => Actor[]): Subject {
  const v = { x: 0, y: 0, z: 0 }, s = CONFIG.visuals.playerScale;
  const members = list ?? (() => match.actors.filter((a) => a.pose !== 'fall'));
  return {
    label,
    kind: 'player',
    weight,
    vel() {
      const list = members();
      v.x = list.reduce((t, a) => t + a.vel.x, 0) / Math.max(1, list.length);
      v.z = list.reduce((t, a) => t + a.vel.z, 0) / Math.max(1, list.length);
      return v;
    },
    points: () => members().flatMap((a): Keypoint[] => [
      { p: { x: a.pos.x, y: a.pos.y + 1.45 * s, z: a.pos.z }, kind: 'head' },
      { p: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, kind: 'feet' },
    ]),
  };
}

/** Golf: la palla con r metri di margine attorno (in volo va inquadrata anche un po' di cielo davanti). */
export function flightSubject(b: Ball, r: number, weight = 1.2): Subject {
  const offsets = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
  return {
    label: 'Palla',
    kind: 'ball',
    weight,
    vel: () => b.vel,
    points: () => [{ p: b.pos, kind: 'ball' }, ...offsets.map(([x, y, z]): Keypoint =>
      ({ p: { x: b.pos.x + x, y: Math.max(0, b.pos.y + y), z: b.pos.z + z }, kind: 'area' }))],
  };
}

/** Golf: la bandiera (base, cima dell'asta e punta della bandierina). */
export function pinSubject(pin: Vec3, weight = 0.6): Subject {
  const pts: Keypoint[] = [
    { p: { x: pin.x, y: 0, z: pin.z }, kind: 'goal' },
    { p: { x: pin.x, y: 2.4, z: pin.z }, kind: 'goal' },
    { p: { x: pin.x + 0.6, y: 2.2, z: pin.z }, kind: 'goal' },
  ];
  const still = { x: 0, y: 0, z: 0 };
  return { label: CONFIG.pitch.goalName, kind: 'goal', weight, points: () => pts, vel: () => still };
}

/** Porta: i 4 angoli dello specchio. side = +1 porta a x positivo, -1 a x negativo. */
export function goalSubject(side: number, weight = 0.6): Subject {
  const P = CONFIG.pitch;
  const x = (side * P.length) / 2;
  const w = P.goalWidth / 2;
  const h = P.goalHeight;
  // Basket: il ferro (davanti e dietro) e gli angoli alti del tabellone.
  const hx = side * (P.length / 2 - P.hoopFromBaseline);
  const pts: Keypoint[] = SPORT === 'basket'
    ? [
      { p: { x: hx - side * 0.23, y: P.rimHeight, z: 0 }, kind: 'goal' },
      { p: { x: hx, y: P.rimHeight - 0.45, z: 0 }, kind: 'goal' },
      { p: { x: side * (P.length / 2 - 1.2), y: P.rimHeight + 0.9, z: -0.9 }, kind: 'goal' },
      { p: { x: side * (P.length / 2 - 1.2), y: P.rimHeight + 0.9, z: 0.9 }, kind: 'goal' },
    ]
    : [
      { p: { x, y: 0, z: -w }, kind: 'goal' },
      { p: { x, y: 0, z: w }, kind: 'goal' },
      { p: { x, y: h, z: -w }, kind: 'goal' },
      { p: { x, y: h, z: w }, kind: 'goal' },
    ];
  const still = { x: 0, y: 0, z: 0 };
  return { label: P.goalName, kind: 'goal', weight, points: () => pts, vel: () => still };
}

/** La stella cadente: tutta la traiettoria (si inquadra il pezzo di cielo) più la testa luminosa. */
export function starSubject(match: Match): Subject {
  const s = match.sky.star;
  const still = { x: 0, y: 0, z: 0 };
  return {
    label: 'Stella cadente',
    kind: 'area',
    weight: 1,
    vel: () => still,
    points: () => [
      { p: s.from, kind: 'area' },
      { p: s.to, kind: 'area' },
      { p: match.starPoints().head, kind: 'area' },
    ],
  };
}

/** Zona rettangolare (es. settore di tribuna) dati due angoli opposti. */
export function areaSubject(label: string, a: Vec3, b: Vec3, weight = 1): Subject {
  const pts: Keypoint[] = [
    { p: { x: a.x, y: a.y, z: a.z }, kind: 'area' },
    { p: { x: b.x, y: a.y, z: b.z }, kind: 'area' },
    { p: { x: a.x, y: b.y, z: a.z }, kind: 'area' },
    { p: { x: b.x, y: b.y, z: b.z }, kind: 'area' },
  ];
  const still = { x: 0, y: 0, z: 0 };
  return { label, kind: 'area', weight, points: () => pts, vel: () => still };
}

export function frameInput(subjects: Subject[], lead: number, size: ShotSize): FrameInput {
  return {
    subjects: subjects.map((s) => ({ label: s.label, kind: s.kind, weight: s.weight, points: s.points(), vel: s.vel() })),
    lead,
    size,
  };
}

/** Centro del soggetto (per gli indicatori ai bordi). */
export function subjectCenter(s: Subject): Vec3 {
  const pts = s.points().filter((k) => k.kind !== 'hands');
  const c = { x: 0, y: 0, z: 0 };
  for (const k of pts) { c.x += k.p.x / pts.length; c.y += k.p.y / pts.length; c.z += k.p.z / pts.length; }
  return c;
}

/** Raccoglie i frame di un momento e alla fine chiede il voto allo Scoring Module. */
export class MomentTracker {
  readonly samples: MomentSample[] = [];
  last: FrameEval | null = null;
  /** Dove stava il soggetto nell'istante decisivo (centro e raggio): per la foto dei momenti persi. */
  aim: { t: number; x: number; y: number; z: number; r: number } | null = null;

  constructor(readonly moment: Moment) {}

  sample(t: number, view: View, input: FrameInput) {
    this.last = evaluateFrame(view, input);
    this.samples.push({ t, view, ev: this.last });
    if (!this.aim && t >= this.moment.decisive) {
      const pts = input.subjects.flatMap((s) => s.points).filter((k) => k.kind !== 'hands').map((k) => k.p);
      if (!pts.length) return;
      const c = { t, x: 0, y: 0, z: 0, r: 1 };
      for (const p of pts) { c.x += p.x / pts.length; c.y += p.y / pts.length; c.z += p.z / pts.length; }
      for (const p of pts) c.r = Math.max(c.r, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z));
      this.aim = c;
    }
  }

  result(enabled: Component[]): ScoreResult {
    return scoreMoment(this.samples, this.moment.decisive, enabled);
  }

  /** Copertura massima raggiunta: se è bassa, il momento non è stato proprio visto. */
  get maxCoverage() {
    return this.samples.reduce((m, s) => Math.max(m, s.ev.coverage), 0);
  }
}
