// Gestures keyed by hand in Blender (scripts/blender/clips.py) -> appended to the game's clip library.
//   node scripts/prepare-blender-clips.mjs        BLENDER=<path to blender.exe> overrides the default path
// Run it after prepare-animations / prepare-rpg-animations: those rebuild the library and drop the "blender_" clips at its end.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const blender = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
mkdirSync('artifacts/clips', { recursive: true });
const json = resolve('artifacts/clips/clips.json');
const log = execFileSync(blender, ['--background', '--factory-startup', '--python', 'scripts/blender/clips.py', '--',
  resolve('src/assets/characters/athlete-tee.glb'), json, resolve('artifacts/clips/preview')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (!/written /.test(log)) throw new Error(`Blender did not write the clips:\n${log.slice(-2000)}`);
const baked = JSON.parse(readFileSync(json, 'utf8'));

const manifestPath = 'src/assets/characters/animations.json', binPath = 'src/assets/characters/animations.bin.gz';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const kept = manifest.clips.filter((c) => !c.id.startsWith('blender_'));
const length = Math.max(...kept.map((c) => c.offset + c.frames * c.stride));
const chunks = [gunzipSync(readFileSync(binPath)).subarray(0, length * 2)];
let offset = length;
for (const clip of baked.clips) {
  const stride = clip.bones.length * 4 + 1, packed = new Int16Array(clip.frames * stride);
  for (let f = 0; f < clip.frames; f++) {
    for (let i = 0; i < stride - 1; i++) packed[f * stride + i] = Math.round(clip.quats[f * (stride - 1) + i] * manifest.quaternionScale);
    const hip = Math.round(clip.hip[f] * manifest.hipScale);
    if (Math.abs(hip) > 32767) throw new Error(`Hip height out of range in ${clip.id}`);
    packed[f * stride + stride - 1] = hip;
  }
  // since 5: replays recorded with an older catalog never see these clips.
  kept.push({ id: clip.id, source: 'scripts/blender/clips.py', groups: [clip.group], duration: clip.duration, sourceDuration: clip.duration, trim: [0, clip.duration],
    contact: clip.contact, direction: 0, frames: clip.frames, bones: clip.bones, offset, stride, since: 5 });
  chunks.push(Buffer.from(packed.buffer));
  offset += packed.length;
  console.log(`${clip.id}: ${clip.group}, ${clip.frames} frames, ${clip.bones.length} bones`);
}
manifest.clips = kept;
manifest.catalog = Math.max(manifest.catalog ?? 0, 5);
writeFileSync(manifestPath, JSON.stringify(manifest));
writeFileSync(binPath, gzipSync(Buffer.concat(chunks), { level: 9 }));
console.log(`${kept.length} clips in the library (previews in artifacts/clips/preview)`);
