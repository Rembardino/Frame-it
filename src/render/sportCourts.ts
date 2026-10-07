import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';

/** Campi e attrezzature dei tre sport, disegnati con geometrie native. */
export function sportCourt(renderer: THREE.WebGLRenderer) {
  const { length: L, width: W } = CONFIG.pitch;
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  const ppm = 60, margin = 2;
  canvas.width = Math.ceil((L + 2 * margin) * ppm);
  canvas.height = Math.ceil((W + 2 * margin) * ppm);
  const ctx = canvas.getContext('2d')!;
  const X = (x: number) => (x + L / 2 + margin) * ppm;
  const Z = (z: number) => (z + W / 2 + margin) * ppm;
  ctx.fillStyle = '#1c3148'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = SPORT === 'tennis' ? '#bc6743' : SPORT === 'pallavolo' ? '#e09a62' : '#304d8c';
  ctx.fillRect(X(-L / 2), Z(-W / 2), L * ppm, W * ppm);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = ppm * 0.06;
  ctx.strokeRect(X(-L / 2), Z(-W / 2), L * ppm, W * ppm);
  const line = (x1: number, z1: number, x2: number, z2: number) => {
    ctx.beginPath(); ctx.moveTo(X(x1), Z(z1)); ctx.lineTo(X(x2), Z(z2)); ctx.stroke();
  };
  if (SPORT === 'tennis') {
    for (const z of [-4.115, 4.115]) line(-L / 2, z, L / 2, z);
    for (const x of [-6.4, 6.4]) line(x, -4.115, x, 4.115);
    line(-6.4, 0, 6.4, 0);
    for (const x of [-L / 2, L / 2]) line(x, 0, x + Math.sign(-x) * 0.15, 0);
  } else if (SPORT === 'pallavolo') {
    for (const x of [-3, 0, 3]) line(x, -W / 2, x, W / 2);
  } else {
    ctx.font = 'bold 48px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#a7c8ed';
    ctx.fillText('FRAME IT', X(0), Z(0));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  group.add(new THREE.Mesh(new THREE.PlaneGeometry(L + 2 * margin, W + 2 * margin).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: texture })));
  if (SPORT === 'boxe') {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(L + 0.6, 0.5, W + 0.6), new THREE.MeshLambertMaterial({ color: 0x162947 }));
    platform.position.y = -0.27; group.add(platform);
    const rod = (from: THREE.Vector3, to: THREE.Vector3, radius: number, color: number) => {
      const d = to.clone().sub(from);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 8), new THREE.MeshLambertMaterial({ color }));
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); group.add(mesh);
    };
    for (const x of [-L / 2, L / 2]) for (const z of [-W / 2, W / 2]) {
      rod(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 1.65, z), 0.12, x < 0 ? 0xdd3849 : 0x4383de);
    }
    for (const y of [0.4, 0.75, 1.1, 1.45]) {
      const color = y > 1 ? 0xe2ebfa : 0xd34150;
      for (const z of [-W / 2, W / 2]) rod(new THREE.Vector3(-L / 2, y, z), new THREE.Vector3(L / 2, y, z), 0.026, color);
      for (const x of [-L / 2, L / 2]) rod(new THREE.Vector3(x, y, -W / 2), new THREE.Vector3(x, y, W / 2), 0.026, color);
    }
  } else {
    const height = SPORT === 'tennis' ? 0.98 : 2.43;
    const bottom = SPORT === 'tennis' ? 0.04 : height - 1;
    const positions: number[] = [];
    const seg = (y1: number, z1: number, y2: number, z2: number) => positions.push(0, y1, z1, 0, y2, z2);
    for (let y = bottom; y <= height; y += 0.15) seg(y, -W / 2, y, W / 2);
    for (let z = -W / 2; z <= W / 2; z += 0.15) seg(bottom, z, height, z);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: SPORT === 'tennis' ? 0x182331 : 0xcdddeb })));
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, W), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    tape.position.y = height; group.add(tape);
    for (const z of [-W / 2 - 0.2, W / 2 + 0.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, height + 0.25, 8), new THREE.MeshLambertMaterial({ color: 0x3e699d }));
      post.position.set(0, (height + 0.25) / 2, z); group.add(post);
      if (SPORT === 'pallavolo') {
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.8, 6), new THREE.MeshLambertMaterial({ color: 0xff4a52 }));
        antenna.position.set(0, height + 0.4, z); group.add(antenna);
      }
    }
  }
  return group;
}
