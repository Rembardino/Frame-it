import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import type { Actor } from './match';

const desired = new THREE.Vector3();
const delta = new THREE.Vector3();
const planted = new Set(['serve', 'receive', 'set', 'spike', 'block', 'shoot', 'jab', 'hook', 'uppercut', 'crouch']);
const grounded = (a: Actor) => a.pose === 'fall' || a.pose === 'dive' || a.pose === 'tackle';
const player = (a: Actor) => !['ref', 'coach', 'fan', 'steward'].includes(a.role);

/** Arrive, brake before sharp cuts, and yield before bodies overlap. No random steering. */
export function steerActor(a: Actor, neighbors: readonly Actor[], dt: number) {
  desired.subVectors(a.target, a.pos).setY(0);
  const distance = desired.length();
  const speed = a.vel.length();
  let limit = a.speedLimit;
  if (a.pose === 'windUp') limit = Math.min(limit, 2.2);
  if (a.pose === 'racket' || a.pose === 'backhand') limit = Math.min(limit, 1.1);
  if (planted.has(a.pose)) limit = Math.min(limit, a.pose === 'crouch' ? 0.45 : 0.3);
  const accel = CONFIG.match.accel;
  if (distance > 0.001) {
    desired.divideScalar(distance);
    // A reversal starts with deceleration, rather than a full-speed sideways slide.
    const alignment = speed > 0.1 ? desired.dot(a.vel) / speed : 1;
    const corner = THREE.MathUtils.clamp((alignment + 1) / 2, 0.25, 1);
    desired.multiplyScalar(Math.min(limit * corner, Math.sqrt(2 * accel * distance), distance * 3));
  } else desired.set(0, 0, 0);

  if (distance > 0.15 && !planted.has(a.pose)) {
    for (const other of neighbors) {
      if (other === a || grounded(other)) continue;
      const dx = a.pos.x - other.pos.x, dz = a.pos.z - other.pos.z;
      const horizon = 2.5 + speed * 0.3;
      if (dx * dx + dz * dz > horizon * horizon) continue;
      const vx = a.vel.x - other.vel.x, vz = a.vel.z - other.vel.z;
      const t = THREE.MathUtils.clamp(-(dx * vx + dz * vz) / (vx * vx + vz * vz + 0.01), 0, 0.65);
      const px = dx + vx * t, pz = dz + vz * t;
      const gap = Math.hypot(px, pz);
      const space = SPORT === 'boxe' ? 0.85 : 0.95;
      if (gap >= space) continue;
      const weight = a.scripted ? 0.35 : other.scripted ? 1.3 : 0.8;
      // At an exact head-on crossing use a consistent side, so neither oscillates.
      const nx = gap > 0.2 ? px / gap : speed > 0.1 ? -a.vel.z / speed : 0;
      const nz = gap > 0.2 ? pz / gap : speed > 0.1 ? a.vel.x / speed : (a.id < other.id ? -1 : 1);
      const danger = (space - gap) / space;
      desired.multiplyScalar(1 - danger * 0.45);
      desired.x += nx * danger * Math.max(1.5, limit) * weight * 1.1;
      desired.z += nz * danger * Math.max(1.5, limit) * weight * 1.1;
    }
  }
  desired.clampLength(0, limit);
  delta.copy(desired).sub(a.vel).clampLength(0, accel * dt);
  a.vel.add(delta);
  if (distance < 0.025 && a.vel.lengthSq() < 0.0025) a.vel.set(0, 0, 0);
  a.pos.addScaledVector(a.vel, dt);
}

/** Small residual corrections; a planted athlete keeps priority over a running one. */
export function separateActors(actors: readonly Actor[], dt: number) {
  const space = SPORT === 'boxe' ? 0.85 : 0.72 * CONFIG.visuals.playerScale;
  for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
    const a = actors[i], b = actors[j];
    if (grounded(a) || grounded(b)) continue;
    let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= space) continue;
    if (distance < 0.001) { dx = 0; dz = a.id < b.id ? 1 : -1; }
    else { dx /= distance; dz /= distance; }
    const push = Math.min(1.2 * dt, (space - distance) * (1 - Math.exp(-dt * 12)));
    const aWeight = planted.has(a.pose) ? 0.2 : 1;
    const bWeight = planted.has(b.pose) ? 0.2 : 1;
    const share = aWeight / (aWeight + bWeight);
    a.pos.x -= dx * push * share; a.pos.z -= dz * push * share;
    b.pos.x += dx * push * (1 - share); b.pos.z += dz * push * (1 - share);
  }
  for (const a of actors) {
    if (!player(a)) continue;
    const edgeX = CONFIG.pitch.length / 2 - 0.4, edgeZ = CONFIG.pitch.width / 2 - 0.4;
    const x = THREE.MathUtils.clamp(a.pos.x, -edgeX, edgeX);
    const z = THREE.MathUtils.clamp(a.pos.z, -edgeZ, edgeZ);
    if (x !== a.pos.x) a.vel.x = 0;
    if (z !== a.pos.z) a.vel.z = 0;
    a.pos.x = x; a.pos.z = z;
  }
}
