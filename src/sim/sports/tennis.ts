import * as THREE from 'three';
import type { Actor, Match, TeamId } from '../match';
import type { SportAction, SportSimulation } from './types';
import { NetBall } from './netBall';
import { CONFIG } from '../../config';

export class TennisSimulation implements SportSimulation {
  private ball: NetBall;
  private points: [number, number] = [0, 0];
  private wait = 1;
  private server: TeamId = 0;
  get busy() { return this.ball.flying; }
  constructor(private match: Match) {
    this.ball = new NetBall(match);
    match.actors.forEach((a) => { a.pos.set(a.team === 0 ? -10.5 : 10.5, 0, 0); a.target.copy(a.pos); });
    this.ball.hold(match.actors[0]);
  }

  update(dt: number) {
    if (this.match.isStopped) return;
    const winner = this.ball.update(dt);
    if (winner !== null) this.award(winner);
    for (const a of this.match.actors) {
      if (!a.scripted) {
        const incoming = this.ball.targetTeam === a.team ? this.ball.landing : null;
        const side = a.team === 0 ? -1 : 1;
        // Recover toward the bisector after a shot; move to meet even a winning ball.
        const z = incoming?.z ?? THREE.MathUtils.clamp(this.match.ball.pos.z * 0.28, -1.7, 1.7);
        a.target.set(incoming ? incoming.x + side * 0.45 : side * 10.2, 0, THREE.MathUtils.clamp(z, -3.8, 3.8));
        a.speedLimit = incoming ? CONFIG.match.sprintSpeed : CONFIG.match.jogSpeed;
      }
      a.target.x = a.team === 0 ? THREE.MathUtils.clamp(a.target.x, -11.4, -1.1) : THREE.MathUtils.clamp(a.target.x, 1.1, 11.4);
      a.target.z = THREE.MathUtils.clamp(a.target.z, -4, 4);
    }
    if (this.match.ballScripted || this.ball.flying) return;
    if ((this.wait -= dt) > 0) return;
    const a = this.match.ball.holder ?? this.match.actors[this.server];
    this.action(Math.sin(this.match.time * 0.5 + a.team) > 0 ? 'forehand' : 'backhand', a,
      this.match.actors.find((p) => p.team !== a.team));
    this.wait = 0.08;
  }

  action(kind: SportAction, actor: Actor, target?: Actor) {
    const opponent = target ?? this.match.actors.find((a) => a.team !== actor.team)!;
    const finishing = ['winner', 'ace', 'smash', 'backhandWinner', 'volleyWinner'].includes(kind);
    const side = opponent.team === 0 ? -1 : 1;
    const to = new THREE.Vector3(side * (kind === 'serve' || kind === 'ace' ? 5.6 : 9.6), finishing ? 0.12 : 1,
      finishing ? (actor.pos.z > 0 ? -3.6 : 3.6) : THREE.MathUtils.clamp(-actor.pos.z * 0.5 + Math.sin(this.match.time * 0.73) * 2.4, -3.4, 3.4));
    // A player approaching the net receives in front, rather than catching a ball behind them.
    if (!finishing && opponent.scripted) {
      to.x = opponent.target.x - side * 0.45;
      to.z = THREE.MathUtils.clamp(opponent.target.z, -3.8, 3.8);
    }
    this.match.setPose(actor, kind === 'serve' || kind === 'ace' ? 'serve' : kind === 'smash' ? 'spike' : kind === 'backhand' || kind === 'backhandWinner' ? 'backhand' : 'racket', 0.55, opponent);
    if (!opponent.scripted) opponent.target.copy(to).setY(0);
    this.ball.launch(actor, to, finishing ? 1.1 : 1.25, kind === 'lob' ? 3.5 : kind === 'serve' || kind === 'ace' ? 1.3 : kind === 'smash' ? 0.35 : 0.85, kind !== 'lob',
      finishing ? null : opponent, finishing ? actor.team : null);
    this.match.excitement = finishing ? 0.95 : 0.5;
  }

  private award(team: TeamId) {
    this.points[team]++;
    const other = (1 - team) as TeamId;
    if (this.points[team] >= 4 && this.points[team] - this.points[other] >= 2) {
      this.match.score[team]++; this.points = [0, 0]; this.server = (1 - this.server) as TeamId;
    }
    this.match.setPose(this.match.actors[team], 'celebrate', 1);
    this.ball.hold(this.match.actors[this.server]); this.wait = 1.5;
  }

  scoreText() {
    const p = (t: TeamId) => this.points[0] >= 3 && this.points[1] >= 3
      ? this.points[t] > this.points[1 - t] ? 'AD' : '40'
      : ['0', '15', '30', '40'][Math.min(3, this.points[t])];
    return `${this.match.score[0]}–${this.match.score[1]} · ${p(0)}–${p(1)}`;
  }
}
