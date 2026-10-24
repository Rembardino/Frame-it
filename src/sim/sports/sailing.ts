/**
 * VELA — regata di catamarani volanti, si riprende solo col drone. Quattro barche (due per squadra, due velisti
 * ciascuna): pre-partenza dietro la linea, colpo di partenza, bolina (si risale il vento virando), giro della boa
 * di bolina, poppa veloce fino al cancello, lasco finale fino all'arrivo. Il vento soffia da nord (verso +z).
 * Virate, voli sui foil, scuffie e partenza li decide la regia (events/sailing.ts). Numeri in CONFIG.sailing.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Actor, Match, TeamId } from '../match';
import type { Effect, SportAction, SportSimulation } from './types';
import { standardRoute, type Key, type Species } from '../fauna';
import { t } from '../../i18n';

const C = () => CONFIG.sailing;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Boe: partenza (barca giuria e boa), bolina, cancello di poppa, arrivo. */
export const MARKS = {
  committee: new THREE.Vector3(115, 0, 420), pin: new THREE.Vector3(-115, 0, 420),
  windward: new THREE.Vector3(0, 0, -380),
  gate: [new THREE.Vector3(-55, 0, 330), new THREE.Vector3(55, 0, 330)],
  finish: [new THREE.Vector3(520, 0, 250), new THREE.Vector3(520, 0, 350)],
};
/** Bolina: 45° dal vento (nord = −z). */
const UPWIND = [-Math.PI / 2 + 0.78, -Math.PI / 2 - 0.78];

export interface Boat {
  team: TeamId; crew: Actor[];
  /** rot = velocità di rotazione (rad/s): la rotta cambia con inerzia, non di colpo. */
  pos: THREE.Vector3; heading: number; v: number; rot: number;
  /** 0 pre-partenza, 1 bolina, 2 poppa, 3 lasco, 4 arrivata. */
  leg: number;
  /** Mura: 0 = verso est, 1 = verso ovest (in bolina). */
  tack: number;
  tackUntil: number; tackFrom: number;
  /** Lato dei velisti (−1..1, cambia durante la virata), sbandamento, altezza sui foil, gennaker aperto. */
  side: number; heel: number; lift: number; gennaker: number;
  capsizeUntil: number; boostUntil: number; lane: number; place: number;
}

export class SailingSimulation implements SportSimulation {
  readonly effects: Effect[] = [];
  readonly boats: Boat[];
  readonly pin = new THREE.Vector3();
  gunAt = Infinity;
  /** Voli sui foil chiesti dalla regia (al massimo tre a regata). */
  boosts = 0;
  private finishers = 0;
  private finishedAt = Infinity;

  constructor(private match: Match) {
    this.boats = [0, 1, 2, 3].map((k) => {
      const team = (k % 2) as TeamId, crew = match.actors.filter((a) => a.team === team).slice(Math.floor(k / 2) * 2, Math.floor(k / 2) * 2 + 2);
      return { team, crew, pos: new THREE.Vector3(-90 + k * 60, 0, 470 + (k % 2) * 20), heading: rand(-Math.PI, Math.PI), v: 6, rot: 0, leg: 0, tack: k % 2,
        tackUntil: 0, tackFrom: 0, side: 1, heel: 0, lift: 0, gennaker: 0, capsizeUntil: 0, boostUntil: 0, lane: rand(70, 120), place: 0 };
    });
    match.phase = 'play';
    match.ball.state = 'dead';
    // Arbitro e allenatori non servono: nascosti (altrimenti resterebbero in piedi in mezzo al mare).
    for (const a of [match.referee, ...match.coaches]) a.active = false;
    this.place(0);
  }

  get busy() { return false; }
  get lead() { return [...this.boats].sort((a, b) => this.progress(b) - this.progress(a))[0]; }
  get started() { return this.gunAt < Infinity; }
  get finished() { return this.finishers > 0; }
  boatOf(a: Actor) { return this.boats.find((b) => b.crew.includes(a)) ?? null; }
  /** Prossima boa (o la linea d'arrivo) di una barca. */
  target(b: Boat) {
    return b.leg <= 1 ? MARKS.windward : b.leg === 2 ? MARKS.gate[b.pos.x < 0 ? 0 : 1] : new THREE.Vector3(MARKS.finish[0].x, 0, b.pos.z);
  }
  distToTarget(b: Boat) { const t = this.target(b); return Math.hypot(t.x - b.pos.x, t.z - b.pos.z); }
  /** Avanzamento in regata (per la classifica). */
  progress(b: Boat) { return b.leg >= 4 ? 1e6 - b.place : b.leg * 10000 - this.distToTarget(b); }

  drives(a: Actor) { return this.boats.some((b) => b.crew.includes(a)); }
  leaders() { return this.lead.crew; }

  droneStart() { return { pos: new THREE.Vector3(0, 22, 560), look: new THREE.Vector3(0, 0, 440) }; }

  update(dt: number) {
    const m = this.match, time = m.time;
    if (m.isStopped) return;
    // Se la regia non ha dato il via, si parte comunque.
    if (!this.started && m.clock > 16) this.gun();
    for (const b of this.boats) this.sail(b, dt, time);
    if (time > this.finishedAt + 3) m.clock = Math.max(m.clock, CONFIG.match.durationSec);
    this.place(dt);
    const lead = this.lead;
    this.pin.copy(this.target(lead));
    m.ball.pos.set(lead.pos.x, -50, lead.pos.z);
  }

  private gun() {
    this.gunAt = this.match.time;
    this.match.sound('bell', MARKS.committee);
    for (const b of this.boats) { b.leg = 1; b.tack = b.pos.x > 0 ? 1 : 0; }
  }

  private sail(b: Boat, dt: number, time: number) {
    const c = C();
    let want = b.heading, speed = c.upwind;
    if (time < b.capsizeUntil) {
      b.v = Math.max(0, b.v - dt * 8);
      b.heel += (1.45 - b.heel) * Math.min(1, dt * 3);
      b.lift = 0; b.rot = 0;
      b.pos.addScaledVector(new THREE.Vector3(Math.cos(b.heading), 0, Math.sin(b.heading)), b.v * dt);
      return;
    }
    if (b.leg === 0) {
      // Pre-partenza: girano piano in tondo dietro la linea.
      want = b.heading + 0.25; speed = 6;
      const home = new THREE.Vector3(-90 + this.boats.indexOf(b) * 60, 0, 480);
      if (b.pos.distanceTo(home) > 50) want = Math.atan2(home.z - b.pos.z, home.x - b.pos.x);
    } else if (b.leg === 1) {
      const w = MARKS.windward, dx = b.pos.x - w.x, dz = b.pos.z - w.z;
      // Sulla layline (la boa entra nel cono dei 45°) si punta dritti alla boa; altrimenti si vira oltre la corsia.
      if (time > b.tackUntil) {
        const fetch = dz > 0 && Math.abs(dx) < dz * 0.95 && Math.sign(-dx) === (b.tack === 0 ? 1 : -1);
        if (!fetch && Math.abs(dx) > b.lane && Math.sign(dx) === (b.tack === 0 ? 1 : -1)) this.startTack(b, time);
        want = fetch ? Math.atan2(w.z - b.pos.z, w.x - b.pos.x) : UPWIND[b.tack];
      } else want = UPWIND[b.tack];
      // Girata la boa (o superata la sua altezza: non si va oltre).
      if (this.distToTarget(b) < 14 || b.pos.z < w.z + 4) { b.leg = 2; this.match.sound('point', w, 0.6); }
    } else if (b.leg === 2) {
      const g = this.target(b);
      want = Math.atan2(g.z - b.pos.z, g.x - b.pos.x); speed = c.downwind;
      if (this.distToTarget(b) < 12 || b.pos.z > g.z - 3) b.leg = 3;
    } else if (b.leg === 3) {
      want = 0; speed = c.reach;
      b.pos.z += (THREE.MathUtils.clamp(b.pos.z, 270, 330) - b.pos.z) * dt * 0.3;
      if (b.pos.x >= MARKS.finish[0].x) this.finish(b, time);
    } else {
      speed = 4; want = b.heading;
    }
    if (time < b.tackUntil) {
      // Virata: la prua passa nel vento, la barca rallenta, i velisti cambiano scafo.
      const u = 1 - (b.tackUntil - time) / c.tackSec;
      b.heading = b.tackFrom + wrap(UPWIND[b.tack] - b.tackFrom) * THREE.MathUtils.smoothstep(u, 0, 1);
      speed = 6; b.rot = 0;
      b.side = THREE.MathUtils.lerp(b.tack === 0 ? -1 : 1, b.tack === 0 ? 1 : -1, THREE.MathUtils.smoothstep(u, 0.2, 0.8));
    } else {
      // Il timone non gira di colpo: la rotazione cresce e cala piano (la barca ha peso).
      const rate = THREE.MathUtils.clamp(wrap(want - b.heading) * 1.4, -0.9, 0.9);
      b.rot += THREE.MathUtils.clamp(rate - b.rot, -dt * 1.5, dt * 1.5);
      b.heading += b.rot * dt;
      b.side = b.leg === 1 ? (b.tack === 0 ? 1 : -1) : 1;
    }
    if (time < b.boostUntil) speed += 6;
    b.v += THREE.MathUtils.clamp(speed - b.v, -dt * 4, dt * 3);
    b.pos.addScaledVector(new THREE.Vector3(Math.cos(b.heading), 0, Math.sin(b.heading)), b.v * dt);
    b.lift += (THREE.MathUtils.clamp((b.v - c.liftSpeed) / 4, 0, 1) * (time < b.boostUntil ? 2.2 : 1.3) - b.lift) * Math.min(1, dt * 2);
    b.heel += ((b.leg === 1 ? 0.08 : 0.04) * b.side - b.heel) * Math.min(1, dt * 2);
    b.gennaker += ((b.leg === 2 ? 1 : 0) - b.gennaker) * Math.min(1, dt * 1.5);
  }

  private startTack(b: Boat, time: number) {
    b.tackFrom = b.heading;
    b.tack = 1 - b.tack;
    b.tackUntil = time + C().tackSec;
    this.effect('spray', b.pos);
  }

  private finish(b: Boat, time: number) {
    b.leg = 4;
    b.place = ++this.finishers;
    this.match.sound(b.place === 1 ? 'goal' : 'point', b.pos);
    if (b.place > 1) return;
    this.finishedAt = time;
    this.match.score[b.team]++;
    this.match.excitement = 1;
    this.match.events.push({ type: 'goal', scorer: b.crew[0], at: time });
    for (const a of b.crew) this.match.setPose(a, 'celebrate', 4);
  }

  /** I velisti sugli scafi: timoniere a poppa, l'altro alle manovelle, sul lato al vento. */
  private place(dt: number) {
    for (const b of this.boats) {
      const f = new THREE.Vector3(Math.cos(b.heading), 0, Math.sin(b.heading)), n = new THREE.Vector3(-f.z, 0, f.x);
      const capsized = b.heel > 0.8, deck = capsized ? 0.1 : 0.9 + b.lift;
      b.crew.forEach((a, k) => {
        a.pos.copy(b.pos).addScaledVector(f, k ? -1.2 : -4).addScaledVector(n, b.side * (k ? 2.2 : 2.6) * (capsized ? 1.6 : 1)).setY(deck);
        a.target.copy(a.pos);
        a.vel.copy(f).multiplyScalar(b.v);
        a.heading = b.heading;
        a.runPhase += dt * 6;
        const pose = capsized ? 'fall' : b.leg >= 4 ? (a.pose === 'celebrate' ? 'celebrate' : 'normal') : k ? 'grind' : 'crouch';
        if (a.pose !== pose && a.pose !== 'celebrate') this.match.setPose(a, pose);
      });
    }
  }

  action(kind: SportAction, actor: Actor) {
    const m = this.match, b = this.boatOf(actor), time = m.time;
    if (kind === 'gun') { if (!this.started) this.gun(); return; }
    if (!b || b.leg === 0 || b.leg >= 4 || time < b.capsizeUntil) return;
    if (kind === 'tack' && b.leg === 1 && time > b.tackUntil) this.startTack(b, time);
    if (kind === 'foil') { this.boosts++; b.boostUntil = time + 3; this.effect('spray', b.pos); m.excitement = Math.max(m.excitement, 0.6); }
    if (kind === 'capsize') {
      b.capsizeUntil = time + 7;
      this.effect('splash', b.pos);
      m.sound('splash', b.pos);
      m.sound('ooh', b.pos);
      m.excitement = Math.max(m.excitement, 0.8);
    }
  }

  scoreText() {
    const order = [...this.boats].sort((a, b) => this.progress(b) - this.progress(a));
    const best = (team: TeamId) => order.findIndex((b) => b.team === team) + 1;
    return `${best(0)}° – ${best(1)}°`;
  }

  clockText() {
    const leg = this.lead.leg;
    return t(['PRE-PARTENZA', 'BOLINA', 'POPPA', 'LASCO FINALE', 'ARRIVO'][leg]);
  }

  spot(name: string, [a, b]: [number, number]) {
    const lead = this.lead, f = new THREE.Vector3(Math.cos(lead.heading), 0, Math.sin(lead.heading));
    const base = name === 'mark' ? this.target(lead).clone() : lead.pos.clone();
    return base.addScaledVector(f, a).add(new THREE.Vector3(-f.z * b, 0, f.x * b));
  }

  animalRoute(route: string, species: Species): Key[] {
    const lead = this.lead, f = new THREE.Vector3(Math.cos(lead.heading), 0, Math.sin(lead.heading));
    return standardRoute(route, lead.pos.clone().addScaledVector(f, species === 'whale' ? 120 : 45), f, 8);
  }

  /** Per i replay: posizione, rotta (continua, mai riportata tra ±π: si può interpolare), sbandamento, foil, gennaker. */
  capture() {
    return this.boats.flatMap((b) => [b.pos.x, b.pos.z, b.heading, b.heel, b.lift, b.gennaker]);
  }

  restore(s: number[]) {
    this.boats.forEach((b, i) => {
      const k = i * 6;
      b.pos.set(s[k], 0, s[k + 1]); b.heading = s[k + 2]; b.heel = s[k + 3]; b.lift = s[k + 4]; b.gennaker = s[k + 5];
    });
  }

  private effect(kind: Effect['kind'], at: THREE.Vector3) {
    this.effects.push({ kind, at: at.clone().setY(0.3), t: this.match.time });
    if (this.effects.length > 8) this.effects.shift();
  }
}
