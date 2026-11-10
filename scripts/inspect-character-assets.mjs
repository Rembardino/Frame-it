import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const source = resolve(process.argv[2] || resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'Downloads/new_asset'));
const output = resolve('artifacts/asset-audit');
await mkdir(output, { recursive: true });
THREE.TextureLoader.prototype.load = function (url) {
  const texture = new THREE.Texture(); texture.userData.source = url; return texture;
};
const loader = new FBXLoader();
const inventory = [];
for (const dir of [source, resolve(source, 'human')]) {
  for (const name of (await readdir(dir)).filter(n => n.toLowerCase().endsWith('.fbx')).sort()) {
    const path = resolve(dir, name), bytes = await readFile(path);
    const warnings = [], warn = console.warn; console.warn = (...args) => warnings.push(args.join(' '));
    let model;
    try { model = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''); }
    catch (error) {
      inventory.push({ file: relative(source, path).replaceAll('\\', '/'), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'), error: error.message });
      console.log(`${name}: ${error.message}`); continue;
    }
    finally { console.warn = warn; }
    model.updateMatrixWorld(true);
    const meshes = [], bones = [];
    model.traverse(o => {
      if (o.isBone) bones.push({ name: o.name, parent: o.parent?.name, position: o.position.toArray(), quaternion: o.quaternion.toArray() });
      if (o.isMesh) meshes.push({ name: o.name, skinned: !!o.isSkinnedMesh, vertices: o.geometry.attributes.position.count,
        triangles: (o.geometry.index?.count || o.geometry.attributes.position.count) / 3,
        materials: (Array.isArray(o.material) ? o.material : [o.material]).map(m => ({ name: m.name, color: m.color?.getHexString(), map: m.map?.userData.source ? 'embedded' : null })) });
    });
    const box = new THREE.Box3().setFromObject(model);
    const animations = model.animations.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length,
      samples: clip.tracks.reduce((s,t) => s + t.times.length, 0),
      hash: createHash('sha256').update(JSON.stringify(clip.tracks.map(t => [t.name, [...t.times], [...t.values]]))).digest('hex'),
      trackNames: clip.tracks.map(t => t.name) }));
    inventory.push({ file: relative(source, path).replaceAll('\\', '/'), bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), meshes, bones, bounds: { min: box.min.toArray(), max: box.max.toArray() }, animations, warnings });
    console.log(`${inventory.at(-1).file}: ${meshes.length} meshes, ${bones.length} bones, ${animations.map(a => `${a.duration.toFixed(2)}s/${a.hash.slice(0,8)}`).join(', ')}`);
    model.traverse(o => { if(o.isMesh) o.geometry.dispose(); });
  }
}
await writeFile(resolve(output, 'inventory.json'), JSON.stringify(inventory, null, 2));
console.log(`Audited ${inventory.length} files. ${output}/inventory.json`);
