import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, SPORT } from '../config';
import type { Actor } from '../sim/match';

export interface Athlete {
  body: THREE.Group; torso: THREE.Group; head: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group;
  wristL: THREE.Group; wristR: THREE.Group;
}
const SKIN = [0xe8b58d, 0xba8059, 0x805139, 0xd59b74, 0x593b2e];
const HAIR = [0x241c19, 0x4a3022, 0x171a23, 0x9b6b38];
const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
const sphere = new THREE.SphereGeometry(1, 10, 7);
const box = new RoundedBoxGeometry(1, 1, 1, 1, 0.1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
type Part = { geometry: THREE.BufferGeometry; color: number; at: [number, number, number]; size: [number, number, number] };
type Ring = [number, number, number];

/** Contoured cross-sections give the chest, jaw and limbs flatter anatomical planes. */
function loft(profile: Ring[], sides = 10, squareness = 0.78) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  profile.forEach(([y, rx, rz], row) => {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const x = Math.cos(angle), z = Math.sin(angle);
      positions.push(Math.sign(x) * Math.abs(x) ** squareness * rx, y, Math.sign(z) * Math.abs(z) ** squareness * rz);
      uv.push(side / sides, row / (profile.length - 1));
      if (row > 0) {
        const a = (row - 1) * sides + side, b = (row - 1) * sides + (side + 1) % sides;
        const c = row * sides + side, d = row * sides + (side + 1) % sides;
        indices.push(a, c, b, b, c, d);
      }
    }
  });
  for (const row of [0, profile.length - 1]) {
    const center = positions.length / 3; positions.push(0, profile[row][0], 0); uv.push(0.5, row === 0 ? 0 : 1);
    for (let side = 0; side < sides; side++) {
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(center, row === 0 ? a : b, row === 0 ? b : a);
    }
  }
  const result = new THREE.BufferGeometry(); result.setIndex(indices);
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); result.computeVertexNormals();
  return result;
}
const limb = loft([[-0.5, 0.67, 0.72], [-0.42, 0.82, 0.85], [-0.12, 1, 1], [0.36, 0.92, 0.95], [0.5, 0.78, 0.8]]);
const chest = loft([[0, 0.105, 0.16], [0.1, 0.115, 0.165], [0.34, 0.135, 0.22], [0.44, 0.14, 0.235], [0.51, 0.11, 0.17], [0.55, 0.067, 0.075]], 12, 0.62);
const skull = loft([[-0.16, 0.075, 0.065], [-0.12, 0.102, 0.084], [-0.06, 0.12, 0.105], [0.045, 0.12, 0.11], [0.115, 0.103, 0.095], [0.15, 0.05, 0.047]], 12);
const hairCap = loft([[0.065, 0.119, 0.107], [0.125, 0.108, 0.1], [0.172, 0.044, 0.038]], 12);
const nose = loft([[-0.044, 0.012, 0.012], [-0.024, 0.022, 0.016], [0.01, 0.008, 0.008]], 8);
const handShape = loft([[-0.08, 0.016, 0.019], [-0.064, 0.023, 0.029], [-0.02, 0.02, 0.026], [0.015, 0.014, 0.018]], 8);
const shoeShape = loft([[-0.12, 0.03, 0.047], [-0.085, 0.046, 0.064], [0.07, 0.038, 0.062], [0.125, 0.022, 0.043]], 10).rotateZ(-Math.PI / 2);
const oval = (color: number, at: Part['at'], size: Part['size']): Part => ({ geometry: sphere, color, at, size });
const slab = (color: number, at: Part['at'], size: Part['size']): Part => ({ geometry: box, color, at, size });
const section = (color: number, at: Part['at'], size: Part['size']): Part => ({ geometry: limb, color, at, size });
const band = (color: number, at: Part['at'], size: Part['size']): Part => ({ geometry: cylinder, color, at, size });
const shaped = (geometry: THREE.BufferGeometry, color: number, at: Part['at']): Part => ({ geometry, color, at, size: [1, 1, 1] });

function mesh(parts: Part[], castShadow = false) {
  const geometries = parts.map(part => {
    let geometry = part.geometry.clone().scale(...part.size).translate(...part.at);
    if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
    const color = new THREE.Color(part.color), values = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3)); return geometry;
  });
  const result = new THREE.Mesh(mergeGeometries(geometries)!, surface);
  geometries.forEach(geometry => geometry.dispose()); result.castShadow = castShadow;
  return result;
}

export function createAthlete(actor: Actor): Athlete {
  const team = CONFIG.teams[actor.team], extra = ['coach', 'steward', 'fan'].includes(actor.role);
  const player = !extra && actor.role !== 'ref', boxer = SPORT === 'boxe' && player;
  const sleeveless = player && (SPORT === 'basket' || SPORT === 'pallavolo' || boxer);
  const kit = actor.role === 'ref' ? CONFIG.visuals.referee : actor.role === 'steward' ? CONFIG.visuals.steward
    : actor.role === 'fan' ? CONFIG.visuals.fan : actor.role === 'coach' ? { shirt: team.socks, shorts: 0x252d3c, socks: 0x252d3c }
    : { shirt: actor.role === 'gk' ? team.keeper : team.shirt, shorts: team.shorts, socks: team.socks };
  const skin = SKIN[actor.id % SKIN.length], hair = HAIR[actor.id % HAIR.length];
  const accent = actor.team === 0 ? 0xf3f6ff : 0xffddb0;
  const body = new THREE.Group(), torso = new THREE.Group(); torso.position.y = 1.04; body.add(torso);
  body.add(mesh([
    slab(kit.shorts, [0, 0.97, 0], [0.235, 0.18, 0.335]),
    slab(boxer ? 0xf6f2e8 : accent, [0, 1.035, 0], [0.237, 0.025, 0.338]),
  ], true));
  const trunk: Part[] = [shaped(chest, boxer ? skin : kit.shirt, [0, 0, 0]), band(skin, [0, 0.6, 0], [0.052, 0.12, 0.057])];
  if (!boxer) {
    trunk.push(band(accent, [0, 0.54, 0], [0.071, 0.017, 0.078]));
    for (const side of [-1, 1]) {
      trunk.push(slab(accent, [0, 0.27, side * 0.197], [0.04, 0.24, 0.018]));
      if (!sleeveless) trunk.push(section(kit.shirt, [0, 0.425, side * 0.23], [0.079, 0.14, 0.071]));
    }
    trunk.push(slab(accent, [0.139, 0.37, 0.088], [0.005, 0.043, 0.031]));
  }
  torso.add(mesh(trunk, true));
  if (player && !boxer) torso.add(jerseyNumber(actor.id % 99 + 1));

  const head = new THREE.Group(); head.position.y = 0.74;
  const face: Part[] = [shaped(skull, skin, [0, 0, 0]), shaped(hairCap, hair, [-0.008, 0, 0]),
    shaped(nose, skin, [0.128, 0, 0]),
    oval(skin, [-0.01, -0.005, 0.112], [0.015, 0.03, 0.018]),
    oval(skin, [-0.01, -0.005, -0.112], [0.015, 0.03, 0.018]),
    slab(0x70463b, [0.114, -0.085, 0], [0.005, 0.006, 0.039]),
  ];
  for (const side of [-1, 1]) {
    face.push(oval(0xf3eee0, [0.12, 0.016, side * 0.047], [0.004, 0.007, 0.011]));
    face.push(oval(0x28252b, [0.124, 0.017, side * 0.046], [0.002, 0.005, 0.005]));
    face.push(slab(hair, [0.119, 0.042, side * 0.047], [0.006, 0.007, 0.025]));
  }
  if (actor.id % 3 === 0) face.push({ geometry: hairCap, color: hair, at: [-0.012, 0.012, 0], size: [1, 1.1, 1] });
  if (SPORT === 'tennis' && player) face.push(band(0xf5f2e9, [0, 0.049, 0], [0.121, 0.022, 0.114]));
  if (SPORT === 'pallavolo' && player && actor.id % 2 === 0) face.push(section(hair, [-0.135, 0.015, 0], [0.029, 0.18, 0.035]));
  head.add(mesh(face)); torso.add(head);

  const leg = (side: number) => {
    const root = new THREE.Group(); root.position.set(0, 0.92, side * 0.102);
    root.add(mesh([
      section(skin, [0, -0.215, 0], [0.074, 0.43, 0.077]),
      section(kit.shorts, [0, -0.06, 0], [0.083, boxer ? 0.26 : 0.22, 0.088]),
      slab(accent, [0, -0.068, side * 0.078], [0.035, 0.15, 0.004]),
    ], true));
    const knee = new THREE.Group(); knee.position.y = -0.43;
    const highSock = SPORT === 'calcio' || boxer || extra || actor.role === 'ref';
    const shoe = player ? (actor.team === 0 ? 0xf4efdb : 0x20273a) : 0x20273a;
    const lower: Part[] = [
      oval(skin, [0, 0, 0], [0.05, 0.052, 0.058]),
      section(skin, [0, -0.2, 0], [0.056, 0.4, 0.06]),
      section(kit.socks, [0, highSock ? -0.245 : -0.35, 0], [0.048, highSock ? 0.29 : 0.08, 0.055]),
      shaped(shoeShape, shoe, [0.054, -0.41, 0]),
      { geometry: shoeShape, color: 0xdce2ea, at: [0.054, -0.449, 0], size: [1.02, 0.25, 1.04] },
      slab(accent, [0.072, -0.399, side * 0.066], [0.1, 0.014, 0.004]),
    ];
    if (SPORT === 'pallavolo' && player) lower.push(slab(kit.shorts, [0.036, -0.012, 0], [0.063, 0.087, 0.112]));
    knee.add(mesh(lower)); root.add(knee); body.add(root); return { root, knee };
  };
  const arm = (side: number) => {
    const root = new THREE.Group(); root.position.set(0, 0.5, side * 0.238);
    const upper: Part[] = [section(skin, [0, -0.15, 0], [0.05, 0.3, 0.056])];
    if (!sleeveless) upper.push(section(kit.shirt, [0, -0.042, 0], [0.059, 0.13, 0.063]));
    root.add(mesh(upper));
    const elbow = new THREE.Group(); elbow.position.y = -0.3;
    const lower: Part[] = [oval(skin, [0, 0, 0], [0.036, 0.043, 0.041]), section(skin, [0, -0.14, 0], [0.041, 0.28, 0.046])];
    if (SPORT === 'tennis' && player) lower.push(band(0xf4f0e8, [0, -0.24, 0], [0.032, 0.038, 0.036]));
    elbow.add(mesh(lower)); root.add(elbow); torso.add(root);
    const wrist = new THREE.Group(); wrist.position.y = -0.27; elbow.add(wrist);
    const hand: Part[] = [shaped(handShape, skin, [0.01, 0, 0])];
    if (boxer || actor.role === 'gk') {
      hand.push(band(0xf4efdf, [0, 0.005, 0], [0.039, 0.055, 0.042]));
      hand.push(slab(boxer ? kit.shorts : 0xe4f349, [0.027, -0.053, 0], boxer ? [0.14, 0.18, 0.124] : [0.055, 0.11, 0.09]));
      if (boxer) hand.push(oval(kit.shorts, [0.07, -0.05, side * 0.047], [0.043, 0.06, 0.034]));
    }
    wrist.add(mesh(hand)); return { root, elbow, wrist };
  };
  const leftLeg = leg(1), rightLeg = leg(-1), leftArm = arm(1), rightArm = arm(-1);
  if (SPORT === 'tennis' && player) rightArm.wrist.add(racket(team.shirt));
  // The body pivots at the pelvis, while the chest has its own hinge above it.
  body.children.forEach(child => { child.position.y -= 0.94; }); body.position.y = 0.94;
  return { body, torso, head, legL: leftLeg.root, legR: rightLeg.root, kneeL: leftLeg.knee,
    kneeR: rightLeg.knee, armL: leftArm.root, armR: rightArm.root, elbowL: leftArm.elbow, elbowR: rightArm.elbow,
    wristL: leftArm.wrist, wristR: rightArm.wrist };
}

function jerseyNumber(number: number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fffaf0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 90px Arial'; ctx.fillText(String(number), 64, 65);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const front = new THREE.PlaneGeometry(0.13, 0.17).rotateY(Math.PI / 2).translate(0.136, 0.28, 0);
  const back = new THREE.PlaneGeometry(0.16, 0.2).rotateY(-Math.PI / 2).translate(-0.136, 0.3, 0);
  const result = new THREE.Mesh(mergeGeometries([front, back])!, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  front.dispose(); back.dispose(); return result;
}

function racket(color: number) {
  const group = new THREE.Group(); group.rotation.y = Math.PI / 2;
  const frame = new THREE.TorusGeometry(0.205, 0.014, 5, 28);
  group.add(mesh([band(0x252c39, [0, -0.16, 0], [0.02, 0.27, 0.02]),
    band(0xebf0f6, [0, -0.31, 0], [0.014, 0.12, 0.014]),
    { geometry: frame, color, at: [0, -0.57, 0], size: [1, 1.28, 1] }])); frame.dispose();
  const points: number[] = [];
  for (let i = -4; i <= 4; i++) {
    const offset = i * 0.042, extent = Math.sqrt(0.195 ** 2 - offset ** 2);
    points.push(offset, -0.57 - extent * 1.28, 0, offset, -0.57 + extent * 1.28, 0);
    points.push(-extent, -0.57 + offset * 1.28, 0, extent, -0.57 + offset * 1.28, 0);
  }
  const strings = new THREE.BufferGeometry(); strings.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(strings, new THREE.LineBasicMaterial({ color: 0xd4dedb, transparent: true, opacity: 0.75 })));
  return group;
}
