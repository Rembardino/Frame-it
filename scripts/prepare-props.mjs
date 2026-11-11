// Scenery props modelled in Blender (scripts/blender/*.py): builds each pack, bakes the ambient occlusion into the
// vertex colours and writes compact .glb files (welded, quantized) into src/assets/props/.
//   node scripts/prepare-props.mjs [arena] [country]        BLENDER=<path to blender.exe> overrides the default path
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld } from '@gltf-transform/functions';

const blender = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
const packs = process.argv.slice(2).length ? process.argv.slice(2) : ['arena', 'country'];
mkdirSync('artifacts/props', { recursive: true });
mkdirSync('src/assets/props', { recursive: true });
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
for (const pack of packs) {
  const raw = resolve(`artifacts/props/${pack}.raw.glb`), preview = resolve(`artifacts/props/preview-${pack}`);
  const log = execFileSync(blender, ['--background', '--factory-startup', '--python', 'scripts/blender/build.py', '--', pack, raw, preview], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!/exported /.test(log)) throw new Error(`Blender did not export ${pack}:\n${log.slice(-2000)}`);
  const document = await io.read(raw);
  await document.transform(dedup({ keepUniqueNames: true }), weld(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8 }), prune());
  const out = `src/assets/props/${pack}.glb`;
  await io.write(out, document);
  const triangles = document.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  console.log(`${out}: ${document.getRoot().listNodes().filter((n) => n.getMesh()).length} props, ${triangles} triangles, ${(statSync(out).size / 1024).toFixed(0)} kB (previews in ${preview})`);
}
