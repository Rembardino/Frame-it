import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, weld, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir, readdir, writeFile } from 'node:fs/promises';

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const out = 'src/assets/characters';
await mkdir(out, { recursive: true });
const report = [];
for (const file of (await readdir('artifacts/asset-audit/humans')).filter(n => n.endsWith('.glb')).sort()) {
  const doc = await io.read(`artifacts/asset-audit/humans/${file}`), root = doc.getRoot();
  const player = file === 'footballer.glb';
  root.listAnimations().forEach(a => a.dispose());
  root.listNodes().forEach(n => n.setName(n.getName().replace(/^mixamorig\d*:?/, '')));
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    prim.setAttribute('COLOR_0', null); prim.setAttribute('TANGENT', null);
    const mat = prim.getMaterial()?.clone();
    if (mat) {
      mat.setName(mesh.getName()).setNormalTexture(null).setOcclusionTexture(null)
        .setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.85).setBaseColorFactor([1,1,1,1]);
      prim.setMaterial(mat);
    }
  }
  await doc.transform(dedup(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: player ? 0.12 : 0.055, error: 0.025 }),
    textureCompress({ encoder: sharp, resize: [512,512], targetFormat: 'webp', quality: 82 }), prune());
  const bytes = await io.writeBinary(doc);
  await writeFile(`${out}/${file}`, bytes);
  const triangles = root.listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()||0)/3,0);
  report.push({ file, bytes: bytes.length, triangles });
  console.log(`${file}: ${triangles} triangles, ${(bytes.length/1024).toFixed(0)} KiB`);
  if (player) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.12, error: 0.08 }), prune());
    // Alpha hair cards have many disconnected borders; ordinary simplification cannot collapse them.
    for(const mesh of root.listMeshes().filter(m=>/Hair|Eyelash/.test(m.getName())))for(const prim of mesh.listPrimitives()){
      const [indices]=MeshoptSimplifier.simplifySloppy(new Uint32Array(prim.getIndices().getArray()),
        new Float32Array(prim.getAttribute('POSITION').getArray()),3,null,Math.min(90,prim.getIndices().getCount()),.3);
      if(indices.length)prim.getIndices().setArray(indices);
    }
    await writeFile(`${out}/crowd.glb`, await io.writeBinary(doc));
  }
}
await writeFile('artifacts/asset-audit/optimized-models.json', JSON.stringify(report,null,2));
