/**
 * La tappa di ciclismo: campi a scacchiera (grano, erba medica, terra arata, girasoli), il fiume col ponte,
 * il paese con la chiesa e la gente ai lati, il bosco, il rettilineo d'arrivo con transenne, tribuna e striscione.
 * Le forme vengono da sim/sports/cyclingRoute.ts; cielo, luce, animali ed effetti da render/outdoor.ts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BARRIERS, BENDS, BRIDGE_S, CYCLING_ROUTE, FARMS, FIELDS, FINISH_S, HOUSES, LENGTH, LINE, LINE_S, PASTURE, RIVER, RIVER_BANK, ROAD, ROAD_EDGE, ROAD_HALF, SUMMIT_S, TREES, VILLAGE, roadAt, roadCurve, roadDir, terrainHeight,
} from '../sim/sports/cyclingRoute';
import { inside, poly, strip } from '../sim/sports/shapes';
import { stadiumSeats, type SeatRow } from './stage';
import { canvasTexture, createOutdoor, forest, layer as flatLayer, surfaceMaterial as mat, textCanvas, turf } from './outdoor';
import { liftTerrain } from './terrain';
import { propGeometry, propMaterial, withProps, type PropPack } from './props';
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
/** Una geometria qualsiasi (cilindro, cono) colorata per vertice, pronta da unire ai parallelepipedi. */
function tinted(geometry: THREE.BufferGeometry, color: number) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color), values = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) { values[i] = c.r; values[i + 1] = c.g; values[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return g;
}
const SHUTTERS = [0x3f6b4f, 0x6b3f2f, 0x2f4f6b, 0x7a2f2f, 0x4f5a3a];
const AWNINGS = [0xc8452f, 0x2f6fb0, 0xd9a53a, 0x3f8a5a];
/**
 * Case, chiesa, piazza, lampioni e auto: modelli di Blender (scripts/blender/country.py) uniti in una mesh sola.
 * Una casa = piano terra + piani + tetto impilati, allargati alla sua pianta, coi muri, il tetto e le persiane tinti.
 */
function townModels(props: PropPack, church: THREE.Vector3 | null, churchAngle: number) {
  const alpine = CYCLING_ROUTE.style === 'alpine', coastal = CYCLING_ROUTE.style === 'coastal';
  const built: THREE.BufferGeometry[] = [], tone = (hex: number) => new THREE.Color(hex);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const put = (name: string, x: number, y: number, z: number, angle: number, tints: Record<string, THREE.Color> = {}, scale = one, local?: THREE.Matrix4) => {
    m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, -angle), scale);
    if (local) m.multiply(local);
    for (const [group, geometry] of Object.entries(props[name])) built.push(propGeometry(geometry, m, tints[group]));
  };
  const home = (x: number, z: number, a: number, w: number, d: number, floors: number, style: string, wall: number, roof: number, pick: number) => {
    const y = terrainHeight(x, z), scale = new THREE.Vector3(w / 9.5, 1, d / 8);
    const tints = { wall: tone(wall), roof: tone(roof), shutter: tone(SHUTTERS[pick % SHUTTERS.length]), awning: tone(AWNINGS[pick % AWNINGS.length]) };
    put(`${style}_ground`, x, y, z, a, tints, scale);
    for (let k = 0; k < floors; k++) put(style === 'village' && (pick + k) % 3 === 0 ? 'village_upper_b' : `${style}_upper`, x, y + 2.5 + 2.8 * k, z, a, tints, scale);
    put(`${style}_roof`, x, y + 2.5 + 2.8 * floors, z, a, tints, scale);
    // Una bottega ogni tanto: tenda a righe sopra la porta, sui due fronti.
    if (style !== 'alpine' && pick % 4 === 0) for (const turn of [0, Math.PI]) put('awning', x, y, z, a, tints, scale, new THREE.Matrix4().makeRotationY(turn).multiply(new THREE.Matrix4().makeTranslation(0, 0, 4)));
  };
  const style = alpine ? 'alpine' : coastal ? 'coastal' : 'village';
  const cosA = Math.cos(churchAngle), sinA = Math.sin(churchAngle);
  /** Dal riferimento della chiesa (facciata verso -z, la strada) al mondo. */
  const square = (lx: number, lz: number) => new THREE.Vector3(church!.x + lx * cosA - lz * sinA, 0, church!.z + lx * sinA + lz * cosA);
  HOUSES.forEach(([x, z, a, w, d, floors], i) => {
    if (church) {
      // Davanti alla chiesa la piazza resta aperta verso la strada: niente case sopra la chiesa o sul sagrato.
      const dx = x - church.x, dz = z - church.z, lx = dx * cosA + dz * sinA, lz = -dx * sinA + dz * cosA;
      if (lx > -15 && lx < 16 && lz > -19 && lz < 21) return;
    }
    home(x, z, a, w, d, floors, style, CYCLING_ROUTE.walls[Math.floor((x * 7 + z * 3) % 5 + 5) % 5], CYCLING_ROUTE.roof, i);
  });
  const CARS = [0xd92f3a, 0x2f6fde, 0xf2c230, 0xf4f4f0, 0x2b2f36, 0x3f8a5a];
  // Cascine fra i campi: casa, fienile, un'auto nel cortile.
  FARMS.forEach(([x, z, a], i) => {
    home(x, z, a, 12, 8, 1, alpine ? 'alpine' : 'village', alpine ? 0x8d694d : 0xe3d2b0, alpine ? 0x39414a : 0x9c4f37, Math.round(x) + 1);
    const bx = x + Math.cos(a) * 3 - Math.sin(a) * 15, bz = z + Math.sin(a) * 3 + Math.cos(a) * 15;
    put('barn', bx, terrainHeight(bx, bz), bz, a + Math.PI / 2);
    const cx = x + Math.cos(a) * 10 - Math.sin(a) * 6, cz = z + Math.sin(a) * 10 + Math.cos(a) * 6;
    put('car', cx, terrainHeight(cx, cz), cz, a + 0.5 + i, { tint: tone(CARS[i % CARS.length]) });
  });
  if (church) {
    const floor = terrainHeight(church.x, church.z);
    put('church', church.x, floor, church.z, churchAngle, { roof: tone(CYCLING_ROUTE.roof) });
    const fountain = square(-7, -12); put('fountain', fountain.x, floor + 0.14, fountain.z, churchAngle);
    [[6, -9.5, 0xc8452f], [9.8, -13, 0xf4efe2], [6.2, -15.5, 0x2f6fb0]].forEach(([lx, lz, color]) => { const p = square(lx, lz); put('parasol', p.x, floor + 0.14, p.z, churchAngle + lx, { tint: tone(color) }); });
    for (const lx of [-13, 13]) for (const lz of [-7.5, -16.5]) { const p = square(lx, lz); put('lamp', p.x, floor + 0.14, p.z, churchAngle + (lx > 0 ? -Math.PI / 2 : Math.PI / 2)); }
  }
  // Lampioni lungo la via del paese, col braccio verso la strada.
  for (let s = VILLAGE[0] + 12, k = 0; s < VILLAGE[1] - 8; s += 26, k++) {
    const side = k % 2 ? 1 : -1, p = roadAt(s), d = roadDir(s), nx = -d.z * side, nz = d.x * side;
    put('lamp', p.x + nx * (ROAD_HALF + 1), p.y + 0.1, p.z + nz * (ROAD_HALF + 1), Math.atan2(nx, -nz));
  }
  // Ammiraglie parcheggiate dopo il traguardo, con le bici sul tetto.
  const fd = roadDir(FINISH_S), fn = new THREE.Vector3(-fd.z, 0, fd.x);
  for (let k = 0; k < 5; k++) {
    const s = FINISH_S + 14 + k * 8.5;
    if (s > LENGTH - 5) break;
    const p = roadAt(s).addScaledVector(fn, ROAD_HALF + 4.2), a = Math.atan2(fd.z, fd.x) + 0.12;
    put('car', p.x, terrainHeight(p.x, p.z), p.z, a, { tint: tone(CARS[k % CARS.length]) });
    put('roof_rack', p.x, terrainHeight(p.x, p.z), p.z, a);
  }
  const mesh = new THREE.Mesh(mergeGeometries(built)!, propMaterial('paint'));
  built.forEach((g) => g.dispose());
  mesh.name = 'cycling-town-models'; mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function cyclingWorld(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const alpine = CYCLING_ROUTE.style === 'alpine', coastal = CYCLING_ROUTE.style === 'coastal';
  const world = createOutdoor(renderer, scene, camera, alpine ? '#7f9668' : coastal ? '#8aa85e' : '#6b9a45');
  const layer: typeof flatLayer = (polys, material, tile, order, y = 0) => {
    const mesh = flatLayer(polys, material, tile, order, y);
    const road = order >= 5 || order === 4.5;
    // The river valley is flat. Subdividing its long, thin triangles created ~680,000 unnecessary faces.
    if (order === 3 || order === 4) mesh.geometry.translate(0, order === 4 ? 0.08 : 0.02, 0);
    else mesh.geometry = liftTerrain(mesh.geometry, terrainHeight, (road ? 0.16 : 0) + order * 0.006 + (order >= 7 ? 0.04 : 0));
    material.depthTest = material.depthWrite = true;
    // The gravel apron must not occlude the asphalt when their terrain tessellations differ.
    if (order === 5 || order === 4.5) material.depthWrite = false;
    if (order >= 7) { material.depthWrite = false; material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -2; }
    if (order === 4) { mesh.name = 'cycling-river'; mesh.receiveShadow = false; }
    if (order === 3) mesh.name = 'cycling-riverbank';
    return mesh;
  };
  const ground = new THREE.PlaneGeometry(2200, 1500, 220, 150).rotateX(-Math.PI / 2);
  const p = ground.getAttribute('position');
  // Fra due vertici (10 m) il prato taglia dritto: nelle conche passava sopra i campi, che seguono il terreno più fitti.
  // Ogni vertice scende di quanto la corda verso i vicini supera il terreno vero.
  const around = [[10, 0], [-10, 0], [0, 10], [0, -10], [10, 10], [-10, -10], [10, -10], [-10, 10]];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = terrainHeight(x, z);
    let sag = 0;
    for (const [dx, dz] of around) sag = Math.max(sag, (h + terrainHeight(x + dx, z + dz)) / 2 - terrainHeight(x + dx / 2, z + dz / 2));
    // Sui dossi succede il contrario: sono i triangoli dei campi (lati fino a 10 m) a tagliare sotto il terreno vero.
    for (const [dx, dz] of around.slice(0, 6)) sag = Math.max(sag, h - (terrainHeight(x + dx * 0.7, z + dz * 0.7) + terrainHeight(x - dx * 0.7, z - dz * 0.7)) / 2);
    p.setY(i, h - 0.06 - sag * 1.2);
  }
  ground.computeVertexNormals();
  // Prati a chiazze: zone più scure, più chiare e più gialle, larghe decine di metri, invece di un verde uniforme.
  const shades = new Float32Array(p.count * 3), dark = new THREE.Color(0.74, 0.86, 0.7), light = new THREE.Color(1.1, 1.05, 0.8), shade = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const n = Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7) + 0.5 * Math.sin(x * 0.031 + z * 0.027) + 0.25 * Math.sin(x * 0.07 - z * 0.09);
    shade.lerpColors(dark, light, THREE.MathUtils.clamp(0.5 + n / 2.6, 0, 1)).toArray(shades, i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(shades, 3));
  const meadow = mat(world.rough, alpine ? 0xb4c2a2 : coastal ? 0xd2e0b0 : 0xcfe6a2); meadow.vertexColors = true;
  // Da lontano i 6 cm fra prato e campi sono meno della precisione della profondità: il prato si tiene un passo indietro,
  // così i campi non si riempiono più di chiazze verdi (e il piano vicino della camera, più lontano, la rende più fine).
  Object.assign(meadow, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
  camera.near = 0.3;
  const relief = new THREE.Mesh(ground, meadow); relief.receiveShadow = true; relief.renderOrder = -100;
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
    canvasTexture(textCanvas(256, 256, (g) => {           // girasoli: file fitte, verde e giallo che si mescolano da lontano
      g.fillStyle = '#5a7a2e'; g.fillRect(0, 0, 256, 256);
      let seed = 5; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let y = 6; y < 256; y += 12) for (let x = 4; x < 256; x += 9) {
        g.fillStyle = random() < 0.85 ? '#e9bd2c' : '#c99a1e'; g.beginPath(); g.arc(x + (y % 24 ? 4 : 0) + random() * 2, y + random() * 2, 3.4, 0, Math.PI * 2); g.fill();
      }
    }), renderer),
    canvasTexture(textCanvas(256, 256, (g) => {           // vigna: filari verdi sulla terra chiara
      g.fillStyle = '#9a8258'; g.fillRect(0, 0, 256, 256);
      let seed = 9; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let x = 10; x < 256; x += 32) for (let y = 0; y < 256; y += 5) { g.fillStyle = random() < 0.5 ? '#4f7a34' : '#3f6a2c'; g.fillRect(x + random() * 3 - 6, y, 13, 6); }
    }), renderer),
    canvasTexture(textCanvas(256, 256, (g) => {           // prato fiorito
      g.fillStyle = '#7fae4f'; g.fillRect(0, 0, 256, 256);
      let seed = 13; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 900; i++) { g.fillStyle = ['#f4f0e0', '#f2d24a', '#d86a8a', '#6c9a40', '#8fbb5a'][Math.floor(random() * 5)]; g.fillRect(random() * 256, random() * 256, 2.5, 2.5); }
    }), renderer),
  ];
  // Un campo che tocca il pascolo delle mucche non si disegna: i due strati, quasi alla stessa quota, si mangiavano a chiazze.
  const fields = FIELDS.filter((f) => !f.poly.pts.some(([x, z]) => inside(PASTURE, x, z)) && !PASTURE.pts.some(([x, z]) => inside(f.poly, x, z)));
  crops.forEach((tex, k) => scene.add(layer(fields.filter((f) => f.crop === k).map((f) => f.poly), mat(tex), k === 3 ? 9 : k === 4 ? 16 : 14, 1)));
  const asphalt = turf(renderer, '#4a4d52', null, 0, 0.12, 24);
  // Selciato del paese: pietre sfalsate attorno alla via, fino alle soglie delle case.
  const cobbles = canvasTexture(textCanvas(256, 256, (g) => {
    g.fillStyle = '#8f8778'; g.fillRect(0, 0, 256, 256);
    let seed = 19; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let row = 0; row < 16; row++) for (let col = 0; col < 8; col++) {
      const l = 168 + Math.floor(random() * 44), x = (col * 32 + (row % 2) * 16) % 256;
      g.fillStyle = `rgb(${l},${l - 8},${l - 24})`;
      g.fillRect(x + 1, row * 16 + 1, 30, 14);
      if (x + 31 > 256) g.fillRect(x - 255, row * 16 + 1, 30, 14);
    }
  }), renderer);
  scene.add(
    layer([strip(LINE, LINE_S, VILLAGE[0] - 8, VILLAGE[1] + 8, () => ROAD_HALF + 8.5)], mat(cobbles), 3.2, 4.5),
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
  forest(scene, TREES, terrainHeight, alpine ? 0 : coastal ? 0.3 : 0.22);
  // Siepi lungo un lato dei campi (due campi su tre): cespugli in fila, ognuno un po' diverso.
  {
    let seed = CYCLING_ROUTE.seed * 13 + 5; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const hedge: { x: number; z: number; h: number; pine: boolean; tint: number }[] = [];
    fields.forEach((field, i) => {
      if (i % 3 === 2) return;
      const pts = field.poly.pts, [ax, az] = pts[i % 4], [bx, bz] = pts[(i + 1) % 4], length = Math.hypot(bx - ax, bz - az);
      for (let d = 2; d < length - 2; d += 3.6 + random() * 1.2) {
        if (random() < 0.12) continue;
        hedge.push({ x: ax + (bx - ax) * d / length, z: az + (bz - az) * d / length, h: 2.4 + random() * 1.3, pine: false, tint: random() });
      }
    });
    forest(scene, hedge, terrainHeight, 0, 'bush');
  }

  // ---------------------------------------------------------------- ponte, case, chiesa
  const parts: THREE.BufferGeometry[] = [];
  const bp = roadAt(BRIDGE_S), bd = roadDir(BRIDGE_S), ba = Math.atan2(bd.z, bd.x);
  for (const side of [-1, 1]) parts.push(block(36, 0.9, 0.5, bp.x - bd.z * side * (ROAD_HALF + 0.4), bp.y + 0.45, bp.z + bd.x * side * (ROAD_HALF + 0.4), ba, 0xb9ad98));
  parts.push(block(30, 2.2, ROAD_HALF * 2 + 1.4, bp.x, bp.y - 1.2, bp.z, ba, 0xa89c86));
  // Silo delle cascine (case e fienili sono nei modelli, più sotto).
  for (const [x, z, a] of FARMS) {
    const sx = x - Math.cos(a) * 11, sz = z - Math.sin(a) * 11, sy = terrainHeight(sx, sz);
    parts.push(tinted(new THREE.CylinderGeometry(2.1, 2.1, 9, 12).translate(sx, sy + 4.5, sz), 0xc9ced2), tinted(new THREE.ConeGeometry(2.3, 1.6, 12).translate(sx, sy + 9.8, sz), 0x8e979d));
  }
  // Balle di fieno nei campi di grano.
  {
    let seed = CYCLING_ROUTE.seed * 7 + 1; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (const field of fields) {
      if (field.crop !== 0) continue;
      for (let n = 0; n < 4; n++) {
        const x = field.c[0] + (random() - 0.5) * 60, z = field.c[1] + (random() - 0.5) * 50;
        parts.push(tinted(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 10).rotateZ(Math.PI / 2).rotateY(random() * Math.PI).translate(x, terrainHeight(x, z) + 0.8, z), 0xd8b45a));
      }
    }
  }
  // Lungo la strada: paracarri bianchi, guardrail all'esterno delle curve strette, muretti di pietra all'ingresso del paese.
  const beside = (s: number, side: number, off: number) => { const p = roadAt(s), d = roadDir(s); return { p: p.add(new THREE.Vector3(-d.z * side * off, 0, d.x * side * off)), a: Math.atan2(d.z, d.x) }; };
  for (let s = 20; s < BARRIERS[0] - 10; s += 30) {
    if (s > VILLAGE[0] - 100 && s < VILLAGE[1] + 90) continue;
    for (const side of [-1, 1]) {
      const { p, a } = beside(s, side, ROAD_HALF + 0.9);
      parts.push(block(0.14, 0.8, 0.14, p.x, p.y + 0.4, p.z, a, 0xf1f1ec), block(0.15, 0.16, 0.15, p.x, p.y + 0.7, p.z, a, 0xd63a2f));
    }
  }
  for (const bend of BENDS) {
    const outer = -Math.sign(roadCurve(bend)) || 1;
    for (let s = bend - 26; s < bend + 26; s += 2.4) {
      const { p, a } = beside(s, outer, ROAD_HALF + 1);
      parts.push(block(2.5, 0.3, 0.07, p.x, p.y + 0.62, p.z, a, 0xb8bec4));
      if (Math.round((s - bend) / 2.4) % 2 === 0) parts.push(block(0.1, 0.75, 0.1, p.x, p.y + 0.37, p.z, a, 0x8e969d));
    }
  }
  for (const [from, to] of [[VILLAGE[0] - 95, VILLAGE[0] - 4], [VILLAGE[1] + 4, VILLAGE[1] + 85]]) for (let s = from; s < to; s += 2.5) for (const side of [-1, 1]) {
    const { p, a } = beside(s, side, ROAD_HALF + 1.5);
    parts.push(block(2.56, 0.85, 0.45, p.x, p.y + 0.3, p.z, a, Math.round(s / 2.5) % 3 ? 0x9a917f : 0x8a8272));
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
  } else {
    // Sagrato lastricato davanti alla chiesa, aperto verso la strada (chiesa, fontana e tavolini sono nei modelli).
    parts.push(block(30, 0.3, 13, 0, 0, 0, 0, 0xcfc6b2).translate(0, 0, -12.5).rotateY(-ma).translate(church.x, churchFloor, church.z));
  }
  withProps('country', (props) => scene.add(townModels(props, coastal ? null : church, ma)));
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
  // Gran premio della montagna: ala di folla negli ultimi metri di salita.
  if (SUMMIT_S > 0) crowdAlong(SUMMIT_S - 96, SUMMIT_S + 12, ROAD_HALF + 1.6);
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
  if (SUMMIT_S > 0) banner(SUMMIT_S, 'GPM · FRAME IT', '#2f8f4a', '#ffffff');
  // Festoni di bandierine sopra la via del paese: è giorno di corsa.
  {
    const positions: number[] = [], colors: number[] = [], flag = new THREE.Color(), palette = [0xe23b3b, 0xf2c230, 0x2f6fde, 0x3fa35a, 0xf4f4f0];
    for (let s = VILLAGE[0] + 8; s < VILLAGE[1] - 8; s += 15) {
      const p = roadAt(s), d = roadDir(s), span = ROAD_HALF + 5;
      for (let k = 0; k < 13; k++) {
        const u = (k + 0.5) / 13 * 2 - 1, y = p.y + 6.2 - (1 - u * u) * 0.9, cx = p.x - d.z * u * span, cz = p.z + d.x * u * span, half = span / 13 * 0.8;
        positions.push(cx + d.z * half, y, cz - d.x * half, cx - d.z * half, y, cz + d.x * half, cx, y - 0.75, cz);
        flag.setHex(palette[(k + Math.round(s / 15)) % palette.length]);
        for (let v = 0; v < 3; v++) colors.push(flag.r, flag.g, flag.b);
      }
    }
    const bunting = new THREE.BufferGeometry();
    bunting.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); bunting.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const flags = new THREE.Mesh(bunting, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    flags.name = 'cycling-bunting'; scene.add(flags);
  }

  return { seatRows: rows, update: world.update };
}
