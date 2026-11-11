/**
 * Oggetti di scena modellati in Blender (scripts/blender/*.py, rigenerati con `npm run props`): canestro, ring, case,
 * chiesa, alberi, auto... Niente texture: colore e ombre di contatto sono cotti nei colori dei vertici.
 * Ogni oggetto è diviso in gruppi col nome del materiale (paint, wall, roof, leaf, glass, glow...), così chi lo usa
 * può tingere un gruppo (i muri di una casa, la chioma di un albero) o cambiargli materiale.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const urls = import.meta.glob('../assets/props/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export type PropParts = Record<string, THREE.BufferGeometry>;
export type PropPack = Record<string, PropParts>;
const packs = new Map<string, Promise<PropPack>>();
const pending: Promise<unknown>[] = [];

/** Copia in virgola mobile: i file hanno posizioni e normali compresse in interi, scomode da trasformare e unire. */
function plain(source: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const g = new THREE.BufferGeometry(), v = new THREE.Vector3();
  for (const name of ['position', 'normal', 'color']) {
    const from = source.getAttribute(name), size = name === 'color' ? 3 : from.itemSize, values = new Float32Array(from.count * size);
    for (let i = 0; i < from.count; i++) { v.fromBufferAttribute(from, i).toArray(values, i * size); }
    g.setAttribute(name, new THREE.BufferAttribute(values, size));
  }
  g.setIndex(source.index ? Array.from(source.index.array) : null);
  g.applyMatrix4(matrix);
  g.computeBoundingSphere();
  return g;
}

export function loadProps(pack: 'arena' | 'country') {
  let promise = packs.get(pack);
  if (!promise) {
    promise = new GLTFLoader().loadAsync(urls[`../assets/props/${pack}.glb`]).then((gltf) => {
      const out: PropPack = {};
      gltf.scene.updateMatrixWorld(true);
      for (const prop of gltf.scene.children) {
        const parts: PropParts = out[prop.name] = {};
        prop.traverse((o) => {
          const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
          if (mesh.isMesh) parts[mesh.material.name] = plain(mesh.geometry, mesh.matrixWorld);
        });
      }
      return out;
    });
    packs.set(pack, promise);
  }
  return promise;
}

/** La scena si costruisce subito; gli oggetti di Blender arrivano appena caricati (prima che il menu lasci partire). */
export function withProps(pack: 'arena' | 'country', use: (props: PropPack) => void) {
  pending.push(loadProps(pack).then(use));
}
/** Da attendere prima di compilare gli shader e abilitare i pulsanti del menu. */
export const propsLoaded = () => Promise.all(pending);

const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const shared: Record<string, THREE.Material> = {
  glass: new THREE.MeshStandardMaterial({ color: 0xdfeaf5, transparent: true, opacity: 0.26, roughness: 0.06, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  line: new THREE.MeshBasicMaterial({ vertexColors: true }),
  net: new THREE.MeshLambertMaterial({ vertexColors: true }),
  water: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0 }),
};
/** Materiale di un gruppo: quello dato da chi chiama, quello speciale del gruppo (vetro, luci), o la vernice comune. */
export const propMaterial = (group: string, tint?: number) =>
  tint === undefined ? shared[group] ?? painted : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, color: tint });

/** Un oggetto pronto da mettere in scena: una mesh per gruppo. tints colora i gruppi indicati. */
export function propObject(parts: PropParts, tints: Record<string, number> = {}) {
  const group = new THREE.Group();
  for (const [name, geometry] of Object.entries(parts)) {
    const mesh = new THREE.Mesh(geometry, propMaterial(name, tints[name]));
    mesh.name = name;
    mesh.castShadow = name !== 'glass' && name !== 'glow' && name !== 'line';
    mesh.receiveShadow = name !== 'glass' && name !== 'glow' && name !== 'net';
    if (name === 'glass') mesh.renderOrder = 2;
    group.add(mesh);
  }
  return group;
}

/** Copia trasformata di un gruppo, coi colori dei vertici moltiplicati per una tinta: per unire molte case in una mesh sola. */
export function propGeometry(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, tint?: THREE.Color) {
  const g = geometry.clone().applyMatrix4(matrix);
  if (tint) {
    const colors = g.getAttribute('color');
    for (let i = 0; i < colors.count; i++) colors.setXYZ(i, colors.getX(i) * tint.r, colors.getY(i) * tint.g, colors.getZ(i) * tint.b);
  }
  return g;
}
