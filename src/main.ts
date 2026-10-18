/**
 * Frame It: Live Sports TV — bootstrap e game loop.
 */
import './style.css';
import * as THREE from 'three';
import { CAREER, CONFIG, SPORT, SPORT_LIST } from './config';
import { createStage } from './render/stage';
import { ActorViews } from './render/actors';
import { Crowd, type CrowdState } from './render/crowd';
import { SkyEffects } from './render/skyEffects';
import { Match } from './sim/match';
import { Director, type DirectorResult } from './events/director';
import { SecretMoments } from './events/secrets';
import { DirectorVoice } from './director/voice';
import { CameraController } from './camera/cameraController';
import { Recorder, type CameraFrame, type Clip, type Frame, type WorldFrame } from './recorder/recorder';
import { ReplayPlayer } from './recorder/replay';
import { loadClip, saveClips, REPLAY_REQUEST } from './recorder/archive';
import { Hud } from './ui/hud';
import { DebugOverlay } from './ui/debugOverlay';
import { EdgeIndicators } from './ui/edgeIndicators';
import { AssistFrame } from './ui/assistFrame';
import { CareerHub, careerReport } from './ui/careerHub';
import { loadCareer, saveCareer, setPending, settle, type PendingMatch, type Video } from './career/career';
import { Drone } from './camera/drone';
import { AudioEngine } from './audio/audio';
import { addToAlbum, showAlbum } from './ui/album';
import { mountHighlights } from './ui/highlights';
import { actorSubject, ballSubject, frameInput } from './scoring/moment';
import { summarize } from './scoring/summary';
import type { Component } from './scoring/scoring';
import { nativeMessage, postNative, restartGame } from './platform/navigation';
import { bindNativeServices } from './platform/services';
import { GyroscopeController } from './camera/gyroscope';
import { Tutorial, tutorialSeen } from './ui/tutorial';
import { CameraPractice } from './ui/cameraPractice';
import { LANGUAGE, LANGUAGES, isLanguage, localizePage, saveLanguage, t } from './i18n';

const params = new URLSearchParams(location.search);
const debug = CONFIG.debug.enabled || params.has('debug');
const level = Number(params.get('level')) || CONFIG.scoring.level;
const enabled = (CONFIG.scoring.levels[level] ?? CONFIG.scoring.levels[3]) as Component[];
const $ = (id: string) => document.getElementById(id)!;
localizePage();
saveLanguage(LANGUAGE);
nativeMessage('language-ready', undefined, LANGUAGE);
bindNativeServices();
postNative({ type: 'screen', screen: 'menu' });
const languageSelect = $('language') as HTMLSelectElement;
for (const language of LANGUAGES) languageSelect.add(new Option(language.name, language.id, false, language.id === LANGUAGE));
$('language-picker').addEventListener('pointerup', event => event.stopPropagation());
languageSelect.addEventListener('change', () => {
  const language = languageSelect.value;
  if (!isLanguage(language) || language === LANGUAGE) return;
  saveLanguage(language);
  if (nativeMessage('set-language', undefined, language)) return;
  const query = new URLSearchParams(location.search);
  query.set('lang', language);
  location.search = query.toString();
});

const stage = createStage($('app'));
const match = new Match();
// ?rare = stella cadente garantita dopo 20 secondi (per provarla).
const director = new Director(match, enabled, { forceRare: params.has('rare') });
const voice = new DirectorVoice(match, director, enabled);
// Momenti segreti in tribuna e a bordo campo: mai annunciati, bonus e video virali se li riprendi.
const secrets = new SecretMoments(match, stage.seatRows, params.get('secret'));
const views = new ActorViews(stage.scene, match);
const crowd = new Crowd(stage.scene, stage.seatRows);
const sky = new SkyEffects(stage.scene, match);
const cam = new CameraController(stage.camera, stage.renderer.domElement);
cam.bindZoomButton($('zin'), -1);
cam.bindZoomButton($('zout'), 1);
$('zreset').addEventListener('click', () => cam.resetZoom());
cam.setEnabled(false);
const gyro = new GyroscopeController(cam);
const drone = new Drone(cam, stage.camera, stage.scene);
const audio = new AudioEngine();
// I browser fanno partire l'audio solo dopo un tocco del giocatore.
addEventListener('pointerdown', () => audio.unlock(), { passive: true });
function paintSound() {
  document.querySelectorAll('.sound-toggle').forEach((b) => { b.textContent = t(audio.muted ? 'Audio: OFF' : 'Audio: ON'); });
}
document.querySelectorAll('.sound-toggle').forEach((b) => b.addEventListener('pointerup', (e) => {
  e.stopPropagation(); // dal menu non deve far partire la partita
  audio.unlock();
  audio.setMuted(!audio.muted);
  paintSound();
}));
paintSound();
let spokenLine = 0;
// Testa motorizzata (solo carriera, se comprata): segue la palla; nella boxe il centro tra i due pugili.
cam.autoTarget = () => SPORT === 'boxe' ? match.actors[0].pos.clone().add(match.actors[1].pos).multiplyScalar(0.5).setY(1.2) : match.ball.pos;
const practice = new CameraPractice(stage, views, cam, () => syncCamera());
const tutorial = new Tutorial((done, back, startsMatch) => practice.open(done, back, startsMatch));
const cameraCanMove = () => (practice.active ? practice.inputActive : running && !ended && !replay.active && !userPaused) && !appPaused && !document.hidden;
const syncCamera = () => gyro.setActive(cameraCanMove());
const recorder = new Recorder(match);
const replay = new ReplayPlayer();
const hud = new Hud(debug || CONFIG.debug.showFps);
const indicators = new EdgeIndicators();
const debugOverlay = debug ? new DebugOverlay() : null;
// Modalità assistita (riquadro dell'inquadratura perfetta) o esperto (niente aiuti). Si sceglie nel menu.
let assisted = false;
try { assisted = localStorage.getItem('frameit.mode') === 'assist'; } catch { /* niente salvataggi */ }
const assist = new AssistFrame();
function setMode(on: boolean) {
  assisted = on;
  try { localStorage.setItem('frameit.mode', on ? 'assist' : 'expert'); } catch { /* idem */ }
  $('mode-assist').classList.toggle('on', on);
  $('mode-expert').classList.toggle('on', !on);
  if (!on) assist.clear();
}
setMode(assisted);
for (const [id, on] of [['mode-assist', true], ['mode-expert', false]] as const) {
  $(id).addEventListener('pointerup', (e) => { e.stopPropagation(); setMode(on); });
}
let seenCuts = 0;
// In debug gli oggetti di gioco sono raggiungibili dalla console del browser (e dai test automatici).
if (debug) Object.assign(window, { frameit: { match, director, voice, cam, gyro, recorder, replay, stage, views, hud, practice, drone, audio, secrets, crowd } });

function resize() {
  stage.renderer.setSize(innerWidth, innerHeight);
  stage.camera.aspect = innerWidth / innerHeight;
}
addEventListener('resize', resize);
resize();

/** Nel debug, quando non c'è un momento: "segui l'azione" (largo su chi ha palla), non valutato. */
function ambientInput() {
  if (SPORT === 'boxe') return frameInput(match.actors.map((a) => actorSubject(a, 'Pugile')), 0, 'medium');
  const b = match.ball;
  let near = match.actors[0];
  for (const a of match.actors) if (a.pos.distanceTo(b.pos) < near.pos.distanceTo(b.pos)) near = a;
  return frameInput([actorSubject(b.holder ?? near, 'Giocatore'), ballSubject(b)], 0, 'wide');
}

const worldNow = (): WorldFrame => ({
  excitement: match.excitement, hotX: director.crowdHot.x, hotLevel: director.crowdHot.level, lookUp: director.crowdLookUp,
});
const crowdState = (w: WorldFrame): CrowdState => ({ excitement: w.excitement, hot: { x: w.hotX, level: w.hotLevel }, lookUp: w.lookUp });
const camNow = (): CameraFrame => ({
  rx: stage.camera.rotation.x, ry: stage.camera.rotation.y, fov: stage.camera.fov,
  // La posizione serve solo a chi ha il drone (nel replay la camera torna dov'era in volo).
  x: stage.camera.position.x, y: stage.camera.position.y, z: stage.camera.position.z,
});
function setCamera(c: CameraFrame) {
  stage.camera.rotation.set(c.rx, c.ry, 0);
  if (c.x !== undefined) stage.camera.position.set(c.x, c.y!, c.z!);
  stage.camera.fov = c.fov;
  stage.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- replay e album

let lastReplay = -Infinity;
let pendingReplay: DirectorResult | null = null;
let liveSnapshot: Frame | null = null;
let archivedReplay = false;
let liveSeeds: number[] = [];

// ---------------------------------------------------------------- highlights per FrameTube

/** Momenti belli in attesa che la clip sia registrata per intero, e le clip pronte (le migliori per punti). */
let waitingHighlights: DirectorResult[] = [];
const highlights: { r: DirectorResult; clip: Clip }[] = [];
function wantsHighlight(r: DirectorResult) {
  if (!r.result || r.category === 'order') return false;
  if (r.category === 'rare' || r.category === 'secret') return r.result.stars >= CONFIG.rare.captureStars;
  return r.result.stars >= CONFIG.highlights.minStars;
}
/** Chiamato a ogni passo: la clip si prende quando i secondi dopo l'istante decisivo sono registrati. */
function collectHighlights(force = false) {
  const R = CONFIG.replay;
  waitingHighlights = waitingHighlights.filter((r) => {
    if (!force && match.time < r.window.decisive + R.after) return true;
    const clip = recorder.clip(r.label, r.window.decisive, r.window.decisive - R.before, r.window.decisive + R.after);
    if (clip.frames.length > 1) highlights.push({ r, clip });
    highlights.sort((a, b) => b.r.points - a.r.points).splice(CONFIG.highlights.keep);
    return false;
  });
}
/** Miniature delle clip candidate (fotogramma decisivo). */
function highlightThumbs() {
  collectHighlights(true);
  const live = recorder.capture(camNow(), worldNow());
  const list = highlights.map(({ r, clip }) => {
    renderFrame(clip.frames.reduce((p, q) => (Math.abs(q.t - r.window.decisive) < Math.abs(p.t - r.window.decisive) ? q : p)));
    return { label: r.label, stars: r.result!.stars, img: snapshot() };
  });
  renderFrame(live);
  return list;
}

function wantsReplay(r: DirectorResult) {
  const R = CONFIG.replay;
  if (!R.enabled || !r.result || ended || r.category === 'order') return false;
  // Le clip rare e i momenti virali si rivedono sempre.
  if (r.category === 'rare' || r.category === 'secret') return r.result.stars >= CONFIG.rare.captureStars;
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
  crowd.update(0, crowdState(world), secrets.gaps);
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
  if ((r.category === 'rare' || r.category === 'secret') && r.result) {
    const f = clip.frames.reduce((p, q) => (Math.abs(q.t - w.decisive) < Math.abs(p.t - w.decisive) ? q : p));
    renderFrame(f);
    addToAlbum(r.id, r.result.stars, r.result.score, snapshot());
  }
  replay.start(clip);
  postNative({ type: 'replay-active', active: true });
  cam.setEnabled(false);
  syncCamera();
  lastReplay = match.time;
  document.body.classList.add('replaying');
  // Rimettendo il nodo, l'animazione della tendina "REPLAY" riparte.
  const wipe = document.querySelector('.rp-wipe')!;
  wipe.replaceWith(wipe.cloneNode(true));
  $('replay').classList.remove('hidden');
}

function endReplay() {
  postNative({ type: 'replay-active', active: false });
  if (liveSnapshot) {
    const { cam: c, world } = recorder.apply(liveSnapshot, liveSnapshot, 0);
    setCamera(c);
    views.update(0);
    crowd.update(0, crowdState(world), secrets.gaps);
    sky.update();
  }
  liveSnapshot = null;
  cam.setEnabled(running && !ended && !appPaused && !document.hidden);
  syncCamera();
  document.body.classList.remove('replaying');
  $('replay').classList.add('hidden');
  if (archivedReplay) {
    archivedReplay = false;
    [...match.actors, ...match.extras].forEach((actor, i) => { actor.seed = liveSeeds[i]; });
    views.update(0);
    startScreen.classList.remove('hidden');
    careerHub.openChannel();
    postNative({ type: 'screen', screen: 'menu' });
  }
}
$('replay').addEventListener('pointerdown', () => {
  if (!replay.active) return;
  replay.skip();
  endReplay();
});

// ---------------------------------------------------------------- voti, totali, fine partita

/** Foto di un momento perso: il fotogramma registrato dell'istante decisivo, con la camera puntata sul soggetto. */
function missedPhoto(r: DirectorResult) {
  const aim = r.aim;
  const frames = aim ? recorder.clip('', aim.t, aim.t - 0.5, aim.t + 0.5).frames : [];
  if (!aim || !frames.length) return null;
  const f = frames.reduce((p, q) => (Math.abs(q.t - aim.t) < Math.abs(p.t - aim.t) ? q : p));
  const live = recorder.capture(camNow(), worldNow());
  const show = (fr: Frame, aimed: boolean) => {
    const { cam: c, world } = recorder.apply(fr, fr, 0);
    setCamera(c);
    if (aimed) {
      const camera = stage.camera;
      camera.lookAt(aim.x, aim.y, aim.z);
      const dist = camera.position.distanceTo(new THREE.Vector3(aim.x, aim.y, aim.z));
      camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan((aim.r * 1.8) / dist)), 6, 50);
      camera.updateProjectionMatrix();
    }
    views.update(0);
    crowd.update(0, crowdState(world), secrets.gaps);
    sky.update();
  };
  show(f, true);
  stage.renderer.render(stage.scene, stage.camera);
  const img = snapshot();
  show(live, false);
  return img;
}

const history: DirectorResult[] = [];
const missed: { label: string; img: string | null }[] = [];
function onResult(r: DirectorResult) {
  history.push(r);
  // Momento perso: niente scheda durante la partita, lo si rivede (con la foto) nel riepilogo.
  if (r.result) hud.showResult(r);
  else missed.push({ label: r.label, img: missedPhoto(r) });
  voice.onResult(r);
  const s = summarize(history);
  hud.setTotals(s.points, s.avgStars);
  if (wantsReplay(r)) pendingReplay = r;
  if (wantsHighlight(r)) waitingHighlights.push(r);
}

/** Record salvato sul dispositivo (localStorage può non esserci: navigazione privata, iframe...). */
function saveRecord(points: number) {
  let record = 0;
  // Un record per sport (il calcio tiene la chiave storica).
  const key = (SPORT === 'calcio' ? 'frameit.record' : `frameit.record.${SPORT}`) + (assisted ? '.assist' : '') + (CAREER ? '.career' : '');
  try { record = Number(localStorage.getItem(key)) || 0; } catch { /* niente salvataggi */ }
  const isRecord = points > record;
  if (isRecord) try { localStorage.setItem(key, String(points)); } catch { /* idem */ }
  return { record: Math.max(record, points), isRecord };
}

let ended = false;
function checkEnd() {
  if (ended || match.clock < CONFIG.match.durationSec) return;
  // Allo scadere non programmare altre azioni; quella già in corso può finire normalmente.
  director.stop();
  secrets.stop();
  const mainBusy = director.active.some((i) => i.def.category === 'main');
  if (match.phase !== 'play' || mainBusy) return;
  ended = true;
  cam.setEnabled(false);
  syncCamera();
  $('zoomctl').classList.add('hidden');
  $('gyro-controls').classList.add('hidden');
  match.endMatch();
  voice.end();
  // Lascia finire i voti in corso e la battuta del regista, poi il riepilogo.
  setTimeout(() => {
    const s = summarize(history);
    const { record, isRecord } = saveRecord(s.points);
    hud.showSummary(s, match, record, isRecord, missed);
    if (CAREER) showCareerResult(s.avgScore);
    postNative({ type: 'match-ended' });
    postNative({ type: 'screen', screen: 'results' });
  }, 4500);
}

// ---------------------------------------------------------------- carriera

/** Fine partita di carriera: si scelgono le clip per FrameTube, poi paga, video pubblicati e risultato. */
function showCareerResult(avgScore: number) {
  const box = document.querySelector('#summary .sum-btns')!;
  box.classList.add('hidden'); // prima si pubblica, poi si esce
  mountHighlights(highlightThumbs(), async (chosen) => {
    const state = loadCareer();
    const selected = chosen.map((i) => highlights[i]);
    const shots = selected.map(({ r }) => ({ label: r.label, stars: r.result!.stars, score: r.result!.score, rare: r.category === 'rare', viral: r.category === 'secret', clipId: crypto.randomUUID() }));
    const report = settle(state, CAREER!, shots, avgScore, assisted);
    let storageFailed = false;
    try {
      await saveClips(selected.map(({ clip }, i) => ({ id: shots[i].clipId, recording: { clip, seeds: [...match.actors, ...match.extras].map(a => a.seed) } })), state.videos.flatMap(v => v.clipId ? [v.clipId] : []));
    } catch {
      storageFailed = true;
      for (const video of report.videos) delete video.clipId;
    }
    saveCareer(state);
    if (storageFailed) box.insertAdjacentHTML('beforebegin', `<p role="status">${t('Clip non salvate: spazio non disponibile.')}</p>`);
    box.insertAdjacentHTML('beforebegin', careerReport(report, state));
    box.innerHTML = `<button id="to-career">${t('Torna alla carriera')}</button>`;
    box.classList.remove('hidden');
    $('to-career').addEventListener('click', () => {
      try { localStorage.setItem('frameit.career.open', '1'); } catch { /* si torna al menu */ }
      restartGame();
    });
  });
}

/** Una partita di carriera parte ricaricando il gioco con lo sport giusto (anche nell'app Android). */
function playCareer(p: PendingMatch) {
  setPending(p);
  if (nativeMessage('select-sport', p.sport)) return;
  const q = new URLSearchParams(location.search);
  q.set('sport', p.sport);
  if (q.toString() === location.search.slice(1)) location.reload();
  else location.search = q.toString();
}
async function watchVideo(video: Video) {
  if (!video.clipId) throw new Error('No recording');
  if (video.sport !== SPORT) {
    localStorage.setItem(REPLAY_REQUEST, video.clipId);
    if (nativeMessage('select-sport', video.sport)) return;
    const query = new URLSearchParams(location.search);
    query.set('sport', video.sport);
    query.delete('autostart');
    location.search = query.toString();
    return;
  }
  const recording = await loadClip(video.clipId);
  if (!recording || recording.clip.frames.length < 2 || recording.clip.frames[0].actors.length !== match.actors.length + match.extras.length) throw new Error('Invalid recording');
  liveSnapshot = recorder.capture(camNow(), worldNow());
  liveSeeds = [...match.actors, ...match.extras].map(a => a.seed);
  [...match.actors, ...match.extras].forEach((actor, i) => { actor.seed = recording.seeds[i]; });
  archivedReplay = true;
  replay.start(recording.clip);
  cam.setEnabled(false);
  syncCamera();
  $('career').classList.add('hidden');
  startScreen.classList.add('hidden');
  document.body.classList.add('replaying');
  $('replay').classList.remove('hidden');
  postNative({ type: 'replay-active', active: true });
}
const careerHub = new CareerHub(playCareer, () => assisted, watchVideo);
$('career-btn').addEventListener('pointerup', (e) => { e.stopPropagation(); careerHub.open(); });
// La richiesta vale per questo caricamento soltanto: la prossima volta si torna alla modalità libera.
if (CAREER) setPending(null);
try {
  if (localStorage.getItem('frameit.career.open')) { localStorage.removeItem('frameit.career.open'); careerHub.open(); }
} catch { /* niente salvataggi */ }
$('drone-btn').addEventListener('click', () => drone.toggle());
addEventListener('keydown', (e) => { if (e.code === 'KeyF' && cameraCanMove()) drone.toggle(); });

// ---------------------------------------------------------------- avvio e loop

// Schermata iniziale: il tocco avvia la partita e chiede schermo intero + orizzontale (dove supportato).
let running = false;
const startScreen = $('start');
function start() {
  if (running) return;
  audio.unlock();
  startScreen.classList.add('hidden');
  $('zoomctl').classList.toggle('hidden', !CONFIG.camera.zoomButtons);
  running = true;
  cam.setEnabled(true);
  $('gyro-controls').classList.remove('hidden');
  $('drone-btn').classList.toggle('hidden', !drone.owned);
  syncCamera();
  postNative({ type: 'screen', screen: 'playing' });
  voice.start();
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {}); // iOS / iframe: niente fullscreen, pazienza
}
function requestStart() {
  if (running) return;
  if (tutorialSeen()) start();
  else tutorial.open(start, true);
}
$('start-btn').addEventListener('click', requestStart);
$('tutorial-btn').addEventListener('click', () => tutorial.open());
$('practice-btn').addEventListener('click', () => practice.open(() => {}));
// Scelta dello sport: ricarica la pagina con ?sport=... (ogni sport ha campo, regole ed eventi suoi).
for (const s of SPORT_LIST) {
  const b = document.createElement('button');
  b.textContent = t(s.name);
  b.className = s.id === SPORT ? 'on' : '';
  b.addEventListener('pointerup', (e) => {
    e.stopPropagation(); // non far partire la partita
    if (s.id === SPORT) return requestStart();
    if (nativeMessage('select-sport', s.id)) return;
    const p = new URLSearchParams(location.search);
    p.set('sport', s.id);
    location.search = p.toString();
  });
  $('sports').append(b);
}
$('album-btn').addEventListener('pointerup', (e) => {
  e.stopPropagation(); // non far partire la partita
  showAlbum();
});
let last = performance.now();
let appPaused = false;
// Pausa scelta dal giocatore (diversa da quella del telefono quando l'app va in background).
let userPaused = false;
function setUserPause(on: boolean) {
  if (ended && on) return;
  userPaused = on;
  if (on) audio.pause(); else audio.resume();
  last = performance.now();
  $('pause').classList.toggle('hidden', !on);
  cam.setEnabled(cameraCanMove());
  syncCamera();
}
$('pause-btn').addEventListener('click', () => setUserPause(true));
$('resume-btn').addEventListener('click', () => setUserPause(false));
$('menu-btn').addEventListener('click', restartGame);
addEventListener('frameit:pause', () => { appPaused = true; audio.pause(); cam.setEnabled(false); syncCamera(); });
addEventListener('frameit:resume', () => { appPaused = false; if (!userPaused) audio.resume(); last = performance.now(); cam.setEnabled(cameraCanMove()); syncCamera(); });
// Su PC: Esc o P mettono e tolgono la pausa.
addEventListener('keydown', (e) => { if (running && !ended && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) setUserPause(!userPaused); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.pause(); else if (!userPaused && !appPaused) audio.resume();
  cam.setEnabled(cameraCanMove());
  syncCamera();
});
let requestedReplay: string | null = null;
try { requestedReplay = localStorage.getItem(REPLAY_REQUEST); localStorage.removeItem(REPLAY_REQUEST); } catch { /* storage unavailable */ }
if (requestedReplay) {
  const video = loadCareer().videos.find(v => v.clipId === requestedReplay);
  if (video) void watchVideo(video).catch(() => careerHub.openChannel());
  else careerHub.openChannel();
} else if (params.has('autostart') || CAREER) start();
stage.renderer.setAnimationLoop((now) => {
  if (appPaused || userPaused || document.hidden) { last = now; return; }
  // Il timestamp del primo RAF può precedere performance.now() registrato durante l'avvio.
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;

  if (practice.active) {
    gyro.update(dt);
    cam.update(dt);
    practice.update(dt);
    return;
  }

  // Replay: la partita è in pausa, si rivede la clip registrata.
  if (replay.active) {
    const st = replay.update(dt);
    if (st) {
      const { cam: c, world } = recorder.apply(st.a, st.b, st.u);
      setCamera(replay.angle(st.a, st.b, st.u, c));
      drone.syncPilot();
      views.update(dt * replay.speed);
      crowd.update(dt * replay.speed, crowdState(world), secrets.gaps);
      sky.update();
      $('rp-speed').textContent = `x${replay.speed}`;
    } else {
      endReplay();
    }
    hud.update(dt, cam, match, voice, ended);
    stage.renderer.render(stage.scene, stage.camera);
    return;
  }

  if (running && !ended) drone.update(dt);
  gyro.update(dt);
  cam.update(dt);
  const view = cam.view();
  if (drone.owned) {
    const btn = $('drone-btn');
    btn.textContent = `DRONE ${Math.ceil(drone.battery)}s`;
    btn.classList.toggle('on', drone.active);
  }
  if (running) {
    // Small simulation steps keep footwork and contacts stable when a render frame takes longer.
    const steps = Math.max(1, Math.ceil(dt * 60)), step = dt / steps;
    for (let i = 0; i < steps; i++) {
      match.update(step); director.update(step, view); voice.update(step, view); secrets.update(view);
      for (const r of [...director.finished.splice(0), ...voice.finished.splice(0), ...secrets.finished.splice(0)]) onResult(r);
      checkEnd(); recorder.tick(step, camNow(), worldNow()); collectHighlights();
    }
  }

  audio.handle(match.cues, match);
  audio.update(view, match.excitement, drone.airborne);
  // Il regista parla: stessa battuta dei sottotitoli.
  if (running && voice.current && voice.current.id !== spokenLine) {
    spokenLine = voice.current.id;
    audio.director(voice.current.text);
  }

  views.update(dt);
  crowd.update(dt, crowdState(worldNow()), secrets.gaps);
  sky.update();
  hud.update(dt, cam, match, voice, ended);
  indicators.draw(view, [...director.indicators(), ...voice.indicators()]);
  if (assisted) assist.draw(view, voice.order?.tracker.last ? voice.order.tracker : director.focusTracker());
  if (match.cuts !== seenCuts) {
    // Stacco TV (es. rimessa a centrocampo dopo un gol): nero e dissolvenza.
    seenCuts = match.cuts;
    const cut = $('cut');
    cut.classList.add('on');
    void cut.offsetWidth;
    cut.classList.remove('on');
  }
  debugOverlay?.draw(dt, match.time, view, director.focusTracker() ?? voice.order?.tracker ?? null, ambientInput(), enabled);
  stage.renderer.render(stage.scene, stage.camera);

  // Il replay aspetta la fine dell'esultanza: prima si festeggia, poi si rivede.
  if (pendingReplay && match.phase !== 'goal') {
    startReplay(pendingReplay);
    pendingReplay = null;
  }
});
