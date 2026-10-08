import assert from 'node:assert/strict';
import { createServer } from 'vite';

let seed = 1929;
const random = Math.random;
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
try {
  for (const sport of ['calcio', 'basket', 'boxe', 'tennis', 'pallavolo']) {
    globalThis.location = { search: `?sport=${sport}` };
    const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
    try {
      const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
      const { LESSONS, buildLesson, lessonModel, lessonStartView, framingScore } = await server.ssrLoadModule('/src/tutorial/lessons.ts');
      for (const spec of LESSONS[sport].flatMap(spec => [spec, spec, spec])) {
        const clip = buildLesson(spec);
        assert(clip.frames.length > 15, `${spec.event}: empty example`);
        assert(clip.frames.some(item => item.frame.actors.some(a => a.pose !== 'normal' && a.pose !== 'guard' || Math.hypot(a.vx, a.vz) > 0.5)), `${spec.event}: example has no action`);
        const frozen = clip.frames.at(-1), previous = JSON.stringify(clip);
        for (const aspect of [16 / 9, 740 / 360, 568 / 320, 896 / 414]) {
          const view = { pos: { ...CONFIG.camera.position }, aspect, yaw: 0, pitch: -10, fov: 40 };
          const ideal = lessonModel(frozen.input, view);
          const score = framingScore(ideal, frozen.input).score;
          assert.equal(score, 100, `${spec.event}: model cannot achieve 100`);
          assert(Math.abs(ideal.yaw) <= CONFIG.camera.yawLimit && ideal.pitch >= CONFIG.camera.pitchMin && ideal.pitch <= CONFIG.camera.pitchMax, `${spec.event}: camera cannot reach model`);
          const wrong = lessonStartView(ideal);
          assert(framingScore(wrong, frozen.input).score < 90, `${spec.event}: wrong shot teaches no correction`);
        }
        assert.equal(JSON.stringify(clip), previous, `${spec.event}: evaluating mutated the recorded clip`);
        console.log(`${spec.event}: animated clip and 100/100 model at four aspect ratios`);
      }
    } finally { await server.close(); }
  }
} finally { Math.random = random; }
console.log('OK: 15 actions with three variations each, reachable 100/100 references, four landscape aspect ratios');
