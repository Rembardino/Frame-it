import { SPORT, SPORT_LIST } from '../config';
import { Match } from '../sim/match';
import { ActorViews } from '../render/actors';
import type { createStage } from '../render/stage';
import type { CameraController } from '../camera/cameraController';
import { Recorder } from '../recorder/recorder';
import { project, type View } from '../scoring/scoring';
import { LESSONS, buildLesson, framingScore, lessonModel, lessonStartView, type LessonClip, type LessonFrame } from '../tutorial/lessons';
import { numberText, t } from '../i18n';
import { postNative } from '../platform/navigation';

const $ = (id: string) => document.getElementById(id)!;
const svgNode = (tag: string, attributes: Record<string, string | number>) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
};

/** Real event clips, a scored reference, then a patient frozen-frame camera exercise. */
export class CameraPractice {
  active = false;
  phase: 'preview' | 'practice' = 'preview';
  score = 0;
  modelScore = 0;
  completed = false;
  index = 0;
  private el = document.createElement('div');
  private match: Match | null = null;
  private views: ActorViews | null = null;
  private recorder: Recorder | null = null;
  private clip: LessonClip | null = null;
  private cursor = 0;
  private held = 0;
  private guide = true;
  private aspect = 0;
  private referenceDirty = true;
  private savedView: View | null = null;
  private savedFocus: HTMLElement | null = null;
  private done: (() => void) | null = null;
  private back: (() => void) | null = null;
  private startsMatch = false;
  private menuInert = false;
  private model: View | null = null;

  constructor(private stage: ReturnType<typeof createStage>, private liveViews: ActorViews,
    private camera: CameraController, private onState: () => void) {
    this.el.id = 'camera-practice'; this.el.className = 'hidden';
    this.el.setAttribute('role', 'region'); this.el.setAttribute('aria-labelledby', 'practice-title');
    document.body.append(this.el);
    addEventListener('keydown', event => {
      if (this.active && event.key === 'Escape') { event.preventDefault(); this.finish(true); }
    });
  }

  get inputActive() { return this.active && this.phase === 'practice'; }
  get frozen(): LessonFrame | null { return this.clip?.frames[this.clip.frames.length - 1] ?? null; }
  get ideal() { return this.model; }

  open(done: () => void, back: (() => void) | null = null, startsMatch = false) {
    if (this.active) return;
    this.savedView = { ...this.camera.view() };
    this.savedFocus = document.activeElement as HTMLElement | null;
    this.menuInert = $('start').inert; $('start').inert = true;
    this.done = done; this.back = back; this.startsMatch = startsMatch;
    if (!this.match) {
      this.match = new Match(); this.recorder = new Recorder(this.match);
      this.views = new ActorViews(this.stage.scene, this.match);
    }
    this.active = true; this.index = 0; this.guide = true;
    document.body.classList.add('practicing');
    this.liveViews.group.visible = false; this.views!.group.visible = true;
    this.el.classList.remove('hidden');
    postNative({ type: 'screen', screen: 'tutorial' });
    this.load();
  }

  private load() {
    this.clip = buildLesson(LESSONS[SPORT][this.index]);
    [...this.match!.actors, ...this.match!.extras].forEach((actor, index) => { actor.seed = this.clip!.seeds[index]; });
    this.el.innerHTML = `<div class="practice-heading practice-panel"><small>${t('Allenamento camera')} · ${t(SPORT_LIST.find(s => s.id === SPORT)!.name)} · ${this.index + 1}/3</small><h2 id="practice-title" tabindex="-1">${t(this.clip.title)}</h2><p id="practice-phase"></p></div>
      <figure class="practice-reference practice-panel hidden"><figcaption>${t('Modello: 100/100')}</figcaption><canvas id="practice-reference" aria-label="${t('Inquadratura ideale')}"></canvas></figure>
      <svg id="practice-guides" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="practice-feedback practice-panel"><strong id="practice-score"></strong><div id="practice-components"></div><p>${t(this.clip.tip)}</p><p id="practice-advice" role="status" aria-live="polite"></p><progress id="practice-hold" value="0" max="0.7" aria-label="${t('Mantieni l’inquadratura')}"></progress></div>
      <div class="practice-actions"><button id="practice-try" class="primary">${t('Prova ora')}</button><button id="practice-example" class="secondary hidden">${t('Rivedi esempio')}</button><button id="practice-guide-toggle" class="secondary hidden" aria-pressed="true">${t('Guide: ON')}</button><button id="practice-skip" class="text-button">${t('Salta esercizio')}</button><button id="practice-next" class="primary hidden" disabled>${t(this.index === 2 ? this.startsMatch ? 'Inizia la partita' : 'Torna al menu' : 'Avanti')}</button></div>
      <div class="practice-exit"><button id="practice-exit" class="text-button">${t(this.back ? 'Torna alla guida' : 'Torna al menu')}</button>${this.back ? `<button id="practice-skip-all" class="text-button">${t('Salta esercizi')}</button>` : ''}</div>`;
    $('practice-try').addEventListener('click', () => this.tryNow());
    $('practice-example').addEventListener('click', () => this.preview());
    $('practice-guide-toggle').addEventListener('click', () => {
      this.guide = !this.guide;
      $('practice-guide-toggle').setAttribute('aria-pressed', String(this.guide));
      $('practice-guide-toggle').textContent = t(this.guide ? 'Guide: ON' : 'Guide: OFF');
      $('practice-guides').classList.toggle('hidden', !this.guide);
    });
    const next = () => { if (this.index < 2) { this.index++; this.load(); } else this.finish(); };
    $('practice-next').addEventListener('click', () => { if (this.completed) next(); });
    $('practice-skip').addEventListener('click', next);
    $('practice-exit').addEventListener('click', () => this.finish(true));
    if (this.back) $('practice-skip-all').addEventListener('click', () => this.finish());
    this.preview();
    $('practice-title').focus();
  }

  private preview() {
    this.phase = 'preview'; this.completed = false; this.held = 0; this.cursor = 0;
    this.camera.setEnabled(false);
    $('practice-phase').textContent = t('Guarda l’esempio');
    $('practice-advice').textContent = t('La camera segue l’azione. Poi proverai tu sul momento fermo.');
    $('practice-hold').classList.add('hidden');
    $('practice-try').classList.remove('hidden');
    ['practice-example', 'practice-guide-toggle', 'practice-next', 'practice-guides'].forEach(id => $(id).classList.add('hidden'));
    this.el.querySelector('.practice-reference')!.classList.add('hidden');
    $('zoomctl').classList.add('hidden'); $('gyro-controls').classList.add('hidden');
    this.onState();
  }

  private tryNow() {
    if (!this.active || !this.frozen) return;
    this.apply(this.frozen, this.frozen, 0);
    this.phase = 'practice'; this.held = 0;
    this.model = lessonModel(this.frozen.input, this.camera.view());
    this.modelScore = framingScore(this.model, this.frozen.input).score;
    this.camera.setView(lessonStartView(this.model));
    this.camera.setEnabled(true);
    $('practice-phase').textContent = t('Ora tocca a te');
    $('practice-advice').textContent = t('Trascina e usa lo zoom. Allinea i soggetti alle guide tratteggiate.');
    $('practice-try').classList.add('hidden');
    ['practice-example', 'practice-guide-toggle', 'practice-next', 'practice-hold'].forEach(id => $(id).classList.remove('hidden'));
    $('practice-next').setAttribute('disabled', '');
    $('practice-guides').classList.toggle('hidden', !this.guide);
    this.el.querySelector('.practice-reference')!.classList.remove('hidden');
    $('zoomctl').classList.remove('hidden'); $('gyro-controls').classList.remove('hidden');
    this.referenceDirty = true; this.aspect = 0;
    this.onState();
  }

  private apply(a: LessonFrame, b: LessonFrame, u: number) {
    this.recorder!.apply(a.frame, b.frame, u);
    this.views!.update(0);
  }

  update(dt: number) {
    if (!this.active || !this.clip || !this.frozen) return;
    if (this.phase === 'preview') {
      this.cursor += dt * 0.8;
      const frames = this.clip.frames, time = frames[0].frame.t + this.cursor;
      let index = 0;
      while (index < frames.length - 1 && frames[index + 1].frame.t <= time) index++;
      const a = frames[index], b = frames[Math.min(index + 1, frames.length - 1)];
      const u = b.frame.t > a.frame.t ? Math.min(1, (time - a.frame.t) / (b.frame.t - a.frame.t)) : 0;
      this.apply(a, b, u);
      this.camera.setView(lessonModel(a.input, this.camera.view()));
      $('practice-score').textContent = t('Guarda l’esempio');
      $('practice-components').textContent = t('In partita contano anche fluidità e tempismo.');
      if (time >= this.frozen.frame.t + 0.7) this.tryNow();
    }
    if (this.phase === 'practice') {
      const view = this.camera.view(), { score, evaluation } = framingScore(view, this.frozen.input);
      this.score = score;
      if (this.aspect !== view.aspect) {
        this.aspect = view.aspect; this.referenceDirty = true;
        this.model = lessonModel(this.frozen.input, view);
        this.modelScore = framingScore(this.model, this.frozen.input).score;
      }
      if (this.referenceDirty) { this.drawReference(); this.referenceDirty = false; }
      $('practice-score').textContent = `${t('La tua inquadratura')}: ${numberText(score)}/100`;
      $('practice-components').textContent = `${t('Copertura')} ${Math.round(evaluation.coverage * 100)} · ${t('Taglia')} ${Math.round(evaluation.size * 100)} · ${t('Composizione')} ${Math.round(evaluation.composition * 100)}`;
      this.held = score === 100 ? Math.min(0.7, this.held + dt) : 0;
      ($('practice-hold') as HTMLProgressElement).value = this.held;
      if (this.held >= 0.7 && !this.completed) {
        this.completed = true; $('practice-next').removeAttribute('disabled');
      }
      const advice = this.completed ? 'Inquadratura riuscita! Puoi passare al prossimo esempio.'
        : score === 100 ? 'Mantieni l’inquadratura per un istante.'
        : evaluation.coverage < 0.9 ? 'Tieni tutti i soggetti e la palla dentro l’immagine.'
        : Math.abs(evaluation.zoomRatio) > 0.08 ? evaluation.zoomRatio > 0 ? 'Avvicina lo zoom verso il modello.' : 'Allontana lo zoom verso il modello.'
        : 'Sposta la camera per allineare i soggetti alle guide.';
      const text = t(advice);
      if ($('practice-advice').textContent !== text) $('practice-advice').textContent = text;
    }
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  private drawReference() {
    if (!this.model || !this.frozen) return;
    const camera = this.stage.camera.clone();
    camera.rotation.set(this.model.pitch * Math.PI / 180, -this.model.yaw * Math.PI / 180, 0);
    camera.fov = this.model.fov; camera.updateProjectionMatrix();
    this.stage.renderer.render(this.stage.scene, camera);
    const canvas = $('practice-reference') as HTMLCanvasElement;
    canvas.width = 320; canvas.height = Math.round(320 / this.model.aspect);
    canvas.getContext('2d')!.drawImage(this.stage.renderer.domElement, 0, 0, canvas.width, canvas.height);
    const guides = $('practice-guides'); guides.replaceChildren();
    guides.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    for (const subject of this.frozen.input.subjects) {
      const points = subject.points.filter(p => p.kind !== 'hands' && (this.frozen!.input.size !== 'close' || p.kind !== 'feet'))
        .map(point => project(this.model!, point.p)).filter(point => !point.behind);
      if (!points.length) continue;
      const xs = points.map(p => (p.x + 1) * innerWidth / 2), ys = points.map(p => (1 - p.y) * innerHeight / 2);
      const x = Math.min(...xs) - 7, y = Math.min(...ys) - 7;
      const width = Math.max(...xs) - x + 7, height = Math.max(...ys) - y + 7;
      guides.append(svgNode('rect', { x, y, width: Math.max(14, width), height: Math.max(14, height), rx: 4 }));
      const label = svgNode('text', { x, y: Math.max(18, y - 5) }); label.textContent = t(subject.label); guides.append(label);
    }
  }

  private finish(goBack = false) {
    if (!this.active) return;
    const callback = goBack && this.back ? this.back : this.done;
    this.active = false; this.camera.setEnabled(false);
    if (this.savedView) this.camera.setView(this.savedView);
    this.views!.group.visible = false; this.liveViews.group.visible = true;
    this.el.classList.add('hidden'); document.body.classList.remove('practicing');
    $('start').inert = this.menuInert;
    $('zoomctl').classList.add('hidden'); $('gyro-controls').classList.add('hidden');
    this.onState();
    this.savedFocus?.focus();
    postNative({ type: 'screen', screen: goBack && this.back ? 'tutorial' : 'menu' });
    this.done = this.back = null;
    callback?.();
  }
}
