import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = 'artifacts/race-and-rules'; await mkdir(out, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' }); await server.listen();
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }) });
try {
  for (const route of ['collinare', 'montagna', 'tecnico']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&lang=it&sport=ciclismo&route=${route}`);
    await page.waitForFunction(() => window.frameit?.views, null, { timeout: 60000 });
    if (route === 'collinare') await page.screenshot({ path: `${out}/individual-race-menu.png` });
    const result = await page.evaluate(async () => {
      window.dispatchEvent(new Event('frameit:pause'));
      const { match, views, stage, hud, cam, voice, recorder } = window.frameit;
      const { CYCLING_ROUTE, VILLAGE, roadAt, terrainHeight } = await import('/src/sim/sports/cyclingRoute.ts');
      const colors = views.views.filter(v => match.actors.includes(v.actor)).map(v => {
        let color; v.character.model.traverse(o => { if (o.isMesh && /Shirt/.test(o.name)) color = o.material.color.getHex(); }); return color;
      });
      const teams = [...document.querySelectorAll('.bug .team')].filter(e => getComputedStyle(e).display !== 'none').length;
      const select = document.querySelector('.race-route select');
      const options = [...select.options].map(option => option.value);
      document.querySelectorAll('.overlay,.debug-panel,.debug-canvas').forEach(e => e.style.display = 'none');
      for (let i = 0; i < 60 * 130 && match.sportSimulation.packS < (VILLAGE[0] + VILLAGE[1]) / 2; i++) match.update(1 / 60);
      views.update(0); hud.update(0, cam, match, voice, false);
      const center = roadAt(match.sportSimulation.packS);
      stage.camera.position.copy(center).add({ x: -65, y: 55, z: 90 }); stage.camera.lookAt(center);
      stage.camera.fov = 60; stage.camera.updateProjectionMatrix();
      stage.renderer.setAnimationLoop(() => stage.renderer.render(stage.scene, stage.camera));
      const triangles = mesh => (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      const river = stage.scene.getObjectByName('cycling-river'), bank = stage.scene.getObjectByName('cycling-riverbank');
      const { Raycaster, Vector3 } = await import('/node_modules/three/build/three.module.js');
      const asphalt = stage.scene.children.find(mesh => mesh.isMesh && mesh.renderOrder === -94);
      const earlier = stage.scene.children.filter(mesh => mesh.isMesh && mesh.renderOrder < -94 && mesh.material.depthWrite);
      stage.scene.updateMatrixWorld(true);
      const ray = new Raycaster(), down = new Vector3(0, -1, 0); let roadOcclusions = 0;
      for (let i = 0; i < 25; i++) {
        const at = roadAt(VILLAGE[0] + (VILLAGE[1] - VILLAGE[0]) * i / 25);
        ray.set(at.clone().add(new Vector3(0, 5, 0)), down);
        const surface = ray.intersectObject(asphalt)[0], occluder = ray.intersectObjects(earlier, false)[0];
        if (surface && occluder && occluder.point.y > surface.point.y + 0.01) roadOcclusions++;
      }
      return { route: CYCLING_ROUTE.id, town: stage.scene.getObjectByName(`cycling-town-${CYCLING_ROUTE.style}`)?.userData.town,
        roadOcclusions, riverTriangles: triangles(river) + triangles(bank), riverReflection: !!river.material.envMap, options, teams, riders: match.actors.length, colors: new Set(colors).size,
        savedTeams: recorder.clip('race', 0, 0, 1).teams, maxGroundError: Math.max(...match.actors.map(a => Math.abs(a.pos.y - terrainHeight(a.pos.x, a.pos.z) - 0.2))) };
    });
    assert.equal(result.route, route); assert.equal(result.teams, 0); assert.equal(result.riders, 14);
    assert.equal(result.savedTeams, undefined); assert.equal(result.options.length, 3); assert(result.colors >= 10);
    assert(result.maxGroundError < 1e-6); assert.deepEqual(errors, []);
    assert(result.town && result.riverTriangles < 2000 && !result.riverReflection, 'Missing stage town or expensive river rendering');
    assert.equal(result.roadOcclusions, 0, 'Terrain surfaces occlude the road on a slope');
    await page.screenshot({ path: `${out}/${route}.png` });
    console.log(`${route}/${result.town}: ${result.colors} jerseys, terrain contact, ${result.riverTriangles} river/bank triangles and WebGL OK`);
    if (route === 'collinare') {
      await page.locator('.race-route select').selectOption('montagna', { force: true });
      await page.waitForURL('**route=montagna');
      await page.waitForFunction(() => window.frameit?.views, null, { timeout: 60000 });
      assert.equal(await page.locator('.race-route select').inputValue(), 'montagna');
    }
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?debug&lang=it&sport=basket`);
  await page.waitForFunction(() => window.frameit?.views, null, { timeout: 60000 });
  for (const situation of ['dunk', 'freeThrow', 'inbound']) {
    const result = await page.evaluate(async situation => {
      window.dispatchEvent(new Event('frameit:pause'));
      document.querySelectorAll('.overlay,.debug-panel,.debug-canvas').forEach(e => e.style.display = 'none');
      const { match, views, stage, hud, cam, voice } = window.frameit;
      const { CONFIG } = await import('/src/config.ts');
      const shooter = match.actors.find(a => a.team === 0 && a.role === 'mid');
      Math.random = () => 0.1;
      if (situation === 'dunk') {
        shooter.pos.set(CONFIG.pitch.length / 2 - CONFIG.pitch.hoopFromBaseline - 0.7, 0, 0.1);
        shooter.target.copy(shooter.pos); shooter.vel.set(0, 0, 0); shooter.heading = 0;
        match.ball.holder = shooter; match.ball.state = 'held'; match.ball.pos.copy(shooter.pos).setY(0.8);
        match.shoot(shooter, 'goal');
        for (let i = 0; i < 120 && match.ball.flight?.release; i++) match.update(1 / 60);
      } else if (situation === 'freeThrow') {
        match.phase = 'play';
        match.basketball.foul(match.actors.find(a => a.team === 1), shooter, 2);
        for (let i = 0; i < 1800; i++) {
          match.update(1 / 60);
          if (match.basketball.freeThrows?.stage === 'shot' && shooter.poseTime > 0.19) break;
        }
      } else {
        for (let i = 0; i < 1800; i++) {
          match.update(1 / 60);
          if (match.basketball.inbound?.stage === 'pass') break;
        }
      }
      views.update(0); hud.update(0, cam, match, voice, false);
      const hoop = CONFIG.pitch.length / 2 - CONFIG.pitch.hoopFromBaseline;
      stage.camera.position.set(hoop - (situation === 'dunk' ? 6 : 7), situation === 'dunk' ? 4.3 : 6, 10);
      stage.camera.lookAt(hoop - 2, 1.7, 0); stage.camera.fov = 55; stage.camera.updateProjectionMatrix();
      stage.renderer.setAnimationLoop(() => stage.renderer.render(stage.scene, stage.camera));
      return { pose: shooter.pose, phase: match.phase, label: document.getElementById('clock').textContent,
        inbound: match.basketball.inbound?.stage, outside: match.basketball.inbound ? Math.abs(match.basketball.inbound.taker.pos.x) > CONFIG.pitch.length / 2 : false };
    }, situation);
    if (situation === 'dunk') assert.equal(result.pose, 'dunk');
    if (situation === 'freeThrow') assert(result.label.startsWith('LIBERO'));
    if (situation === 'inbound') assert(result.inbound === 'pass' && result.outside && result.label === 'RIMESSA');
    await page.screenshot({ path: `${out}/basket-${situation}.png` });
    console.log(`basket ${situation}: sporting action, correct HUD and WebGL OK`);
  }
  assert.deepEqual(errors, []); await page.close();
} finally { await browser.close(); await server.close(); }
