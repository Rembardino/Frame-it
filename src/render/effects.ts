/**
 * Conseguenze visibili dei gesti: zolle sollevate dai calci e dalle scivolate, polvere di terra rossa sui rimbalzi,
 * sudore che schizza dai colpi di boxe, coriandoli dalle curve al gol, scia della palla quando viaggia forte.
 * Legge le cue della partita (le stesse dell'audio) e i cambi di posa degli atleti: nessuna regola di gioco qui.
 * Un solo sistema di punti con shader minimo: dimensione e colore per particella, nessuna texture.
 */
import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import { BALL_RADIUS, type Cue, type Match, type Pose } from '../sim/match';
import { radialTexture } from './stage';
import type { ActorViews } from './actors';

const MAX = 700;
const TRAIL = 7;
const GRASS = [0x5f9b4a, 0x3f7a35, 0x7a5a32, 0x8f7045];
const CLAY = [0xc9805a, 0xb86d47, 0xdc9a74];
const CONFETTI = [0xff3b5c, 0xffd400, 0x00c2ff, 0xff7a00, 0x39e639, 0xff4fd8, 0xffffff];
const SURFACE_POSES = new Set<Pose>(['tackle', 'dive', 'fall', 'stumble']);

interface Burst { color: number[]; size: [number, number]; speed: [number, number]; up: [number, number]; life: [number, number]; gravity: number; grow: number; drag: number; alpha: number; flutter?: boolean }
const GRASS_BURST: Burst = { color: GRASS, size: [0.05, 0.13], speed: [0.4, 2.2], up: [1, 3.2], life: [0.45, 0.9], gravity: -9, grow: 0, drag: 0.5, alpha: 0.95 };
const CLAY_PUFF: Burst = { color: CLAY, size: [0.1, 0.22], speed: [0.3, 1.1], up: [0.3, 0.9], life: [0.6, 1.2], gravity: -0.6, grow: 0.55, drag: 2.5, alpha: 0.55 };
const SWEAT: Burst = { color: [0xf4f8ff, 0xdfe9f7], size: [0.025, 0.05], speed: [1.5, 4], up: [0.5, 2.5], life: [0.3, 0.55], gravity: -9, grow: 0, drag: 0.3, alpha: 0.9 };
const CONFETTI_BURST: Burst = { color: CONFETTI, size: [0.07, 0.11], speed: [0.5, 3], up: [1, 3], life: [3, 4.5], gravity: -1.6, grow: 0, drag: 1.2, alpha: 1, flutter: true };

export class Effects {
  private points: THREE.Points;
  private position: Float32Array;
  private color: Float32Array;
  private size: Float32Array;
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private gravity = new Float32Array(MAX);
  private grow = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private flutter = new Uint8Array(MAX);
  private phase = new Float32Array(MAX);
  private next = 0;
  private uniforms = { uScale: { value: 300 } };
  private trail: THREE.Sprite[] = [];
  private history: THREE.Vector3[] = [];
  private lastBall = new THREE.Vector3();
  private lastPose = new Map<number, Pose>();
  private stepTimer = new Map<number, number>();
  private time = 0;
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private camera: THREE.PerspectiveCamera, private match: Match, private views: ActorViews) {
    this.position = new Float32Array(MAX * 3).fill(-1000);
    this.color = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.color, 4));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: `
        attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(vColor.rgb, vColor.a * (1.0 - d * d));
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    // Scia della palla: fantasmi sfumati sulle posizioni precedenti, visibili solo quando viaggia forte.
    const tint = SPORT === 'basket' ? 0xe8894a : SPORT === 'tennis' ? 0xd9ff4a : 0xffffff;
    const map = radialTexture();
    for (let i = 0; i < TRAIL; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: tint, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.visible = false;
      scene.add(sprite); this.trail.push(sprite); this.history.push(new THREE.Vector3());
    }
    this.lastBall.copy(match.ball.pos);
  }

  /** Legge le cue senza svuotarle: l'audio le consuma subito dopo. */
  handle(cues: Cue[]) {
    for (const c of cues) {
      if (c.type !== 'sound') continue;
      const at = c.at, power = THREE.MathUtils.clamp(c.power ?? 1, 0.3, 1.5);
      switch (c.sound) {
        case 'kick': if (SPORT === 'calcio') this.burst(GRASS_BURST, at, Math.round(5 * power), 0.1); break;
        case 'shot': if (SPORT === 'calcio') this.burst(GRASS_BURST, at, Math.round(12 * power), 0.12); break;
        case 'save': if (SPORT === 'calcio') this.burst(GRASS_BURST, at, 10, 0.3); break;
        case 'bounce': if (SPORT === 'tennis') this.burst(CLAY_PUFF, at, 7, 0.08); break;
        case 'punch': this.burst(SWEAT, at, Math.round(8 * power), 0.05); break;
        case 'knockdown': this.burst(SWEAT, at, 24, 0.1); break;
        case 'goal': if (SPORT === 'calcio') this.confetti(Math.sign(at.x) || 1); break;
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    this.uniforms.uScale.value = this.camera.projectionMatrix.elements[5] * this.renderer.domElement.height / 2;
    this.updateParticles(dt);
    this.updateActors(dt);
    this.updateBall(dt);
  }

  private updateParticles(dt: number) {
    const p = this.position, v = this.vel, c = this.color;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { p[i * 3 + 1] = -1000; continue; }
      const k = this.life[i] / this.maxLife[i];
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      v[i * 3] *= damp; v[i * 3 + 2] *= damp;
      v[i * 3 + 1] = v[i * 3 + 1] * damp + this.gravity[i] * dt;
      if (this.flutter[i]) {
        // Coriandoli: cadono planando, oscillano di lato.
        v[i * 3 + 1] = Math.max(v[i * 3 + 1], -1.1);
        p[i * 3] += Math.sin(this.time * 4 + this.phase[i]) * dt * 0.8;
        p[i * 3 + 2] += Math.cos(this.time * 3.3 + this.phase[i]) * dt * 0.8;
      }
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.01) { p[i * 3 + 1] = 0.01; v[i * 3 + 1] = 0; v[i * 3] *= 0.6; v[i * 3 + 2] *= 0.6; }
      this.size[i] += this.grow[i] * dt;
      c[i * 4 + 3] = this.alpha[i] * Math.min(1, k * 2.5);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }

  /** Cambi di posa a terra e passi di corsa sollevano il terreno (solo erba e terra rossa). */
  private updateActors(dt: number) {
    const surface = SPORT === 'calcio' ? GRASS_BURST : SPORT === 'tennis' ? CLAY_PUFF : null;
    if (!surface) return;
    for (const a of this.match.actors) {
      const was = this.lastPose.get(a.id);
      if (a.pose !== was) {
        this.lastPose.set(a.id, a.pose);
        if (SURFACE_POSES.has(a.pose)) this.burst(surface, this.tmp.set(a.pos.x, 0.05, a.pos.z), SPORT === 'calcio' ? 9 : 8, 0.5);
      }
      const speed = Math.hypot(a.vel.x, a.vel.z);
      const threshold = SPORT === 'calcio' ? CONFIG.match.runSpeed * 0.9 : 3.2;
      if (speed > threshold) {
        const timer = (this.stepTimer.get(a.id) ?? 0) - dt;
        if (timer <= 0) {
          this.stepTimer.set(a.id, 0.26);
          this.burst(surface, this.tmp.set(a.pos.x - a.vel.x * 0.05, 0.03, a.pos.z - a.vel.z * 0.05), 2, 0.12, 0.5);
        } else this.stepTimer.set(a.id, timer);
      }
    }
  }

  private updateBall(dt: number) {
    if (SPORT === 'boxe') return;
    const b = this.match.ball.pos;
    const speed = dt > 0 ? b.distanceTo(this.lastBall) / dt : 0;
    this.lastBall.copy(b);
    for (let i = TRAIL - 1; i > 0; i--) this.history[i].copy(this.history[i - 1]);
    this.history[0].copy(b);
    const strength = THREE.MathUtils.clamp((speed - 9) / 14, 0, 1) * (b.y > 0 ? 1 : 0);
    const radius = BALL_RADIUS * 2.4;
    for (let i = 0; i < TRAIL; i++) {
      const sprite = this.trail[i], k = (i + 1) / TRAIL;
      sprite.visible = strength > 0.02 && i > 0;
      if (!sprite.visible) continue;
      sprite.position.copy(this.history[i]);
      sprite.scale.setScalar(radius * (1.1 - k * 0.7));
      sprite.material.opacity = strength * 0.55 * (1 - k);
    }
    // Rimbalzo: il punto più basso della traiettoria vicino a terra schiaccia la palla.
    const y = b.y;
    if (this.prevY < this.prevY2 && y > this.prevY && this.prevY < BALL_RADIUS * 2.5 && speed > 3) this.views.bounce();
    this.prevY2 = this.prevY; this.prevY = y;
  }
  private prevY = 0;
  private prevY2 = 0;

  private burst(kind: Burst, at: THREE.Vector3, count: number, spread: number, scale = 1) {
    for (let n = 0; n < count; n++) {
      const i = this.next; this.next = (this.next + 1) % MAX;
      const angle = Math.random() * Math.PI * 2, speed = THREE.MathUtils.lerp(kind.speed[0], kind.speed[1], Math.random()) * scale;
      this.position[i * 3] = at.x + (Math.random() - 0.5) * spread;
      this.position[i * 3 + 1] = Math.max(0.02, at.y + (Math.random() - 0.5) * spread * 0.5);
      this.position[i * 3 + 2] = at.z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(angle) * speed;
      this.vel[i * 3 + 1] = THREE.MathUtils.lerp(kind.up[0], kind.up[1], Math.random()) * scale;
      this.vel[i * 3 + 2] = Math.sin(angle) * speed;
      this.life[i] = this.maxLife[i] = THREE.MathUtils.lerp(kind.life[0], kind.life[1], Math.random());
      this.gravity[i] = kind.gravity; this.grow[i] = kind.grow; this.drag[i] = kind.drag; this.alpha[i] = kind.alpha;
      this.flutter[i] = kind.flutter ? 1 : 0; this.phase[i] = Math.random() * 10;
      this.size[i] = THREE.MathUtils.lerp(kind.size[0], kind.size[1], Math.random()) * scale;
      const color = new THREE.Color(kind.color[Math.floor(Math.random() * kind.color.length)]);
      this.color[i * 4] = color.r; this.color[i * 4 + 1] = color.g; this.color[i * 4 + 2] = color.b; this.color[i * 4 + 3] = kind.alpha;
    }
  }

  /** Coriandoli dalla cima della curva del lato in cui è finito il gol. */
  private confetti(side: number) {
    const { length: L, width: W } = CONFIG.pitch;
    const x = side * (L / 2 + 6 + CONFIG.crowd.rowsEnd * 0.9 - 1);
    const top = 0.6 + (CONFIG.crowd.rowsEnd - 1) * 0.5 + 1.6;
    for (let n = 0; n < 110; n++) {
      this.burst(CONFETTI_BURST, this.tmp.set(x, top, (Math.random() - 0.5) * (W + 2)), 1, 0.6);
      const i = (this.next + MAX - 1) % MAX;
      this.vel[i * 3] = -side * (1 + Math.random() * 2.5);
    }
  }
}
