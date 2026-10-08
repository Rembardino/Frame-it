/**
 * EVENT DIRECTOR — decide cosa succede e quando.
 *
 * Non simula il calcio: sceglie eventi dalla libreria (dati) e li mette in scena usando le primitive
 * della partita. Garantisce il ritmo (un'azione importante ogni 10-15 s, una distrazione ogni tanto),
 * crea i "dilemmi" (una distrazione il cui istante decisivo cade insieme a quello dell'azione principale,
 * lontano da lei) e tiene il punteggio coerente (niente goleade).
 *
 * Ogni evento in corso è un EventInstance: esegue il copione su un suo orologio, che si ferma se
 * un passaggio o un tiro deve aspettare la palla. Ogni evento ha un MomentTracker che lo valuta.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { type Actor, type Match, type ShotOutcome, type TeamId, clampToPitch, dirOf, xzDist } from '../sim/match';
import { MomentTracker, actorSubject, ballSubject, frameInput, goalSubject, starSubject, subjectCenter, type Subject } from '../scoring/moment';
import type { Component, FrameInput, ScoreResult, Vec3, View } from '../scoring/scoring';
import { LIBRARY } from './library';
import type { Category, Cue, EventDef, Point, ShotPhase, Speed, Step } from './types';

const L = CONFIG.pitch.length;
const D = () => CONFIG.director;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const SPEED: Record<Speed, () => number> = {
  walk: () => CONFIG.match.walkSpeed,
  jog: () => CONFIG.match.jogSpeed,
  run: () => CONFIG.match.runSpeed,
  sprint: () => CONFIG.match.sprintSpeed,
};
const BUSY_POSES = ['dive', 'fall', 'tackle'];

export interface DirectorResult {
  /** Id dell'evento in libreria (o 'order:<id>' per gli ordini del regista). */
  id: string;
  label: string;
  category: Category;
  importance: number;
  /** null = momento perso (non è mai stato inquadrato). */
  result: ScoreResult | null;
  /** Punti partita guadagnati (voto × importanza × 10, più eventuali bonus). */
  points: number;
  /** Bonus del regista per un ordine eseguito. */
  bonus?: number;
  /** Moltiplicatore dell'evento raro (azione precedente ben ripresa). */
  multiplier?: number;
  /** Finestra del momento (tempi assoluti): serve al replay. */
  window: { start: number; decisive: number; end: number };
}

export interface Indicator {
  p: Vec3;
  /** 0..1 */
  intensity: number;
  category: Category;
}

/** Punto del copione -> posizione sul campo, dal punto di vista della squadra che attacca. */
function resolvePoint(p: Point, attack: TeamId, mirror: number, roles: Map<string, Actor>): THREE.Vector3 {
  const d = dirOf(attack);
  if ('goal' in p) return clampToPitch(new THREE.Vector3(d * (L / 2 - p.goal[0]), 0, p.goal[1] * mirror), 0.5);
  if ('near' in p) {
    const a = roles.get(p.near)!;
    const [f, l] = p.off ?? [0, 0];
    return clampToPitch(new THREE.Vector3(a.pos.x + d * f, 0, a.pos.z + l * mirror), 0.5);
  }
  return new THREE.Vector3(d * p.pitch[0], 0, p.pitch[1] * mirror);
}

// ==================================================================== un evento in corso

export class EventInstance {
  readonly tracker: MomentTracker;
  /** Orologio dell'evento: si ferma se un'azione deve aspettare. */
  et = 0;
  done = false;
  aborted = false;
  label: string;
  focus: Vec3 | null = null;
  private stepIdx = 0;
  private cueIdx = 0;
  private blocked = 0;
  private follows = new Map<Actor, { target: Actor; off: [number, number]; speed: number }>();
  /** Movimenti di chi sta ricevendo un passaggio: partono quando ha la palla. */
  private pendingMoves = new Map<Actor, Step & { do: 'move' }>();
  private phaseSubjects = new Map<ShotPhase, { subjects: Subject[]; lead: number }>();
  private stoppedPlay = false;

  constructor(
    readonly def: EventDef,
    private director: Director,
    private match: Match,
    readonly attack: TeamId,
    private mirror: number,
    readonly roles: Map<string, Actor>,
    now: number,
  ) {
    this.label = def.label;
    this.tracker = new MomentTracker({ label: def.label, start: now, decisive: now + def.decisive, end: now + def.duration });
    if (def.ownsBall) match.ballScripted = true;
    for (const s of def.steps) if (s.do === 'effect') match.prepareEffect(s.effect);
  }

  private get defense() {
    return (1 - this.attack) as TeamId;
  }

  tick(dt: number, now: number) {
    const def = this.def;
    // Copione: esegue le azioni scadute, in ordine. Se una deve aspettare, l'orologio si ferma.
    let waiting = false;
    while (this.stepIdx < def.steps.length && def.steps[this.stepIdx].t <= this.et) {
      if (!this.exec(def.steps[this.stepIdx])) { waiting = true; break; }
      this.stepIdx++;
    }
    while (this.cueIdx < def.cues.length && def.cues[this.cueIdx].t <= this.et) this.cue(def.cues[this.cueIdx++]);

    for (const [a, f] of this.follows) {
      const d = dirOf(this.attack);
      a.target.set(f.target.pos.x + d * f.off[0], 0, f.target.pos.z + f.off[1] * this.mirror);
      a.speedLimit = f.speed;
    }
    for (const [a, step] of this.pendingMoves) {
      if (this.match.ball.holder === a) { this.pendingMoves.delete(a); this.move(a, step); }
    }

    if (waiting) {
      this.blocked += dt;
      if (this.blocked > D().abortAfter) { this.aborted = true; this.done = true; }
    } else {
      this.blocked = 0;
      this.et += dt;
    }
    // Finché l'istante decisivo non è passato, la sua ora assoluta segue l'orologio dell'evento.
    const m = this.tracker.moment;
    if (this.et <= def.decisive) m.decisive = now + (def.decisive - this.et);
    m.end = now + Math.max(0, def.duration - this.et);
    m.label = this.label;
    if (this.et >= def.duration) this.done = true;
  }

  /** Esegue un'azione. false = non ancora possibile (aspetta). */
  private exec(s: Step): boolean {
    const m = this.match;
    const role = (name: string) => this.roles.get(name)!;
    switch (s.do) {
      case 'move': {
        const a = role(s.who);
        if (m.ball.flight?.receiver === a) this.pendingMoves.set(a, s);
        else this.move(a, s);
        return true;
      }
      case 'follow': {
        const a = role(s.who);
        a.scripted = true;
        this.pendingMoves.delete(a);
        this.follows.set(a, { target: role(s.target), off: s.off ?? [0, 0], speed: SPEED[s.speed ?? 'run']() });
        return true;
      }
      case 'pass': {
        const to = role(s.to);
        if (!m.scriptPass(role(s.from), to)) return false;
        to.scripted = true;
        this.follows.delete(to);
        return true;
      }
      case 'shoot': {
        const a = role(s.who);
        if (m.ball.holder !== a) return false;
        const outcome = this.director.resolveOutcome(s.outcome, this.attack);
        m.shoot(a, outcome);
        this.label = this.def.outcomeLabels?.[outcome] ?? this.def.label;
        return true;
      }
      case 'pose':
        m.setPose(role(s.who), s.pose, s.dur, s.face ? role(s.face) : null);
        return true;
      case 'sport':
        // Finish the incoming ball instead of replacing a trajectory mid-flight.
        if (m.sportSimulation?.busy) return false;
        m.sportSimulation?.action(s.action, role(s.who), s.target ? role(s.target) : undefined);
        return true;
      case 'whistle':
        m.stopPlay();
        this.stoppedPlay = true;
        return true;
      case 'restart':
        m.restartPlay(s.side === 'attack' ? this.attack : this.defense);
        this.stoppedPlay = false;
        return true;
      case 'release':
        for (const name of s.who ?? [...this.roles.keys()]) this.release(role(name));
        return true;
      case 'effect':
        m.startEffect(s.effect);
        return true;
    }
  }

  private move(a: Actor, s: Step & { do: 'move' }) {
    a.scripted = true;
    this.follows.delete(a);
    a.target.copy(resolvePoint(s.to, this.attack, this.mirror, this.roles));
    a.speedLimit = SPEED[s.speed ?? 'run']();
  }

  private release(a: Actor) {
    a.scripted = false;
    this.follows.delete(a);
    this.pendingMoves.delete(a);
  }

  private cue(c: Cue) {
    if (c.signal === 'crowdLookUp') return this.director.crowdLookUpFor(c.dur ?? 3);
    const a = this.roles.get(c.who!)!;
    if (c.signal === 'crowdRise') this.director.crowdReact(a.pos.x, 0.7);
    else this.match.setPose(a, c.signal, c.dur ?? 0.8);
  }

  /** The tutorial and live scoring share the exact subjects of the current shot phase. */
  framingInput(): FrameInput {
    let phase = this.def.shots[0];
    for (const p of this.def.shots) if (p.from <= this.et) phase = p;
    let ps = this.phaseSubjects.get(phase);
    if (!ps) {
      const subjects = phase.subjects.map((ref) => this.subject(ref));
      const leadName = phase.lead ?? (typeof phase.subjects[0] === 'string' ? phase.subjects[0] : phase.subjects[0][0]);
      const lead = Math.max(0, phase.subjects.findIndex((r) => (typeof r === 'string' ? r : r[0]) === leadName));
      ps = { subjects, lead };
      this.phaseSubjects.set(phase, ps);
    }
    this.focus = subjectCenter(ps.subjects[ps.lead]);
    return frameInput(ps.subjects, ps.lead, phase.size);
  }

  /** Valuta il frame con l'inquadratura ideale della fase in corso. */
  sample(now: number, view: View) {
    this.tracker.sample(now, view, this.framingInput());
  }

  private subject(ref: string | [string, number]): Subject {
    const [name, w] = typeof ref === 'string' ? [ref, undefined] : ref;
    if (name === 'ball') return ballSubject(this.match.ball, w);
    if (name === 'goal') return goalSubject(dirOf(this.attack), w);
    if (name === 'star') return starSubject(this.match);
    return actorSubject(this.roles.get(name)!, this.def.roles[name].label, w);
  }

  /** Fine evento: restituisce tutto al gioco automatico. */
  cleanup() {
    for (const a of this.roles.values()) {
      this.release(a);
      if (a.role === 'fan' || a.role === 'steward') this.match.despawnExtra(a);
    }
    if (this.def.ownsBall) this.match.ballScripted = false;
    if (this.stoppedPlay) this.match.restartPlay(this.attack);
  }
}

// ==================================================================== il direttore

export class Director {
  readonly active: EventInstance[] = [];
  /** Voti dei momenti conclusi: chi li legge svuota la coda. */
  readonly finished: DirectorResult[] = [];
  /** Punto caldo del pubblico (segnale premonitore): x sul campo e intensità 0..1. */
  readonly crowdHot = { x: 0, level: 0 };
  /** 0..1: quanto il pubblico sta guardando il cielo (segnale della stella cadente). */
  crowdLookUp = 0;
  private lookUpTimer = 0;
  /** Ora (Match.clock) dell'evento raro di questa partita, Infinity se non c'è. */
  private rareAt: number;
  /** Ultima azione principale votata: decide il moltiplicatore dell'evento raro. */
  private lastMain = { t: -Infinity, stars: 0 };
  /** Quante volte è stato creato un dilemma (due momenti decisivi insieme, in posti diversi). */
  dilemmas = 0;
  /** Eventi annullati perché il copione si è bloccato (per il bilanciamento). */
  aborted = 0;
  started: string[] = [];

  private stopped = false;
  private nextMain = D().firstMainAt;
  private nextDistraction = D().firstDistractionAt;
  private used = new Set<string>();
  private pendingDilemma: { at: number; def: EventDef } | null = null;

  constructor(private match: Match, private enabled: Component[], opts: { forceRare?: boolean } = {}, private library: EventDef[] = LIBRARY) {
    const r = CONFIG.rare;
    const dur = CONFIG.match.durationSec;
    this.rareAt = opts.forceRare ? 20 : Math.random() < r.chancePerMatch ? rand(r.window[0], r.window[1]) * dur : Infinity;
  }

  crowdLookUpFor(sec: number) {
    this.lookUpTimer = sec;
  }

  update(dt: number, view: View) {
    const m = this.match;
    const now = m.time;
    for (const e of m.events.splice(0)) if (e.type === 'goal') this.trigger('goal', e.scorer);
    this.crowdHot.level = Math.max(0, this.crowdHot.level - dt * 0.35);
    this.lookUpTimer -= dt;
    this.crowdLookUp = Math.min(1, Math.max(0, this.crowdLookUp + (this.lookUpTimer > 0 ? 2.5 : -1.5) * dt));

    for (const inst of [...this.active]) {
      inst.tick(dt, now);
      if (!inst.aborted) inst.sample(now, view);
      if (inst.done) {
        this.active.splice(this.active.indexOf(inst), 1);
        this.finish(inst);
      }
    }
    this.schedule(now);
  }

  /** Quando partirà (circa) la prossima azione principale: la Director Voice lo usa per i suoi ordini. */
  get nextMainAt() {
    return this.nextMain;
  }

  /** Fine partita: niente più eventi nuovi. */
  stop() {
    this.stopped = true;
    this.pendingDilemma = null;
  }

  /** Esito di un tiro coerente col punteggio: chi è già avanti di maxGoalLead non segna più. */
  resolveOutcome(requested: ShotOutcome | undefined, attack: TeamId): ShotOutcome {
    const lead = this.match.score[attack] - this.match.score[1 - attack];
    const goals = this.match.score[0] + this.match.score[1];
    const c = D();
    if (requested === 'goal') return lead >= c.maxGoalLead || goals >= c.goalBudget + 2 ? 'save' : 'goal';
    if (requested) return requested;
    const pGoal = lead >= c.maxGoalLead || goals >= c.goalBudget ? 0 : c.goalChance + (lead < 0 ? 0.15 : 0);
    const r = Math.random();
    return r < pGoal ? 'goal' : r < pGoal + (1 - pGoal) * 0.6 ? 'save' : 'wide';
  }

  crowdReact(x: number, level: number) {
    this.crowdHot.x = x;
    this.crowdHot.level = Math.max(this.crowdHot.level, level);
  }

  /** Il momento da mostrare nel debug: preferisce l'azione principale. */
  focusTracker(): MomentTracker | null {
    const live = this.active.filter((i) => i.tracker.last);
    return (live.find((i) => i.def.category === 'main') ?? live[0])?.tracker ?? null;
  }

  /** Attività importanti in corso, per gli indicatori ai bordi dello schermo. */
  indicators(): Indicator[] {
    const out: Indicator[] = [];
    for (const i of this.active) {
      if (!i.focus) continue;
      const dec = i.def.decisive;
      // Cresce dall'inizio fino all'istante decisivo, poi si spegne.
      const k = i.et <= dec ? 0.35 + 0.65 * (i.et / Math.max(dec, 0.1)) : Math.max(0, 1 - (i.et - dec) / 1.5);
      out.push({ p: i.focus, intensity: i.def.importance * k, category: i.def.category });
    }
    return out;
  }

  // ---------------------------------------------------------------- programmazione

  private schedule(now: number) {
    const m = this.match;
    const c = D();
    if (this.stopped) return;
    if (this.pendingDilemma && now >= this.pendingDilemma.at) {
      if (this.start(this.pendingDilemma.def)) this.dilemmas++;
      this.pendingDilemma = null;
    }
    if (m.phase !== 'play' || this.active.some((i) => i.def.exclusive)) return;

    const mainActive = this.active.some((i) => i.def.category === 'main' && !i.def.trigger);
    // Evento raro: solo in un momento tranquillo, una volta a partita.
    if (m.clock >= this.rareAt && !mainActive && !this.active.some((i) => i.def.category === 'rare')) {
      const def = this.pick('rare');
      if (!def || this.start(def)) this.rareAt = Infinity;
    }
    if (now >= this.nextMain && !mainActive) {
      const def = this.pick('main');
      const inst = def && this.start(def);
      if (inst) {
        this.nextMain = now + rand(c.mainEvery[0], c.mainEvery[1]);
        // Dilemma: una distrazione lontana con l'istante decisivo quasi insieme a quello principale.
        const force = this.dilemmas === 0 && m.clock > c.dilemmaBy * CONFIG.match.durationSec;
        if (!def.exclusive && !this.pendingDilemma && (force || Math.random() < c.dilemmaChance)) {
          const dis = this.pick('distraction', (d) => !d.exclusive);
          if (dis) this.pendingDilemma = { def: dis, at: now + def.decisive - dis.decisive + rand(-0.6, 0.6) };
        }
      }
    }
    if (now >= this.nextDistraction && !this.active.some((i) => i.def.category === 'distraction')) {
      const def = this.pick('distraction', (d) => !d.exclusive || this.active.length === 0);
      if (def && this.start(def)) this.nextDistraction = now + rand(c.distractionEvery[0], c.distractionEvery[1]);
    }
  }

  private trigger(kind: 'goal', scorer: Actor) {
    for (const def of this.library) if (def.trigger === kind) this.start(def, scorer);
  }

  private pick(category: Category, filter: (d: EventDef) => boolean = () => true): EventDef | null {
    const m = this.match;
    const holder = m.ball.state === 'held' && !m.ball.inHands ? m.ball.holder : null;
    const options: { def: EventDef; w: number }[] = [];
    for (const def of this.library) {
      if (def.category !== category || def.weight <= 0 || def.trigger || !filter(def)) continue;
      if (def.once && this.used.has(def.id)) continue;
      if (def.holderGoalDist) {
        if (!holder) continue;
        const dist = Math.abs(dirOf(holder.team) * L / 2 - holder.pos.x);
        if (dist < def.holderGoalDist[0] || dist > def.holderGoalDist[1]) continue;
      }
      // Punteggio coerente: chi è già avanti ha meno azioni da gol.
      let w = def.weight;
      const scoresGoal = def.steps.some((s) => s.do === 'shoot' && s.outcome === 'goal');
      if (scoresGoal && holder && m.score[holder.team] - m.score[1 - holder.team] >= D().maxGoalLead) w *= 0.2;
      if (scoresGoal && m.score[0] + m.score[1] >= D().goalBudget) w *= 0.25;
      options.push({ def, w });
    }
    let r = Math.random() * options.reduce((s, o) => s + o.w, 0);
    for (const o of options) if ((r -= o.w) <= 0) return o.def;
    return null;
  }

  /** Assegna i ruoli e fa partire l'evento. null se ora non si può (riproverà). */
  private start(def: EventDef, scorer: Actor | null = null): EventInstance | null {
    const m = this.match;
    const b = m.ball;
    const needsHolder = Object.values(def.roles).some((r) => r.pick === 'holder');
    let attack: TeamId;
    if (needsHolder) {
      const h = b.state === 'held' ? b.holder : null;
      if (!h || h.scripted || h.role === 'gk' || b.inHands || m.phase !== 'play') return null;
      attack = h.team;
    } else {
      attack = scorer ? scorer.team : Math.random() < 0.5 ? 0 : 1;
    }
    const mirror = def.fixedSide || Math.random() < 0.5 ? 1 : -1;
    const roles = new Map<string, Actor>();
    const taken = new Set<Actor>();
    const spawned: Actor[] = [];
    const free = (a: Actor) => !a.scripted && !taken.has(a) && !BUSY_POSES.includes(a.pose);
    const teamOf = (side: 'attack' | 'defense') => (side === 'attack' ? attack : ((1 - attack) as TeamId));
    for (const [name, r] of Object.entries(def.roles)) {
      let a: Actor | null = null;
      switch (r.pick) {
        case 'holder': a = b.holder; break;
        case 'scorer': a = scorer; break;
        case 'referee': a = free(m.referee) ? m.referee : null; break;
        case 'coach': a = m.coaches.find((x) => x.team === teamOf(r.side) && free(x)) ?? null; break;
        case 'keeper': a = m.actors.find((x) => x.role === 'gk' && x.team === teamOf(r.side) && !taken.has(x)) ?? null; break;
        case 'extra': a = m.spawnExtra(r.kind, resolvePoint(r.at, attack, mirror, roles)); if (a) spawned.push(a); break;
        case 'player': {
          let c = m.actors.filter((x) => x.team === teamOf(r.side) && x.role !== 'gk' && free(x) && (!r.roles || r.roles.includes(x.role)));
          if (r.farFromBall) c = c.filter((x) => xzDist(x.pos, b.pos) > D().distractionMinDist);
          if (r.near) {
            const ref = roles.get(r.near)!;
            c.sort((p, q) => xzDist(p.pos, ref.pos) - xzDist(q.pos, ref.pos));
          } else if (r.advanced) {
            const d = dirOf(teamOf(r.side));
            c.sort((p, q) => q.pos.x * d - p.pos.x * d);
          } else {
            c.sort(() => Math.random() - 0.5);
          }
          a = c[0] ?? null;
          break;
        }
      }
      if (!a) {
        for (const s of spawned) m.despawnExtra(s);
        return null;
      }
      roles.set(name, a);
      taken.add(a);
    }

    const inst = new EventInstance(def, this, m, attack, mirror, roles, m.time);
    this.active.push(inst);
    this.used.add(def.id);
    this.started.push(def.id);
    return inst;
  }

  private finish(inst: EventInstance) {
    inst.cleanup();
    if (inst.aborted) { this.aborted++; return; }
    const t = inst.tracker;
    // Una distrazione mai inquadrata è "persa": niente stelle, solo l'avviso.
    const missed = inst.def.category !== 'main' && t.maxCoverage < 0.3;
    const result = missed ? null : t.result(this.enabled);
    let points = result ? Math.round(result.score * inst.def.importance * 10) : 0;
    let multiplier: number | undefined;
    const r = CONFIG.rare;
    if (inst.def.category === 'main' && result) this.lastMain = { t: this.match.time, stars: result.stars };
    // Raro: il bonus si moltiplica solo se stavi facendo bene il tuo lavoro sulla partita.
    if (inst.def.category === 'rare' && result && this.match.time - this.lastMain.t < r.mainWithin + inst.def.duration && this.lastMain.stars >= r.goodMainStars) {
      multiplier = r.multiplier;
      points *= multiplier;
    }
    const { start, decisive, end } = t.moment;
    this.finished.push({
      id: inst.def.id,
      label: inst.label,
      category: inst.def.category,
      importance: inst.def.importance,
      result,
      points,
      multiplier,
      window: { start, decisive, end },
    });
  }
}
