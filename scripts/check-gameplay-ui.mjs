import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: edge }) });
const artifacts = new URL('../artifacts/gameplay/', import.meta.url);
await mkdir(artifacts, { recursive: true });
try {
  for (const sport of ['calcio', 'basket', 'boxe', 'tennis', 'pallavolo']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?debug&lang=it&sport=${sport}`);
    await page.waitForFunction(() => window.frameit?.views);
    const metrics = await page.evaluate(async () => {
      const { CONFIG } = await import('/src/config.ts');
      window.dispatchEvent(new Event('frameit:pause'));
      document.getElementById('start').style.display = 'none';
      document.querySelectorAll('.debug-canvas, .debug-panel').forEach(element => { element.style.display = 'none'; });
      const { match, director, voice, cam, stage, views, hud } = window.frameit;
      const view = cam.view();
      const strikes = new Set(['kick', 'shoot', 'racket', 'backhand', 'serve', 'spike', 'jab', 'hook', 'uppercut']);
      let action;
      for (let i = 0; i < 1800; i++) {
        match.update(1 / 60); director.update(1 / 60, view); voice.update(1 / 60, view);
        if (i < 600) continue;
        action = match.actors.find(a => strikes.has(a.pose) && a.poseTime / a.poseDur > 0.27 && a.poseTime / a.poseDur < 0.4);
        if (action) break;
      }
      views.update(1 / 60);
      hud.update(1 / 60, cam, match, voice, false);
      const ideal = director.focusTracker()?.last?.ideal;
      if (ideal) {
        stage.camera.rotation.set(ideal.pitch * Math.PI / 180, -ideal.yaw * Math.PI / 180, 0);
        stage.camera.fov = Math.max(ideal.fov, 30);
      } else {
        const center = match.actors.reduce((v, a) => v.add(a.pos), match.actors[0].pos.clone().set(0, 0, 0)).divideScalar(match.actors.length);
        center.y = 1;
        stage.camera.lookAt(center);
        stage.camera.fov = CONFIG.camera.startFov;
      }
      stage.camera.updateProjectionMatrix();
      stage.renderer.render(stage.scene, stage.camera);
      // Retain the frame for capture even on machines whose RAF is heavily throttled.
      stage.renderer.setAnimationLoop(() => stage.renderer.render(stage.scene, stage.camera));
      return { athletes: match.actors.length, time: match.time, action: action?.pose, geometries: stage.renderer.info.memory.geometries };
    });
    assert(metrics.time > 9.9 && metrics.geometries > 0 && metrics.action, `${sport}: no animated sporting action rendered`);
    await page.screenshot({ path: fileURLToPath(new URL(`${sport}.png`, artifacts)) });
    assert.deepEqual(errors, [], `${sport}: browser errors`);
    console.log(`${sport}: ${metrics.athletes} athletes, ${metrics.action} animation, WebGL scene and mobile HUD rendered`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
