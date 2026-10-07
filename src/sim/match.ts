/**
 * Stato della partita e "gioco di sottofondo" automatico.
 * Nessuna grafica qui: solo posizioni, velocità, possesso palla. Il renderer legge questo stato.
 *
 * Non è una vera simulazione del calcio: il gioco automatico (passaggi, pressing) riempie il tempo,
 * mentre i momenti importanti (tiri, falli, cadute...) li mette in scena l'Event Director usando
 * le primitive "da copione" qui sotto: scriptPass, shoot, setPose, stopPlay, restartPlay.
 * Un attore con scripted = true è guidato dall'evento e ignorato dall'IA di sottofondo.
 *
 * Coordinate: x lungo il campo, z lungo la larghezza, y in alto. La camera sta a z positivo.
 * La squadra 0 attacca verso +x, la squadra 1 verso -x.
 */
import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import { TennisSimulation } from './sports/tennis';
import { VolleyballSimulation } from './sports/volleyball';
import { BoxingSimulation } from './sports/boxing';
import type { SportSimulation } from './sports/types';

export type TeamId = 0 | 1;
/** ref = arbitro, coach = allenatore a bordo campo; fan e steward compaiono solo durante l'invasione. */
export type Role = 'gk' | 'def' | 'mid' | 'fwd' | 'ref' | 'coach' | 'fan' | 'steward';
/** windUp = rallenta e carica la gamba prima di passare o tirare; kick = il calcio vero e proprio. */
export type Pose =
  | 'normal' | 'dive' | 'celebrate' | 'dejected' | 'fall' | 'tackle' | 'stumble'
  | 'protest' | 'argue' | 'shove' | 'card' | 'windUp' | 'kick' | 'crouch' | 'wave'
  /** Basket: tiro in sospensione e passaggio a due mani. */
  | 'shoot' | 'throw' | 'racket' | 'backhand' | 'serve' | 'receive' | 'set' | 'spike' | 'block'
  | 'guard' | 'jab' | 'hook' | 'uppercut' | 'recoil';
export type MatchPhase = 'play' | 'goal' | 'reset' | 'dead';
export type ShotOutcome = 'goal' | 'save' | 'wide';

/** Effetti speciali (eventi rari). Per aggiungerne uno: nome qui, stato in Match.sky, disegno in render/skyEffects.ts. */
export type EffectName = 'shootingStar';

/** Fatti della partita letti dall'Event Director. */
export type MatchEvent = { type: 'goal'; scorer: Actor; at: number };

export interface Actor {
  id: number;
  team: TeamId;
  role: Role;
  /** Gli extra (tifoso, steward) esistono sempre ma sono visibili solo quando attivi. */
  active: boolean;
  /** Guidato da un evento: l'IA di sottofondo non lo tocca. */
  scripted: boolean;
  /** Posizione di formazione, nel sistema "attacco verso +x". */
  base: { x: number; z: number };
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  /** Direzione in cui guarda (radianti, 0 = +x). */
  heading: number;
  speedLimit: number;
  /** Fase del passo di corsa, per l'animazione. */
  runPhase: number;
  pose: Pose;
  poseTime: number;
  /** Durata della posa (s), poi torna 'normal'. */
  poseDur: number;
  /** Lato del tuffo del portiere (segno lungo z del mondo). */
  poseDir: number;
  /** Da fermo guarda questo attore invece della palla. */
  faceTarget: Actor | null;
  seed: number;
}

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  /** Altezza massima della parabola. */
  arc: number;
  /** rest = la palla arriva e resta ferma (in rete, fuori, al centro). */
  kind: 'pass' | 'shot' | 'rest';
  kicker: Actor | null;
  receiver: Actor | null;
  shot: ShotOutcome | null;
}

export interface Ball {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  state: 'held' | 'flight' | 'loose' | 'dead';
  holder: Actor | null;
  /** Il portiere la tiene in mano. */
  inHands: boolean;
  flight: Flight | null;
  /** Rotazione accumulata, solo per la grafica. */
  spin: number;
}

const L = CONFIG.pitch.length;
const W = CONFIG.pitch.width;
const GW = CONFIG.pitch.goalWidth / 2;
const M = CONFIG.match;
const P = CONFIG.pitch;
const BASKET = SPORT === 'basket';
export const BALL_RADIUS = CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale;
/** Basket: x del ferro attaccato da chi attacca verso d. */
const hoopX = (d: number) => d * (L / 2 - P.hoopFromBaseline);
/** Dove aspettano gli extra quando non servono (fuori dallo stadio). */
const PARKING = new THREE.Vector3(0, 0, -80);
/** Pose durante le quali l'attore non corre (scivola o sta a terra). */
const LOCKED: Pose[] = ['dive', 'fall', 'tackle'];

/** Calcio a 7: 1-3-2-1. Metri su un campo 60x40, scalati sulla dimensione reale. */
const FORMATION: { role: Role; x: number; z: number }[] = SPORT === 'tennis' || SPORT === 'boxe'
  ? [{ role: 'fwd', x: 0, z: 0 }]
  : SPORT === 'pallavolo'
  ? [{ role: 'fwd', x: 0, z: 0 }, { role: 'mid', x: 0, z: 0 }, { role: 'fwd', x: 0, z: 0 },
    { role: 'def', x: 0, z: 0 }, { role: 'def', x: 0, z: 0 }, { role: 'def', x: 0, z: 0 }]
  : BASKET
  ? [
    // Basket: posizioni d'attacco, in metri dalla linea di fondo attaccata (x) e laterali (z).
    // mid = playmaker, fwd = ali, def = lunghi (sotto canestro).
    { role: 'mid', x: 8.5, z: 0 },
    { role: 'fwd', x: 5.5, z: -5.2 },
    { role: 'fwd', x: 5.5, z: 5.2 },
    { role: 'def', x: 2.2, z: -2.6 },
    { role: 'def', x: 2.8, z: 2.6 },
  ]
  : [
    { role: 'gk', x: -27, z: 0 },
    { role: 'def', x: -18, z: -10 },
    { role: 'def', x: -19, z: 0 },
    { role: 'def', x: -18, z: 10 },
    { role: 'mid', x: -9, z: -7 },
    { role: 'mid', x: -9, z: 7 },
    { role: 'fwd', x: -2, z: 0 },
  ];
const TEAM_SIZE = FORMATION.length;

const clamp = THREE.MathUtils.clamp;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Verso di attacco della squadra lungo x: +1 o -1. */
export const dirOf = (t: TeamId) => (t === 0 ? 1 : -1);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const xzDist = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
const tmp = new THREE.Vector3();

export function clampToPitch(v: THREE.Vector3, margin: number) {
  v.x = clamp(v.x, -L / 2 + margin, L / 2 - margin);
  v.z = clamp(v.z, -W / 2 + margin, W / 2 - margin);
  return v;
}

function makeActor(id: number, team: TeamId, role: Role, base = { x: 0, z: 0 }): Actor {
  return {
    id, team, role, base,
    active: true,
    scripted: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    target: new THREE.Vector3(),
    heading: team === 0 ? 0 : Math.PI,
    speedLimit: M.runSpeed,
    runPhase: Math.random() * 10,
    pose: 'normal',
    poseTime: 0,
    poseDur: Infinity,
    poseDir: 0,
    faceTarget: null,
    seed: Math.random() * 100,
  };
}

export class Match {
  readonly sportSimulation: SportSimulation | null;
  /** I 14 giocatori. */
  readonly actors: Actor[] = [];
  /** Arbitro, allenatori, tifoso, steward. */
  readonly extras: Actor[] = [];
  readonly referee: Actor;
  readonly coaches: Actor[] = [];
  readonly ball: Ball = {
    pos: new THREE.Vector3(0, BALL_RADIUS, 0),
    vel: new THREE.Vector3(),
    state: 'dead',
    holder: null,
    inHands: false,
    flight: null,
    spin: 0,
  };
  score: [number, number] = [0, 0];
  /** Orologio della partita (s): scorre sempre, anche durante falli ed esultanze, come nel calcio vero. */
  clock = 0;
  phase: MatchPhase = 'play';
  /** 0..1: quanto è eccitato il pubblico. */
  excitement = 0;
  /** Tempo totale trascorso (s), base dei tempi dei momenti. */
  time = 0;
  /** Coda di eventi: chi la legge la svuota. */
  readonly events: MatchEvent[] = [];
  /** La palla la gestisce un evento: niente decisioni automatiche, contrasti, intercetti. */
  ballScripted = false;
  /** Cielo: stella cadente. from/to sono decisi quando l'evento parte, così il pubblico sa già dove guardare. */
  readonly sky = { star: { planned: false, active: false, t: 0, dur: 1.3, from: new THREE.Vector3(), to: new THREE.Vector3() } };

  private phaseTime = 0;
  private possession: TeamId = 0;
  private holdTimer = 0;
  private kickoffTeam: TeamId = 0;
  private scorer: Actor | null = null;
  private celebrateSpot = new THREE.Vector3();
  private deadDelay = 0;
  private onDeadEnd: (() => void) | null = null;
  /** Dopo un fischio: chi va a battere la punizione. */
  private restartTaker: Actor | null = null;
  /** Basket: quanto vale il tiro in volo (2 o 3). */
  private shotPoints = 2;

  constructor() {
    let id = 0;
    const sx = BASKET ? 1 : L / 60;
    const sz = BASKET ? 1 : W / 40;
    for (const team of [0, 1] as TeamId[]) {
      for (const f of FORMATION) this.actors.push(makeActor(id++, team, f.role, { x: f.x * sx, z: f.z * sz }));
    }
    for (const a of this.actors) a.pos.copy(this.kickoffSpot(a, 0));

    this.referee = makeActor(id++, 0, 'ref');
    this.referee.pos.set(-4, 0, -8);
    this.extras.push(this.referee);
    // Allenatori nell'area tecnica, sul lato lontano dalla camera.
    for (const team of [0, 1] as TeamId[]) {
      const c = makeActor(id++, team, 'coach', { x: (team === 0 ? -7 : 7) * (L / 60), z: -(W / 2 + 1.8) });
      c.pos.set(c.base.x, 0, c.base.z);
      this.coaches.push(c);
      this.extras.push(c);
    }
    for (const role of ['fan', 'steward', 'steward'] as Role[]) {
      const a = makeActor(id++, 0, role);
      a.active = false;
      a.pos.copy(PARKING);
      this.extras.push(a);
    }
    this.sportSimulation = SPORT === 'tennis' ? new TennisSimulation(this)
      : SPORT === 'pallavolo' ? new VolleyballSimulation(this)
      : SPORT === 'boxe' ? new BoxingSimulation(this) : null;
    if (!this.sportSimulation) this.kickoff(0);
    else {
      this.referee.pos.set(0, 0, -(W / 2 + 1));
      this.referee.target.copy(this.referee.pos);
    }
  }

  /** Giocatori + extra attivi. */
  get everyone() {
    return [...this.actors, ...this.extras.filter((e) => e.active)];
  }

  update(dt: number) {
    this.time += dt;
    this.phaseTime += dt;
    this.excitement = Math.max(0, this.excitement - dt * 0.2);
    this.clock += dt;

    if (this.sportSimulation) {
      this.sportSimulation.update(dt);
      this.updateCoaches();
      const star = this.sky.star;
      if (star.active && (star.t += dt) >= star.dur) star.active = false;
      this.moveActors(dt);
      return;
    }

    switch (this.phase) {
      case 'play':
        this.updatePlay(dt);
        break;
      case 'goal':
        if (BASKET) {
          // Niente festa lunga: tutti tornano in difesa/attacco, poi rimessa dal fondo.
          this.updateFormation();
          if (this.phaseTime > M.celebrateSec) {
            this.setPhase('dead');
            this.deadDelay = Infinity;
            this.restartTaker = this.nearest(this.ball.pos, (a) => a.team === this.kickoffTeam);
          }
          break;
        }
        this.updateCelebration();
        if (this.phaseTime > M.celebrateSec) this.startReset();
        break;
      case 'reset':
        for (const a of this.actors) {
          a.target.copy(this.kickoffSpot(a, this.kickoffTeam));
          a.speedLimit = M.runSpeed * 0.8;
        }
        if (this.phaseTime > M.resetSec && this.ball.state === 'dead') this.kickoff(this.kickoffTeam);
        break;
      case 'dead':
        this.updateFormation();
        if (this.restartTaker) {
          const t = this.restartTaker;
          t.target.copy(this.ball.pos).setY(0);
          t.speedLimit = M.runSpeed;
          if (xzDist(t.pos, this.ball.pos) < 1) {
            this.restartTaker = null;
            this.setPhase('play');
            this.giveBall(t, 0.8);
          }
        } else if (this.phaseTime > this.deadDelay) {
          const next = this.onDeadEnd;
          this.onDeadEnd = null;
          this.setPhase('play');
          next?.();
        }
        break;
    }
    this.updateReferee();
    this.updateCoaches();
    const star = this.sky.star;
    if (star.active && (star.t += dt) >= star.dur) star.active = false;
    this.updateBall(dt);
    this.moveActors(dt);
  }

  // ---------------------------------------------------------------- primitive per gli eventi

  /** Passaggio da copione: arriva sempre al ricevitore, che va incontro al pallone. */
  scriptPass(from: Actor, to: Actor): boolean {
    const b = this.ball;
    if (b.holder !== from) return false;
    const speed = M.passSpeed * 1.2;
    const target = to.pos.clone().addScaledVector(to.vel, xzDist(from.pos, to.pos) / speed);
    clampToPitch(target, 1).setY(BASKET ? 1.2 : BALL_RADIUS);
    const dist = xzDist(target, b.pos);
    this.launch(target, dist / speed, dist > 22 ? dist * 0.12 : BASKET ? 0.3 + dist * 0.06 : 0.15, 'pass', from, to);
    to.target.copy(target).setY(0);
    return true;
  }

  /** Imposta una posa per dur secondi. Cadere o entrare in scivolata fa perdere la palla. */
  setPose(a: Actor, pose: Pose, dur = Infinity, face: Actor | null = null) {
    a.pose = pose;
    a.poseTime = 0;
    a.poseDur = dur;
    a.faceTarget = face;
    if (pose === 'tackle') a.vel.set(Math.cos(a.heading) * 7, 0, Math.sin(a.heading) * 7);
    if ((pose === 'fall' || pose === 'tackle') && this.ball.holder === a) this.looseBall(3, a.heading);
  }

  /** Fischio: gioco fermo finché un evento non chiama restartPlay(). */
  stopPlay() {
    if (this.phase !== 'play') return;
    const b = this.ball;
    b.pos.y = BALL_RADIUS;
    b.state = 'dead';
    b.holder = null;
    b.flight = null;
    b.inHands = false;
    b.vel.set(0, 0, 0);
    this.deadBall(Infinity, () => {});
  }

  /** Riprende il gioco: il giocatore libero più vicino della squadra va sul pallone e riparte. */
  restartPlay(team: TeamId) {
    if (this.phase !== 'dead' || this.deadDelay !== Infinity) return;
    this.restartTaker =
      this.nearest(this.ball.pos, (a) => a.team === team && a.role !== 'gk' && !a.scripted) ??
      this.nearest(this.ball.pos, (a) => a.team === team && a.role !== 'gk');
  }

  /** Prepara un effetto (all'inizio dell'evento): sceglie dove apparirà. */
  prepareEffect(e: EffectName) {
    if (e !== 'shootingStar') return;
    // In un punto del cielo visibile dalla camera, non per forza dove stai guardando.
    const c = CONFIG.camera.position;
    const az = rand(-55, 55) * (Math.PI / 180);
    const el = rand(22, 36) * (Math.PI / 180);
    const sweep = (Math.random() < 0.5 ? -1 : 1) * 0.38;
    const at = (a: number, e2: number) => new THREE.Vector3(c.x + Math.sin(a) * Math.cos(e2) * 300, c.y + Math.sin(e2) * 300, c.z - Math.cos(a) * Math.cos(e2) * 300);
    const s = this.sky.star;
    s.from.copy(at(az, el));
    s.to.copy(at(az + sweep, el - 0.14));
    s.planned = true;
  }

  startEffect(e: EffectName) {
    if (e === 'shootingStar') Object.assign(this.sky.star, { active: true, t: 0 });
  }

  /** Testa e coda della stella (anche prima che appaia: punta a dove apparirà). */
  starPoints() {
    const s = this.sky.star;
    const u = clamp(s.t / s.dur, 0, 1);
    return { head: s.from.clone().lerp(s.to, u), tail: s.from.clone().lerp(s.to, Math.max(0, u - 0.3)) };
  }

  /** Triplice fischio: gioco fermo per sempre. */
  endMatch() {
    this.stopPlay();
    this.restartTaker = null;
    if (this.sportSimulation) this.everyone.forEach((a) => { a.target.copy(a.pos); a.vel.set(0, 0, 0); });
    this.setPose(this.referee, 'card', 2);
  }

  get isStopped() {
    return this.phase === 'dead' && this.deadDelay === Infinity;
  }

  /** Tiro verso la porta avversaria. Senza esito indicato lo sceglie a caso coi pesi di CONFIG. */
  shoot(h: Actor, outcome?: ShotOutcome) {
    this.ballScripted = false; // da qui in poi decide la fisica: gol, parata o fuori
    if (BASKET) return this.shootHoop(h, outcome ?? (Math.random() < 0.5 ? 'goal' : 'save'));
    const d = dirOf(h.team);
    const gk = this.actors.find((a) => a.team !== h.team && a.role === 'gk')!;
    const gh = CONFIG.pitch.goalHeight;
    if (!outcome) {
      const o = M.shotOutcome;
      const r = Math.random() * (o.goal + o.save + o.wide);
      outcome = r < o.goal ? 'goal' : r < o.goal + o.save ? 'save' : 'wide';
    }
    const side = Math.random() < 0.5 ? -1 : 1;

    let tz: number, ty: number, reach: number;
    if (outcome === 'goal') {
      tz = side * rand(GW * 0.4, GW - 0.35);
      ty = rand(0.3, gh - 0.3);
      // Tuffo corto, a volte dalla parte sbagliata.
      reach = gk.pos.z + Math.sign(tz - gk.pos.z) * (Math.random() < 0.35 ? -0.8 : 0.6);
    } else if (outcome === 'save') {
      tz = clamp(gk.pos.z + rand(-2, 2), -GW + 0.4, GW - 0.4);
      ty = rand(0.3, 1.6);
      reach = tz;
    } else {
      tz = side * rand(GW + 0.5, GW + 3);
      ty = rand(0.2, 3.2);
      reach = gk.pos.z + side * 0.8;
    }

    const to = new THREE.Vector3(d * L / 2, ty, tz);
    this.launch(to, xzDist(to, this.ball.pos) / M.shotSpeed, 0.3, 'shot', h, null);
    this.ball.flight!.shot = outcome;

    gk.scripted = false;
    this.setPose(gk, 'dive', 1.4);
    gk.poseTime = -0.15; // tempo di reazione
    gk.poseDir = Math.sign(reach - gk.pos.z) || 1;
    gk.target.set(gk.pos.x, 0, reach);
    this.excitement = Math.max(this.excitement, 0.6);
  }

  /** Basket: goal = canestro, save = sul ferro, wide = sul tabellone. Il rimbalzo lo prende chi è vicino. */
  private shootHoop(h: Actor, outcome: ShotOutcome) {
    const d = dirOf(h.team);
    const b = this.ball;
    const hoop = new THREE.Vector3(hoopX(d), P.rimHeight, 0);
    const dist = xzDist(h.pos, hoop);
    this.shotPoints = dist > P.threePoint - 0.15 ? 3 : 2;
    const side = Math.random() < 0.5 ? -1 : 1;
    const to = hoop.clone().setY(P.rimHeight + 0.1);
    if (outcome === 'save') to.set(hoop.x - d * 0.22, P.rimHeight + 0.05, side * 0.12);
    else if (outcome === 'wide') to.set(d * (L / 2 - 1.25), P.rimHeight + 0.5, side * 0.45);
    // La palla parte dalle mani, sopra la testa.
    const s = CONFIG.visuals.playerScale;
    b.pos.set(h.pos.x + Math.cos(h.heading) * 0.25, 2.25 * s, h.pos.z + Math.sin(h.heading) * 0.25);
    const arc = dist < 2 ? 0.35 : 1.2 + dist * 0.16;
    this.launch(to, Math.max(0.45, dist / M.shotSpeed), arc, 'shot', h, null);
    b.flight!.shot = outcome;
    this.excitement = Math.max(this.excitement, 0.6);
  }

  // ---------------------------------------------------------------- fasi

  private setPhase(p: MatchPhase) {
    this.phase = p;
    this.phaseTime = 0;
  }

  private kickoffSpot(a: Actor, kickoffTeam: TeamId) {
    if (BASKET) {
      // Palla a due: tutti nella propria metà campo, il playmaker a centrocampo.
      const x = a.role === 'mid' && a.team === kickoffTeam ? -0.6 : -(L / 2 - a.base.x) * 0.4;
      return new THREE.Vector3(x * dirOf(a.team), 0, a.base.z);
    }
    let x = Math.min(a.base.x, -1.5);
    let z = a.base.z;
    if (a.role === 'fwd') {
      if (a.team === kickoffTeam) { x = -0.6; z = 0; }
      else x = Math.min(x, -9.5); // fuori dal cerchio di centrocampo
    }
    return new THREE.Vector3(x * dirOf(a.team), 0, z);
  }

  private kickoff(team: TeamId) {
    this.setPhase('play');
    for (const a of this.actors) a.pose = 'normal';
    const taker = this.actors.find((a) => a.team === team && a.role === (BASKET ? 'mid' : 'fwd'))!;
    taker.pos.set(-0.6 * dirOf(team), 0, 0);
    this.giveBall(taker, 0.6);
  }

  private onGoal(scorer: Actor, points = 1) {
    this.score[scorer.team] += points;
    this.setPhase('goal');
    this.scorer = scorer;
    this.kickoffTeam = (1 - scorer.team) as TeamId;
    this.excitement = 1;
    this.ballScripted = false;
    for (const a of this.actors) a.scripted = false; // l'esultanza la guida la partita
    this.events.push({ type: 'goal', scorer, at: this.time });
    for (const c of this.coaches) this.setPose(c, c.team === scorer.team ? 'celebrate' : 'dejected', 3);
    if (BASKET) {
      // Pugno al cielo mentre torna in difesa: la palla passa all'altra squadra.
      this.possession = this.kickoffTeam;
      this.setPose(scorer, 'celebrate', M.celebrateSec);
      return;
    }
    this.setPose(scorer, 'celebrate');
    // Spesso va a esultare verso la bandierina dal lato della camera.
    this.celebrateSpot.set(dirOf(scorer.team) * (L / 2 - 1.5), 0, (Math.random() < 0.7 ? 1 : -1) * (W / 2 - 1.5));
  }

  private updateCelebration() {
    const s = this.scorer!;
    for (const a of this.actors) {
      if (a.pose === 'dive') continue;
      if (a === s) {
        a.target.copy(this.celebrateSpot);
        a.speedLimit = M.runSpeed;
      } else if (a.team === s.team && a.role !== 'gk') {
        // I compagni raggiungono il marcatore.
        const ang = a.id * 2.4;
        a.target.set(s.pos.x + Math.cos(ang) * 1.3, 0, s.pos.z + Math.sin(ang) * 1.3);
        a.speedLimit = M.runSpeed;
        if (a.pose !== 'celebrate' && xzDist(a.pos, s.pos) < 3) this.setPose(a, 'celebrate');
      } else {
        a.target.copy(this.kickoffSpot(a, this.kickoffTeam));
        a.speedLimit = M.walkSpeed;
        if (a.team !== s.team && a.role !== 'gk' && a.pose !== 'dejected') this.setPose(a, 'dejected');
      }
    }
  }

  private startReset() {
    this.setPhase('reset');
    for (const a of this.actors) this.setPose(a, 'normal');
    // Il pallone viene rilanciato a centrocampo.
    this.launch(new THREE.Vector3(0, BALL_RADIUS, 0), 2.2, 9, 'rest', null);
  }

  private deadBall(delay: number, then: () => void) {
    this.setPhase('dead');
    this.deadDelay = delay;
    this.onDeadEnd = then;
  }

  // ---------------------------------------------------------------- gioco

  private updatePlay(dt: number) {
    const b = this.ball;
    this.updateFormation();

    if (b.state === 'held' && b.holder) {
      const h = b.holder;
      const presser = this.nearest(b.pos, (a) => a.team !== h.team && a.role !== 'gk' && !a.scripted);
      if (presser) presser.target.copy(b.pos);
      if (this.ballScripted) return;
      this.updateHolder(h, dt);
      if (
        presser && !b.inHands && b.holder === h &&
        xzDist(presser.pos, h.pos) < 1.2 && Math.random() < M.tackleRate * dt
      ) {
        this.looseBall(rand(3, 6), Math.random() * Math.PI * 2);
      }
    } else if (b.state === 'loose') {
      // Il più vicino di ogni squadra va sul pallone.
      for (const team of [0, 1] as TeamId[]) {
        this.nearest(b.pos, (a) => a.team === team && a.role !== 'gk' && !a.scripted)?.target.copy(b.pos).setY(0);
      }
    } else if (b.state === 'flight' && b.flight?.receiver && !b.flight.receiver.scripted) {
      b.flight.receiver.target.copy(b.flight.to).setY(0);
    }
  }

  /** Posizioni di formazione: la squadra si muove in blocco seguendo il pallone. */
  private updateFormation() {
    if (BASKET) return this.updateBasketFormation();
    const b = this.ball.pos;
    const sx = L / 60;
    for (const a of this.actors) {
      if (a.scripted || LOCKED.includes(a.pose)) continue;
      a.speedLimit = M.runSpeed;
      const d = dirOf(a.team);
      if (a.role === 'gk') {
        a.target.set(-d * (L / 2 - 1), 0, clamp(b.z * 0.2, -GW + 0.6, GW - 0.6));
        continue;
      }
      const inPoss = this.possession === a.team;
      const shift = clamp(b.x * d * 0.55 + (inPoss ? 5 : -3), -8 * sx, 18 * sx);
      const x = clamp(a.base.x + shift + Math.sin(this.time * 0.4 + a.seed) * 1.5, -L / 2 + 3, L / 2 - 2);
      const z = clamp(
        a.base.z * (inPoss ? 1.2 : 0.85) + b.z * 0.3 + Math.cos(this.time * 0.33 + a.seed) * 1.5,
        -W / 2 + 1.5, W / 2 - 1.5,
      );
      a.target.set(x * d, 0, z);
    }
  }

  /** Basket: chi attacca va ai suoi posti nella metà campo avversaria, chi difende marca a uomo. */
  private updateBasketFormation() {
    for (const a of this.actors) {
      if (a.scripted || LOCKED.includes(a.pose)) continue;
      a.speedLimit = M.runSpeed;
      const d = dirOf(a.team);
      if (this.possession === a.team) {
        const x = d * (L / 2 - a.base.x) + Math.sin(this.time * 0.5 + a.seed) * 1.2;
        const z = a.base.z + Math.cos(this.time * 0.4 + a.seed) * 1.2;
        a.target.set(x, 0, z);
        clampToPitch(a.target, 0.6);
      } else {
        // Il suo uomo: stesso posto in formazione nell'altra squadra. Si mette tra lui e il proprio canestro.
        const opp = this.actors[(a.id + TEAM_SIZE) % (2 * TEAM_SIZE)];
        tmp.set(hoopX(-d) - opp.pos.x, 0, -opp.pos.z).normalize();
        a.target.copy(opp.pos).addScaledVector(tmp, 1.3).setY(0);
      }
    }
  }

  /** L'arbitro segue l'azione a distanza, dal lato lontano dalla camera. */
  private updateReferee() {
    const r = this.referee;
    if (r.scripted || LOCKED.includes(r.pose)) return;
    const b = this.ball.pos;
    r.target.set(clamp(b.x * 0.85, -L / 2 + 4, L / 2 - 4), 0, clamp(b.z - 8, -W / 2 + 1, W / 2 - 3));
    r.speedLimit = M.jogSpeed;
  }

  /** Gli allenatori camminano avanti e indietro, ogni tanto gesticolano, e reagiscono ai gol. */
  private updateCoaches() {
    for (const c of this.coaches) {
      if (c.scripted) continue;
      c.target.set(c.base.x + Math.sin(this.time * 0.25 + c.seed) * 2.5, 0, c.base.z);
      c.speedLimit = M.walkSpeed;
      c.faceTarget = this.referee; // guardano verso il campo
      if (c.pose === 'normal' && Math.random() < 0.002) this.setPose(c, 'argue', 2, this.referee);
    }
  }

  private updateHolder(h: Actor, dt: number) {
    const d = dirOf(h.team);
    if (this.ball.inHands) {
      h.target.copy(h.pos);
    } else if (!h.scripted) {
      h.speedLimit = M.dribbleSpeed;
      h.target.set(h.pos.x + d * 4, 0, h.pos.z * 0.85 + Math.sin(this.time + h.seed) * 2);
      // Basket: palleggia fino al suo posto d'attacco, non dentro l'area (i tiri li decide l'Event Director).
      if (BASKET) h.target.x = d * Math.min(d * h.target.x, L / 2 - Math.max(h.base.x, 6));
      clampToPitch(h.target, BASKET ? 0.8 : 2);
    }
    this.holdTimer -= dt;
    if (this.holdTimer <= 0) this.pass(h); // i tiri li decide l'Event Director
  }

  private pass(h: Actor) {
    const d = dirOf(h.team);
    let best: Actor | null = null;
    let bestScore = -Infinity;
    for (const a of this.actors) {
      if (a.team !== h.team || a === h || a.role === 'gk' || a.scripted) continue;
      const dist = xzDist(a.pos, h.pos);
      if (dist < (BASKET ? 2.5 : 4)) continue;
      const forward = (a.pos.x - h.pos.x) * d;
      const marker = this.nearest(a.pos, (o) => o.team !== h.team);
      const marked = marker && xzDist(marker.pos, a.pos) < (BASKET ? 1 : 2.5) ? 6 : 0;
      // Niente tiri automatici: vicino alla porta avversaria si preferisce scaricare indietro o di lato.
      const tooDeep = !BASKET && Math.abs(d * L / 2 - a.pos.x) < 14 ? 8 : 0;
      const score = forward * 0.5 - Math.abs(dist - (BASKET ? 6 : 14)) * 0.35 - marked - tooDeep + Math.random() * 5;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    if (!best) { this.holdTimer = 0.5; return; }

    const to = best.pos.clone().addScaledVector(best.vel, 0.6);
    if (Math.random() < M.badPassChance) to.add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6)));
    clampToPitch(to, 1).setY(BASKET ? 1.2 : BALL_RADIUS);
    const dist = xzDist(to, this.ball.pos);
    this.launch(to, dist / M.passSpeed, dist > 22 ? dist * 0.12 : BASKET ? 0.4 : 0.15, 'pass', h, best);
  }

  private launch(to: THREE.Vector3, dur: number, arc: number, kind: Flight['kind'], kicker: Actor | null, receiver: Actor | null = null) {
    const b = this.ball;
    b.state = 'flight';
    b.holder = null;
    b.inHands = false;
    b.flight = { from: b.pos.clone(), to: to.clone(), t: 0, dur: Math.max(dur, 0.25), arc, kind, kicker, receiver, shot: null };
    if (kicker && (kicker.pose === 'normal' || kicker.pose === 'windUp')) {
      if (!BASKET) this.setPose(kicker, 'kick', 0.35);
      else if (kind === 'shot') this.setPose(kicker, 'shoot', 0.6);
      else this.setPose(kicker, 'throw', 0.3);
    }
  }

  private giveBall(a: Actor, hold = rand(M.holdTimeMin, M.holdTimeMax), inHands = false) {
    const b = this.ball;
    b.state = 'held';
    b.holder = a;
    b.inHands = inHands;
    b.flight = null;
    b.vel.set(0, 0, 0);
    this.possession = a.team;
    this.holdTimer = hold;
  }

  private looseBall(speed: number, angle: number) {
    const b = this.ball;
    b.state = 'loose';
    b.pos.y = BALL_RADIUS; // nel basket poteva essere a mezz'aria (palleggio)
    b.holder = null;
    b.inHands = false;
    b.flight = null;
    b.vel.set(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
  }

  private onFlightEnd(f: Flight) {
    const b = this.ball;
    if (f.kind === 'rest') {
      b.state = 'dead';
      b.flight = null;
      b.pos.y = BALL_RADIUS;
      return;
    }
    if (f.kind === 'shot' && BASKET) {
      const d = Math.sign(f.to.x);
      if (f.shot === 'goal') {
        // Attraverso la retina, giù sotto il canestro.
        this.launch(new THREE.Vector3(f.to.x, BALL_RADIUS, f.to.z), 0.45, 0, 'rest', null);
        this.onGoal(f.kicker!, this.shotPoints);
        return;
      }
      // Rimbalzo: di solito lo prende la difesa.
      const land = new THREE.Vector3(f.to.x - d * rand(1.2, f.shot === 'wide' ? 4 : 2.8), 1.5, rand(-3, 3));
      const defending: TeamId = d > 0 ? 1 : 0;
      const team = Math.random() < 0.7 ? defending : ((1 - defending) as TeamId);
      const rebounder = this.nearest(land, (a) => a.team === team && !a.scripted);
      this.launch(land, 0.75, 1.1, 'pass', null, rebounder);
      this.excitement = Math.max(this.excitement, 0.5);
      return;
    }
    if (f.kind === 'shot') {
      const d = Math.sign(f.to.x);
      const defending: TeamId = f.to.x > 0 ? 1 : 0;
      const gk = this.actors.find((a) => a.team === defending && a.role === 'gk')!;
      if (f.shot === 'save') {
        this.giveBall(gk, 1.6, true);
        this.excitement = Math.max(this.excitement, 0.7);
      } else if (f.shot === 'goal') {
        this.launch(new THREE.Vector3(f.to.x + d * 1.3, BALL_RADIUS, f.to.z * 0.9), 0.25, 0, 'rest', null);
        this.onGoal(f.kicker!);
      } else {
        this.launch(new THREE.Vector3(f.to.x + d * 4, BALL_RADIUS, f.to.z * 1.3), 0.35, 0.2, 'rest', null);
        // Rimessa dal fondo: il portiere riparte con la palla al piede.
        this.deadBall(1.8, () => this.giveBall(gk, 1));
      }
      return;
    }
    // Passaggio: quelli da copione arrivano sempre.
    if (f.receiver && (this.ballScripted || xzDist(f.receiver.pos, f.to) < 1.8)) {
      this.giveBall(f.receiver);
    } else {
      const dir = tmp.subVectors(f.to, f.from).setY(0).normalize();
      this.looseBall(5, Math.atan2(dir.z, dir.x));
      b.pos.y = BALL_RADIUS;
    }
  }

  private updateBall(dt: number) {
    const b = this.ball;
    const px = b.pos.x;
    const pz = b.pos.z;

    if (b.state === 'held' && b.holder) {
      const h = b.holder;
      const cos = Math.cos(h.heading);
      const sin = Math.sin(h.heading);
      if (b.inHands || (BASKET && (h.pose === 'windUp' || h.pose === 'crouch'))) {
        // In mano (portiere, o nel basket chi si prepara al tiro/passaggio): al petto.
        b.pos.set(h.pos.x + cos * 0.3, (BASKET ? 1.3 : 1.05) * CONFIG.visuals.playerScale, h.pos.z + sin * 0.3);
      } else if (BASKET) {
        // Palleggio: di lato, su e giù dal parquet.
        const bounce = Math.abs(Math.sin(this.time * 6 + h.seed));
        b.pos.set(h.pos.x + cos * 0.35 - sin * 0.3, BALL_RADIUS + bounce * 0.85, h.pos.z + sin * 0.35 + cos * 0.3);
      } else {
        const reach = 0.5 + 0.15 * Math.sin(h.runPhase);
        b.pos.set(h.pos.x + cos * reach, BALL_RADIUS, h.pos.z + sin * reach);
      }
    } else if (b.state === 'flight' && b.flight) {
      const f = b.flight;
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      b.pos.lerpVectors(f.from, f.to, u);
      b.pos.y = Math.max(BALL_RADIUS, b.pos.y + 4 * f.arc * u * (1 - u));
      if (u >= 1) {
        this.onFlightEnd(f);
      } else if (f.kind === 'pass' && !this.ballScripted && f.t > 0.3 && b.pos.y < 1.2 && this.phase === 'play') {
        // Intercetto: qualcuno sulla traiettoria di un passaggio basso.
        const cut = this.nearest(b.pos, (a) => a !== f.kicker && a !== f.receiver && a.role !== 'gk' && !a.scripted);
        if (cut && xzDist(cut.pos, b.pos) < 0.9) this.giveBall(cut);
      }
    } else if (b.state === 'loose') {
      b.pos.addScaledVector(b.vel, dt);
      b.vel.multiplyScalar(Math.exp(-1.2 * dt));
      // Rimbalza sui bordi invece di uscire (semplificazione: niente rimesse laterali).
      if (Math.abs(b.pos.x) > L / 2 - 0.5) { b.vel.x *= -0.6; clampToPitch(b.pos, 0.5); }
      if (Math.abs(b.pos.z) > W / 2 - 0.5) { b.vel.z *= -0.6; clampToPitch(b.pos, 0.5); }
      if (this.phase === 'play' && !this.ballScripted) {
        const c = this.nearest(b.pos, (a) => !a.scripted && !LOCKED.includes(a.pose));
        if (c && xzDist(c.pos, b.pos) < 0.9) this.giveBall(c);
      }
    }
    b.spin += Math.hypot(b.pos.x - px, b.pos.z - pz) / BALL_RADIUS;
  }

  // ---------------------------------------------------------------- movimento

  private moveActors(dt: number) {
    const maxDv = M.accel * dt;
    const all = this.everyone;
    for (const a of all) {
      a.poseTime += dt;
      if (a.poseTime > a.poseDur) {
        a.pose = 'normal';
        a.poseDur = Infinity;
        a.faceTarget = null;
      }
      if (a.pose === 'dive') {
        if (a.poseTime > 0) a.pos.z += clamp(a.target.z - a.pos.z, -7 * dt, 7 * dt);
        a.vel.set(0, 0, 0);
        continue;
      }
      if (a.pose === 'fall' || a.pose === 'tackle') {
        // Scivola sull'erba e si ferma.
        a.vel.multiplyScalar(Math.exp((a.pose === 'fall' ? -3 : -2) * dt));
        a.pos.addScaledVector(a.vel, dt);
        continue;
      }
      // Velocità desiderata con frenata in arrivo, poi accelerazione limitata.
      tmp.subVectors(a.target, a.pos).setY(0);
      const dist = tmp.length();
      // Mentre carica il calcio rallenta: è parte del segnale premonitore.
      const limit = a.pose === 'windUp' ? Math.min(a.speedLimit, 2.2) : a.speedLimit;
      if (dist > 1e-3) tmp.multiplyScalar(Math.min(limit, dist * 2.5) / dist);
      tmp.sub(a.vel);
      const dv = tmp.length();
      if (dv > maxDv) tmp.multiplyScalar(maxDv / dv);
      a.vel.add(tmp);
      a.pos.addScaledVector(a.vel, dt);

      const sp = Math.hypot(a.vel.x, a.vel.z);
      const look = a.faceTarget?.pos ?? this.ball.pos;
      const facingOpponent = SPORT === 'boxe' && a.role === 'fwd' && a.faceTarget;
      const want = sp > 0.6 && !facingOpponent ? Math.atan2(a.vel.z, a.vel.x) : Math.atan2(look.z - a.pos.z, look.x - a.pos.x);
      a.heading += wrapAngle(want - a.heading) * Math.min(1, dt * 8);
      a.runPhase += sp * dt * 2.2;
    }
    // Separazione semplice: niente attori compenetrati (una ventina, O(n²) va benissimo).
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].pos;
        const b = all[j].pos;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.81 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (0.9 - d) / 2 / d;
        a.x -= dx * push; a.z -= dz * push;
        b.x += dx * push; b.z += dz * push;
      }
    }
  }

  /** Attiva un extra (tifoso, steward) in una posizione. */
  spawnExtra(role: 'fan' | 'steward', at: THREE.Vector3): Actor | null {
    const a = this.extras.find((e) => e.role === role && !e.active);
    if (!a) return null;
    a.active = true;
    a.pos.copy(at);
    a.target.copy(at);
    a.vel.set(0, 0, 0);
    a.pose = 'normal';
    return a;
  }

  despawnExtra(a: Actor) {
    if (a.role !== 'fan' && a.role !== 'steward') return;
    a.active = false;
    a.scripted = false;
    a.pos.copy(PARKING);
    a.vel.set(0, 0, 0);
  }

  nearest(p: THREE.Vector3, filter: (a: Actor) => boolean): Actor | null {
    let best: Actor | null = null;
    let bestD = Infinity;
    for (const a of this.actors) {
      if (!filter(a)) continue;
      const d = xzDist(a.pos, p);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }
}
