import * as THREE from 'three';
import type { Actor, Match, TeamId } from '../match';
import { CONFIG, SPORT } from '../../config';
import { netContactPoint } from '../../animation/motion';

/** Traiettorie dei giochi di rete, indipendenti da passaggi e tiri del calcio. */
export class NetBall {
  private flight: { from: THREE.Vector3; to: THREE.Vector3; elapsed: number; duration: number;
    arc: number; bounce: boolean; next: Actor | null; scored: TeamId | null;
    actor: Actor; delay: number; contact: THREE.Vector3; prepared: boolean } | null = null;
  private heldHeight = 1;
  private catchFrom = new THREE.Vector3();
  private catchTime = 1;
  private catchDuration = 0.16;
  private target = new THREE.Vector3();
  constructor(private match: Match) {}

  get flying() { return this.flight !== null; }
  get receiver() { return this.flight?.next ?? null; }
  get landing() { return this.flight?.to ?? null; }
  get hitter() { return this.flight?.actor ?? null; }
  get remaining() { return this.flight ? Math.max(0, this.flight.duration + this.flight.delay - this.flight.elapsed) : 0; }
  get targetTeam(): TeamId | null {
    return this.flight ? this.flight.next?.team ?? (1 - this.flight.actor.team) as TeamId : null;
  }

  hold(actor: Actor, height = 1) {
    const b = this.match.ball;
    b.holder = actor;
    b.state = 'held';
    b.flight = null;
    this.heldHeight = height;
    this.catchFrom.copy(b.pos); this.catchTime = 0;
    this.catchDuration = b.pos.distanceTo(actor.pos) > 3 ? 0.65 : 0.16;
    b.vel.set(0, 0, 0);
  }

  launch(actor: Actor, to: THREE.Vector3, duration: number, arc: number,
    bounce = false, next: Actor | null = null, scored: TeamId | null = null) {
    const b = this.match.ball;
    const delay = Number.isFinite(actor.poseDur) ? Math.min(0.24, actor.poseDur * 0.32) : 0.16;
    const contact = netContactPoint(actor, this.match.time + delay, delay);
    // The wind-up/toss reaches the contact point before the flight begins.
    this.flight = { from: b.pos.clone(), to: to.clone(), elapsed: 0, duration, arc, bounce, next, scored,
      actor, delay, contact, prepared: false };
    b.state = 'held'; b.holder = actor; b.flight = null;
  }

  update(dt: number): TeamId | null {
    const b = this.match.ball;
    const f = this.flight;
    if (!f) {
      if (b.holder) {
        this.catchTime += dt;
        const u = Math.min(1, this.catchTime / this.catchDuration), smooth = u * u * (3 - 2 * u);
        this.target.set(b.holder.pos.x, this.heldHeight, b.holder.pos.z);
        b.pos.lerpVectors(this.catchFrom, this.target, smooth);
      }
      return null;
    }
    f.elapsed += dt;
    const old = b.pos.clone();
    if (f.elapsed <= f.delay) {
      f.contact.copy(netContactPoint(f.actor, this.match.time + Math.max(0, f.delay - f.elapsed), f.delay));
      const u = f.elapsed / f.delay;
      b.pos.lerpVectors(f.from, f.contact, u * u * (3 - 2 * u));
      b.vel.copy(b.pos).sub(old).divideScalar(Math.max(dt, 0.001));
      return null;
    }
    if (b.state !== 'flight') {
      f.contact.copy(netContactPoint(f.actor, this.match.time, f.delay));
      f.from.copy(f.contact); b.state = 'flight'; b.holder = null;
    }
    const u = Math.min(1, (f.elapsed - f.delay) / f.duration);
    b.pos.lerpVectors(f.from, f.to, u);
    if (f.bounce) {
      // Un rimbalzo nella metà avversaria, poi la salita verso la racchetta.
      const land = 0.78;
      const radius = CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale;
      b.pos.y = u < land
        ? radius + (f.from.y - radius) * (1 - u / land) + 4 * f.arc * (u / land) * (1 - u / land)
        : radius + (f.to.y - radius) * ((u - land) / (1 - land));
    } else b.pos.y += 4 * f.arc * u * (1 - u);
    b.pos.y = Math.max(CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale, b.pos.y);
    b.vel.copy(b.pos).sub(old).divideScalar(Math.max(dt, 0.001));
    b.spin += b.vel.length() * dt * 4;
    if (!f.prepared && f.next && f.duration * (1 - u) < 0.22) {
      f.prepared = true; f.next.faceTarget = f.actor;
      if (SPORT === 'pallavolo' && f.next.pose === 'normal') this.match.setPose(f.next, 'receive', 0.45, f.actor);
    }
    if (u < 1) return null;
    this.flight = null;
    if (f.next) this.hold(f.next, f.to.y);
    else { b.state = 'dead'; b.vel.set(0, 0, 0); }
    return f.scored;
  }
}
