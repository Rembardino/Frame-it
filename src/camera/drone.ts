/**
 * Drone (modalità Carriera): volo libero sopra e intorno al campo.
 * Guardi come sempre (trascina / frecce, a 360°) e zoomi come sempre; in più muovi il drone:
 *  - tastiera: W/S avanti/indietro, A/D di lato, Spazio sale, Shift (o C) scende;
 *  - touch: levetta in basso a sinistra per muoverti, ▲/▼ per salire e scendere.
 * Limiti: dal terreno a MAX_HEIGHT, e il campo più un margine su ogni lato (si può volare sopra la gente).
 * Alla postazione resta il pilota (tu), con le cuffie, che guida guardando il tablet.
 * La batteria (CONFIG.camera.droneBattery secondi) si consuma in volo; a batteria scarica torna da solo alla postazione.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { createAthlete } from '../render/athlete';
import type { Actor } from '../sim/match';
import type { CameraController } from './cameraController';

const C = CONFIG.camera;
const L = CONFIG.pitch.length, W = CONFIG.pitch.width;
const DEG = Math.PI / 180;
/** Quota massima e margine oltre le linee, proporzionati al campo (calcio: 30 m e 12 m; boxe: 8 m e 3 m). */
const MAX_HEIGHT = THREE.MathUtils.clamp(W * 0.8, 8, 30);
const MARGIN = THREE.MathUtils.clamp(W * 0.3, 3, 12);
const MIN_HEIGHT = 0.3;
/** Sui campi piccoli il drone va più piano. */
const SPEED = C.droneSpeed * Math.max(0.35, L / 60);

export class Drone {
  battery = C.droneBattery;
  active = false;
  private home: THREE.Vector3;
  private vel = new THREE.Vector3();
  private time = 0;
  private box: THREE.Box3;
  private pilot = new THREE.Group();
  private keys = new Set<string>();
  /** Levetta touch (-1..1: x = di lato, y = avanti) e pulsanti quota (-1, 0, +1). */
  private stick = { x: 0, y: 0 };
  private lift = 0;

  constructor(private cam: CameraController, private camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.home = camera.position.clone();
    this.box = new THREE.Box3(new THREE.Vector3(-L / 2 - MARGIN, MIN_HEIGHT, -W / 2 - MARGIN), new THREE.Vector3(L / 2 + MARGIN, MAX_HEIGHT, W / 2 + MARGIN))
      .expandByPoint(this.home);
    this.buildPilot(scene);
    const fly = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC'];
    addEventListener('keydown', (e) => {
      if (!this.active || !cam.inputsEnabled || !fly.includes(e.code)) return;
      this.keys.add(e.code);
      e.preventDefault(); // lo Spazio non deve "cliccare" il pulsante col focus
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.bindPad();
  }

  get owned() { return C.droneBattery > 0; }
  /** Lontano dalla postazione (in volo o di ritorno). */
  get airborne() { return this.camera.position.distanceTo(this.home) > 0.05; }

  toggle() {
    if (this.active) this.active = false;
    else if (this.owned && this.battery > 0) this.active = true;
    document.getElementById('dronepad')?.classList.toggle('hidden', !this.active);
    if (!this.active) { this.keys.clear(); this.stick.x = this.stick.y = this.lift = 0; }
  }

  update(dt: number) {
    this.syncPilot();
    if (!this.active && !this.airborne) { this.cam.free = false; return; }
    this.time += dt;
    if (this.active && (this.battery = Math.max(0, this.battery - dt)) === 0) this.toggle();
    const pos = this.camera.position;
    const want = new THREE.Vector3();
    if (this.active) {
      const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
      const fwd = THREE.MathUtils.clamp(k('KeyW') - k('KeyS') + this.stick.y, -1, 1);
      const side = THREE.MathUtils.clamp(k('KeyD') - k('KeyA') + this.stick.x, -1, 1);
      const up = THREE.MathUtils.clamp(k('Space') - k('ShiftLeft', 'ShiftRight', 'KeyC') + this.lift, -1, 1);
      const y = this.cam.yaw * DEG;
      want.set(Math.sin(y) * fwd + Math.cos(y) * side, up * 0.7, -Math.cos(y) * fwd + Math.sin(y) * side).multiplyScalar(SPEED);
      // Un filo di vento: il drone non è mai perfettamente fermo.
      want.add(new THREE.Vector3(Math.sin(this.time * 0.5), Math.sin(this.time * 0.8) * 0.3, Math.sin(this.time * 0.37)).multiplyScalar(0.15));
    } else {
      want.copy(this.home).sub(pos).multiplyScalar(C.droneResponse).clampLength(0, SPEED);
    }
    this.vel.lerp(want, 1 - Math.exp(-dt * 3));
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

  /** Comandi touch: levetta e pulsanti ▲/▼, tenuti premuti. */
  private bindPad() {
    const stick = document.getElementById('drone-stick'), knob = stick?.firstElementChild as HTMLElement | null;
    if (stick && knob) {
      const move = (e: PointerEvent) => {
        const r = stick.getBoundingClientRect(), rad = r.width / 2;
        const v = new THREE.Vector2(e.clientX - r.left - rad, e.clientY - r.top - rad).clampLength(0, rad);
        this.stick.x = v.x / rad; this.stick.y = -v.y / rad;
        knob.style.transform = `translate(${v.x}px, ${v.y}px)`;
      };
      const stop = () => { this.stick.x = this.stick.y = 0; knob.style.transform = ''; };
      stick.addEventListener('pointerdown', (e) => { e.preventDefault(); stick.setPointerCapture(e.pointerId); move(e); });
      stick.addEventListener('pointermove', (e) => { if (stick.hasPointerCapture(e.pointerId)) move(e); });
      stick.addEventListener('pointerup', stop);
      stick.addEventListener('pointercancel', stop);
    }
    for (const [id, dir] of [['drone-up', 1], ['drone-down', -1]] as const) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); this.lift = dir; btn.classList.add('on'); });
      const stop = () => { this.lift = 0; btn.classList.remove('on'); };
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
    }
  }
}
