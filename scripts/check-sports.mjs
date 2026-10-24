const assert = (condition, message) => { if (!condition) throw new Error(message); };

export async function checkSports(server, sport) {
  if (sport === 'golf') return checkGolf(server);
  if (sport === 'ciclismo' || sport === 'vela') return checkDroneRace(server, sport);
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

// Golf: giri completi con un drone robot che resta vicino alla palla e insegue l'inquadratura ideale.
async function checkGolf(server) {
  const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
  const { Director } = await server.ssrLoadModule('/src/events/director.ts');
  const { DirectorVoice } = await server.ssrLoadModule('/src/director/voice.ts');
  const { Recorder } = await server.ssrLoadModule('/src/recorder/recorder.ts');
  const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
  const { lieAt, COURSE } = await server.ssrLoadModule('/src/sim/sports/golfCourse.ts');
  const all = ['coverage', 'size', 'composition', 'smoothness', 'timing'];
  const dt = 1 / 60;
  // Dove deve stare la palla quando il colpo finisce.
  const expect = (id) => /-in$|g-ace|g-putt$|g-putt-short|g-putt-long/.test(id) ? 'cup'
    : /water/.test(id) ? 'water' : /^g-\w+-bunker$/.test(id) ? 'bunker'
    : id === 'g-drive' || id === 'g-layup' ? 'fairway' : id === 'g-drive-tree' ? 'rough' : /short$/.test(id) && id !== 'g-putt-short' ? 'off' : 'green';
  for (const h of COURSE) {
    assert(lieAt(h.pin[0], h.pin[1]) === 'green', `buca ${h.n}: bandiera fuori dal green`);
    assert(lieAt(h.tee[0], h.tee[1]) === 'tee', `buca ${h.n}: tee non riconosciuto`);
  }
  const seen = new Map();
  let stars = 0, scored = 0;
  for (let k = 0; k < 8; k++) {
    const m = new Match(), d = new Director(m, all, { forceRare: k === 0 }), voice = new DirectorVoice(m, d, all), golf = m.sportSimulation;
    const recorder = new Recorder(m);
    const view = { pos: { x: 0, y: 12, z: 0 }, yaw: 0, pitch: -10, fov: CONFIG.camera.startFov, aspect: 16 / 9 };
    let ended = false, replayChecked = false;
    for (let t = 0; t < CONFIG.match.durationSec + 60 && !ended; t += dt) {
      m.update(dt);
      // Il drone robot vola a 30 m dalla palla, un po' in alto.
      const b = m.ball.pos;
      view.pos.x += (b.x - 22 - view.pos.x) * 0.05; view.pos.z += (b.z + 22 - view.pos.z) * 0.05; view.pos.y = 14;
      d.update(dt, { ...view }); voice.update(dt, { ...view });
      for (const r of d.finished.splice(0)) {
        seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
        if (r.result && r.category === 'main') { stars += r.result.stars; scored++; }
        if (r.category !== 'main' && r.category !== 'rare') continue;
        if (r.id === 'g-esultanza') continue;
        const want = expect(r.id), lie = lieAt(b.x, b.z);
        const ok = want === 'cup' ? b.y < 0 && Math.hypot(b.x - golf.pin.x, b.z - golf.pin.z) < 0.01
          : want === 'water' ? b.y < 0 && lie === 'water' : want === 'off' ? ['fringe', 'rough', 'fairway'].includes(lie) : lie === want;
        assert(ok, `${r.id}: la palla doveva finire in ${want}, è in ${lie} (y ${b.y.toFixed(2)})`);
      }
      voice.finished.splice(0);
      for (const a of m.everyone) assert(Number.isFinite(a.pos.x + a.pos.z) && Math.abs(a.pos.x) < 460 && Math.abs(a.pos.z) < 310, `golf: ${a.role} fuori dal percorso`);
      assert(Number.isFinite(b.x + b.y + b.z), 'golf: palla non finita');
      const tr = d.focusTracker();
      if (tr?.last) for (const key of ['yaw', 'pitch', 'fov']) view[key] += (tr.last.ideal[key] - view[key]) * (1 - Math.exp(-dt / 0.2));
      recorder.tick(dt, { rx: 0, ry: 0, fov: view.fov, ...view.pos }, { excitement: m.excitement, hotX: 0, hotLevel: 0, lookUp: 0 });
      if (!replayChecked && m.ball.state === 'flight' && t > 12) {
        const live = recorder.capture({ rx: 0, ry: 0, fov: view.fov }, { excitement: 0, hotX: 0, hotLevel: 0, lookUp: 0 });
        const clip = recorder.clip('golf', m.time, m.time - 3, m.time);
        recorder.apply(clip.frames[0], clip.frames[1], 0.5); recorder.apply(live, live, 0);
        assert(JSON.stringify(recorder.capture(live.cam, live.world)) === JSON.stringify(live), 'golf: replay non ripristinato');
        replayChecked = true;
      }
      if (m.clock >= CONFIG.match.durationSec) {
        d.stop();
        if (m.phase === 'play' && !d.active.some((i) => i.def.category === 'main')) { m.endMatch(); voice.end(); ended = true; }
      }
    }
    assert(ended && golf.finished, `golf: giro non finito in tempo (buca ${golf.holeIdx + 1}, ${m.time.toFixed(0)} s)`);
    assert(golf.results.length === CONFIG.golf.holesPerRound && d.aborted === 0, 'golf: buche mancanti o copioni bloccati');
    if (k === 0) assert(seen.has('g-ace'), 'golf: la buca in uno forzata (?rare) non è arrivata');
    console.log(`  giro ${k + 1}: buche ${golf.round.map((h) => h.n).join('-')}, ${golf.scoreText()} (${golf.results.map((x) => (x > 0 ? '+' : '') + x).join(' ')}), ${m.time.toFixed(0)} s`);
  }
  for (const id of ['g-drive', 'g-tee3', 'g-approach', 'g-putt-short', 'g-esultanza']) assert(seen.has(id), `golf: mai visto ${id}`);
  console.log('  colpi:', JSON.stringify(Object.fromEntries([...seen].sort())));
  console.log(`  stelle medie del drone robot: ${(stars / scored).toFixed(2)}`);
}

// Ciclismo e vela: corse intere con un drone robot che resta sopra l'azione e insegue l'inquadratura ideale.
async function checkDroneRace(server, sport) {
  const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
  const { Director } = await server.ssrLoadModule('/src/events/director.ts');
  const { DirectorVoice } = await server.ssrLoadModule('/src/director/voice.ts');
  const { Recorder } = await server.ssrLoadModule('/src/recorder/recorder.ts');
  const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
  const all = ['coverage', 'size', 'composition', 'smoothness', 'timing'];
  const dt = 1 / 60, seen = new Map();
  let stars = 0, scored = 0;
  for (let k = 0; k < 5; k++) {
    const m = new Match(), d = new Director(m, all, { forceRare: k === 0 }), voice = new DirectorVoice(m, d, all), race = m.sportSimulation;
    const recorder = new Recorder(m);
    const view = { pos: { x: m.ball.pos.x, y: 20, z: m.ball.pos.z + 30 }, yaw: 0, pitch: -20, fov: CONFIG.camera.startFov, aspect: 16 / 9 };
    let ended = false, replayChecked = false, mains = 0;
    for (let t = 0; t < CONFIG.match.durationSec + 60 && !ended; t += dt) {
      m.update(dt);
      const b = m.ball.pos;
      view.pos.x += (b.x - 20 - view.pos.x) * 0.05; view.pos.z += (b.z + 25 - view.pos.z) * 0.05; view.pos.y = 22;
      d.update(dt, { ...view }); voice.update(dt, { ...view });
      for (const r of d.finished.splice(0)) {
        seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
        if (r.category === 'main') mains++;
        if (r.result && r.category === 'main') { stars += r.result.stars; scored++; }
      }
      voice.finished.splice(0);
      for (const a of m.everyone) assert(Number.isFinite(a.pos.x + a.pos.y + a.pos.z) && Math.abs(a.pos.x) < CONFIG.pitch.length / 2 + 10 && Math.abs(a.pos.z) < CONFIG.pitch.width / 2 + 10, `${sport}: ${a.role} fuori dal mondo (${a.pos.x.toFixed(0)}, ${a.pos.z.toFixed(0)})`);
      for (const a of m.fauna.list) for (let i = 0; i < a.n; i++) assert(Number.isFinite(m.fauna.at(a, i, m.time).pos.length()), `${sport}: animale non finito`);
      const tr = d.focusTracker();
      if (tr?.last) for (const key of ['yaw', 'pitch', 'fov']) view[key] += (tr.last.ideal[key] - view[key]) * (1 - Math.exp(-dt / 0.2));
      recorder.tick(dt, { rx: 0, ry: 0, fov: view.fov, ...view.pos }, { excitement: m.excitement, hotX: 0, hotLevel: 0, lookUp: 0 });
      if (!replayChecked && t > 40) {
        const live = recorder.capture({ rx: 0, ry: 0, fov: view.fov }, { excitement: 0, hotX: 0, hotLevel: 0, lookUp: 0 });
        const clip = recorder.clip(sport, m.time, m.time - 3, m.time);
        recorder.apply(clip.frames[0], clip.frames[1], 0.5); recorder.apply(live, live, 0);
        assert(JSON.stringify(recorder.capture(live.cam, live.world)) === JSON.stringify(live), `${sport}: replay non ripristinato`);
        replayChecked = true;
      }
      if (m.clock >= CONFIG.match.durationSec) {
        d.stop();
        if (m.phase === 'play' && !d.active.some((i) => i.def.category === 'main')) { m.endMatch(); voice.end(); ended = true; }
      }
    }
    assert(ended && race.finished, `${sport}: corsa non finita (${m.time.toFixed(0)} s)`);
    assert(d.aborted === 0 && mains >= 7, `${sport}: troppe poche azioni (${mains}) o copioni bloccati (${d.aborted})`);
    if (k === 0) assert([...seen.keys()].some((id) => id === 'c-aquila' || id === 'r-balena'), `${sport}: l'evento raro forzato non è arrivato`);
    console.log(`  corsa ${k + 1}: ${race.scoreText()}, ${mains} azioni, finita a ${m.time.toFixed(0)} s`);
  }
  console.log('  eventi:', JSON.stringify(Object.fromEntries([...seen].sort())));
  console.log(`  stelle medie del drone robot: ${(stars / scored).toFixed(2)}`);
}
