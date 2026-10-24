/**
 * Forme dei mondi all'aperto (golf, ciclismo, vela): poligoni, ellissi irregolari, strisce attorno a una linea.
 * La grafica disegna questi poligoni e la simulazione li usa per sapere dove si trova qualcosa. Metri, piano x/z.
 */
import * as THREE from 'three';

export type V2 = [number, number];
export interface Poly { pts: V2[]; box: [number, number, number, number] }
/** Ellisse un po' irregolare: centro, raggi, rotazione (radianti). */
export interface Blob { c: V2; r: V2; rot?: number }
/** Un albero: posizione, altezza, pino o latifoglia, sfumatura di verde (0..1). */
export interface Tree { x: number; z: number; h: number; pine: boolean; tint: number }

export function poly(pts: V2[]): Poly {
  const box: Poly['box'] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of pts) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], z); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], z); }
  return { pts, box };
}

export function inside(p: Poly, x: number, z: number) {
  const [x0, z0, x1, z1] = p.box;
  if (x < x0 || x > x1 || z < z0 || z > z1) return false;
  let hit = false;
  for (let i = 0, j = p.pts.length - 1; i < p.pts.length; j = i++) {
    const [xi, zi] = p.pts[i], [xj, zj] = p.pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** Contorno di un blob, allargato di grow metri. seed cambia le "bozze" del bordo. */
export function blob(b: Blob, grow = 0, seed = 0, n = 48): Poly {
  const rot = b.rot ?? 0, pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.07 * Math.sin(3 * a + seed) + 0.04 * Math.sin(5 * a + seed * 1.7);
    const x = Math.cos(a) * (b.r[0] * wob + grow), z = Math.sin(a) * (b.r[1] * wob + grow);
    pts.push([b.c[0] + x * Math.cos(rot) - z * Math.sin(rot), b.c[1] + x * Math.sin(rot) + z * Math.cos(rot)]);
  }
  return poly(pts);
}

/** Striscia attorno a una linea (s da s0 a s1), con mezza larghezza w(s) e le estremità arrotondate. */
export function strip(line: THREE.Vector3[], lineS: number[], s0: number, s1: number, w: (s: number) => number): Poly {
  const at = (s: number) => pointAt(line, lineS, s);
  const left: V2[] = [], right: V2[] = [];
  const steps = Math.max(2, Math.ceil((s1 - s0) / 4));
  for (let i = 0; i <= steps; i++) {
    const s = s0 + ((s1 - s0) * i) / steps, p = at(s), d = at(Math.min(s1, s + 1)).sub(at(Math.max(s0, s - 1))).normalize();
    const hw = w(s);
    left.push([p.x - d.z * hw, p.z + d.x * hw]);
    right.push([p.x + d.z * hw, p.z - d.x * hw]);
  }
  const cap = (s: number, sign: number): V2[] => {
    const p = at(s), d = at(Math.min(s1, s + 1)).sub(at(Math.max(s0, s - 1))).normalize(), hw = w(s), out: V2[] = [];
    for (let k = 1; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      // Da sinistra a destra passando davanti (sign = 1) o dietro (sign = -1).
      const nx = -d.z * Math.cos(a) + sign * d.x * Math.sin(a), nz = d.x * Math.cos(a) + sign * d.z * Math.sin(a);
      out.push([p.x + nx * hw, p.z + nz * hw]);
    }
    return out;
  };
  return poly([...left, ...cap(s1, 1), ...right.reverse(), ...cap(s0, -1).reverse()]);
}

export function pointAt(line: THREE.Vector3[], lineS: number[], s: number) {
  const total = lineS[lineS.length - 1];
  s = THREE.MathUtils.clamp(s, 0, total);
  // Primo punto con lineS >= s (ricerca binaria: la strada del ciclismo ha migliaia di punti).
  let i = 1, hi = lineS.length - 1;
  while (i < hi) { const mid = (i + hi) >> 1; if (lineS[mid] < s) i = mid + 1; else hi = mid; }
  const u = (s - lineS[i - 1]) / Math.max(1e-6, lineS[i] - lineS[i - 1]);
  return line[i - 1].clone().lerp(line[i], u);
}

/** Generatore casuale con seme: gli alberi sono sempre gli stessi (anche nei test). */
export function seeded(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}


/** Punto a caso dentro un poligono (o null se non lo trova). */
export function randomIn(p: Poly, rnd = Math.random, shrinkTo?: V2): V2 | null {
  for (let k = 0; k < 60; k++) {
    let x = p.box[0] + rnd() * (p.box[2] - p.box[0]), z = p.box[1] + rnd() * (p.box[3] - p.box[1]);
    // Più verso il centro: la palla non resta in bilico sul bordo.
    if (shrinkTo) { x = shrinkTo[0] + (x - shrinkTo[0]) * 0.55; z = shrinkTo[1] + (z - shrinkTo[1]) * 0.55; }
    if (inside(p, x, z)) return [x, z];
  }
  return null;
}
