// Spot pubblicitario (TikTok, Reels, Shorts): registra le scene dal gioco vero. node store/video/record.mjs [scena,...]
// Tempo virtuale: requestAnimationFrame e performance.now sono finti, il gioco avanza di 1/30 s esatti per fotogramma
// (niente scatti anche se il PC è lento). Gioco in 4:5 (1080×1350) con i comandi touch; un "cameraman robot" segue
// l'inquadratura ideale della regia, col drone vola vicino all'azione e muove le leve a schermo come farebbe il pollice.
// Fotogrammi JPEG in artifacts/video-frames/<scena>/; poi store/video/compose.py monta il video verticale con le scritte.
// Spot 4 (50 s): calcio, boxe e golf con telecamera, drone ed eventi speciali; qualche secondo degli altri sport. Niente vela.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
 * force = calcio piazzato messo in scena dalla partita (penalty, freeKick, corner). switchAt = secondi di registrazione
 * dopo cui si passa al drone nella stessa azione ('kick' = appena il pallone parte); il fotogramma finisce in switch.txt.
 * goal = rifà la ripresa finché qualcuno segna. look = il drone vola verso il soggetto dell'evento (animali) e lo inquadra.
 * front = il drone vola davanti all'azione e guarda indietro verso chi attacca (si vede il giocatore che arriva).
 */
export const SCENES = [
  { id: 'h1-rigore', sport: 'calcio', mode: 'camera', seconds: 4.5, force: 'penalty', events: ['rigore'], at: 3.0, wide: 0.8, goal: true, clean: true },
  { id: 'd0-calcio-drone', sport: 'calcio', mode: 'drone', seconds: 7.5, events: ['contropiede'], at: 0.5, wide: 1.3, front: true, clean: true },
  { id: 'c2-boxe', sport: 'boxe', mode: 'camera', seconds: 5.5, events: ['x-knockdown'], at: 0.3 },
  { id: 'b2-boxe-drone', sport: 'boxe', mode: 'drone', seconds: 5, events: ['x-uppercut', 'x-hook', 'x-counter'], at: 0.3, wide: 1.2, clean: true },
  { id: 'd1-golf', sport: 'golf', mode: 'drone', seconds: 6.5, events: ['g-drive', 'g-wood'], at: 1.9, clean: true },
  { id: 'g3-golf-cervi', sport: 'golf', mode: 'drone', seconds: 4, events: ['g-cervi'], at: 3, look: true, clean: true },
  { id: 'c1-ciclismo', sport: 'ciclismo', mode: 'drone', seconds: 6.5, events: ['c-scatto', 'c-volata', 'c-caduta'], at: 0.5, clean: true },
  { id: 'm1-basket', sport: 'basket', mode: 'camera', seconds: 2.5, events: ['b-contropiede', 'b-tripla', 'b-penetrazione'], at: 0.5 },
  { id: 'm2-tennis', sport: 'tennis', mode: 'drone', seconds: 2.5, events: ['t-'], at: 0.3, clean: true },
  { id: 'm4-pallavolo', sport: 'pallavolo', mode: 'camera', seconds: 2.5, events: ['v-spike'], at: 1 },
  { id: 'm3-ciclismo', sport: 'ciclismo', mode: 'drone', seconds: 3, params: '&rare', events: ['c-aquila'], at: 2, wide: 1.5, clean: true },
  { id: 'e1-golf-ace', sport: 'golf', mode: 'drone', seconds: 9.8, params: '&rare', events: ['g-ace'], at: 2.9 },
];
const only = process.argv[2]?.split(',');

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: edge }) });

for (const scene of SCENES.filter((s) => !only || only.includes(s.id))) for (let take = 1; take <= 8; take++) {
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
    CONFIG.camera.droneBattery = 999; drone.battery = 999;
    if (mode === 'drone' && !drone.active) drone.toggle();
    drone.box.min.set(-5000, 1, -5000); drone.box.max.set(5000, 3000, 5000);
  }, scene.mode);
  await page.evaluate(async () => { window.__terrain = (await import('/src/sim/sports/cyclingRoute.ts')).terrainHeight; });
  // Il cameraman robot: gira a ogni fotogramma (anche lui sul requestAnimationFrame finto).
  await page.evaluate(({ sport, secret, events, look, front, wide = 1 }) => {
    const { director, secrets, cam, stage, drone, match: m } = window.frameit, V = stage.camera.position.constructor, sim = m.sportSimulation;
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
      } else if (look && ev?.focus) {
        // Evento speciale: il drone si avvicina al soggetto restando dal suo lato, un po' in alto, e usa l'inquadratura della regia.
        const f = ev.focus, d = new V(pos.x - f.x, 0, pos.z - f.z).normalize();
        want.set(f.x + d.x * 16, f.y + 6, f.z + d.z * 16); follow = 0.05;
        ideal = ev.tracker.last?.ideal;
      } else if (sport === 'ciclismo') {
        // Ciclismo: il "pallone" è il centro del gruppo (sotto terra). Il drone vola di lato, un po' avanti e in alto.
        // Il percorso sale e scende: quota del drone e del gruppo misurate sul terreno, se no il drone finisce dentro la collina.
        const ground = window.__terrain(b.x, b.z), p = new V(b.x, ground + 1, b.z), v = p.clone().sub(pack).setY(0);
        if (v.length() > 0.01 && v.length() < 5) heading.lerp(v.normalize(), 0.05).normalize();
        pack.copy(p);
        // Con l'aquila in volo: il drone la insegue da dietro, un po' più in alto (lei davanti, la campagna sotto).
        const eagle = m.fauna.list.find((a) => a.species === 'eagle'), e = eagle && m.fauna.at(eagle, 0, m.time);
        if (e?.visible) {
          const f = new V(Math.cos(e.heading), 0, Math.sin(e.heading));
          want.copy(e.pos).addScaledVector(f, -7).setY(e.pos.y + 2);
          subject = e.pos.clone().addScaledVector(f, 12).setY(e.pos.y - 4); fov = 45; follow = 0.15;
        } else {
          const wx = p.x + heading.z * 22 + heading.x * 8, wz = p.z - heading.x * 22 + heading.z * 8;
          want.set(wx, Math.max(ground + 11, window.__terrain(wx, wz) + 5), wz);
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
      } else if (drone.active && front) {
        // Davanti all'azione: direzione del pallone (smorzata), drone 13 m avanti e 6 m su, guarda indietro verso chi attacca.
        const v = new V(b.x - pack.x, 0, b.z - pack.z);
        pack.copy(b);
        if (v.length() > 0.02 && v.length() < 3) { heading.lerp(v.normalize(), 0.04); if (heading.length() < 0.2) heading.copy(v); heading.normalize(); }
        want.set(b.x + heading.x * 13, 6, b.z + heading.z * 13); follow = 0.05;
        // Inquadra sempre il pallone (e chi lo porta), non l'inquadratura della regia: dal davanti tagliava il giocatore.
        ideal = { ...cam.anglesTo(b.clone().setY(1)), fov: 34 };
      } else if (drone.active) {
        // Sopra l'azione, dal lato della camera, con un lento giro attorno.
        const r = sport === 'boxe' ? 6.5 : sport === 'basket' ? 9 : 16, h = sport === 'boxe' ? 4.2 : sport === 'basket' ? 6 : 11, a = Math.sin(t * 0.35) * 0.6;
        want.set(b.x + Math.sin(a) * r, h, b.z + Math.cos(a) * r);
      }
      if (drone.active) pos.lerp(want, follow);
      // Inquadratura: quella ideale (del segreto, dell'evento cercato o dell'azione della regia), un po' più larga se serve.
      // Nel golf e nel ciclismo il robot inquadra da sé (palla, aquila); senza un'inquadratura ideale, il soggetto.
      if (look || (sport !== 'golf' && sport !== 'ciclismo')) ideal ??= ev?.tracker.last?.ideal ?? director.focusTracker()?.last?.ideal;
      ideal = ideal ? { ...ideal, fov: ideal.fov * wide } : { ...cam.anglesTo(subject), fov };
      const k = 0.12;
      cam.setView({ yaw: cam.yaw + wrap(ideal.yaw - cam.yaw) * k, pitch: cam.pitch + (ideal.pitch - cam.pitch) * k, fov: cam.fov * (ideal.fov / cam.fov) ** k });
      if (drone.active) {
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
  const started = await page.evaluate(({ events, secret, at, force }) => {
    const { director, secrets, match: m } = window.frameit;
    for (let i = 0; i < 300 * 30; i++) {
      window.__virtual.step(1000 / 30);
      if (force && i > 60 && m.phase === 'play') { m.startSetPiece(force, 0); force = null; }
      if (secret) {
        const s = secrets.active.find((x) => x.plan.id === secret);
        if (s?.triggerAt != null && m.time - s.triggerAt >= at - 0.02) return true;
      } else if (i > 30 && director.active.some((e) => (events ? events.some((p) => e.def.id.startsWith(p)) : e.def.category === 'main') && e.et >= (at ?? 0) - 0.02)) return true;
    }
    return false;
  }, scene);
  const goals = () => page.evaluate(() => window.frameit.match.score[0] + window.frameit.match.score[1]);
  const before = await goals();
  let kick = scene.switchAt === 'kick' ? null : scene.switchAt * 30;
  for (let f = 0; f < scene.seconds * FPS; f++) {
    // 'kick': il drone parte 0,4 s dopo la battuta (il cross si vede partire dalla telecamera).
    const flying = await page.evaluate((now) => {
      window.__virtual.step(1000 / 30);
      const { drone, match: m } = window.frameit;
      if (now) drone.toggle();
      return !!m.ball.flight && m.phase === 'play';
    }, f === kick);
    if (f === kick) writeFileSync(`${out}switch.txt`, String(f));
    if (kick === null && flying) kick = f + 12;
    await page.screenshot({ path: `${out}${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  // goal = rifà la ripresa (fino a 8 volte) se nessuno segna.
  const scored = (await goals()) > before;
  console.log(scene.id, `take ${take}`, started ? 'ok' : 'nessuna azione trovata (registrato comunque)', scene.goal ? (scored ? 'gol' : 'niente gol') : '', errors.length ? errors : '');
  await page.close();
  if (!scene.goal || scored) break;
}
await browser.close(); await server.close();
