/**
 * CICLISMO — si riprende solo col drone. Il gruppo (due squadre) affronta gli ultimi 2 km: curve, il paese
 * con lo strappo, il ponte, il bosco, la volata. Scatti, cadute, volata e tifosi li decide la regia
 * (events/cycling.ts); qui ogni corridore avanza lungo la strada (s = metri percorsi) con il suo posto nel gruppo.
 * Il gruppo regola il passo per arrivare al traguardo verso la fine della diretta. Numeri in CONFIG.cycling.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Actor, Match } from '../match';
import type { Effect, SportAction, SportSimulation } from './types';
import { BENDS, BRIDGE_S, FINISH_S, LENGTH, ROAD_HALF, VILLAGE, WOODS, roadAt, roadCurve, roadDir } from './cyclingRoute';
import { standardRoute, type Key, type Species } from '../fauna';
import { inside } from './shapes';
import { t } from '../../i18n';

const C = () => CONFIG.cycling;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
type Mode = 'pack' | 'attack' | 'crash' | 'chase' | 'sprint' | 'done';
/** jit = scarto fisso dal suo posto nel gruppo (avanti, di lato): il gruppo non è una griglia. */
interface Rider { a: Actor; s: number; lat: number; v: number; mode: Mode; slot: number; until: number; push: number; jit: [number, number]; lat0: number }

export class CyclingSimulation implements SportSimulation {
  readonly effects: Effect[] = [];
  /** Metri percorsi dalla testa del gruppo, e la sua velocità. */
  packS = 60;
  packV = 12;
  winner: Actor | null = null;
  private riders: Rider[];
  private catching = 0;
  /** Scatti fatti: al massimo due per tappa. */
  attacks = 0;
  private catchRate = 0;
  private fan: { a: Actor; rider: Rider; until: number } | null = null;
  private finishedAt = Infinity;

  constructor(private match: Match) {
    this.riders = match.actors.map((a, i) => ({ a, s: 0, lat: 0, v: this.packV, mode: 'pack', slot: i, until: 0, push: 0, jit: [rand(-0.25, 0.25), rand(-0.15, 0.15)], lat0: 0 }));
    // Posti nel gruppo mescolati: le due squadre pedalano insieme.
    this.riders.sort(() => Math.random() - 0.5).forEach((r, i) => { r.slot = i; r.s = this.slotS(r); r.lat = this.slotLat(r); });
    this.place(0);
    match.phase = 'play';
    // La palla non c'è: resta sotto terra, nel punto che si sta seguendo (per i momenti segreti in tribuna).
    match.ball.state = 'dead';
    // Arbitro e allenatori non servono: restano nascosti (altrimenti starebbero in mezzo a un campo).
    for (const a of [match.referee, ...match.coaches]) a.active = false;
  }

  get busy() { return false; }
  get breakaway() { return this.riders.find((r) => r.mode === 'attack') ?? null; }
  /** Distanza dalla testa del gruppo al traguardo. */
  get toFinish() { return FINISH_S - Math.max(...this.riders.map((r) => r.s)); }
  /** Quanto manca alla prossima curva stretta, al ponte, al paese (m; Infinity se già passati). */
  ahead(what: 'bend' | 'bridge' | 'village') {
    const lead = Math.max(...this.riders.filter((r) => r.mode !== 'crash').map((r) => r.s));
    const at = what === 'bend' ? BENDS.find((s) => s > lead) ?? Infinity : what === 'bridge' ? BRIDGE_S : VILLAGE[0];
    return at - lead > 0 ? at - lead : Infinity;
  }
  get inVillage() { return this.packS > VILLAGE[0] && this.packS < VILLAGE[1] - 60; }
  get nearWoods() { const p = roadAt(this.packS + 80); return WOODS.some((w) => inside(w, p.x + 40, p.z) || inside(w, p.x - 40, p.z) || inside(w, p.x, p.z + 40) || inside(w, p.x, p.z - 40)); }
  get finished() { return this.winner !== null; }

  drives(a: Actor) { return this.riders.some((r) => r.a === a); }
  leaders() { return [...this.riders].filter((r) => r.mode !== 'crash').sort((a, b) => b.s - a.s).slice(0, 3).map((r) => r.a); }

  droneStart() {
    const s = this.packS, d = roadDir(s);
    return { pos: roadAt(s - 22).add(new THREE.Vector3(-d.z * 9, 7, d.x * 9)), look: roadAt(s + 18) };
  }

  update(dt: number) {
    const m = this.match;
    if (m.isStopped) return;
    const time = m.time, c = C();
    // Il passo del gruppo: arrivare al traguardo poco prima della fine; nel paese c'è lo strappo.
    const left = Math.max(15, c.arriveSec - m.clock);
    let want = THREE.MathUtils.clamp((FINISH_S - this.packS) / left, c.packSpeed[0], c.packSpeed[1]);
    if (this.inVillage) want *= c.villageSlow;
    // Curva a gomito in arrivo: si frena prima e si rilancia all'uscita (accelerazione laterale massima bendGrip).
    let curve = 0;
    for (let k = -5; k <= 30; k += 5) curve = Math.max(curve, Math.abs(roadCurve(this.packS + k)));
    want = Math.min(want, Math.max(c.packSpeed[0] - 1, Math.sqrt(c.bendGrip / Math.max(curve, 1e-4))));
    // Il gruppo che va a riprendere la fuga accelera.
    if (this.catching > time) want += this.catchRate * 0.6;
    const quick = want < this.packV || this.catching > time;
    if (!this.riders.some((r) => r.mode === 'sprint')) this.packV += (want - this.packV) * Math.min(1, dt * (quick ? 1.2 : 0.6));
    if (!this.winner) this.packS += this.packV * dt;
    const down = this.riders.filter((r) => r.mode === 'crash');
    for (const r of this.riders) this.ride(r, dt, time, down);
    if (this.fan) this.runAlong(time);
    // Il primo che passa lo striscione vince: la regia vuole l'esultanza (trigger "goal").
    const first = this.riders.filter((r) => r.s >= FINISH_S).sort((a, b) => b.s - a.s)[0];
    if (first && !this.winner) {
      this.winner = first.a;
      this.finishedAt = time;
      m.score[first.a.team]++;
      m.sound('goal', first.a.pos);
      m.excitement = 1;
      m.events.push({ type: 'goal', scorer: first.a, at: time });
      for (const r of this.riders) r.mode = 'done';
    }
    if (time > this.finishedAt + 3) m.clock = Math.max(m.clock, CONFIG.match.durationSec);
    this.place(dt);
  }

  /** Posto nel gruppo: file da tre, sfalsate, ognuno col suo scarto e un lento andare e venire. */
  private slotS(r: Rider) {
    return this.packS - Math.floor(r.slot / 3) * 2.2 - (r.slot % 3) * 0.4 + r.jit[0] + Math.sin(this.match.time * 0.23 + r.slot * 1.7) * 0.3;
  }
  private slotLat(r: Rider) {
    return ((r.slot % 3) - 1) * 1.05 + (Math.floor(r.slot / 3) % 2) * 0.5 + r.jit[1] + Math.sin(this.match.time * 0.31 + r.slot * 2.3) * 0.2;
  }

  private ride(r: Rider, dt: number, time: number, down: Rider[]) {
    const c = C();
    // Ognuno ha il suo peso: la velocità voluta si raggiunge con accelerazione e frenata limitate (m/s²).
    let want = r.v, accel = c.accel, brake = c.brake;
    switch (r.mode) {
      case 'pack': {
        const gap = this.slotS(r) - r.s;
        want = this.packV + THREE.MathUtils.clamp(gap * 0.7, -2, 3);
        // Chi ha davanti un corridore a terra lo scansa.
        let lat = this.slotLat(r);
        for (const d of down) {
          if (d.s - r.s > -1 && d.s - r.s < 9 && Math.abs(lat - d.lat) < 1.4) lat = d.lat + (lat > d.lat || d.lat < -ROAD_HALF + 1.5 ? 1.5 : -1.5);
        }
        r.lat += (THREE.MathUtils.clamp(lat, -ROAD_HALF + 0.5, ROAD_HALF - 0.5) - r.lat) * Math.min(1, dt * 1.5);
        break;
      }
      case 'attack': {
        // Scatta, poi tiene il vantaggio; se il gruppo accelera per riprenderlo, cede.
        const gap = r.s - this.packS;
        want = this.catching > time ? this.packV - this.catchRate : gap < c.attackGap ? this.packV + c.attackBoost : this.packV + 0.2;
        accel = c.accel * 1.6;
        r.lat += (-ROAD_HALF * 0.6 - r.lat) * Math.min(1, dt);
        if (this.catching > time && gap < 3) { r.mode = 'pack'; this.match.setPose(r.a, 'dejected', 1.5); }
        break;
      }
      case 'crash':
        // Scivola sull'asfalto e si ferma; poi si rialza e insegue.
        want = 0; brake = 9;
        if (time > r.until) { r.mode = 'chase'; this.match.setPose(r.a, 'sprint', 2.5); }
        break;
      case 'chase':
        want = this.packV + 3.5;
        if (r.s >= this.slotS(r) - 1) r.mode = 'pack';
        break;
      case 'sprint':
        // Velocità di volata (push), raggiunta con sprintAccel (vedi action 'sprintFinish').
        want = r.push; accel = c.sprintAccel;
        r.lat += (((r.slot % 5) - 2) * 1.2 - r.lat) * Math.min(1, dt);
        break;
      case 'done':
        // Dopo il traguardo si rialzano e frenano prima della fine della strada.
        want = Math.min(r.v, (LENGTH - 2 - r.s) * 0.6); brake = 4;
        if (r.a === this.winner && r.a.pose !== 'celebrate' && r.a.poseTime > 0.5 && time - this.finishedAt < 4) this.match.setPose(r.a, 'celebrate', 3.5);
        break;
    }
    r.v = Math.max(0, r.v + THREE.MathUtils.clamp(want - r.v, -brake * dt, accel * dt));
    r.s = Math.min(LENGTH - 1, r.s + r.v * dt);
  }

  private place(dt: number) {
    let cx = 0, cz = 0, n = 0;
    for (const r of this.riders) {
      const a = r.a, p = roadAt(r.s), d = roadDir(r.s);
      a.pos.set(p.x - d.z * r.lat, 0, p.z + d.x * r.lat);
      a.target.copy(a.pos);
      a.vel.copy(d).multiplyScalar(r.v);
      // Chi si sposta di lato sterza verso dove va (non scivola di fianco).
      if (r.mode !== 'crash') a.heading = Math.atan2(d.z, d.x) + (dt > 0 ? Math.atan2((r.lat - r.lat0) / dt, Math.max(1, r.v)) : 0);
      r.lat0 = r.lat;
      // Pedalata (fase delle gambe) e piega in curva (poseDir, la usano bici e corpo).
      a.runPhase += r.v * dt * 0.9;
      // Piega fisica (tan = v²/(g·R)), che entra ed esce morbida.
      if (r.mode !== 'crash') a.poseDir += (THREE.MathUtils.clamp(Math.atan((r.v * r.v * roadCurve(r.s)) / 9.8), -0.5, 0.5) - a.poseDir) * Math.min(1, dt * 5);
      if (r.mode !== 'crash') { cx += a.pos.x; cz += a.pos.z; n++; }
    }
    this.match.ball.pos.set(cx / Math.max(1, n), -50, cz / Math.max(1, n));
  }

  action(kind: SportAction, actor: Actor, target?: Actor) {
    const m = this.match, r = this.riders.find((x) => x.a === actor), time = m.time;
    switch (kind) {
      case 'attack':
        if (!r || r.mode !== 'pack' || this.breakaway) return;
        r.mode = 'attack';
        this.attacks++;
        m.setPose(actor, 'sprint', 3);
        m.excitement = Math.max(m.excitement, 0.6);
        break;
      case 'catch': {
        // Il gruppo lo riprende in 4,5 secondi.
        const b = this.breakaway;
        if (b) { this.catching = time + 6; this.catchRate = Math.max(0.5, (b.s - this.packS) / 3.6); }
        break;
      }
      case 'crash': {
        if (!r || r.mode === 'crash') return;
        // Cade lui e chi gli sta subito dietro.
        const behind = this.riders.filter((x) => x !== r && x.mode === 'pack' && x.s < r.s && r.s - x.s < 5).sort((p, q) => q.s - p.s)[0];
        for (const x of [r, behind]) {
          if (!x) continue;
          x.mode = 'crash'; x.until = time + 4;
          x.a.poseDir = Math.random() < 0.5 ? 1.2 : -1.2;
          m.setPose(x.a, 'fall', 3.6);
          this.effect('dust', x.a.pos);
        }
        m.sound('punch', actor.pos, 0.8);
        m.sound('ooh', actor.pos);
        m.excitement = Math.max(m.excitement, 0.7);
        break;
      }
      case 'sprintFinish': {
        // Volata: chi la vince arriva allo striscione dopo sprintSec secondi esatti (l'istante decisivo dell'evento).
        // Si accelera con sprintAccel fino a push e poi la si tiene: push risolve v0·T + x·T − x²/(2a) = D, con x = push − v0.
        const T = C().sprintSec, acc = C().sprintAccel;
        for (const x of this.riders) {
          if (x.mode === 'crash') continue;
          x.mode = 'sprint';
          const D = FINISH_S + 0.5 - x.s, disc = T * T - (2 * (D - x.v * T)) / acc;
          // push = velocità della volata: gli altri arrivano un po' dopo.
          x.push = x.v + (disc > 0 ? acc * (T - Math.sqrt(disc)) : (D - x.v * T) / T) - (x === r ? 0 : rand(0.4, 2.5));
          m.setPose(x.a, 'sprint', 30);
        }
        m.excitement = 1;
        break;
      }
      case 'runAlong':
        // Il tifoso corre accanto al corridore per qualche secondo, sbracciandosi.
        if (target) this.fan = { a: actor, rider: this.riders.find((x) => x.a === target)!, until: time + 5.5 };
        m.setPose(actor, 'wave', 5.5);
        break;
    }
  }

  private runAlong(time: number) {
    const f = this.fan!, d = roadDir(f.rider.s), side = new THREE.Vector3(-d.z, 0, d.x);
    if (time < f.until) f.a.target.copy(f.rider.a.pos).addScaledVector(side, ROAD_HALF * 0.9).addScaledVector(d, 1.2);
    else { f.a.target.copy(f.a.pos).addScaledVector(side, 8); this.fan = null; }
    f.a.speedLimit = CONFIG.match.sprintSpeed;
  }

  scoreText() {
    if (this.winner) return `${CONFIG.teams[this.winner.team].short} 1°`;
    const b = this.breakaway;
    return b ? `+${Math.max(0, Math.round((b.s - this.packS) / Math.max(1, this.packV)))}"` : t('GRUPPO');
  }

  clockText() {
    return this.winner ? t('ARRIVO') : t('{km} KM ALL’ARRIVO', { km: (Math.max(0, this.toFinish) / 1000).toFixed(1).replace('.', ',') });
  }

  /** 'ahead' = davanti al gruppo, 'finish' = lo striscione. Scarto [avanti, di lato]. */
  spot(name: string, [a, b]: [number, number]) {
    const s = name === 'finish' ? FINISH_S : this.packS + 12, p = roadAt(s + a), d = roadDir(s + a);
    return p.add(new THREE.Vector3(-d.z * b, 0, d.x * b));
  }

  animalRoute(route: string, species: Species): Key[] {
    const s = this.packS + (species === 'dog' ? 55 : 90), half = route === 'graze' ? ROAD_HALF + 20 : ROAD_HALF + 1;
    return standardRoute(route, roadAt(s), roadDir(s), half);
  }

  private effect(kind: Effect['kind'], at: THREE.Vector3) {
    this.effects.push({ kind, at: at.clone().setY(0.2), t: this.match.time });
    if (this.effects.length > 8) this.effects.shift();
  }
}

