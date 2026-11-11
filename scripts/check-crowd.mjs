// Pubblico e fluidità: i tifosi reagiscono alle scenette vicine e ai momenti caldi, lo shader resta nei 16 attributi
// garantiti da WebGL2, e la nitidezza adattiva scende di un gradino solo se serve.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: edge }) });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}?debug&sport=basket&lang=it`);
  await page.waitForFunction(() => window.frameit?.crowd, null, { timeout: 60000 });
  const crowd = await page.evaluate(() => {
    window.dispatchEvent(new Event('frameit:pause'));
    const { crowd, stage } = window.frameit;
    const parts = [];
    stage.scene.traverse((o) => { if (o.name?.startsWith('crowd-')) parts.push(o); });
    // instanceMatrix occupa 4 attributi, instanceColor 1.
    const attributes = Math.max(...parts.map((part) => Object.keys(part.geometry.attributes).length + 5));
    const state = parts[0].geometry.getAttribute('fanState');
    const run = (s) => { for (let i = 0; i < 180; i++) crowd.update(1 / 60, { hot: { x: 0, level: 0 }, lookUp: 0, focus: { x: 0, z: 0 }, ...s }); };
    const read = () => crowd.fans.map((f, i) => ({ f, turn: Math.abs(f.turn), stand: state.getX(i), raise: state.getY(i), clap: Math.floor(state.getZ(i)) / 16 }));
    const seated = crowd.fans.filter((f) => f.standAt > 0.3), centre = seated[Math.floor(seated.length / 2)];
    const distance = (f) => Math.hypot(f.x - centre.x, f.z - centre.z);
    run({ excitement: 0.02 });
    const calm = read();
    run({ excitement: 0.02, spots: [{ x: centre.x, y: centre.y, z: centre.z, level: 1 }] });
    const spot = read();
    run({ excitement: 1 });
    const goal = read();
    run({ excitement: 0.02, lookUp: 1 });
    const mean = (list, key) => list.reduce((sum, item) => sum + item[key], 0) / Math.max(1, list.length);
    return {
      parts: parts.length, attributes, fans: crowd.fans.length,
      calmClap: mean(calm, 'clap'), calmRaise: mean(calm, 'raise'),
      nearClap: mean(spot.filter((x) => distance(x.f) < 2.5 && distance(x.f) > 0.7), 'clap'),
      nearTurn: Math.max(...spot.filter((x) => distance(x.f) < 2.5).map((x) => x.turn)),
      farClap: mean(spot.filter((x) => distance(x.f) > 8), 'clap'),
      goalRaised: goal.filter((x) => x.raise > 0.5).length / goal.length, goalStanding: mean(goal, 'stand'),
      styles: new Set(crowd.fans.map((f) => f.style)).size, phones: crowd.phones.visible,
    };
  });
  assert(crowd.parts >= 4 && crowd.fans > 100, `crowd not built: ${JSON.stringify(crowd)}`);
  assert(crowd.attributes <= 16, `crowd shader needs ${crowd.attributes} vertex attributes: WebGL2 guarantees 16`);
  assert(crowd.calmClap < 0.02 && crowd.calmRaise < 0.02, 'a quiet crowd must sit still');
  assert(crowd.nearClap > 0.3 && crowd.nearTurn > 0.2, `neighbours ignore a scene next to them: ${JSON.stringify(crowd)}`);
  assert(crowd.farClap < 0.02, 'fans far from a scene must not react to it');
  assert(crowd.goalRaised > 0.2 && crowd.goalRaised < 0.9 && crowd.goalStanding > 0.9, `goal celebration: ${JSON.stringify(crowd)}`);
  assert(crowd.styles === 4 && crowd.phones, 'cheering styles or sky phones missing');
  await page.close();

  // Nitidezza adattiva, a tempo virtuale: a 30 fotogrammi/s scende un gradino, non migliora, torna su e smette; a 60 non si muove.
  for (const [fps, query, dips] of [[30, '', true], [60, '', false], [30, '&fullres', false]]) {
    const game = await browser.newPage({ viewport: { width: 960, height: 540 } });
    game.on('pageerror', (error) => errors.push(error.message));
    await game.addInitScript(() => {
      localStorage.setItem('frameit.tutorial.v2', 'done');
      let now = 0, queue = [];
      window.__virtual = { step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); } };
      window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
      window.cancelAnimationFrame = () => {};
      performance.now = () => now;
    });
    await game.goto(`${base}?debug&sport=boxe&lang=it&autostart${query}`);
    await game.waitForFunction(() => { window.__virtual.step(1000 / 30); return window.frameit?.match; }, null, { timeout: 60000, polling: 100 });
    const ratios = await game.evaluate((fps) => {
      const { stage } = window.frameit, out = [stage.renderer.getPixelRatio()];
      for (let window_ = 0; window_ < 3; window_++) {
        for (let i = 0; i < fps * 2.2; i++) window.__virtual.step(1000 / fps);
        out.push(stage.renderer.getPixelRatio());
      }
      return out;
    }, fps);
    const lowest = Math.min(...ratios);
    assert(dips ? lowest < ratios[0] - 0.05 : lowest === ratios[0], `${fps} fps${query}: pixel ratios ${ratios}`);
    assert.equal(ratios.at(-1), ratios[0], `${fps} fps${query}: sharpness not restored (${ratios})`);
    await game.close();
  }
  assert.deepEqual(errors, []);
  console.log(`OK: ${crowd.fans} fans, ${crowd.attributes}/16 vertex attributes, neighbours clap ${crowd.nearClap.toFixed(2)} and turn ${crowd.nearTurn.toFixed(2)} rad, ${(crowd.goalRaised * 100).toFixed(0)}% arms up on a goal; adaptive sharpness dips only when slow`);
} finally { await browser.close(); await server.close(); }
