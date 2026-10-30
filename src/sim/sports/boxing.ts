import * as THREE from 'three';
import type { Actor, Match } from '../match';
import type { SportAction, SportSimulation } from './types';
import { CONFIG } from '../../config';

const AMBIENT_PUNCHES: SportAction[] = ['jab', 'jab', 'hook', 'uppercut'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Tre riprese arcade: colpi puliti, difesa, combinazioni e knockdown recuperabili. */
export class BoxingSimulation implements SportSimulation {
  private next = 2;
  private hits: { actor: Actor; opponent: Actor; kind: SportAction; delay: number }[] = [];
  /** Combinazione automatica in corso: chi attacca e i colpi che restano. */
  private attacker: Actor | null = null;
  private combo: SportAction[] = [];
  /** 0 = a distanza, 1 = corpo a corpo: i pugili entrano per colpire ed escono subito dopo. */
  private engage = 0;
  /** L'ultimo colpo della combinazione verrà schivato. */
  private slip = false;
  /** Dopo un knockdown chi l'ha messo a terra esulta, con un attimo di ritardo. */
  private cheer: { actor: Actor; in: number } | null = null;
  /** Ripresa in corso; tra una ripresa e l'altra ognuno torna al suo angolo (-1 = si combatte). */
  private round = 1;
  private pause = -1;
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
      // Fuori distanza, già a terra o schivato abbassandosi: colpo a vuoto.
      if (hit.actor.pos.distanceTo(hit.opponent.pos) > 1.85 || hit.opponent.pose === 'fall' || hit.opponent.pose === 'crouch') continue;
      // Nello scambio di sottofondo una parte dei colpi finisce sui guantoni: niente punto, reazione breve.
      if (!this.match.ballScripted && hit.kind !== 'knockdown' && hit.opponent.pose === 'guard' && Math.random() < 0.32) {
        this.match.setPose(hit.opponent, 'recoil', 0.28, hit.actor);
        this.match.sound('punch', hit.opponent.pos, 0.3);
        this.match.excitement = Math.max(this.match.excitement, 0.45);
        continue;
      }
      this.match.setPose(hit.opponent, hit.kind === 'knockdown' ? 'fall' : 'recoil', hit.kind === 'knockdown' ? 2.5 : 0.55, hit.actor);
      // Contano solo i colpi all'avversario, non quelli a chi invade il ring.
      if (this.match.actors.includes(hit.opponent)) this.match.score[hit.actor.team] += hit.kind === 'knockdown' ? 2 : 1;
      this.match.sound(hit.kind === 'knockdown' ? 'knockdown' : 'punch', hit.opponent.pos, hit.kind === 'jab' ? 0.6 : 1);
      this.match.excitement = hit.kind === 'knockdown' ? 1 : 0.7;
      if (hit.kind === 'knockdown') this.cheer = { actor: hit.actor, in: 0.5 };
    }
    this.hits = this.hits.filter(hit => hit.delay > 0);
    if (this.cheer && (this.cheer.in -= dt) <= 0) {
      this.match.setPose(this.cheer.actor, 'celebrate', 1.8);
      this.cheer = null;
    }
    if (this.betweenRounds(dt)) return;

    const t = this.match.time;
    // Durante un'azione del regista restano a distanza di pugno, altrimenti vanno e vengono.
    const close = this.match.ballScripted || this.attacker ? 1 : 0;
    this.engage += (close - this.engage) * (1 - Math.exp(-dt * 3));
    // Il centro del combattimento gira per tutto il ring, non solo al centro.
    const cx = Math.sin(t * 0.31) * 1.3 + Math.sin(t * 0.13 + 2) * 0.4;
    const cz = Math.sin(t * 0.27 + 1) * 1.1;
    const radius = 1 - this.engage * 0.38 + Math.sin(t * 1.3) * 0.07;
    const angle = Math.sin(t * 0.42) * 0.9 + Math.sin(t * 0.87) * 0.2;
    for (const a of this.match.actors) {
      const opponent = this.match.actors[1 - a.team];
      if (!a.scripted && a.pose !== 'fall') {
        const ang = angle + a.team * Math.PI;
        // Piccoli passi laterali, ognuno col suo ritmo.
        const sway = Math.sin(t * 2.1 + a.team * 1.7) * 0.15;
        a.target.set(cx - Math.cos(ang) * radius - Math.sin(ang) * sway, 0, cz - Math.sin(ang) * radius + Math.cos(ang) * sway);
        if (a.pose === 'recoil') {
          const retreat = a.pos.clone().sub(opponent.pos).normalize();
          a.target.copy(a.pos).addScaledVector(retreat, 0.35);
        }
        a.speedLimit = CONFIG.match.runSpeed * 0.8;
        a.faceTarget = opponent;
        if (a.pose === 'normal') this.match.setPose(a, 'guard', Infinity, opponent);
        // Chi esulta si allontana di qualche passo, a braccia alzate.
        if (a.pose === 'celebrate') a.target.copy(a.pos).addScaledVector(a.pos.clone().sub(opponent.pos).normalize(), 0.6);
      }
      a.target.x = THREE.MathUtils.clamp(a.target.x, -2.4, 2.4);
      a.target.z = THREE.MathUtils.clamp(a.target.z, -2.4, 2.4);
    }

    if (this.match.ballScripted) { this.attacker = null; this.combo = []; return; }
    if ((this.next -= dt) > 0) return;
    if (!this.attacker) {
      // Nuova combinazione: 1-3 colpi. A volte chi la subisce si abbassa e la schiva.
      const a = this.match.actors[Math.random() < 0.5 ? 0 : 1], opponent = this.match.actors[1 - a.team];
      if (a.pose === 'fall' || opponent.pose === 'fall') { this.next = 0.5; return; }
      this.attacker = a;
      this.combo = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => AMBIENT_PUNCHES[Math.floor(Math.random() * AMBIENT_PUNCHES.length)]);
      this.next = 0.35; // il tempo di entrare
      this.slip = Math.random() < 0.3;
      return;
    }
    const a = this.attacker, opponent = this.match.actors[1 - a.team];
    if (this.combo.length && a.pose !== 'fall' && opponent.pose !== 'fall') {
      if (this.slip && this.combo.length === 1) this.match.setPose(opponent, 'crouch', 0.45, a);
      this.action(this.combo.shift()!, a);
      this.next = 0.42;
    } else {
      this.attacker = null;
      this.next = rand(0.7, 1.6);
    }
  }

  /** Fine ripresa (ogni terzo di partita): pausa all'angolo, poi si riparte dal centro. true = pausa in corso. */
  private betweenRounds(dt: number) {
    const M = CONFIG.match;
    if (this.pause < 0) {
      const due = this.round < 3 && this.match.clock > (M.durationSec / 3) * this.round;
      if (!due || this.match.ballScripted || this.hits.length || this.match.actors.some((a) => a.pose === 'fall')) return false;
      this.pause = 0;
      this.attacker = null; this.combo = [];
      this.match.phase = 'reset';
      this.match.sound('bell', new THREE.Vector3());
      this.match.actors.forEach((a) => this.match.setPose(a, 'normal'));
    }
    this.pause += dt;
    for (const a of this.match.actors) {
      const side = a.team === 0 ? -1 : 1;
      // Angoli opposti in diagonale: rosso davanti a sinistra, blu dietro a destra.
      a.target.set(side * 2.2, 0, -side * 2.2);
      a.speedLimit = M.walkSpeed * 1.4;
      a.faceTarget = this.match.actors[1 - a.team];
    }
    if (this.pause < M.resetSec + 1.5) return true;
    this.pause = -1;
    this.round++;
    this.match.phase = 'play';
    this.match.sound('bell', new THREE.Vector3());
    this.match.actors.forEach((a) => this.match.setPose(a, 'guard', Infinity, this.match.actors[1 - a.team]));
    this.next = 1;
    return false;
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
