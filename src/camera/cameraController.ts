/**
 * Camera del giocatore: posizione fissa a bordo campo, ruota (pan/tilt) e zooma.
 *
 * Input: un dito / mouse trascinato = pan+tilt, due dita = zoom, pulsanti +/− (tenuti premuti) = zoom,
 * rotellina = zoom, frecce/WASD = pan+tilt, Q/E (o -/+) = zoom.
 *
 * Sensazione "camera vera": il dito sposta un BERSAGLIO; la camera lo insegue con un piccolo
 * ritardo (peso), e se lanci il dito l'inerzia continua e si smorza. Tutti i numeri in CONFIG.camera.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { View } from '../scoring/scoring';

const C = CONFIG.camera;
const DEG = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;

export class CameraController {
  /** Stato attuale (gradi). Yaw positivo = destra, pitch positivo = su, fov = FOV verticale. */
  yaw = C.startYaw;
  pitch = C.startPitch;
  fov = C.startFov;
  /** Diventa true al primo input del giocatore. */
  hasInteracted = false;

  private tYaw = this.yaw;
  private tPitch = this.pitch;
  private tFov = this.fov;
  private vYaw = 0;
  private vPitch = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private pinchFov = 0;
  private lastMove = 0;
  private keys = new Set<string>();
  private enabled = true;
  private zoomButtons = new Set<HTMLElement>();
  /** Pulsante zoom tenuto premuto: -1 stringe, +1 allarga, 0 niente. */
  private zoomHold = 0;
  private time = 0;

  constructor(private camera: THREE.PerspectiveCamera, private el: HTMLElement) {
    camera.position.set(C.position.x, C.position.y, C.position.z);
    camera.rotation.order = 'YXZ';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault()); // Safari: niente zoom pagina
    addEventListener('keydown', (e) => { if (this.enabled) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  /** Collega un pulsante a schermo: finché è premuto lo zoom continua. dir -1 = stringi, +1 = allarga. */
  bindZoomButton(btn: HTMLElement, dir: number) {
    this.zoomButtons.add(btn);
    btn.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this.zoomHold = dir;
      this.hasInteracted = true;
      btn.classList.add('on');
    });
    const stop = () => { this.zoomHold = 0; btn.classList.remove('on'); };
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Sospende gli input durante il replay e scarta eventuali pressioni rimaste attive. */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) return;
    this.keys.clear();
    this.pointers.clear();
    this.pinchDist = 0;
    this.zoomHold = 0;
    this.vYaw = this.vPitch = 0;
    this.zoomButtons.forEach((btn) => btn.classList.remove('on'));
  }

  /** Ingrandimento rispetto allo zoom più largo (per l'HUD). */
  get magnification() {
    return Math.tan((C.fovMax / 2) * DEG) / Math.tan((this.fov / 2) * DEG);
  }

  /** Stato per lo scoring: senza micro-oscillazione, che non deve contare nel voto. */
  view(): View {
    return { pos: this.camera.position, yaw: this.yaw, pitch: this.pitch, fov: this.fov, aspect: this.camera.aspect };
  }

  update(dt: number) {
    this.time += dt;
    this.applyKeys(dt);
    if (this.zoomHold) this.tFov *= Math.exp(this.zoomHold * C.buttonZoomSpeed * dt);

    // Inerzia dopo aver alzato il dito.
    if (this.pointers.size === 0) {
      this.tYaw += this.vYaw * dt;
      this.tPitch += this.vPitch * dt;
      const f = Math.exp(-C.releaseFriction * dt);
      this.vYaw *= f;
      this.vPitch *= f;
    }
    this.clampTargets();

    // La camera insegue il bersaglio (smorzamento esponenziale, indipendente dal frame rate).
    const k = 1 - Math.exp(-dt / C.followTime);
    this.yaw += (this.tYaw - this.yaw) * k;
    this.pitch += (this.tPitch - this.pitch) * k;
    const kz = 1 - Math.exp(-dt / C.zoomFollowTime);
    this.fov = Math.exp(Math.log(this.fov) + (Math.log(this.tFov) - Math.log(this.fov)) * kz);

    // Micro-oscillazione da camera a spalla (somma di sinusoidi = movimento organico).
    const t = this.time * C.shakeSpeed;
    const sx = C.shakeAmplitude * (Math.sin(t * 2.1) + 0.5 * Math.sin(t * 5.3 + 1.7));
    const sy = C.shakeAmplitude * (Math.sin(t * 1.7 + 0.4) + 0.5 * Math.sin(t * 4.1 + 2.9));

    this.camera.rotation.set((this.pitch + sy) * DEG, -(this.yaw + sx) * DEG, 0);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  private clampTargets() {
    const y = clamp(this.tYaw, -C.yawLimit, C.yawLimit);
    if (y !== this.tYaw) { this.tYaw = y; this.vYaw = 0; }
    const p = clamp(this.tPitch, C.pitchMin, C.pitchMax);
    if (p !== this.tPitch) { this.tPitch = p; this.vPitch = 0; }
    this.tFov = clamp(this.tFov, C.fovMin, C.fovMax);
  }

  private applyKeys(dt: number) {
    const key = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    const h = key('ArrowRight', 'KeyD') - key('ArrowLeft', 'KeyA');
    const v = key('ArrowUp', 'KeyW') - key('ArrowDown', 'KeyS');
    const z = key('KeyQ', 'Minus', 'NumpadSubtract') - key('KeyE', 'Equal', 'NumpadAdd');
    if (!h && !v && !z) return;
    this.hasInteracted = true;
    const pan = C.keyPanSpeed * this.fov * dt;
    this.tYaw += h * pan;
    this.tPitch += v * pan;
    this.tFov *= Math.exp(z * C.keyZoomSpeed * dt);
  }

  // ---------------------------------------------------------------- puntatori

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.vYaw = this.vPitch = 0; // il dito "afferra" la camera
    this.hasInteracted = true;
    if (this.pointers.size === 2) {
      this.pinchDist = this.fingerDistance();
      this.pinchFov = this.tFov;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.pointers.size >= 2) {
      const d = this.fingerDistance();
      if (d > 0 && this.pinchDist > 0) this.tFov = this.pinchFov * Math.pow(this.pinchDist / d, C.pinchSensitivity);
      return;
    }

    // Gradi per pixel proporzionali allo zoom: zoomato = movimenti più fini.
    const k = ((this.fov * C.dragSensitivity) / innerHeight) * (C.invertDrag ? -1 : 1);
    const dYaw = dx * k;
    const dPitch = -dy * k;
    this.tYaw += dYaw;
    this.tPitch += dPitch;

    // Velocità del dito (smussata) per l'inerzia al rilascio.
    const now = performance.now();
    const dtm = Math.max(8, now - this.lastMove) / 1000;
    this.lastMove = now;
    const max = C.maxFlickSpeed;
    this.vYaw = clamp(this.vYaw + (dYaw / dtm - this.vYaw) * 0.4, -max, max);
    this.vPitch = clamp(this.vPitch + (dPitch / dtm - this.vPitch) * 0.4, -max, max);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    // Dito fermo prima di alzarlo = nessuna inerzia. Dopo un pizzico, niente inerzia.
    if (this.pointers.size > 0 || performance.now() - this.lastMove > 70) this.vYaw = this.vPitch = 0;
    if (this.pointers.size < 2) this.pinchDist = 0;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.hasInteracted = true;
    this.tFov *= Math.exp(e.deltaY * C.wheelZoomSpeed);
  };

  private fingerDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
