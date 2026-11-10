// FBX SDK converter is needed for the eleven FBX 6.1 models, unsupported by Three's FBXLoader.
import { execFileSync } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const source = resolve(process.argv[2] || resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'Downloads/new_asset/human'));
const converter = resolve(process.argv[3] || 'artifacts/asset-tools/FBX2glTF.exe');
await mkdir('artifacts/asset-audit/humans', { recursive: true });
for (const name of (await readdir(source)).filter(n => n.endsWith('.fbx')).sort()) {
  const id = name === 'giocatore.fbx' ? 'footballer' : `human-${name.match(/\d+/)?.[0] || '0'}`;
  execFileSync(converter, ['--input', resolve(source, name), '--output', resolve('artifacts/asset-audit/humans', id),
    '--binary', '--fbx-temp-dir', resolve('artifacts/asset-audit')], { stdio: 'pipe' });
  console.log(`${name} -> ${id}.glb`);
}
