/**
 * TAPPA DI CICLISMO — gli ultimi 2 km in campagna: curve, un paese con lo strappo, un ponte sul fiume,
 * un bosco, il rettilineo d'arrivo con le tribune. Solo dati e geometria (la grafica in render/cycling.ts).
 * Metri; x = est, z = sud. Per cambiare la tappa basta spostare i punti di ROUTE.
 */
import * as THREE from 'three';
import { blob, inside, poly, pointAt, seeded, strip, type Poly, type Tree, type V2 } from './shapes';

const ROUTE: V2[] = [[-820, 300], [-600, 330], [-430, 230], [-400, 40], [-260, -120], [-60, -160], [120, -80], [230, 90], [420, 200], [600, 150], [860, 150]];
/** Mezza larghezza della strada (m). */
export const ROAD_HALF = 3.5;

/** Rettilinei raccordati da curve strette (raggio r): le curve "a gomito" si sentono davvero. */
function rounded(points: V2[], r: number) {
  const P = points.map(([x, z]) => new THREE.Vector3(x, 0, z)), out = [P[0].clone()];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1], d1 = b.clone().sub(a).normalize(), d2 = c.clone().sub(b).normalize();
    const turn = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1));
    const cut = Math.min(r * Math.tan(turn / 2), a.distanceTo(b) * 0.45, b.distanceTo(c) * 0.45);
    const s = b.clone().addScaledVector(d1, -cut), e = b.clone().addScaledVector(d2, cut);
    for (let k = 0; k <= 8; k++) { const u = k / 8; out.push(s.clone().multiplyScalar((1 - u) ** 2).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(e, u * u)); }
  }
  out.push(P[P.length - 1].clone());
  return out;
}
const RAW = rounded(ROUTE, 16), RAW_S = [0];
for (let k = 1; k < RAW.length; k++) RAW_S.push(RAW_S[k - 1] + RAW[k].distanceTo(RAW[k - 1]));
/** La strada campionata ogni 2 m, con i metri percorsi di ogni punto. */
export const LINE = Array.from({ length: Math.ceil(RAW_S[RAW_S.length - 1] / 2) + 1 }, (_, k) => pointAt(RAW, RAW_S, Math.min(k * 2, RAW_S[RAW_S.length - 1])));
export const LINE_S = [0];
for (let k = 1; k < LINE.length; k++) LINE_S.push(LINE_S[k - 1] + LINE[k].distanceTo(LINE[k - 1]));
export const LENGTH = LINE_S[LINE_S.length - 1];
/** Lo striscione d'arrivo, un po' prima della fine della strada (dopo si frena). */
export const FINISH_S = LENGTH - 60;

export const roadAt = (s: number) => pointAt(LINE, LINE_S, s);
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
export const VILLAGE: [number, number] = [nearestS(-410, 140), nearestS(-300, -80)];
/** Il fiume (da sud a nord) e il punto della strada dove c'è il ponte. */
const RIVER_LINE = new THREE.CatmullRomCurve3([[230, -560], [170, -250], [160, 0], [110, 250], [60, 600]].map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(80);
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

/** Campi coltivati a scacchiera: grano, erba medica, terra arata, girasoli. */
export interface Field { poly: Poly; crop: number }
export const FIELDS: Field[] = (() => {
  const rnd = seeded(31), out: Field[] = [];
  for (let x = -880; x < 880; x += 110) for (let z = -520; z < 520; z += 95) {
    // Mai sovrapposti (due campi alla stessa quota sfarfallerebbero): tra uno e l'altro resta una siepe d'erba.
    const a = (rnd() - 0.5) * 0.08, w = 94 + rnd() * 8, h = 80 + rnd() * 7, cx = x + 55, cz = z + 47;
    const c = (dx: number, dz: number): V2 => [cx + dx * Math.cos(a) - dz * Math.sin(a), cz + dx * Math.sin(a) + dz * Math.cos(a)];
    out.push({ poly: poly([c(-w / 2, -h / 2), c(w / 2, -h / 2), c(w / 2, h / 2), c(-w / 2, h / 2)]), crop: Math.floor(rnd() * 4) });
  }
  return out;
})();

export const TREES: Tree[] = (() => {
  const rnd = seeded(77), out: Tree[] = [];
  const keepOut = [strip(LINE, LINE_S, 0, LENGTH, () => ROAD_HALF + 6), RIVER_BANK, PASTURE,
    strip(LINE, LINE_S, VILLAGE[0] - 20, VILLAGE[1] + 20, () => 30), strip(LINE, LINE_S, BARRIERS[0] - 20, LENGTH, () => 40)];
  const roadside = strip(LINE, LINE_S, 0, LENGTH, () => ROAD_HALF + 14);
  for (let i = 0; i < 5200; i++) {
    const x = (rnd() * 2 - 1) * 980, z = (rnd() * 2 - 1) * 640;
    if (keepOut.some((p) => inside(p, x, z))) continue;
    // Fitto nei boschi, a filari lungo la strada, radi tra i campi.
    const chance = WOODS.some((w) => inside(w, x, z)) ? 0.9 : inside(roadside, x, z) ? 0.35 : Math.abs(x) > 900 || Math.abs(z) > 560 ? 0.4 : 0.03;
    if (rnd() > chance) continue;
    out.push({ x, z, h: 9 + rnd() * 8, pine: rnd() < 0.3, tint: rnd() });
  }
  return out;
})();

/** Case del paese: [x, z, angolo, larghezza, profondità, piani]. */
export const HOUSES: [number, number, number, number, number, number][] = (() => {
  const rnd = seeded(5), out: [number, number, number, number, number, number][] = [];
  for (let s = VILLAGE[0]; s < VILLAGE[1]; s += 13) for (const side of [-1, 1]) {
    if (rnd() < 0.15) continue;
    const p = roadAt(s), d = roadDir(s), off = ROAD_HALF + 5.5 + rnd() * 2, w = 8 + rnd() * 3, dep = 7 + rnd() * 3;
    out.push([p.x - d.z * side * (off + dep / 2), p.z + d.x * side * (off + dep / 2), Math.atan2(d.z, d.x), w, dep, 1 + Math.floor(rnd() * 3)]);
  }
  return out;
})();
