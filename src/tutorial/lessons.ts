import { CONFIG, SPORT, type SportId } from '../config';
import { Match, type Actor } from '../sim/match';
import { Director, EventInstance } from '../events/director';
import { LIBRARY } from '../events/library';
import { Recorder, type Frame } from '../recorder/recorder';
import { evaluateFrame, idealView, type FrameInput, type View } from '../scoring/scoring';

export interface LessonSpec { event: string; at: number; tip: string }
export const LESSONS: Record<SportId, LessonSpec[]> = {
  calcio: [
    { event: 'contropiede', at: 1.9, tip: 'Lascia spazio davanti alla corsa e tieni la palla nel campo largo.' },
    { event: 'tiro-parato', at: 3.85, tip: 'Includi portiere, palla e porta: il tiro non finisce sul tiratore.' },
    { event: 'esultanza', at: 1.2, tip: 'Stringi sul marcatore: testa intera e spazio sopra il viso.' },
  ],
  basket: [
    { event: 'b-giropalla', at: 1.5, tip: 'Segui il passaggio: tieni insieme chi riceve e la palla.' },
    { event: 'b-contropiede', at: 3.5, tip: 'Sul tiro includi attaccante, palla e canestro, anche in alto.' },
    { event: 'b-esultanza', at: 1.2, tip: 'Dopo il canestro passa al primo piano di chi esulta.' },
  ],
  boxe: [
    { event: 'x-jab', at: 1.72, tip: 'Tieni entrambi i pugili e i guantoni: il contatto deve vedersi.' },
    { event: 'x-hook', at: 1.72, tip: 'Non stringere su un solo pugile: mostra anche la reazione al gancio.' },
    { event: 'x-knockdown', at: 2.75, tip: 'Allarga sul knockdown: includi chi cade, l’avversario e l’arbitro.' },
  ],
  tennis: [
    { event: 't-ace', at: 1.8, tip: 'Lascia spazio sopra la racchetta e non perdere la palla al servizio.' },
    { event: 't-incrociato', at: 2.52, tip: 'Nello scambio tieni i due giocatori e la traiettoria della palla.' },
    { event: 't-volée', at: 4, tip: 'Segui l’avvicinamento a rete mantenendo palla e avversario.' },
  ],
  pallavolo: [
    { event: 'v-ace', at: 2.24, tip: 'Inquadra servizio e palla lasciando spazio sopra le mani.' },
    { event: 'v-spike', at: 4.86, tip: 'Allarga sulla schiacciata: palla alta, attaccante e muro dentro.' },
    { event: 'v-block', at: 4.86, tip: 'Mostra entrambi i lati della rete e le mani al momento del muro.' },
  ],
};

export interface LessonFrame { frame: Frame; input: FrameInput }
export interface LessonClip {
  title: string; tip: string; frames: LessonFrame[]; seeds: number[];
}

const spatial = { coverage: CONFIG.scoring.weights.coverage, size: CONFIG.scoring.weights.size, composition: CONFIG.scoring.weights.composition };
export function framingScore(view: View, input: FrameInput) {
  const evaluation = evaluateFrame(view, input);
  const total = spatial.coverage + spatial.size + spatial.composition;
  const score = Math.round(100 * (evaluation.coverage * spatial.coverage + evaluation.size * spatial.size + evaluation.composition * spatial.composition) / total);
  return { score, evaluation };
}

/** Actual event scripts are recorded in an isolated match, never in the player's session. */
export function buildLesson(spec: LessonSpec): LessonClip {
  const definition = LIBRARY.find(def => def.id === spec.event);
  if (!definition) throw new Error(`Missing camera lesson: ${spec.event}`);
  const match = new Match(), director = new Director(match, ['coverage', 'size', 'composition']);
  const roles = new Map<string, Actor>();
  for (const [name, pick] of Object.entries(definition.roles)) {
    const taken = new Set(roles.values());
    const team = 'side' in pick && pick.side === 'defense' ? 1 : 0;
    const actor = pick.pick === 'holder' ? match.ball.holder
      : pick.pick === 'referee' ? match.referee
      : pick.pick === 'scorer' ? match.actors.find(a => a.team === 0 && a.role === 'fwd')
      : match.actors.find(a => a.team === team && !taken.has(a) &&
          (pick.pick === 'keeper' ? a.role === 'gk' : pick.pick !== 'player' || !pick.roles || pick.roles.includes(a.role)));
    if (!actor) throw new Error(`Missing lesson role: ${spec.event}/${name}`);
    roles.set(name, actor);
  }
  if (definition.trigger === 'goal') {
    const scorer = roles.get('scorer')!;
    scorer.pos.set(SPORT === 'basket' ? 8 : 20, 0, SPORT === 'basket' ? 2 : 8);
    scorer.target.copy(scorer.pos); scorer.scripted = true;
    match.setPose(scorer, 'celebrate', 4);
  }
  const event = new EventInstance(definition, director, match, 0, 1, roles, 0);
  const recorder = new Recorder(match), frames: LessonFrame[] = [];
  for (let i = 0; i < 1800; i++) {
    match.update(1 / 60); event.tick(1 / 60, match.time);
    if (i % 2 === 0 || event.et >= spec.at) {
      const input = event.framingInput();
      // Ball/keypoint vectors are mutable in the live simulation; the clip owns its copies.
      const frozen: FrameInput = { ...input, subjects: input.subjects.map(subject => ({ ...subject,
        vel: { ...subject.vel }, points: subject.points.map(point => ({ ...point, p: { ...point.p } })),
      })) };
      frames.push({ input: frozen, frame: recorder.capture({ rx: 0, ry: 0, fov: 40 },
        { excitement: match.excitement, hotX: 0, hotLevel: 0, lookUp: 0 }) });
    }
    if (event.et >= spec.at) break;
    if (event.aborted || event.done) throw new Error(`Lesson stopped before its action: ${spec.event}`);
  }
  if (event.et < spec.at) throw new Error(`Lesson timed out: ${spec.event}`);
  const stop = frames[frames.length - 1].frame.t;
  return { title: definition.label, tip: spec.tip, frames: frames.filter(item => item.frame.t >= stop - 2.4),
    seeds: [...match.actors, ...match.extras].map(actor => actor.seed) };
}

export function lessonModel(input: FrameInput, view: View): View {
  return idealView(view.pos, view.aspect, input).view;
}

export function lessonStartView(ideal: View): View {
  return { ...ideal,
    yaw: Math.max(-CONFIG.camera.yawLimit, Math.min(CONFIG.camera.yawLimit, ideal.yaw + (ideal.yaw > 0 ? -1 : 1) * ideal.fov * 0.45)),
    pitch: Math.max(CONFIG.camera.pitchMin, ideal.pitch - 2.5),
    fov: Math.min(CONFIG.camera.fovMax, ideal.fov * 1.4),
  };
}
