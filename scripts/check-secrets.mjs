// Momenti segreti: restano segreti se non li guardi, reagiscono alla camera, danno bonus se ripresi. Uso: npm run check:secrets
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import * as THREE from 'three';

for (const sport of ['calcio', 'tennis', 'boxe']) {
  globalThis.location = { search: '?sport=' + sport };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
    const { SecretMoments, PLANS } = await server.ssrLoadModule('/src/events/secrets.ts');
    const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
    const Sc = await server.ssrLoadModule('/src/scoring/scoring.ts');
    const ALL = ['coverage', 'size', 'composition', 'smoothness', 'timing'];
    const W = CONFIG.pitch.width, L = CONFIG.pitch.length;
    const rows = [0, 1].map((i) => ({ from: new THREE.Vector3(-L / 2, 0.6 + i * 0.5, -(W / 2 + 6.45 + i * 0.9)), to: new THREE.Vector3(L / 2, 0.6 + i * 0.5, -(W / 2 + 6.45 + i * 0.9)), facing: -Math.PI / 2, team: -1 }));
    const C = CONFIG.camera;
    const away = { pos: { ...C.position }, yaw: 0, pitch: 45, fov: 20, aspect: 16 / 9 }; // in cielo: non si vede nessuno
    const dt = 1 / 60;

    for (const plan of PLANS.filter((p) => !p.sports || p.sports.includes(sport))) {
      // 1) Senza guardarla: nessun voto, nessun avviso, e gli spettatori se ne vanno.
      let m = new Match(), s = new SecretMoments(m, rows, plan.id);
      for (let t = 0; t < 60 && (t < 6 || s.active.length); t += dt) { m.update(dt); s.update(away); if (t > 6) s.stop(); }
      assert.equal(s.finished.length, 0, `${sport}/${plan.id}: unseen secret was announced`);
      s.update(away);
      assert(!m.extras.some((e) => e.role === 'spectator' && e.active), `${sport}/${plan.id}: spectators stay after leaving`);

      // 2) Inquadrata bene: reagisce (se deve) e vale un bonus "virale".
      m = new Match(); s = new SecretMoments(m, rows, plan.id);
      const view = { ...away, pos: { ...C.position } };
      let reacted = false;
      for (let t = 0; t < 60 && !s.finished.length; t += dt) {
        m.update(dt); s.update(view);
        const live = s.active[0];
        // Basta averli tutti in quadro: inquadratura ideale ma due volte più larga.
        if (live?.tracker.last) Object.assign(view, live.tracker.last.ideal, { pos: view.pos, aspect: view.aspect, fov: live.tracker.last.ideal.fov * 2 });
        if (live?.triggerAt !== null && live) reacted = true;
        for (const a of m.extras.filter((e) => e.role === 'spectator' && e.active)) assert(Number.isFinite(a.pos.x + a.pos.y + a.pos.z), 'spectator position');
      }
      assert(reacted, `${sport}/${plan.id}: never reacted to the camera`);
      const r = s.finished[0];
      assert(r && r.category === 'secret' && r.result && r.points > 0, `${sport}/${plan.id}: filmed secret gives no bonus`);
      assert(r.label.startsWith('Virale: '), 'viral label');
      assert.equal(r.result.score, 100, `${sport}/${plan.id}: fully framed secret should give the full bonus`);
      console.log(`  ${sport} ${plan.id}: ${'★'.repeat(r.result.stars)} ${r.points} pt`);
    }
  } finally { await server.close(); }
}
// Il 100 si raggiunge in un intervallo, non in un solo punto: zoom un po' diverso e soggetto un po' spostato valgono ancora 100.
{
  globalThis.location = { search: '?sport=calcio' };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const Sc = await server.ssrLoadModule('/src/scoring/scoring.ts');
    const subject = { label: 'x', kind: 'player', weight: 1, vel: { x: 0, y: 0, z: 0 }, points: [
      { p: { x: 0, y: 2, z: 0 }, kind: 'head' }, { p: { x: 0, y: 1.3, z: 0 }, kind: 'body' }, { p: { x: 0, y: 0.05, z: 0 }, kind: 'feet' }] };
    const input = { subjects: [subject], lead: 0, size: 'medium' };
    const pos = { x: 0, y: 5, z: 27 };
    const ideal = Sc.evaluateFrame({ pos, yaw: 0, pitch: 0, fov: 30, aspect: 16 / 9 }, input).ideal;
    const near = Sc.evaluateFrame({ ...ideal, fov: ideal.fov * 1.15, yaw: ideal.yaw + ideal.fov * 0.04 }, input);
    assert(near.size === 1 && near.composition === 1, `near-ideal framing is not perfect (size ${near.size}, composition ${near.composition})`);
    const far = Sc.evaluateFrame({ ...ideal, fov: ideal.fov * 2 }, input);
    assert(far.size < 1, 'a much wider shot still loses size points');
  } finally { await server.close(); }
}
console.log('OK: secret moments stay silent unless filmed, react to the camera and pay a viral bonus');
