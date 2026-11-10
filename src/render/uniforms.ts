import * as THREE from 'three';
import type { TeamKit } from '../teams';

const logos = new Map<string, Promise<THREE.Texture>>();
const numbers = new Map<number, THREE.CanvasTexture>();
const patterns = ['stripes', 'sash', 'hoops', 'split', 'chevron', 'diamonds', 'pinstripes'];
const noCrest = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
noCrest.needsUpdate = true;

export function loadCrest(kit: TeamKit) {
  if (!kit.logo) return Promise.resolve(noCrest);
  let pending = logos.get(kit.logo);
  if (!pending) {
    pending = new THREE.TextureLoader().loadAsync(kit.logo).then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return texture;
    });
    logos.set(kit.logo, pending);
  }
  return pending;
}

function numberTexture(n: number) {
  if (!numbers.has(n)) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '900 370px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = '#142136'; ctx.fillStyle = '#fffaf0';
    ctx.strokeText(String(n), 256, 273, 450); ctx.fillText(String(n), 256, 273, 450);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    numbers.set(n, texture);
  }
  return numbers.get(n)!;
}

/** Markings use the shirt's bind positions and deform with its skin: no floating planes, UV prints or duplicate numbers. */
export async function dressUniform(mesh: THREE.Mesh, model: THREE.Group, kit: TeamKit, number: number, frontNumber: boolean, keeper = false, shorts = false) {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  // The imported football shirt already contains a number and sponsor in its image.
  mat.map = null; mat.normalMap = null; mat.roughnessMap = null;
  mat.color.setHex(keeper ? kit.keeper : shorts ? kit.shorts : kit.shirt);
  mesh.geometry.computeBoundingBox(); model.updateWorldMatrix(true, true);
  const frame = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
  const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(frame);
  const height = bounds.max.y - bounds.min.y;
  const uniforms = {
    clubFrame: { value: frame }, clubOrigin: { value: new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2) },
    clubHeight: { value: height }, clubPattern: { value: shorts ? 7 : patterns.indexOf(kit.pattern) },
    clubAccent: { value: new THREE.Color(keeper ? 0x172838 : kit.accent) },
    clubCrest: { value: await loadCrest(kit) }, clubDigits: { value: numberTexture(number || 1) },
    clubNumber: { value: !!number && !shorts }, clubFrontNumber: { value: frontNumber && !shorts },
  };
  mat.userData.club = { uniforms, keeper, shorts };
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform mat4 clubFrame; uniform vec3 clubOrigin; uniform float clubHeight;
      varying vec3 vClubPosition; varying vec3 vClubNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vClubPosition = ((clubFrame * vec4(position, 1.0)).xyz - clubOrigin) / clubHeight;
      vClubNormal = normalize(mat3(clubFrame) * normal);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vClubPosition; varying vec3 vClubNormal;
      uniform int clubPattern; uniform vec3 clubAccent;
      uniform sampler2D clubCrest; uniform sampler2D clubDigits;
      uniform bool clubNumber; uniform bool clubFrontNumber;
      float clubRect(vec2 uv) { return step(0.0, uv.x)*step(uv.x, 1.0)*step(0.0, uv.y)*step(uv.y, 1.0); }
      vec4 clubDecal(sampler2D tex, vec2 uv) { vec4 c=texture2D(tex, clamp(uv, 0.0, 1.0)); c.a*=clubRect(uv); return c; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 p=vClubPosition.xy;
      float pattern=0.0;
      if(clubPattern==0) pattern=step(0.35, sin(p.x*36.0));
      else if(clubPattern==1) pattern=1.0-smoothstep(0.10, 0.13, abs(p.y-p.x-0.53));
      else if(clubPattern==2) pattern=step(0.45, sin(p.y*31.0));
      else if(clubPattern==3) pattern=step(0.0, p.x);
      else if(clubPattern==4) pattern=1.0-smoothstep(0.055,0.075,abs(p.y+abs(p.x)*0.6-0.63));
      else if(clubPattern==5) pattern=step(0.68, abs(sin((p.x+p.y)*21.0)*sin((p.x-p.y)*21.0)))*0.65;
      else if(clubPattern==6) pattern=step(0.94, cos(p.x*80.0));
      else if(clubPattern==7) pattern=smoothstep(0.28,0.33,abs(p.x));
      diffuseColor.rgb=mix(diffuseColor.rgb,clubAccent,pattern);
      if(clubPattern!=7) diffuseColor.rgb=mix(diffuseColor.rgb,clubAccent,smoothstep(0.965,0.985,p.y)*0.8);
      // Both face tests are in the garment's rest frame, so limbs cannot acquire duplicate decals as they turn.
      if(vClubNormal.z>0.45 && vClubPosition.z>0.0) {
        vec4 crest=clubDecal(clubCrest,(p-vec2(-0.18,0.68))/vec2(0.19,0.22));
        diffuseColor.rgb=mix(diffuseColor.rgb,crest.rgb,crest.a);
        if(clubFrontNumber) {
          vec4 digit=clubDecal(clubDigits,(p-vec2(-0.13,0.25))/vec2(0.26,0.33));
          diffuseColor.rgb=mix(diffuseColor.rgb,digit.rgb,digit.a);
        }
      }
      if(clubNumber && vClubNormal.z < -0.45 && vClubPosition.z<0.0) {
        vec4 digit=clubDecal(clubDigits,vec2(0.5-p.x/0.39,(p.y-0.25)/0.53));
        diffuseColor.rgb=mix(diffuseColor.rgb,digit.rgb,digit.a);
      }`);
  };
  mat.customProgramCacheKey = () => 'club-uniform-v1';
  mat.needsUpdate = true;
}

export async function changeUniform(mat: THREE.MeshStandardMaterial, kit: TeamKit) {
  const club = mat.userData.club;
  if (!club) return;
  mat.color.setHex(club.keeper ? kit.keeper : club.shorts ? kit.shorts : kit.shirt);
  club.uniforms.clubPattern.value = club.shorts ? 7 : patterns.indexOf(kit.pattern);
  club.uniforms.clubAccent.value.setHex(club.keeper ? 0x172838 : kit.accent);
  club.uniforms.clubCrest.value = await loadCrest(kit);
}
