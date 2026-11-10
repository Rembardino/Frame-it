import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Actor } from '../sim/match';

export const PLAYER_HAIRSTYLES = ['original', 'short', 'side-swept', 'trimmed-fringe', 'brushed-back'] as const;
const styleOrder = [0, 1, 2, 0, 3, 4, 1, 2, 1, 4, 3, 0, 2, 1];
const hairColours = [0x211b17, 0x473123, 0x17191e, 0x795638, 0xa78657, 0x625b54, 0x704c37, 0x302521];
const skinColours = [0xe9bd9b, 0xd3a17c, 0xa87553, 0x80533b, 0xf0ceb0, 0x613e2c, 0xb88965, 0xe0aa85];
const hash = (n: number) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return (n ^ (n >>> 16)) >>> 0; };

export function playerLook(actor: Actor) {
  const seed = hash(actor.id * 101 + (actor.appearance ?? 0) * 131 + actor.team * 977);
  return { style: styleOrder[actor.id % styleOrder.length], skin: skinColours[seed % skinColours.length], hair: hairColours[(seed >>> 8) % hairColours.length] };
}

/** The fringe stays above the eyebrows; the sides and back reach lower around the skull. */
function cap(rx: number, ry: number, rz: number) {
  const points: number[] = [], indices: number[] = [], columns = 28, rows = 12;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const phi = column / columns * Math.PI * 2;
    const front = THREE.MathUtils.smoothstep(Math.sin(phi), -.3, .65);
    const theta = row / rows * Math.PI * THREE.MathUtils.lerp(.65, .43, front);
    points.push(rx * Math.cos(phi) * Math.sin(theta), ry * Math.cos(theta), rz * Math.sin(phi) * Math.sin(theta));
    if (row < rows && column < columns) {
      const a = row * (columns + 1) + column, b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

interface HairPart { mesh: THREE.Mesh; source: THREE.BufferGeometry; frame: THREE.Matrix4; inverse: THREE.Matrix4 }
const hairGeometries = new Map<string, THREE.BufferGeometry>();

/** Keep the supplied strands, hairline, UVs and skin weights. Adjust only a few millimetres around that haircut. */
function naturalHair(part: HairPart, style: number, fit: HeadFit, norm: number) {
  if (style === 0 || /Beard/.test(part.mesh.name)) return part.source;
  const key = `${part.source.uuid}:${style}`; let geometry = hairGeometries.get(key); if (geometry) return geometry;
  geometry = part.source.clone(); const positions = geometry.getAttribute('position'), point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(part.frame).multiplyScalar(norm);
    const crown = THREE.MathUtils.smoothstep(point.y, fit.top - .08, fit.top + .025);
    const front = THREE.MathUtils.smoothstep(point.z, fit.centerZ + fit.depth * .1, fit.centerZ + fit.depth * .75);
    if (style === 1 && point.y > fit.top - .005) point.y = fit.top - .005 + (point.y - fit.top + .005) * .55;
    if (style === 2) { point.x += .007 * crown; point.z -= .004 * crown; }
    if (style === 3) { point.y += .009 * front * (1 - crown); point.z -= .004 * front; }
    if (style === 4) { point.z -= .008 * crown; point.y += .003 * crown * front; }
    point.multiplyScalar(1 / norm).applyMatrix4(part.inverse); positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); hairGeometries.set(key, geometry); return geometry;
}

const helmetShell = cap(.124, .151, .141);
const helmetFoam = cap(.121, .141, .137);
const dark = new THREE.MeshStandardMaterial({ color: 0x17232c, roughness: .85 });
const light = new THREE.MeshStandardMaterial({ color: 0xf6f4e9, roughness: .5 });
const ventGeometries = [-.72, -.36, 0, .36, .72].map(lane => {
  const points: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 10; i++) for (const side of [-1, 1]) {
    const x = lane * .124 + side * .0055, z = -.080 + i * .014;
    points.push(x, .151 * Math.sqrt(Math.max(0, 1 - (x / .124) ** 2 - (z / .141) ** 2)) + .0015, z);
    if (side === -1 && i < 10) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
});
// The liner, five vents and the chin straps share one draw call for every rider.
const helmetDetails = (() => {
  const parts = [helmetFoam.clone().translate(0, -.003, 0), ...ventGeometries];
  for (const side of [-1, 1]) for (const z of [-.082, .06]) {
    const from = new THREE.Vector3(side * .105, .032, z), to = new THREE.Vector3(side * .045, -.15, .07);
    const geometry = new THREE.CylinderGeometry(.005, .005, from.distanceTo(to), 6);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    geometry.applyQuaternion(rotation).translate(...from.add(to).multiplyScalar(.5).toArray()); geometry.deleteAttribute('uv'); parts.push(geometry);
  }
  const chin = new THREE.CylinderGeometry(.005, .005, .09, 6).rotateZ(Math.PI / 2).translate(0, -.15, .07); chin.deleteAttribute('uv'); parts.push(chin);
  const geometry = mergeGeometries(parts)!; parts.forEach(part => part.dispose()); return geometry;
})();

interface HeadFit { top: number; centerX: number; centerZ: number; width: number; depth: number }
function fitHead(model: THREE.Group, norm: number, head: THREE.Object3D): HeadFit {
  model.updateWorldMatrix(true, true);
  const inverse = head.matrixWorld.clone().invert(), points: THREE.Vector3[] = [], box = new THREE.Box3();
  model.traverse(o => {
    if (!(o as THREE.SkinnedMesh).isSkinnedMesh || !/Body/.test(o.name)) return;
    const mesh = o as THREE.SkinnedMesh, index = mesh.skeleton.bones.indexOf(head as THREE.Bone), positions = mesh.geometry.getAttribute('position');
    const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight'), frame = inverse.clone().multiply(mesh.matrixWorld);
    if (index < 0 || !joints || !weights) return;
    for (let i = 0; i < positions.count; i++) {
      let weight = 0; for (let j = 0; j < 4; j++) if (joints.getComponent(i, j) === index) weight += weights.getComponent(i, j);
      if (weight < .6) continue;
      const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(frame).multiplyScalar(norm); points.push(point); box.expandByPoint(point);
    }
  });
  if (box.isEmpty()) return { top: .24, centerX: 0, centerZ: .025, width: .10, depth: .105 };
  const scalp = new THREE.Box3(); for (const point of points) if (point.y > box.max.y - .105) scalp.expandByPoint(point);
  return { top: box.max.y, centerX: (scalp.min.x + scalp.max.x) / 2, centerZ: (scalp.min.z + scalp.max.z) / 2,
    width: Math.max(.078, (scalp.max.x - scalp.min.x) / 2), depth: Math.max(.083, (scalp.max.z - scalp.min.z) / 2) };
}

/** Preserve the imported hair and fit the cyclist's shell to the measured scalp. */
export class PlayerAppearance {
  private current = -1;
  private hair: HairPart[] = [];
  private skin: THREE.MeshStandardMaterial[] = [];
  private brows: THREE.MeshStandardMaterial[] = [];

  constructor(private model: THREE.Group, norm: number, actor: Actor, helmetColour?: number) {
    const head = model.getObjectByName('Head'); if (!head) return;
    model.updateWorldMatrix(true, true); const inverseHead = head.matrixWorld.clone().invert();
    model.traverse(o => {
      if (!(o as THREE.Mesh).isMesh) return; const mesh = o as THREE.Mesh, material = mesh.material as THREE.MeshStandardMaterial;
      if (/Hair|Beard/.test(mesh.name)) {
        const frame = inverseHead.clone().multiply(mesh.matrixWorld);
        this.hair.push({ mesh, source: mesh.geometry, frame, inverse: frame.clone().invert() });
      }
      else if (/Body/.test(mesh.name)) this.skin.push(material);
      else if (/Brow/.test(mesh.name)) this.brows.push(material);
    });
    const fit = fitHead(model, norm, head);
    const look = playerLook(actor);
    for (const part of this.hair) {
      part.mesh.geometry = naturalHair(part, look.style, fit, norm);
      const isBeard = /Beard/.test(part.mesh.name);
      const suppliedVariant = !/Hair_(Buzzed|SimpleParted)/.test(part.mesh.name)
        || part.mesh.name === (look.style === 1 ? 'Hair_Buzzed' : 'Hair_SimpleParted');
      part.mesh.visible = helmetColour === undefined && (isBeard ? actor.id % 3 === 1 : suppliedVariant);
    }
    if (helmetColour !== undefined) {
      const frame = new THREE.Group(); frame.name = 'fitted-headwear'; frame.scale.setScalar(1 / norm); head.add(frame);
      const shape = new THREE.Group(); shape.position.set(fit.centerX, fit.top - .115, fit.centerZ);
      shape.scale.set(fit.width / .10, 1, fit.depth / .105); frame.add(shape);
      const helmet = new THREE.Group(); helmet.name = 'cycling-helmet'; helmet.userData = { fittedToHead: true, vents: 5, straps: 5 };
      const shell = new THREE.Mesh(helmetShell, new THREE.MeshStandardMaterial({ color: helmetColour, roughness: .43 })); shell.name = 'cycling-helmet-shell';
      const details = new THREE.Mesh(helmetDetails, dark); details.name = 'cycling-helmet-liner'; helmet.add(details, shell);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.012, .006, .073), light); stripe.position.set(.019, .151, -.008); stripe.rotation.x = .1; helmet.add(stripe);
      helmet.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; }); shape.add(helmet);
      model.userData.helmetFit = fit;
    }
    this.apply(actor);
  }

  apply(actor: Actor) {
    const appearance = actor.appearance ?? 0; if (this.current === appearance) return; this.current = appearance;
    const look = playerLook(actor);
    for (const { mesh } of this.hair) (mesh.material as THREE.MeshStandardMaterial).color.setHex(look.hair);
    for (const material of this.skin) { material.color.setHex(look.skin); material.userData.beardColor?.setHex(look.hair); }
    for (const material of this.brows) material.color.setHex(look.hair);
    this.model.userData.hairstyle = PLAYER_HAIRSTYLES[look.style];
    this.model.userData.appearance = { skin: look.skin, hair: look.hair, face: actor.id % 14 };
  }
}
