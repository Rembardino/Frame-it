import * as THREE from 'three';
import type { Actor, Match, Pose, TeamId } from '../match';
import { CONFIG, SPORT } from '../../config';
import { netContactPoint } from '../../animation/motion';

/** Traiettorie dei giochi di rete, indipendenti da passaggi e tiri del calcio. */
export class NetBall {
  private flight: { from: THREE.Vector3; to: THREE.Vector3; elapsed: number; duration: number;
    arc: number; bounce: boolean; next: Actor | null; scored: TeamId | null;
    actor: Actor; delay: number; contact: THREE.Vector3; prepared: boolean; bounced: boolean;
    nextPose: Pose | null; arrival: THREE.Vector3; contactTime: number; toss: boolean } | null = null;
  private heldHeight = 1;
  private catchFrom = new THREE.Vector3();
  private catchTime = 1;
  private catchDuration = 0.16;
  /** Tennis: la palla tenuta in mano sta nel palmo libero. */
  private palm = false;
  private target = new THREE.Vector3();
  constructor(private match: Match) {}

  get flying() { return this.flight !== null; }
  get receiver() { return this.flight?.next ?? null; }
  get receivingPose() { return this.flight?.nextPose ?? null; }
  get landing() { return this.flight?.to ?? null; }
  get hitter() { return this.flight?.actor ?? null; }
  get remaining() { return this.flight ? Math.max(0, this.flight.duration + this.flight.delay - this.flight.elapsed) : 0; }
  get targetTeam(): TeamId | null {
    return this.flight ? this.flight.next?.team ?? (1 - this.flight.actor.team) as TeamId : null;
  }

  hold(actor: Actor, height = 1) {
    this.flight = null;
    const b = this.match.ball;
    b.holder = actor;
    b.state = 'held';
    b.flight = null;
    this.heldHeight = height;
    this.palm = SPORT === 'tennis';
    this.catchFrom.copy(b.pos); this.catchTime = 0;
    // Da lontano (fine punto: la palla torna a chi batte) il raccordo dura di più, così non "spara" attraverso il campo.
    const distance = b.pos.distanceTo(actor.pos);
    this.catchDuration = distance > 3 ? Math.max(0.65, distance / 20) : 0.16;
    b.vel.set(0, 0, 0);
  }

  /** strike = secondi dall'inizio del gesto all'impatto (servizio del tennis: la palla viene prima lanciata in aria dalla mano libera). */
  launch(actor: Actor, to: THREE.Vector3, duration: number, arc: number,
    bounce = false, next: Actor | null = null, scored: TeamId | null = null, nextPose: Pose | null = null, strike?: number) {
    const b = this.match.ball;
    const strikeTime = strike ?? (Number.isFinite(actor.poseDur) ? Math.min(0.24, actor.poseDur * 0.32) : 0.16);
    const delay = Math.max(0, strikeTime - actor.poseTime);
    const contactTime = actor.poseTime + delay;
    const contact = netContactPoint(actor, this.match.time + delay, contactTime);
    // The wind-up/toss reaches the contact point before the flight begins.
    this.flight = { from: b.pos.clone(), to: to.clone(), elapsed: 0, duration, arc, bounce, next, scored,
      actor, delay, contact, prepared: false, bounced: false, nextPose, arrival: to.clone(), contactTime, toss: strike !== undefined };
    b.state = 'held'; b.holder = actor; b.flight = null;
  }

  /** La palla raggiunge il palmo libero e lo segue, senza scatti quando il gesto cambia (al massimo 22 m/s). */
  private toPalm(actor: Actor, dt: number) {
    const b = this.match.ball;
    this.target.copy(netContactPoint(actor, this.match.time, actor.poseTime, actor.pose, actor.poseDur, true)).sub(b.pos);
    const distance = this.target.length();
    if (distance > 1e-4) b.pos.addScaledVector(this.target, Math.min(1, dt * 12, (22 * dt) / distance));
  }

  update(dt: number): TeamId | null {
    const b = this.match.ball;
    const f = this.flight;
    if (!f) {
      if (b.holder) {
        this.catchTime += dt;
        const u = Math.min(1, this.catchTime / this.catchDuration), smooth = u * u * (3 - 2 * u);
        this.target.set(b.holder.pos.x, this.heldHeight, b.holder.pos.z);
        // Tennis: la palla aspetta nella mano libera di chi serve, non in mezzo al corpo.
        if (this.palm) this.toPalm(b.holder, dt);
        else b.pos.lerpVectors(this.catchFrom, this.target, smooth);
      }
      return null;
    }
    f.elapsed += dt;
    const old = b.pos.clone();
    if (f.elapsed <= f.delay) {
      const remaining = Math.max(0, f.delay - f.elapsed);
      f.contact.copy(netContactPoint(f.actor, this.match.time + remaining, f.contactTime));
      const u = f.elapsed / f.delay;
      if (f.toss) {
        // Fino al rilascio la palla sta nel palmo che sale; poi vola sopra il punto d'impatto e ci ricade mentre arriva la racchetta.
        const release = 0.62;
        if (u < release) { this.toPalm(f.actor, dt); f.from.copy(b.pos); }
        else {
          const v = (u - release) / (1 - release);
          b.pos.lerpVectors(f.from, f.contact, v); b.pos.y += 4 * 0.45 * v * (1 - v);
        }
      } else b.pos.lerpVectors(f.from, f.contact, u * u * (3 - 2 * u));
      b.vel.copy(b.pos).sub(old).divideScalar(Math.max(dt, 0.001));
      return null;
    }
    if (b.state !== 'flight') {
      if (f.delay === 0) f.contact.copy(b.pos);
      else f.contact.copy(netContactPoint(f.actor, this.match.time, f.contactTime));
      f.from.copy(f.contact); b.state = 'flight'; b.holder = null;
      if (f.from.x * f.to.x < 0) {
        const crossing = f.from.x / (f.from.x - f.to.x);
        const u = f.bounce ? crossing / 0.78 : crossing;
        const radius = CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale;
        const height = THREE.MathUtils.lerp(f.from.y, f.bounce ? radius : f.to.y, u);
        const clearance = (SPORT === 'tennis' ? 0.98 : 2.43) + radius + 0.15;
        if (u > 0 && u < 1) f.arc = Math.max(f.arc, (clearance - height) / (4 * u * (1 - u)));
      }
      this.match.sound(SPORT === 'tennis' ? 'racket' : 'volley', f.contact);
    }
    const u = Math.min(1, (f.elapsed - f.delay) / f.duration);
    const remaining = f.duration * (1 - u);
    if (f.next && f.nextPose) {
      const duration = SPORT === 'tennis' ? 0.55 : 0.75;
      const strikeTime = duration * 0.32;
      if (!f.prepared && remaining <= strikeTime) {
        f.prepared = true;
        const face = SPORT === 'tennis' ? f.actor : f.nextPose === 'set' || f.nextPose === 'receive'
          ? this.match.actors.find(a => a.team === f.next!.team && a !== f.next && a.role === (f.nextPose === 'set' ? 'fwd' : 'mid'))
          : this.match.actors.find(a => a.team !== f.next!.team);
        this.match.setPose(f.next, f.nextPose, duration, face ?? f.actor);
        // Start the gesture on the incoming ball's clock, even at a lower frame rate.
        f.next.poseTime = Math.max(0, strikeTime - remaining);
      }
      // Finish at the actual hands, rather than catching then dragging the ball to the body.
      // Match advances the actor's pose after this update; include that frame in the contact sample.
      const contactTime = f.prepared ? f.next.poseTime + remaining + dt : strikeTime;
      const contact = netContactPoint(f.next, this.match.time + remaining, contactTime, f.nextPose, duration);
      const blend = THREE.MathUtils.smoothstep(u, 0.45, 1);
      f.arrival.lerpVectors(f.to, contact, blend);
    }
    b.pos.lerpVectors(f.from, f.arrival, u);
    if (f.bounce) {
      // Un rimbalzo nella metà avversaria, poi la salita verso la racchetta.
      const land = 0.78;
      const radius = CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale;
      b.pos.y = u < land
        ? radius + (f.from.y - radius) * (1 - u / land) + 4 * f.arc * (u / land) * (1 - u / land)
        : radius + (f.arrival.y - radius) * ((u - land) / (1 - land));
      if (!f.bounced && u >= 0.78) { f.bounced = true; this.match.sound('bounce', b.pos, 0.35); }
    } else b.pos.y += 4 * f.arc * u * (1 - u);
    b.pos.y = Math.max(CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale, b.pos.y);
    b.vel.copy(b.pos).sub(old).divideScalar(Math.max(dt, 0.001));
    b.spin += b.vel.length() * dt * 4;
    if (!f.nextPose && !f.prepared && f.next && remaining < 0.22) {
      f.prepared = true; f.next.faceTarget = f.actor;
      if (SPORT === 'pallavolo' && f.next.pose === 'normal') this.match.setPose(f.next, 'receive', 0.45, f.actor);
    }
    if (u < 1) return null;
    this.flight = null;
    if (f.next && f.nextPose) {
      b.state = 'held'; b.holder = f.next; b.vel.set(0, 0, 0);
      this.heldHeight = b.pos.y; this.catchFrom.copy(b.pos); this.catchTime = 0;
      this.catchDuration = 0.16; this.palm = false;
    } else if (f.next) this.hold(f.next, f.to.y);
    else { b.state = 'dead'; b.vel.set(0, 0, 0); }
    return f.scored;
  }
}
