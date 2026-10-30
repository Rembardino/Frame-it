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

export function courtSurface(canvas: HTMLCanvasElement, length: number, width: number, renderer: THREE.WebGLRenderer, roughness = 0.86, relief?: { canvas: HTMLCanvasElement; scale: number }) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness, metalness: 0.02 });
  if (relief) {
    const bump = new THREE.CanvasTexture(relief.canvas);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(length / 4, width / 4);
    bump.anisotropy = texture.anisotropy;
    material.bumpMap = bump; material.bumpScale = relief.scale;
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(length, width).rotateX(-Math.PI / 2), material);
  floor.receiveShadow = true;
  return floor;
}

/** Tile di rilievo (grigio = piatto): fili d'erba, granuli di terra o venature, da ripetere sulla superficie. */
export function reliefTile(kind: 'grass' | 'grain' | 'wood', seed = 5) {
  const tile = document.createElement('canvas'); tile.width = tile.height = 256;
  const g = tile.getContext('2d')!;
  let value = seed;
  const random = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  if (kind === 'wood') {
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${random() > 0.5 ? 255 : 0},${random() > 0.5 ? 255 : 0},${random() > 0.5 ? 255 : 0},0.07)`;
      g.lineWidth = 0.5 + random(); const y = random() * 256;
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(90, y + random() * 6 - 3, 170, y - random() * 6 + 3, 256, y); g.stroke();
    }
  } else {
    const n = kind === 'grass' ? 9000 : 5000;
    for (let i = 0; i < n; i++) {
      const l = kind === 'grass' ? 180 + random() * 75 : 110 + random() * 90;
      g.fillStyle = `rgba(${l},${l},${l},0.55)`;
      const x = random() * 256, y = random() * 256;
      if (kind === 'grass') { g.fillRect(x, y, 1, 2 + random() * 4); }
      else { g.fillRect(x, y, 1 + random() * 2, 1 + random() * 2); }
    }
  }
  return tile;
}

export function rod(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}
