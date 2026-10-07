/**
 * Frame It: Live Sports TV — bootstrap e game loop.
 */
import './style.css';
import { CONFIG } from './config';
import { createStage } from './render/stage';
import { ActorViews } from './render/actors';
import { Crowd, type CrowdState } from './render/crowd';
import { SkyEffects } from './render/skyEffects';
import { Match } from './sim/match';
import { Director, type DirectorResult } from './events/director';
import { DirectorVoice } from './director/voice';
import { CameraController } from './camera/cameraController';
import { Recorder, type CameraFrame, type Frame, type WorldFrame } from './recorder/recorder';
import { ReplayPlayer } from './recorder/replay';
import { Hud } from './ui/hud';
import { DebugOverlay } from './ui/debugOverlay';
import { EdgeIndicators } from './ui/edgeIndicators';
import { addToAlbum, showAlbum } from './ui/album';
import { actorSubject, ballSubject, frameInput } from './scoring/moment';
import { summarize } from './scoring/summary';
import type { Component } from './scoring/scoring';

const params = new URLSearchParams(location.search);
const debug = CONFIG.debug.enabled || params.has('debug');
const level = Number(params.get('level')) || CONFIG.scoring.level;
const enabled = (CONFIG.scoring.levels[level] ?? CONFIG.scoring.levels[3]) as Component[];
const $ = (id: string) => document.getElementById(id)!;

const stage = createStage($('app'));
const match = new Match();
// ?rare = stella cadente garantita dopo 20 secondi (per provarla).
const director = new Director(match, enabled, { forceRare: params.has('rare') });
const voice = new DirectorVoice(match, director, enabled);
const views = new ActorViews(stage.scene, match);
const crowd = new Crowd(stage.scene, stage.seatRows);
const sky = new SkyEffects(stage.scene, match);
const cam = new CameraController(stage.camera, stage.renderer.domElement);
cam.bindZoomButton($('zin'), -1);
cam.bindZoomButton($('zout'), 1);
const recorder = new Recorder(match);
const replay = new ReplayPlayer();
const hud = new Hud(debug || CONFIG.debug.showFps);
const indicators = new EdgeIndicators();
const debugOverlay = debug ? new DebugOverlay() : null;
// In debug gli oggetti di gioco sono raggiungibili dalla console del browser (e dai test automatici).
if (debug) Object.assign(window, { frameit: { match, director, voice, cam, recorder, replay } });

function resize() {
  stage.renderer.setSize(innerWidth, innerHeight);
  stage.camera.aspect = innerWidth / innerHeight;
}
addEventListener('resize', resize);
resize();

/** Nel debug, quando non c'è un momento: "segui l'azione" (largo su chi ha palla), non valutato. */
function ambientInput() {
  const b = match.ball;
  let near = match.actors[0];
  for (const a of match.actors) if (a.pos.distanceTo(b.pos) < near.pos.distanceTo(b.pos)) near = a;
  return frameInput([actorSubject(b.holder ?? near, 'Giocatore'), ballSubject(b)], 0, 'wide');
}

const worldNow = (): WorldFrame => ({
  excitement: match.excitement, hotX: director.crowdHot.x, hotLevel: director.crowdHot.level, lookUp: director.crowdLookUp,
});
const crowdState = (w: WorldFrame): CrowdState => ({ excitement: w.excitement, hot: { x: w.hotX, level: w.hotLevel }, lookUp: w.lookUp });
const camNow = (): CameraFrame => ({ rx: stage.camera.rotation.x, ry: stage.camera.rotation.y, fov: stage.camera.fov });
function setCamera(c: CameraFrame) {
  stage.camera.rotation.set(c.rx, c.ry, 0);
  stage.camera.fov = c.fov;
  stage.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- replay e album

let lastReplay = -Infinity;
let pendingReplay: DirectorResult | null = null;
let liveSnapshot: Frame | null = null;

function wantsReplay(r: DirectorResult) {
  const R = CONFIG.replay;
  if (!R.enabled || !r.result || ended || r.category === 'order') return false;
  if (r.category === 'rare') return r.result.stars >= CONFIG.rare.captureStars; // le clip rare si rivedono sempre
  return r.result.stars >= R.minStars && match.time - lastReplay > R.cooldown;
}

/** Miniatura 16:9 del canvas: va chiamata subito dopo un render. */
function snapshot() {
  const src = stage.renderer.domElement;
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 135;
  const tw = Math.min(src.width, (src.height * 16) / 9);
  const th = (tw * 9) / 16;
  c.getContext('2d')!.drawImage(src, (src.width - tw) / 2, (src.height - th) / 2, tw, th, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

/** Disegna un fotogramma registrato (senza toccare lo stato di gioco in modo permanente). */
function renderFrame(f: Frame) {
  const { cam: c, world } = recorder.apply(f, f, 0);
  setCamera(c);
  views.update(0);
  crowd.update(0, crowdState(world));
  sky.update();
  stage.renderer.render(stage.scene, stage.camera);
}

function startReplay(r: DirectorResult) {
  const R = CONFIG.replay;
  const w = r.window;
  const clip = recorder.clip(r.label, w.decisive, w.decisive - R.before, Math.min(w.decisive + R.after, match.time));
  if (clip.frames.length < 2) return;
  liveSnapshot = recorder.capture(camNow(), worldNow());
  // Clip rara: la miniatura dell'album è il fotogramma dell'istante decisivo.
  if (r.category === 'rare' && r.result) {
    const f = clip.frames.reduce((p, q) => (Math.abs(q.t - w.decisive) < Math.abs(p.t - w.decisive) ? q : p));
    renderFrame(f);
    addToAlbum(r.id, r.result.stars, r.result.score, snapshot());
  }
  replay.start(clip);
  cam.setEnabled(false);
  lastReplay = match.time;
  document.body.classList.add('replaying');
  // Rimettendo il nodo, l'animazione della tendina "REPLAY" riparte.
  const wipe = document.querySelector('.rp-wipe')!;
  wipe.replaceWith(wipe.cloneNode(true));
  $('replay').classList.remove('hidden');
}

function endReplay() {
  if (liveSnapshot) {
    const { cam: c, world } = recorder.apply(liveSnapshot, liveSnapshot, 0);
    setCamera(c);
    views.update(0);
    crowd.update(0, crowdState(world));
    sky.update();
  }
  liveSnapshot = null;
  cam.setEnabled(true);
  document.body.classList.remove('replaying');
  $('replay').classList.add('hidden');
}
$('replay').addEventListener('pointerdown', () => {
  if (!replay.active) return;
  replay.skip();
  endReplay();
});

// ---------------------------------------------------------------- voti, totali, fine partita

const history: DirectorResult[] = [];
function onResult(r: DirectorResult) {
  history.push(r);
  hud.showResult(r);
  voice.onResult(r);
  const s = summarize(history);
  hud.setTotals(s.points, s.avgStars);
  if (wantsReplay(r)) pendingReplay = r;
}

/** Record salvato sul dispositivo (localStorage può non esserci: navigazione privata, iframe...). */
function saveRecord(points: number) {
  let record = 0;
  try { record = Number(localStorage.getItem('frameit.record')) || 0; } catch { /* niente salvataggi */ }
  const isRecord = points > record;
  if (isRecord) try { localStorage.setItem('frameit.record', String(points)); } catch { /* idem */ }
  return { record: Math.max(record, points), isRecord };
}

let ended = false;
function checkEnd() {
  const mainBusy = director.active.some((i) => i.def.category === 'main');
  if (ended || match.clock < CONFIG.match.durationSec || match.phase !== 'play' || mainBusy) return;
  ended = true;
  match.endMatch();
  director.stop();
  voice.end();
  // Lascia finire i voti in corso e la battuta del regista, poi il riepilogo.
  setTimeout(() => {
    const s = summarize(history);
    const { record, isRecord } = saveRecord(s.points);
    hud.showSummary(s, match, record, isRecord);
  }, 4500);
}

// ---------------------------------------------------------------- avvio e loop

// Schermata iniziale: il tocco avvia la partita e chiede schermo intero + orizzontale (dove supportato).
let running = false;
const startScreen = $('start');
function start() {
  startScreen.classList.add('hidden');
  $('zoomctl').classList.toggle('hidden', !CONFIG.camera.zoomButtons);
  running = true;
  voice.start();
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {}); // iOS / iframe: niente fullscreen, pazienza
}
startScreen.addEventListener('pointerup', start, { once: true });
$('album-btn').addEventListener('pointerup', (e) => {
  e.stopPropagation(); // non far partire la partita
  showAlbum();
});
if (params.has('autostart')) start();

let last = performance.now();
stage.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Replay: la partita è in pausa, si rivede la clip registrata.
  if (replay.active) {
    const st = replay.update(dt);
    if (st) {
      const { cam: c, world } = recorder.apply(st.a, st.b, st.u);
      setCamera(replay.angle(st.a, st.b, st.u, c));
      views.update(dt * replay.speed);
      crowd.update(dt * replay.speed, crowdState(world));
      sky.update();
      $('rp-speed').textContent = `x${replay.speed}`;
    } else {
      endReplay();
    }
    hud.update(dt, cam, match, voice, ended);
    stage.renderer.render(stage.scene, stage.camera);
    return;
  }

  if (running) match.update(dt);
  cam.update(dt);
  const view = cam.view();
  if (running) {
    director.update(dt, view);
    voice.update(dt, view);
    for (const r of [...director.finished.splice(0), ...voice.finished.splice(0)]) onResult(r);
    checkEnd();
  }

  views.update(dt);
  crowd.update(dt, crowdState(worldNow()));
  sky.update();
  hud.update(dt, cam, match, voice, ended);
  indicators.draw(view, [...director.indicators(), ...voice.indicators()]);
  debugOverlay?.draw(dt, match.time, view, director.focusTracker() ?? voice.order?.tracker ?? null, ambientInput(), enabled);
  stage.renderer.render(stage.scene, stage.camera);

  if (running) recorder.tick(dt, camNow(), worldNow());
  if (pendingReplay) {
    startReplay(pendingReplay);
    pendingReplay = null;
  }
});
