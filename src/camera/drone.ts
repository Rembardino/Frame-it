/**
 * Drone (modalità Carriera): volo libero sopra e intorno al campo.
 * Guardi come sempre (trascina / frecce, a 360°) e zoomi come sempre; in più muovi il drone:
 *  - tastiera: W/S avanti/indietro, A/D di lato, Spazio sale, Shift (o C) scende;
 *  - touch: telecomando a due leve (Mode 2, come i radiocomandi veri): sinistra su/giù = quota, sinistra/destra = rotazione;
 *    destra = avanti/indietro e di lato. Curva "expo": vicino al centro le leve sono più fini. Zoomato, la rotazione rallenta.
 *    Mode 1 (nel menu di pausa) scambia avanti/indietro e quota tra le due leve. Velocità CINE / NORMALE / SPORT col pulsante sopra la leva sinistra.
 * Limiti: dal terreno a MAX_HEIGHT, e il campo più un margine su ogni lato (si può volare sopra la gente).
 * Alla postazione resta il pilota (tu), con le cuffie, che guida guardando il tablet.
 * La batteria (CONFIG.camera.droneBattery secondi) si consuma in volo; a batteria scarica torna da solo alla postazione.
 * Golf, ciclismo, vela: il drone è l'unica camera. Vola sempre, niente batteria né pilota, ed è più veloce e più alto.
 */
import * as THREE from 'three';
import { CONFIG, DRONE_ONLY } from '../config';
import { createAthlete } from '../render/athlete';
import type { Actor } from '../sim/match';
import type { CameraController } from './cameraController';
import { t } from '../i18n';

const C = CONFIG.camera;
const L = CONFIG.pitch.length, W = CONFIG.pitch.width;
const DEG = Math.PI / 180;
/** Golf, ciclismo e vela: il drone è l'unica camera. */
const GOLF = DRONE_ONLY;
/** Quota massima e margine oltre le linee, proporzionati al campo (calcio: 30 m e 12 m; boxe: 8 m e 3 m; sport col drone: 70 m e 30 m). */
const MAX_HEIGHT = GOLF ? 70 : THREE.MathUtils.clamp(W * 0.8, 8, 30);
const MARGIN = GOLF ? 30 : THREE.MathUtils.clamp(W * 0.3, 3, 12);
const MIN_HEIGHT = 0.3;
/** Sui campi piccoli il drone va più piano. Negli sport col drone droneSpeed è già in m/s. */
const SPEED = GOLF ? C.droneSpeed : C.droneSpeed * Math.max(0.35, L / 60);
/** Velocità in salita/discesa rispetto a quella orizzontale. */
const CLIMB = GOLF ? 0.35 : 0.7;
type SpeedMode = keyof typeof C.droneModes;
const SPEEDS = Object.keys(C.droneModes) as SpeedMode[];
const LABEL: Record<SpeedMode, string> = { cine: 'CINE', normal: 'NORMALE', sport: 'SPORT' };
const load = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* niente salvataggi */ } };

export class Drone {
  battery = C.droneBattery;
  active = false;
  private home: THREE.Vector3;
  private vel = new THREE.Vector3();
  private time = 0;
  private box: THREE.Box3;
  private pilot = new THREE.Group();
  private keys = new Set<string>();
  /** Leve touch (-1..1). Sinistra: x = rotazione, y = quota. Destra: x = di lato, y = avanti. */
  private left = { x: 0, y: 0 };
  private right = { x: 0, y: 0 };
  /** Velocità (come l'interruttore C/N/S dei radiocomandi) e disposizione delle leve, salvate tra una partita e l'altra. */
  speedMode: SpeedMode = SPEEDS.includes(load('frameit.droneSpeed') as SpeedMode) ? load('frameit.droneSpeed') as SpeedMode : 'normal';
  stickMode: 1 | 2 = load('frameit.droneSticks') === '1' ? 1 : 2;

  constructor(private cam: CameraController, private camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.home = camera.position.clone();
    this.box = new THREE.Box3(new THREE.Vector3(-L / 2 - MARGIN, MIN_HEIGHT, -W / 2 - MARGIN), new THREE.Vector3(L / 2 + MARGIN, MAX_HEIGHT, W / 2 + MARGIN))
      .expandByPoint(this.home);
    if (!GOLF) this.buildPilot(scene);
    const fly = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC'];
    addEventListener('keydown', (e) => {
      if (!this.active || !cam.inputsEnabled || !fly.includes(e.code)) return;
      this.keys.add(e.code);
      e.preventDefault(); // lo Spazio non deve "cliccare" il pulsante col focus
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.bindPad();
    document.getElementById('drone-speed')?.addEventListener('click', () => this.cycleSpeed());
    const modeBtn = document.getElementById('drone-mode-btn');
    modeBtn?.classList.toggle('hidden', !this.owned);
    modeBtn?.addEventListener('click', () => this.toggleSticks());
    this.paint();
  }

  get owned() { return GOLF || C.droneBattery > 0; }
  /** Lontano dalla postazione (in volo o di ritorno). */
  get airborne() { return GOLF || this.camera.position.distanceTo(this.home) > 0.05; }

  cycleSpeed() {
    this.speedMode = SPEEDS[(SPEEDS.indexOf(this.speedMode) + 1) % SPEEDS.length];
    save('frameit.droneSpeed', this.speedMode);
    this.paint();
  }

  toggleSticks() {
    this.stickMode = this.stickMode === 1 ? 2 : 1;
    save('frameit.droneSticks', String(this.stickMode));
    this.paint();
  }

  /** Scritte di pulsanti e leve (in Mode 1 le frecce di quota e avanti/indietro cambiano leva). */
  private paint() {
    const set = (sel: string, text: string) => { const el = document.querySelector(sel); if (el) el.textContent = text; };
    set('#drone-speed', t(LABEL[this.speedMode]));
    document.getElementById('drone-speed')?.setAttribute('data-mode', this.speedMode);
    set('#drone-mode-btn', t(this.stickMode === 1 ? 'Leve: Mode 1 (quota a destra)' : 'Leve: Mode 2 (quota a sinistra)'));
    const [lift, fwd] = this.stickMode === 1 ? ['#drone-right', '#drone-left'] : ['#drone-left', '#drone-right'];
    set(`${lift} .up`, '▲'); set(`${lift} .dn`, '▼'); set(`${fwd} .up`, '↑'); set(`${fwd} .dn`, '↓');
  }

  /** Suggerimento touch per la disposizione delle leve scelta. */
  get touchHint() {
    return t(this.stickMode === 1 ? 'Sinistra: avanti e rotazione · Destra: quota e lato · Trascina: guarda' : 'Sinistra: quota e rotazione · Destra: vola · Trascina: guarda');
  }

  toggle() {
    if (GOLF) this.active = true; // negli sport col drone non si atterra
    else if (this.active) this.active = false;
    else if (this.owned && this.battery > 0) this.active = true;
    document.getElementById('dronepad')?.classList.toggle('hidden', !this.active);
    document.body.classList.toggle('droning', this.active);
    if (!this.active) { this.keys.clear(); this.left.x = this.left.y = this.right.x = this.right.y = 0; }
  }

  update(dt: number) {
    this.syncPilot();
    if (!this.active && !this.airborne) { this.cam.free = false; return; }
    this.time += dt;
    if (this.active && !GOLF && (this.battery = Math.max(0, this.battery - dt)) === 0) this.toggle();
    const pos = this.camera.position;
    const want = new THREE.Vector3();
    if (this.active) {
      const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
      const mode = C.droneModes[this.speedMode], [liftAxis, fwdAxis] = this.stickMode === 1 ? [this.right.y, this.left.y] : [this.left.y, this.right.y];
      const fwd = THREE.MathUtils.clamp(k('KeyW') - k('KeyS') + expo(fwdAxis), -1, 1);
      const side = THREE.MathUtils.clamp(k('KeyD') - k('KeyA') + expo(this.right.x), -1, 1);
      const up = THREE.MathUtils.clamp(k('Space') - k('ShiftLeft', 'ShiftRight', 'KeyC') + expo(liftAxis), -1, 1);
      // Rotazione (gradi al secondo proporzionali al campo inquadrato: zoomato si gira piano e preciso).
      const turn = expo(this.left.x);
      if (turn) this.cam.moveBy(turn * C.droneYawSpeed * mode.turn * this.cam.fov * dt, 0);
      const y = this.cam.yaw * DEG;
      want.set(Math.sin(y) * fwd + Math.cos(y) * side, up * CLIMB, -Math.cos(y) * fwd + Math.sin(y) * side).multiplyScalar(SPEED * mode.speed);
      // Un filo di vento: il drone non è mai perfettamente fermo.
      want.add(new THREE.Vector3(Math.sin(this.time * 0.5), Math.sin(this.time * 0.8) * 0.3, Math.sin(this.time * 0.37)).multiplyScalar(0.15));
    } else {
      want.copy(this.home).sub(pos).multiplyScalar(C.droneResponse).clampLength(0, SPEED);
    }
    // Prontezza: in CINE parte e si ferma morbido, in SPORT scatta.
    this.vel.lerp(want, 1 - Math.exp(-dt * (this.active ? C.droneModes[this.speedMode].response : 3)));
    pos.addScaledVector(this.vel, dt);
    if (this.active) {
      const before = pos.clone();
      this.box.clampPoint(pos, pos);
      // Contro un limite si ferma su quell'asse, senza rimbalzi.
      if (before.x !== pos.x) this.vel.x = 0;
      if (before.y !== pos.y) this.vel.y = 0;
      if (before.z !== pos.z) this.vel.z = 0;
    } else {
      const aim = this.cam.groundAim();
      if (aim) this.cam.keepLookingAt(aim);
      if (pos.distanceTo(this.home) < 0.05) { pos.copy(this.home); this.vel.set(0, 0, 0); }
    }
    this.cam.free = this.airborne;
  }

  /** Il pilota si vede solo quando la camera non è alla postazione (anche nel replay). */
  syncPilot() { this.pilot.visible = this.camera.position.distanceTo(this.home) > 0.5; }

  private buildPilot(scene: THREE.Scene) {
    const h = this.home;
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.6, metalness: 0.3 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); this.pilot.add(m); return m;
    };
    // Torretta: il pilota sta in piedi all'altezza della postazione.
    const floor = h.y - 1.55;
    if (floor > 0) add(new THREE.BoxGeometry(1.6, floor, 1.8), new THREE.MeshStandardMaterial({ color: 0x4a4f59, roughness: 0.9 }), 0, -1.55 - floor / 2, 0.3);
    // La camera sul cavalletto, al posto della postazione.
    add(new THREE.BoxGeometry(0.22, 0.24, 0.42), dark, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 12).rotateX(Math.PI / 2), dark, 0, 0.01, -0.26);
    add(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 6), dark, 0, -0.84, 0);
    // Il pilota dietro la camera, girato verso il campo (il personaggio guarda verso +x).
    const actor = { id: 7, team: 0, role: 'coach' } as unknown as Actor;
    const me = createAthlete(actor);
    me.body.position.set(0, -1.55, 0.75);
    me.body.rotation.y = Math.PI / 2;
    me.body.scale.setScalar(0.95);
    // Braccia avanti a reggere il tablet, testa china sullo schermo.
    me.armL.rotation.z = me.armR.rotation.z = 0.35;
    me.elbowL.rotation.z = me.elbowR.rotation.z = 1.25;
    me.head.rotation.z = -0.35;
    // Cuffie: archetto e due padiglioni.
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.014, 6, 16, Math.PI), dark);
    band.position.y = 0.02; band.rotation.y = Math.PI / 2;
    me.head.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 12).rotateX(Math.PI / 2), dark);
      cup.position.set(-0.01, 0, side * 0.125);
      me.head.add(cup);
    }
    // Tablet con lo schermo acceso (è quello che vede il drone), rivolto verso il pilota.
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.26), dark);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.15), new THREE.MeshBasicMaterial({ color: 0x6fc3ff }));
    screen.position.x = -0.011; screen.rotation.y = -Math.PI / 2;
    tablet.add(screen);
    tablet.position.set(0.45, 0.98, 0);
    tablet.rotation.z = -0.6;
    me.body.add(tablet);
    this.pilot.add(me.body);
    this.pilot.position.copy(h);
    this.pilot.visible = false;
    scene.add(this.pilot);
  }

  /** Telecomando touch: ogni leva nasce dove appoggi il pollice nella sua zona e torna a riposo quando lo alzi. */
  private bindPad() {
    for (const [id, out] of [['drone-left', this.left], ['drone-right', this.right]] as const) {
      const zone = document.getElementById(id), base = zone?.querySelector<HTMLElement>('.dbase'), knob = base?.querySelector<HTMLElement>('span');
      if (!zone || !base || !knob) continue;
      let finger = -1, cx = 0, cy = 0;
      const move = (e: PointerEvent) => {
        const rad = base.offsetWidth / 2, v = new THREE.Vector2(e.clientX - cx, e.clientY - cy).clampLength(0, rad);
        out.x = v.x / rad; out.y = -v.y / rad;
        knob.style.transform = `translate(${v.x}px, ${v.y}px)`;
      };
      zone.addEventListener('pointerdown', (e) => {
        if (finger >= 0) return;
        e.preventDefault();
        finger = e.pointerId;
        zone.setPointerCapture(e.pointerId);
        // La base si sposta sotto il pollice (restando dentro la zona): niente scatto al primo tocco.
        const z = zone.getBoundingClientRect(), rad = base.offsetWidth / 2;
        cx = THREE.MathUtils.clamp(e.clientX, z.left + rad, z.right - rad);
        cy = THREE.MathUtils.clamp(e.clientY, z.top + rad, z.bottom - rad);
        base.style.left = `${cx - z.left - rad}px`; base.style.top = `${cy - z.top - rad}px`;
        zone.classList.add('on');
        move(e);
      });
      zone.addEventListener('pointermove', (e) => { if (e.pointerId === finger) move(e); });
      const stop = (e: PointerEvent) => {
        if (e.pointerId !== finger) return;
        finger = -1; out.x = out.y = 0;
        knob.style.transform = base.style.left = base.style.top = '';
        zone.classList.remove('on');
      };
      zone.addEventListener('pointerup', stop);
      zone.addEventListener('pointercancel', stop);
    }
  }
}

/** Curva delle leve: zona morta al centro, poi "expo" (fine vicino al centro, piena corsa in fondo). */
function expo(v: number) {
  const a = Math.max(0, Math.abs(v) - C.droneDeadZone) / (1 - C.droneDeadZone);
  return Math.sign(v) * (a * (1 - C.droneExpo) + a ** 3 * C.droneExpo);
}
