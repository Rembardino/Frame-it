// Spot pubblicitario (TikTok, Reels, Shorts): registra le scene dal gioco vero. node store/video/record.mjs [scena,...]
// Tempo virtuale: requestAnimationFrame e performance.now sono finti, il gioco avanza di 1/30 s esatti per fotogramma
// (niente scatti anche se il PC è lento). Gioco in 4:5 (1080×1350) con i comandi touch; un "cameraman robot" segue
// l'inquadratura ideale della regia, col drone vola vicino all'azione e muove le leve a schermo come farebbe il pollice.
// Fotogrammi JPEG in artifacts/video-frames/<scena>/; poi store/video/compose.py monta il video verticale con le scritte.
// Spot 2 (50 s): drone, telecamera ed eventi speciali (al massimo due segreti). Solo ciò che è già nella versione pubblicata (1.0.8): niente vela, niente alieni.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const FPS = 30;
/**
 * Quando iniziare a registrare: events = un'azione (anche rara) che parte, at = secondi dal suo inizio;
 * secret = momento segreto forzato, at = secondi dalla sua reazione (o dall'inizio, se non aspetta la camera).
 * params = altro nell'URL (?rare forza l'evento raro). wide = quanto allargare l'inquadratura ideale.
 * clean = nasconde la scheda del voto (parlerebbe di un'altra azione e copre la leva sinistra).
 */
export const SCENES = [
  { id: 'c1-basket-camera', sport: 'basket', mode: 'camera', seconds: 5.5, events: ['b-contropiede'], at: 0.3 },
  { id: 'd1-calcio-drone', sport: 'calcio', mode: 'drone', seconds: 6, events: ['contropiede'], at: 0.8, wide: 1.3, clean: true },
  { id: 'd2-golf-drone', sport: 'golf', mode: 'drone', seconds: 6.5, events: ['g-drive', 'g-wood'], at: 1.9, clean: true },
  { id: 'd3-ciclismo-aquila', sport: 'ciclismo', mode: 'drone', seconds: 7, params: '&rare', events: ['c-aquila'], at: 2, wide: 1.5, clean: true },
  { id: 'x1-proposta', sport: 'calcio', mode: 'drone', seconds: 7.5, secret: 's-proposal', at: 1.4, wide: 1.5, clean: true },
  { id: 'x2-bacio', sport: 'calcio', mode: 'camera', seconds: 4.5, secret: 's-kiss', at: -0.3, wide: 1.1, clean: true },
  { id: 'c2-boxe-camera', sport: 'boxe', mode: 'camera', seconds: 6, events: ['x-knockdown'], at: 0.5 },
  { id: 'x4-stella', sport: 'calcio', mode: 'camera', seconds: 5, params: '&rare', events: ['stella'], at: 0.4, clean: true },
  { id: 'x5-golf-ace', sport: 'golf', mode: 'drone', seconds: 9.8, params: '&rare', events: ['g-ace'], at: 2.9 },
];
const only = process.argv[2]?.split(',');

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: edge }) });

for (const scene of SCENES.filter((s) => !only || only.includes(s.id))) {
  const out = `${root}artifacts/video-frames/${scene.id}/`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('frameit.mode', 'expert');
    localStorage.setItem('frameit.tutorial.v2', 'done');
    localStorage.setItem('frameit.sound', 'off');
    // Orologio finto: il gioco avanza solo quando lo dice lo script.
    let now = 0, queue = [];
    window.__virtual = { step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); } };
    window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
    window.cancelAnimationFrame = () => {};
    performance.now = () => now;
  });
  await page.goto(`${base}?sport=${scene.sport}&debug&lang=en&autostart${scene.params ?? ''}${scene.secret ? `&secret=${scene.secret}` : ''}`);
  await page.waitForFunction(() => { window.__virtual.step(1000 / 30); return window.frameit?.match; }, null, { timeout: 60000, polling: 100 });
  await page.addStyleTag({ content: '.debug-canvas,.debug-panel,#gyro-controls,#hint,.hint,#fps,#rotate{display:none!important}' + (scene.clean ? '#result{display:none!important}' : '') });
  // Niente replay (rubano tempo allo spot); col drone anche nel calcio e nel basket (come dopo averlo comprato in carriera).
  // Il robot vola dove serve (anche davanti alle tribune): limiti del drone allargati.
  await page.evaluate(async (mode) => {
    const { CONFIG } = await import('/src/config.ts');
    CONFIG.replay.enabled = false;
    const { drone } = window.frameit;
    if (mode === 'drone' && !drone.active) { CONFIG.camera.droneBattery = 999; drone.battery = 999; drone.toggle(); }
    drone.box.min.set(-5000, 1, -5000); drone.box.max.set(5000, 3000, 5000);
  }, scene.mode);
  // Il cameraman robot: gira a ogni fotogramma (anche lui sul requestAnimationFrame finto).
  await page.evaluate(({ sport, mode, secret, events, wide = 1 }) => {
    const { director, secrets, cam, stage, match: m } = window.frameit, V = stage.camera.position.constructor, sim = m.sportSimulation;
    const pos = stage.camera.position, want = pos.clone(), last = pos.clone(), wrap = (a) => ((a % 360) + 540) % 360 - 180;
    const pack = m.ball.pos.clone(), heading = new V(1, 0, 0);
    let lastYaw = cam.yaw, t = 0;
    const knobs = [...document.querySelectorAll('.dzone')].map((z) => ({ zone: z, knob: z.querySelector('span'), x: 0, y: 0 }));
    const step = () => {
      t += 1 / 30;
      const b = m.ball.pos, sec = secret && secrets.active.find((s) => s.plan.id === secret);
      const ev = events && director.active.find((i) => events.some((p) => i.def.id.startsWith(p)));
      let subject = b, fov = sport === 'basket' ? 30 : 24, follow = 0.04, ideal = null;
      if (sec) {
        // Momento segreto: il drone scende davanti agli spettatori, dal lato del campo, e scivola piano di lato.
        const c = sec.actors.reduce((s, a) => s.add(a.pos), new V()).multiplyScalar(1 / sec.actors.length);
        want.set(c.x + Math.sin(t * 0.4) * 2.5, c.y + (sport === 'basket' ? 3.6 : 2.6), c.z - Math.sign(c.z) * (sport === 'basket' ? 6 : 8));
        follow = 0.05;
        ideal = sec.tracker.last?.ideal;
      } else if (ev?.def.id === 'stella') {
        // Stella cadente: largo, verso dove passerà, con la tribuna (il pubblico a naso in su) in basso.
        const s = m.sky.star;
        ideal = { yaw: cam.anglesTo(s.from.clone().lerp(s.to, 0.5)).yaw, pitch: 14, fov: 50 };
      } else if (sport === 'ciclismo') {
        // Ciclismo: il "pallone" è il centro del gruppo (sotto terra). Il drone vola di lato, un po' avanti e in alto.
        const p = new V(b.x, 1, b.z), v = p.clone().sub(pack);
        if (v.length() > 0.01 && v.length() < 5) heading.lerp(v.normalize(), 0.05).normalize();
        pack.copy(p);
        // Con l'aquila in volo: il drone la insegue da dietro, un po' più in alto (lei davanti, la campagna sotto).
        const eagle = m.fauna.list.find((a) => a.species === 'eagle'), e = eagle && m.fauna.at(eagle, 0, m.time);
        if (e?.visible) {
          const f = new V(Math.cos(e.heading), 0, Math.sin(e.heading));
          want.copy(e.pos).addScaledVector(f, -7).setY(e.pos.y + 2);
          subject = e.pos.clone().addScaledVector(f, 12).setY(e.pos.y - 4); fov = 45; follow = 0.15;
        } else {
          want.set(p.x + heading.z * 22 + heading.x * 8, 11, p.z - heading.x * 22 + heading.z * 8);
          subject = p.clone().addScaledVector(heading, 4); fov = 34; follow = 0.06;
        }
      } else if (sport === 'golf') {
        // Palla ferma: dietro al golfista sulla linea del colpo. In volo: la insegue da dietro e un po' più in alto.
        const d = new V(sim.pin.x - b.x, 0, sim.pin.z - b.z).normalize();
        // Atterrata vicino alla bandiera: giù, raso al green, dietro la palla che rotola verso la buca.
        const pin = new V(sim.pin.x, 0, sim.pin.z), close = b.y < 0.4 && pin.distanceTo(new V(b.x, 0, b.z)) < 45;
        if (sim.shot && close) { want.set(b.x - d.x * 6, 1.6, b.z - d.z * 6); follow = 0.08; subject = b.clone().lerp(pin, 0.5).setY(0.3); fov = 30; }
        else if (sim.shot) { want.set(b.x - d.x * 18, Math.max(5, b.y + 4), b.z - d.z * 18); follow = 0.12; }
        else { want.set(b.x - d.x * 10 + d.z * 3, 4, b.z - d.z * 10 - d.x * 3); follow = 0.03; subject = b.clone().addScaledVector(d, 20).setY(3); }
        if (!(sim.shot && close)) fov = 40;
      } else if (mode === 'drone') {
        // Sopra l'azione, dal lato della camera, con un lento giro attorno.
        const r = sport === 'basket' ? 9 : 16, h = sport === 'basket' ? 6 : 11, a = Math.sin(t * 0.35) * 0.6;
        want.set(b.x + Math.sin(a) * r, h, b.z + Math.cos(a) * r);
      }
      if (mode === 'drone') pos.lerp(want, follow);
      // Inquadratura: quella ideale (del segreto, dell'evento cercato o dell'azione della regia), un po' più larga se serve.
      // Nel golf e nel ciclismo il robot inquadra da sé (palla, aquila); senza un'inquadratura ideale, il soggetto.
      if (sport !== 'golf' && sport !== 'ciclismo') ideal ??= ev?.tracker.last?.ideal ?? director.focusTracker()?.last?.ideal;
      ideal = ideal ? { ...ideal, fov: ideal.fov * wide } : { ...cam.anglesTo(subject), fov };
      const k = 0.12;
      cam.setView({ yaw: cam.yaw + wrap(ideal.yaw - cam.yaw) * k, pitch: cam.pitch + (ideal.pitch - cam.pitch) * k, fov: cam.fov * (ideal.fov / cam.fov) ** k });
      if (mode === 'drone') {
        // Le leve a schermo seguono il movimento del drone (sinistra: rotazione e quota; destra: avanti e di lato).
        const y = cam.yaw * Math.PI / 180, dx = pos.x - last.x, dz = pos.z - last.z;
        const fwd = (dx * Math.sin(y) - dz * Math.cos(y)) * 30 / 8, side = (dx * Math.cos(y) + dz * Math.sin(y)) * 30 / 8;
        const values = [[wrap(cam.yaw - lastYaw) * 30 / 40, (pos.y - last.y) * 30 / 3], [side, fwd]];
        knobs.forEach((kn, i) => {
          kn.x += (Math.max(-1, Math.min(1, values[i][0])) - kn.x) * 0.25; kn.y += (Math.max(-1, Math.min(1, values[i][1])) - kn.y) * 0.25;
          kn.knob.style.transform = `translate(${kn.x * 40}px, ${-kn.y * 40}px)`;
          kn.zone.classList.toggle('on', Math.hypot(kn.x, kn.y) > 0.08);
        });
      }
      last.copy(pos); lastYaw = cam.yaw;
      requestAnimationFrame(step);
    };
    step();
  }, scene);
  // Avanti veloce (senza salvare) fino al momento giusto: un'azione principale (o quella cercata), oppure il segreto.
  const started = await page.evaluate(({ events, secret, at }) => {
    const { director, secrets, match: m } = window.frameit;
    for (let i = 0; i < 300 * 30; i++) {
      window.__virtual.step(1000 / 30);
      if (secret) {
        const s = secrets.active.find((x) => x.plan.id === secret);
        if (s?.triggerAt != null && m.time - s.triggerAt >= at - 0.02) return true;
      } else if (i > 30 && director.active.some((e) => (events ? events.some((p) => e.def.id.startsWith(p)) : e.def.category === 'main') && e.et >= (at ?? 0) - 0.02)) return true;
    }
    return false;
  }, scene);
  for (let f = 0; f < scene.seconds * FPS; f++) {
    await page.evaluate(() => window.__virtual.step(1000 / 30));
    await page.screenshot({ path: `${out}${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  console.log(scene.id, started ? 'ok' : 'nessuna azione trovata (registrato comunque)', errors.length ? errors : '');
  await page.close();
}
await browser.close(); await server.close();
