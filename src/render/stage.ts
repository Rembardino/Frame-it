/**
 * Scenografia statica: renderer, luci, cielo serale con stelle, campo, porte, tribune, cartelloni, torri faro.
 * Tutto generato nel codice con forme semplici e colori piatti.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, SPORT } from '../config';

const L = CONFIG.pitch.length;
const W = CONFIG.pitch.width;

/** Una fila di posti in tribuna, su cui il pubblico viene distribuito. */
export interface SeatRow {
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Rotazione Y del tifoso (guarda verso il campo). */
  facing: number;
  /** Squadra tifata prevalente: 0, 1 o -1 (misto). */
  team: number;
}

export function createStage(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: CONFIG.render.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.render.maxPixelRatio));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2c52);
  scene.fog = new THREE.Fog(0x1d2c52, 160, 480);

  const camera = new THREE.PerspectiveCamera(CONFIG.camera.startFov, 1, 0.1, 1000);

  scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x2a4a2a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.8); // i fari
  sun.position.set(-30, 60, 40);
  scene.add(sun);

  scene.add(sky(), stars(), ground(), floodlights(), adBoards());
  if (SPORT === 'basket') scene.add(court(renderer), hoop(1), hoop(-1));
  else scene.add(pitch(renderer), goal(1), goal(-1), cornerFlags());
  const { mesh: stands, rows: seatRows } = standsAndSeats();
  scene.add(stands);

  return { renderer, scene, camera, seatRows };
}

// ------------------------------------------------------------------ cielo

function sky() {
  const geo = new THREE.SphereGeometry(450, 32, 16);
  const pos = geo.attributes.position;
  const colors: number[] = [];
  const zenith = new THREE.Color(0x07112b);
  const mid = new THREE.Color(0x1d2c52);
  const horizon = new THREE.Color(0xd9774a); // ultimo bagliore del tramonto
  const below = new THREE.Color(0x121a2a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 450;
    if (y < 0) c.copy(below);
    else if (y < 0.12) c.lerpColors(horizon, mid, y / 0.12);
    else c.lerpColors(mid, zenith, Math.min(1, (y - 0.12) / 0.5));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

function stars() {
  const pts: number[] = [];
  for (let i = 0; i < 350; i++) {
    const v = new THREE.Vector3().randomDirection();
    if (v.y < 0.2) v.y = 0.2 + Math.random() * 0.8;
    v.normalize().multiplyScalar(440);
    pts.push(v.x, v.y, v.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false }));
}

// ------------------------------------------------------------------ campo

function pitch(renderer: THREE.WebGLRenderer) {
  const margin = 5;
  const ppm = 24; // pixel di texture per metro
  const cw = (L + 2 * margin) * ppm;
  const ch = (W + 2 * margin) * ppm;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d')!;

  // Strisce del taglio dell'erba.
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#3f8f3a' : '#4a9c42';
    g.fillRect((i * cw) / stripes, 0, cw / stripes + 1, ch);
  }

  const X = (x: number) => (x + L / 2 + margin) * ppm;
  const Y = (z: number) => (z + W / 2 + margin) * ppm;
  g.strokeStyle = g.fillStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 0.12 * ppm;
  g.strokeRect(X(-L / 2), Y(-W / 2), L * ppm, W * ppm);
  g.beginPath(); g.moveTo(X(0), Y(-W / 2)); g.lineTo(X(0), Y(W / 2)); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), 6 * ppm, 0, Math.PI * 2); g.stroke();
  const spot = (x: number) => { g.beginPath(); g.arc(X(x), Y(0), 0.25 * ppm, 0, Math.PI * 2); g.fill(); };
  spot(0);
  for (const side of [-1, 1]) {
    for (const [depth, width] of [[0.2 * L, 0.6 * W], [0.08 * L, 0.3 * W]]) {
      const x0 = side > 0 ? L / 2 - depth : -L / 2;
      g.strokeRect(X(x0), Y(-width / 2), depth * ppm, width * ppm);
    }
    spot(side * (L / 2 - 0.15 * L));
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const geo = new THREE.PlaneGeometry(L + 2 * margin, W + 2 * margin).rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
}

// ------------------------------------------------------------------ basket

/** Campetto: parquet, area colorata, linee regolamentari (tiro da tre, lunetta, cerchio centrale). */
function court(renderer: THREE.WebGLRenderer) {
  const P = CONFIG.pitch;
  const margin = 3;
  const ppm = 48;
  const cw = (L + 2 * margin) * ppm;
  const ch = (W + 2 * margin) * ppm;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d')!;
  const X = (x: number) => (x + L / 2 + margin) * ppm;
  const Y = (z: number) => (z + W / 2 + margin) * ppm;

  g.fillStyle = '#2b4c86'; // fuori campo
  g.fillRect(0, 0, cw, ch);
  // Parquet: listoni lungo il campo, due toni.
  const plank = 0.6;
  for (let z = -W / 2, i = 0; z < W / 2; z += plank, i++) {
    g.fillStyle = i % 2 ? '#c98d52' : '#d39a5f';
    g.fillRect(X(-L / 2), Y(z), L * ppm, Math.min(plank, W / 2 - z) * ppm + 1);
  }
  const key = 4.9, keyDepth = 5.8, r3 = P.threePoint, hb = P.hoopFromBaseline;
  for (const side of [-1, 1]) {
    // Area dipinta.
    g.fillStyle = '#9b3a2e';
    const x0 = side > 0 ? L / 2 - keyDepth : -L / 2;
    g.fillRect(X(x0), Y(-key / 2), keyDepth * ppm, key * ppm);
  }
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 0.06 * ppm;
  g.strokeRect(X(-L / 2), Y(-W / 2), L * ppm, W * ppm);
  g.beginPath(); g.moveTo(X(0), Y(-W / 2)); g.lineTo(X(0), Y(W / 2)); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), 1.8 * ppm, 0, Math.PI * 2); g.stroke();
  for (const side of [-1, 1]) {
    const base = side * L / 2;
    const hx = side * (L / 2 - hb);
    const ft = side * (L / 2 - keyDepth);
    g.strokeRect(X(Math.min(base, ft)), Y(-key / 2), keyDepth * ppm, key * ppm);
    g.beginPath(); g.arc(X(ft), Y(0), 1.8 * ppm, 0, Math.PI * 2); g.stroke();
    // Tiro da tre: due rette parallele alle linee laterali, poi l'arco attorno al ferro.
    const zs = 6.6;
    const dx = Math.sqrt(r3 * r3 - zs * zs);
    const a = Math.atan2(zs, dx);
    for (const z of [-zs, zs]) {
      g.beginPath(); g.moveTo(X(base), Y(z)); g.lineTo(X(hx - side * dx), Y(z)); g.stroke();
    }
    g.beginPath();
    if (side > 0) g.arc(X(hx), Y(0), r3 * ppm, Math.PI - a, Math.PI + a);
    else g.arc(X(hx), Y(0), r3 * ppm, -a, a);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const geo = new THREE.PlaneGeometry(L + 2 * margin, W + 2 * margin).rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
}

/** Canestro: palo dietro la linea di fondo, braccio, tabellone trasparente, ferro arancione e retina. */
function hoop(side: 1 | -1) {
  const P = CONFIG.pitch;
  const g = new THREE.Group();
  const rim = P.rimHeight;
  const boardX = L / 2 - 1.2;
  const hx = L / 2 - P.hoopFromBaseline;
  const grey = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, rim + 0.6, 0.25), grey);
  pole.position.set(L / 2 + 1.2, (rim + 0.6) / 2, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.18), grey);
  arm.position.set(L / 2, rim + 0.5, 0);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 1.2), new THREE.MeshLambertMaterial({ color: 0x1f3d7a }));
  pad.position.set(L / 2 + 1.2, 0.7, 0);

  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.05).rotateY(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  board.position.set(boardX, rim - 0.15 + 0.525, 0);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.8, 1.05).rotateY(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0xffffff }));
  edge.position.copy(board.position);
  const square = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.59, 0.45).rotateY(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0xff3b30 }));
  square.position.set(boardX - 0.01, rim + 0.2, 0);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff6a1a }));
  ring.position.set(hx, rim, 0);
  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.14, 0.42, 12, 1, true),
    new THREE.MeshBasicMaterial({ map: netTexture(6, 2), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  net.position.set(hx, rim - 0.21, 0);
  g.add(pole, arm, pad, board, edge, square, ring, net);
  if (side < 0) g.rotation.y = Math.PI;
  return g;
}

function ground() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x24301f }));
  m.position.y = -0.03;
  return m;
}

function netTexture(repeatX: number, repeatY: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  return t;
}

function goal(side: 1 | -1) {
  const g = new THREE.Group();
  const gw = CONFIG.pitch.goalWidth;
  const gh = CONFIG.pitch.goalHeight;
  const depth = 1.6;
  const r = 0.06;
  const cells = 4; // maglie per metro
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const post = new THREE.CylinderGeometry(r, r, gh, 8);
  for (const z of [-gw / 2, gw / 2]) {
    const m = new THREE.Mesh(post, white);
    m.position.set(0, gh / 2, z);
    g.add(m);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, gw + 2 * r, 8).rotateX(Math.PI / 2), white);
  bar.position.y = gh;
  g.add(bar);

  const netMat = (rx: number, ry: number) =>
    new THREE.MeshBasicMaterial({ map: netTexture(rx, ry), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh).rotateY(Math.PI / 2), netMat(gw * cells, gh * cells));
  back.position.set(side * depth, gh / 2, 0);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(depth, gw).rotateX(-Math.PI / 2), netMat(depth * cells, gw * cells));
  top.position.set((side * depth) / 2, gh, 0);
  g.add(back, top);
  for (const z of [-gw / 2, gw / 2]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(depth, gh), netMat(depth * cells, gh * cells));
    s.position.set((side * depth) / 2, gh / 2, z);
    g.add(s);
  }
  g.position.x = (side * L) / 2;
  return g;
}

function cornerFlags() {
  const g = new THREE.Group();
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xffe14a });
  const flag = new THREE.PlaneGeometry(0.45, 0.32);
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xff3b30, side: THREE.DoubleSide });
  for (const x of [-L / 2, L / 2]) {
    for (const z of [-W / 2, W / 2]) {
      const p = new THREE.Mesh(pole, poleMat);
      p.position.set(x, 0.75, z);
      const f = new THREE.Mesh(flag, flagMat);
      f.position.set(x + 0.23, 1.33, z);
      g.add(p, f);
    }
  }
  return g;
}

// ------------------------------------------------------------------ stadio

function standsAndSeats() {
  const rise = 0.5;
  const step = 0.9;
  const boxes: THREE.BufferGeometry[] = [];
  const rows: SeatRow[] = [];
  const { rowsFar, rowsEnd } = CONFIG.crowd;

  // Tribuna lunga di fronte alla camera.
  const farFront = W / 2 + 6;
  const farLen = L + 16;
  for (let i = 0; i < rowsFar; i++) {
    const top = 0.6 + i * rise;
    const z = -(farFront + i * step + step / 2);
    boxes.push(new THREE.BoxGeometry(farLen, top, step).translate(0, top / 2, z));
    rows.push({ from: new THREE.Vector3(-farLen / 2 + 1, top, z), to: new THREE.Vector3(farLen / 2 - 1, top, z), facing: -Math.PI / 2, team: -1 });
  }
  // Curve dietro le porte: casa a sinistra, ospiti a destra.
  const endFront = L / 2 + 6;
  const endLen = W + 4;
  for (const side of [-1, 1]) {
    for (let i = 0; i < rowsEnd; i++) {
      const top = 0.6 + i * rise;
      const x = side * (endFront + i * step + step / 2);
      boxes.push(new THREE.BoxGeometry(step, top, endLen).translate(x, top / 2, 0));
      rows.push({
        from: new THREE.Vector3(x, top, -endLen / 2 + 1),
        to: new THREE.Vector3(x, top, endLen / 2 - 1),
        facing: side > 0 ? Math.PI : 0,
        team: side < 0 ? 0 : 1,
      });
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(boxes), new THREE.MeshLambertMaterial({ color: 0x5b6170 }));
  return { mesh, rows };
}

function adBoards() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#0c1020';
  g.fillRect(0, 0, 640, 64);
  g.font = 'bold 40px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd23f';
  g.fillText('FRAME IT', 24, 34);
  g.fillStyle = '#4fd1ff';
  g.fillText('LIVE SPORTS TV', 270, 34);

  const board = (len: number, x: number, z: number, rotY: number) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(len / 10, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, 0.45, z);
    m.rotation.y = rotY;
    return m;
  };
  const g3 = new THREE.Group();
  g3.add(board(L + 10, 0, -(W / 2 + 3), 0));
  g3.add(board(W + 6, -(L / 2 + 3), 0, Math.PI / 2));
  g3.add(board(W + 6, L / 2 + 3, 0, -Math.PI / 2));
  return g3;
}

function floodlights() {
  const g = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.3, 0.5, 24, 8).translate(0, 12, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
  const lampGeo = new THREE.BoxGeometry(3.5, 1.6, 0.4);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
  const glowMat = new THREE.SpriteMaterial({ map: radialTexture(), color: 0xfff1c4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (const x of [-(L / 2 + 10), L / 2 + 10]) {
    for (const z of [-(W / 2 + 14), W / 2 + 12]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 0, z);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, 24.5, z);
      lamp.lookAt(0, 0, 0);
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(lamp.position);
      glow.scale.setScalar(14);
      g.add(pole, lamp, glow);
    }
  }
  return g;
}

/** Macchia radiale sfumata: alone dei fari, ombre finte sotto giocatori e palla. */
export function radialTexture(rgb = '255,255,255') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${rgb},0.9)`);
  grd.addColorStop(0.3, `rgba(${rgb},0.35)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
