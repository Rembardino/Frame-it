/**
 * MOMENTI SEGRETI — piccole scene fuori dalla partita (in tribuna o a bordo campo) che nessuno annuncia:
 * niente indizi del regista, niente indicatori ai bordi. Se le scopri e le riprendi valgono punti bonus
 * e, in Carriera, diventano video virali.
 *
 * Alcune reagiscono alla camera (la coppia che si nasconde appena la inquadri, quella che si bacia,
 * il tifoso travestito che si scatena), altre succedono e basta (la proposta di matrimonio, chi inciampa...).
 * Per aggiungerne una: un oggetto in PLANS. I numeri da regolare stanno in CONFIG.secrets.
 */
import * as THREE from 'three';
import { CONFIG, DRONE_ONLY, SPORT, type SportId } from '../config';
import { UFO, type Actor, type Match, type Pose } from '../sim/match';
import type { SeatRow } from '../render/stage';
import { MomentTracker, actorSubject, frameInput } from '../scoring/moment';
import { project, starsFor, type FrameEval, type ScoreResult, type ShotSize, type View } from '../scoring/scoring';
import type { DirectorResult } from './director';

const S = () => CONFIG.secrets;
const W = CONFIG.pitch.width;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Altezza sullo schermo (frazione) di ciò che si sta valutando: dal punto più basso al più alto. */
function screenHeight(ev: FrameEval) {
  const ys = ev.points.filter((p) => !p.behind).map((p) => p.y);
  return ys.length ? (Math.max(...ys) - Math.min(...ys)) / 2 : 0;
}
/** Corridoio fra la linea laterale lontana e i cartelloni pubblicitari. */
const WALKWAY_Z = -(W / 2 + 2.3);

/** gap = distanza (m) fra i due di una coppia affiancata: i busti sono larghi ~0,55 m. */
type Cast = { seat: 'stand' | 'walkway'; look?: 'plain' | 'costume' | 'mascot'; count: 1 | 2; couple?: 'behind' | 'side'; gap?: number };
interface Plan {
  id: string;
  label: string;
  size: ShotSize;
  cast: Cast;
  /** true = aspetta di essere inquadrata (al massimo wait secondi), poi reagisce. */
  reactive: boolean;
  wait?: number;
  /** Istante decisivo e durata, dal momento della reazione (o dall'inizio, se non reagisce). */
  decisive: number;
  duration: number;
  /** All'inizio (prima di essere visti). */
  setup?: (a: Actor[], m: Match) => void;
  /** Copione: [secondi, azione]. */
  steps: [number, (a: Actor[], m: Match) => void][];
  /** A ogni fotogramma, dopo il copione (t = secondi dalla reazione o dall'inizio). */
  tick?: (a: Actor[], m: Match, t: number) => void;
  /** Al massimo una volta a partita. */
  once?: boolean;
  sports?: SportId[];
}

const pose = (m: Match, a: Actor, p: Pose, dur: number, face: Actor | null = null) => m.setPose(a, p, dur, face);
/** Fa qualche passo all'indietro, lontano dal campo (chi si nasconde, chi se ne va). */
const backOff = (a: Actor, dist: number) => {
  a.target.set(a.pos.x - Math.cos(a.heading) * dist, a.pos.y, a.pos.z - Math.sin(a.heading) * dist);
  a.speedLimit = CONFIG.match.walkSpeed;
};
/** I due si avvicinano fino a gap metri (per il bacio dopo la proposta). */
const closeIn = (a: Actor, b: Actor, gap: number) => {
  const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5), dir = b.pos.clone().sub(a.pos).setY(0).normalize();
  a.target.copy(mid).addScaledVector(dir, -gap / 2);
  b.target.copy(mid).addScaledVector(dir, gap / 2);
  a.speedLimit = b.speedLimit = CONFIG.match.walkSpeed * 0.6;
};
/** Bacio: uno abbraccia le spalle, l'altro la vita (vedi la posa 'kiss'). */
const kiss = (m: Match, a: Actor, b: Actor, dur: number) => {
  pose(m, a, 'kiss', dur, b); pose(m, b, 'kiss', dur, a);
  a.poseDir = 1; b.poseDir = -1;
};
/** Punto a lato di uno spettatore: avanti = verso dove guarda (il campo), lato = alla sua sinistra, su = sopra i piedi. */
const near = (a: Actor, ahead: number, side: number, up: number) => {
  const fx = Math.cos(a.heading), fz = Math.sin(a.heading);
  return new THREE.Vector3(a.pos.x + fx * ahead - fz * side, a.pos.y + up, a.pos.z + fz * ahead + fx * side);
};
/** Cima della testa di uno spettatore (m sopra i piedi). */
const HEAD_TOP = 1.92 * CONFIG.visuals.spectatorScale;
/** Camminata lungo il corridoio, nel verso dir. */
const stroll = (a: Actor, dir: number, dist: number) => {
  a.target.set(a.pos.x + dir * dist, 0, a.pos.z);
  a.speedLimit = CONFIG.match.walkSpeed * 0.8;
};

export const PLANS: Plan[] = [
  {
    id: 's-couple', label: 'Coppia beccata!', size: 'medium', reactive: true, wait: 35, decisive: 0.2, duration: 3.4,
    cast: { seat: 'stand', count: 2, couple: 'behind' },
    // Lui dietro di lei, abbracciati, guardano la partita. Appena si vedono sul maxischermo: giù, mani sul viso.
    setup: ([her, him], m) => { pose(m, him, 'hug', Infinity); pose(m, her, 'normal', Infinity); },
    steps: [[0, ([her, him], m) => { pose(m, her, 'hide', 2.8); pose(m, him, 'hide', 2.8); backOff(him, 0.5); backOff(her, 0.2); }]],
  },
  {
    id: 's-kiss', label: 'Bacio in diretta!', size: 'medium', reactive: true, wait: 35, decisive: 1.4, duration: 4.4,
    cast: { seat: 'stand', count: 2, couple: 'side', gap: 0.6 },
    // Vogliono farsi riprendere: appena inquadrati salutano e si baciano.
    steps: [
      [0, ([a, b], m) => { pose(m, a, 'wave', 1); pose(m, b, 'wave', 1); }],
      [1, ([a, b], m) => kiss(m, a, b, 2.8)],
    ],
  },
  {
    id: 's-costume', label: 'Tifoso travestito!', size: 'medium', reactive: true, wait: 40, decisive: 1, duration: 4.6,
    cast: { seat: 'stand', count: 1, look: 'costume' },
    steps: [[0, ([a], m) => pose(m, a, 'dance', 4.2)]],
  },
  {
    id: 's-proposal', label: 'Proposta di matrimonio!', size: 'medium', reactive: false, decisive: 3.7, duration: 9,
    // Lontani quanto basta per il braccio teso con l'anello; poi si avvicinano per il bacio.
    cast: { seat: 'walkway', count: 2, couple: 'side', gap: 1.05 },
    steps: [
      [0, ([a, b]) => { a.faceTarget = b; b.faceTarget = a; }],
      [2, ([a, b], m) => pose(m, a, 'kneel', 3.9, b)],
      [3.6, ([a, b], m) => pose(m, b, 'celebrate', 1.8, a)],
      [5.9, ([a, b]) => closeIn(a, b, 0.6)],
      [6.5, ([a, b], m) => kiss(m, a, b, 2.3)],
    ],
  },
  {
    id: 's-dancer', label: 'Ballerino scatenato!', size: 'medium', reactive: false, decisive: 3, duration: 7,
    cast: { seat: 'stand', count: 1 },
    steps: [[1.5, ([a], m) => pose(m, a, 'dance', 5)]],
  },
  {
    id: 's-sleeper', label: 'Dormiglione in tribuna!', size: 'medium', reactive: false, decisive: 6.6, duration: 8.5,
    cast: { seat: 'stand', count: 1 },
    setup: ([a], m) => pose(m, a, 'sleep', 6.5),
    steps: [[6.5, ([a], m) => pose(m, a, 'stumble', 1.1)]],
  },
  {
    id: 's-trip', label: 'Che capitombolo!', size: 'medium', reactive: false, decisive: 3.7, duration: 8,
    cast: { seat: 'walkway', count: 1 },
    steps: [
      [0, ([a]) => stroll(a, Math.sign(-a.pos.x) || 1, 9)],
      [3.2, ([a], m) => pose(m, a, 'stumble', 0.45)],
      [3.65, ([a], m) => pose(m, a, 'fall', 2.4)],
      [6.2, ([a], m) => { a.target.copy(a.pos); pose(m, a, 'dejected', 1.6); }],
    ],
  },
  {
    id: 's-ufo', label: 'Rapito dagli alieni!', size: 'medium', reactive: false, once: true, decisive: 6.1, duration: UFO.gone + 0.5,
    // Allo stadio la tribuna lontana ha il tetto: la navicella prende uno che guarda la partita dal corridoio.
    cast: { seat: DRONE_ONLY ? 'stand' : 'walkway', count: 1 },
    // Arriva da dietro le tribune, accende il raggio e se lo porta via (in tribuna il posto resta vuoto).
    setup: ([a], m) => { Object.assign(m.sky.ufo, { t0: m.time, seat: a.pos.clone(), side: Math.random() < 0.5 ? 1 : -1 }); m.sound('ufo', a.pos); },
    steps: [
      [UFO.arrive - 0.8, ([a], m) => pose(m, a, 'stumble', 1.2)],
      [UFO.beamOn, ([a], m) => m.sound('beam', a.pos)],
      [UFO.liftFrom, ([a], m) => pose(m, a, 'float', UFO.liftTo - UFO.liftFrom + 0.5)],
      [UFO.liftTo, ([a], m) => { m.sound('pop', a.pos); m.despawnExtra(a); }],
    ],
    // Sale nel raggio girando su se stesso, fino alla pancia della navicella.
    tick: ([a], m, t) => {
      const seat = m.sky.ufo.seat!;
      if (!a.active || t < UFO.liftFrom) return;
      a.pos.set(seat.x, seat.y + m.ufoPose().lift * (UFO.height - 2.9), seat.z);
      a.target.copy(a.pos); a.vel.set(0, 0, 0);
      a.heading = Math.atan2(m.ball.pos.z - seat.z, m.ball.pos.x - seat.x) + 1.2 * (t - UFO.liftFrom) ** 1.6;
    },
  },
  {
    id: 's-gull', label: 'Gabbiano sulla testa!', size: 'medium', reactive: false, decisive: 4.3, duration: 9,
    cast: { seat: 'stand', count: 1 },
    // Arriva basso dal campo (sotto il tetto della tribuna), si posa sulla testa: lui per un po' non se ne accorge, poi lo scaccia.
    steps: [
      [0, ([a], m) => {
        const side = Math.random() < 0.5 ? 1 : -1, head = near(a, 0, 0, HEAD_TOP);
        m.fauna.spawn('gull', [
          { p: near(a, 14, side * 6, HEAD_TOP + 1.5), t: 0 }, { p: near(a, 1.2, side * 0.3, HEAD_TOP + 0.35), t: 2.4 },
          { p: head, t: 2.9 }, { p: head, t: 5.7 }, { p: near(a, 13, -side * 9, HEAD_TOP + 2), t: 8.7 },
        ], m.time);
      }],
      [5.3, ([a], m) => { pose(m, a, 'argue', 2.2); m.say(a, 'shoo'); }],
    ],
  },
  {
    id: 's-dog', label: 'Cane in fuga!', size: 'medium', reactive: false, decisive: 4.5, duration: 10.5,
    cast: { seat: 'walkway', count: 1 },
    // Il cane scappa al padrone lungo il corridoio; lui lo rincorre, inciampa, e il cane torna a fargli le feste.
    steps: [
      [0, ([a], m) => {
        const dir = Math.sign(-a.pos.x) || 1, p = (dx: number, dz = 0) => new THREE.Vector3(a.pos.x + dir * dx, 0, WALKWAY_Z + dz);
        m.fauna.spawn('dog', [
          { p: p(0.9), t: 0 }, { p: p(0.9), t: 0.7 }, { p: p(7, 0.5), t: 2 }, { p: p(12, -0.4), t: 3 }, { p: p(15.5), t: 3.8 },
          { p: p(15.6), t: 5.6 }, { p: p(14.2, 0.6), t: 6.3 }, { p: p(14.3, 0.6), t: 8.2 }, { p: p(32), t: 10.5 },
        ], m.time);
        m.sound('bark', p(0.9));
      }],
      [0.8, ([a], m) => { pose(m, a, 'protest', 0.7); m.say(a, 'dog'); }],
      [1.3, ([a]) => { a.target.set(a.pos.x + (Math.sign(-a.pos.x) || 1) * 13, 0, a.pos.z); a.speedLimit = CONFIG.match.runSpeed * 0.75; }],
      [3.9, ([a], m) => pose(m, a, 'stumble', 0.4)],
      [4.3, ([a], m) => pose(m, a, 'fall', 2.6)],
      [5.9, ([a], m) => m.sound('bark', a.pos)],
      [6.9, ([a], m) => { a.target.copy(a.pos); pose(m, a, 'dejected', 1.8); }],
    ],
  },
  {
    id: 's-mascot', label: 'La mascotte inciampa!', size: 'medium', reactive: false, decisive: 3.95, duration: 8,
    cast: { seat: 'walkway', count: 1, look: 'mascot' }, sports: ['calcio', 'basket'],
    steps: [
      [0, ([a], m) => { stroll(a, Math.sign(-a.pos.x) || 1, 9); pose(m, a, 'wave', 2); }],
      [3.5, ([a], m) => pose(m, a, 'stumble', 0.4)],
      [3.9, ([a], m) => pose(m, a, 'fall', 2.4)],
      [6.4, ([a], m) => { a.target.copy(a.pos); pose(m, a, 'wave', 1.5); }],
    ],
  },
];

class Secret {
  readonly tracker: MomentTracker;
  /** Ora della reazione (o dell'inizio, se la scena non aspetta la camera). null = non ancora vista. */
  triggerAt: number | null;
  private step = 0;
  done = false;

  constructor(readonly plan: Plan, readonly actors: Actor[], private match: Match, now: number) {
    this.triggerAt = plan.reactive ? null : now;
    const wait = plan.reactive ? plan.wait ?? 30 : 0;
    this.tracker = new MomentTracker({ label: plan.label, start: now, decisive: now + wait + plan.decisive, end: now + wait + plan.duration });
    plan.setup?.(actors, match);
  }

  update(now: number, view: View) {
    const m = this.match, p = this.plan;
    this.tracker.sample(now, view, frameInput(this.actors.map((a) => actorSubject(a, 'Spettatore')), 0, p.size));
    if (this.triggerAt === null) {
      const ev = this.tracker.last!;
      // Si accorgono di essere inquadrati (tutti dentro, non minuscoli): reagiscono un attimo dopo.
      if (ev.coverage >= S().noticeCoverage && screenHeight(ev) >= S().noticeScreen) {
        this.triggerAt = now + S().reactDelay;
        Object.assign(this.tracker.moment, { decisive: this.triggerAt + p.decisive, end: this.triggerAt + p.duration });
      } else if (now > this.tracker.moment.start + (p.wait ?? 30)) this.done = true;
      return;
    }
    while (this.step < p.steps.length && now - this.triggerAt >= p.steps[this.step][0]) p.steps[this.step++][1](this.actors, m);
    p.tick?.(this.actors, m, now - this.triggerAt);
    if (now >= this.tracker.moment.end) this.done = true;
  }

  get seen() { return this.triggerAt !== null && this.tracker.maxCoverage >= 0.3; }

  /**
   * Voto di un momento segreto: conta solo averli TUTTI in quadro nell'istante decisivo (± 0,5 s).
   * Tutto dentro = 100; un pezzo fuori = in proporzione; mai visti nell'istante giusto = poco.
   */
  result(): ScoreResult {
    const d = this.tracker.moment.decisive;
    const near = this.tracker.samples.filter((s) => Math.abs(s.t - d) <= 0.5);
    const best = near.length ? Math.max(...near.map((s) => s.ev.coverage)) : this.tracker.maxCoverage * 0.5;
    const score = Math.round(Math.min(1, best / S().noticeCoverage) * 100);
    const all = score >= 100;
    return {
      score, stars: starsFor(score), enabled: ['coverage'], decisiveMissed: !near.length,
      components: { coverage: score, size: 0, composition: 0, smoothness: 0, timing: 0 },
      reasons: [all ? { text: 'Tutto in quadro!', good: true } : { text: 'Spettatore fuori inquadratura', good: false }],
    };
  }
}

export class SecretMoments {
  readonly active: Secret[] = [];
  readonly finished: DirectorResult[] = [];
  /** Chi ha finito la scena ma è ancora in vista: se ne va solo quando la camera guarda altrove. */
  private leaving: { a: Actor; until: number }[] = [];
  private next = S().firstAt;
  private last = '';
  private used = new Set<string>();
  private stopped = false;

  /** force = id di un piano da mettere in scena per primo, dopo 5 secondi (per provarlo: ?secret=s-couple). */
  constructor(private match: Match, private rows: SeatRow[], private force: string | null = null) {
    if (force) this.next = 5;
  }

  stop() { this.stopped = true; }

  /** Posti in tribuna occupati dagli spettatori dei momenti segreti (il pubblico finto lì si toglie). */
  get gaps(): THREE.Vector3[] {
    // Chi è salito sulla navicella non torna: il suo posto resta vuoto.
    const taken = this.match.sky.ufo.seat;
    return [...this.match.extras.filter((e) => e.role === 'spectator' && e.active && e.pos.y > 0.2).map((e) => e.pos), ...(taken && taken.y > 0.2 ? [taken] : [])];
  }

  update(view: View) {
    const now = this.match.time;
    for (const s of [...this.active]) {
      s.update(now, view);
      if (!s.done) continue;
      this.active.splice(this.active.indexOf(s), 1);
      this.finish(s);
    }
    this.leaving = this.leaving.filter(({ a, until }) => {
      const pr = project(view, { x: a.pos.x, y: a.pos.y + 1, z: a.pos.z });
      if (now < until && !pr.behind && Math.abs(pr.x) < 1.1 && Math.abs(pr.y) < 1.1) return true;
      this.match.despawnExtra(a);
      return false;
    });
    if (this.stopped || this.active.length || now < this.next) return;
    this.next = now + rand(S().every[0], S().every[1]);
    // Negli sport col drone non c'è il corridoio a bordo campo: solo le tribune (green, paese, arrivo, molo).
    const options = PLANS.filter((p) => p.id !== this.last && !(p.once && this.used.has(p.id)) && (!p.sports || p.sports.includes(SPORT)) && (!DRONE_ONLY || p.cast.seat === 'stand'));
    const forced = PLANS.find((p) => p.id === this.force);
    this.force = null;
    const plan = forced ?? options[Math.floor(Math.random() * options.length)];
    const actors = this.cast(plan.cast);
    if (!actors) return;
    this.last = plan.id;
    this.used.add(plan.id);
    this.active.push(new Secret(plan, actors, this.match, now));
  }

  /** Mette in scena gli spettatori: in un posto a caso della tribuna, o nel corridoio a bordo campo. */
  private cast(c: Cast): Actor[] | null {
    const m = this.match;
    const look = c.look ?? 'plain';
    const want = (a: Actor) => look === 'plain' ? a.look === 'plain' : look === 'mascot' ? a.look === 'mascot' : a.look !== 'plain' && a.look !== 'mascot';
    let at: THREE.Vector3, forward: THREE.Vector3, along: THREE.Vector3;
    if (c.seat === 'stand') {
      // Sport col drone: una tribuna vicina all'azione (la palla, o il punto che si segue: le altre sono a centinaia di metri).
      const rows = DRONE_ONLY ? this.rows.filter((r) => Math.hypot(r.from.x - m.ball.pos.x, r.from.z - m.ball.pos.z) < 90) : this.rows;
      const row = rows[Math.floor(Math.random() * rows.length)];
      if (!row) return null;
      at = new THREE.Vector3().lerpVectors(row.from, row.to, rand(0.15, 0.85));
      // Il tifoso "guarda" verso il suo +x locale ruotato di facing: heading = -facing.
      forward = new THREE.Vector3(Math.cos(-row.facing), 0, Math.sin(-row.facing));
      along = row.to.clone().sub(row.from).normalize();
    } else {
      at = new THREE.Vector3(rand(-0.3, 0.3) * CONFIG.pitch.length, 0, WALKWAY_Z);
      forward = new THREE.Vector3(0, 0, 1);
      along = new THREE.Vector3(1, 0, 0);
    }
    // Lui dietro e un po' di lato, così dalla camera si vedono tutte e due le teste.
    const gap = c.gap ?? 0.6;
    const spots = c.count === 1 ? [at]
      : c.couple === 'behind' ? [at, at.clone().addScaledVector(forward, -0.34).addScaledVector(along, 0.22)]
      : [at.clone().addScaledVector(along, -gap / 2), at.clone().addScaledVector(along, gap / 2)];
    const out: Actor[] = [];
    for (const spot of spots) {
      const a = m.spawnExtra('spectator', spot, (x) => want(x) && !out.includes(x));
      if (!a) { out.forEach((x) => m.despawnExtra(x)); return null; }
      a.heading = Math.atan2(forward.z, forward.x);
      out.push(a);
    }
    return out;
  }

  private finish(s: Secret) {
    const until = this.match.time + 12;
    // La pausa fino al prossimo segreto conta dalla fine di questo, non dal suo inizio.
    this.next = Math.max(this.next, this.match.time + rand(S().every[0], S().every[1]));
    for (const a of s.actors) { a.faceTarget = null; this.leaving.push({ a, until }); }
    // Mai successa (aspettava la camera): niente da dire. Successa ma non vista: persa, svelata solo nel riepilogo.
    if (s.triggerAt === null) return;
    const result = s.seen ? s.result() : null;
    const { start, decisive, end } = s.tracker.moment;
    this.finished.push({
      id: s.plan.id,
      label: `Virale: ${s.plan.label}`,
      category: 'secret',
      importance: 1,
      result,
      points: result ? Math.round(result.score * 10 * S().bonus) : 0,
      aim: s.tracker.aim,
      window: { start, decisive, end },
    });
  }
}
