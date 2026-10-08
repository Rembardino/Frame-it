import * as THREE from 'three';

/** Repeating, deterministic grain: no downloads and small textures in the Android bundle. */
export function surfaceGrain(ctx: CanvasRenderingContext2D, strength = 0.08, seed = 17) {
  const tile = document.createElement('canvas'); tile.width = tile.height = 128;
  const brush = tile.getContext('2d')!;
  let value = seed;
  const random = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  for (let i = 0; i < 5500; i++) {
    brush.fillStyle = random() > 0.5 ? `rgba(255,255,255,${strength})` : `rgba(0,0,0,${strength})`;
    brush.fillRect(random() * 128, random() * 128, 1, 1 + random() * 2);
  }
  ctx.save(); ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
}

export function courtSurface(canvas: HTMLCanvasElement, length: number, width: number, renderer: THREE.WebGLRenderer, roughness = 0.86) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(length, width).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: texture, roughness, metalness: 0.02 }));
  floor.receiveShadow = true;
  return floor;
}

export function rod(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}
