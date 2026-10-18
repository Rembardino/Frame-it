import assert from 'node:assert/strict';
import { createServer } from 'vite';

const handlers = new Map();
globalThis.addEventListener = (name, fn) => handlers.set(name, fn);
const elements = new Map();
globalThis.document = {
  addEventListener() {},
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', addEventListener() {}, setAttribute() {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    });
    return elements.get(id);
  },
};
globalThis.window = {};
const emit = (name, detail) => handlers.get(name)?.({ detail });
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { GyroscopeController } = await server.ssrLoadModule('/src/camera/gyroscope.ts');
  const { CameraController } = await server.ssrLoadModule('/src/camera/cameraController.ts');
  const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
  const { PerspectiveCamera } = await import('three');
  const sample = (alpha, screen = 90, gamma = -90) => emit('frameit:orientation', { alpha, beta: 0, gamma, screen });
  function setup(fov = CONFIG.camera.startFov) {
    handlers.clear();
    const camera = { fov, inputsEnabled: true, sensorControlled: false, yaw: 0, pitch: 0,
      moveBy(yaw, pitch) { this.yaw += yaw; this.pitch += pitch; } };
    const gyro = new GyroscopeController(camera);
    gyro.setActive(true);
    emit('frameit:gyro-state', { enabled: true });
    sample(0);
    return { camera, gyro };
  }
  const distance = c => Math.hypot(c.yaw, c.pitch);
  const tick = (gyro, seconds = 1, hz = 60) => { for (let i = 0; i < seconds * hz; i++) gyro.update(1 / hz); };

  let { camera, gyro } = setup();
  for (let i = 0; i < 600; i++) {
    sample(Math.sin(i * 1.7) * 0.2, 90, -90 + Math.cos(i * 2.3) * 0.2);
    gyro.update(1 / 60);
  }
  assert(distance(camera) < 1e-8, 'Small hand tremors must not move the camera or accumulate drift');
  assert.equal(camera.sensorControlled, true);

  ({ camera, gyro } = setup());
  sample(12);
  assert.equal(distance(camera), 0, 'Sensor events must not jump the camera immediately');
  gyro.update(1 / 60);
  assert(distance(camera) > 0 && distance(camera) < 0.7, 'A deliberate turn must begin gradually');
  tick(gyro, 2);
  const normal = distance(camera);
  assert(normal > 4 && normal < 5.5, 'A 12 degree turn should move about 5 degrees at normal zoom');
  const settled = distance(camera);
  tick(gyro, 3);
  assert(Math.abs(distance(camera) - settled) < 0.00001, 'Holding the phone still must stop camera movement');

  ({ camera, gyro } = setup(CONFIG.camera.startFov / 4));
  sample(12); tick(gyro, 3);
  assert(Math.abs(distance(camera) / normal - 0.25) < 0.001, 'Zoomed aiming must be proportionally finer');

  ({ camera, gyro } = setup());
  for (let i = 1; i <= 600; i++) { sample(i * 0.01); gyro.update(1 / 60); }
  assert(distance(camera) > 2 && distance(camera) < 2.7, 'Slow deliberate motion must survive the dead zone');

  const results = [];
  for (const hz of [30, 60, 120]) {
    ({ camera, gyro } = setup()); sample(12); tick(gyro, 1, hz); results.push(distance(camera));
  }
  assert(Math.max(...results) - Math.min(...results) < 1e-8, 'Smoothing must be independent of render rate');

  ({ camera, gyro } = setup());
  sample(12); gyro.update(1 / 60); gyro.center();
  const centered = distance(camera);
  sample(90); tick(gyro);
  assert.equal(distance(camera), centered, 'Recenter must discard pending movement');
  gyro.setActive(false); sample(110); tick(gyro);
  assert.equal(distance(camera), centered, 'Paused camera must ignore samples');
  assert.equal(camera.sensorControlled, false);
  gyro.setActive(true); sample(130); tick(gyro);
  assert.equal(distance(camera), centered, 'Resume must calibrate without applying the background turn');
  sample(130, -90); tick(gyro);
  assert.equal(distance(camera), centered, 'Screen rotation must calibrate without a jump');
  emit('frameit:gyro-state', { enabled: false });
  assert.equal(camera.sensorControlled, false);

  ({ camera, gyro } = setup());
  sample(90); tick(gyro);
  assert.equal(distance(camera), 0, 'Sensor discontinuities must be rejected');
  sample(91); tick(gyro);
  assert(distance(camera) > 0 && distance(camera) < 0.5, 'A sensor discontinuity must not block subsequent small turns');

  // Verify the actual renderer camera remains fixed with the motorized head upgrade.
  const perspective = new PerspectiveCamera();
  const controller = new CameraController(perspective, elements.get('gyro-menu'));
  controller.sensorControlled = true;
  const autoTrack = CONFIG.camera.autoTrack;
  CONFIG.camera.autoTrack = 2;
  controller.autoTarget = () => perspective.position.clone().set(20, 2, 0);
  controller.setView({ yaw: 0, pitch: -10, fov: 20 });
  for (let i = 0; i < 120; i++) {
    controller.update(1 / 60);
    assert(Math.abs(perspective.rotation.x + 10 * Math.PI / 180) < 1e-12);
    assert(Math.abs(perspective.rotation.y) < 1e-12, 'Automatic tracking and simulated shake must not fight sensor aiming');
  }
  controller.sensorControlled = false;
  controller.update(1 / 60);
  assert.notEqual(perspective.rotation.y, 0, 'Normal camera behavior must return when the gyro is off');
  CONFIG.camera.autoTrack = autoTrack;
  console.log('OK: gyro tremor rejection, reduced sensitivity, smooth response, zoom, slow turns, frame rates, calibration, pause, screen rotation and camera stability');
} finally { await server.close(); }
