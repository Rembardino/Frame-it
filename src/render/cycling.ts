/**
 * La tappa di ciclismo: campi a scacchiera (grano, erba medica, terra arata, girasoli), il fiume col ponte,
 * il paese con la chiesa e la gente ai lati, il bosco, il rettilineo d'arrivo con transenne, tribuna e striscione.
 * Le forme vengono da sim/sports/cyclingRoute.ts; cielo, luce, animali ed effetti da render/outdoor.ts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BARRIERS, BRIDGE_S, CYCLING_ROUTE, FIELDS, FINISH_S, HOUSES, LENGTH, LINE, LINE_S, PASTURE, RIVER, RIVER_BANK, ROAD, ROAD_EDGE, ROAD_HALF, TREES, VILLAGE, roadAt, roadDir, terrainHeight,
} from '../sim/sports/cyclingRoute';
import { poly, strip } from '../sim/sports/shapes';
import { stadiumSeats, type SeatRow } from './stage';
import { canvasTexture, createOutdoor, forest, layer as flatLayer, surfaceMaterial as mat, textCanvas, turf } from './outdoor';
import { liftTerrain } from './terrain';
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
  const alpine = CYCLING_ROUTE.style === 'alpine', coastal = CYCLING_ROUTE.style === 'coastal';
  const world = createOutdoor(renderer, scene, camera, alpine ? '#78836b' : coastal ? '#819d59' : '#4f7a3a');
  const layer: typeof flatLayer = (polys, material, tile, order, y = 0) => {
    const mesh = flatLayer(polys, material, tile, order, y);
    const road = order >= 5;
    // The river valley is flat. Subdividing its long, thin triangles created ~680,000 unnecessary faces.
    if (order === 3 || order === 4) mesh.geometry.translate(0, order === 4 ? 0.08 : 0.02, 0);
    else mesh.geometry = liftTerrain(mesh.geometry, terrainHeight, (road ? 0.16 : 0) + order * 0.006 + (order >= 7 ? 0.04 : 0));
    material.depthTest = material.depthWrite = true;
    // The gravel apron must not occlude the asphalt when their terrain tessellations differ.
    if (order === 5) material.depthWrite = false;
    if (order >= 7) { material.depthWrite = false; material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -2; }
    if (order === 4) { mesh.name = 'cycling-river'; mesh.receiveShadow = false; }
    if (order === 3) mesh.name = 'cycling-riverbank';
    return mesh;
  };
  const ground = new THREE.PlaneGeometry(2200, 1500, 220, 150).rotateX(-Math.PI / 2);
  const p = ground.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) - 0.06);
  ground.computeVertexNormals();
  const relief = new THREE.Mesh(ground, mat(world.rough, alpine ? 0xa0ad95 : coastal ? 0xc4d3a4 : 0xb7d58e)); relief.receiveShadow = true; relief.renderOrder = -100;
  scene.add(relief);
  if (coastal) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2200, 650).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x338ca4, depthTest: false, depthWrite: false }));
    sea.name = 'cycling-coast'; sea.renderOrder = -99.5; sea.position.set(0, 0.06, -685); scene.add(sea);
  }
  if (alpine) {
    const mountains = new THREE.Group(); mountains.name = 'cycling-alpine-peaks';
    for (let i = 0; i < 6; i++) {
      const height = 180 + (i % 3) * 48, x = -950 + i * 330, z = -630 - (i % 2) * 70;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(175, height, 7), new THREE.MeshLambertMaterial({ color: [0x7e8988, 0x879395, 0x657779][i % 3], flatShading: true }));
      rock.position.set(x, height / 2, z); mountains.add(rock);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(62, height * 0.36, 7), new THREE.MeshLambertMaterial({ color: 0xf1f4ed, flatShading: true }));
      snow.position.set(x, height * 0.82, z); mountains.add(snow);
    }
    scene.add(mountains);
  }
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
    layer([RIVER], new THREE.MeshStandardMaterial({ color: 0x4b8d9c, roughness: 0.65, metalness: 0 }), 10, 4),
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
  // Linea d'arrivo: un rettangolo di traverso alla strada (una striscia avrebbe le estremità tonde larghe quanto la strada).
  const fl = roadAt(FINISH_S), fdir = roadDir(FINISH_S), corner = (a: number, b: number): [number, number] => [fl.x + fdir.x * a - fdir.z * b, fl.z + fdir.z * a + fdir.x * b];
  scene.add(layer([poly([corner(-0.35, -ROAD_HALF), corner(0.35, -ROAD_HALF), corner(0.35, ROAD_HALF), corner(-0.35, ROAD_HALF)])], mat(turf(renderer, '#ffffff', null, 0, 0.02, 27)), 2, 8));
  forest(scene, TREES, terrainHeight);

  // ---------------------------------------------------------------- ponte, case, chiesa
  const parts: THREE.BufferGeometry[] = [];
  const bp = roadAt(BRIDGE_S), bd = roadDir(BRIDGE_S), ba = Math.atan2(bd.z, bd.x);
  for (const side of [-1, 1]) parts.push(block(36, 0.9, 0.5, bp.x - bd.z * side * (ROAD_HALF + 0.4), bp.y + 0.45, bp.z + bd.x * side * (ROAD_HALF + 0.4), ba, 0xb9ad98));
  parts.push(block(30, 2.2, ROAD_HALF * 2 + 1.4, bp.x, bp.y - 1.2, bp.z, ba, 0xa89c86));
  for (const [x, z, a, w, d, floors] of HOUSES) {
    const h = 3 + floors * 2.8, wall = CYCLING_ROUTE.walls[Math.floor((x * 7 + z * 3) % 5 + 5) % 5];
    const floor = terrainHeight(x, z);
    parts.push(block(w + 0.15, 2.6, d + 0.15, x, floor - 0.8, z, a, alpine ? 0x666e69 : 0xa79c86));
    parts.push(block(w, h, d, x, h / 2 + floor, z, a, wall));
    if (coastal) parts.push(block(w + 0.6, 0.3, d + 0.6, x, floor + h + 0.1, z, a, CYCLING_ROUTE.roof));
    else for (const s of [-1, 1]) {
      const g = block(w + (alpine ? 1.4 : 0.6), 0.25, d * 0.65, 0, 0, s * d * 0.25, 0, CYCLING_ROUTE.roof).rotateX(s * (alpine ? 0.72 : 0.5)).rotateY(-a).translate(x, floor + h + d * 0.14, z);
      parts.push(g);
    }
    if (alpine) for (let band = 2.4; band < h; band += 2.8) parts.push(block(w + 0.08, 0.18, d + 0.08, x, floor + band, z, a, 0x41372d));
    // Finestre scure sui due lati lunghi.
    for (let k = -1; k <= 1; k += 2) for (const s of [-1, 1]) parts.push(block(1.1, 1.3, 0.1, 0, 0, 0, 0, alpine ? 0xe6bb78 : coastal ? 0x247ca0 : 0x34404a).translate(k * w * 0.25, 0, s * (d / 2 + 0.03)).rotateY(-a).translate(x, floor + h - 1.8, z));
  }
  const mid = roadAt((VILLAGE[0] + VILLAGE[1]) / 2), md = roadDir((VILLAGE[0] + VILLAGE[1]) / 2), ma = Math.atan2(md.z, md.x);
  const church = mid.clone().add(new THREE.Vector3(-md.z * 22, 0, md.x * 22));
  const churchFloor = terrainHeight(church.x, church.z);
  if (coastal) {
    const lighthouse = new THREE.Group(); lighthouse.name = 'cycling-lighthouse';
    for (let i = 0; i < 5; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.5 - i * 0.12, 1.62 - i * 0.12, 3.2, 10), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xd34f3e : 0xf1f1e6 }));
      band.position.y = 1.6 + i * 3.2; lighthouse.add(band);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2, 10), new THREE.MeshLambertMaterial({ color: 0x244553 })); cap.position.y = 17; lighthouse.add(cap);
    lighthouse.position.set(church.x, churchFloor, church.z); scene.add(lighthouse);
    for (const x of [-500, -330, -160]) {
      parts.push(block(9, 1.1, 65, x, 0.65, -390, 0, 0x9c8b71));
      parts.push(block(0.7, 24, 0.7, x + 12, 12, -355, 0, 0xcf8b35), block(24, 0.7, 0.7, x + 5, 24, -355, 0, 0xcf8b35));
    }
  } else if (alpine) {
    parts.push(block(22, 10, 13, church.x, churchFloor + 5, church.z, ma, 0x8d694d), block(24, 0.8, 15, church.x, churchFloor + 10.5, church.z, ma, 0x39414a));
  } else parts.push(block(18, 9, 10, church.x, churchFloor + 4.5, church.z, ma, 0xeadfc8), block(4.5, 24, 4.5, church.x + md.x * 9, churchFloor + 12, church.z + md.z * 9, ma, 0xe2d4b8),
    block(5, 4, 5, church.x + md.x * 9, churchFloor + 26, church.z + md.z * 9, ma, 0xa8553a));
  // Transenne del rettilineo d'arrivo.
  for (let s = BARRIERS[0]; s < BARRIERS[1] - 2; s += 2.5) {
    const p = roadAt(s), d = roadDir(s), a = Math.atan2(d.z, d.x);
    for (const side of [-1, 1]) parts.push(block(2.4, 1.1, 0.08, p.x - d.z * side * (ROAD_HALF + 0.6), p.y + 0.55, p.z + d.x * side * (ROAD_HALF + 0.6), a, s % 5 < 2.5 ? 0xf4f4f0 : 0x2f6fde));
  }
  const town = new THREE.Mesh(mergeGeometries(parts)!, painted);
  town.name = `cycling-town-${CYCLING_ROUTE.style}`; town.userData.town = CYCLING_ROUTE.town;
  town.castShadow = town.receiveShadow = true;
  scene.add(town);
  const entry = roadAt(VILLAGE[0] - 15), entryDir = roadDir(VILLAGE[0] - 15);
  entry.x -= entryDir.z * (ROAD_HALF + 3); entry.z += entryDir.x * (ROAD_HALF + 3); entry.y = terrainHeight(entry.x, entry.z);
  const nameTexture = canvasTexture(textCanvas(512, 128, g => { g.fillStyle = '#eff0df'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#384e46'; g.lineWidth = 12; g.strokeRect(8, 8, 496, 112); g.fillStyle = '#233a35'; g.font = 'bold 58px Arial'; g.fillText(CYCLING_ROUTE.town, 256, 68, 470); }), renderer, false);
  const townSign = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 4.8), new THREE.MeshLambertMaterial({ map: nameTexture }));
  townSign.name = 'cycling-town-sign'; townSign.position.copy(entry).add(new THREE.Vector3(0, 2.1, 0)); townSign.rotation.y = -Math.atan2(entryDir.z, entryDir.x); scene.add(townSign);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.7, 0.13), new THREE.MeshLambertMaterial({ color: 0x45514a }));
    post.position.copy(entry).add(new THREE.Vector3(-entryDir.z * side * 1.7, 0.85, entryDir.x * side * 1.7)); scene.add(post);
  }

  // ---------------------------------------------------------------- pubblico: ai lati nel paese e all'arrivo, tribuna
  const rows: SeatRow[] = [], benches: THREE.BufferGeometry[] = [];
  const crowdAlong = (s0: number, s1: number, off: number) => {
    for (let s = s0; s < s1; s += 12) for (const side of [-1, 1]) {
      const p = roadAt(s + 6), d = roadDir(s + 6), n = new THREE.Vector3(-d.z * side, 0, d.x * side), at = p.clone().addScaledVector(n, off);
      // In piedi dietro una transenna bassa, appena più indietro del bordo.
      const back = at.clone().addScaledVector(n, 0.6);
      rows.push({ from: back.clone().addScaledVector(d, -5), to: back.clone().addScaledVector(d, 5), facing: -Math.atan2(-n.z, -n.x), team: -1, standing: true });
      benches.push(block(11, 0.9, 0.12, at.x, at.y + 0.45, at.z, Math.atan2(d.z, d.x), 0x8a7a64));
    }
  };
  crowdAlong(VILLAGE[0] + 20, VILLAGE[1] - 20, ROAD_HALF + 1.6);
  crowdAlong(BARRIERS[0] + 10, FINISH_S - 30, ROAD_HALF + 1.6);
  const fp = roadAt(FINISH_S), fd = roadDir(FINISH_S), fa = Math.atan2(fd.z, fd.x), fn = new THREE.Vector3(fd.z, 0, -fd.x);
  const stand: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const top = 0.6 + i * 0.5, c = fp.clone().addScaledVector(fn, ROAD_HALF + 3 + i * 0.9);
    stand.push(block(40, top, 0.9, c.x, c.y + top / 2, c.z, fa, 0xdfe3e6));
    rows.push({ from: c.clone().addScaledVector(fd, -19).setY(c.y + top), to: c.clone().addScaledVector(fd, 19).setY(c.y + top), facing: -Math.atan2(-fn.z, -fn.x), team: -1 });
  }
  scene.add(new THREE.Mesh(mergeGeometries([...benches, ...stand])!, painted), stadiumSeats(rows.slice(-5)));

  // ---------------------------------------------------------------- striscione d'arrivo e flamme rouge
  const banner = (s: number, text: string, bg: string, fg: string) => {
    const p = roadAt(s), d = roadDir(s), n = new THREE.Vector3(-d.z, 0, d.x), a = Math.atan2(d.z, d.x);
    const tex = canvasTexture(textCanvas(512, 96, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 512, 96); g.fillStyle = fg; g.font = 'bold 60px Arial'; g.fillText(text, 256, 52, 490); }), renderer, false);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, ROAD_HALF * 2 + 3), [0, 1, 2, 3, 4, 5].map((k) => k < 2 ? new THREE.MeshStandardMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ color: 0x2b2f36 })));
    top.position.copy(p).add(new THREE.Vector3(0, 5.6, 0)); top.rotation.y = -a;
    scene.add(top);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.4, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f36 }));
      pole.position.copy(p).addScaledVector(n, side * (ROAD_HALF + 1.6)).y += 3.2;
      scene.add(pole);
    }
  };
  banner(FINISH_S, `${t('ARRIVO')} · FRAME IT`, '#d92f3a', '#ffffff');
  banner(FINISH_S - 1000, t('ULTIMO KM'), '#e0352b', '#ffffff');

  return { seatRows: rows, update: world.update };
}
