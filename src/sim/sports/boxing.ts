import * as THREE from 'three';
import type { Actor, Match } from '../match';
import type { SportAction, SportSimulation } from './types';
import { CONFIG } from '../../config';

/** Tre riprese arcade: colpi puliti, difesa, combinazioni e knockdown recuperabili. */
export class BoxingSimulation implements SportSimulation {
  private next = 2;
  private hits: { actor: Actor; opponent: Actor; kind: SportAction; delay: number }[] = [];
  constructor(private match: Match) {
    match.actors.forEach((a) => {
      a.pos.set(a.team === 0 ? -0.6 : 0.6, 0, 0); a.target.copy(a.pos);
      match.setPose(a, 'guard'); a.faceTarget = match.actors[1 - a.team];
    });
    match.ball.holder = match.actors[0];
  }

  update(dt: number) {
    if (this.match.isStopped) return;
    for (const hit of this.hits) {
      hit.delay -= dt;
      if (hit.delay > 0) continue;
      if (hit.actor.pos.distanceTo(hit.opponent.pos) > 1.85 || hit.opponent.pose === 'fall') continue;
      this.match.setPose(hit.opponent, hit.kind === 'knockdown' ? 'fall' : 'recoil', hit.kind === 'knockdown' ? 2.5 : 0.55, hit.actor);
      this.match.score[hit.actor.team] += hit.kind === 'knockdown' ? 2 : 1;
      this.match.excitement = hit.kind === 'knockdown' ? 1 : 0.7;
    }
    this.hits = this.hits.filter(hit => hit.delay > 0);
    for (const a of this.match.actors) {
      const opponent = this.match.actors[1 - a.team];
      if (!a.scripted && a.pose !== 'fall') {
        const t = this.match.time;
        const angle = Math.sin(t * 0.42) * 0.6 + Math.sin(t * 0.87) * 0.12 + a.team * Math.PI;
        const radius = 0.64 + Math.sin(t * 0.7 + a.team * 0.4) * 0.06;
        a.target.set(Math.sin(t * 0.23) * 0.45 - Math.cos(angle) * radius, 0,
          Math.sin(t * 0.19) * 0.5 - Math.sin(angle) * radius);
        if (a.pose === 'recoil') {
          const retreat = a.pos.clone().sub(opponent.pos).normalize();
          a.target.copy(a.pos).addScaledVector(retreat, 0.22);
        }
        a.speedLimit = CONFIG.match.walkSpeed * 1.2;
        a.faceTarget = opponent;
        if (a.pose === 'normal') this.match.setPose(a, 'guard', Infinity, opponent);
      }
      a.target.x = THREE.MathUtils.clamp(a.target.x, -2.4, 2.4);
      a.target.z = THREE.MathUtils.clamp(a.target.z, -2.4, 2.4);
    }
    if (this.match.ballScripted || (this.next -= dt) > 0) return;
    const a = this.match.actors[Math.floor(this.match.time) % 2];
    if (a.pose === 'guard' && this.match.actors[1 - a.team].pose !== 'fall') {
      this.action(Math.sin(this.match.time) > 0 ? 'jab' : 'hook', a);
    }
    this.next = 2.4;
  }

  action(kind: SportAction, actor: Actor, target?: Actor) {
    const opponent = target ?? this.match.actors[1 - actor.team];
    actor.target.copy(actor.pos);
    const pose = kind === 'knockdown' ? 'uppercut' : kind === 'counter' ? 'hook' : kind;
    this.match.setPose(actor, pose === 'jab' || pose === 'hook' || pose === 'uppercut' ? pose : 'jab', 0.65, opponent);
    this.hits.push({ actor, opponent, kind, delay: 0.65 * 0.32 });
  }

  scoreText() { return `${this.match.score[0]} - ${this.match.score[1]}`; }
}
