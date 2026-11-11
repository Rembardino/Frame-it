import * as THREE from 'three';
import type { Actor, Match, TeamId } from '../match';
import type { SportAction, SportSimulation } from './types';
import { NetBall } from './netBall';
import { CONFIG } from '../../config';
import { netContactPoint, TENNIS_SERVE } from '../../animation/motion';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class TennisSimulation implements SportSimulation {
  private ball: NetBall;
  private points: [number, number] = [0, 0];
  private server: TeamId = 0;
  /** Secondi dalla fine dell'ultimo punto (-1 = si gioca): esultanza, ritorno a fondo campo, servizio. */
  private between = 1.2;
  /** Colpi dello scambio in corso: più si allunga, più è facile sbagliare. */
  private rally = 0;
  get busy() { return this.ball.flying; }
  constructor(private match: Match) {
    this.ball = new NetBall(match);
    match.actors.forEach((a) => { a.pos.set(a.team === 0 ? -10.5 : 10.5, 0, 0); a.target.copy(a.pos); });
    this.ball.hold(match.actors[0]);
    match.phase = 'reset';
  }

  update(dt: number) {
    if (this.match.isStopped) return;
    const winner = this.ball.update(dt);
    if (winner !== null) this.award(winner);
    // Palla in arrivo: chi deve colpire apre il colpo mentre corre (poseDir: +1 dritto, −1 rovescio; lo legge la posa 'normal').
    for (const a of this.match.actors) {
      const pose = this.ball.receiver === a && a.pose === 'normal' && this.ball.remaining < 0.85 ? this.ball.receivingPose : null;
      a.poseDir += ((pose === 'racket' ? 1 : pose === 'backhand' ? -1 : 0) - a.poseDir) * Math.min(1, dt * 7);
    }
    // Mentre un copione ha la palla, comanda lui; la pausa tra i punti riprende dopo.
    if (this.between >= 0 && !this.match.ballScripted) return this.betweenPoints(dt);
    for (const a of this.match.actors) {
      if (!a.scripted) {
        const incoming = this.ball.targetTeam === a.team ? this.ball.landing : null;
        const side = a.team === 0 ? -1 : 1;
        // Recover toward the bisector after a shot; move to meet even a winning ball.
        const z = incoming?.z ?? THREE.MathUtils.clamp(this.match.ball.pos.z * 0.28, -1.7, 1.7);
        const pose = this.ball.receivingPose ?? 'racket';
        const reach = incoming ? netContactPoint(a, this.match.time, 0.55 * 0.32, pose, 0.55).sub(a.pos) : null;
        a.target.set(incoming ? incoming.x - reach!.x : side * 10.2, 0,
          THREE.MathUtils.clamp(incoming ? z - reach!.z : z, -3.8, 3.8));
        if (this.match.ball.holder === a) a.target.copy(a.pos);
        a.speedLimit = incoming ? CONFIG.match.sprintSpeed : CONFIG.match.jogSpeed;
      }
      a.target.x = a.team === 0 ? THREE.MathUtils.clamp(a.target.x, -11.4, -1.1) : THREE.MathUtils.clamp(a.target.x, 1.1, 11.4);
      a.target.z = THREE.MathUtils.clamp(a.target.z, -4, 4);
    }
    if (this.match.ballScripted || this.ball.flying) return;
    const a = this.match.ball.holder ?? this.match.actors[this.server];
    const opponent = this.match.actors.find((p) => p.team !== a.team)!;
    this.rally++;
    // Errore non forzato: raro all'inizio dello scambio, sempre più probabile man mano che si allunga.
    if (this.rally >= 3 && Math.random() < 0.035 + this.rally * 0.012) this.unforcedError(a, opponent);
    else {
      // Dritto se la palla è dal lato della racchetta, altrimenti rovescio.
      const forehand = a.pose === 'racket' || (a.pose !== 'backhand' && (this.match.ball.pos.z - a.pos.z) * (a.team === 0 ? -1 : 1) >= 0);
      this.action(forehand ? 'forehand' : 'backhand', a, opponent);
    }
  }

  action(kind: SportAction, actor: Actor, target?: Actor) {
    const opponent = target ?? this.match.actors.find((a) => a.team !== actor.team)!;
    const finishing = ['winner', 'ace', 'smash', 'backhandWinner', 'volleyWinner'].includes(kind);
    const serve = kind === 'serve' || kind === 'ace';
    const side = opponent.team === 0 ? -1 : 1;
    // Scambio di sottofondo: profondità, angolo e velocità cambiano a ogni colpo (corta, lunga, incrociata).
    const ambient = !this.match.ballScripted && !finishing && !serve && kind !== 'lob';
    const cross = -Math.sign(actor.pos.z || 1);
    // Ogni tanto una palla corta, se l'avversario è rimasto a fondo campo.
    const short = ambient && this.rally >= 2 && Math.abs(opponent.pos.x) > 9.5 && Math.random() < 0.1;
    // Dove l'avversario colpirà. Il servizio va in diagonale: rimbalza nel rettangolo di battuta e arriva a fondo campo.
    const to = serve ? new THREE.Vector3(side * rand(9.9, 10.7), 1, cross * rand(1.2, 3.3))
      : new THREE.Vector3(side * (short ? rand(3.2, 4.6) : ambient ? rand(7, 10.8) : 9.6), short ? 0.7 : 1,
        ambient ? THREE.MathUtils.clamp(-actor.pos.z * 0.4 + rand(-2.9, 2.9), -3.6, 3.6)
          : THREE.MathUtils.clamp(-actor.pos.z * 0.5 + Math.sin(this.match.time * 0.73) * 2.4, -3.4, 3.4));
    // A player approaching the net receives in front, rather than catching a ball behind them.
    if (!finishing && opponent.scripted) {
      to.x = opponent.target.x - side * 0.45;
      to.z = THREE.MathUtils.clamp(opponent.target.z, -3.8, 3.8);
    }
    this.strikePose(actor, serve ? 'serve' : kind === 'smash' ? 'spike' : kind === 'backhand' || kind === 'backhandWinner' ? 'backhand' : 'racket', opponent);
    const from = this.match.ball.pos;
    let duration = ambient ? Math.max(0.8, to.distanceTo(from) / rand(16, 23)) : serve && !finishing ? Math.max(0.75, to.distanceTo(actor.pos) / rand(24, 30)) : finishing ? 1.1 : 1.25;
    // Tempo che serve all'avversario per arrivarci. Se la palla è più veloce di lui, nello scambio libero è un vincente:
    // niente più palle che rallentano in aria per farsi raggiungere.
    const need = Math.hypot(to.x - opponent.pos.x, to.z - opponent.pos.z) / CONFIG.match.sprintSpeed + 0.28;
    const winner = finishing || (ambient && this.rally >= 2 && need > duration * 1.2 && (need > duration * 1.6 || Math.random() < 0.5));
    if (winner) {
      // Rimbalza in campo (per i colpi del regista nell'angolo lontano) e prosegue verso il fondo: l'avversario la rincorre invano.
      const bounce = finishing ? new THREE.Vector3(side * (serve ? 5.6 : 9.6), 0, serve ? cross * 3.4 : actor.pos.z > 0 ? -3.6 : 3.6) : to.clone();
      to.copy(serve ? actor.pos : from).lerp(bounce, 1 / 0.78).setY(0.7);
    } else duration = Math.max(duration, need);
    if (!opponent.scripted) opponent.target.copy(to).setY(0);
    const nextPose = kind === 'lob' ? 'spike' : (to.z - opponent.pos.z) * side > 0 ? 'racket' : 'backhand';
    this.ball.launch(actor, to, duration, kind === 'lob' ? 3.5 : serve ? 0.4 : kind === 'smash' ? 0.35 : ambient ? rand(0.6, 1.1) : 0.85,
      kind !== 'lob' && !(opponent.scripted && Math.abs(to.x) < 4), winner ? null : opponent, winner ? actor.team : null, winner ? null : nextPose,
      serve ? TENNIS_SERVE.duration * TENNIS_SERVE.contact : undefined);
    this.between = -1;
    this.match.phase = 'play';
    this.match.excitement = finishing ? 0.95 : winner ? 0.8 : 0.5;
  }

  /** Palla in rete o lunga: lo scambio finisce e il punto va all'avversario. */
  private unforcedError(actor: Actor, opponent: Actor) {
    const side = opponent.team === 0 ? -1 : 1;
    const long = Math.random() < 0.55;
    const to = long
      ? new THREE.Vector3(side * rand(12.4, 13.2), CONFIG.visuals.ballRadius * CONFIG.visuals.ballScale, THREE.MathUtils.clamp(-actor.pos.z * 0.4 + rand(-3, 3), -4, 4))
      : new THREE.Vector3(-side * 0.25, 0.75, THREE.MathUtils.clamp(actor.pos.z * 0.3 + rand(-1.5, 1.5), -3, 3));
    const forehand = actor.pose === 'racket' || (actor.pose !== 'backhand' && (this.match.ball.pos.z - actor.pos.z) * (actor.team === 0 ? -1 : 1) >= 0);
    this.strikePose(actor, forehand ? 'racket' : 'backhand', opponent);
    if (!opponent.scripted) opponent.target.set(side * 10.2, 0, THREE.MathUtils.clamp(to.z, -3.8, 3.8));
    this.ball.launch(actor, to, long ? to.distanceTo(this.match.ball.pos) / 19 : 0.6, long ? 1.3 : 0.4, false, null, opponent.team);
    this.match.excitement = 0.45;
  }

  private strikePose(actor: Actor, pose: 'racket' | 'backhand' | 'serve' | 'spike', opponent: Actor) {
    const prepared = this.match.ball.holder === actor && ['racket', 'backhand', 'spike'].includes(actor.pose) && actor.poseTime <= 0.4;
    if (actor.pose !== pose || !prepared) {
      const time = prepared ? actor.poseTime : 0;
      this.match.setPose(actor, pose, pose === 'serve' ? TENNIS_SERVE.duration : 0.55, opponent);
      actor.poseTime = time;
    } else actor.faceTarget = opponent;
    actor.target.copy(actor.pos);
  }

  private betweenPoints(dt: number) {
    const B = CONFIG.match;
    this.between += dt;
    // Lato destro o sinistro del campo, alternato a ogni punto; si risponde in diagonale.
    const lane = (this.points[0] + this.points[1]) % 2 === 0 ? 1 : -1;
    for (const a of this.match.actors) {
      const side = a.team === 0 ? -1 : 1, serving = a.team === this.server;
      // Prima esultano (o si disperano) sul posto, poi tornano a fondo campo.
      if (this.between < B.celebrateSec * 0.5) a.target.copy(a.pos);
      else a.target.set(side * (serving ? 11.4 : 10.8), 0, serving ? lane * 1.2 : -lane * 2.6);
      a.speedLimit = B.jogSpeed;
      a.faceTarget = this.match.actors[1 - a.team];
    }
    const ready = this.match.actors.every((a) => a.pos.distanceTo(a.target) < 0.4);
    if (!ready && this.between > B.resetSec + B.resetCutSec) { this.match.cutToTargets(); this.between = B.resetSec - 0.6; }
    if (!ready || this.between < B.resetSec) return;
    this.between = -1;
    this.rally = 0;
    this.match.phase = 'play';
    const server = this.match.actors[this.server];
    this.ball.hold(server);
    this.action('serve', server, this.match.actors[1 - this.server]);
  }

  private award(team: TeamId) {
    this.points[team]++;
    this.match.sound('point', this.match.actors[team].pos);
    const other = (1 - team) as TeamId;
    if (this.points[team] >= 4 && this.points[team] - this.points[other] >= 2) {
      this.match.score[team]++; this.points = [0, 0]; this.server = (1 - this.server) as TeamId;
    }
    this.match.setPose(this.match.actors[team], 'celebrate', CONFIG.match.celebrateSec * 0.5);
    this.match.setPose(this.match.actors[1 - team], 'dejected', CONFIG.match.celebrateSec * 0.5);
    this.ball.hold(this.match.actors[this.server]);
    this.between = 0;
    this.match.phase = 'reset';
  }

  /** Punti del game come si dicono nel tennis. */
  private called(t: TeamId) {
    return this.points[0] >= 3 && this.points[1] >= 3
      ? this.points[t] > this.points[1 - t] ? 'AD' : '40'
      : ['0', '15', '30', '40'][Math.min(3, this.points[t])];
  }

  scoreText() { return `${this.match.score[0]}–${this.match.score[1]} · ${this.called(0)}–${this.called(1)}`; }

  /** Maxischermo: game vinti e punti del game in corso, come nel punteggio in alto. */
  board() { return { main: this.match.score.map(String) as [string, string], extra: [this.called(0), this.called(1)] as [string, string] }; }
}
