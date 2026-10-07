import * as THREE from 'three';
import type { Actor, Match, TeamId } from '../match';
import { CONFIG } from '../../config';

/** Traiettorie dei giochi di rete, indipendenti da passaggi e tiri del calcio. */
export class NetBall {
  private flight: { from: THREE.Vector3; to: THREE.Vector3; elapsed: number; duration: number;
    arc: number; bounce: boolean; next: Actor | null; scored: TeamId | null } | null = null;
  constructor(private match: Match) {}

  get flying() { return this.flight !== null; }

  hold(actor: Actor, height = 1) {
    const b = this.match.ball;
    b.holder = actor;
    b.state = 'held';
    b.flight = null;
    b.pos.set(actor.pos.x, height, actor.pos.z);
    b.vel.set(0, 0, 0);
  }

  launch(actor: Actor, to: THREE.Vector3, duration: number, arc: number,
    bounce = false, next: Actor | null = null, scored: TeamId | null = null, height = 1.1) {
    const b = this.match.ball;
    const from = new THREE.Vector3(actor.pos.x, height, actor.pos.z);
    this.flight = { from, to: to.clone(), elapsed: 0, duration, arc, bounce, next, scored };
    b.state = 'flight'; b.holder = null; b.flight = null; b.pos.copy(from);
  }

  update(dt: number): TeamId | null {
    const b = this.match.ball;
    const f = this.flight;
    if (!f) {
      if (b.holder) b.pos.set(b.holder.pos.x, 1, b.holder.pos.z);
      return null;
    }
    f.elapsed += dt;
    const u = Math.min(1, f.elapsed / f.duration);
    const old = b.pos.clone();
    b.pos.lerpVectors(f.from, f.to, u);
    if (f.bounce) {
      // Un rimbalzo nella metà avversaria, poi la salita verso la racchetta.
      const land = 0.78;
      b.pos.y = u < land
        ? f.from.y * (1 - u / land) + 4 * f.arc * (u / land) * (1 - u / land)
        : 0.12 + (f.to.y - 0.12) * ((u - land) / (1 - land));
    } else b.pos.y += 4 * f.arc * u * (1 - u);
    b.pos.y = Math.max(CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale, b.pos.y);
    b.vel.copy(b.pos).sub(old).divideScalar(Math.max(dt, 0.001));
    b.spin += b.vel.length() * dt * 4;
    if (u < 1) return null;
    this.flight = null;
    if (f.next) this.hold(f.next, f.to.y);
    else { b.state = 'dead'; b.vel.set(0, 0, 0); }
    return f.scored;
  }
}
