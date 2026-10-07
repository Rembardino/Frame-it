/**
 * REPLAY — rivede una clip del Recorder al rallentatore (più lento attorno all'istante decisivo).
 * L'angolazione è una funzione separata: oggi solo quella del giocatore, domani altre (alta, dietro la porta...).
 */
import { CONFIG } from '../config';
import type { CameraFrame, Clip, Frame } from './recorder';

/** Un'angolazione di replay: dai fotogrammi decide la camera. */
export type ReplayAngle = (a: Frame, b: Frame, u: number, recorded: CameraFrame) => CameraFrame;

/** La camera del giocatore, esattamente come ha ripreso. */
export const playerAngle: ReplayAngle = (_a, _b, _u, recorded) => recorded;

export class ReplayPlayer {
  active = false;
  clip: Clip | null = null;
  /** Tempo della clip in riproduzione (stessa scala di Match.time). */
  t = 0;
  speed = 1;
  private i = 0;

  constructor(public angle: ReplayAngle = playerAngle) {}

  start(clip: Clip) {
    if (clip.frames.length < 2) return false;
    this.clip = clip;
    this.t = clip.frames[0].t;
    this.i = 0;
    this.active = true;
    return true;
  }

  skip() {
    this.active = false;
  }

  /** Avanza la riproduzione. Restituisce i due fotogrammi da interpolare, o null se è finita. */
  update(dt: number): { a: Frame; b: Frame; u: number } | null {
    const c = this.clip;
    if (!this.active || !c) return null;
    const R = CONFIG.replay;
    this.speed = Math.abs(this.t - c.decisive) <= R.slowWindow ? R.slowSpeed : R.speed;
    this.t += dt * this.speed;
    const f = c.frames;
    while (this.i < f.length - 2 && f[this.i + 1].t <= this.t) this.i++;
    if (this.t >= f[f.length - 1].t) {
      this.active = false;
      return null;
    }
    const a = f[this.i], b = f[this.i + 1];
    return { a, b, u: Math.min(1, Math.max(0, (this.t - a.t) / (b.t - a.t || 1))) };
  }
}
