import * as THREE from 'three';
import type { Actor, Match } from '../match';
import type { SportAction, SportSimulation } from './types';

/** Tre riprese arcade: colpi puliti, difesa, combinazioni e knockdown recuperabili. */
export class BoxingSimulation implements SportSimulation {
  private next = 2;
  constructor(private match: Match) {
    match.actors.forEach((a) => {
      a.pos.set(a.team === 0 ? -0.9 : 0.9, 0, 0); a.target.copy(a.pos);
      match.setPose(a, 'guard'); a.faceTarget = match.actors[1 - a.team];
    });
    match.ball.holder = match.actors[0];
  }

  update(dt: number) {
    if (this.match.isStopped) return;
    for (const a of this.match.actors) {
      const opponent = this.match.actors[1 - a.team];
      if (!a.scripted && a.pose !== 'fall') {
        a.target.set((a.team === 0 ? -1 : 1) * (0.8 + Math.sin(this.match.time * 0.5) * 0.2), 0, Math.sin(this.match.time * 0.9) * 1.3);
        a.faceTarget = opponent;
        if (a.pose === 'normal') this.match.setPose(a, 'guard', Infinity, opponent);
      }
      a.target.x = THREE.MathUtils.clamp(a.target.x, -2.4, 2.4);
      a.target.z = THREE.MathUtils.clamp(a.target.z, -2.4, 2.4);
    }
    if (this.match.ballScripted || (this.next -= dt) > 0) return;
    const a = this.match.actors[Math.floor(this.match.time) % 2];
    this.match.setPose(a, 'jab', 0.4, this.match.actors[1 - a.team]);
    this.next = 2.4;
  }

  action(kind: SportAction, actor: Actor, target?: Actor) {
    const opponent = target ?? this.match.actors[1 - actor.team];
    const pose = kind === 'knockdown' ? 'uppercut' : kind === 'counter' ? 'hook' : kind;
    this.match.setPose(actor, pose === 'jab' || pose === 'hook' || pose === 'uppercut' ? pose : 'jab', 0.65, opponent);
    this.match.setPose(opponent, kind === 'knockdown' ? 'fall' : 'recoil', kind === 'knockdown' ? 2.5 : 0.6, actor);
    this.match.score[actor.team] += kind === 'knockdown' ? 2 : 1;
    this.match.excitement = kind === 'knockdown' ? 1 : 0.7;
  }

  scoreText() { return `${this.match.score[0]} - ${this.match.score[1]}`; }
}
