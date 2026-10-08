/**
 * Scenografia statica: renderer, luci, cielo serale con stelle, campo, porte, tribune, cartelloni, torri faro.
 * Materiali procedurali, illuminazione morbida e tribune generate nel codice.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG, SPORT } from '../config';
import { sportCourt } from './sportCourts';
import { courtSurface, surfaceGrain, rod } from './surfaces';

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
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = CONFIG.render.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x172c47);
  scene.fog = new THREE.Fog(0x172c47, 100, 360);

  const camera = new THREE.PerspectiveCamera(CONFIG.camera.startFov, 1, 0.1, 1000);

  scene.add(new THREE.HemisphereLight(0xdceaff, 0x55654d, 1.65));
  const sun = new THREE.DirectionalLight(0xffefd8, 2.5);
  sun.position.set(-L * 0.3, Math.max(18, L * 0.65), W * 0.65);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(CONFIG.render.shadowMapSize);
  sun.shadow.camera.left = -L * 0.68; sun.shadow.camera.right = L * 0.68;
  sun.shadow.camera.top = Math.max(W, L) * 0.65; sun.shadow.camera.bottom = -Math.max(W, L) * 0.65;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 150;
  sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.0002;
  sun.shadow.intensity = 0.45;
  const rim = new THREE.DirectionalLight(0x9dceff, 1.5);
  rim.position.set(L * 0.4, 16, -W);
  scene.add(sun, rim);

  scene.add(sky(), stars(), ground(), floodlights(), adBoards(), venueDetails());
  if (SPORT === 'basket') scene.add(court(renderer), hoop(1), hoop(-1));
  else if (SPORT === 'boxe' || SPORT === 'tennis' || SPORT === 'pallavolo') scene.add(sportCourt(renderer));
  else scene.add(pitch(renderer), goal(1), goal(-1), cornerFlags());
  const { mesh: stands, rows: seatRows } = standsAndSeats();
  scene.add(stands);
  scene.add(stadiumSeats(seatRows), grandstandRoof());

  return { renderer, scene, camera, seatRows };
}

// ------------------------------------------------------------------ cielo

function sky() {
  const geo = new THREE.SphereGeometry(450, 32, 16);
  const pos = geo.attributes.position;
  const colors: number[] = [];
  const zenith = new THREE.Color(0x0b1934);
  const mid = new THREE.Color(0x28476a);
  const horizon = new THREE.Color(0xefad83); // ultimo bagliore del tramonto
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
    g.fillStyle = i % 2 ? '#33744a' : '#3d8451';
    g.fillRect((i * cw) / stripes, 0, cw / stripes + 1, ch);
  }
  surfaceGrain(g, 0.07);
  const shade = g.createLinearGradient(0, 0, 0, ch);
  shade.addColorStop(0, 'rgba(5,29,24,0.18)'); shade.addColorStop(1, 'rgba(142,185,87,0.06)');
  g.fillStyle = shade; g.fillRect(0, 0, cw, ch);

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
    const px = side * (L / 2 - 0.15 * L);
    const a = Math.acos((0.2 * L - 0.15 * L) / 6);
    g.beginPath();
    g.arc(X(px), Y(0), 6 * ppm, side > 0 ? Math.PI - a : -a, side > 0 ? Math.PI + a : a);
    g.stroke();
    for (const z of [-W / 2, W / 2]) {
      g.beginPath(); g.arc(X(side * L / 2), Y(z), ppm, side > 0 ? Math.PI / 2 : 0, side > 0 ? Math.PI : Math.PI / 2);
      if (z > 0) { g.beginPath(); g.arc(X(side * L / 2), Y(z), ppm, side > 0 ? Math.PI : -Math.PI / 2, side > 0 ? Math.PI * 1.5 : 0); }
      g.stroke();
    }
  }
  return courtSurface(canvas, L + 2 * margin, W + 2 * margin, renderer);
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

  g.fillStyle = '#173a50'; // fuori campo
  g.fillRect(0, 0, cw, ch);
  // Parquet: listoni lungo il campo, due toni.
  const plank = 0.6;
  for (let z = -W / 2, i = 0; z < W / 2; z += plank, i++) {
    g.fillStyle = i % 2 ? '#c49360' : '#d7ab77';
    g.fillRect(X(-L / 2), Y(z), L * ppm, Math.min(plank, W / 2 - z) * ppm + 1);
    g.strokeStyle = 'rgba(91,52,24,0.18)'; g.lineWidth = 0.8;
    for (let x = -L / 2 + (i % 3) * 1.2; x < L / 2; x += 3.6) {
      g.beginPath(); g.moveTo(X(x), Y(z)); g.lineTo(X(x), Y(Math.min(W / 2, z + plank))); g.stroke();
    }
  }
  surfaceGrain(g, 0.065);
  const key = 4.9, keyDepth = 5.8, r3 = P.threePoint, hb = P.hoopFromBaseline;
  for (const side of [-1, 1]) {
    // Area dipinta.
    g.fillStyle = side < 0 ? '#684bab' : '#176e7f';
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
    for (const z of [-key / 2, key / 2]) for (const offset of [1.8, 2.7, 3.6, 4.5]) {
      g.beginPath(); g.moveTo(X(base - side * offset), Y(z)); g.lineTo(X(base - side * offset), Y(z + Math.sign(z) * 0.22)); g.stroke();
    }
    g.beginPath(); g.arc(X(hx), Y(0), 1.25 * ppm, side > 0 ? Math.PI / 2 : -Math.PI / 2, side > 0 ? Math.PI * 1.5 : Math.PI / 2); g.stroke();
  }
  g.fillStyle = '#173a50'; g.beginPath(); g.arc(X(0), Y(0), 1.55 * ppm, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#faf1d5'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic bold 52px Arial';
  g.fillText('FI', X(0), Y(0));
  return courtSurface(canvas, L + 2 * margin, W + 2 * margin, renderer, 0.5);
}

/** Canestro: palo dietro la linea di fondo, braccio, tabellone trasparente, ferro arancione e retina. */
function hoop(side: 1 | -1) {
  const P = CONFIG.pitch;
  const g = new THREE.Group();
  const rim = P.rimHeight;
  const boardX = L / 2 - 1.2;
  const hx = L / 2 - P.hoopFromBaseline;
  const grey = new THREE.MeshStandardMaterial({ color: 0x657888, roughness: 0.38, metalness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, rim + 0.6, 12), grey);
  pole.position.set(L / 2 + 1.2, (rim + 0.6) / 2, 0);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 12).rotateZ(Math.PI / 2), grey);
  arm.position.set(L / 2, rim + 0.5, 0);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 1.2), new THREE.MeshLambertMaterial({ color: 0x1f3d7a }));
  pad.position.set(L / 2 + 1.2, 0.7, 0);
  const brace = rod(new THREE.Vector3(L / 2 + 1.2, rim - 0.8, 0), new THREE.Vector3(boardX, rim + 0.5, 0), 0.055, grey);

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
  g.add(pole, arm, brace, pad, board, edge, square, ring, net);
  if (side < 0) g.rotation.y = Math.PI;
  return g;
}

function ground() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: SPORT === 'calcio' ? 0x1d3a31 : 0x243a46, roughness: 1 }));
  m.receiveShadow = true;
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
  const mesh = new THREE.Mesh(mergeGeometries(boxes), new THREE.MeshStandardMaterial({ color: 0x333f50, roughness: 0.92 }));
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

function stadiumSeats(rows: SeatRow[]) {
  const positions: { point: THREE.Vector3; facing: number; index: number }[] = [];
  for (const row of rows) {
    const count = Math.floor(row.from.distanceTo(row.to) / CONFIG.crowd.spacing);
    for (let i = 0; i <= count; i++) positions.push({ point: new THREE.Vector3().lerpVectors(row.from, row.to, i / count), facing: row.facing, index: i });
  }
  const cushion = new RoundedBoxGeometry(0.44, 0.055, 0.5, 1, 0.022).translate(-0.03, 0.05, 0);
  const back = new RoundedBoxGeometry(0.065, 0.38, 0.5, 1, 0.022).translate(-0.23, 0.27, 0);
  const seats = new THREE.InstancedMesh(mergeGeometries([cushion, back])!,
    new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }), positions.length);
  cushion.dispose(); back.dispose();
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  positions.forEach(({ point, facing, index }, i) => {
    dummy.position.copy(point); dummy.rotation.y = facing; dummy.updateMatrix(); seats.setMatrixAt(i, dummy.matrix);
    seats.setColorAt(i, color.setHex(index % 9 < 2 ? 0x7395a7 : index % 2 ? 0x254a64 : 0x315e78));
  });
  return seats;
}

/** A curved canopy and slender steel supports give the venue a distinct silhouette. */
function grandstandRoof() {
  const group = new THREE.Group();
  const front = W / 2 + 5, depth = CONFIG.crowd.rowsFar * 0.9 + 3;
  const height = 3.4 + CONFIG.crowd.rowsFar * 0.5;
  const roof = new THREE.PlaneGeometry(L + 18, depth, 12, 8).rotateX(-Math.PI / 2);
  const positions = roof.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const progress = (positions.getZ(i) + depth / 2) / depth;
    positions.setY(i, height + Math.sin(progress * Math.PI) * 0.65 + progress * 0.5);
    positions.setZ(i, -front - progress * depth);
  }
  roof.computeVertexNormals();
  group.add(new THREE.Mesh(roof, new THREE.MeshStandardMaterial({ color: 0x68849a, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide })));
  const steel = new THREE.MeshStandardMaterial({ color: 0x566b7c, roughness: 0.4, metalness: 0.65 });
  const supports: THREE.BufferGeometry[] = [];
  for (let x = -(L + 14) / 2; x <= (L + 14) / 2 + 0.1; x += (L + 14) / 6) {
    const pole = rod(new THREE.Vector3(x, 0, -front - depth + 0.5), new THREE.Vector3(x, height + 0.5, -front - depth + 0.5), 0.09, steel);
    pole.updateMatrix(); supports.push(pole.geometry.applyMatrix4(pole.matrix));
    const beam = rod(new THREE.Vector3(x, height + 0.5, -front - depth + 0.5), new THREE.Vector3(x, height, -front), 0.065, steel);
    beam.updateMatrix(); supports.push(beam.geometry.applyMatrix4(beam.matrix));
  }
  group.add(new THREE.Mesh(mergeGeometries(supports)!, steel)); supports.forEach(geometry => geometry.dispose());
  const strip = new THREE.Mesh(new THREE.BoxGeometry(L + 18, 0.045, 0.06), new THREE.MeshBasicMaterial({ color: 0xa4d9ee }));
  strip.position.set(0, height, -front); group.add(strip);
  return group;
}

function venueDetails() {
  const group = new THREE.Group();
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(L + 12, W + 10).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x334752, roughness: 0.95 }));
  apron.position.y = -0.025; apron.receiveShadow = true; group.add(apron);
  const metal = new THREE.MeshStandardMaterial({ color: 0x748a9a, roughness: 0.38, metalness: 0.6 });
  const benchWidth = Math.min(5, L * 0.25);
  for (const side of [-1, 1]) {
    const x = side * L * 0.3, z = -W / 2 - 4;
    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, benchWidth, 3, 12).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: CONFIG.teams[side < 0 ? 0 : 1].shirt, roughness: 0.65 }));
    seat.scale.z = 2; seat.position.set(x, 0.5, z); group.add(seat);
    for (const offset of [-benchWidth * 0.35, benchWidth * 0.35]) {
      group.add(rod(new THREE.Vector3(x + offset, 0, z), new THREE.Vector3(x + offset, 0.5, z), 0.06, metal));
    }
    if (SPORT === 'calcio') {
      const shelter = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, benchWidth + 0.6, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x8bb1c8, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      shelter.rotation.x = Math.PI / 2; shelter.position.set(x, 1.05, z); group.add(shelter);
    }
  }
  return group;
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
