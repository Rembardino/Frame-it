/**
 * PERCORSO DI GOLF — 6 buche ad anello attorno a un grande lago. Solo dati e geometria, niente grafica.
 *
 * Ogni superficie (fairway, green, bunker, acqua...) è un poligono: la grafica disegna proprio quelli
 * e lieAt() li usa per sapere dove si è fermata la palla. Metri; x = est, z = sud (la stessa convenzione
 * degli altri campi). Per cambiare una buca basta spostare i numeri in HOLES.
 */
import * as THREE from 'three';

import { blob, inside, poly, pointAt, randomIn, seeded, strip, type Blob, type Poly, type Tree, type V2 } from './shapes';

export { inside, pointAt, randomIn, type Poly, type Tree, type V2 };
export type Lie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'water' | 'fringe' | 'green';

interface HoleDef {
  par: 3 | 4 | 5;
  tee: V2;
  /** Linea di gioco dal tee al centro del green (i punti in mezzo fanno i dogleg). */
  path: V2[];
  /** Mezza larghezza del fairway (0 = par 3, niente fairway). */
  width: number;
  green: Blob;
  pin: V2;
  bunkers: Blob[];
  water?: Blob[];
}

const HOLES: HoleDef[] = [
  { par: 4, tee: [-390, 205], path: [[-390, 205], [-215, 192], [-38, 214]], width: 17,
    green: { c: [-38, 214], r: [17, 13], rot: 0.15 }, pin: [-34, 211],
    bunkers: [{ c: [-178, 213], r: [12, 5.5], rot: 0.12 }, { c: [-160, 178], r: [9, 5] },
      { c: [-40, 232], r: [10, 4.5], rot: 0.25 }, { c: [-19, 198], r: [7, 5], rot: -0.4 }] },
  { par: 3, tee: [12, 172], path: [[12, 172], [150, 108]], width: 0,
    green: { c: [150, 108], r: [15, 12], rot: -0.4 }, pin: [152, 111],
    bunkers: [{ c: [167, 93], r: [8, 4.5], rot: -0.4 }, { c: [135, 95], r: [6, 4] }, { c: [168, 122], r: [5, 4] }],
    water: [{ c: [82, 142], r: [36, 20], rot: -0.45 }] },
  { par: 5, tee: [195, 160], path: [[195, 160], [325, 128], [372, -10], [338, -196]], width: 19,
    green: { c: [338, -196], r: [18, 14], rot: 0.3 }, pin: [341, -199],
    bunkers: [{ c: [381, 30], r: [11, 6], rot: 1.25 }, { c: [338, 12], r: [9, 5], rot: 1.2 },
      { c: [320, -214], r: [8, 5], rot: 0.3 }, { c: [358, -188], r: [6, 9], rot: 0.2 }],
    water: [{ c: [318, -62], r: [15, 28], rot: 0.1 }] },
  { par: 4, tee: [300, -248], path: [[300, -248], [128, -252], [-50, -216]], width: 17,
    green: { c: [-50, -216], r: [16, 13], rot: -0.1 }, pin: [-53, -214],
    bunkers: [{ c: [110, -268], r: [12, 5.5] }, { c: [95, -235], r: [9, 5], rot: 0.1 },
      { c: [-38, -233], r: [8, 4.5], rot: -0.2 }, { c: [-65, -200], r: [9, 4], rot: 0.3 }] },
  { par: 3, tee: [-98, -172], path: [[-98, -172], [-246, -212]], width: 0,
    green: { c: [-246, -212], r: [14, 12], rot: 0.2 }, pin: [-243, -210],
    bunkers: [{ c: [-232, -226], r: [9, 4], rot: 0.3 }, { c: [-262, -198], r: [6, 7] }, { c: [-250, -194], r: [5, 3.5] }],
    water: [{ c: [-170, -214], r: [26, 13], rot: 0.25 }] },
  { par: 4, tee: [-290, -248], path: [[-290, -248], [-352, -60], [-346, 124]], width: 18,
    green: { c: [-346, 124], r: [18, 14], rot: 0.1 }, pin: [-343, 127],
    bunkers: [{ c: [-376, -30], r: [11, 6], rot: 1.5 }, { c: [-326, -20], r: [9, 5], rot: 1.4 },
      { c: [-326, 112], r: [8, 5], rot: 0.4 }, { c: [-366, 140], r: [8, 6] }],
    water: [{ c: [-316, -100], r: [12, 20], rot: 0.2 }] },
];

/** Il grande lago al centro (anche lui è acqua, se ci finisce la palla). */
const LAKE: Blob = { c: [20, -5], r: [115, 62], rot: 0.15 };
/** Club house con terrazza, vicino al tee della 1 e al green della 6. */
export const CLUBHOUSE = { at: [-430, 132] as V2, size: [12, 18] as V2 };
/** Limiti del percorso (il drone può uscire di poco). */
export const BOUNDS = { x: 450, z: 300 };

// ==================================================================== le buche

export interface Hole extends HoleDef {
  n: number;
  /** Linea di gioco campionata ogni ~2 m, e la lunghezza progressiva di ogni punto. */
  line: THREE.Vector3[];
  lineS: number[];
  length: number;
  /** Dove finisce il fairway (s): oltre c'è il green. */
  fairwayEnd: number;
  greenPoly: Poly; fringePoly: Poly; teePoly: Poly; fairwayPoly: Poly | null;
  bunkerPolys: Poly[]; lipPolys: Poly[]; waterPolys: Poly[]; bankPolys: Poly[];
  /** Fascia di gioco senza alberi (fairway più il rough ai lati). */
  corridor: Poly;
  /** Tribuna dietro il green: centro della prima fila e direzione verso cui guarda. */
  stand: { at: V2; forward: V2 };
}

export const COURSE: Hole[] = HOLES.map((def, i) => {
  const curve = new THREE.CatmullRomCurve3(def.path.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const line = curve.getSpacedPoints(Math.ceil(curve.getLength() / 2));
  const lineS = [0];
  for (let k = 1; k < line.length; k++) lineS.push(lineS[k - 1] + line[k].distanceTo(line[k - 1]));
  const length = lineS[lineS.length - 1];
  const greenR = Math.max(...def.green.r);
  const fairwayEnd = length - greenR * 0.7;
  const fairwayPoly = def.width ? strip(line, lineS, Math.min(95, length * 0.28), fairwayEnd,
    (s) => def.width * (0.88 + 0.12 * Math.sin(s / 43 + i * 1.3)) * (1 - 0.3 * THREE.MathUtils.smoothstep(s, fairwayEnd - 45, fairwayEnd))) : null;
  const d = line[3].clone().sub(line[0]).setY(0).normalize();
  const [tx, tz] = def.tee;
  const corner = (a: number, b: number): V2 => [tx + d.x * a - d.z * b, tz + d.z * a + d.x * b];
  const teePoly = poly([corner(-10, -5), corner(10, -5), corner(10, 5), corner(-10, 5)]);
  const end = line[line.length - 1].clone().sub(line[line.length - 4]).setY(0).normalize();
  const back = greenR + 13;
  return {
    ...def, n: i + 1, line, lineS, length, fairwayEnd,
    greenPoly: blob(def.green, 0, i), fringePoly: blob(def.green, 2.4, i),
    teePoly, fairwayPoly,
    bunkerPolys: def.bunkers.map((b, k) => blob(b, 0, i * 7 + k)),
    lipPolys: def.bunkers.map((b, k) => blob(b, 1.1, i * 7 + k)),
    waterPolys: (def.water ?? []).map((w, k) => blob(w, 0, i * 3 + k)),
    bankPolys: (def.water ?? []).map((w, k) => blob(w, 2.2, i * 3 + k)),
    corridor: strip(line, lineS, 0, length, () => (def.width || 11) + 16),
    stand: { at: [def.green.c[0] + end.x * back, def.green.c[1] + end.z * back], forward: [-end.x, -end.z] },
  };
});

export const LAKE_POLY = blob(LAKE, 0, 11, 72);
export const LAKE_BANK = blob(LAKE, 3, 11, 72);
const WATER = [LAKE_POLY, ...COURSE.flatMap((h) => h.waterPolys)];
const BUNKERS = COURSE.flatMap((h) => h.bunkerPolys);

/** Su cosa sta la palla in (x, z). */
export function lieAt(x: number, z: number): Lie {
  if (WATER.some((p) => inside(p, x, z))) return 'water';
  if (BUNKERS.some((p) => inside(p, x, z))) return 'bunker';
  if (COURSE.some((h) => inside(h.greenPoly, x, z))) return 'green';
  if (COURSE.some((h) => inside(h.fringePoly, x, z))) return 'fringe';
  if (COURSE.some((h) => inside(h.teePoly, x, z))) return 'tee';
  if (COURSE.some((h) => h.fairwayPoly && inside(h.fairwayPoly, x, z))) return 'fairway';
  return 'rough';
}

/** s del punto della linea di gioco più vicino a (x, z). */
export function nearestS(h: Hole, x: number, z: number) {
  let best = 0, bestD = Infinity;
  h.line.forEach((p, k) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bestD) { bestD = d; best = h.lineS[k]; } });
  return best;
}

/** Vialetti dei golf cart: dal green di ogni buca al tee della successiva. */
export const PATHS: Poly[] = COURSE.map((h, i) => {
  const next = COURSE[(i + 1) % COURSE.length];
  const from = new THREE.Vector3(h.green.c[0], 0, h.green.c[1]), to = new THREE.Vector3(next.tee[0], 0, next.tee[1]);
  const side = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize();
  const a = from.clone().lerp(to, 0.15).addScaledVector(side, Math.max(...h.green.r) + 6);
  const b = from.clone().lerp(to, 0.85).addScaledVector(side, 7);
  const pts = new THREE.CatmullRomCurve3([a, from.clone().lerp(to, 0.5).addScaledVector(side, 10), b]).getSpacedPoints(24);
  const s = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + pts[k].distanceTo(pts[k - 1]));
  return strip(pts, s, 0, s[s.length - 1], () => 1.3);
});

// ==================================================================== alberi

export const TREES: Tree[] = (() => {
  const rnd = seeded(2024), out: Tree[] = [];
  const grow = (h: Hole) => [blob(h.green, 20), ...h.bunkers.map((b) => blob(b, 5)), ...(h.water ?? []).map((w) => blob(w, 6))];
  const keepOut = [...COURSE.flatMap((h) => [h.corridor, ...grow(h)]), blob(LAKE, 8, 11, 72),
    poly([[CLUBHOUSE.at[0] - 30, CLUBHOUSE.at[1] - 32], [CLUBHOUSE.at[0] + 38, CLUBHOUSE.at[1] - 32], [CLUBHOUSE.at[0] + 38, CLUBHOUSE.at[1] + 34], [CLUBHOUSE.at[0] - 30, CLUBHOUSE.at[1] + 34]]),
    ...COURSE.map((h) => blob({ c: h.stand.at, r: [24, 24] })), ...PATHS];
  const nearPlay = COURSE.map((h) => strip(h.line, h.lineS, 0, h.length, () => (h.width || 11) + 55));
  for (let i = 0; i < 3400; i++) {
    const x = (rnd() * 2 - 1) * 580, z = (rnd() * 2 - 1) * 410;
    if (keepOut.some((p) => inside(p, x, z))) continue;
    const course = Math.abs(x) < BOUNDS.x && Math.abs(z) < BOUNDS.z;
    const chance = !course ? 0.5 : nearPlay.some((p) => inside(p, x, z)) ? 0.6 : 0.2;
    if (rnd() > chance) continue;
    out.push({ x, z, h: 9 + rnd() * 9, pine: rnd() < 0.4, tint: rnd() });
  }
  return out;
})();

/** L'albero più vicino a (x, z) entro max metri (per la palla che finisce tra le fronde). */
export function nearestTree(x: number, z: number, max: number): Tree | null {
  let best: Tree | null = null, bestD = max * max;
  for (const t of TREES) { const d = (t.x - x) ** 2 + (t.z - z) ** 2; if (d < bestD) { bestD = d; best = t; } }
  return best;
}
