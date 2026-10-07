// Controlli rapidi senza grafica: partita automatica (3 minuti simulati) per ogni sport + Scoring Module.
// Uso: npm run check
import { createServer } from 'vite';
import { checkSports } from './check-sports.mjs';

const assert = (cond, msg) => { if (!cond) throw new Error('FALLITO: ' + msg); };
for (const sport of ['calcio', 'basket', 'boxe', 'tennis', 'pallavolo']) {
// Lo sport si sceglie dall'URL: qui lo simulo. Un server nuovo per sport = moduli ricaricati da zero.
globalThis.location = { search: '?sport=' + sport };
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  console.log(`
===== ${sport.toUpperCase()} =====`);
  if (sport === 'boxe' || sport === 'tennis' || sport === 'pallavolo') {
    await checkSports(server, sport);
    continue;
  }
  const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
  const { LIBRARY } = await server.ssrLoadModule('/src/events/library.ts');
  const cat = (id) => LIBRARY.find((d) => d.id === id);

  // ---------------------------------------------------------------- partita + Event Director
  const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
  const { Director } = await server.ssrLoadModule('/src/events/director.ts');
  const { DirectorVoice } = await server.ssrLoadModule('/src/director/voice.ts');
  const { summarize } = await server.ssrLoadModule('/src/scoring/summary.ts');
  const Mo = await server.ssrLoadModule('/src/scoring/moment.ts');
  const Sc = await server.ssrLoadModule('/src/scoring/scoring.ts');
  const m = new Match();
  const ALL = ['coverage', 'size', 'composition', 'smoothness', 'timing'];
  const dir = new Director(m, ALL);
  const voice = new DirectorVoice(m, dir, ALL);
  const lines = [];
  let lastLine = 0, ended = false;
  // Cameraman robot: insegue l'inquadratura ideale del momento in corso con ~0,3 s di ritardo.
  const C = CONFIG.camera;
  const view = { pos: { ...C.position }, yaw: 0, pitch: C.startPitch, fov: C.startFov, aspect: 2.16 };
  const results = [];
  const limX = CONFIG.pitch.length / 2 + 8, limZ = CONFIG.pitch.width / 2 + 8;
  const dt = 1 / 60;
  // Gira finché la partita non finisce (come in main.ts), con un tetto di sicurezza.
  for (let t = 0; t < CONFIG.match.durationSec * 2 && !ended; t += dt) {
    m.update(dt);
    const v = { ...view };
    dir.update(dt, v);
    voice.update(dt, v);
    for (const r of [...dir.finished.splice(0), ...voice.finished.splice(0)]) { results.push(r); voice.onResult(r); }
    if (voice.current && voice.current.id !== lastLine) { lastLine = voice.current.id; lines.push(`[${voice.current.kind}] ${voice.current.text}`); }
    if (m.clock >= CONFIG.match.durationSec) {
      dir.stop();
      if (m.phase === 'play' && !dir.active.some((i) => i.def.category === 'main')) {
        ended = true; m.endMatch(); voice.end();
      }
    }
    const tr = voice.order?.tracker.last ? voice.order.tracker : dir.focusTracker();
    let ideal = tr?.last?.ideal;
    if (!ideal) {
      const b = m.ball;
      const near = b.holder ?? m.actors.reduce((p, a) => (a.pos.distanceTo(b.pos) < p.pos.distanceTo(b.pos) ? a : p));
      ideal = Sc.evaluateFrame(v, Mo.frameInput([Mo.actorSubject(near, 'x'), Mo.ballSubject(b)], 0, 'wide')).ideal;
    }
    const k = 1 - Math.exp(-dt / 0.3);
    view.yaw += (ideal.yaw - view.yaw) * k;
    view.pitch += (ideal.pitch - view.pitch) * k;
    view.fov += (ideal.fov - view.fov) * k;
    for (const a of m.everyone) {
      const p = a.pos;
      assert(Number.isFinite(p.x + p.y + p.z) && Math.abs(p.x) <= limX && Math.abs(p.z) <= limZ, `${a.role} fuori posto a t=${t.toFixed(2)}: ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
    assert(Number.isFinite(m.ball.pos.x + m.ball.pos.y + m.ball.pos.z), 'palla NaN');
  }
  const byId = {};
  for (const id of dir.started) byId[id] = (byId[id] ?? 0) + 1;
  console.log('eventi:', JSON.stringify(byId), '| dilemmi', dir.dilemmas, '| annullati', dir.aborted, '| punteggio', m.score.join('-'));
  for (const r of results) console.log(`  ${r.category.padEnd(11)} ${r.label.padEnd(26)} ${r.result ? '★'.repeat(r.result.stars).padEnd(5) + ' ' + r.result.reasons.map((x) => x.text).join(' | ') : 'PERSO'}`);
  console.log('regista:', lines.slice(0, 14).join(' / '));
  const sum = summarize(results);
  console.log('riepilogo:', JSON.stringify({ ...sum, best: sum.best.map((b) => b.label) }));
  assert(ended, 'la partita non è finita');
  assert(voice.ordersIssued >= (sport === 'basket' ? 1 : 3), 'troppi pochi ordini: ' + voice.ordersIssued);
  assert(voice.hints >= 4, 'troppi pochi indizi: ' + voice.hints);
  assert(sum.points > 0 && sum.avgStars > 0, 'riepilogo vuoto');
  const main = results.filter((r) => r.category === 'main' && r.result);
  const avg = main.reduce((s, r) => s + r.result.stars, 0) / main.length;
  console.log('stelle medie (azioni principali, cameraman robot):', avg.toFixed(2));
  const mainStarted = dir.started.filter((id) => cat(id).category === 'main' && !cat(id).trigger).length;
  assert(mainStarted >= 8, 'troppe poche azioni principali: ' + mainStarted);
  assert(dir.started.filter((id) => cat(id).category === 'distraction').length >= 2, 'troppe poche distrazioni');
  assert(dir.dilemmas >= 1, 'nessun dilemma');
  assert(dir.aborted <= 2, 'troppi eventi annullati: ' + dir.aborted);
  assert(Math.abs(m.score[0] - m.score[1]) <= CONFIG.director.maxGoalLead + 3, 'punteggio incoerente');
  assert(avg >= 3, 'il cameraman robot che segue l ideale dovrebbe fare almeno 3 stelle di media');

  // ---------------------------------------------------------------- stella cadente + recorder + replay
  {
    const { Recorder } = await server.ssrLoadModule('/src/recorder/recorder.ts');
    const { ReplayPlayer } = await server.ssrLoadModule('/src/recorder/replay.ts');
    const m2 = new Match();
    const d2 = new Director(m2, ALL, { forceRare: true });
    const rec = new Recorder(m2);
    const v2 = { pos: { ...C.position }, yaw: 0, pitch: C.startPitch, fov: C.startFov, aspect: 2.16 };
    const res2 = [];
    for (let t = 0; t < 60; t += dt) {
      m2.update(dt);
      const v = { ...v2 };
      d2.update(dt, v);
      res2.push(...d2.finished.splice(0));
      const tr = d2.active.find((i) => i.def.category === 'rare')?.tracker ?? d2.focusTracker();
      if (tr?.last) {
        const k = 1 - Math.exp(-dt / 0.3);
        v2.yaw += (tr.last.ideal.yaw - v2.yaw) * k;
        v2.pitch += (tr.last.ideal.pitch - v2.pitch) * k;
        v2.fov += (tr.last.ideal.fov - v2.fov) * k;
      }
      rec.tick(dt, { rx: v2.pitch * Math.PI / 180, ry: -v2.yaw * Math.PI / 180, fov: v2.fov }, { excitement: m2.excitement, hotX: 0, hotLevel: 0, lookUp: d2.crowdLookUp });
      if (res2.some((r) => r.category === 'rare')) break;
    }
    const star = res2.find((r) => r.category === 'rare');
    assert(star && star.result, 'la stella cadente forzata non è arrivata');
    console.log(`stella cadente: ${'★'.repeat(star.result.stars)} ${star.result.score}, punti ${star.points}${star.multiplier ? ' (x' + star.multiplier + ')' : ''} | ${star.result.reasons.map((x) => x.text).join(' | ')}`);
    assert(star.result.stars >= 3, 'il robot dovrebbe riprendere la stella');

    // Il replay deve rimettere tutto esattamente com'era.
    const cam0 = { rx: 0.1, ry: 0.2, fov: 30 }, w0 = { excitement: 0, hotX: 0, hotLevel: 0, lookUp: 0 };
    const live = rec.capture(cam0, w0);
    const clip = rec.clip(star.label, star.window.decisive, star.window.decisive - CONFIG.replay.before, star.window.decisive + CONFIG.replay.after);
    assert(clip.frames.length > 20, 'clip troppo corta: ' + clip.frames.length);
    const player = new ReplayPlayer();
    player.start(clip);
    let replayTime = 0, steps = 0;
    while (player.active && steps < 5000) {
      const st = player.update(dt);
      if (st) rec.apply(st.a, st.b, st.u);
      replayTime += dt;
      steps++;
    }
    rec.apply(live, live, 0);
    const back = rec.capture(cam0, w0);
    assert(JSON.stringify(back) === JSON.stringify(live), 'dopo il replay lo stato non torna identico');
    console.log(`replay: clip ${(clip.frames.at(-1).t - clip.frames[0].t).toFixed(1)} s rivista in ${replayTime.toFixed(1)} s, stato ripristinato`);
  }

  // ---------------------------------------------------------------- scoring (geometria del calcio: una volta basta)
  if (sport !== 'calcio') continue;
  const S = Sc;
  const pos = { x: 0, y: 5, z: 27 }, aspect = 2.16;
  const player = (x, z, vx = 0) => ({
    label: 'Tiratore', kind: 'player', weight: 1, vel: { x: vx, y: 0, z: 0 },
    points: [
      { p: { x, y: 2.0, z }, kind: 'head' }, { p: { x, y: 1.34, z }, kind: 'body' }, { p: { x, y: 0.05, z }, kind: 'feet' },
      { p: { x, y: 1.1, z: z + 0.45 }, kind: 'hands' }, { p: { x, y: 1.1, z: z - 0.45 }, kind: 'hands' },
    ],
  });
  const ball = (x, z) => ({ label: 'Palla', kind: 'ball', weight: 1.2, vel: { x: 0, y: 0, z: 0 }, points: [{ p: { x, y: 0.22, z }, kind: 'ball' }] });
  const goal = { label: 'Porta', kind: 'goal', weight: 0.6, vel: { x: 0, y: 0, z: 0 },
    points: [[-3, 0], [3, 0], [-3, 2.2], [3, 2.2]].map(([z, y]) => ({ p: { x: 30, y, z }, kind: 'goal' })) };

  const input = { subjects: [player(18, 0, 5), ball(18.5, 0), goal], lead: 0, size: 'medium' };
  const ideal = S.idealView(pos, aspect, input).view;
  const e = S.evaluateFrame(ideal, input);
  assert(e.coverage > 0.99 && e.size > 0.99 && e.composition > 0.99, `ideale non perfetto: ${JSON.stringify([e.coverage, e.size, e.composition])}`);

  const run = (viewAt, enabled = ALL, inp = input) => {
    const samples = [];
    for (let t = 0; t <= 3; t += 1 / 60) { const v = viewAt(t); samples.push({ t, view: v, ev: S.evaluateFrame(v, inp) }); }
    return S.scoreMoment(samples, 2, enabled);
  };
  const texts = (r) => r.reasons.map((x) => x.text).join(' | ');
  const away = { ...ideal, yaw: ideal.yaw - 60 };
  const cases = {
    perfetta: run(() => ideal),
    altrove: run(() => away),
    ritardo: run((t) => (t < 2.4 ? away : ideal)),
    lontano: run(() => ({ ...ideal, fov: ideal.fov * 2.2 })),
    lontanoLiv1: run(() => ({ ...ideal, fov: ideal.fov * 2.2 }), CONFIG.scoring.levels[1]),
    scatti: run((t) => ({ ...ideal, yaw: ideal.yaw + 1.5 * Math.sin(t * Math.PI * 6) })),
  };
  // Palla lontana dal tiratore, camera inquadra solo tiratore + porta.
  const inBall = { subjects: [player(18, 0, 5), ball(11, 0), goal], lead: 0, size: 'medium' };
  const noBall = S.idealView(pos, aspect, { ...inBall, subjects: [inBall.subjects[0], goal] }).view;
  cases.pallaTagliata = run(() => noBall, ALL, inBall);

  for (const [k, r] of Object.entries(cases)) console.log(`  ${k.padEnd(14)} ${String(r.score).padStart(3)} ${'★'.repeat(r.stars).padEnd(5)}  ${texts(r)}`);
  assert(cases.perfetta.stars === 5 && texts(cases.perfetta).includes('Ottima anticipazione'), 'perfetta');
  assert(cases.altrove.stars === 1 && cases.altrove.decisiveMissed, 'altrove');
  assert(cases.ritardo.stars <= 2 && texts(cases.ritardo).includes('In ritardo di 0,4 s'), 'ritardo');
  assert(texts(cases.lontano).includes('Troppo lontano') && cases.lontano.stars < 5, 'lontano');
  assert(!texts(cases.lontanoLiv1).includes('Troppo lontano') && cases.lontanoLiv1.score > cases.lontano.score, 'livello 1 ignora la taglia');
  assert(texts(cases.scatti).includes('Movimenti bruschi'), 'scatti');
  assert(texts(cases.pallaTagliata).includes('Palla tagliata'), 'palla tagliata');
} finally {
  await server.close();
}
}
console.log('\nOK');
