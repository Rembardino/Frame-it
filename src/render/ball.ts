import * as THREE from 'three';
import { SPORT } from '../config';
import { BALL_RADIUS } from '../sim/match';

/** Real seams and panels on a smooth sphere, also visible in close-up replays. */
export function createBall() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  const phi = (1 + Math.sqrt(5)) / 2;
  const centers: THREE.Vector3[] = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) {
    centers.push(new THREE.Vector3(0, a, b).normalize(), new THREE.Vector3(a, b, 0).normalize(), new THREE.Vector3(b, 0, a).normalize());
  }
  const frames = centers.map(center => {
    const tangent = new THREE.Vector3().crossVectors(center, Math.abs(center.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    return { center, tangent, bitangent: new THREE.Vector3().crossVectors(center, tangent) };
  });
  const point = new THREE.Vector3();
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / canvas.width * Math.PI * 2, v = y / canvas.height * Math.PI;
    point.set(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
    let rgb = [242, 242, 234];
    if (SPORT === 'basket') {
      const seam = Math.min(Math.abs(point.x), Math.abs(point.z), Math.abs(point.y), Math.abs(point.y - 0.5 * Math.sin(u * 2)));
      rgb = seam < 0.025 ? [43, 26, 22] : [220, 110, 37];
    } else if (SPORT === 'tennis') {
      const seam = Math.abs(point.y - 0.48 * Math.cos(u * 2));
      rgb = seam < 0.045 ? [248, 250, 212] : [201, 232, 52];
    } else if (SPORT === 'pallavolo') {
      const angle = (u + 0.65 * Math.sin(v * 2) + Math.PI * 2) % (Math.PI * 2);
      const panel = angle / (Math.PI / 3);
      rgb = Math.abs(panel - Math.round(panel)) < 0.025 ? [225, 228, 216]
        : Math.floor(panel) % 3 === 0 ? [38, 92, 192] : Math.floor(panel) % 3 === 1 ? [248, 204, 46] : [246, 245, 234];
    } else {
      let nearest = frames[0], best = -1;
      for (const frame of frames) {
        const dot = point.dot(frame.center);
        if (dot > best) { best = dot; nearest = frame; }
      }
      const tx = point.dot(nearest.tangent), ty = point.dot(nearest.bitangent);
      const angle = ((Math.atan2(ty, tx) + Math.PI * 2) % (Math.PI * 2 / 5)) - Math.PI / 5;
      const edge = Math.hypot(tx, ty) * Math.cos(angle);
      rgb = edge < 0.29 ? [27, 37, 51] : edge < 0.305 ? [170, 180, 182] : best < 0.84 ? [212, 217, 211] : rgb;
    }
    const grain = ((x * 13 + y * 37 + x * y * 3) % 11) - 5;
    const offset = (y * canvas.width + x) * 4;
    for (let c = 0; c < 3; c++) pixels.data[offset + c] = rgb[c] + grain;
    pixels.data[offset + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 24, 16), new THREE.MeshStandardMaterial({ map: texture, roughness: SPORT === 'tennis' ? 1 : 0.72, metalness: 0 }));
}
