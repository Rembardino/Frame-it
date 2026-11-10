import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = 'artifacts/stands'; await mkdir(out, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' }); await server.listen();
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&sport=basket&lang=it`);
  await page.waitForFunction(() => window.frameit?.views, null, { timeout: 60000 });
  for (const mode of ['wide', 'close', 'costume']) {
    const result = await page.evaluate(async mode => {
      window.dispatchEvent(new Event('frameit:pause'));
      document.querySelectorAll('.overlay,.debug-panel,.debug-canvas').forEach(e => e.style.display = 'none');
      const { match, stage, views, cam, recorder, crowd } = window.frameit;
      const { SecretMoments, isSecretCaptured } = await import('/src/events/secrets.ts');
      const { CONFIG } = await import('/src/config.ts');
      for (const actor of match.extras) if (actor.role === 'spectator' && actor.active) match.despawnExtra(actor);
      const secrets = new SecretMoments(match, stage.seatRows, mode === 'costume' ? 's-costume' : 's-proposal');
      const view = { ...cam.view(), pos: { ...CONFIG.camera.position } };
      let frozen, shotView, placed = false, minHeight = Infinity;
      for (let i = 0; i < 60 * 60 && !secrets.finished.length; i++) {
        match.update(1 / 60); secrets.update(view);
        const live = secrets.active[0];
        if (live?.tracker.last) {
          placed = true;
          for (const actor of live.actors) minHeight = Math.min(minHeight, actor.pos.y);
          const ideal = live.tracker.last.ideal;
          Object.assign(view, ideal, { pos: view.pos, aspect: 16 / 9, fov: Math.min(CONFIG.camera.fovMax, ideal.fov * (mode === 'wide' ? 4 : 1.08)) });
          if (!frozen && match.time >= live.tracker.moment.decisive) {
            frozen = recorder.capture({ rx: 0, ry: 0, fov: view.fov }, { excitement: 0.2, hotX: 0, hotLevel: 0, lookUp: 0 });
            shotView = { ...view };
          }
        }
      }
      const result = secrets.finished[0]?.result;
      if (frozen) recorder.apply(frozen, frozen, 0);
      views.update(0); crowd.update(0, { excitement: 0.2, hot: { x: 0, level: 0 }, lookUp: 0 }, secrets.gaps);
      stage.camera.position.copy(shotView.pos); stage.camera.rotation.set(shotView.pitch * Math.PI / 180, -shotView.yaw * Math.PI / 180, 0, 'YXZ');
      stage.camera.fov = shotView.fov; stage.camera.updateProjectionMatrix();
      stage.renderer.setAnimationLoop(() => stage.renderer.render(stage.scene, stage.camera));
      return { placed, minHeight, score: result?.score, captured: isSecretCaptured(result), spectatorScale: CONFIG.visuals.spectatorScale,
        ballDiameter: views.ball.geometry.parameters.radius * 2 };
    }, mode);
    assert(result.placed && result.minHeight > 0.25, `${mode}: secret is not on the bleachers`);
    assert(result.spectatorScale < 1 && result.ballDiameter >= 0.24 && result.ballDiameter <= 0.32);
    assert(mode === 'wide' ? result.score <= 15 && !result.captured : result.score >= 90 && result.captured, `${mode}: wrong capture quality ${JSON.stringify(result)}`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/${mode}.png` });
    console.log(`${mode}: bleacher height ${result.minHeight.toFixed(2)} m, score ${result.score}, captured ${result.captured}, basketball diameter ${result.ballDiameter.toFixed(3)} m`);
  }
  await page.close();
} finally { await browser.close(); await server.close(); }
