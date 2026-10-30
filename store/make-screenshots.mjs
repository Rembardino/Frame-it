// Screenshot per la scheda Google Play, presi dal gioco vero: node store/make-screenshots.mjs [en,it] [id,...]
// Telefono orizzontale 960×540 a densità 2 = PNG 1920×1080 (16:9, quello che Play chiede per i giochi).
// Un "cameraman robot" segue l'inquadratura ideale della regia (col drone si piazza vicino all'azione)
// e scatta nell'istante decisivo. Escono in store/screenshots/raw/<lingua>/; le versioni con la scritta le fa make-captions.mjs.
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const langs = (process.argv[2] ?? 'en,it').split(',');
const only = process.argv[3]?.split(',');
/** wait: 'decisive' = istante decisivo di un'azione principale (+ offset s; events = solo quelle, per prefisso),
 *  'at' = at secondi dall'inizio dell'azione, 'result' = voto a schermo da 5 stelle.
 *  ff = secondi di corsa da saltare prima, ffTo = salta finché mancano ffTo metri all'arrivo. drone = come si piazza il drone. */
const SHOTS = [
  { id: '1-calcio', sport: 'calcio', wait: 'decisive' },
  // Golf: 1 s dopo l'impatto (swingAt 2,6 + impact 0,85), palla che sale con la scia, visto da dietro al golfista.
  { id: '2-golf', sport: 'golf', wait: 'at', at: 4.45, drone: 'golf', events: ['g-drive', 'g-tee3', 'g-wood', 'g-approach'] },
  { id: '3-ciclismo', sport: 'ciclismo', wait: 'decisive', offset: -3, drone: 'cycling', ffTo: 430, events: ['c-volata'] },
  { id: '4-vela', sport: 'vela', wait: 'decisive', drone: 'sailing', ff: 85 },
  { id: '5-basket', sport: 'basket', wait: 'decisive', offset: -0.25, events: ['b-contropiede', 'b-penetrazione'] },
  { id: '6-boxe', sport: 'boxe', wait: 'decisive' },
  { id: '7-pallavolo', sport: 'pallavolo', wait: 'decisive', events: ['v-spike', 'v-quick', 'v-block'] },
  // Il voto a schermo (senza replay, che coprirebbe la scena).
  { id: '8-tennis-voto', sport: 'tennis', wait: 'result' },
].filter((s) => !only || only.includes(s.id));

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: edge }) });

for (const lang of langs) {
  const out = `${root}store/screenshots/raw/${lang}/`;
  mkdirSync(out, { recursive: true });
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Esperto (niente riquadro "ideale"), guida già vista, audio spento.
    await page.addInitScript(() => {
      localStorage.setItem('frameit.mode', 'expert');
      localStorage.setItem('frameit.tutorial.v2', 'done');
      localStorage.setItem('frameit.sound', 'off');
    });
    await page.goto(`${base}?sport=${shot.sport}&debug&lang=${lang}&autostart`);
    await page.waitForFunction(() => window.frameit?.match, null, { timeout: 60000 });
    await page.addStyleTag({ content: '.debug-canvas,.debug-panel,#gyro-controls,#hint,.hint,#fps{display:none!important}' + (shot.wait === 'result' ? '' : '#result{display:none!important}') });
    await page.waitForTimeout(1500);
    if (shot.wait === 'result') await page.evaluate(async () => { (await import('/src/config.ts')).CONFIG.replay.enabled = false; });
    // Salta un pezzo di corsa (solo simulazione, velocissimo).
    await page.evaluate(({ ff, ffTo }) => {
      const m = window.frameit.match, sim = m.sportSimulation;
      for (let i = 0; i < (ff ?? 0) * 60; i++) m.update(1 / 60);
      if (ffTo) for (let i = 0; i < 400 * 60 && sim.toFinish > ffTo; i++) m.update(1 / 60);
    }, shot);
    await page.evaluate((drone) => {
      const { director, cam, stage, match: m } = window.frameit, V = stage.camera.position.constructor, sim = m.sportSimulation;
      const wrap = (a) => ((a % 360) + 540) % 360 - 180;
      const want = new V();
      const step = () => {
        // Dove sta il drone (solo negli sport col drone): un po' indietro e di lato rispetto all'azione.
        let subject = null;
        let follow = 0.08, own = false;
        if (drone === 'golf') {
          // Palla ferma: dietro al golfista sulla linea del colpo. In volo il drone resta lì e guarda la palla salire.
          const b = m.ball.pos, d = new V(sim.pin.x - b.x, 0, sim.pin.z - b.z).normalize();
          if (!sim.shot) want.set(b.x - d.x * 11 + d.z * 3, 3.8, b.z - d.z * 11 - d.x * 3);
          subject = b.clone().addScaledVector(d, 26).setY(5.5); own = true;
        } else if (drone === 'cycling') {
          // Davanti al primo, un po' di lato e basso: il gruppo viene incontro.
          const a = sim.leaders()[0], f = new V(Math.cos(a.heading), 0, Math.sin(a.heading));
          want.set(a.pos.x + f.x * 15 - f.z * 5.5, 3.2, a.pos.z + f.z * 15 + f.x * 5.5); subject = a.pos.clone().addScaledVector(f, -4); follow = 0.5; own = true;
        } else if (drone === 'sailing') {
          // La barca in testa e la più vicina insieme, dal lato dove non c'è l'altra barca.
          const b = sim.lead, o = sim.boats.filter((x) => x !== b).sort((p, q) => p.pos.distanceTo(b.pos) - q.pos.distanceTo(b.pos))[0];
          const f = new V(Math.cos(b.heading), 0, Math.sin(b.heading)), n = new V(-f.z, 0, f.x), mid = b.pos.clone().lerp(o.pos, 0.5);
          const side = Math.sign(n.dot(b.pos.clone().sub(o.pos))) || 1, dist = 55 + Math.min(120, b.pos.distanceTo(o.pos)) * 0.8;
          want.copy(mid).addScaledVector(n, side * dist).addScaledVector(f, 15).setY(26); subject = mid.setY(4); follow = 0.5; own = true;
        }
        if (drone) stage.camera.position.lerp(want, stage.camera.position.distanceTo(want) > 150 ? 1 : follow);
        // Inquadratura: quella ideale della regia (col drone: il soggetto scelto qui, più largo).
        const tr = director.focusTracker(), ideal = own ? { ...cam.anglesTo(subject), fov: drone === 'golf' ? 50 : 34 } : tr?.last?.ideal ?? null;
        const k = 0.12; // morbido: un robot a scatti prenderebbe "movimenti bruschi" nel voto
        if (ideal) cam.setView({ yaw: cam.yaw + wrap(ideal.yaw - cam.yaw) * k, pitch: cam.pitch + (ideal.pitch - cam.pitch) * k, fov: cam.fov * (ideal.fov / cam.fov) ** k });
        requestAnimationFrame(step);
      };
      step();
    }, shot.drone ?? null);
    // Aspetta il momento giusto (al massimo 100 s), poi ferma il gioco e scatta.
    const ok = await page.waitForFunction(({ wait, events, offset, at }) => {
      const { director } = window.frameit;
      if (wait === 'result') {
        const r = document.getElementById('result');
        const lit = (r?.querySelector('.r-stars')?.textContent.match(/★/g)?.length ?? 0) - (r?.querySelector('.r-stars .dim')?.textContent.length ?? 0);
        return r && !r.classList.contains('hidden') && lit >= 5;
      }
      return director.active.some((i) => {
        const t = wait === 'at' ? at : i.def.decisive + (offset ?? 0);
        return i.def.category === 'main' && (!events || events.some((e) => i.def.id.startsWith(e))) && i.et >= t - 0.03 && i.et < t + 0.3;
      });
    }, shot, { timeout: 100000, polling: 'raf' }).then(() => true, () => false);
    await page.evaluate(() => dispatchEvent(new Event('frameit:pause')));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}${shot.id}.png` });
    console.log(lang, shot.id, ok ? 'ok' : 'TIMEOUT (scattato comunque)', errors.length ? errors : '');
    await page.close();
  }
}
await browser.close(); await server.close();
