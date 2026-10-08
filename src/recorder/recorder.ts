/**
 * RECORDER — registra lo stato della scena (attori, palla, camera, pubblico, cielo) a frequenza fissa,
 * in un buffer circolare degli ultimi secondi. Serve al replay e, in futuro, all'esportazione delle clip
 * da condividere: clip() restituisce dati semplici, serializzabili in JSON.
 */
import { CONFIG } from '../config';
import type { Match, Pose, Ball } from '../sim/match';
import type { MotionPose } from '../animation/motion';

export interface ActorFrame {
  x: number; z: number; vx: number; vz: number;
  heading: number; runPhase: number;
  pose: Pose; poseTime: number; poseDur: number; poseDir: number;
  previousPose: Pose; previousPoseTime: number; previousPoseDur: number; poseBlendTime: number;
  poseFrom: MotionPose | null;
  active: boolean;
}

/** Camera così come l'ha vista il giocatore (micro-oscillazione compresa). Angoli in radianti, fov in gradi. */
export interface CameraFrame { rx: number; ry: number; fov: number }

/** Stato del pubblico e del cielo, che vivono fuori dalla partita. */
export interface WorldFrame { excitement: number; hotX: number; hotLevel: number; lookUp: number }

export interface Frame {
  t: number;
  cam: CameraFrame;
  /** Prima i giocatori (match.actors), poi gli extra (match.extras), sempre nello stesso ordine. */
  actors: ActorFrame[];
  ball: { x: number; y: number; z: number; spin: number; holderId: number | null; state: Ball['state']; inHands: boolean };
  world: WorldFrame;
  star: { planned: boolean; active: boolean; t: number; from: number[]; to: number[] };
}

/** Una clip esportabile: i fotogrammi e cosa rappresentano. */
export interface Clip {
  label: string;
  decisive: number;
  frames: Frame[];
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerpAngle = (a: number, b: number, u: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;

export class Recorder {
  private frames: Frame[] = [];
  private acc = 0;

  constructor(private match: Match) {}

  /** Chiamato a ogni frame del gioco: registra alla frequenza di CONFIG.recorder.hz. */
  tick(dt: number, cam: CameraFrame, world: WorldFrame) {
    this.acc += dt;
    if (this.acc < 1 / CONFIG.recorder.hz) return;
    this.acc = 0;
    this.frames.push(this.capture(cam, world));
    const keep = CONFIG.recorder.hz * CONFIG.recorder.seconds;
    if (this.frames.length > keep) this.frames.splice(0, this.frames.length - keep);
  }

  /** Fotografa lo stato attuale. */
  capture(cam: CameraFrame, world: WorldFrame): Frame {
    const m = this.match;
    const s = m.sky.star;
    return {
      t: m.time,
      cam: { ...cam },
      actors: [...m.actors, ...m.extras].map((a) => ({
        x: a.pos.x, z: a.pos.z, vx: a.vel.x, vz: a.vel.z,
        heading: a.heading, runPhase: a.runPhase,
        pose: a.pose, poseTime: a.poseTime, poseDur: a.poseDur, poseDir: a.poseDir,
        previousPose: a.previousPose, previousPoseTime: a.previousPoseTime,
        previousPoseDur: a.previousPoseDur, poseBlendTime: a.poseBlendTime,
        poseFrom: a.poseFrom,
        active: a.active,
      })),
      ball: { x: m.ball.pos.x, y: m.ball.pos.y, z: m.ball.pos.z, spin: m.ball.spin,
        holderId: m.ball.holder?.id ?? null, state: m.ball.state, inHands: m.ball.inHands },
      world: { ...world },
      star: { planned: s.planned, active: s.active, t: s.t, from: s.from.toArray(), to: s.to.toArray() },
    };
  }

  /**
   * Riporta la scena allo stato registrato, interpolando tra due fotogrammi (u = 0..1).
   * Tocca solo ciò che la grafica legge: con lo stato "live" salvato si torna esattamente indietro.
   * Restituisce camera e pubblico, che non vivono nella partita.
   */
  apply(a: Frame, b: Frame, u: number): { cam: CameraFrame; world: WorldFrame } {
    const m = this.match;
    m.time = lerp(a.t, b.t, u);
    [...m.actors, ...m.extras].forEach((actor, i) => {
      const fa = a.actors[i], fb = b.actors[i];
      actor.pos.x = lerp(fa.x, fb.x, u);
      actor.pos.z = lerp(fa.z, fb.z, u);
      actor.vel.x = lerp(fa.vx, fb.vx, u);
      actor.vel.z = lerp(fa.vz, fb.vz, u);
      actor.heading = lerpAngle(fa.heading, fb.heading, u);
      actor.runPhase = lerp(fa.runPhase, fb.runPhase, u);
      const f = u < 0.5 || fa.pose !== fb.pose ? fa : fb;
      actor.pose = f.pose;
      actor.poseDur = f.poseDur;
      actor.poseDir = f.poseDir;
      actor.poseTime = fa.pose === fb.pose ? lerp(fa.poseTime, fb.poseTime, u) : f.poseTime;
      actor.previousPose = f.previousPose;
      actor.previousPoseTime = f.previousPoseTime;
      actor.previousPoseDur = f.previousPoseDur;
      actor.poseBlendTime = fa.pose === fb.pose ? lerp(fa.poseBlendTime, fb.poseBlendTime, u) : f.poseBlendTime;
      actor.poseFrom = f.poseFrom;
      actor.active = fa.active;
    });
    m.ball.pos.set(lerp(a.ball.x, b.ball.x, u), lerp(a.ball.y, b.ball.y, u), lerp(a.ball.z, b.ball.z, u));
    m.ball.spin = lerp(a.ball.spin, b.ball.spin, u);
    const ball = u < 0.5 ? a.ball : b.ball;
    m.ball.holder = ball.holderId === null ? null : [...m.actors, ...m.extras].find(actor => actor.id === ball.holderId) ?? null;
    m.ball.state = ball.state; m.ball.inHands = ball.inHands;
    const s = m.sky.star;
    s.planned = a.star.planned;
    s.active = a.star.active;
    s.t = a.star.active === b.star.active ? lerp(a.star.t, b.star.t, u) : a.star.t;
    s.from.fromArray(a.star.from);
    s.to.fromArray(a.star.to);
    return {
      cam: { rx: lerpAngle(a.cam.rx, b.cam.rx, u), ry: lerpAngle(a.cam.ry, b.cam.ry, u), fov: lerp(a.cam.fov, b.cam.fov, u) },
      world: {
        excitement: lerp(a.world.excitement, b.world.excitement, u),
        hotX: b.world.hotX,
        hotLevel: lerp(a.world.hotLevel, b.world.hotLevel, u),
        lookUp: lerp(a.world.lookUp, b.world.lookUp, u),
      },
    };
  }

  /** Fotogrammi tra t0 e t1: è la clip da rivedere o, in futuro, da esportare e condividere. */
  clip(label: string, decisive: number, t0: number, t1: number): Clip {
    return { label, decisive, frames: this.frames.filter((f) => f.t >= t0 && f.t <= t1) };
  }
}
