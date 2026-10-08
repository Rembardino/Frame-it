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
const artifacts = new URL('../artifacts/camera-practice/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let activePage;
const liveState = page => page.evaluate(() => {
  const { match, recorder, cam } = window.frameit;
  return { frame: recorder.capture({ rx: 0, ry: 0, fov: 40 }, { excitement: 0, hotX: 0, hotLevel: 0, lookUp: 0 }),
    clock: match.clock, score: [...match.score], camera: { yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov } };
});
const align = async page => {
  await page.evaluate(() => window.frameit.cam.setView(window.frameit.practice.ideal));
  await page.waitForFunction(() => window.frameit.practice.completed && window.frameit.practice.score === 100, null, { timeout: 30000 });
};
try {
  for (const sport of process.argv.includes('--course-only') || process.argv.includes('--offline-only') ? [] : ['calcio', 'basket', 'boxe', 'tennis', 'pallavolo']) {
    const viewport = sport === 'calcio' ? { width: 568, height: 320 } : { width: 740, height: 360 };
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      window.nativeMessages = [];
      window.ReactNativeWebView = { postMessage(value) { window.nativeMessages.push(JSON.parse(value)); } };
    });
    const page = await context.newPage(); activePage = page; page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?debug&lang=it&sport=${sport}`);
    await page.waitForFunction(() => window.frameit?.practice);
    const before = await liveState(page);
    await page.locator('#practice-btn').click();
    assert.equal(await page.evaluate(() => window.frameit.practice.phase), 'preview');
    assert.equal(await page.evaluate(() => window.frameit.cam.inputsEnabled), false);
    await page.waitForFunction(() => window.frameit.practice.cursor > 0.1);
    assert.equal(await page.evaluate(() => window.frameit.match.time), 0, 'Example advances the real match');
    for (let index = 0; index < 3; index++) {
      await page.locator('#practice-try').click();
      await page.waitForFunction(() => window.frameit.practice.inputActive && document.getElementById('practice-reference').width === 320 && document.querySelectorAll('#practice-guides rect').length > 0);
      assert.equal(await page.evaluate(() => window.frameit.practice.index), index);
      assert.equal(await page.evaluate(() => window.frameit.practice.modelScore), 100);
      assert.equal(await page.evaluate(() => window.frameit.cam.inputsEnabled), true);
      assert.equal(await page.locator('#practice-next').isDisabled(), true);
      const ui = await page.evaluate(() => {
        const ref = document.querySelector('.practice-reference').getBoundingClientRect();
        const actions = document.querySelector('.practice-actions').getBoundingClientRect();
        const feedback = document.querySelector('.practice-feedback').getBoundingClientRect();
        return { reference: ref.width > 100 && ref.right <= innerWidth && ref.bottom < innerHeight,
          actions: actions.left >= 0 && actions.right <= innerWidth && actions.bottom <= innerHeight,
          feedback: feedback.top >= 0 && feedback.right < innerWidth / 2,
          guides: document.querySelectorAll('#practice-guides rect').length };
      });
      assert(ui.reference && ui.actions && ui.feedback && ui.guides > 0, `${sport}: exercise controls overflow`);
      if (index === 0) {
        // Exercise the actual game input, as well as the independent alignment oracle below.
        const initial = await page.evaluate(() => ({ yaw: window.frameit.cam.yaw, fov: window.frameit.cam.fov }));
        await page.keyboard.down('KeyD');
        await page.waitForFunction(yaw => window.frameit.cam.yaw > yaw + 0.5, initial.yaw);
        await page.keyboard.up('KeyD');
        await page.keyboard.down('KeyE');
        await page.waitForFunction(fov => window.frameit.cam.fov < fov - 0.5, initial.fov);
        await page.keyboard.up('KeyE');
        await page.locator('#practice-guide-toggle').click();
        assert.equal(await page.locator('#practice-guides').isVisible(), false);
        await page.locator('#practice-guide-toggle').click();
        await page.screenshot({ path: fileURLToPath(new URL(`${sport}-exercise.png`, artifacts)) });
      }
      await align(page);
      assert.equal(await page.locator('#practice-next').isDisabled(), false);
      if (index === 0 && sport === 'calcio') {
        await page.evaluate(() => window.dispatchEvent(new Event('frameit:pause')));
        const paused = await page.evaluate(() => ({ cursor: window.frameit.practice.cursor, yaw: window.frameit.cam.yaw }));
        await page.waitForTimeout(150);
        assert.deepEqual(await page.evaluate(() => ({ cursor: window.frameit.practice.cursor, yaw: window.frameit.cam.yaw })), paused);
        assert.equal(await page.evaluate(() => window.frameit.cam.inputsEnabled), false);
        await page.evaluate(() => window.dispatchEvent(new Event('frameit:resume')));
        assert.equal(await page.evaluate(() => window.frameit.cam.inputsEnabled), true);
        await page.locator('#practice-example').click();
        assert.equal(await page.evaluate(() => window.frameit.cam.inputsEnabled), false);
        await page.locator('#practice-try').click();
        await align(page);
      }
      if (index === 2) await page.screenshot({ path: fileURLToPath(new URL(`${sport}-success.png`, artifacts)) });
      await page.locator('#practice-next').click();
    }
    assert.equal(await page.locator('#start').isVisible(), true);
    assert.equal(await page.evaluate(() => window.frameit.practice.active), false);
    assert.deepEqual(await liveState(page), before, `${sport}: practice changed the live match or camera`);
    assert.equal(await page.evaluate(() => window.nativeMessages.some(message => message.type === 'match-ended' || message.type === 'screen' && message.screen === 'playing')), false);
    // Re-enter and leave without completing: all controls and the menu must still recover.
    await page.locator('#practice-btn').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#start').isVisible(), true);
    assert.equal(await page.evaluate(() => window.frameit.cam.inputsEnabled), false);
    assert.deepEqual(errors, []);
    console.log(`${sport}: three real examples, 100/100 alignment, controls, retry, native placement and state isolation OK`);
    await context.close();
  }
  // The upgraded first-match guide includes practice and starts only after its final exercise.
  if (!process.argv.includes('--offline-only')) {
  const context = await browser.newContext({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem('frameit.tutorial.v1', 'done');
    window.nativeMessages = [];
    window.ReactNativeWebView = { postMessage(value) { window.nativeMessages.push(JSON.parse(value)); } };
  });
  const page = await context.newPage(); activePage = page;
  const courseErrors = []; page.on('pageerror', error => courseErrors.push(error.message));
  await page.goto(`${base}?debug&lang=it`);
  await page.waitForFunction(() => window.frameit?.practice, null, { timeout: 30000 });
  await page.locator('#start-btn').click();
  assert.equal(await page.locator('#tutorial').isVisible(), true, 'Old guide skips the new practical course');
  for (let index = 0; index < 5; index++) await page.locator('#tutorial-next').click();
  await page.locator('#practice-exit').click();
  assert.equal(await page.locator('#tutorial').isVisible(), true);
  assert.equal(await page.evaluate(() => window.frameit.match.time), 0);
  await page.locator('#tutorial-next').click();
  await page.waitForFunction(() => window.frameit.practice.inputActive, null, { timeout: 30000 });
  for (let index = 0; index < 3; index++) {
    if (index > 0) await page.locator('#practice-try').click();
    await align(page);
    await page.locator('#practice-next').click();
  }
  await page.waitForFunction(() => window.frameit.match.time > 0);
  assert.equal(await page.evaluate(() => window.frameit.practice.active), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('frameit.tutorial.v2')), 'done');
  assert.equal(await page.evaluate(() => window.frameit.views.group.visible), true);
  assert.equal(await page.evaluate(() => window.nativeMessages.filter(message => message.type === 'screen').at(-1).screen), 'playing');
  assert.deepEqual(courseErrors, []);
  console.log('First-match course: full example playback, return to theory, three exercises and clean match start OK');
  await context.close();
  }
  const generated = new URL('../mobile/generated/game.js', import.meta.url);
  if (!process.argv.includes('--course-only') && existsSync(generated)) {
    const source = await readFile(generated, 'utf8');
    const html = JSON.parse(source.match(/export default ([\s\S]*);\s*$/)[1]);
    const context = await browser.newContext({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); activePage = page;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://frameit.local/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://frameit.local/?debug&lang=it&sport=tennis');
    await page.waitForFunction(() => window.frameit?.practice);
    await page.locator('#practice-btn').click();
    await page.locator('#practice-try').click();
    await align(page);
    assert.equal(await page.evaluate(() => window.frameit.practice.modelScore), 100);
    assert.equal(await page.evaluate(() => window.frameit.match.time), 0);
    await page.locator('#practice-exit').click();
    assert.equal(await page.locator('#start').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('Offline Android HTML: real tennis example, 100/100 exercise and clean return to menu OK');
    await context.close();
  }
} catch (error) {
  console.error(error);
  if (activePage && !activePage.isClosed()) {
    console.error(await activePage.evaluate(() => ({ phase: window.frameit?.practice.phase, score: window.frameit?.practice.score,
      model: window.frameit?.practice.modelScore, index: window.frameit?.practice.index })));
    await activePage.screenshot({ path: fileURLToPath(new URL('failure.png', artifacts)), timeout: 5000 }).catch(() => {});
  }
  throw error;
} finally { await browser.close(); await server.close(); }
