import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: edge }) });
const artifacts = new URL('../artifacts/mobile-features/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let activePage;

async function createPage(viewport = { width: 740, height: 360 }) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  await context.addInitScript(() => {
    window.nativeMessages = [];
    window.ReactNativeWebView = { postMessage(value) { window.nativeMessages.push(JSON.parse(value)); } };
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '?debug&lang=it');
  await page.waitForFunction(() => window.frameit?.cam && window.nativeMessages.some(message => message.type === 'screen'));
  await page.evaluate(async () => {
    const { CONFIG } = await import('/src/config.ts');
    CONFIG.replay.enabled = false;
  });
  return { page, context, errors };
}

const orientation = (page, alpha, screen = 90) => page.evaluate(sample => {
  window.dispatchEvent(new CustomEvent('frameit:orientation', { detail: sample }));
}, { alpha, beta: 0, gamma: -90, screen });

try {
  {
    const { page, context, errors } = await createPage();
    await page.locator('#start-btn').click();
    assert.equal(await page.locator('#tutorial').isVisible(), true);
    assert.equal(await page.evaluate(() => window.frameit.match.time), 0, 'Tutorial must not advance the match');
    assert.equal(await page.locator('#tutorial-title').textContent(), 'Sei il cameraman');
    await page.screenshot({ path: fileURLToPath(new URL('tutorial-phone.png', artifacts)) });
    for (let step = 0; step < 4; step++) {
      await page.locator('#tutorial-next').click();
      if (step === 1) {
        assert.equal(await page.locator('.shot-demo').count(), 3);
        await page.screenshot({ path: fileURLToPath(new URL('framing-phone.png', artifacts)) });
      }
      if (step === 2) assert.equal(await page.locator('.tutorial-copy p').count(), 5);
      assert.equal(await page.evaluate(() => window.frameit.match.time), 0);
    }
    assert.equal(await page.locator('#tutorial-next').textContent(), 'Prova le inquadrature');
    await page.locator('#tutorial-next').click();
    assert.equal(await page.locator('#camera-practice').isVisible(), true);
    assert.equal(await page.evaluate(() => window.frameit.match.time), 0);
    await page.locator('#practice-skip-all').click();
    await page.waitForFunction(() => window.frameit.match.time > 0);
    console.log('Tutorial starts the first match and preserves its completion');
    assert.equal(await page.evaluate(() => localStorage.getItem('frameit.tutorial.v2')), 'done');
    assert.equal(await page.locator('#start').isVisible(), false);

    // Hold both zoom buttons to verify their directions on the real game camera.
    const originalFov = await page.evaluate(() => window.frameit.cam.fov);
    const zoomIn = await page.locator('#zin').boundingBox();
    await page.mouse.move(zoomIn.x + zoomIn.width / 2, zoomIn.y + zoomIn.height / 2);
    await page.mouse.down();
    await page.waitForFunction(initial => window.frameit.cam.fov < initial - 3, originalFov);
    await page.mouse.up();

    console.log('Zoom in button works');
    const tighter = await page.evaluate(() => window.frameit.cam.fov);
    const zoomOut = await page.locator('#zout').boundingBox();
    await page.mouse.move(zoomOut.x + zoomOut.width / 2, zoomOut.y + zoomOut.height / 2);
    await page.mouse.down();
    await page.waitForFunction(initial => window.frameit.cam.fov > initial + 3, tighter);
    await page.mouse.up();
    console.log('Zoom out button works');

    // A sensor acknowledgement activates controls; the first sample calibrates without a jump.
    await page.locator('#gyro-toggle').click();
    assert(await page.evaluate(() => window.nativeMessages.some(message => message.type === 'gyroscope' && message.enabled)));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('frameit:gyro-state', { detail: { enabled: true } })));
    console.log('Gyroscope enabled through the native bridge');
    const initialPose = await page.evaluate(() => ({ yaw: window.frameit.cam.yaw, pitch: window.frameit.cam.pitch }));
    await orientation(page, 0);
    await orientation(page, 12);
    await page.waitForFunction(initial => Math.abs(window.frameit.cam.yaw - initial.yaw) + Math.abs(window.frameit.cam.pitch - initial.pitch) > 5, initialPose);
    console.log('Gyroscope movement works');
    await page.locator('#gyro-center').click();
    await orientation(page, 90);
    assert.equal(await page.evaluate(() => window.frameit.gyro.enabled), true);
    await page.evaluate(() => window.dispatchEvent(new Event('frameit:pause')));
    const paused = await page.evaluate(() => ({ yaw: window.frameit.cam.yaw, pitch: window.frameit.cam.pitch, time: window.frameit.match.time }));
    await orientation(page, 130);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => ({ yaw: window.frameit.cam.yaw, pitch: window.frameit.cam.pitch, time: window.frameit.match.time })), paused);
    await page.evaluate(() => window.dispatchEvent(new Event('frameit:resume')));
    await orientation(page, 130); // Resume re-centers instead of applying the background turn.
    await page.locator('#gyro-toggle').click();
    assert.equal(await page.locator('#gyro-center').isVisible(), false);

    // A typical scored shot must remain compact and translucent in the lower-left corner.
    await page.evaluate(() => window.frameit.hud.showResult({ label: 'Contropiede', category: 'main', points: 150, result: {
      score: 78, stars: 4, reasons: [{ text: 'Camera fluida', good: true }, { text: 'Ottima anticipazione', good: true }],
      enabled: ['coverage', 'size', 'composition', 'smoothness', 'timing'],
      components: { coverage: 90, size: 80, composition: 70, smoothness: 90, timing: 80 },
    } }));
    const rating = await page.locator('#result').boundingBox();
    assert(rating.width <= 300 && rating.height < 155);
    assert(rating.x + rating.width < 370, 'Camera rating must leave the center clear');
    const alpha = await page.locator('#result').evaluate(el => getComputedStyle(el).backgroundColor);
    assert(alpha.endsWith('0.28)'), 'The view behind the score must remain visible');
    await page.screenshot({ path: fileURLToPath(new URL('rating-phone.png', artifacts)), style: '.debug-panel,.debug-canvas { display:none !important; }' });

    // End a real game loop without waiting three minutes; verify one native placement and replay-safe controls.
    await page.evaluate(async () => {
      const { CONFIG } = await import('/src/config.ts');
      CONFIG.replay.enabled = false;
      window.frameit.match.clock = CONFIG.match.durationSec;
      window.frameit.match.phase = 'play';
      window.frameit.director.active.length = 0;
    });
    await page.waitForFunction(() => window.nativeMessages.some(message => message.type === 'match-ended'), null, { timeout: 20000 });
    assert.equal(await page.locator('#summary').isVisible(), true);
    assert.equal(await page.locator('#gyro-controls').isVisible(), false);
    assert.equal(await page.evaluate(() => window.frameit.cam.inputsEnabled), false);
    assert.equal(await page.evaluate(() => window.nativeMessages.filter(message => message.type === 'match-ended').length), 1);
    await page.locator('#sum-album').click();
    await page.locator('#album-close').click();
    assert.equal(await page.evaluate(() => window.nativeMessages.filter(message => message.type === 'screen').at(-1).screen), 'results', 'Closing the album after a match must not re-enable the home banner');
    await page.locator('#again').click();
    assert(await page.evaluate(() => window.nativeMessages.some(message => message.type === 'restart')));
    assert.deepEqual(errors, []);
    await context.close();
  }

  for (const viewport of [{ width: 568, height: 320 }, { width: 896, height: 414 }]) {
    const { page, context, errors } = await createPage(viewport);
    await page.locator('#album-btn').click();
    assert.equal(await page.evaluate(() => window.nativeMessages.filter(message => message.type === 'screen').at(-1).screen), 'album');
    await page.locator('#album-close').click();
    assert.equal(await page.evaluate(() => window.nativeMessages.filter(message => message.type === 'screen').at(-1).screen), 'menu');
    await page.evaluate(() => {
      window.__frameitNativeState = { privacyOptionsRequired: true, update: { available: true, immediate: false } };
      window.dispatchEvent(new CustomEvent('frameit:native-state', { detail: window.__frameitNativeState }));
    });
    assert.equal(await page.locator('#app-update').isVisible(), true);
    await page.locator('#update-now').click();
    assert(await page.evaluate(() => window.nativeMessages.some(message => message.type === 'app-update' && !message.immediate)));
    await page.locator('#privacy-options').click();
    assert(await page.evaluate(() => window.nativeMessages.some(message => message.type === 'privacy-options')));
    await page.locator('#update-later').click();
    assert.equal(await page.locator('#app-update').isVisible(), false);
    await page.locator('#tutorial-btn').click();
    await page.locator('#tutorial-skip').click();
    assert.equal(await page.evaluate(() => window.frameit.match.time), 0, 'Reading help from the menu must not start a match');
    await page.locator('#start-btn').click();
    await page.waitForFunction(() => window.frameit.match.time > 0);
    assert.equal(await page.locator('#tutorial').isVisible(), false, 'A saved guide is not forced again');
    assert.deepEqual(errors, []);
    await context.close();
  }

  // The mobile wrapper uses an IIFE, so also verify the actual offline bundle, not just Vite modules.
  const generated = new URL('../mobile/generated/game.js', import.meta.url);
  if (existsSync(generated)) {
    const source = await readFile(generated, 'utf8');
    const html = JSON.parse(source.match(/export default ([\s\S]*);\s*$/)[1]);
    const context = await browser.newContext({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://frameit.local/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://frameit.local/?lang=it');
    await page.locator('#start-btn').click();
    await page.locator('#tutorial-skip').click();
    assert.equal(await page.locator('#zoomctl').isVisible(), true);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('OK: first-match guide, five sports, zoom, gyro/calibration/pause, compact transparent ratings, short landscape layouts, update/privacy/restart bridge and offline bundle');
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    console.error(await activePage.evaluate(() => ({ time: window.frameit?.match.time, hidden: document.hidden, seen: localStorage.getItem('frameit.tutorial.v2'), tutorial: !document.getElementById('tutorial')?.classList.contains('hidden'), messages: window.nativeMessages })));
    await activePage.screenshot({ path: fileURLToPath(new URL('failure.png', artifacts)) });
  }
  console.error(error);
  throw error;
} finally {
  await browser.close();
  await server.close();
}
