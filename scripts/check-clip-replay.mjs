import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
  await page.goto(`${base}?debug&lang=it&sport=basket`);
  await page.waitForFunction(() => window.frameit);
  await page.evaluate(async () => {
    const { match, recorder, stage } = window.frameit;
    const { fresh, settle, saveCareer } = await import('/src/career/career.ts');
    const { saveClips, loadClip } = await import('/src/recorder/archive.ts');
    const frames = [];
    for (let i = 0; i < 120; i++) {
      match.update(1 / 30);
      frames.push(recorder.capture({ rx: stage.camera.rotation.x, ry: stage.camera.rotation.y, fov: 40, x: 0, y: 5, z: 20 }, { excitement: 0, hotX: 0, hotLevel: 0, lookUp: 0 }));
    }
    const clip = { label: 'Canestro', decisive: frames[60].t, frames };
    const state = fresh();
    settle(state, { kind: 'own', sport: 'basket' }, [{ label: clip.label, stars: 4, score: 80, rare: false, clipId: 'basket-test' }], 80, false);
    state.videos.push({ label: 'Vecchio video', sport: 'calcio', stars: 3, views: 20, money: 1 });
    await saveClips([{ id: 'basket-test', recording: { clip, seeds: [...match.actors, ...match.extras].map(a => a.seed) } }], ['basket-test']);
    saveCareer(state);
    if (!(await loadClip('basket-test'))?.clip.frames.length) throw new Error('Recording missing');
  });
  // A fresh football page must switch to the recording's basketball scene.
  await page.goto(`${base}?debug&lang=it&sport=calcio`);
  await page.locator('#career-btn').click();
  await page.locator('[data-tab="channel"]').click();
  await page.getByText('Clip non disponibile', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Rivedi clip' }).click();
  await page.waitForURL(/sport=basket/);
  await page.waitForFunction(() => window.frameit?.replay.active);
  const before = await page.evaluate(() => window.frameit.replay.t);
  await page.waitForFunction(t => window.frameit.replay.t > t + 0.1, before);
  await page.waitForFunction(() => !window.frameit.replay.active, null, { timeout: 20000 });
  await page.locator('#career:not(.hidden) [data-replay]').waitFor();
  await page.getByRole('button', { name: 'Rivedi clip' }).click();
  await page.waitForFunction(() => window.frameit.replay.active);
  await page.locator('#replay').click();
  await page.waitForFunction(() => !window.frameit.replay.active);
  assert.equal(await page.locator('#career').isVisible(), true);
  assert.equal(await page.evaluate(() => window.frameit.match.time), 0, 'Menu scene restored after replay');
  assert.deepEqual(errors, []);
  console.log('OK: persistent clips, legacy videos, cross-sport replay, playback completion, repeat and skip');
} finally { await browser.close(); await server.close(); }
