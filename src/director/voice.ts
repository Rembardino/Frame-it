/**
 * DIRECTOR VOICE — il regista in cuffia (sottotitoli in stile broadcast; audio più avanti).
 *
 *  - Indizi: quando parte un evento, a volte dice cosa sta per succedere e da che parte
 *    rispetto a dove stai guardando. Ogni tanto sbaglia lato (e a volte si corregge).
 *  - Ordini: nei momenti tranquilli chiede un'inquadratura (allenatore, pubblico, portiere, arbitro).
 *    Eseguirlo bene vale un bonus. Ogni tanto dà un ordine sbagliato proprio prima di un'azione:
 *    sta a te capire se fidarti.
 *  - Commenti: reagisce ai tuoi voti, con ironia.
 * Frequenza e qualità degli indizi: CONFIG.voice.
 */
import { CONFIG } from '../config';
import type { Actor, Match } from '../sim/match';
import type { Director, DirectorResult, EventInstance, Indicator } from '../events/director';
import { MomentTracker, actorSubject, areaSubject, frameInput, subjectCenter, type Subject } from '../scoring/moment';
import { project, type Component, type ShotSize, type View } from '../scoring/scoring';
import { LINES, ORDERS, type OrderDef } from './lines';
import { LOCALE, t } from '../i18n';

export interface VoiceLine {
  text: string;
  kind: 'order' | 'hint' | 'talk';
  dur: number;
}

interface Order {
  def: OrderDef;
  tracker: MomentTracker;
  subjects: Subject[];
  size: ShotSize;
  wrong: boolean;
  /** Settore di tribuna che si scatena mentre lo inquadri. */
  hotX?: number;
}

const V = () => CONFIG.voice;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class DirectorVoice {
  /** Voti degli ordini conclusi: chi li legge svuota la coda. */
  readonly finished: DirectorResult[] = [];
  /** Battuta da mostrare adesso (id cambia a ogni battuta nuova). */
  current: (VoiceLine & { id: number }) | null = null;
  /** Ordine in corso (per il debug). */
  order: Order | null = null;
  ordersIssued = 0;
  hints = 0;

  private queue: VoiceLine[] = [];
  private lineTimer = 0;
  private lineId = 0;
  private seen = new WeakSet<EventInstance>();
  private pendingHints: { at: number; inst: EventInstance }[] = [];
  private nextOrder = V().firstOrderAt;
  /** Deciso quando scatta l'ora del prossimo ordine: sarà un ordine sbagliato? */
  private plannedWrong: boolean | null = null;
  private waitingSince = 0;
  private apologize = false;
  private ended = false;

  constructor(private match: Match, private director: Director, private enabled: Component[]) {}

  say(text: string, kind: VoiceLine['kind'] = 'talk', dur = V().lineSec, urgent = false) {
    const line = { text: t(text), kind, dur };
    if (urgent) {
      // Ordini e indizi interrompono le chiacchiere.
      this.queue = this.queue.filter((l) => l.kind !== 'talk');
      this.queue.unshift(line);
      if (this.current?.kind === 'talk') this.lineTimer = 0;
    } else if (this.queue.length < 2) {
      this.queue.push(line);
    }
  }

  start() {
    this.say(pick(LINES.kickoff));
  }

  end() {
    this.ended = true;
    this.order = null;
    this.say(pick(LINES.end), 'talk', 3, true);
  }

  update(dt: number, view: View) {
    const now = this.match.time;

    // Nuovi eventi: esultanza = urlo; gli altri a volte ricevono un indizio.
    for (const inst of this.director.active) {
      if (this.seen.has(inst)) continue;
      this.seen.add(inst);
      if (inst.def.trigger === 'goal') this.say(pick(LINES.goal), 'hint', 2.2, true);
      else if (inst.def.hint && Math.random() < V().hintChance) this.pendingHints.push({ at: now + rand(0.2, 0.6), inst });
    }
    this.pendingHints = this.pendingHints.filter((h) => {
      if (now < h.at) return true;
      // Inutile se l'istante decisivo è già troppo vicino.
      if (!h.inst.done && h.inst.et < h.inst.def.decisive - 0.8) this.hint(h.inst, view);
      return false;
    });

    this.updateOrder(now, view);

    this.lineTimer -= dt;
    if (this.lineTimer <= 0) {
      const next = this.queue.shift();
      this.current = next ? { ...next, id: ++this.lineId } : null;
      this.lineTimer = next ? next.dur : 0;
    }
  }

  /** Indicatore ai bordi verso il soggetto dell'ordine in corso. */
  indicators(): Indicator[] {
    return this.order ? [{ p: subjectCenter(this.order.subjects[0]), intensity: 0.7, category: 'order' }] : [];
  }

  /** Commento ironico sul voto di un momento (non sempre). */
  onResult(r: DirectorResult) {
    if (r.category === 'order') return;
    if (this.apologize && r.category === 'main') {
      this.apologize = false;
      this.say(pick(LINES.apology));
      return;
    }
    if (Math.random() > V().commentChance) return;
    if (!r.result) this.say(t(pick(LINES.missed), { label: t(r.label).toLocaleLowerCase(LOCALE) }));
    else if (r.result.stars === 5) this.say(pick(LINES.great));
    else if (r.result.stars <= 1 && r.category === 'main') this.say(pick(LINES.bad));
  }

  // ---------------------------------------------------------------- indizi

  private hint(inst: EventInstance, view: View) {
    const f = inst.focus;
    if (!f) return;
    const hint = t(inst.def.hint ?? '');
    this.hints++;
    if (inst.def.category === 'rare') {
      this.say(`${hint} ${t(pick(LINES.up))}`, 'hint', V().lineSec, true);
      return;
    }
    const pr = project(view, f);
    if (!pr.behind && Math.abs(pr.x) < 0.9 && Math.abs(pr.y) < 0.9) {
      this.say(`${hint} ${t(pick(LINES.here))}`, 'hint', V().lineSec, true);
      return;
    }
    const yaw = (Math.atan2(f.x - view.pos.x, -(f.z - view.pos.z)) * 180) / Math.PI;
    const side = yaw > view.yaw ? 'right' : 'left';
    const wrong = Math.random() > V().hintAccuracy;
    const said = wrong ? (side === 'right' ? 'left' : 'right') : side;
    this.say(`${hint} ${t(pick(LINES[said]))}`, 'hint', V().lineSec, true);
    // A volte si accorge dell'errore e si corregge.
    if (wrong && Math.random() < 0.4) this.queue.splice(1, 0, { text: `${t(pick(LINES.oops))} ${t(LINES[side][0])}`, kind: 'hint', dur: 1.8 });
  }

  // ---------------------------------------------------------------- ordini

  private updateOrder(now: number, view: View) {
    const c = V();
    const o = this.order;
    if (o) {
      if (o.hotX !== undefined) this.director.crowdReact(o.hotX, 0.8);
      if (now >= o.tracker.moment.start) o.tracker.sample(now, view, frameInput(o.subjects, 0, o.size));
      if (now >= o.tracker.moment.end) this.finishOrder(o, now);
      return;
    }
    if (this.ended || now < this.nextOrder || this.match.phase !== 'play') return;
    if (this.plannedWrong === null) {
      this.plannedWrong = Math.random() < c.wrongOrderChance;
      this.waitingSince = now;
    }
    const busy = this.director.active.some((i) => i.def.category === 'main' || i.def.exclusive);
    const untilMain = this.director.nextMainAt - now;
    // Ordine giusto: solo se c'è calma. Ordine sbagliato: proprio mentre sta per partire un'azione.
    const ok = this.plannedWrong ? !busy && untilMain < 2 : !busy && untilMain > c.orderDuration + 1.5;
    if (ok) this.issueOrder(now, this.plannedWrong);
    else if (now - this.waitingSince > 12) this.nextOrder = now + rand(5, 10); // niente finestra buona: rinvia
    if (ok || now - this.waitingSince > 12) this.plannedWrong = null;
  }

  private issueOrder(now: number, wrong: boolean) {
    const c = V();
    const m = this.match;
    const def = pick(ORDERS);
    let subjects: Subject[];
    let hotX: number | undefined;
    const target = (a: Actor, label: string) => [actorSubject(a, label)];
    switch (def.target) {
      case 'coach': {
        const coach = pick(m.coaches);
        m.setPose(coach, 'argue', c.orderReact + c.orderDuration, m.referee); // fa qualcosa che vale la pena riprendere
        subjects = target(coach, 'Allenatore');
        break;
      }
      case 'keeper':
        subjects = target(pick(m.actors.filter((a) => a.role === 'gk')), 'Portiere');
        break;
      case 'referee':
        subjects = target(m.referee, 'Arbitro');
        break;
      case 'athlete':
        subjects = target(pick(m.actors.filter((a) => a.role === 'mid').length
          ? m.actors.filter((a) => a.role === 'mid') : m.actors), def.label);
        break;
      case 'crowd': {
        // Una delle due curve, dietro le porte.
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side * (CONFIG.pitch.length / 2 + 8.5);
        const z = Math.min(9, CONFIG.pitch.width / 2 + 1);
        subjects = [areaSubject('Pubblico', { x, y: 0.8, z: -z }, { x, y: 3, z })];
        hotX = x;
        break;
      }
    }
    const start = now + c.orderReact;
    this.order = {
      def,
      subjects,
      size: def.size,
      wrong,
      hotX,
      tracker: new MomentTracker({ label: def.label, start, decisive: start + c.orderDuration / 2, end: start + c.orderDuration }),
    };
    this.ordersIssued++;
    this.say(pick(def.lines), 'order', c.orderReact + c.orderDuration, true);
  }

  private finishOrder(o: Order, now: number) {
    const c = V();
    const r = o.tracker.samples.length > 1 ? o.tracker.result(this.enabled) : null;
    const ok = !!r && r.score >= c.orderSuccess;
    const bonus = ok ? c.orderBonus : 0;
    const { start, decisive, end } = o.tracker.moment;
    this.finished.push({ id: `order:${o.def.id}`, label: `Ordine: ${o.def.label}`, category: 'order', importance: 0.5, result: r, points: bonus, bonus, window: { start, decisive, end } });
    this.say(pick(ok ? LINES.orderOk : LINES.orderFail));
    if (o.wrong) this.apologize = true;
    this.order = null;
    this.nextOrder = now + rand(c.orderEvery[0], c.orderEvery[1]);
  }
}
