// Mixamo bodies in sportswear: T-shirt/shorts (Ch42), polo/trousers (Ch01) and Carol, a tennis player rigged with Mixamo's auto-rigger.
// Same rig as the footballer. usage: node scripts/prepare-mixamo-athletes.mjs [folder with the three FBX] [FBX2glTF.exe]
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, prune, simplify, simplifyPrimitive, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';

const source = resolve(process.argv[2] || resolve(process.env.USERPROFILE ?? '.', 'Downloads'));
const converter = resolve(process.argv[3] || 'artifacts/asset-tools/FBX2glTF.exe');
/** cards: alpha-card hair that only sloppy simplification reduces. names: source mesh -> name read by the renderer's styling. */
/** hair: the bald polo body receives the T-shirt body's hair. small: further share kept of over-detailed parts (a few pixels on screen).
 *  single: garments reduced to their largest piece (the polo's neckerchief turns jagged once simplified). */
const MODELS = [{ id: 'athlete-tee', file: 'character.fbx', cards: true }, { id: 'athlete-polo', file: 'character (2).fbx', hair: true, single: ['Shirt'] },
  { id: 'athlete-carol', file: 'carol-tennis.fbx', names: { head: 'BodyHead', th: 'Bands' }, small: { Shoes: .25, Hair: .5 } }];
/** Garments recoloured with the kit: plain fabric, without the print, the denim or texture seams (dark streaks once simplified). */
const CLOTH = /Shirt|Shorts|Pants|Skirt/;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); await MeshoptSimplifier.ready;
await mkdir('artifacts/mixamo-athletes', { recursive: true });
const audit = [];
let donor;
/** Keeps only the triangles of the largest connected piece (vertices joined by position, across UV seams). */
function largestPiece(prim) {
  const position = prim.getAttribute('POSITION'), index = prim.getIndices().getArray(), ids = new Map(), parent = [];
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const vertex = (i) => { const k = position.getElement(i, []).map(v => v.toFixed(4)).join(); if (!ids.has(k)) { ids.set(k, parent.length); parent.push(parent.length); } return ids.get(k); };
  for (let t = 0; t < index.length; t += 3) { const a = find(vertex(index[t])); parent[find(vertex(index[t + 1]))] = a; parent[find(vertex(index[t + 2]))] = a; }
  const size = new Map();
  for (let t = 0; t < index.length; t += 3) { const r = find(vertex(index[t])); size.set(r, (size.get(r) ?? 0) + 1); }
  const keep = [...size].sort((a, b) => b[1] - a[1])[0][0], kept = [];
  for (let t = 0; t < index.length; t += 3) if (find(vertex(index[t])) === keep) kept.push(index[t], index[t + 1], index[t + 2]);
  prim.getIndices().setArray(new Uint32Array(kept)); compactPrimitive(prim);
}
/** Skin under a garment sinks 1.5 cm along its normal: once both are simplified, it no longer pierces the fabric as dark streaks. */
function tuckBody(root) {
  // Distances in metres of a 1.75 m body: Carol's auto-rigged mesh is stored in other units.
  const body = root.listNodes().find(n => n.getMesh()?.getName() === 'Body').getMesh().listPrimitives()[0].getAttribute('POSITION'), u = (body.getMax([])[1] - body.getMin([])[1]) / 1.75;
  const garments = root.listNodes().filter(n => CLOTH.test(n.getMesh()?.getName() ?? '')), cell = .03 * u, grid = new Map(), at = (v) => v.map(x => Math.floor(x / cell)).join();
  for (const node of garments) {
    const m = world(node), n3 = new THREE.Matrix3().getNormalMatrix(m);
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL');
      for (let i = 0; i < P.getCount(); i++) {
        const p = new THREE.Vector3().fromArray(P.getElement(i, [])).applyMatrix4(m), n = new THREE.Vector3().fromArray(N.getElement(i, [])).applyMatrix3(n3).normalize(), key = at(p.toArray());
        if (!grid.has(key)) grid.set(key, []); grid.get(key).push([p, n]);
      }
    }
  }
  for (const node of root.listNodes().filter(n => /^Body/.test(n.getMesh()?.getName() ?? ''))) {
    const m = world(node), inverse = m.clone().invert(), n3 = new THREE.Matrix3().getNormalMatrix(m);
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), offset = new THREE.Vector3();
      for (let i = 0; i < P.getCount(); i++) {
        const p = new THREE.Vector3().fromArray(P.getElement(i, [])).applyMatrix4(m), [x, y, z] = p.toArray().map(c => Math.floor(c / cell));
        let covered = false;
        for (let dx = -1; dx <= 1 && !covered; dx++) for (let dy = -1; dy <= 1 && !covered; dy++) for (let dz = -1; dz <= 1 && !covered; dz++)
          for (const [g, n] of grid.get(`${x + dx},${y + dy},${z + dz}`) ?? []) {
            const depth = -offset.subVectors(p, g).dot(n);
            if (depth > .002 * u && depth < .05 * u && offset.addScaledVector(n, depth).length() < .02 * u) { covered = true; break; }
          }
        if (!covered) continue;
        const normal = new THREE.Vector3().fromArray(N.getElement(i, [])).applyMatrix3(n3).normalize();
        P.setElement(i, p.addScaledVector(normal, -.015 * u).applyMatrix4(inverse).toArray());
      }
    }
  }
}
const world = (node) => new THREE.Matrix4().fromArray(node.getWorldMatrix());
/** Head joint and the box (in its frame) of the skin it carries: the skull and face. */
function skull(root) {
  const head = root.listNodes().find(n => n.getName() === 'Head'), body = root.listNodes().find(n => n.getMesh()?.getName() === 'Body');
  const matrix = world(head), local = matrix.clone().invert(), box = new THREE.Box3(), prim = body.getMesh().listPrimitives()[0], joint = body.getSkin().listJoints().indexOf(head);
  const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  for (let i = 0; i < P.getCount(); i++) {
    const j = J.getElement(i, []), w = W.getElement(i, []);
    if (j.some((x, k) => x === joint && w[k] > .5)) box.expandByPoint(new THREE.Vector3().fromArray(P.getElement(i, [])).applyMatrix4(local));
  }
  return { head, matrix, box };
}

for (const { id, file, cards, hair, names = {}, small = {}, single = [] } of MODELS) {
  const input = resolve(source, file), original = await readFile(input), raw = resolve('artifacts/mixamo-athletes', id);
  execFileSync(converter, ['--input', input, '--output', raw, '--binary', '--fbx-temp-dir', resolve('artifacts/mixamo-athletes')], { stdio: 'pipe' });
  const doc = await io.read(raw + '.glb'), root = doc.getRoot();
  root.listAnimations().forEach(a => a.dispose());
  root.listNodes().forEach(n => n.setName(n.getName().replace(/^mixamorig\d*:?/, '')));
  for (const mesh of root.listMeshes()) {
    // Names read by the renderer's styling (Shirt, Shorts/Pants, Shoes, Body, Hair).
    const base = mesh.getName().replace(/^Ch\d+_+/, '').replace(/\d+$/, '').replace(/^sneakers$/i, 'Shoes');
    const name = names[base] ?? base[0].toUpperCase() + base.slice(1);
    mesh.setName(name); root.listNodes().filter(n => n.getMesh() === mesh).forEach(n => n.setName(name));
    for (const prim of mesh.listPrimitives()) {
      prim.setAttribute('COLOR_0', null); prim.setAttribute('TANGENT', null);
      const mat = prim.getMaterial().clone().setName(name).setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null)
        .setMetallicFactor(0).setRoughnessFactor(.85).setBaseColorFactor([1, 1, 1, 1])
        // The FBX export marks every material as blended: opaque garments drawn as transparent show their inner layers as dark shards.
        .setAlphaMode(/Hair|Eyelash/.test(name) ? 'MASK' : 'OPAQUE');
      if (CLOTH.test(name)) mat.setBaseColorTexture(null);
      if (single.includes(name)) largestPiece(prim);
      prim.setMaterial(mat);
    }
  }
  tuckBody(root);
  // Textures seen only on small parts (shoes, socks, bands, garments) are halved; face, skin and hair keep 512 px.
  for (const texture of root.listTextures()) {
    const users = root.listMeshes().filter(m => m.listPrimitives().some(p => p.getMaterial()?.getBaseColorTexture() === texture)).map(m => m.getName());
    if (users.length && users.every(n => !/Body|Hair/.test(n))) texture.setImage(await sharp(Buffer.from(texture.getImage())).resize(256, 256).png().toBuffer()).setMimeType('image/png');
  }
  await doc.transform(dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: .12, error: .025 }));
  for (const mesh of root.listMeshes().filter(m => small[m.getName()])) for (const prim of mesh.listPrimitives())
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: small[mesh.getName()], error: .05 });
  // Alpha hair cards have many disconnected borders; ordinary simplification cannot collapse them.
  for (const mesh of root.listMeshes().filter(m => cards && /Hair|Eyelash/.test(m.getName()))) for (const prim of mesh.listPrimitives()) {
    const [indices] = MeshoptSimplifier.simplifySloppy(new Uint32Array(prim.getIndices().getArray()), new Float32Array(prim.getAttribute('POSITION').getArray()), 3, null,
      Math.min(prim.getIndices().getCount(), /Hair/.test(mesh.getName()) ? 3600 : 300), .02);
    if (indices.length) prim.getIndices().setArray(indices);
  }
  if (hair) {
    // Rigid on the Head joint; the donor skull's box is fitted to this one (3% larger, so the hair stays outside the scalp).
    const body = root.listNodes().find(n => n.getMesh()?.getName() === 'Body'), target = skull(root), buffer = root.listBuffers()[0];
    const fit = target.box.getSize(new THREE.Vector3()).divide(donor.box.getSize(new THREE.Vector3())).multiplyScalar(1.03);
    const transform = new THREE.Matrix4().copy(world(body)).invert().multiply(target.matrix)
      .multiply(new THREE.Matrix4().makeTranslation(...target.box.getCenter(new THREE.Vector3()).toArray())).multiply(new THREE.Matrix4().makeScale(fit.x, fit.y, fit.z))
      .multiply(new THREE.Matrix4().makeTranslation(...donor.box.getCenter(new THREE.Vector3()).negate().toArray())).multiply(donor.matrix.clone().invert());
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform), count = donor.position.length / 3, joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), index = body.getSkin().listJoints().indexOf(target.head);
    for (let i = 0; i < count; i++) {
      new THREE.Vector3().fromArray(donor.position, i * 3).applyMatrix4(transform).toArray(position, i * 3);
      new THREE.Vector3().fromArray(donor.normal, i * 3).applyMatrix3(normalMatrix).normalize().toArray(normal, i * 3);
      joints[i * 4] = index; weights[i * 4] = 1;
    }
    const attr = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const material = doc.createMaterial('Hair').setBaseColorTexture(doc.createTexture('Hair').setImage(donor.image).setMimeType(donor.mime))
      .setAlphaMode(donor.alphaMode).setAlphaCutoff(donor.alphaCutoff).setRoughnessFactor(.85).setMetallicFactor(0);
    const prim = doc.createPrimitive().setIndices(attr('SCALAR', donor.indices)).setAttribute('POSITION', attr('VEC3', position)).setAttribute('NORMAL', attr('VEC3', normal))
      .setAttribute('TEXCOORD_0', attr('VEC2', donor.uv)).setAttribute('JOINTS_0', attr('VEC4', joints)).setAttribute('WEIGHTS_0', attr('VEC4', weights)).setMaterial(material);
    body.getParentNode().addChild(doc.createNode('Hair').setMatrix(body.getMatrix()).setMesh(doc.createMesh('Hair').addPrimitive(prim)).setSkin(body.getSkin()));
  }
  await doc.transform(prune(), textureCompress({ encoder: sharp, resize: [512, 512], targetFormat: 'webp', quality: 82 }), prune());
  if (cards) {
    const node = root.listNodes().find(n => n.getMesh()?.getName() === 'Hair'), prim = node.getMesh().listPrimitives()[0], m = world(node), mat = prim.getMaterial();
    const n3 = new THREE.Matrix3().getNormalMatrix(m), position = new Float32Array(prim.getAttribute('POSITION').getArray()), normal = new Float32Array(prim.getAttribute('NORMAL').getArray());
    for (let i = 0; i < position.length; i += 3) {
      new THREE.Vector3().fromArray(position, i).applyMatrix4(m).toArray(position, i);
      new THREE.Vector3().fromArray(normal, i).applyMatrix3(n3).normalize().toArray(normal, i);
    }
    donor = { ...skull(root), position, normal, uv: new Float32Array(prim.getAttribute('TEXCOORD_0').getArray()), indices: new Uint32Array(prim.getIndices().getArray()),
      image: mat.getBaseColorTexture().getImage(), mime: mat.getBaseColorTexture().getMimeType(), alphaMode: mat.getAlphaMode(), alphaCutoff: mat.getAlphaCutoff() };
  }
  const bytes = await io.writeBinary(doc), triangles = root.listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
  await writeFile(`src/assets/characters/${id}.glb`, bytes);
  audit.push({ id, source: file, bytes: original.length, sha256: createHash('sha256').update(original).digest('hex'), meshes: root.listMeshes().map(m => m.getName()), triangles, optimizedBytes: bytes.length });
  console.log(`${id}: ${triangles} triangles, ${(bytes.length / 1024).toFixed(0)} KiB`);
}
await writeFile('docs/mixamo-athletes.json', JSON.stringify({ author: 'Adobe Mixamo characters Ch42 and Ch01; Carol Tennis Player Girl (Sketchfab, CC BY 4.0) rigged with Mixamo, all supplied by the user', models: audit }, null, 2) + '\n');
