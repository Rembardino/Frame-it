/**
 * MONDI ALL'APERTO (golf, ciclismo, vela): cielo del tardo pomeriggio, sole che fa ombra dove guardi,
 * nuvole, colline lontane, terreno, alberi, acqua che riflette il cielo, scie e piccoli effetti, animali.
 * Ogni sport aggiunge il suo (percorso, strada, campo di regata) e chiama update() a ogni fotogramma.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Match } from '../sim/match';
import type { Effect } from '../sim/sports/types';
import { seeded, type Poly, type Tree } from '../sim/sports/shapes';
import { radialTexture } from './stage';
import { surfaceGrain } from './surfaces';
import { FaunaViews } from './fauna';

const DEG = Math.PI / 180;
/** Direzione del sole: basso, da ovest-sud-ovest. */
const SUN = new THREE.Vector3(-0.62, 0.36, 0.42).normalize();

export function canvasTexture(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function textCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  draw(g);
  return c;
}

/** Erba, sabbia, asfalto... che si ripete senza cuciture: colore, strisce, macchie, grana. */
export function turf(renderer: THREE.WebGLRenderer, base: string, stripe: string | null, stripes: number, grain: number, seed: number) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  if (stripe) for (let i = 1; i < stripes; i += 2) { g.fillStyle = stripe; g.fillRect(0, (i * 256) / stripes, 256, 256 / stripes); }
  const rnd = seeded(seed);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 6 + rnd() * 24;
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.03 + rnd() * 0.04})` : `rgba(255,255,200,${0.03 + rnd() * 0.04})`;
    // Ripetuta sui bordi, così la trama si ripete senza giunture.
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill(); }
  }
  surfaceGrain(g, grain, seed);
  return canvasTexture(c, renderer);
}

export const surfaceMaterial = (map: THREE.Texture, color = 0xffffff, roughness = 0.95) => new THREE.MeshStandardMaterial({ map, color, roughness, metalness: 0 });

/** Un poligono come superficie orizzontale, con la trama in metri (le forme sovrapposte combaciano). */
function shapeGeometry(p: Poly, tile: number, y: number) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(p.pts.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2).translate(0, y, 0);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  return g;
}

/**
 * Il terreno si disegna per primo, a strati in ordine fisso: prima il prato di base (che scrive la profondità,
 * così nasconde ciò che sta sottoterra), poi ogni strato sopra il precedente senza confrontare le profondità.
 * Superfici sovrapposte allo stesso livello non possono sfarfallare (col polygonOffset, su alcuni telefoni, sì).
 */
const GROUND = -100;
export function groundLayer<T extends THREE.Mesh<THREE.BufferGeometry, THREE.Material>>(mesh: T, order: number) {
  mesh.renderOrder = GROUND + order;
  Object.assign(mesh.material, { depthTest: false, depthWrite: false });
  return mesh;
}

/** Strato di superfici: order più alto = disegnato sopra. */
export function layer(polys: Poly[], material: THREE.MeshStandardMaterial, tile: number, order: number, y = 0) {
  const geometries = polys.map((p) => shapeGeometry(p, tile, y));
  const mesh = new THREE.Mesh(mergeGeometries(geometries)!, material);
  geometries.forEach((g) => g.dispose());
  mesh.receiveShadow = true;
  return groundLayer(mesh, order);
}

function skyDome(radius: number) {
  const geo = new THREE.SphereGeometry(radius, 32, 16), pos = geo.attributes.position, colors: number[] = [];
  const zenith = new THREE.Color(0x3d73bd), mid = new THREE.Color(0x9cc4e6), horizon = new THREE.Color(0xeadcc0), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius;
    if (y < 0.02) c.copy(horizon);
    else if (y < 0.18) c.lerpColors(horizon, mid, (y - 0.02) / 0.16);
    else c.lerpColors(mid, zenith, Math.min(1, (y - 0.18) / 0.55));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

/** Alberi a centinaia: pini e latifoglie, ognuno con la sua altezza e sfumatura di verde. */
export function forest(scene: THREE.Scene, trees: Tree[]) {
  const unit = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts.map((p) => p.toNonIndexed()))!; parts.forEach((p) => p.dispose()); return g; };
  const kinds = [
    { pine: true, trunk: new THREE.CylinderGeometry(0.018, 0.028, 0.32, 6).translate(0, 0.16, 0),
      top: unit([new THREE.ConeGeometry(0.3, 0.55, 8).translate(0, 0.45, 0), new THREE.ConeGeometry(0.21, 0.45, 8).translate(0, 0.74, 0)]) },
    { pine: false, trunk: new THREE.CylinderGeometry(0.025, 0.04, 0.5, 6).translate(0, 0.25, 0),
      top: unit([new THREE.IcosahedronGeometry(0.3, 1).translate(0, 0.62, 0), new THREE.IcosahedronGeometry(0.22, 1).translate(0.13, 0.74, 0.06),
        new THREE.IcosahedronGeometry(0.2, 1).translate(-0.12, 0.72, -0.09)]) },
  ];
  const bark = new THREE.MeshStandardMaterial({ color: 0x5b4532, roughness: 1 });
  const leaves = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  // A riquadri di 400 m: camera e ombra disegnano solo i boschi inquadrati, non migliaia di alberi a ogni fotogramma.
  const tiles = new Map<string, Tree[]>();
  for (const tr of trees) {
    const key = `${Math.floor(tr.x / 400)},${Math.floor(tr.z / 400)}`;
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key)!.push(tr);
  }
  for (const tile of tiles.values()) for (const k of kinds) {
    const list = tile.filter((tr) => tr.pine === k.pine);
    if (!list.length) continue;
    const trunks = new THREE.InstancedMesh(k.trunk, bark, list.length), tops = new THREE.InstancedMesh(k.top, leaves, list.length);
    list.forEach((tr, i) => {
      const h = k.pine ? tr.h : tr.h * 0.8;
      q.setFromAxisAngle(up, tr.tint * 40);
      m4.compose(new THREE.Vector3(tr.x, 0, tr.z), q, new THREE.Vector3(h, h, h));
      trunks.setMatrixAt(i, m4); tops.setMatrixAt(i, m4);
      tops.setColorAt(i, color.setHSL(k.pine ? 0.33 + tr.tint * 0.04 : 0.24 + tr.tint * 0.09, k.pine ? 0.42 : 0.45, k.pine ? 0.17 + tr.tint * 0.05 : 0.22 + tr.tint * 0.1));
    });
    for (const mesh of [trunks, tops]) { mesh.castShadow = true; mesh.computeBoundingSphere(); scene.add(mesh); }
  }
}

/**
 * Nastro che segue una serie di punti, spesso px pixel sullo schermo: la scia della palla (verticale,
 * girata verso la camera) o la scia bianca di una barca sull'acqua (flat = sdraiata).
 */
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private geo = new THREE.BufferGeometry();
  private side = new THREE.Vector3();
  private tangent = new THREE.Vector3();
  private toCam = new THREE.Vector3();

  /** map: trama di traverso al nastro (u = 0 un bordo, 1 l'altro), es. la schiuma della scia. */
  constructor(scene: THREE.Scene, private max: number, private flat = false, map: THREE.Texture | null = null) {
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 8);
    const index: number[] = [], uv = new Float32Array(max * 4);
    for (let i = 0; i < max - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    for (let i = 0; i < max; i++) uv.set([0, 0.5, 1, 0.5], i * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(index);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, depthTest: flat,
      side: THREE.DoubleSide, fog: false, toneMapped: false, polygonOffset: flat, polygonOffsetFactor: -10, polygonOffsetUnits: -20 }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
  }

  /** width: px (camera) o metri (flat). color(u) → [r, g, b, a], u = 0 coda, 1 testa. */
  draw(points: THREE.Vector3[], camera: THREE.PerspectiveCamera, width: number, color: (u: number) => [number, number, number, number]) {
    const n = Math.min(points.length, this.max);
    this.mesh.visible = n >= 2;
    if (n < 2) return;
    const k = (Math.tan((camera.fov * DEG) / 2) * width) / innerHeight;
    for (let i = 0; i < n; i++) {
      const p = points[points.length - n + i];
      this.tangent.subVectors(points[points.length - n + Math.min(n - 1, i + 1)], points[points.length - n + Math.max(0, i - 1)]);
      if (this.flat) this.side.set(-this.tangent.z, 0, this.tangent.x).normalize().multiplyScalar(width * (0.3 + 0.7 * (1 - i / n)));
      else {
        this.toCam.subVectors(camera.position, p);
        this.side.crossVectors(this.tangent, this.toCam).normalize().multiplyScalar(this.toCam.length() * k);
      }
      this.pos.set([p.x + this.side.x, p.y + this.side.y, p.z + this.side.z, p.x - this.side.x, p.y - this.side.y, p.z - this.side.z], i * 6);
      const c = color(i / (n - 1));
      this.col.set([...c, ...c], i * 8);
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.attributes.position.needsUpdate = this.geo.attributes.color.needsUpdate = true;
  }
}

/** Particelle degli effetti: la spinta di ognuna è fissa (seme), la posizione dipende solo dal tempo. */
const FX: Record<Effect['kind'], { life: number; n: number; speed: [number, number]; up: [number, number]; g: number; color: number }> = {
  sand: { life: 1.1, n: 36, speed: [1.5, 4], up: [2.5, 6], g: 9.8, color: 0xe8d6a6 },
  turf: { life: 0.9, n: 14, speed: [1, 3], up: [1.5, 4], g: 9.8, color: 0x5d7a3a },
  splash: { life: 1.3, n: 36, speed: [0.5, 2.2], up: [3.5, 8], g: 9.8, color: 0xe9f5ff },
  leaves: { life: 2.4, n: 24, speed: [0.3, 1.2], up: [-0.5, 0.8], g: 1.6, color: 0x4f7a2e },
  spray: { life: 1, n: 30, speed: [2, 6], up: [1.5, 4], g: 9.8, color: 0xf2f8ff },
  dust: { life: 1.6, n: 24, speed: [0.5, 2], up: [0.5, 1.5], g: 1, color: 0xb8a68a },
};

export function createOutdoor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, ground = '#3d6a31') {
  camera.far = 6000;
  scene.background = new THREE.Color(0xeadcc0);
  scene.fog = new THREE.Fog(0xdcd6c3, 380, 2400);
  scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x5b7a43, 1.25));
  const sun = new THREE.DirectionalLight(0xffe4b8, 2.7);
  sun.castShadow = CONFIG.render.shadows;
  sun.shadow.mapSize.setScalar(CONFIG.render.shadowMapSize);
  // L'ombra copre solo la zona inquadrata (il mondo è enorme): la luce segue la camera.
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 700 });
  sun.shadow.normalBias = 0.04; sun.shadow.bias = -0.0003; sun.shadow.intensity = 0.55;
  const fill = new THREE.DirectionalLight(0xa9c8ff, 0.6);
  fill.position.set(1, 0.6, -0.8);
  scene.add(sun, sun.target, fill);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('255,236,200'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.copy(SUN).multiplyScalar(2500); glow.scale.setScalar(520);
  scene.add(skyDome(2800), glow);
  const rnd = seeded(77);
  const cloudTex = canvasTexture(textCanvas(256, 128, (g) => {
    for (let i = 0; i < 14; i++) {
      const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 18 + rnd() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
    }
  }), renderer, false);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, e = (7 + rnd() * 18) * DEG;
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xfff6ea, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    cloud.position.set(Math.cos(a) * Math.cos(e) * 2300, Math.sin(e) * 2300, Math.sin(a) * Math.cos(e) * 2300);
    cloud.scale.set(500 + rnd() * 500, 170 + rnd() * 120, 1);
    scene.add(cloud);
  }
  const hills: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + rnd() * 0.1, d = 1450 + rnd() * 750;
    const g = new THREE.IcosahedronGeometry(1, 1).scale(220 + rnd() * 260, 70 + rnd() * 170, 220 + rnd() * 260).translate(Math.cos(a) * d, -25, Math.sin(a) * d);
    const col = new THREE.Color().setHSL(0.27 + rnd() * 0.08, 0.25, 0.28 + rnd() * 0.1), colors: number[] = [];
    for (let k = 0; k < g.attributes.position.count; k++) colors.push(col.r, col.g, col.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    hills.push(g);
  }
  scene.add(new THREE.Mesh(mergeGeometries(hills)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  const rough = turf(renderer, ground, null, 0, 0.09, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rough, roughness: 1 }));
  rough.repeat.set(1000, 1000);
  floor.receiveShadow = true;
  floor.renderOrder = GROUND;
  scene.add(floor);
  // L'acqua riflette il cielo (una piccola mappa d'ambiente fatta dallo stesso cielo).
  const envScene = new THREE.Scene(); envScene.add(skyDome(50));
  const env = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.03).texture;
  const water = (color = 0x2b6884) => new THREE.MeshStandardMaterial({ color, roughness: 0.07, metalness: 0.2, envMap: env, envMapIntensity: 1.1 });

  const PARTS = 36, MAXP = 8 * PARTS;
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  particles.frustumCulled = false;
  scene.add(particles);
  const fauna = new FaunaViews(scene);

  const aim = new THREE.Vector3(), look = new THREE.Vector3(), color = new THREE.Color();
  return {
    rough, water, sun,
    /** A ogni fotogramma (anche nei replay): ombre attorno a ciò che si inquadra, effetti, animali. */
    update(match: Match) {
      camera.updateMatrixWorld();
      camera.getWorldDirection(look);
      if (look.y < -0.05) aim.copy(camera.position).addScaledVector(look, Math.min(110, -camera.position.y / look.y));
      else aim.copy(camera.position).addScaledVector(look.setY(0).normalize(), 60);
      aim.set(Math.round(aim.x / 2) * 2, 0, Math.round(aim.z / 2) * 2);
      sun.target.position.copy(aim);
      sun.position.copy(aim).addScaledVector(SUN, 320);
      fauna.update(match);
      let count = 0;
      for (const e of match.sportSimulation?.effects ?? []) {
        const fx = FX[e.kind], age = match.time - e.t;
        if (age < 0 || age > fx.life) continue;
        const c = color.set(fx.color), r = seeded(Math.floor(e.t * 977) + 1);
        for (let j = 0; j < fx.n && count < MAXP; j++) {
          const a = r() * Math.PI * 2, sp = fx.speed[0] + r() * (fx.speed[1] - fx.speed[0]), up = fx.up[0] + r() * (fx.up[1] - fx.up[0]);
          const sway = e.kind === 'leaves' ? Math.sin(age * 3 + j) * 0.6 : 0;
          const y = e.at.y + up * age - 0.5 * fx.g * age * age;
          pPos.set([e.at.x + Math.cos(a) * (sp * age + sway), y < 0 ? -5 : y, e.at.z + Math.sin(a) * (sp * age + sway)], count * 3);
          const shade = 0.8 + r() * 0.3;
          pCol.set([c.r * shade, c.g * shade, c.b * shade], count * 3);
          count++;
        }
      }
      particles.visible = count > 0;
      pGeo.setDrawRange(0, count);
      pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = true;
    },
  };
}
