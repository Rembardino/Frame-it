// Difficoltà: per ogni sport una camera che non si muove mai deve prendere poche stelle sulle azioni principali,
// una che segue l'inquadratura ideale (con ~0,3 s di ritardo, come un giocatore bravo) tante.
// Uso: npm run check:difficulty
import assert from 'node:assert/strict';
import { createServer } from 'vite';

for (const sport of ['calcio', 'basket', 'boxe', 'tennis', 'pallavolo']) {
  globalThis.location = { search: '?sport=' + sport };
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
    const { Director, EventInstance } = await server.ssrLoadModule('/src/events/director.ts');
    const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
    const { LIBRARY } = await server.ssrLoadModule('/src/events/library.ts');
    const all = ['coverage', 'size', 'composition', 'smoothness', 'timing'];
    const dt = 1 / 60;
    const stars = { still: [], follow: [] };
    for (const mode of ['still', 'follow']) for (const def of LIBRARY.filter((d) => d.category === 'main' && !d.trigger)) for (const attack of [0, 1]) {
      const m = new Match();
      const roles = new Map();
      for (const [name, role] of Object.entries(def.roles)) {
        const taken = new Set(roles.values());
        const team = role.side === 'attack' ? attack : 1 - attack;
        roles.set(name, role.pick === 'referee' ? m.referee
          : m.actors.find((a) => a.team === team && !taken.has(a) && (!role.roles || role.roles.includes(a.role))));
      }
      if ([...roles.values()].some((a) => !a)) continue;
      const event = new EventInstance(def, new Director(m, all), m, attack, 1, roles, 0);
      const view = { pos: { ...CONFIG.camera.position }, yaw: CONFIG.camera.startYaw ?? 0, pitch: CONFIG.camera.startPitch, fov: CONFIG.camera.startFov, aspect: 16 / 9 };
      for (let t = 0; t < def.duration + 1 && !event.done; t += dt) {
        m.update(dt); event.tick(dt, m.time); event.sample(m.time, { ...view });
        if (mode === 'follow') {
          const ideal = event.tracker.last.ideal, k = 1 - Math.exp(-dt / 0.3);
          for (const key of ['yaw', 'pitch', 'fov']) view[key] += (ideal[key] - view[key]) * k;
        }
      }
      stars[mode].push(event.tracker.result(all).stars);
      event.cleanup();
    }
    const avg = (list) => list.reduce((s, x) => s + x, 0) / list.length;
    console.log(`${sport.padEnd(10)} camera ferma ${avg(stars.still).toFixed(2)} ★ · camera che segue ${avg(stars.follow).toFixed(2)} ★`);
    assert(avg(stars.still) <= 2.6, `${sport}: stando fermi si prendono troppe stelle`);
    assert(avg(stars.follow) >= 3.2, `${sport}: seguendo bene si prendono troppe poche stelle`);
  } finally { await server.close(); }
}
console.log('OK: standing still is not rewarded, following the action is');
