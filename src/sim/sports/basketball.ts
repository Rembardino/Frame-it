import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Actor, Flight, Match, MatchPhase, ShotOutcome, TeamId } from '../match';

const direction = (team: TeamId) => team === 0 ? 1 : -1;
const distance = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
interface Controls {
  phase(phase: MatchPhase): void;
  hold(actor: Actor, hold: number, hands: boolean): void;
  shot(actor: Actor, outcome: ShotOutcome): void;
  goal(actor: Actor, points: number): void;
  rest(to: THREE.Vector3): void;
}

/** Dead-ball possessions are played on court: walk to the line, deliver the ball, then resume. */
export class BasketballRules {
  readonly fouls: [number, number] = [0, 0];
  inbound: { team: TeamId; taker: Actor; receiver: Actor; spot: THREE.Vector3; stage: 'collect' | 'take' | 'pass'; elapsed: number } | null = null;
  freeThrows: { shooter: Actor; total: number; left: number; stage: 'lineup' | 'ready' | 'shot' | 'between'; elapsed: number } | null = null;

  constructor(private match: Match, private controls: Controls) {}

  startInbound(team: TeamId, at = this.match.ball.pos, afterBasket = false) {
    const m = this.match, half = CONFIG.pitch.length / 2, width = CONFIG.pitch.width / 2;
    const endline = afterBasket || half - Math.abs(at.x) < width - Math.abs(at.z);
    const spot = endline
      ? new THREE.Vector3(afterBasket ? -direction(team) * (half + 0.55) : Math.sign(at.x || 1) * (half + 0.55), 0, THREE.MathUtils.clamp(at.z, -width + 1, width - 1))
      : new THREE.Vector3(THREE.MathUtils.clamp(at.x, -half + 1, half - 1), 0, Math.sign(at.z || 1) * (width + 0.55));
    const players = m.actors.filter(a => a.team === team && a.pose !== 'fall').sort((a, b) => distance(a.pos, at) - distance(b.pos, at));
    const taker = players[0], receiver = players.find(a => a !== taker && a.role === 'mid') ?? players[1];
    this.freeThrows = null;
    this.inbound = { team, taker, receiver, spot, stage: 'collect', elapsed: 0 };
    this.controls.phase('inbound'); m.ballScripted = true;
    for (const a of m.actors) {
      a.scripted = false;
      if (['celebrate', 'dejected', 'windUp', 'shoot', 'dunk'].includes(a.pose)) m.setPose(a, 'normal');
    }
    taker.outOfBounds = endline ? 'endline' : 'sideline';
  }

  foul(fouler: Actor, victim: Actor, shots: 0 | 1 | 2 | 3) {
    const m = this.match;
    if (m.over || fouler.team === victim.team) return;
    this.fouls[fouler.team]++;
    m.stopPlay();
    m.setPose(m.referee, 'wave', 1, victim);
    if (!shots) return this.startInbound(victim.team, victim.pos);
    this.inbound = null;
    this.freeThrows = { shooter: victim, total: shots, left: shots, stage: 'lineup', elapsed: 0 };
    this.controls.phase('freeThrow'); m.ballScripted = true;
    for (const a of m.actors) { a.scripted = false; a.outOfBounds = undefined; m.setPose(a, 'normal'); }
    this.controls.hold(victim, Infinity, true);
  }

  update(dt: number) {
    const m = this.match, inbound = this.inbound, free = this.freeThrows;
    if (inbound) {
      inbound.elapsed += dt;
      const { taker, receiver, spot } = inbound;
      for (const a of m.actors) {
        a.speedLimit = CONFIG.match.runSpeed;
        if (a !== taker && a !== receiver) {
          a.target.set(direction(a.team) * (CONFIG.pitch.length / 2 - a.base.x), 0, a.base.z);
        }
      }
      receiver.target.copy(spot).setY(0);
      if (taker.outOfBounds === 'endline') receiver.target.x = Math.sign(spot.x) * (CONFIG.pitch.length / 2 - 3.2);
      else receiver.target.z = Math.sign(spot.z) * (CONFIG.pitch.width / 2 - 2.8);
      if (inbound.stage === 'collect') {
        taker.target.copy(m.ball.pos).setY(0);
        if (m.ball.state !== 'flight' && distance(taker.pos, m.ball.pos) < 0.75) {
          this.controls.hold(taker, Infinity, true); inbound.stage = 'take'; inbound.elapsed = 0;
        }
      } else if (inbound.stage === 'take') {
        taker.target.copy(spot);
        if (distance(taker.pos, spot) < 0.3 && (distance(receiver.pos, receiver.target) < 0.65 || inbound.elapsed > 4.5) && inbound.elapsed > 0.4) {
          m.scriptPass(taker, receiver); inbound.stage = 'pass';
        }
      } else if (!m.ball.flight?.release) {
        taker.target.copy(receiver.target); this.inbound = null;
        this.controls.phase('play'); m.ballScripted = false;
      }
      return;
    }
    if (!free) return;
    free.elapsed += dt;
    const shooter = free.shooter, d = direction(shooter.team), half = CONFIG.pitch.length / 2;
    const opponents = m.actors.filter(a => a.team !== shooter.team), mates = m.actors.filter(a => a.team === shooter.team && a !== shooter);
    const lane = [opponents[0], opponents[1], mates[0], mates[1], opponents[2]];
    const slots = [[2.7, -2.7], [2.7, 2.7], [4.15, -2.7], [4.15, 2.7], [5.35, -2.7]];
    shooter.target.set(d * (half - 5.95), 0, 0);
    lane.forEach((a, i) => a.target.set(d * (half - slots[i][0]), 0, slots[i][1]));
    m.actors.filter(a => a !== shooter && !lane.includes(a)).forEach((a, i) => a.target.set(d * (half - 8 - Math.floor(i / 2) * 1.4), 0, (i % 2 ? 1 : -1) * 4.8));
    for (const a of m.actors) a.speedLimit = CONFIG.match.runSpeed;
    if (free.stage === 'lineup' && m.actors.every(a => distance(a.pos, a.target) < 0.5) && free.elapsed > 0.8) {
      free.stage = 'ready'; free.elapsed = 0; m.setPose(shooter, 'windUp', 0.7);
    } else if (free.stage === 'ready' && free.elapsed > 0.65) {
      free.stage = 'shot'; this.controls.shot(shooter, Math.random() < 0.78 ? 'goal' : 'save');
    } else if (free.stage === 'between' && free.elapsed > 0.8 && !m.ball.flight) {
      this.controls.hold(shooter, Infinity, true); m.setPose(shooter, 'windUp', 0.7);
      free.stage = 'ready'; free.elapsed = 0;
    }
  }

  /** Intermediate free throws stay dead; only the final miss produces a live rebound. */
  finish(flight: Flight) {
    const free = this.freeThrows;
    if (!flight.freeThrow || !free) return false;
    free.left--;
    if (free.left > 0) {
      if (flight.shot === 'goal') this.match.score[free.shooter.team]++;
      this.match.sound(flight.shot === 'goal' ? 'swish' : 'rim', flight.to);
      this.controls.rest(flight.to.clone().setY(0.2)); free.stage = 'between'; free.elapsed = 0;
      return true;
    }
    this.freeThrows = null;
    if (flight.shot === 'goal') {
      this.match.sound('swish', flight.to); this.controls.rest(flight.to.clone().setY(0.2));
      this.controls.goal(free.shooter, 1); return true;
    }
    this.controls.phase('play'); this.match.ballScripted = false; flight.freeThrow = false;
    return false;
  }

  stop() { this.inbound = null; this.freeThrows = null; }
}
