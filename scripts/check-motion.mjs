import { createServer } from 'vite';
import * as THREE from 'three';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const originalRandom = Math.random;
let seed = 731;
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cam = { rx: 0, ry: 0, fov: 40 }, world = { excitement: 0, hotX: 0, hotLevel: 0, lookUp: 0 };
try {
  for (const sport of ['calcio', 'basket', 'boxe', 'tennis', 'pallavolo']) {
    globalThis.location = { search: '?sport=' + sport };
    const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
    try {
      const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
      const { actorMotion } = await server.ssrLoadModule('/src/animation/motion.ts');
      const { Recorder } = await server.ssrLoadModule('/src/recorder/recorder.ts');
      const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
      const { steerActor, separateActors } = await server.ssrLoadModule('/src/sim/locomotion.ts');
      const dt = 1 / 60;
      // Arrivals must stop without oscillation; reversals must brake before accelerating back.
      const walking = new Match().actors[0];
      walking.pose = 'normal'; walking.pos.set(0, 0, 0); walking.vel.set(0, 0, 0);
      walking.target.set(0, 0, 1.5);
      for (let i = 0; i < 300; i++) {
        const velocity = walking.vel.clone();
        steerActor(walking, [walking], dt);
        assert(walking.vel.distanceTo(velocity) <= CONFIG.match.accel * dt + 1e-6, `${sport}: acceleration exceeds limit`);
      }
      assert(walking.pos.distanceTo(walking.target) < 0.03 && walking.vel.length() < 0.02, `${sport}: arrival keeps sliding`);
      walking.target.set(0, 0, 8);
      for (let i = 0; i < 45; i++) steerActor(walking, [walking], dt);
      const outward = walking.vel.clone(); walking.target.set(0, 0, -1);
      steerActor(walking, [walking], dt);
      assert(walking.vel.dot(outward) > 0 && walking.vel.length() < outward.length(), `${sport}: instant reversal without braking`);
      walking.pose = 'shoot';
      for (let i = 0; i < 45; i++) steerActor(walking, [walking], dt);
      assert(walking.vel.length() < 0.31, `${sport}: planted gesture slides at running speed`);

      // Both longitudinal and lateral head-on crossings must complete without a collision/deadlock.
      for (const axis of ['x', 'z']) {
        const crossing = new Match().actors.slice(0, 2);
        crossing.forEach((a, i) => {
          a.pose = 'normal'; a.pos.set(0, 0, 0); a.vel.set(0, 0, 0);
          a.pos[axis] = i === 0 ? -1.5 : 1.5; a.target.copy(a.pos).multiplyScalar(-1);
        });
        let minGap = Infinity;
        for (let i = 0; i < 240; i++) {
          crossing.forEach(a => steerActor(a, crossing, dt));
          separateActors(crossing, dt);
          minGap = Math.min(minGap, crossing[0].pos.distanceTo(crossing[1].pos));
        }
        assert(minGap > 0.55, `${sport}: bodies collide along ${axis} (${minGap.toFixed(2)} m)`);
        assert(crossing.every(a => a.pos.distanceTo(a.target) < 0.15), `${sport}: head-on crossing stalls along ${axis}`);
      }
      const m = new Match(), actor = m.actors[0], recorder = new Recorder(m);
      actor.vel.set(0, 0, 0); actor.poseBlendTime = CONFIG.visuals.poseBlendSec;
      const before = actorMotion(actor, m.time, m.ball.holder === actor);
      m.setPose(actor, sport === 'boxe' ? 'jab' : sport === 'tennis' ? 'racket' : sport === 'pallavolo' ? 'spike' : 'shoot', 0.7);
      assert(JSON.stringify(before) === JSON.stringify(actorMotion(actor, m.time, m.ball.holder === actor)), `${sport}: snap at gesture change`);
      m.update(0.075);
      const interrupted = JSON.stringify(actorMotion(actor, m.time, m.ball.holder === actor));
      m.setPose(actor, 'crouch', 0.7);
      assert(JSON.stringify(actorMotion(actor, m.time, m.ball.holder === actor)) === interrupted, `${sport}: snap when interrupting a transition`);
      m.update(0.075);
      const frame = recorder.capture(cam, world), gesture = JSON.stringify(actorMotion(actor, m.time, m.ball.holder === actor));
      for (let i = 0; i < 25; i++) m.update(1 / 60);
      const live = recorder.capture(cam, world);
      recorder.apply(frame, frame, 0);
      assert(JSON.stringify(actorMotion(actor, m.time, m.ball.holder === actor)) === gesture, `${sport}: replay gesture or breathing differs`);
      recorder.apply(live, live, 0);
      assert(JSON.stringify(recorder.capture(cam, world)) === JSON.stringify(live), `${sport}: replay failed to restore transition`);

      // Follow normal gameplay through catches, tosses and rallies, including a full set of direction changes.
      const ambient = new Match();
      let maxBallStep = 0, maxActorStep = 0, maxTurn = 0;
      for (let i = 0; i < 3600; i++) {
        const ball = ambient.ball.pos.clone();
        const actors = ambient.actors.map(a => ({ pos: a.pos.clone(), heading: a.heading }));
        ambient.update(1 / 60);
        maxBallStep = Math.max(maxBallStep, ambient.ball.pos.distanceTo(ball));
        ambient.actors.forEach((a, index) => {
          maxActorStep = Math.max(maxActorStep, a.pos.distanceTo(actors[index].pos));
          const turn = a.heading - actors[index].heading;
          maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))));
          assert(Object.values(actorMotion(a, ambient.time)).every(Number.isFinite), `${sport}: invalid motion`);
        });
      }
      assert(maxActorStep < 0.18, `${sport}: actor jumps ${maxActorStep.toFixed(3)} m per frame`);
      if (sport === 'tennis' || sport === 'pallavolo') {
        assert(maxBallStep < 0.85, `${sport}: catch/launch ball discontinuity ${maxBallStep.toFixed(3)} m per frame`);
        assert(maxTurn < 0.45, `${sport}: abrupt turn ${maxTurn.toFixed(3)} rad per frame`);
        const { NetBall } = await server.ssrLoadModule('/src/sim/sports/netBall.ts');
        m.setPose(actor, sport === 'tennis' ? 'racket' : 'set', 0.75);
        const net = new NetBall(m), from = m.ball.pos.clone();
        net.launch(actor, new THREE.Vector3(-actor.pos.x, 1, 0), 1.1, 1);
        assert(m.ball.pos.distanceTo(from) === 0, `${sport}: ball teleports at wind-up`);
        net.update(0.24);
        assert(m.ball.state === 'held', `${sport}: ball leaves before contact`);
        assert(m.ball.pos.y > (sport === 'tennis' ? 1.15 : 2), `${sport}: strike starts below racket/hands`);
        net.update(1 / 60);
        assert(m.ball.state === 'flight' && m.ball.holder === null, `${sport}: ball remains held after contact`);
        const { Director, EventInstance } = await server.ssrLoadModule('/src/events/director.ts');
        const { LIBRARY } = await server.ssrLoadModule('/src/events/library.ts');
        const rally = new Match(); rally.ballScripted = true;
        const passer = rally.actors[0], receiver = rally.actors.find(a => a.team !== passer.team);
        rally.sportSimulation.action(sport === 'tennis' ? 'forehand' : 'serve', passer, receiver);
        const definition = LIBRARY.find(event => event.category === 'main');
        const step = definition.steps.find(step => step.do === 'sport');
        const event = new EventInstance({ ...definition, steps: [{ ...step, t: 0 }] },
          new Director(rally, ['coverage']), rally, 1, 1, new Map([[step.who, receiver], [step.target, passer]]), 0);
        const heldBy = rally.ball.holder;
        event.tick(dt, rally.time);
        assert(rally.sportSimulation.busy && rally.ball.holder === heldBy, `${sport}: script replaces an incoming flight`);
        for (let i = 0; i < 240; i++) { rally.update(dt); event.tick(dt, rally.time); }
        assert(sport === 'tennis' ? rally.sportSimulation.scoreText().includes('15') : rally.score[1] === 1,
          `${sport}: waiting action never resumes`);
      }
      if (sport === 'calcio') {
        const restart = new Match(); restart.ballScripted = true;
        // Force a long recovery, as can happen when a forward has followed a scripted run.
        const taker = restart.actors.find(a => a.team === 1 && a.role === 'fwd');
        taker.pos.set(25, 0, 15); taker.target.copy(taker.pos);
        restart.kickoffTeam = 1;
        restart.startReset();
        let maxStep = 0;
        for (let i = 0; i < 1800 && restart.phase === 'reset'; i++) {
          const before = taker.pos.clone(); restart.update(dt);
          maxStep = Math.max(maxStep, taker.pos.distanceTo(before));
        }
        assert(restart.phase === 'play' && restart.ball.holder === taker, 'calcio: kickoff waits forever');
        assert(maxStep < 0.18 && taker.pos.distanceTo(new THREE.Vector3(0.6, 0, 0)) < 0.75,
          'calcio: kickoff teleports the forward');
      }
      if (sport === 'boxe') {
        const ring = new Match(); ring.ballScripted = true;
        ring.sportSimulation.action('jab', ring.actors[0], ring.actors[1]);
        assert(ring.score[0] === 0 && ring.actors[1].pose !== 'recoil', 'boxe: impact precedes the punch');
        for (let i = 0; i < 14; i++) ring.update(1 / 60);
        assert(ring.score[0] === 1 && ring.actors[1].pose === 'recoil', 'boxe: punch and reaction are not synchronized');
        for (let i = 0; i < 60; i++) ring.update(1 / 60);
        assert(ring.score[0] === 1, 'boxe: punch scores twice');
        const distant = new Match(); distant.ballScripted = true;
        distant.actors[0].scripted = distant.actors[1].scripted = true;
        distant.actors[0].pos.set(-2, 0, 0); distant.actors[1].pos.set(2, 0, 0);
        distant.actors.forEach(a => a.target.copy(a.pos));
        distant.sportSimulation.action('jab', distant.actors[0], distant.actors[1]);
        for (let i = 0; i < 20; i++) distant.update(dt);
        assert(distant.score[0] === 0 && distant.actors[1].pose !== 'recoil', 'boxe: an out-of-range punch scores');
      }
      console.log(`${sport}: transitions and replay OK; maximum actor step ${maxActorStep.toFixed(3)} m, ball step ${maxBallStep.toFixed(3)} m`);
    } finally { await server.close(); }
  }
} finally { Math.random = originalRandom; }
console.log('OK: continuous motion and timed contacts');
