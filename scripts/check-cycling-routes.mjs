import assert from 'node:assert/strict';
import { createServer } from 'vite';

const starts = new Set(), towns = new Set(), peaks = [];
for (const route of ['collinare', 'montagna', 'tecnico']) {
  globalThis.location = { search: `?sport=ciclismo&route=${route}` };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
    const { Director } = await server.ssrLoadModule('/src/events/director.ts');
    const { Recorder } = await server.ssrLoadModule('/src/recorder/recorder.ts');
    const { CYCLING_ROUTE, LENGTH, roadAt, roadGrade, roadCurve, terrainHeight } = await server.ssrLoadModule('/src/sim/sports/cyclingRoute.ts');
    starts.add(JSON.stringify(roadAt(0).toArray())); towns.add(CYCLING_ROUTE.town);
    let peak = 0;
    let climb = 0, descent = 0, previousTurn = 0, reversals = 0;
    for (let s = 10; s < LENGTH - 20; s += 5) {
      const grade = roadGrade(s), turn = Math.abs(roadCurve(s)) > 0.002 ? Math.sign(roadCurve(s)) : 0;
      peak = Math.max(peak, roadAt(s).y);
      climb = Math.max(climb, grade); descent = Math.min(descent, grade);
      if (turn && previousTurn && turn !== previousTurn) reversals++;
      if (turn) previousTurn = turn;
      assert(Math.abs(roadAt(s).y - terrainHeight(roadAt(s).x, roadAt(s).z) - 0.2) < 1e-6);
    }
    assert(climb > 0.03 && descent < -0.03 && reversals >= 4, `${route}: missing climbs, descents or S-bends`);
    const match = new Match(), director = new Director(match, ['coverage']), race = match.sportSimulation;
    assert.equal(match.actors.length, 14);
    const view = { pos: { x: 0, y: 40, z: 30 }, yaw: 0, pitch: -20, fov: 60, aspect: 16 / 9 };
    for (let i = 0; i < 60 * 180 && !race.finished; i++) {
      match.update(1 / 60);
      view.pos.x = match.ball.pos.x - 20; view.pos.z = match.ball.pos.z + 25; view.pos.y = match.actors[0].pos.y + 20;
      director.update(1 / 60, view);
      for (const a of match.actors) assert(Math.abs(a.pos.y - terrainHeight(a.pos.x, a.pos.z) - 0.2) < 1e-6, `${route}: rider leaves the road surface`);
    }
    assert(race.finished, `${route}: race does not reach the finish within the session`);
    for (let i = 0; i < 180; i++) match.update(1 / 60);
    assert.equal(race.leaders()[0], race.winner, 'Post-finish braking changes the winner');
    assert.deepEqual(match.score, [0, 0], 'Individual winner still adds a team score');
    assert.equal(new Recorder(match).clip('race', 0, 0, 1).teams, undefined);
    assert.equal(director.aborted, 0);
    peaks.push(peak);
    console.log(`${route}/${CYCLING_ROUTE.town}: peak ${peak.toFixed(0)} m, climb ${(climb * 100).toFixed(1)}%, descent ${(descent * 100).toFixed(1)}%, ${reversals} changes of turn, individual winner ${race.scoreText()}`);
  } finally { await server.close(); }
}
assert.equal(starts.size, 3); assert.equal(towns.size, 3); assert(Math.max(...peaks) - Math.min(...peaks) > 80, 'Stages still have similar elevation profiles');
