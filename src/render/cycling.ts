/**
 * La tappa di ciclismo: campi a scacchiera (grano, erba medica, terra arata, girasoli), il fiume col ponte,
 * il paese con la chiesa e la gente ai lati, il bosco, il rettilineo d'arrivo con transenne, tribuna e striscione.
 * Le forme vengono da sim/sports/cyclingRoute.ts; cielo, luce, animali ed effetti da render/outdoor.ts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BARRIERS, BRIDGE_S, FIELDS, FINISH_S, HOUSES, LENGTH, LINE, LINE_S, PASTURE, RIVER, RIVER_BANK, ROAD, ROAD_EDGE, ROAD_HALF, TREES, VILLAGE, roadAt, roadDir,
} from '../sim/sports/cyclingRoute';
import { strip } from '../sim/sports/shapes';
import { stadiumSeats, type SeatRow } from './stage';
import { canvasTexture, createOutdoor, forest, layer, surfaceMaterial as mat, textCanvas, turf } from './outdoor';
import { t } from '../i18n';

/** Un parallelepipedo orientato lungo la strada (dir = angolo) con i suoi colori per vertice. */
function block(w: number, h: number, d: number, x: number, y: number, z: number, angle: number, color: number) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().rotateY(-angle).translate(x, y, z);
  const c = new THREE.Color(color), values = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) { values[i] = c.r; values[i + 1] = c.g; values[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return g;
}
const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

export function cyclingWorld(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const world = createOutdoor(renderer, scene, camera, '#4f7a3a');
  // ---------------------------------------------------------------- campi, fiume, strada
  const crops = [
    turf(renderer, '#c9a94a', '#d6b85a', 16, 0.08, 21),   // grano
    turf(renderer, '#5f9a3e', '#6ba648', 10, 0.07, 22),   // erba medica
    turf(renderer, '#7a5a3c', '#6b4c31', 20, 0.1, 23),    // terra arata
    canvasTexture(textCanvas(256, 256, (g) => {           // girasoli: file di puntini gialli
      g.fillStyle = '#4c6e2c'; g.fillRect(0, 0, 256, 256);
      for (let y = 8; y < 256; y += 16) for (let x = 6; x < 256; x += 12) { g.fillStyle = '#f2c230'; g.beginPath(); g.arc(x + (y % 32 ? 6 : 0), y, 4.5, 0, Math.PI * 2); g.fill(); }
    }), renderer),
  ];
  crops.forEach((tex, k) => scene.add(layer(FIELDS.filter((f) => f.crop === k).map((f) => f.poly), mat(tex), k === 3 ? 6 : 14, 1)));
  const asphalt = turf(renderer, '#4a4d52', null, 0, 0.12, 24);
  scene.add(
    layer([PASTURE], mat(world.rough, 0xc8e6a8), 9, 2),
    layer([RIVER_BANK], mat(world.rough, 0x8a9a6a), 9, 3),
    layer([RIVER], world.water(0x3d7488), 10, 4),
    layer([ROAD_EDGE], mat(turf(renderer, '#9c9384', null, 0, 0.12, 25)), 4, 5),
    layer([ROAD], mat(asphalt, 0xffffff, 0.9), 6, 6),
  );
  // Linea di mezzeria tratteggiata, linee continue ai bordi e linea d'arrivo.
  const dashes = [];
  for (let s = 4; s < LENGTH - 4; s += 9) dashes.push(strip(LINE, LINE_S, s, s + 4, () => 0.07));
  for (const side of [-1, 1]) {
    const edge = LINE.map((p, k) => { const d = roadDir(LINE_S[k]); return p.clone().add(new THREE.Vector3(-d.z * side * (ROAD_HALF - 0.3), 0, d.x * side * (ROAD_HALF - 0.3))); });
    dashes.push(strip(edge, LINE_S, 0, LENGTH, () => 0.07));
  }
  scene.add(layer(dashes, mat(turf(renderer, '#f4f4f0', null, 0, 0.02, 26)), 2, 7));
  scene.add(layer([strip(LINE, LINE_S, FINISH_S - 0.35, FINISH_S + 0.35, () => ROAD_HALF)], mat(turf(renderer, '#ffffff', null, 0, 0.02, 27)), 2, 8));
  forest(scene, TREES);

  // ---------------------------------------------------------------- ponte, case, chiesa
  const parts: THREE.BufferGeometry[] = [];
  const bp = roadAt(BRIDGE_S), bd = roadDir(BRIDGE_S), ba = Math.atan2(bd.z, bd.x);
  for (const side of [-1, 1]) parts.push(block(36, 0.9, 0.5, bp.x - bd.z * side * (ROAD_HALF + 0.4), 0.45, bp.z + bd.x * side * (ROAD_HALF + 0.4), ba, 0xb9ad98));
  parts.push(block(30, 2.2, ROAD_HALF * 2 + 1.4, bp.x, -1.2, bp.z, ba, 0xa89c86));
  for (const [x, z, a, w, d, floors] of HOUSES) {
    const h = 3 + floors * 2.8, wall = [0xe9d8b4, 0xf0c9a0, 0xe7e2d6, 0xd9b38c, 0xf2e3c2][Math.floor((x * 7 + z * 3) % 5 + 5) % 5];
    parts.push(block(w, h, d, x, h / 2, z, a, wall));
    // Tetto a falde: due lastre inclinate di coppi.
    for (const s of [-1, 1]) {
      const g = block(w + 0.6, 0.25, d * 0.58, 0, 0, s * d * 0.25, 0, 0xa8553a).rotateX(s * 0.5).rotateY(-a).translate(x, h + d * 0.14, z);
      parts.push(g);
    }
    // Finestre scure sui due lati lunghi.
    for (let k = -1; k <= 1; k += 2) for (const s of [-1, 1]) parts.push(block(1.1, 1.3, 0.1, 0, 0, 0, 0, 0x34404a).translate(k * w * 0.25, 0, s * (d / 2 + 0.03)).rotateY(-a).translate(x, h - 1.8, z));
  }
  const mid = roadAt((VILLAGE[0] + VILLAGE[1]) / 2), md = roadDir((VILLAGE[0] + VILLAGE[1]) / 2), ma = Math.atan2(md.z, md.x);
  const church = mid.clone().add(new THREE.Vector3(-md.z * 22, 0, md.x * 22));
  parts.push(block(18, 9, 10, church.x, 4.5, church.z, ma, 0xeadfc8), block(4.5, 24, 4.5, church.x + md.x * 9, 12, church.z + md.z * 9, ma, 0xe2d4b8),
    block(5, 4, 5, church.x + md.x * 9, 26, church.z + md.z * 9, ma, 0xa8553a));
  // Transenne del rettilineo d'arrivo.
  for (let s = BARRIERS[0]; s < BARRIERS[1] - 2; s += 2.5) {
    const p = roadAt(s), d = roadDir(s), a = Math.atan2(d.z, d.x);
    for (const side of [-1, 1]) parts.push(block(2.4, 1.1, 0.08, p.x - d.z * side * (ROAD_HALF + 0.6), 0.55, p.z + d.x * side * (ROAD_HALF + 0.6), a, s % 5 < 2.5 ? 0xf4f4f0 : 0x2f6fde));
  }
  const town = new THREE.Mesh(mergeGeometries(parts)!, painted);
  town.castShadow = town.receiveShadow = true;
  scene.add(town);

  // ---------------------------------------------------------------- pubblico: ai lati nel paese e all'arrivo, tribuna
  const rows: SeatRow[] = [], benches: THREE.BufferGeometry[] = [];
  const crowdAlong = (s0: number, s1: number, off: number) => {
    for (let s = s0; s < s1; s += 12) for (const side of [-1, 1]) {
      const p = roadAt(s + 6), d = roadDir(s + 6), n = new THREE.Vector3(-d.z * side, 0, d.x * side), at = p.clone().addScaledVector(n, off);
      rows.push({ from: at.clone().addScaledVector(d, -5).setY(0.55), to: at.clone().addScaledVector(d, 5).setY(0.55), facing: -Math.atan2(-n.z, -n.x), team: -1 });
      benches.push(block(11, 0.55, 0.7, at.x, 0.27, at.z, Math.atan2(d.z, d.x), 0x8a7a64));
    }
  };
  crowdAlong(VILLAGE[0] + 20, VILLAGE[1] - 20, ROAD_HALF + 1.6);
  crowdAlong(BARRIERS[0] + 10, FINISH_S - 30, ROAD_HALF + 1.6);
  const fp = roadAt(FINISH_S), fd = roadDir(FINISH_S), fa = Math.atan2(fd.z, fd.x), fn = new THREE.Vector3(fd.z, 0, -fd.x);
  const stand: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const top = 0.6 + i * 0.5, c = fp.clone().addScaledVector(fn, ROAD_HALF + 3 + i * 0.9);
    stand.push(block(40, top, 0.9, c.x, top / 2, c.z, fa, 0xdfe3e6));
    rows.push({ from: c.clone().addScaledVector(fd, -19).setY(top), to: c.clone().addScaledVector(fd, 19).setY(top), facing: -Math.atan2(-fn.z, -fn.x), team: -1 });
  }
  scene.add(new THREE.Mesh(mergeGeometries([...benches, ...stand])!, painted), stadiumSeats(rows.slice(-5)));

  // ---------------------------------------------------------------- striscione d'arrivo e flamme rouge
  const banner = (s: number, text: string, bg: string, fg: string) => {
    const p = roadAt(s), d = roadDir(s), n = new THREE.Vector3(-d.z, 0, d.x), a = Math.atan2(d.z, d.x);
    const tex = canvasTexture(textCanvas(512, 96, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 512, 96); g.fillStyle = fg; g.font = 'bold 60px Arial'; g.fillText(text, 256, 52, 490); }), renderer, false);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, ROAD_HALF * 2 + 3), [0, 1, 2, 3, 4, 5].map((k) => k < 2 ? new THREE.MeshStandardMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ color: 0x2b2f36 })));
    top.position.copy(p).setY(5.6); top.rotation.y = -a;
    scene.add(top);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.4, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f36 }));
      pole.position.copy(p).addScaledVector(n, side * (ROAD_HALF + 1.6)).setY(3.2);
      scene.add(pole);
    }
  };
  banner(FINISH_S, `${t('ARRIVO')} · FRAME IT`, '#d92f3a', '#ffffff');
  banner(FINISH_S - 1000, t('ULTIMO KM'), '#e0352b', '#ffffff');

  return { seatRows: rows, update: world.update };
}
