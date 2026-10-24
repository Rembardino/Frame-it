/**
 * GOLF — si riprende solo col drone. Una coppia gioca a colpi alternati (come nei "foursome") alcune buche
 * del percorso, partendo da una buca a caso. Si gioca contro il par: −1 = un colpo sotto.
 *
 * Nessun colpo parte da solo: ogni colpo è un evento della regia (events/golf.ts) che sceglie l'esito
 * (fairway, bunker, alberi, acqua, green, buca...). Qui si calcolano volo, rimbalzo e rotolamento.
 * Quando la palla si ferma: pochi secondi, poi stacco TV e i golfisti sono già sulla palla.
 * Tempi e altezze dei colpi stanno in CONFIG.golf.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Actor, Match, TeamId } from '../match';
import type { Effect, SportAction, SportSimulation } from './types';
import { COURSE, LAKE_POLY, lieAt, nearestS, nearestTree, pointAt, randomIn, type Hole, type Poly, type Tree, type V2 } from './golfCourse';
import { standardRoute, type Key, type Species } from '../fauna';
import { netContactPoint } from '../../animation/motion';
import { t } from '../../i18n';

export type GolfKind = 'drive' | 'tee3' | 'wood' | 'approach' | 'chip' | 'bunker' | 'putt';
/** Il prossimo colpo: tipo, distanza dalla buca e quali esiti sono possibili da qui. */
export interface GolfNext { kind: GolfKind; dist: number; water: boolean; fairwayBunker: boolean; greenBunker: boolean; tree: boolean }

const G = () => CONFIG.golf;
const R = () => CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const v3 = ([x, z]: V2, y = 0) => new THREE.Vector3(x, y, z);
const flatDist = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
/** Rimbalzo dopo l'atterraggio: [metri, secondi, altezza]. */
const HOP: Record<GolfKind, [number, number, number]> = {
  drive: [8, 0.7, 1.1], wood: [6, 0.6, 0.9], tee3: [2, 0.35, 0.35], approach: [2, 0.35, 0.35],
  chip: [0.8, 0.25, 0.15], bunker: [0.6, 0.25, 0.2], putt: [0, 0, 0],
};

interface Shot {
  action: SportAction; kind: GolfKind;
  from: THREE.Vector3; land: THREE.Vector3; hop: THREE.Vector3; rest: THREE.Vector3;
  /** Punto di controllo del rotolamento: l'effetto del putt, il giro attorno al bordo della buca. */
  bend: THREE.Vector3 | null;
  t: number; impact: number; carry: number; apex: number; hopDur: number; hopArc: number; roll: number;
  cup: boolean; water: boolean; tree: boolean;
  launched: boolean; landed: boolean; done: boolean; lipped: boolean;
}

type Stage = 'setup' | 'ready' | 'shot' | 'walk' | 'holed' | 'done';

export class GolfSimulation implements SportSimulation {
  /** Le buche di questa partita, in ordine. */
  readonly round: Hole[];
  holeIdx = 0;
  /** Colpi giocati sulla buca in corso (penalità comprese). */
  strokes = 0;
  /** Colpi sopra (+) o sotto (−) il par, buche finite. */
  toPar = 0;
  /** Risultato di ogni buca finita (colpi − par). */
  readonly results: number[] = [];
  shooter: TeamId = 0;
  next: GolfNext = { kind: 'drive', dist: 0, water: false, fairwayBunker: false, greenBunker: false, tree: false };
  /** Sabbia, spruzzi, foglie: la grafica li disegna in base a match.time (anche nei replay). */
  readonly effects: Effect[] = [];
  readonly pin = new THREE.Vector3();
  private shot: Shot | null = null;
  private stage: Stage = 'setup';
  private wait = 1;
  private drop: THREE.Vector3 | null = null;
  private targets: { water: THREE.Vector3 | null; fairwayBunker: Poly | null; greenBunker: Poly | null; tree: Tree | null } =
    { water: null, fairwayBunker: null, greenBunker: null, tree: null };

  constructor(private match: Match) {
    const start = Math.floor(Math.random() * COURSE.length);
    this.round = Array.from({ length: Math.min(COURSE.length, G().holesPerRound) }, (_, i) => COURSE[(start + i) % COURSE.length]);
    this.toTee();
    this.wait = 1;
  }

  get hole() { return this.round[Math.min(this.holeIdx, this.round.length - 1)]; }
  get busy() { return this.stage === 'shot'; }
  get finished() { return this.stage === 'done'; }
  private get golfer() { return this.match.actors.find((a) => a.team === this.shooter)!; }

  /** Dove parte il drone: dietro al tee della prima buca, a mezz'aria. */
  droneStart() {
    const h = this.round[0], tee = v3(h.tee), d = pointAt(h.line, h.lineS, 60).sub(tee).setY(0).normalize();
    return { pos: tee.clone().addScaledVector(d, -24).setY(8), look: tee.clone().addScaledVector(d, 45) };
  }

  update(dt: number) {
    const m = this.match;
    if (m.isStopped) return;
    this.wait -= dt;
    if (this.shot) this.fly(this.shot, dt);
    switch (this.stage) {
      case 'setup':
        if (this.wait > 0) break;
        this.stage = 'ready';
        m.phase = 'play';
        m.ball.holder = this.golfer;
        m.ball.state = 'held';
        break;
      case 'ready':
        // Tra un gesto e l'altro della routine il golfista torna in posizione sulla palla.
        if (this.golfer.pose === 'normal') m.setPose(this.golfer, 'address');
        break;
      case 'shot':
        if (this.shot?.done) this.afterShot();
        break;
      case 'walk':
        if (this.wait > 0) break;
        if (this.drop) { m.ball.pos.copy(this.drop); this.drop = null; }
        this.setupShot();
        break;
      case 'holed':
        if (this.wait > 0) break;
        if (++this.holeIdx < this.round.length) { this.toTee(); break; }
        // Giro finito: la partita si chiude appena la regia ha finito (main.ts guarda il cronometro).
        this.stage = 'done';
        m.phase = 'play';
        m.clock = Math.max(m.clock, CONFIG.match.durationSec);
        break;
    }
  }

  action(action: SportAction, actor: Actor) {
    const m = this.match;
    if (this.stage !== 'ready' || m.ball.holder !== actor) return;
    const putt = this.next.kind === 'putt';
    this.shot = this.plan(action);
    this.strokes++;
    this.stage = 'shot';
    m.setPose(actor, putt ? 'putt' : 'swing', putt ? 1.25 : 1.7);
  }

  scoreText() {
    return this.toPar === 0 ? 'PAR' : this.toPar > 0 ? `+${this.toPar}` : `−${-this.toPar}`;
  }

  clockText() {
    return t('BUCA {n}/{of} · PAR {par}', { n: Math.min(this.holeIdx + 1, this.round.length), of: this.round.length, par: this.hole.par });
  }

  /** Punti notevoli per i copioni (tribuna, bandiera, bunker del green), con uno scarto [verso il green, di lato]. */
  spot(name: string, [a, b]: [number, number]) {
    const h = this.hole, f = new THREE.Vector3(h.stand.forward[0], 0, h.stand.forward[1]), l = new THREE.Vector3(-f.z, 0, f.x);
    const bunker = [...h.bunkers].sort((p, q) => flatDist(v3(p.c), this.pin) - flatDist(v3(q.c), this.pin))[0];
    const base = name === 'stand' ? v3(h.stand.at) : name === 'bunker' && bunker ? v3(bunker.c) : this.pin.clone();
    return base.addScaledVector(f, a).addScaledVector(l, b).setY(0);
  }

  /** Animali lungo la buca, un centinaio di metri davanti alla palla; le anatre sullo specchio d'acqua più vicino. */
  animalRoute(route: string, _species: Species): Key[] {
    const h = this.hole, b = this.match.ball.pos, s = Math.min(nearestS(h, b.x, b.z) + 110, h.length - 20);
    let c = pointAt(h.line, h.lineS, s);
    const d = pointAt(h.line, h.lineS, s + 2).sub(c).setY(0).normalize();
    if (route === 'takeoff') c = [LAKE_POLY, ...h.waterPolys].map((w) => this.center(w)).sort((p, q) => flatDist(p, b) - flatDist(q, b))[0];
    return standardRoute(route, c, d, (h.width || 12) + 10);
  }

  // ---------------------------------------------------------------- tra un colpo e l'altro

  private toTee() {
    const h = this.hole, m = this.match;
    this.strokes = 0;
    // A colpi alternati: un giocatore tira dal tee sulle buche dispari, l'altro su quelle pari.
    this.shooter = (this.holeIdx % 2) as TeamId;
    this.pin.set(h.pin[0], 0, h.pin[1]);
    const d = pointAt(h.line, h.lineS, 10).sub(v3(h.tee)).setY(0).normalize();
    m.ball.pos.set(h.tee[0] + d.x * 2 - d.z * rand(-2, 2), R(), h.tee[1] + d.z * 2 + d.x * rand(-2, 2));
    this.setupShot();
  }

  /** Stacco TV: tutti al loro posto per il prossimo colpo. Poi readySec secondi e si gioca. */
  private setupShot() {
    const m = this.match, b = m.ball.pos.clone().setY(0);
    m.ball.holder = null;
    m.ball.state = 'dead';
    m.ball.pos.y = R();
    m.phase = 'reset';
    this.stage = 'setup';
    this.wait = G().readySec;
    this.next = this.classify();
    const aim = this.next.kind === 'drive' || this.next.kind === 'wood'
      ? pointAt(this.hole.line, this.hole.lineS, nearestS(this.hole, b.x, b.z) + 200) : this.pin.clone();
    const dir = aim.sub(b).setY(0).normalize();
    // Il golfista guarda la palla e ha il bersaglio alla sua sinistra (è destro).
    const face = new THREE.Vector3(-dir.z, 0, dir.x);
    const golfer = this.golfer, partner = m.actors.find((a) => a !== golfer)!;
    const caddie = m.coaches.find((c) => c.team === this.shooter)!, fore = m.coaches.find((c) => c !== caddie)!;
    const place = (a: Actor, p: THREE.Vector3) => {
      if (a.scripted) return;
      a.pos.copy(p).setY(0); a.target.copy(a.pos); a.vel.set(0, 0, 0); a.faceTarget = null;
      a.heading = Math.atan2(b.z - a.pos.z, b.x - a.pos.x);
      m.setPose(a, 'normal'); a.poseBlendTime = CONFIG.visuals.poseBlendSec;
    };
    place(golfer, b.clone().addScaledVector(face, -0.8));
    golfer.heading = Math.atan2(face.z, face.x);
    m.setPose(golfer, 'address'); golfer.poseBlendTime = CONFIG.visuals.poseBlendSec;
    // La testa del bastone appoggiata dietro la palla.
    const club = netContactPoint(golfer, m.time, 10);
    golfer.pos.x += b.x - club.x; golfer.pos.z += b.z - club.z; golfer.target.copy(golfer.pos);
    place(partner, b.clone().addScaledVector(dir, -5.5).addScaledVector(face, -2.4));
    place(caddie, b.clone().addScaledVector(dir, -2.6).addScaledVector(face, -2.6));
    // L'altro caddie aspetta laggiù, vicino al bunker del green.
    place(fore, this.spot('bunker', [0, 6]));
    place(m.referee, b.clone().addScaledVector(face, 9).addScaledVector(dir, -3));
    m.cuts++;
  }

  private afterShot() {
    const m = this.match, s = this.shot!, h = this.hole, golfer = this.golfer, partner = m.actors.find((a) => a !== golfer)!;
    this.shot = null;
    this.shooter = (1 - this.shooter) as TeamId;
    if (s.cup) {
      const diff = this.strokes - h.par;
      this.toPar += diff;
      this.results.push(diff);
      this.stage = 'holed';
      this.wait = 3.6;
      m.phase = 'reset';
      m.excitement = diff < 0 ? 1 : 0.6;
      m.sound(diff < 0 ? 'goal' : 'point', this.pin);
      // Par o meglio: la regia vuole l'esultanza (trigger "goal" degli eventi).
      if (diff <= 0) m.events.push({ type: 'goal', scorer: golfer, at: m.time });
      if (!partner.scripted) m.setPose(partner, diff <= 0 ? 'celebrate' : 'dejected', 2);
      return;
    }
    if (s.water) {
      this.strokes++; // un colpo di penalità, poi si droppa prima dell'acqua
      const back = s.from.clone().sub(s.land).setY(0).normalize(), p = s.land.clone();
      for (let k = 0; k < 150 && (lieAt(p.x, p.z) === 'water' || lieAt(p.x, p.z) === 'bunker'); k++) p.addScaledVector(back, 2);
      this.drop = p.addScaledVector(back, 3).setY(R());
    }
    const good = flatDist(s.rest, this.pin) < 3 && !s.water;
    if (!golfer.scripted) m.setPose(golfer, s.water || s.tree ? 'dejected' : good ? 'celebrate' : 'normal', 1.6);
    if (good) { m.sound('point', this.pin); m.excitement = Math.max(m.excitement, 0.5); }
    this.stage = 'walk';
    this.wait = G().restSec;
    m.phase = 'reset';
    m.ball.state = 'dead';
    // Si incamminano verso la palla (fino allo stacco).
    for (const a of [golfer, partner, m.coaches.find((c) => c.team === golfer.team)!]) {
      if (a.scripted) continue;
      a.target.copy(s.rest).addScaledVector(a.pos.clone().sub(s.rest).setY(0).normalize(), Math.min(flatDist(a.pos, s.rest), 6)).setY(0);
      a.speedLimit = CONFIG.match.walkSpeed;
    }
  }

  // ---------------------------------------------------------------- che colpo è

  private classify(): GolfNext {
    const h = this.hole, b = this.match.ball.pos, lie = lieAt(b.x, b.z), dist = flatDist(b, this.pin);
    const kind: GolfKind = lie === 'tee' && this.strokes === 0 ? (h.par === 3 ? 'tee3' : 'drive')
      : lie === 'green' ? 'putt'
      : lie === 'bunker' && dist < 45 ? 'bunker'
      : dist < 40 && lie !== 'bunker' ? 'chip'
      : dist > 200 ? 'wood' : 'approach';
    const s = nearestS(h, b.x, b.z);
    this.targets = { water: null, fairwayBunker: null, greenBunker: null, tree: null };
    if (kind === 'drive') {
      this.targets.fairwayBunker = h.bunkerPolys.filter((_, k) => {
        const c = h.bunkers[k].c, sc = nearestS(h, c[0], c[1]);
        return sc > s + 180 && sc < s + 280 && flatDist(v3(c), pointAt(h.line, h.lineS, sc)) < h.width + 12;
      })[0] ?? null;
      const p = pointAt(h.line, h.lineS, s + 225), d = pointAt(h.line, h.lineS, s + 227).sub(p).normalize();
      for (const side of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
        this.targets.tree ??= nearestTree(p.x - d.z * side * (h.width + 22), p.z + d.x * side * (h.width + 22), 22);
      }
      const pond = h.waterPolys.find((w) => { const sc = nearestS(h, (w.box[0] + w.box[2]) / 2, (w.box[1] + w.box[3]) / 2); return sc > s + 120 && sc < s + 290; });
      if (pond) this.targets.water = this.pointIn(pond);
    } else if (kind === 'tee3' || kind === 'approach' || kind === 'wood') {
      // Uno stagno vicino alla linea del colpo (verso la bandiera, o verso il lay-up dei par 5).
      const to = kind === 'wood' ? pointAt(h.line, h.lineS, h.length - 90) : this.pin;
      const seg = new THREE.Line3(b.clone().setY(0), to.clone().setY(0)), q = new THREE.Vector3();
      const pond = h.waterPolys.find((w) => { const c = this.center(w); seg.closestPointToPoint(c, true, q); return q.distanceTo(c) < 45 && flatDist(q, b) > 30; });
      if (pond) this.targets.water = this.pointIn(pond);
    }
    if (kind !== 'putt' && kind !== 'bunker') {
      this.targets.greenBunker = h.bunkerPolys.filter((_, k) => flatDist(v3(h.bunkers[k].c), this.pin) < 32)
        .sort((p, q) => flatDist(this.center(p), b) - flatDist(this.center(q), b))[0] ?? null;
    }
    return { kind, dist, water: !!this.targets.water, fairwayBunker: !!this.targets.fairwayBunker, greenBunker: !!this.targets.greenBunker, tree: !!this.targets.tree };
  }

  private center(p: Poly) { return new THREE.Vector3((p.box[0] + p.box[2]) / 2, 0, (p.box[1] + p.box[3]) / 2); }
  private pointIn(p: Poly) {
    const c = this.center(p), q = randomIn(p, Math.random, [c.x, c.z]);
    return (q ? v3(q) : c).setY(R());
  }

  /** Punto del fairway a distanza s lungo la linea, spostato di lat (frazione della mezza larghezza). */
  private fairwayPoint(s: number, lat: number) {
    const h = this.hole;
    for (let tries = 0; tries < 8; tries++, s -= 10) {
      const p = pointAt(h.line, h.lineS, s), d = pointAt(h.line, h.lineS, s + 2).sub(p).setY(0).normalize();
      for (const k of [lat, lat * 0.4, 0]) {
        const q = p.clone().add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(k * h.width));
        if (lieAt(q.x, q.z) === 'fairway') return q.setY(R());
      }
    }
    return pointAt(h.line, h.lineS, s).setY(R());
  }

  /** Punto del green fra dmin e dmax metri dalla buca (preferisce il lato da cui arriva la palla). */
  private nearPin(dmin: number, dmax: number) {
    const b = this.match.ball.pos, back = Math.atan2(b.z - this.pin.z, b.x - this.pin.x);
    for (let k = 0; k < 40; k++) {
      const a = back + rand(-1.8, 1.8) * (k < 20 ? 1 : 1.7), d = rand(dmin, dmax);
      const p = new THREE.Vector3(this.pin.x + Math.cos(a) * d, R(), this.pin.z + Math.sin(a) * d);
      if (lieAt(p.x, p.z) === 'green') return p;
    }
    return new THREE.Vector3(this.pin.x + Math.cos(back) * dmin, R(), this.pin.z + Math.sin(back) * dmin);
  }

  /** p se è sul green, altrimenti il primo punto sul green andando verso la buca. */
  private onGreen(p: THREE.Vector3) {
    const q = p.clone();
    for (let k = 0; k < 60 && lieAt(q.x, q.z) !== 'green'; k++) q.lerp(this.pin, 0.1);
    return q.setY(R());
  }

  // ---------------------------------------------------------------- il colpo

  private plan(action: SportAction): Shot {
    const T = G(), h = this.hole, kind = this.next.kind, r = R();
    const from = this.match.ball.pos.clone().setY(r), pin = this.pin.clone().setY(r);
    const dir = pin.clone().sub(from).setY(0).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
    const sgn = Math.random() < 0.5 ? -1 : 1;
    const s: Shot = {
      action, kind, from, land: pin.clone(), hop: pin.clone(), rest: pin.clone(), bend: null,
      t: 0, impact: kind === 'putt' ? T.puttImpact : T.impact, carry: T.carry[kind], apex: T.apex[kind],
      hopDur: HOP[kind][1], hopArc: HOP[kind][2], roll: 0,
      cup: false, water: false, tree: false, launched: false, landed: false, done: false, lipped: false,
    };
    /** Arriva sul green in rest, atterrando un po' prima lungo la linea del colpo. */
    const toGreen = (rest: THREE.Vector3, back: number) => {
      s.rest.copy(rest);
      const inDir = rest.clone().sub(from).setY(0).normalize();
      s.land.copy(this.onGreen(rest.clone().addScaledVector(inDir, -back)));
      s.hop.copy(s.land).addScaledVector(inDir, Math.min(HOP[kind][0], s.land.distanceTo(rest) * 0.5));
    };
    const plug = (p: THREE.Vector3) => { s.land.copy(p); s.hop.copy(p).addScaledVector(dir, 0.3); s.rest.copy(s.hop); s.hopArc = 0.05; };
    switch (action) {
      case 'drive': case 'layup': {
        const s0 = nearestS(h, from.x, from.z), lat = rand(-0.45, 0.45);
        const sLand = action === 'drive' ? Math.min(s0 + rand(235, 258), h.fairwayEnd - 35) : Math.max(s0 + 60, h.length - rand(78, 100));
        s.land.copy(this.fairwayPoint(sLand, lat));
        s.hop.copy(this.fairwayPoint(nearestS(h, s.land.x, s.land.z) + HOP[kind][0], lat));
        s.rest.copy(this.fairwayPoint(nearestS(h, s.hop.x, s.hop.z) + rand(6, 14), lat));
        break;
      }
      case 'driveBunker': case 'approachBunker': {
        const poly = action === 'driveBunker' ? this.targets.fairwayBunker : this.targets.greenBunker;
        plug(poly ? this.pointIn(poly) : pin);
        break;
      }
      case 'driveTree': {
        const tr = this.targets.tree!, base = new THREE.Vector3(tr.x, r, tr.z);
        const toLine = pointAt(h.line, h.lineS, nearestS(h, tr.x, tr.z)).setY(r).sub(base).normalize();
        s.tree = true;
        s.apex *= 0.55;
        s.land.copy(base).setY(tr.h * 0.6);
        s.hop.copy(base).addScaledVector(toLine, 2.5);
        s.hopDur = 0.75;
        s.rest.copy(s.hop).addScaledVector(toLine, 1.5);
        if (lieAt(s.rest.x, s.rest.z) !== 'rough') s.rest.copy(s.hop);
        break;
      }
      case 'driveWater': case 'approachWater': case 'layupWater':
        s.water = true;
        s.land.copy(this.targets.water ?? pin);
        s.hop.copy(s.land); s.rest.copy(s.land);
        break;
      case 'approach': toGreen(this.nearPin(3, 11), rand(1.5, 3.5)); break;
      case 'approachShort': {
        // Corto: si ferma prima del green (sul collare o nell'erba alta), poi tocca al chip.
        const q = pin.clone(), back = dir.clone().negate();
        for (let k = 0; k < 80 && lieAt(q.x, q.z) === 'green'; k++) q.addScaledVector(back, 1);
        q.addScaledVector(back, rand(1.5, 6));
        for (let k = 0; k < 30 && ['water', 'bunker'].includes(lieAt(q.x, q.z)); k++) q.addScaledVector(back, 2);
        s.rest.copy(q).setY(r);
        s.land.copy(q).addScaledVector(back, 2.5).setY(r);
        s.hop.copy(s.land).addScaledVector(dir, 1);
        break;
      }
      case 'approachClose': {
        // Atterra oltre la bandiera e torna indietro con l'effetto.
        s.rest.copy(this.nearPin(0.5, 1.1));
        s.land.copy(this.onGreen(pin.clone().addScaledVector(dir, rand(2.5, 4))));
        s.hop.copy(s.land).addScaledVector(dir, 0.8);
        s.hopArc = 0.3;
        break;
      }
      case 'ace': case 'chipIn': case 'bunkerIn':
        s.cup = true;
        toGreen(pin, kind === 'chip' ? flatDist(from, pin) * 0.55 : rand(2.5, 4));
        break;
      case 'chip': toGreen(this.nearPin(0.4, 1.3), flatDist(from, pin) * 0.5); break;
      case 'bunkerShot': toGreen(this.nearPin(0.8, 2.5), rand(1.5, 3)); break;
      case 'puttShort': case 'putt': case 'puttLong': case 'puttLag': case 'puttLip': {
        s.land.copy(from); s.hop.copy(from);
        s.roll = T.putt[action] ?? 2.6;
        const d = flatDist(from, pin);
        if (action === 'puttLag') {
          const p = pin.clone().addScaledVector(dir, rand(-0.9, 0.7)).addScaledVector(side, rand(-0.5, 0.5));
          const off = p.clone().sub(pin), len = THREE.MathUtils.clamp(off.length(), 0.4, 0.95);
          s.rest.copy(pin).add(off.setLength(len));
        } else if (action === 'puttLip') {
          s.rest.copy(pin).addScaledVector(dir, 0.32).addScaledVector(side, 0.22 * sgn);
          s.bend = pin.clone().addScaledVector(side, 0.12 * sgn).addScaledVector(dir, -0.2);
        } else s.cup = true;
        // La pendenza del green: la palla curva un po' (sempre dalla stessa parte).
        s.bend ??= from.clone().lerp(s.rest, 0.5).addScaledVector(side, d * 0.06 * sgn);
        return s;
      }
    }
    s.roll = Math.max(0.2, T.roll[kind] - s.hopDur);
    return s;
  }

  private fly(s: Shot, dt: number) {
    const m = this.match, b = m.ball, r = R(), prev = b.pos.clone();
    s.t += dt;
    if (s.t < s.impact) return;
    if (!s.launched) {
      s.launched = true;
      b.holder = null;
      b.state = s.kind === 'putt' ? 'loose' : 'flight';
      m.sound(s.kind === 'putt' ? 'putt' : s.kind === 'drive' || s.kind === 'wood' ? 'drive' : 'iron', s.from);
      const lie = lieAt(s.from.x, s.from.z);
      if (lie === 'bunker') { this.effect('sand', s.from); m.sound('sand', s.from); }
      else if (s.kind !== 'putt' && lie !== 'tee') this.effect('turf', s.from);
      const partner = m.actors.find((a) => a.team !== this.shooter);
      if ((s.tree || s.water) && partner) m.say(partner, 'fore');
    }
    const ft = s.t - s.impact;
    if (ft < s.carry) {
      const u = ft / s.carry, x = u + 0.6 * u * (1 - u);
      b.pos.lerpVectors(s.from, s.land, x);
      b.pos.y = r + (s.land.y - r) * u + s.apex * 4 * u * (1 - u);
    } else {
      if (!s.landed) { s.landed = true; this.onLand(s); }
      const rt = ft - s.carry;
      if (s.water) {
        b.pos.copy(s.land).setY(-0.6);
        if (rt > 0.8) s.done = true;
      } else if (rt < s.hopDur) {
        const u = rt / s.hopDur;
        b.state = 'loose';
        b.pos.lerpVectors(s.land, s.hop, u);
        b.pos.y = s.tree ? s.land.y + (r - s.land.y) * u * u : r + s.hopArc * 4 * u * (1 - u);
      } else {
        const u = Math.min(1, (rt - s.hopDur) / s.roll), f = 1 - (1 - u) ** 1.7;
        b.state = 'loose';
        if (s.bend) {
          // Curva di Bézier: dal punto di partenza, verso il controllo, fino al punto d'arrivo.
          const a = s.hop.clone().lerp(s.bend, f), c = s.bend.clone().lerp(s.rest, f);
          b.pos.copy(a.lerp(c, f));
        } else b.pos.lerpVectors(s.hop, s.rest, f);
        b.pos.y = r;
        if (s.action === 'puttLip' && !s.lipped && f > 0.7) { s.lipped = true; m.sound('cup', this.pin, 0.35); }
        if (u >= 1) {
          if (s.cup) { b.pos.copy(this.pin).setY(-0.12); m.sound('cup', this.pin); }
          b.state = 'dead';
          s.done = true;
        }
      }
    }
    b.vel.subVectors(b.pos, prev).divideScalar(Math.max(dt, 1e-3));
    b.spin += Math.min(3, prev.distanceTo(b.pos)) / r;
  }

  private onLand(s: Shot) {
    const m = this.match;
    if (s.kind === 'putt') return;
    if (s.water) { m.sound('splash', s.land); this.effect('splash', s.land); m.sound('ooh', s.land); return; }
    if (s.tree) { m.sound('tree', s.land); this.effect('leaves', s.land); m.sound('ooh', s.land); return; }
    const lie = lieAt(s.land.x, s.land.z);
    if (lie === 'bunker') { m.sound('sand', s.land); this.effect('sand', s.land); }
    else m.sound('land', s.land, lie === 'green' ? 0.5 : 0.8);
  }

  private effect(kind: Effect['kind'], at: THREE.Vector3) {
    this.effects.push({ kind, at: at.clone().setY(Math.max(0, at.y)), t: this.match.time });
    if (this.effects.length > 8) this.effects.shift();
  }
}
