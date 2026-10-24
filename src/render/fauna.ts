/**
 * Gli animali, disegnati con poche forme (stile low-poly come il resto). Ogni specie ha un modello
 * costruito una volta e riusato; zampe e ali si muovono col passo calcolato in sim/fauna.ts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY, type Species } from '../sim/fauna';
import type { Match } from '../sim/match';

type Part = [THREE.BufferGeometry, number];
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
const ball = (rx: number, ry: number, rz: number, x: number, y: number, z: number) => new THREE.SphereGeometry(1, 9, 6).scale(rx, ry, rz).translate(x, y, z);
const stick = (r: number, len: number, x: number, y: number, z: number, rotZ = 0) =>
  new THREE.CylinderGeometry(r * 0.8, r, len, 6).translate(0, -len / 2, 0).rotateZ(rotZ).translate(x, y, z);

function mesh(parts: Part[]) {
  const geometries = parts.map(([g, color]) => {
    const flat = g.toNonIndexed(); g.dispose();
    const c = new THREE.Color(color), values = new Float32Array(flat.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) { values[i] = c.r; values[i + 1] = c.g; values[i + 2] = c.b; }
    flat.setAttribute('color', new THREE.BufferAttribute(values, 3));
    return flat;
  });
  const m = new THREE.Mesh(mergeGeometries(geometries)!, material);
  geometries.forEach((g) => g.dispose());
  m.castShadow = true;
  return m;
}

interface View { root: THREE.Group; legs: THREE.Object3D[]; wings: THREE.Object3D[] }

/** Quadrupede: corpo, collo e testa, quattro zampe che oscillano. */
function quadruped(species: Species): View {
  const P = {
    deer: { leg: 0.8, neck: 0.55, head: 0.13, color: 0x8a5a36, belly: 0xd9c3a3 },
    fox: { leg: 0.24, neck: 0.1, head: 0.09, color: 0xd2691e, belly: 0xf3eadb },
    rabbit: { leg: 0.08, neck: 0.04, head: 0.07, color: 0x9c8b78, belly: 0xe9e2d6 },
    cow: { leg: 0.72, neck: 0.2, head: 0.2, color: 0xf2f0ea, belly: 0x1d1d1d },
    dog: { leg: 0.34, neck: 0.15, head: 0.11, color: 0x6b4a2b, belly: 0xd9c3a3 },
  }[species as 'deer']!;
  const L = BODY[species].len, y = P.leg + L * 0.17, root = new THREE.Group();
  const front = L * 0.42, headY = y + P.neck + P.head * 0.6;
  const parts: Part[] = [
    [ball(L * 0.5, L * 0.19, L * 0.16, 0, y, 0), P.color],
    [ball(L * 0.38, L * 0.1, L * 0.12, 0, y - L * 0.08, 0), P.belly],
    [stick(L * 0.07, P.neck + 0.05, front, headY - P.head * 0.4, 0, 0.5), P.color],
    [ball(P.head * 1.6, P.head, P.head, front + P.head, headY, 0), P.color],
    [ball(P.head * 0.6, P.head * 0.55, P.head * 0.55, front + P.head * 2.4, headY - P.head * 0.3, 0), species === 'cow' ? 0xd99a8a : 0x2a2420],
  ];
  if (species === 'cow') {
    // Macchie nere sul mantello bianco, corna.
    for (const [x, z] of [[-0.3, 0.3], [0.25, -0.33], [-0.55, -0.2], [0.5, 0.2]]) parts.push([ball(L * 0.13, L * 0.12, 0.08, x, y + 0.05, z), 0x1d1d1d]);
    for (const s of [-1, 1]) parts.push([stick(0.03, 0.18, front + P.head, headY + P.head, s * 0.12, s * 0.9), 0xe8e0c8]);
  }
  if (species === 'deer') for (const s of [-1, 1]) {
    parts.push([stick(0.025, 0.42, front + P.head * 0.7, headY + 0.45, s * 0.08, -s * 0.3), 0x6b5134]);
    parts.push([stick(0.02, 0.22, front + P.head * 0.9, headY + 0.35, s * 0.15, s * 0.8), 0x6b5134]);
  }
  if (species === 'rabbit' || species === 'fox' || species === 'dog') for (const s of [-1, 1]) {
    const ear = species === 'rabbit' ? 0.12 : 0.06;
    parts.push([ball(0.02, ear, 0.03, front + P.head * 0.6, headY + P.head + ear * 0.7, s * P.head * 0.5), P.color]);
  }
  // Coda: folta per la volpe (con la punta bianca), un ciuffo per gli altri.
  if (species === 'fox') { parts.push([ball(0.22, 0.07, 0.07, -L * 0.62, y, 0), P.color], [ball(0.07, 0.05, 0.05, -L * 0.82, y - 0.02, 0), 0xf3eadb]); }
  else parts.push([ball(L * 0.06, L * 0.05, L * 0.05, -L * 0.5, y + L * 0.06, 0), species === 'deer' || species === 'rabbit' ? 0xf3eadb : P.color]);
  root.add(mesh(parts));
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[L * 0.3, L * 0.1], [L * 0.3, -L * 0.1], [-L * 0.3, L * 0.1], [-L * 0.3, -L * 0.1]]) {
    const leg = new THREE.Group(); leg.position.set(x, P.leg, z);
    leg.add(mesh([[stick(L * 0.045, P.leg, 0, 0, 0), species === 'cow' ? 0xf2f0ea : P.color], [ball(L * 0.04, 0.025, L * 0.04, 0, -P.leg + 0.02, 0), 0x2a2420]]));
    root.add(leg); legs.push(leg);
  }
  return { root, legs, wings: [] };
}

/** Uccello: corpo, testa col becco, due ali che battono. */
function bird(species: Species): View {
  const P = {
    birds: { body: 0x2b2b30, wing: 0x1e1e22, head: 0x2b2b30, beak: 0xd8a33a, span: 0.5 },
    duck: { body: 0x8a6a4a, wing: 0x6b5236, head: 0x2f6b3a, beak: 0xe0a92a, span: 0.8 },
    gull: { body: 0xf4f4f2, wing: 0xb8bec6, head: 0xf4f4f2, beak: 0xe8c23a, span: 1.2 },
    eagle: { body: 0x5b3b22, wing: 0x4a2f1a, head: 0xf2efe6, beak: 0xe8c23a, span: 2 },
  }[species as 'birds']!;
  const L = BODY[species].len, root = new THREE.Group();
  root.add(mesh([
    [ball(L * 0.5, L * 0.2, L * 0.2, 0, 0, 0), P.body],
    [ball(L * 0.17, L * 0.16, L * 0.16, L * 0.48, L * 0.08, 0), P.head],
    [new THREE.ConeGeometry(L * 0.05, L * 0.18, 5).rotateZ(-Math.PI / 2).translate(L * 0.7, L * 0.06, 0), P.beak],
    [new THREE.BoxGeometry(L * 0.3, 0.01, L * 0.25).translate(-L * 0.55, 0, 0), P.wing],
  ]));
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.add(mesh([[new THREE.BoxGeometry(L * 0.45, 0.012, P.span / 2).translate(0, 0, s * P.span / 4), P.wing]]));
    root.add(wing); wings.push(wing);
  }
  return { root, legs: [], wings };
}

/** Delfino o balena: corpo affusolato, pinna dorsale, coda. */
function swimmer(species: Species): View {
  const L = BODY[species].len, whale = species === 'whale', dark = whale ? 0x2c3640 : 0x7d8b99, root = new THREE.Group();
  root.add(mesh([
    [ball(L * 0.5, L * 0.12, L * 0.12, 0, 0, 0), dark],
    [ball(L * 0.36, L * 0.07, L * 0.09, 0.02, -L * 0.06, 0), 0xe6e9ec],
    [new THREE.ConeGeometry(L * 0.05, L * 0.12, 4).translate(-L * 0.05, L * 0.15, 0), dark],
    [new THREE.BoxGeometry(L * 0.08, 0.04 * L / 2.4, L * 0.32).translate(-L * 0.55, 0, 0), dark],
    [ball(L * 0.08, L * 0.03, L * 0.04, L * 0.52, -L * 0.02, 0), dark],
    ...(whale ? [-1, 1].map((s): Part => [new THREE.BoxGeometry(L * 0.18, 0.15, L * 0.06).translate(L * 0.15, -L * 0.07, s * L * 0.13), dark]) : []),
  ]));
  return { root, legs: [], wings: [] };
}

export class FaunaViews {
  private pools = new Map<Species, View[]>();

  constructor(private scene: THREE.Scene) {}

  private take(species: Species, used: Map<Species, number>) {
    const pool = this.pools.get(species) ?? [];
    this.pools.set(species, pool);
    const k = used.get(species) ?? 0;
    used.set(species, k + 1);
    if (!pool[k]) {
      const b = BODY[species];
      const v = b.fly ? bird(species) : b.swim ? swimmer(species) : quadruped(species);
      v.root.rotation.order = 'YXZ';
      this.scene.add(v.root);
      pool[k] = v;
    }
    pool[k].root.visible = true;
    return pool[k];
  }

  update(match: Match) {
    const used = new Map<Species, number>(), fauna = match.fauna, time = match.time;
    for (const a of fauna.list) for (let i = 0; i < a.n; i++) {
      const p = fauna.at(a, i, time);
      if (!p.visible) continue;
      const v = this.take(a.species, used), b = BODY[a.species];
      v.root.position.copy(p.pos);
      // Chi vola o nuota alza e abbassa il muso seguendo il moto.
      const q = fauna.at(a, i, time + 0.08).pos, moving = q.distanceTo(p.pos) > 0.01;
      const pitch = b.fly || b.swim ? Math.atan2(q.y - p.pos.y, Math.max(0.01, Math.hypot(q.x - p.pos.x, q.z - p.pos.z))) : 0;
      v.root.rotation.set(0, -p.heading, THREE.MathUtils.clamp(pitch, -1.2, 1.2));
      const phase = p.gait * Math.PI * 2;
      const hop = a.species === 'rabbit';
      // Zampe: oscillano solo quando l'animale cammina (da fermo stanno dritte).
      v.legs.forEach((leg, k) => { leg.rotation.z = moving ? Math.sin(phase + (hop ? (k < 2 ? 0 : 1) : [0, Math.PI, Math.PI, 0][k])) * 0.5 : 0; });
      if (hop || (!b.fly && !b.swim && a.species !== 'cow')) v.root.position.y += Math.abs(Math.sin(phase)) * b.h * (hop ? 0.25 : 0.04);
      // Ali: battono in volo (l'aquila plana), chiuse sull'acqua.
      const flying = p.pos.y > 0.4;
      const flap = !flying ? 0.1 : a.species === 'eagle' ? 0.15 * Math.sin(time * 2 + i) + 0.1 : Math.sin(time * (a.species === 'gull' ? 7 : 13) + i * 1.7) * 0.7;
      v.wings.forEach((w, k) => { w.rotation.x = (k ? -1 : 1) * flap; });
    }
    for (const [species, pool] of this.pools) pool.forEach((v, k) => { if (k >= (used.get(species) ?? 0)) v.root.visible = false; });
  }
}
