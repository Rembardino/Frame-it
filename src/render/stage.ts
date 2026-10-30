/**
 * Scenografia statica: renderer, luci, cielo serale con stelle, campo, porte, tribune, cartelloni, torri faro.
 * Materiali procedurali, illuminazione morbida e tribune generate nel codice.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG, SPORT } from '../config';
import type { Match } from '../sim/match';
import { sportCourt } from './sportCourts';
import { courtSurface, surfaceGrain, rod, reliefTile } from './surfaces';
import { golfCourse } from './golf';
import { cyclingWorld } from './cycling';
import { sailingWorld } from './sailing';
import { FaunaViews } from './fauna';

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
  scene.background = new THREE.Color(0x121f33);
  scene.fog = new THREE.Fog(0x1a2638, 90, 330);

  const camera = new THREE.PerspectiveCamera(CONFIG.camera.startFov, 1, 0.1, 1000);
  // Gli sport col drone hanno un mondo loro, all'aperto e di giorno: niente stadio.
  if (SPORT === 'golf') return { renderer, scene, camera, ...golfCourse(renderer, scene, camera) };
  if (SPORT === 'ciclismo') return { renderer, scene, camera, ...cyclingWorld(renderer, scene, camera) };
  if (SPORT === 'vela') return { renderer, scene, camera, ...sailingWorld(renderer, scene, camera) };

  // Sera allo stadio: cielo freddo dall'alto, fari caldi incrociati da due torri (ombre dalla principale).
  scene.add(new THREE.HemisphereLight(0xaec6ea, 0x3b4a3d, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
  sun.position.set(-L * 0.3, Math.max(18, L * 0.65), W * 0.65);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(CONFIG.render.shadowMapSize);
  sun.shadow.camera.left = -L * 0.68; sun.shadow.camera.right = L * 0.68;
  sun.shadow.camera.top = Math.max(W, L) * 0.65; sun.shadow.camera.bottom = -Math.max(W, L) * 0.65;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 150;
  sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.0002;
  sun.shadow.intensity = 0.5;
  sun.shadow.radius = 3;
  const cross = new THREE.DirectionalLight(0xffe4c0, 0.9);
  cross.position.set(L * 0.35, Math.max(16, L * 0.5), -W * 0.7);
  const rim = new THREE.DirectionalLight(0x8fb8ff, 1.1);
  rim.position.set(L * 0.4, 16, -W);
  scene.add(sun, cross, rim);
  if (SPORT === 'boxe') {
    // Palazzetto: platea in penombra, ring sotto un riflettore caldo.
    const spot = new THREE.SpotLight(0xfff1dc, 380, 45, 0.5, 0.6, 1.4);
    spot.position.set(0, 14, 2); spot.target.position.set(0, 0, 0);
    scene.add(spot, spot.target);
    scene.children.filter((c): c is THREE.HemisphereLight => c instanceof THREE.HemisphereLight).forEach(h => { h.intensity = 0.8; });
    cross.intensity = 0.5;
  }

  const boards = adBoards();
  const screen = bigScreen();
  scene.add(sky(), stars(), clouds(), moon(), ground(), floodlights(), boards.group, screen.group, venueDetails(), broadcastGear());
  if (SPORT === 'basket') scene.add(court(renderer), hoop(1), hoop(-1));
  else if (SPORT === 'boxe' || SPORT === 'tennis' || SPORT === 'pallavolo') scene.add(sportCourt(renderer));
  else scene.add(pitch(renderer), goal(1), goal(-1), cornerFlags());
  const { mesh: stands, rows: seatRows } = standsAndSeats();
  scene.add(stands);
  scene.add(stadiumSeats(seatRows), grandstandRoof());

  // Animali dei momenti segreti (il gabbiano in tribuna, il cane a bordo campo).
  const fauna = new FaunaViews(scene);
  const update = (match: Match) => { fauna.update(match); boards.update(match.time); screen.update(match); };
  return { renderer, scene, camera, seatRows, update: update as ((match: Match) => void) | undefined };
}

// ------------------------------------------------------------------ cielo

function sky() {
  const geo = new THREE.SphereGeometry(450, 32, 16);
  const pos = geo.attributes.position;
  const colors: number[] = [];
  const zenith = new THREE.Color(0x070f24);
  const mid = new THREE.Color(0x1f3a5c);
  const haze = new THREE.Color(0x6d7f99); // foschia illuminata dalla cittÃ  e dai fari
  const horizon = new THREE.Color(0xd99a6c); // ultimo bagliore del tramonto
  const below = new THREE.Color(0x0e1522);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 450;
    if (y < 0) c.copy(below);
    else if (y < 0.05) c.lerpColors(horizon, haze, y / 0.05);
    else if (y < 0.18) c.lerpColors(haze, mid, (y - 0.05) / 0.13);
    else c.lerpColors(mid, zenith, Math.min(1, (y - 0.18) / 0.5));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

/** Velature sottili: macchie morbide su un disco alto, tinte dal bagliore della cittÃ . */
function clouds() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  let seed = 7;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 90; i++) {
    const x = random() * 512, y = random() * 512, r = 30 + random() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + random() * 0.07;
    grd.addColorStop(0, `rgba(190,170,175,${a})`); grd.addColorStop(1, 'rgba(190,170,175,0)');
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, r * (1.6 + random()), r * 0.5, random() * 0.6, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  mesh.position.y = 170;
  return mesh;
}

function moon() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf2eedd, fog: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('230,228,210'), color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.setScalar(60);
  g.add(disc, halo);
  g.position.set(-180, 140, -330);
  return g;
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
  const ppm = 30; // pixel di texture per metro
  const cw = (L + 2 * margin) * ppm;
  const ch = (W + 2 * margin) * ppm;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d')!;
  const X = (x: number) => (x + L / 2 + margin) * ppm;
  const Y = (z: number) => (z + W / 2 + margin) * ppm;

  // Strisce del taglio dell'erba, con un secondo taglio incrociato piÃ¹ tenue (effetto a scacchi dei campi veri).
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#2f6b42' : '#3a7d4b';
    g.fillRect((i * cw) / stripes, 0, cw / stripes + 1, ch);
  }
  const cross = 8;
  for (let i = 0; i < cross; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
    g.fillRect(0, (i * ch) / cross, cw, ch / cross + 1);
  }
  grassBlades(g, 0.1);
  surfaceGrain(g, 0.05);
  // Fuori dal rettangolo di gioco l'erba Ã¨ meno curata: piÃ¹ scura e irregolare.
  g.save(); g.beginPath(); g.rect(0, 0, cw, ch); g.rect(X(-L / 2), Y(-W / 2), L * ppm, W * ppm); g.clip('evenodd');
  g.fillStyle = 'rgba(20,40,20,0.22)'; g.fillRect(0, 0, cw, ch); g.restore();
  const shade = g.createLinearGradient(0, 0, 0, ch);
  shade.addColorStop(0, 'rgba(5,29,24,0.2)'); shade.addColorStop(1, 'rgba(142,185,87,0.06)');
  g.fillStyle = shade; g.fillRect(0, 0, cw, ch);
  // Usura: aree di porta, dischetto, centrocampo.
  const wear = (x: number, z: number, rx: number, rz: number, a: number) => {
    g.save(); g.translate(X(x), Y(z)); g.scale(rx * ppm, rz * ppm);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grd.addColorStop(0, `rgba(118,96,58,${a})`); grd.addColorStop(0.6, `rgba(118,96,58,${a * 0.5})`); grd.addColorStop(1, 'rgba(118,96,58,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
  };
  for (const side of [-1, 1]) {
    wear(side * (L / 2 - 1.2), 0, 4.5, 4.2, 0.42);
    wear(side * (L / 2 - 0.15 * L), 0, 1.6, 1.3, 0.3);
  }
  wear(0, 0, 3.2, 2.8, 0.26);

  g.strokeStyle = g.fillStyle = 'rgba(248,250,245,0.86)';
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
  // La vernice si posa sui fili d'erba: una grana leggera la rende meno "stampata".
  surfaceGrain(g, 0.03, 29);
  return courtSurface(canvas, L + 2 * margin, W + 2 * margin, renderer, 0.9, { canvas: reliefTile('grass'), scale: 0.012 });
}

/** Fili d'erba: tratti corti e inclinati, toni di verde diversi, ripetuti con un pattern. */
function grassBlades(ctx: CanvasRenderingContext2D, strength: number) {
  const tile = document.createElement('canvas'); tile.width = tile.height = 192;
  const g = tile.getContext('2d')!;
  let value = 101;
  const random = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  for (let i = 0; i < 4200; i++) {
    const light = random() > 0.5;
    g.strokeStyle = light ? `rgba(170,230,120,${strength})` : `rgba(10,50,20,${strength * 1.1})`;
    g.lineWidth = 1;
    const x = random() * 192, y = random() * 192, dx = (random() - 0.5) * 2, dy = 2 + random() * 4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y - dy); g.stroke();
  }
  ctx.save(); ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
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
  // Parquet: listoni lungo il campo, toni variati, venature e giunti sfalsati.
  const plank = 0.6;
  let seed = 3;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let z = -W / 2, i = 0; z < W / 2; z += plank, i++) {
    const h = Math.min(plank, W / 2 - z) * ppm + 1;
    for (let x = -L / 2 - (i % 3) * 1.2; x < L / 2; x += 3.6) {
      const l = 0.85 + random() * 0.3;
      g.fillStyle = `rgb(${Math.round(205 * l)},${Math.round(158 * l)},${Math.round(104 * l)})`;
      const x0 = Math.max(-L / 2, x), x1 = Math.min(L / 2, x + 3.6);
      g.fillRect(X(x0), Y(z), (x1 - x0) * ppm + 1, h);
      g.strokeStyle = 'rgba(91,52,24,0.28)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(x1), Y(z)); g.lineTo(X(x1), Y(Math.min(W / 2, z + plank))); g.stroke();
      // Venatura: una linea ondulata chiara per asse.
      g.strokeStyle = 'rgba(255,235,200,0.12)';
      g.beginPath(); g.moveTo(X(x0), Y(z + plank * (0.3 + random() * 0.4)));
      g.bezierCurveTo(X(x0 + 1.2), Y(z + plank * random()), X(x1 - 1.2), Y(z + plank * random()), X(x1), Y(z + plank * (0.3 + random() * 0.4))); g.stroke();
    }
    g.strokeStyle = 'rgba(91,52,24,0.22)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(-L / 2), Y(z)); g.lineTo(X(L / 2), Y(z)); g.stroke();
  }
  surfaceGrain(g, 0.05);
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
  // Parquet lucidato: le linee e la vernice riflettono i fari.
  return courtSurface(canvas, L + 2 * margin, W + 2 * margin, renderer, 0.38, { canvas: reliefTile('wood'), scale: 0.004 });
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
  const stairs: THREE.BufferGeometry[] = [];
  const rails: THREE.BufferGeometry[] = [];
  const rows: SeatRow[] = [];
  const { rowsFar, rowsEnd } = CONFIG.crowd;
  const aisle = 1.1;
  const up = new THREE.Vector3(0, 1, 0);

  /** Spezza una fila in settori lasciando i corridoi delle scale, e disegna i gradini chiari nel vuoto. */
  const sectors = (from: THREE.Vector3, to: THREE.Vector3, facing: number, team: number, splits: number, top: number) => {
    const length = from.distanceTo(to);
    const dir = to.clone().sub(from).normalize();
    const n = splits + 1, span = (length - splits * aisle) / n;
    for (let i = 0; i < n; i++) {
      const a = from.clone().addScaledVector(dir, i * (span + aisle));
      rows.push({ from: a, to: a.clone().addScaledVector(dir, span), facing, team });
      if (i < n - 1) {
        const c = a.clone().addScaledVector(dir, span + aisle / 2);
        const tread = new THREE.BoxGeometry(aisle - 0.1, 0.06, step).translate(0, 0.03, 0);
        tread.rotateY(-Math.atan2(dir.z, dir.x));
        stairs.push(tread.translate(c.x, top, c.z));
      }
    }
  };
  const railing = (from: THREE.Vector3, to: THREE.Vector3, y: number) => {
    const dir = to.clone().sub(from); const length = dir.length(); dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    rails.push(new THREE.CylinderGeometry(0.025, 0.025, length, 6).applyQuaternion(q).translate((from.x + to.x) / 2, y + 1, (from.z + to.z) / 2));
    for (let d = 0; d <= length + 0.01; d += 3) {
      const p = from.clone().addScaledVector(dir, Math.min(d, length));
      rails.push(new THREE.CylinderGeometry(0.02, 0.02, 1, 6).translate(p.x, y + 0.5, p.z));
    }
  };

  // Tribuna lunga di fronte alla camera.
  const farFront = W / 2 + 6;
  const farLen = L + 16;
  for (let i = 0; i < rowsFar; i++) {
    const top = 0.6 + i * rise;
    const z = -(farFront + i * step + step / 2);
    boxes.push(new THREE.BoxGeometry(farLen, top, step).translate(0, top / 2, z));
    sectors(new THREE.Vector3(-farLen / 2 + 1, top, z), new THREE.Vector3(farLen / 2 - 1, top, z), -Math.PI / 2, -1, 4, top);
  }
  railing(new THREE.Vector3(-farLen / 2, 0.6, -farFront), new THREE.Vector3(farLen / 2, 0.6, -farFront), 0.6);
  // Muro di fondo e corridoio dietro l'ultima fila.
  const farBack = farFront + rowsFar * step;
  const farTop = 0.6 + (rowsFar - 1) * rise;
  boxes.push(new THREE.BoxGeometry(farLen, farTop + 0.3, 1.6).translate(0, (farTop + 0.3) / 2, -(farBack + 0.8)));
  boxes.push(new THREE.BoxGeometry(farLen, 2.2, 0.25).translate(0, farTop + 1.1, -(farBack + 1.6)));
  // Curve dietro le porte: casa a sinistra, ospiti a destra.
  const endFront = L / 2 + 6;
  const endLen = W + 4;
  for (const side of [-1, 1]) {
    for (let i = 0; i < rowsEnd; i++) {
      const top = 0.6 + i * rise;
      const x = side * (endFront + i * step + step / 2);
      boxes.push(new THREE.BoxGeometry(step, top, endLen).translate(x, top / 2, 0));
      sectors(new THREE.Vector3(x, top, -endLen / 2 + 1), new THREE.Vector3(x, top, endLen / 2 - 1), side > 0 ? Math.PI : 0, side < 0 ? 0 : 1, 2, top);
    }
    railing(new THREE.Vector3(side * endFront, 0.6, -endLen / 2), new THREE.Vector3(side * endFront, 0.6, endLen / 2), 0.6);
    const endBack = endFront + rowsEnd * step, endTop = 0.6 + (rowsEnd - 1) * rise;
    boxes.push(new THREE.BoxGeometry(1.6, endTop + 0.3, endLen).translate(side * (endBack + 0.8), (endTop + 0.3) / 2, 0));
    boxes.push(new THREE.BoxGeometry(0.25, 2.2, endLen).translate(side * (endBack + 1.6), endTop + 1.1, 0));
  }
  const group = new THREE.Group();
  const concrete = new THREE.Mesh(mergeGeometries(boxes)!, new THREE.MeshStandardMaterial({ color: 0x2b3442, roughness: 0.95 }));
  concrete.receiveShadow = true;
  group.add(concrete);
  group.add(new THREE.Mesh(mergeGeometries(stairs)!, new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.9 })));
  group.add(new THREE.Mesh(mergeGeometries(rails)!, new THREE.MeshStandardMaterial({ color: 0xb9c3cc, roughness: 0.35, metalness: 0.7 })));
  boxes.forEach(b => b.dispose()); stairs.forEach(s => s.dispose()); rails.forEach(r => r.dispose());
  return { mesh: group, rows };
}

/** Cartelloni LED: la scritta scorre come sui bordi campo veri, con un'alternanza di colori. */
function adBoards() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const panels = [['#0c1020', '#ffd23f', 'FRAME IT'], ['#102a43', '#4fd1ff', 'LIVE SPORTS TV'], ['#1b1b1b', '#ffffff', 'FRAME IT'], ['#2a0c3a', '#ff7bd5', 'LIVE SPORTS TV']];
  panels.forEach(([bg, fg, text], i) => {
    g.fillStyle = bg; g.fillRect(i * 256, 0, 256, 64);
    g.font = 'bold 38px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillStyle = fg; g.fillText(text, i * 256 + 128, 34);
  });
  // Griglia dei LED.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < 1024; x += 3) g.fillRect(x, 0, 1, 64);
  for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 1024, 1);

  const textures: THREE.CanvasTexture[] = [];
  const casing = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.8 });
  const board = (len: number, x: number, z: number, rotY: number) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(len / 16, 1);
    textures.push(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, 0.5, z);
    m.rotation.y = rotY;
    m.rotation.x = -0.12;
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.95, 0.12), casing);
    back.position.set(0, 0, -0.07); m.add(back);
    return m;
  };
  const group = new THREE.Group();
  group.add(board(L + 10, 0, -(W / 2 + 3), 0));
  group.add(board(W + 6, -(L / 2 + 3), 0, Math.PI / 2));
  group.add(board(W + 6, L / 2 + 3, 0, -Math.PI / 2));
  return { group, update: (time: number) => { for (const t of textures) t.offset.x = -time * 0.045; } };
}

/** Maxischermo sopra la tribuna: squadre, punteggio e minuto, ridisegnati solo quando cambiano. */
function bigScreen() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const width = Math.min(14, L * 0.22), height = width / 2;
  const top = 3.4 + CONFIG.crowd.rowsFar * 0.5;
  const z = -(W / 2 + 6 + CONFIG.crowd.rowsFar * 0.9 + 1.2);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }));
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, height + 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1f27, roughness: 0.6, metalness: 0.3 }));
  frame.position.z = -0.3;
  group.add(panel, frame);
  for (const x of [-width * 0.4, width * 0.4]) group.add(rod(new THREE.Vector3(x, -height / 2 - 2.2, -0.3), new THREE.Vector3(x, -height / 2, -0.3), 0.12, frame.material));
  group.position.set(-L * 0.22, top + height / 2 + 2.6, z);
  group.rotation.x = -0.08;
  let shown = '';
  const colour = (c: number) => '#' + c.toString(16).padStart(6, '0');
  const update = (match: Match) => {
    const mins = Math.min(CONFIG.match.clockMinutes, Math.floor((match.clock / CONFIG.match.durationSec) * CONFIG.match.clockMinutes));
    const key = `${match.score[0]}-${match.score[1]}-${mins}`;
    if (key === shown) return;
    shown = key;
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#0b1220'; ctx.fillRect(12, 12, 488, 232);
    CONFIG.teams.forEach((team, i) => {
      const x = i ? 300 : 24;
      ctx.fillStyle = colour(team.shirt); ctx.fillRect(x, 60, 188, 70);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 44px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(team.short, x + 94, 96);
      ctx.font = 'bold 96px system-ui, sans-serif'; ctx.fillText(String(match.score[i]), x + 94, 190);
    });
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 40px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${mins}'`, 256, 96);
    ctx.fillStyle = '#4fd1ff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.fillText('FRAME IT Â· LIVE', 256, 36);
    // Griglia dei LED.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let x = 0; x < 512; x += 4) ctx.fillRect(x, 0, 1, 256);
    for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 512, 1);
    texture.needsUpdate = true;
  };
  return { group, update };
}

/** Torri faro: traliccio, griglia di proiettori, alone e cono di luce nella foschia verso il campo. */
function floodlights() {
  const g = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.3, 0.55, 26, 8).translate(0, 13, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x7d858f, roughness: 0.5, metalness: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
  const glowMat = new THREE.SpriteMaterial({ map: radialTexture(), color: 0xfff1c4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.9 });
  // Griglia 4Ã—3 di proiettori su un telaio.
  const lamps: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) lamps.push(new THREE.BoxGeometry(0.75, 0.5, 0.3).translate(-1.4 + i * 0.93, -0.6 + j * 0.6, 0));
  const lampGeo = mergeGeometries(lamps)!; lamps.forEach(l => l.dispose());
  const frameGeo = new THREE.BoxGeometry(4.2, 2.1, 0.12).translate(0, 0, -0.2);
  // Cono di luce: luminoso alla sorgente, nero (invisibile) a terra, in additivo. Solo dalle torri di fronte alla
  // camera: quelle alle sue spalle lo proietterebbero attraverso l'obiettivo, sbiancando tutta l'inquadratura.
  const cone = new THREE.CylinderGeometry(0.5, 8, 1, 24, 1, true).translate(0, -0.5, 0);
  const colors = new Float32Array(cone.attributes.position.count * 3);
  for (let i = 0; i < cone.attributes.position.count; i++) {
    const k = cone.attributes.position.getY(i) > -0.5 ? 0.04 : 0;
    colors[i * 3] = k; colors[i * 3 + 1] = k * 0.95; colors[i * 3 + 2] = k * 0.8;
  }
  cone.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const coneMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const target = new THREE.Vector3(0, 0, 0);
  for (const x of [-(L / 2 + 10), L / 2 + 10]) {
    for (const z of [-(W / 2 + 14), W / 2 + 12]) {
      const pole = new THREE.Mesh(poleGeo, steel);
      pole.position.set(x, 0, z);
      const head = new THREE.Group();
      head.position.set(x, 26.5, z);
      head.lookAt(target);
      head.add(new THREE.Mesh(lampGeo, lampMat), new THREE.Mesh(frameGeo, steel));
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(head.position);
      glow.scale.setScalar(18);
      g.add(pole, head, glow);
      if (z > 0) continue;
      const beam = new THREE.Mesh(cone, coneMat);
      beam.position.copy(head.position);
      const dir = target.clone().sub(head.position);
      beam.scale.y = dir.length();
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      g.add(beam);
    }
  }
  return g;
}

/** Postazioni TV sulla tribuna: telecamera su treppiede con il cameraman di spalle, come nelle riprese vere. */
function broadcastGear() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.55, metalness: 0.4 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x0b1a2a, roughness: 0.15, metalness: 0.8 });
  const front = W / 2 + 6, rows = CONFIG.crowd.rowsFar;
  const z = -(front + rows * 0.9 + 0.8), y = 0.6 + (rows - 1) * 0.5 + 0.3;
  for (const x of [-L * 0.08, L * 0.08]) {
    const tripod = new THREE.Group();
    for (const [dx, dz] of [[-0.3, 0.25], [0.3, 0.25], [0, -0.35]]) tripod.add(rod(new THREE.Vector3(x + dx, y, z + dz), new THREE.Vector3(x, y + 1.3, z), 0.025, dark));
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.75), dark);
    body.position.set(x, y + 1.5, z); body.lookAt(0, 0.5, 0);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.45, 12).rotateX(Math.PI / 2), lens);
    tube.position.copy(body.position).add(new THREE.Vector3(0, 0.02, 0.55).applyQuaternion(body.quaternion));
    tube.quaternion.copy(body.quaternion);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.02), new THREE.MeshBasicMaterial({ color: 0x8fd9ff }));
    monitor.position.copy(body.position).add(new THREE.Vector3(0.2, 0.22, -0.3).applyQuaternion(body.quaternion));
    monitor.quaternion.copy(body.quaternion);
    g.add(tripod, body, tube, monitor);
  }
  return g;
}

export function stadiumSeats(rows: SeatRow[]) {
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
