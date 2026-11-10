import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { search: '?sport=basket' };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const random = Math.random;
try {
  const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
  const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
  for (const fps of [30, 60, 120]) for (const team of [0, 1]) {
    const dt = 1 / fps;
    for (const count of [1, 2, 3]) {
      const match = new Match(), shooter = match.actors.find(a => a.team === team && a.role === 'mid');
      const fouler = match.actors.find(a => a.team !== team && a.role === 'mid');
      Math.random = () => 0.1;
      match.basketball.foul(fouler, shooter, count);
      const clock = match.clock;
      let attempts = 0, sawInbound = false, sawOutside = false, done = false;
      for (let i = 0; i < fps * 40; i++) {
        const previous = match.ball.flight;
        match.update(dt);
        if (previous?.freeThrow && match.ball.flight !== previous) attempts++;
        if (match.basketball.inbound) {
          sawInbound = true;
          assert.equal(match.basketball.inbound.team, 1 - team, 'last made free throw gives possession to the wrong team');
          if (match.basketball.inbound.stage === 'pass') sawOutside ||= Math.abs(match.basketball.inbound.taker.pos.x) > CONFIG.pitch.length / 2;
        }
        if (match.phase !== 'play') assert.equal(match.clock, clock, 'clock runs during free throws or the inbound');
        if (match.phase === 'play') { done = true; break; }
      }
      assert(done && sawInbound && sawOutside, `free throws ${count}: inbound never completed from outside the endline`);
      assert.equal(attempts, count); assert.equal(match.score[team], count, 'free throw is not worth one point');
      assert.equal(match.basketball.fouls[1 - team], 1);
    }
    const missed = new Match(), shooter = missed.actors.find(a => a.team === team), fouler = missed.actors.find(a => a.team !== team);
    Math.random = () => 0.99;
    missed.basketball.foul(fouler, shooter, 2);
    let sawFirstMiss = false, lastMissLive = false;
    for (let i = 0; i < fps * 35; i++) {
      missed.update(dt);
      if (missed.basketball.freeThrows?.left === 1) { sawFirstMiss = true; assert.equal(missed.phase, 'freeThrow'); assert.equal(missed.basketball.inbound, null); }
      if (!missed.basketball.freeThrows && missed.phase === 'play') { lastMissLive = missed.ball.flight?.kind === 'pass'; break; }
    }
    assert(sawFirstMiss && lastMissLive, 'missed free throws do not distinguish intermediate attempts from a live final rebound');
    assert.deepEqual(missed.score, [0, 0]);
    const charge = new Match(), attacker = charge.actors.find(a => a.team === team), defender = charge.actors.find(a => a.team !== team);
    charge.basketball.foul(attacker, defender, 0);
    assert.equal(charge.basketball.freeThrows, null); assert.equal(charge.basketball.inbound.team, 1 - team);
    const dunk = new Match(), dunker = dunk.actors.find(a => a.team === team), d = team === 0 ? 1 : -1;
    dunker.pos.set(d * (CONFIG.pitch.length / 2 - CONFIG.pitch.hoopFromBaseline - 0.7), 0, 0.1);
    dunker.heading = team === 0 ? 0 : Math.PI; dunker.target.copy(dunker.pos); dunker.vel.set(0, 0, 0);
    dunk.ball.holder = dunker; dunk.ball.state = 'held'; dunk.ball.pos.copy(dunker.pos).setY(0.8);
    Math.random = () => 0.1;
    dunk.shoot(dunker, 'goal'); assert.equal(dunker.pose, 'dunk');
    const flight = dunk.ball.flight;
    for (let i = 0; i < fps * 3; i++) dunk.update(dt);
    assert(flight.from.y > CONFIG.pitch.rimHeight, 'dunk leaves the hands below the rim');
    assert.equal(dunk.score[team], 2); assert.equal(dunk.basketball.inbound?.team, 1 - team);
    console.log(`${fps} fps, side ${team}: 1/2/3 free throws, stopped clock, final rebound, offensive foul, endline inbound and two-point dunk OK`);
    Math.random = random;
  }
} finally { Math.random = random; await server.close(); }
