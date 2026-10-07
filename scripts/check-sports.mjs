const assert = (condition, message) => { if (!condition) throw new Error(message); };

export async function checkSports(server, sport) {
  const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
  const { Director, EventInstance } = await server.ssrLoadModule('/src/events/director.ts');
  const { DirectorVoice } = await server.ssrLoadModule('/src/director/voice.ts');
  const { Recorder } = await server.ssrLoadModule('/src/recorder/recorder.ts');
  const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
  const { LIBRARY } = await server.ssrLoadModule('/src/events/library.ts');
  const { ORDERS } = await server.ssrLoadModule('/src/director/lines.ts');
  const all = ['coverage', 'size', 'composition', 'smoothness', 'timing'];
  const dt = 1 / 60;
  const main = LIBRARY.filter((d) => d.category === 'main');
  assert(!ORDERS.some((o) => o.target === 'keeper'), `${sport}: ordine portiere non valido`);
  const valid = (m) => {
    for (const a of m.actors) {
      assert(Number.isFinite(a.pos.x + a.pos.z), `${sport}: posizione non finita`);
      assert(Math.abs(a.pos.x) < CONFIG.pitch.length / 2 + 0.2 && Math.abs(a.pos.z) < CONFIG.pitch.width / 2 + 0.2, `${sport}: atleta fuori campo`);
      if (sport !== 'boxe') assert(a.team === 0 ? a.pos.x < 0 : a.pos.x > 0, `${sport}: atleta oltre la rete`);
    }
    assert(Number.isFinite(m.ball.pos.length()), `${sport}: palla non finita`);
  };

  // Ogni copione viene eseguito da entrambi i lati, senza affidarsi alla selezione casuale.
  for (const def of main) for (const attack of [0, 1]) {
    const m = new Match(); const director = new Director(m, all);
    const roles = new Map();
    for (const [name, role] of Object.entries(def.roles)) {
      const taken = new Set(roles.values());
      const team = role.side === 'attack' ? attack : 1 - attack;
      const actor = role.pick === 'referee' ? m.referee
        : m.actors.find((a) => a.team === team && !taken.has(a) && (!role.roles || role.roles.includes(a.role)));
      assert(actor, `${def.id}: ruolo ${name} mancante`); roles.set(name, actor);
    }
    const event = new EventInstance(def, director, m, attack, 1, roles, 0);
    const recorder = new Recorder(m);
    const view = { pos: { ...CONFIG.camera.position }, yaw: 0, pitch: CONFIG.camera.startPitch, fov: CONFIG.camera.startFov, aspect: 16 / 9 };
    let replayChecked = false;
    for (let t = 0; t < def.duration + 1 && !event.done; t += dt) {
      const oldX = m.ball.pos.x, wasFlying = m.ball.state === 'flight';
      m.update(dt);
      if (sport !== 'boxe' && wasFlying && m.ball.state === 'flight' && oldX * m.ball.pos.x < 0) {
        const clearance = sport === 'tennis' ? 0.98 : 2.43;
        assert(m.ball.pos.y > clearance, `${def.id}: palla sotto la rete (${m.ball.pos.y.toFixed(2)})`);
      }
      event.tick(dt, m.time); event.sample(m.time, { ...view }); valid(m);
      const ideal = event.tracker.last.ideal;
      const k = 1 - Math.exp(-dt / 0.12);
      for (const key of ['yaw', 'pitch', 'fov']) view[key] += (ideal[key] - view[key]) * k;
      recorder.tick(dt, { rx: 0, ry: 0, fov: view.fov }, { excitement: m.excitement, hotX: 0, hotLevel: 0, lookUp: 0 });
      if (!replayChecked && t > def.decisive) {
        const live = recorder.capture({ rx: 0, ry: 0, fov: view.fov }, { excitement: m.excitement, hotX: 0, hotLevel: 0, lookUp: 0 });
        const clip = recorder.clip(def.label, def.decisive, 0, m.time);
        assert(clip.frames.length > 2, `${def.id}: replay vuoto`);
        recorder.apply(clip.frames[0], clip.frames[1], 0.5);
        recorder.apply(live, live, 0);
        assert(JSON.stringify(recorder.capture(live.cam, live.world)) === JSON.stringify(live), `${def.id}: replay non ripristinato`);
        replayChecked = true;
      }
    }
    event.cleanup();
    assert(event.done && !event.aborted, `${def.id}: copione bloccato`);
    assert(!m.ballScripted, `${def.id}: palla rimasta occupata`);
    assert(Number.isFinite(event.tracker.result(all).score), `${def.id}: voto non valido`);
    const score = m.sportSimulation.scoreText();
    assert(sport === 'tennis' ? score.includes('15') : m.score[0] + m.score[1] > 0, `${def.id}: punto non assegnato (${score})`);
    console.log(`  ${def.id} lato ${attack}: completo, punteggio ${score}, replay ripristinato`);
  }

  if (sport === 'tennis') {
    const m = new Match(); m.ballScripted = true;
    const point = (team) => {
      m.sportSimulation.action('winner', m.actors[team], m.actors[1 - team]);
      for (let i = 0; i < 80; i++) m.update(dt);
    };
    for (let i = 0; i < 3; i++) { point(0); point(1); }
    assert(m.sportSimulation.scoreText().endsWith('40–40'), 'tennis: parità errata');
    point(0); assert(m.sportSimulation.scoreText().endsWith('AD–40'), 'tennis: vantaggio errato');
    point(1); assert(m.sportSimulation.scoreText().endsWith('40–40'), 'tennis: ritorno alla parità errato');
    point(0); point(0);
    assert(m.score[0] === 1 && m.sportSimulation.scoreText().endsWith('0–0'), 'tennis: game non assegnato');
  }

  // Una sessione intera: regia, chiusura e nessun punto dopo la fine.
  const m = new Match(); const d = new Director(m, all); const voice = new DirectorVoice(m, d, all);
  let ended = false, count = 0;
  const view = { pos: { ...CONFIG.camera.position }, yaw: 0, pitch: CONFIG.camera.startPitch, fov: CONFIG.camera.startFov, aspect: 16 / 9 };
  for (let t = 0; t < CONFIG.match.durationSec + 30 && !ended; t += dt) {
    m.update(dt); d.update(dt, view); voice.update(dt, view); valid(m);
    count += d.finished.splice(0).filter((r) => r.category === 'main').length;
    voice.finished.splice(0);
    if (m.clock >= CONFIG.match.durationSec) {
      d.stop();
      if (!d.active.some((i) => i.def.category === 'main')) { m.endMatch(); voice.end(); ended = true; }
    }
  }
  assert(ended && count >= 8 && d.aborted === 0, `${sport}: sessione non completata`);
  const score = [...m.score];
  for (let i = 0; i < 300; i++) m.update(dt);
  assert(JSON.stringify(score) === JSON.stringify(m.score), `${sport}: punti dopo la fine`);
  console.log(`  ${sport}: sessione terminata, ${count} azioni, nessun copione bloccato`);
}
