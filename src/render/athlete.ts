import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, SPORT } from '../config';
import type { Actor, SpectatorLook } from '../sim/match';
import { radialTexture } from './stage';
import { t } from '../i18n';

export interface Athlete {
  body: THREE.Group; torso: THREE.Group; head: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group;
  wristL: THREE.Group; wristR: THREE.Group;
  /** Bocca: si apre in altezza quando il personaggio parla o urla. */
  mouth: THREE.Mesh;
  /** Scatola dell'anello (solo spettatori): compare nella proposta di matrimonio, col suo luccichio. */
  ring?: THREE.Group; sparkle?: THREE.Sprite;
  /** Ciclisti: la bici (va sul gruppo radice, non sul corpo) e le pedivelle che girano. */
  bike?: { group: THREE.Group; crank: THREE.Object3D };
}
const SKIN = [0xe8b58d, 0xba8059, 0x805139, 0xd59b74, 0x593b2e];
const HAIR = [0x241c19, 0x4a3022, 0x171a23, 0x9b6b38];
const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
/** Bocca chiusa = una linea sottile; scalandola in altezza si apre (vedi render/actors.ts). */
const mouthGeometry = new THREE.SphereGeometry(1, 10, 6).scale(0.008, 0.006, 0.021);
const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x4a1d1f, roughness: 0.7 });
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

/** Spettatori: colori dei vestiti normali e dei costumi interi (suit = anche braccia e gambe del costume). */
// Colori accesi: chi è protagonista di un momento segreto deve staccare dal pubblico.
const PLAIN_SHIRTS = [0xff3b5c, 0xffd400, 0x00c2ff, 0xff7a00, 0x39e639, 0xff4fd8];
const LOOKS: Record<Exclude<SpectatorLook, 'plain' | 'mascot'>, { shirt: number; shorts: number; socks: number; suit?: number }> = {
  banana: { shirt: 0xffd83a, shorts: 0xffd83a, socks: 0xffd83a, suit: 0xffd83a },
  dino: { shirt: 0x3fa34d, shorts: 0x3fa34d, socks: 0x3fa34d, suit: 0x3fa34d },
  clown: { shirt: 0xff3b3b, shorts: 0x2f6fde, socks: 0xffe14d },
  astronaut: { shirt: 0xeef0f2, shorts: 0xeef0f2, socks: 0xeef0f2, suit: 0xeef0f2 },
};

/** Cappelli, nasi e teste finte dei costumi (coordinate della testa: +x = davanti). */
function accessories(look: SpectatorLook | undefined, color: number): Part[] {
  switch (look) {
    case 'banana': return [band(0xffd83a, [0, 0.32, 0], [0.085, 0.36, 0.085]), oval(0x5a3d1a, [0, 0.51, 0], [0.03, 0.035, 0.03])];
    case 'dino': return [
      { geometry: hairCap, color: 0x3fa34d, at: [-0.03, 0.01, 0], size: [1.25, 1.35, 1.2] },
      ...[0.2, 0.12, 0.02].map((y, i): Part => slab(0x2d7a37, [-0.08 - i * 0.05, y, 0], [0.06, 0.09, 0.02])),
    ];
    case 'clown': return [
      oval(0xff2020, [0.145, -0.01, 0], [0.032, 0.032, 0.032]),
      oval(0xff8c1a, [-0.01, 0.06, 0.12], [0.08, 0.09, 0.07]), oval(0xff8c1a, [-0.01, 0.06, -0.12], [0.08, 0.09, 0.07]),
      oval(0x33cc66, [-0.02, 0.15, 0], [0.09, 0.06, 0.09]),
    ];
    case 'astronaut': return [
      { geometry: hairCap, color: 0xf6f7f9, at: [-0.02, 0.0, 0], size: [1.3, 1.3, 1.3] },
      band(0x9aa3ad, [0, 0.24, 0.06], [0.006, 0.12, 0.006]), oval(0xff4040, [0, 0.31, 0.06], [0.018, 0.018, 0.018]),
    ];
    case 'mascot': return [
      // Testone di peluche del colore della squadra, con occhi grandi e orecchie.
      oval(color, [0, 0.04, 0], [0.2, 0.21, 0.19]),
      ...[-1, 1].flatMap((side): Part[] => [
        oval(0xffffff, [0.18, 0.07, side * 0.07], [0.025, 0.05, 0.045]), oval(0x111111, [0.2, 0.07, side * 0.07], [0.012, 0.025, 0.022]),
        oval(color, [-0.02, 0.21, side * 0.13], [0.05, 0.07, 0.05]),
      ]),
      oval(0x111111, [0.19, -0.06, 0], [0.012, 0.03, 0.07]),
    ];
    default: return [];
  }
}

export function createAthlete(actor: Actor): Athlete {
  const team = CONFIG.teams[actor.team], extra = ['coach', 'steward', 'fan', 'spectator'].includes(actor.role);
  const look = actor.role === 'spectator' ? actor.look ?? 'plain' : undefined;
  const costume = look && look !== 'plain' && look !== 'mascot' ? LOOKS[look] : null;
  const player = !extra && actor.role !== 'ref', boxer = SPORT === 'boxe' && player;
  const sleeveless = player && (SPORT === 'basket' || SPORT === 'pallavolo' || boxer);
  const golfer = SPORT === 'golf' && player;
  const rider = SPORT === 'ciclismo' && player, sailor = SPORT === 'vela' && player;
  const kit = actor.role === 'ref' ? CONFIG.visuals.referee : actor.role === 'steward' ? CONFIG.visuals.steward
    : actor.role === 'fan' ? CONFIG.visuals.fan : actor.role === 'coach' ? { shirt: team.socks, shorts: 0x252d3c, socks: 0x252d3c }
    : look === 'mascot' ? { shirt: team.shirt, shorts: team.shirt, socks: team.shirt }
    : costume ? costume
    : look === 'plain' ? { shirt: PLAIN_SHIRTS[actor.id % PLAIN_SHIRTS.length], shorts: 0x2f3e5c, socks: 0x2a2a2a }
    : { shirt: actor.role === 'gk' ? team.keeper : team.shirt, shorts: team.shorts, socks: team.socks };
  const skin = SKIN[actor.id % SKIN.length], hair = HAIR[actor.id % HAIR.length];
  /** Braccia e gambe: pelle, o il tessuto del costume intero. */
  const limbSkin = look === 'mascot' ? team.shirt : costume?.suit ?? skin;
  /** I golfisti hanno i pantaloni lunghi. */
  const legSkin = golfer ? kit.shorts : limbSkin;
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
  if (player && !boxer && !golfer) torso.add(jerseyNumber(actor.id % 99 + 1));
  if (SPORT === 'golf' && actor.role === 'coach') torso.add(golfBag(team.shirt));

  const head = new THREE.Group(); head.position.y = 0.74;
  const face: Part[] = [shaped(skull, skin, [0, 0, 0]), shaped(hairCap, hair, [-0.008, 0, 0]),
    shaped(nose, skin, [0.128, 0, 0]),
    oval(skin, [-0.01, -0.005, 0.112], [0.015, 0.03, 0.018]),
    oval(skin, [-0.01, -0.005, -0.112], [0.015, 0.03, 0.018]),
  ];
  for (const side of [-1, 1]) {
    face.push(oval(0xf3eee0, [0.12, 0.016, side * 0.047], [0.004, 0.007, 0.011]));
    face.push(oval(0x28252b, [0.124, 0.017, side * 0.046], [0.002, 0.005, 0.005]));
    face.push(slab(hair, [0.119, 0.042, side * 0.047], [0.006, 0.007, 0.025]));
  }
  if (actor.id % 3 === 0) face.push({ geometry: hairCap, color: hair, at: [-0.012, 0.012, 0], size: [1, 1.1, 1] });
  if (SPORT === 'tennis' && player) face.push(band(0xf5f2e9, [0, 0.049, 0], [0.121, 0.022, 0.114]));
  if (SPORT === 'pallavolo' && player && actor.id % 2 === 0) face.push(section(hair, [-0.135, 0.015, 0], [0.029, 0.18, 0.035]));
  if (golfer) face.push({ geometry: hairCap, color: team.shorts, at: [-0.004, 0.022, 0], size: [1.07, 1, 1.07] }, slab(team.shorts, [0.13, 0.072, 0], [0.1, 0.012, 0.15]));
  // Casco: affusolato con gli occhiali scuri per i ciclisti, tondo per i velisti.
  if (rider) face.push({ geometry: hairCap, color: team.shirt, at: [-0.03, 0.03, 0], size: [1.25, 1.05, 1.12] }, band(0x15181d, [0.105, 0.025, 0], [0.04, 0.022, 0.11]));
  if (sailor) face.push({ geometry: hairCap, color: 0xf4f4f2, at: [-0.005, 0.025, 0], size: [1.14, 1.1, 1.14] });
  face.push(...accessories(look, team.shirt));
  head.add(mesh(face)); torso.add(head);
  const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
  mouth.position.set(0.112, -0.085, 0);
  head.add(mouth);

  const leg = (side: number) => {
    const root = new THREE.Group(); root.position.set(0, 0.92, side * 0.102);
    root.add(mesh([
      section(legSkin, [0, -0.215, 0], [0.074, 0.43, 0.077]),
      section(kit.shorts, [0, -0.06, 0], [0.083, boxer ? 0.26 : 0.22, 0.088]),
      slab(accent, [0, -0.068, side * 0.078], [0.035, 0.15, 0.004]),
    ], true));
    const knee = new THREE.Group(); knee.position.y = -0.43;
    const highSock = SPORT === 'calcio' || boxer || extra || actor.role === 'ref';
    const shoe = player ? (actor.team === 0 ? 0xf4efdb : 0x20273a) : 0x20273a;
    const lower: Part[] = [
      oval(legSkin, [0, 0, 0], [0.05, 0.052, 0.058]),
      section(legSkin, [0, -0.2, 0], [0.056, 0.4, 0.06]),
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
    const upper: Part[] = [section(limbSkin, [0, -0.15, 0], [0.05, 0.3, 0.056])];
    if (!sleeveless) upper.push(section(kit.shirt, [0, -0.042, 0], [0.059, 0.13, 0.063]));
    root.add(mesh(upper));
    const elbow = new THREE.Group(); elbow.position.y = -0.3;
    const lower: Part[] = [oval(limbSkin, [0, 0, 0], [0.036, 0.043, 0.041]), section(limbSkin, [0, -0.14, 0], [0.041, 0.28, 0.046])];
    if (SPORT === 'tennis' && player) lower.push(band(0xf4f0e8, [0, -0.24, 0], [0.032, 0.038, 0.036]));
    elbow.add(mesh(lower)); root.add(elbow); torso.add(root);
    const wrist = new THREE.Group(); wrist.position.y = -0.27; elbow.add(wrist);
    const hand: Part[] = [shaped(handShape, limbSkin, [0.01, 0, 0])];
    if (boxer || actor.role === 'gk') {
      hand.push(band(0xf4efdf, [0, 0.005, 0], [0.039, 0.055, 0.042]));
      hand.push(slab(boxer ? kit.shorts : 0xe4f349, [0.027, -0.053, 0], boxer ? [0.14, 0.18, 0.124] : [0.055, 0.11, 0.09]));
      if (boxer) hand.push(oval(kit.shorts, [0.07, -0.05, side * 0.047], [0.043, 0.06, 0.034]));
    }
    wrist.add(mesh(hand)); return { root, elbow, wrist };
  };
  const leftLeg = leg(1), rightLeg = leg(-1), leftArm = arm(1), rightArm = arm(-1);
  if (SPORT === 'tennis' && player) rightArm.wrist.add(racket(team.shirt));
  if (golfer) rightArm.wrist.add(golfClub());
  if (SPORT === 'golf' && actor.role === 'ref') rightArm.wrist.add(quietSign());
  const bike = rider ? bicycle(team.shirt) : undefined;
  const ring = look === 'plain' ? ringBox() : undefined;
  if (ring) rightArm.wrist.add(ring.group);
  // The body pivots at the pelvis, while the chest has its own hinge above it.
  body.children.forEach(child => { child.position.y -= 0.94; }); body.position.y = 0.94;
  return { body, torso, head, legL: leftLeg.root, legR: rightLeg.root, kneeL: leftLeg.knee,
    kneeR: rightLeg.knee, armL: leftArm.root, armR: rightArm.root, elbowL: leftArm.elbow, elbowR: rightArm.elbow,
    wristL: leftArm.wrist, wristR: rightArm.wrist, mouth, ring: ring?.group, sparkle: ring?.sparkle, bike };
}

/** Scatola aperta con l'anello, sul palmo. Fuori scala e con un luccichio: dalla camera è lontana decine di metri. */
function ringBox() {
  const group = new THREE.Group();
  // Il "sopra" della scatola è il dorso della mano rivolto in alto quando il braccio è teso in avanti.
  group.position.set(0.035, -0.07, 0); group.rotation.z = -Math.PI / 2; group.scale.setScalar(1.4); group.visible = false;
  const gold = new THREE.TorusGeometry(0.034, 0.011, 6, 18);
  group.add(mesh([
    slab(0xb3123a, [0, 0.03, 0], [0.09, 0.06, 0.09]),
    slab(0xb3123a, [-0.05, 0.085, 0], [0.014, 0.08, 0.09]),
    slab(0xf6f0e6, [0, 0.062, 0], [0.07, 0.008, 0.07]),
    { geometry: gold, color: 0xffc928, at: [0, 0.095, 0], size: [1, 1, 1] },
    oval(0xe8fbff, [0, 0.135, 0], [0.02, 0.02, 0.02]),
  ]));
  gold.dispose();
  const sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('255,246,200'), blending: THREE.AdditiveBlending, depthWrite: false }));
  sparkle.position.set(0, 0.135, 0);
  group.add(sparkle);
  return { group, sparkle };
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

/** Ferro da golf: impugnatura, asta e testa. La testa (a −0,98) è il punto che colpisce la palla. */
function golfClub() {
  return mesh([band(0x1b1d22, [0, -0.07, 0], [0.017, 0.15, 0.017]), band(0xc9ced6, [0, -0.56, 0], [0.008, 0.84, 0.008]),
    slab(0x9aa3ad, [0.035, -0.975, 0], [0.095, 0.035, 0.03])]);
}

/** Sacca da golf sulla schiena del caddie, con le teste dei bastoni che spuntano. */
function golfBag(color: number) {
  const parts: Part[] = [band(color, [0, 0, 0], [0.12, 0.8, 0.12]), band(0x1d1f24, [0, 0.42, 0], [0.125, 0.05, 0.125]),
    band(0x1d1f24, [0, -0.38, 0], [0.125, 0.06, 0.125])];
  [[-0.05, 0.03], [0.05, -0.02], [0, 0.06], [0.03, 0.05], [-0.03, -0.05]].forEach(([x, z], i) => {
    parts.push(band(0xb8bec6, [x, 0.5 + i * 0.02, z], [0.01, 0.2, 0.01]), slab(i % 2 ? 0x2b2f36 : 0x8a9099, [x + 0.02, 0.61 + i * 0.02, z], [0.055, 0.03, 0.035]));
  });
  const bag = mesh(parts, true);
  bag.position.set(-0.19, 0.24, 0.04); bag.rotation.z = -0.3;
  return bag;
}

/** Il cartello del marshal: quando lo alza, silenzio per il colpo. */
function quietSign() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f2e4'; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#245a3a'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 246, 118);
  ctx.fillStyle = '#245a3a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 44px Arial';
  ctx.fillText(t('SILENZIO'), 128, 66, 230);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  group.add(mesh([band(0x6b4a2b, [0, -0.2, 0], [0.012, 0.36, 0.012])]));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  sign.position.y = -0.46;
  group.add(sign);
  return group;
}

/** Bici da corsa: telaio del colore della squadra, sella all'altezza del bacino del corridore. */
function bicycle(color: number) {
  const tube = (a: [number, number, number], b: [number, number, number], r: number) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  };
  const bb: [number, number, number] = [0.16, 0.3, 0], seat: [number, number, number] = [0.02, 0.84, 0], head: [number, number, number] = [0.58, 0.82, 0];
  const rear: [number, number, number] = [-0.36, 0.34, 0], front: [number, number, number] = [0.64, 0.34, 0];
  const group = new THREE.Group();
  // Ruote senza raggi visibili (raggi veri a 60 fps sembrerebbero girare all'indietro): copertone, cerchio e mozzo
  // sono simmetrici, quindi stanno nel telaio e non serve farli girare. Il disco velato = raggi "mossi" come in TV.
  const wheel = (at: [number, number, number]): Part[] => [{ geometry: tire, color: 0x15181d, at, size: [1, 1, 1] },
    { geometry: rim, color: 0x9aa3ad, at, size: [1, 1, 1] }, { geometry: hub, color: 0xb8bec6, at, size: [1, 1, 1] }];
  group.add(mesh([
    shaped(tube(bb, seat, 0.02), color, [0, 0, 0]), shaped(tube(seat, head, 0.018), color, [0, 0, 0]), shaped(tube(bb, head, 0.022), color, [0, 0, 0]),
    shaped(tube(bb, rear, 0.012), color, [0, 0, 0]), shaped(tube(seat, rear, 0.012), color, [0, 0, 0]), shaped(tube(head, front, 0.014), 0x2b2f36, [0, 0, 0]),
    shaped(tube(head, [0.68, 0.92, 0], 0.014), 0x2b2f36, [0, 0, 0]), shaped(tube([0.68, 0.92, -0.21], [0.68, 0.92, 0.21], 0.014), 0x2b2f36, [0, 0, 0]),
    slab(0x15181d, [0, 0.885, 0], [0.24, 0.03, 0.09]), band(0x9aa3ad, [0.16, 0.3, 0], [0.06, 0.03, 0.06]),
    ...wheel(rear), ...wheel(front),
  ], true));
  group.add(new THREE.Mesh(spokeDiscs, spokeBlur));
  // Pedivelle e pedali: girano con le gambe (fase come in animation/motion.ts ride()).
  const crank = new THREE.Group();
  crank.position.set(...bb);
  crank.add(mesh([
    slab(0x2b2f36, [0.085, 0, 0.09], [0.19, 0.024, 0.014]), slab(0x15181d, [0.17, 0, 0.125], [0.085, 0.016, 0.06]),
    slab(0x2b2f36, [-0.085, 0, -0.09], [0.19, 0.024, 0.014]), slab(0x15181d, [-0.17, 0, -0.125], [0.085, 0.016, 0.06]),
    { geometry: chainring, color: 0x9aa3ad, at: [0, 0, -0.07], size: [1, 1, 1] },
  ]));
  group.add(crank);
  return { group, crank };
}
const tire = new THREE.TorusGeometry(0.33, 0.021, 6, 28), rim = new THREE.TorusGeometry(0.3, 0.012, 4, 28);
const hub = new THREE.CylinderGeometry(0.03, 0.03, 0.07, 8).rotateX(Math.PI / 2), chainring = new THREE.TorusGeometry(0.095, 0.012, 4, 16);
const spokeDiscs = mergeGeometries([new THREE.CircleGeometry(0.3, 20).translate(-0.36, 0.34, 0), new THREE.CircleGeometry(0.3, 20).translate(0.64, 0.34, 0)])!;
const spokeBlur = new THREE.MeshBasicMaterial({ color: 0xd5dbe2, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
