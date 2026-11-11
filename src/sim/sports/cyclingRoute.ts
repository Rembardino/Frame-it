/**
 * TAPPA DI CICLISMO — gli ultimi 2 km in campagna: curve, un paese con lo strappo, un ponte sul fiume,
 * un bosco, il rettilineo d'arrivo con le tribune. Solo dati e geometria (la grafica in render/cycling.ts).
 * Metri; x = est, z = sud. Per cambiare la tappa basta spostare i punti di ROUTE.
 */
import * as THREE from 'three';
import { blob, inside, poly, pointAt, seeded, strip, type Poly, type Tree, type V2 } from './shapes';

/** Un punto della strada: [x, z] e, se serve, il raggio della curva lì (m). Senza raggio la curva è ampia; 13-14 = tornante. */
type Waypoint = [number, number, number?];
/** village = fra quali punti della strada sta il paese (indici di points). */
export const CYCLING_ROUTES = [
  { id: 'collinare', label: 'Colline e curve a S', town: 'Valdoro', style: 'village', seed: 31,
    hills: [58, 38], center: [-420, 120], spread: [350, 440], village: [7, 9],
    walls: [0xe9d8b4, 0xf0c9a0, 0xe7e2d6, 0xd9b38c, 0xf2e3c2], roof: 0xa8553a,
    // Due tornanti sulla collina, una S fra i campi, il paese, il ponte, l'ultima piega prima del rettilineo.
    points: [[-860, 180], [-700, 250], [-590, 190], [-640, 80, 14], [-510, 110, 14], [-450, -10], [-330, 40], [-240, -90], [-80, -130], [60, -95],
      [165, -30], [250, 70], [340, 180], [440, 205], [520, 140, 40], [600, 150], [860, 150]] as Waypoint[] },
  { id: 'montagna', label: 'Salite e discese', town: 'Passo Alto', style: 'alpine', seed: 67,
    hills: [130, 44], center: [-520, 80], spread: [430, 460], village: [11, 13],
    walls: [0x76523b, 0x967456, 0xd4c4ab, 0x604b3c, 0xb29e7c], roof: 0x39414a,
    // Quattro tornanti fino al passo, la discesa ripida, il paese in riva al fiume e il ponte.
    points: [[-850, 340], [-730, 400], [-610, 340, 13], [-720, 270, 13], [-600, 220, 13], [-680, 140, 13], [-540, 110], [-500, 20], [-400, -70], [-290, -120],
      [-170, -90], [-70, -150], [40, -170], [110, -110], [175, -50], [270, 40], [380, 140], [470, 150], [600, 150], [860, 150]] as Waypoint[] },
  { id: 'tecnico', label: 'Circuito a S', town: 'Porto Azzurro', style: 'coastal', seed: 103,
    hills: [28, 24], center: [-380, -150], spread: [370, 250], village: [3, 7],
    walls: [0xf4f0dd, 0xe2eee7, 0xf0d6bf, 0xffffff, 0xbcd9e5], roof: 0xd6e1de,
    // Lungomare a chicane strette, poi l'interno con due pieghe secche.
    points: [[-820, -280], [-640, -300], [-520, -230], [-430, -290, 25], [-340, -200, 25], [-250, -285, 25], [-150, -170], [-20, -235], [70, -140], [170, -70],
      [240, 40], [310, 130], [420, 90, 30], [500, 170, 30], [600, 150], [860, 150]] as Waypoint[] },
];
const requested = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('route');
export const CYCLING_ROUTE = CYCLING_ROUTES.find(route => route.id === requested) ?? CYCLING_ROUTES[0];
const ROUTE = CYCLING_ROUTE.points;
const riverNodes: V2[] = [[230, -560], [170, -250], [160, 0], [110, 250], [60, 600]];

/** Shared by road, landscape, riders and drone: the river valley remains level. */
export function terrainHeight(x: number, z: number) {
  const [a, b] = CYCLING_ROUTE.hills;
  const [cx, cz] = CYCLING_ROUTE.center, [sx, sz] = CYCLING_ROUTE.spread;
  const hills = a * Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2))
    + b * Math.exp(-(((x - 580) / 240) ** 2 + ((z - 170) / 350) ** 2));
  const index = Math.max(1, riverNodes.findIndex(([, atZ]) => atZ >= z));
  const aNode = z > 600 ? riverNodes[3] : riverNodes[index - 1], bNode = z > 600 ? riverNodes[4] : riverNodes[index];
  const riverX = THREE.MathUtils.lerp(aNode[0], bNode[0], THREE.MathUtils.clamp((z - aNode[1]) / (bNode[1] - aNode[1]), 0, 1));
  const shore = CYCLING_ROUTE.style === 'coastal' ? THREE.MathUtils.smoothstep(z, -360, -310) : 1;
  return hills * THREE.MathUtils.smoothstep(Math.abs(x - riverX), 28, 170) * shore;
}
/** Mezza larghezza della strada (m). */
export const ROAD_HALF = 3.5;

/** Rettilinei raccordati da curve: ampie e morbide di norma (raggio r), strette dove il punto lo chiede (tornanti e chicane). */
function rounded(points: Waypoint[], r: number) {
  const P = points.map(([x, z]) => new THREE.Vector3(x, 0, z)), out = [P[0].clone()];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1], d1 = b.clone().sub(a).normalize(), d2 = c.clone().sub(b).normalize();
    const turn = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1));
    const cut = Math.min((points[i][2] ?? r) * Math.tan(turn / 2), a.distanceTo(b) * 0.45, b.distanceTo(c) * 0.45);
    const s = b.clone().addScaledVector(d1, -cut), e = b.clone().addScaledVector(d2, cut);
    for (let k = 0; k <= 12; k++) { const u = k / 12; out.push(s.clone().multiplyScalar((1 - u) ** 2).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(e, u * u)); }
  }
  out.push(P[P.length - 1].clone());
  return out;
}
const RAW = rounded(ROUTE, 55), RAW_S = [0];
for (let k = 1; k < RAW.length; k++) RAW_S.push(RAW_S[k - 1] + RAW[k].distanceTo(RAW[k - 1]));
/** La strada campionata ogni 2 m, con i metri percorsi di ogni punto. */
export const LINE = Array.from({ length: Math.ceil(RAW_S[RAW_S.length - 1] / 2) + 1 }, (_, k) => pointAt(RAW, RAW_S, Math.min(k * 2, RAW_S[RAW_S.length - 1])));
export const LINE_S = [0];
for (let k = 1; k < LINE.length; k++) LINE_S.push(LINE_S[k - 1] + LINE[k].distanceTo(LINE[k - 1]));
export const LENGTH = LINE_S[LINE_S.length - 1];
/** Lo striscione d'arrivo, un po' prima della fine della strada (dopo si frena). */
export const FINISH_S = LENGTH - 60;

export const roadAt = (s: number) => { const p = pointAt(LINE, LINE_S, s); return p.setY(terrainHeight(p.x, p.z) + 0.2); };
export const roadGrade = (s: number) => (roadAt(s + 4).y - roadAt(s - 4).y) / 8;
export const CYCLING_PROFILE = Array.from({ length: 81 }, (_, i) => roadAt(LENGTH * i / 80).y);
export const CYCLING_RELIEF = CYCLING_PROFILE.slice(1).reduce((sum, height, i) => ({
  climb: sum.climb + Math.max(0, height - CYCLING_PROFILE[i]), descent: sum.descent + Math.max(0, CYCLING_PROFILE[i] - height),
}), { climb: 0, descent: 0 });
/** Direzione della strada in s (vettore unitario). */
export const roadDir = (s: number) => roadAt(s + 1.5).sub(roadAt(s - 1.5)).setY(0).normalize();

/** Curvatura con segno (1/raggio, rad al metro) in s: la usano piega e frenata in curva. */
export function roadCurve(s: number) {
  const a = roadDir(s - 6), b = roadDir(s + 6);
  return Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z) / 12;
}

export function nearestS(x: number, z: number) {
  let best = 0, bestD = Infinity;
  LINE.forEach((p, k) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bestD) { bestD = d; best = LINE_S[k]; } });
  return best;
}

/** Curve strette: dove la strada gira più di 0,6 rad in 30 m. */
export const BENDS: number[] = (() => {
  const out: number[] = [];
  for (let s = 60; s < FINISH_S - 80; s += 4) {
    const a = roadDir(s - 15), b = roadDir(s + 15), turn = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
    if (turn > 0.6 && (!out.length || s - out[out.length - 1] > 80)) out.push(s);
  }
  return out;
})();

export const ROAD = strip(LINE, LINE_S, 0, LENGTH, () => ROAD_HALF);
export const ROAD_EDGE = strip(LINE, LINE_S, 0, LENGTH, () => ROAD_HALF + 1.2);

/** Il paese: case ai due lati della strada tra queste s, con la chiesa e il pubblico. */
export const VILLAGE = CYCLING_ROUTE.village.map((index, k) => nearestS(ROUTE[index][0], ROUTE[index][1]) + (k ? -15 : 15)) as [number, number];
/** Gran premio della montagna: il punto più alto della strada, se la salita è vera (almeno 30 m sopra il punto più basso). -1 = tappa senza GPM. */
export const SUMMIT_S = (() => {
  let best = -1, top = -Infinity, low = Infinity;
  for (let s = 150; s < FINISH_S - 450; s += 4) { const y = roadAt(s).y; low = Math.min(low, y); if (y > top) { top = y; best = s; } }
  return top - Math.min(low, roadAt(40).y) > 30 ? best : -1;
})();
/** Distanza (m) di un punto dalla mezzeria della strada. */
export const roadDistance = (x: number, z: number) => { const p = roadAt(nearestS(x, z)); return Math.hypot(p.x - x, p.z - z); };
/** Il fiume (da sud a nord) e il punto della strada dove c'è il ponte. */
const RIVER_LINE = new THREE.CatmullRomCurve3(riverNodes.map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(80);
const RIVER_S = [0];
for (let k = 1; k < RIVER_LINE.length; k++) RIVER_S.push(RIVER_S[k - 1] + RIVER_LINE[k].distanceTo(RIVER_LINE[k - 1]));
export const RIVER = strip(RIVER_LINE, RIVER_S, 0, RIVER_S[RIVER_S.length - 1], (s) => 11 + 3 * Math.sin(s / 60));
export const RIVER_BANK = strip(RIVER_LINE, RIVER_S, 0, RIVER_S[RIVER_S.length - 1], (s) => 14 + 3 * Math.sin(s / 60));
export const BRIDGE_S = (() => { for (let s = 0; s < LENGTH; s += 2) { const p = roadAt(s); if (inside(RIVER, p.x, p.z)) return s; } return LENGTH / 2; })();
/** Il bosco che la strada attraversa (cervi!) e il pascolo delle mucche. */
export const WOODS: Poly[] = [blob({ c: [330, 60], r: [120, 70], rot: 0.5 }, 0, 3), blob({ c: [-560, 120], r: [90, 110], rot: -0.3 }, 0, 5)];
export const PASTURE = poly([[-150, -40], [40, -10], [60, 90], [-140, 70]]);
/** Rettilineo d'arrivo: transenne e pubblico negli ultimi metri. */
export const BARRIERS: [number, number] = [FINISH_S - 260, LENGTH];

/**
 * Campi coltivati: grano, erba medica, terra arata, girasoli, vigna, prato fiorito. Niente scacchiera allineata alla mappa:
 * le parcelle seguono una trama inclinata, alcune sono divise in due, altre restano prato, e la strada ha i suoi margini d'erba.
 */
export interface Field { poly: Poly; crop: number; c: V2 }
export const FIELDS: Field[] = (() => {
  const rnd = seeded(CYCLING_ROUTE.seed), out: Field[] = [];
  const tilt = 0.22 + (CYCLING_ROUTE.seed % 5) * 0.07, cos = Math.cos(tilt), sin = Math.sin(tilt);
  const margin = strip(LINE, LINE_S, 0, LENGTH, () => ROAD_HALF + 7), town = strip(LINE, LINE_S, VILLAGE[0] - 25, VILLAGE[1] + 25, () => 62);
  for (let u = -1100; u < 1100; u += 118) for (let v = -800; v < 800; v += 102) {
    const cellCrop = Math.floor(rnd() * 6), split = rnd() < 0.3, empty = rnd() < 0.05, a = (rnd() - 0.5) * 0.06, w = 104 + rnd() * 6, h = 88 + rnd() * 6;
    const otherCrop = Math.floor(rnd() * 6);
    if (empty) continue;
    // Mai sovrapposte (due parcelle alla stessa quota sfarfallerebbero): fra l'una e l'altra resta una siepe d'erba.
    for (const [du, dw, crop] of (split ? [[-w / 4 - 1, w / 2 - 3, cellCrop], [w / 4 + 1, w / 2 - 3, otherCrop]] : [[0, w, cellCrop]]) as [number, number, number][]) {
      const cu = u + 59 + du, cv = v + 51, cx = cu * cos - cv * sin, cz = cu * sin + cv * cos;
      const c = (dx: number, dz: number): V2 => {
        const x = dx * Math.cos(a) - dz * Math.sin(a), z = dx * Math.sin(a) + dz * Math.cos(a);
        return [cx + x * cos - z * sin, cz + x * sin + z * cos];
      };
      const corners = [c(-dw / 2, -h / 2), c(dw / 2, -h / 2), c(dw / 2, h / 2), c(-dw / 2, h / 2)];
      if (corners.some(([x, z]) => Math.abs(x) > 930 || Math.abs(z) > 600 || inside(margin, x, z) || inside(town, x, z) || inside(RIVER_BANK, x, z)) || inside(margin, cx, cz)) continue;
      if ((CYCLING_ROUTE.style === 'alpine' && terrainHeight(cx, cz) > 42) || (CYCLING_ROUTE.style === 'coastal' && corners.some(([, z]) => z < -330))) continue;
      out.push({ poly: poly(corners), crop, c: [cx, cz] });
    }
  }
  return out;
})();
/** Cascine isolate fra i campi: [x, z, angolo]. Lontane dalla strada, mai sull'acqua. */
export const FARMS: [number, number, number][] = (() => {
  const rnd = seeded(CYCLING_ROUTE.seed + 11), out: [number, number, number][] = [];
  for (let tries = 0; tries < 400 && out.length < 9; tries++) {
    const x = (rnd() * 2 - 1) * 820, z = (rnd() * 2 - 1) * 500, d = roadDistance(x, z);
    if (d < 45 || d > 190 || inside(RIVER_BANK, x, z) || (CYCLING_ROUTE.style === 'coastal' && z < -300) || out.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 150)) continue;
    if (FIELDS.some((f) => inside(f.poly, x, z))) continue;
    out.push([x, z, rnd() * Math.PI]);
  }
  return out;
})();

export const TREES: Tree[] = (() => {
  const rnd = seeded(CYCLING_ROUTE.seed + 46), out: Tree[] = [];
  const keepOut = [strip(LINE, LINE_S, 0, LENGTH, () => ROAD_HALF + 6), RIVER_BANK, PASTURE,
    strip(LINE, LINE_S, VILLAGE[0] - 20, VILLAGE[1] + 20, () => 30), strip(LINE, LINE_S, BARRIERS[0] - 20, LENGTH, () => 40)];
  const roadside = strip(LINE, LINE_S, 0, LENGTH, () => ROAD_HALF + 14);
  for (let i = 0; i < 5200; i++) {
    const x = (rnd() * 2 - 1) * 980, z = (rnd() * 2 - 1) * 640;
    if (CYCLING_ROUTE.style === 'coastal' && z < -325) continue;
    if (keepOut.some((p) => inside(p, x, z)) || FARMS.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 20)) continue;
    // Fitto nei boschi, a filari lungo la strada, radi tra i campi.
    const chance = CYCLING_ROUTE.style === 'alpine' && terrainHeight(x, z) > 50 ? 0.45 : WOODS.some((w) => inside(w, x, z)) ? 0.9 : inside(roadside, x, z) ? 0.35 : Math.abs(x) > 900 || Math.abs(z) > 560 ? 0.4 : 0.03;
    if (rnd() > chance) continue;
    out.push({ x, z, h: 9 + rnd() * 8, pine: rnd() < (CYCLING_ROUTE.style === 'alpine' ? 0.88 : CYCLING_ROUTE.style === 'coastal' ? 0.08 : 0.3), tint: rnd() });
  }
  return out;
})();

/** Case del paese: [x, z, angolo, larghezza, profondità, piani]. */
export const HOUSES: [number, number, number, number, number, number][] = (() => {
  const rnd = seeded(CYCLING_ROUTE.seed + 5), out: [number, number, number, number, number, number][] = [];
  for (let s = VILLAGE[0]; s < VILLAGE[1]; s += CYCLING_ROUTE.style === 'alpine' ? 22 : 15) for (const side of [-1, 1]) {
    if (rnd() < 0.15) continue;
    const p = roadAt(s), d = roadDir(s), off = ROAD_HALF + 5.5 + rnd() * 2, w = 8 + rnd() * 3, dep = 7 + rnd() * 3;
    out.push([p.x - d.z * side * (off + dep / 2), p.z + d.x * side * (off + dep / 2), Math.atan2(d.z, d.x), w, dep, 1 + Math.floor(rnd() * (CYCLING_ROUTE.style === 'coastal' ? 4 : CYCLING_ROUTE.style === 'alpine' ? 2 : 3))]);
    // Seconda e terza fila, più rade: il paese ha uno spessore, non è due muri ai lati della strada.
    for (const row of [1, 2]) {
      if (rnd() > (row === 1 ? 0.62 : 0.3)) continue;
      const back = off + dep + 5 + row * 3 + rnd() * 4 + (row - 1) * 13, w2 = 7 + rnd() * 3, d2 = 6.5 + rnd() * 2.5;
      const x = p.x - d.z * side * back + d.x * (rnd() - 0.5) * 6, z = p.z + d.x * side * back + d.z * (rnd() - 0.5) * 6;
      if (roadDistance(x, z) < back - 3 || inside(RIVER_BANK, x, z) || (CYCLING_ROUTE.style === 'coastal' && z < -335)) continue;
      out.push([x, z, Math.atan2(d.z, d.x) + (rnd() - 0.5) * 0.5, w2, d2, 1 + Math.floor(rnd() * 2)]);
    }
  }
  return out;
})();
