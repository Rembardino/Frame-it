import * as THREE from 'three';
import type { Actor, Match, TeamId } from '../match';
import type { SportAction, SportSimulation } from './types';
import { NetBall } from './netBall';

export class VolleyballSimulation implements SportSimulation {
  private ball: NetBall;
  private wait = 1;
  private touch = 0;
  private server: TeamId = 0;
  constructor(private match: Match) {
    this.ball = new NetBall(match);
    match.actors.forEach((a, i) => {
      const j = i % 6;
      a.base = { x: j < 3 ? 2 : 6, z: (j % 3 - 1) * 2.8 };
      a.pos.set((a.team === 0 ? -1 : 1) * a.base.x, 0, a.base.z); a.target.copy(a.pos);
    });
    this.ball.hold(match.actors[3]);
  }

  update(dt: number) {
    if (this.match.isStopped) return;
    const winner = this.ball.update(dt);
    if (winner !== null) {
      this.match.score[winner]++; this.server = winner; this.touch = 0;
      this.match.actors.filter((a) => a.team === winner).forEach((a) => this.match.setPose(a, 'celebrate', 1));
      this.ball.hold(this.match.actors.find((a) => a.team === winner && a.role === 'def')!); this.wait = 1.5;
    }
    for (const a of this.match.actors) {
      if (!a.scripted) a.target.set((a.team === 0 ? -1 : 1) * a.base.x, 0, a.base.z + Math.sin(this.match.time + a.id) * 0.3);
      a.target.x = a.team === 0 ? THREE.MathUtils.clamp(a.target.x, -8.5, -0.7) : THREE.MathUtils.clamp(a.target.x, 0.7, 8.5);
      a.target.z = THREE.MathUtils.clamp(a.target.z, -4, 4);
    }
    if (this.match.ballScripted || this.ball.flying || (this.wait -= dt) > 0) return;
    const a = this.match.ball.holder ?? this.match.actors[this.server * 6 + 3];
    const kind = ['receive', 'set', 'spike'][this.touch++ % 3] as SportAction;
    const team = kind === 'spike' ? 1 - a.team : a.team;
    const role = kind === 'receive' ? 'mid' : kind === 'set' ? 'fwd' : 'def';
    const next = this.match.actors.find((p) => p.team === team && p.role === role && p !== a)!;
    // Lo scambio di sottofondo resta in gioco; il punto decisivo viene dal copione.
    this.action(kind === 'spike' ? 'serve' : kind, a, next); this.wait = 0.25;
  }

  action(kind: SportAction, actor: Actor, target?: Actor) {
    const finish = kind === 'spike' || kind === 'block' || kind === 'ace';
    const next = target ?? this.match.actors.find((a) => a.team !== actor.team && a.role === 'def')!;
    const side = actor.team === 0 ? 1 : -1;
    const to = finish ? new THREE.Vector3(side * (kind === 'block' ? 2 : 5.5), 0.2, actor.pos.z * 0.5) : next.pos.clone().setY(kind === 'set' ? 3.1 : 1.2);
    this.match.setPose(actor, kind === 'receive' ? 'receive' : kind === 'set' ? 'set' : kind === 'block' ? 'block' : 'spike', 0.8, next);
    this.ball.launch(actor, to, kind === 'set' || kind === 'ace' ? 1.15 : 0.95,
      kind === 'set' || kind === 'ace' ? 1.5 : kind === 'block' ? 0.85 : finish ? 0.6 : 2,
      false, finish ? null : next, finish ? actor.team : null, kind === 'spike' || kind === 'block' ? 3.4 : kind === 'serve' || kind === 'ace' ? 2.8 : 1.1);
    this.match.excitement = finish ? 1 : 0.5;
  }

  scoreText() { return `${this.match.score[0]} - ${this.match.score[1]}`; }
}
