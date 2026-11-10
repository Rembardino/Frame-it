import assert from 'node:assert/strict';
import { createServer } from 'vite';

const random = Math.random;
try {
  for (const sport of ['tennis', 'basket']) {
    globalThis.location = { search: `?sport=${sport}` };
    const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    try {
      const { Match, BALL_RADIUS } = await server.ssrLoadModule('/src/sim/match.ts');
      const { netContactPoint } = await server.ssrLoadModule('/src/animation/motion.ts');
      for (const fps of [30, 60, 120]) {
        let seed = 731;
        Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const match = new Match(), net = match.sportSimulation?.ball;
        let contacts = 0, maxStep = 0, maxGap = 0;
        for (let frame = 0; frame < fps * 45; frame++) {
          const before = match.ball.pos.clone(), flight = net?.flight;
          match.update(1 / fps);
          maxStep = Math.max(maxStep, match.ball.pos.distanceTo(before));
          assert(Number.isFinite(match.ball.pos.length()), `${sport}: invalid ball position`);
          if (sport === 'tennis' && before.x * match.ball.pos.x < 0 && match.ball.state === 'flight') {
            assert(match.ball.pos.y > 0.98, `${fps} fps: tennis ball passes through the net`);
          }
          if (flight?.next && flight !== net.flight) {
            contacts++;
            const gap = match.ball.pos.distanceTo(netContactPoint(flight.next, match.time));
            maxGap = Math.max(maxGap, gap);
            assert(gap < 0.18, `${fps} fps: tennis contact misses the racket by ${gap.toFixed(3)} m`);
            assert(net.flight?.actor === flight.next && net.flight.delay <= 1 / fps, `${fps} fps: rally pauses at the return`);
          }
        }
        assert(maxStep < 42 / fps, `${sport}: ball jumps ${maxStep.toFixed(3)} m at ${fps} fps`);
        if (sport === 'tennis') assert(contacts > 20, `${fps} fps: too few continuous tennis returns`);
        else {
          for (const team of [0, 1]) for (const outcome of ['goal', 'save', 'wide']) {
            const shooting = new Match(), shooter = shooting.actors.find(a => a.team === team && a.role === 'mid');
            shooter.pos.set(team === 0 ? 6 : -6, 0, 2); shooter.target.copy(shooter.pos);
            shooter.vel.set(0, 0, 0); shooter.heading = team === 0 ? 0 : Math.PI;
            shooting.ball.holder = shooter; shooting.ball.state = 'held'; shooting.ballScripted = true;
            shooting.ball.pos.copy(shooter.pos).add({ x: 0.3, y: BALL_RADIUS + 0.25, z: 0.3 });
            const before = shooting.ball.pos.clone();
            shooting.shoot(shooter, outcome);
            assert.equal(shooting.ball.pos.distanceTo(before), 0, 'basket: shot teleports to the hands');
            const flight = shooting.ball.flight;
            assert(flight.release && shooting.score[team] === 0, 'basket: shot skips the gather');
            let released = false;
            for (let frame = 0; frame < fps * 3; frame++) {
              const gathering = !!flight.release;
              shooting.update(1 / fps);
              if (gathering && !flight.release) {
                released = true;
                assert(flight.t <= 1 / fps, 'basket: flight advances during the gather');
                assert(flight.from.distanceTo(netContactPoint(shooter, shooting.time, 0.6 * 0.32)) < 0.25, 'basket: shot leaves away from the hands');
              }
            }
            assert(released, 'basket: ball never leaves the hands');
            assert(outcome === 'goal' ? shooting.score[team] > 0 : shooting.score.every(n => n === 0), `basket: ${outcome} scores incorrectly`);
          }
          const loose = new Match(); loose.ballScripted = true; loose.ball.pos.set(0, 1.6, 0);
          loose.looseBall(2, 0);
          assert.equal(loose.ball.pos.y, 1.6, 'basket: lost ball snaps to the floor');
          for (let frame = 0; frame < fps; frame++) {
            loose.update(1 / fps);
            assert(loose.ball.pos.y >= BALL_RADIUS, 'basket: lost ball falls through the court');
          }
        }
        console.log(`${sport} ${fps} fps: max ball step ${maxStep.toFixed(3)} m; ${sport === 'tennis' ? `${contacts} continuous returns, max racket gap ${maxGap.toFixed(3)} m` : 'shot gathers, both sides, all outcomes and loose-ball bounces OK'}`);
      }
    } finally { await server.close(); }
  }
} finally { Math.random = random; }
