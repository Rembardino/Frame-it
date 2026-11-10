import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { search: '?sport=pallavolo' };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const random = Math.random;
try {
  const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
  const { netContactPoint } = await server.ssrLoadModule('/src/animation/motion.ts');
  for (const fps of [30, 60, 120]) {
    let seed = 731;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const match = new Match(), simulation = match.sportSimulation, net = simulation.ball;
    let contacts = 0, maxStep = 0, maxContactGap = 0, crossings = 0;
    for (let frame = 0; frame < fps * 45; frame++) {
      const before = match.ball.pos.clone(), flight = net.flight;
      const actors = match.actors.map(a => a.pos.clone());
      match.update(1 / fps);
      maxStep = Math.max(maxStep, match.ball.pos.distanceTo(before));
      match.actors.forEach((a, i) => assert(a.pos.distanceTo(actors[i]) < 6 / fps + 0.02, `${fps} fps: player position jumps`));
      if (before.x * match.ball.pos.x < 0 && match.ball.state === 'flight') {
        crossings++;
        assert(match.ball.pos.y > 2.43, `${fps} fps: ball passes through the net`);
      }
      if (flight?.next && flight !== net.flight) {
        contacts++;
        const gap = match.ball.pos.distanceTo(netContactPoint(flight.next, match.time));
        maxContactGap = Math.max(maxContactGap, gap);
        assert(gap < 0.25, `${fps} fps: contact misses the hands by ${gap.toFixed(3)} m`);
        assert(net.flight && net.flight.actor === flight.next, `${fps} fps: rally pauses between touches`);
        assert(net.flight.delay <= 1 / fps, `${fps} fps: incoming contact restarts the wind-up`);
      }
      assert(Number.isFinite(match.ball.pos.length()), `${fps} fps: invalid ball position`);
    }
    assert(contacts > 20 && crossings > 8, `${fps} fps: too few complete rally sequences`);
    assert(maxStep < 32 / fps, `${fps} fps: ball jumps ${maxStep.toFixed(3)} m in one frame`);
    assert.equal(match.cuts, 0, `${fps} fps: players need a reset teleport`);
    console.log(`${fps} fps: ${contacts} continuous contacts, max hand gap ${maxContactGap.toFixed(3)} m, max ball step ${maxStep.toFixed(3)} m`);
  }
} finally {
  Math.random = random;
  await server.close();
}
