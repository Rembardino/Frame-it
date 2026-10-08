import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, SPORT } from '../config';
import { courtSurface, surfaceGrain, rod } from './surfaces';

/** Clay, sports flooring and a padded competition ring, generated entirely offline. */
export function sportCourt(renderer: THREE.WebGLRenderer) {
  const { length: L, width: W } = CONFIG.pitch;
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  const ppm = 60, margin = SPORT === 'boxe' ? 0.32 : 3;
  canvas.width = Math.ceil((L + 2 * margin) * ppm);
  canvas.height = Math.ceil((W + 2 * margin) * ppm);
  const ctx = canvas.getContext('2d')!;
  const X = (x: number) => (x + L / 2 + margin) * ppm;
  const Z = (z: number) => (z + W / 2 + margin) * ppm;
  ctx.fillStyle = SPORT === 'pallavolo' ? '#297e88' : SPORT === 'tennis' ? '#365e58' : '#1c365b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = SPORT === 'tennis' ? '#b96c49' : SPORT === 'pallavolo' ? '#dda376' : '#385f8d';
  ctx.fillRect(X(-L / 2), Z(-W / 2), L * ppm, W * ppm);
  if (SPORT === 'pallavolo') {
    ctx.fillStyle = '#cc906b'; ctx.fillRect(X(-3), Z(-W / 2), 6 * ppm, W * ppm);
  }
  surfaceGrain(ctx, SPORT === 'tennis' ? 0.09 : 0.045);
  if (SPORT === 'tennis') {
    // Subtle drag marks, like a freshly swept clay court.
    ctx.save(); ctx.beginPath(); ctx.rect(X(-L / 2), Z(-W / 2), L * ppm, W * ppm); ctx.clip();
    ctx.strokeStyle = 'rgba(240,196,148,0.1)'; ctx.lineWidth = 1;
    for (let z = -W / 2; z < W / 2; z += 0.075) {
      ctx.beginPath(); ctx.moveTo(X(-L / 2), Z(z)); ctx.lineTo(X(L / 2), Z(z + 0.04)); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = '#faf3df'; ctx.lineWidth = ppm * 0.06;
  if (SPORT !== 'boxe') ctx.strokeRect(X(-L / 2), Z(-W / 2), L * ppm, W * ppm);
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
    ctx.save(); ctx.setLineDash([0.15 * ppm, 0.2 * ppm]);
    for (const x of [-3, 3]) for (const side of [-1, 1]) line(x, side * (W / 2 + 0.15), x, side * (W / 2 + 1.4));
    ctx.restore();
  } else {
    ctx.save(); ctx.translate(X(0), Z(0)); ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = 'rgba(230,243,255,0.15)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 1.6 * ppm, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#dce6ef'; ctx.textAlign = 'center'; ctx.font = 'italic bold 35px Arial';
    ctx.fillText('FRAME IT', 0, 0); ctx.fillStyle = '#97b1c8'; ctx.font = '12px Arial';
    ctx.fillText('LIVE SPORTS', 0, 24); ctx.restore();
  }
  if (SPORT !== 'boxe') {
    ctx.fillStyle = 'rgba(239,246,228,0.65)'; ctx.font = 'bold 23px Arial'; ctx.textAlign = 'center';
    ctx.fillText('FRAME IT', X(-L * 0.28), Z(-W / 2 - 1.3));
    ctx.fillText('LIVE SPORTS', X(L * 0.28), Z(-W / 2 - 1.3));
  }
  group.add(courtSurface(canvas, L + 2 * margin, W + 2 * margin, renderer));
  if (SPORT === 'boxe') group.add(boxingRing(L, W));
  else group.add(courtNet(W), refereeChair(W));
  return group;
}

function boxingRing(L: number, W: number) {
  const group = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(L + 0.64, 0.6, W + 0.64),
    new THREE.MeshStandardMaterial({ color: 0x122943, roughness: 0.82 }));
  platform.position.y = -0.32; group.add(platform);
  const silver = new THREE.MeshStandardMaterial({ color: 0x97a8ba, roughness: 0.34, metalness: 0.65 });
  for (const x of [-L / 2, L / 2]) for (const z of [-W / 2, W / 2]) {
    group.add(rod(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 1.75, z), 0.075, silver));
    const color = x < 0 ? (z > 0 ? 0xcb3c4d : 0xe9e6dc) : (z < 0 ? 0x387cdc : 0xe9e6dc);
    const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.95, 4, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.68 }));
    pad.position.set(x - Math.sign(x) * 0.075, 1, z - Math.sign(z) * 0.075); group.add(pad);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 6), silver);
    cap.position.set(x, 1.75, z); group.add(cap);
  }
  [0xd53e50, 0xf5f0e4, 0x427fc4, 0xf5f0e4].forEach((color, index) => {
    const y = 0.4 + index * 0.35;
    const geometries: THREE.BufferGeometry[] = [];
    const rope = (from: THREE.Vector3, to: THREE.Vector3) => {
      const middle = from.clone().lerp(to, 0.5); middle.y -= 0.035;
      geometries.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, middle, to]), 16, 0.026, 6, false));
    };
    for (const z of [-W / 2, W / 2]) rope(new THREE.Vector3(-L / 2, y, z), new THREE.Vector3(L / 2, y, z));
    for (const x of [-L / 2, L / 2]) rope(new THREE.Vector3(x, y, -W / 2), new THREE.Vector3(x, y, W / 2));
    group.add(new THREE.Mesh(mergeGeometries(geometries)!, new THREE.MeshStandardMaterial({ color, roughness: 0.72 })));
    geometries.forEach(geometry => geometry.dispose());
  });
  const ties: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) for (const offset of [-L * 0.25, L * 0.25]) {
    const tie = new THREE.BoxGeometry(0.045, 1.1, 0.045);
    ties.push(tie.clone().translate(offset, 0.925, side * W / 2));
    ties.push(tie.clone().translate(side * L / 2, 0.925, offset)); tie.dispose();
  }
  group.add(new THREE.Mesh(mergeGeometries(ties)!, new THREE.MeshStandardMaterial({ color: 0xf6eee1, roughness: 0.9 })));
  ties.forEach(geometry => geometry.dispose());
  return group;
}

function courtNet(W: number) {
  const group = new THREE.Group();
  const tennis = SPORT === 'tennis';
  const height = tennis ? 1.07 : 2.43;
  const bottom = tennis ? 0.035 : height - 1;
  const top = (z: number) => tennis ? 0.914 + 0.156 * (z / (W / 2)) ** 2 : height;
  const points: number[] = [];
  const segment = (y1: number, z1: number, y2: number, z2: number) => points.push(0, y1, z1, 0, y2, z2);
  const cell = tennis ? 0.1 : 0.14;
  for (let z = -W / 2; z < W / 2; z += cell) {
    const next = Math.min(W / 2, z + cell);
    for (let t = 0; t <= 1; t += cell / (height - bottom)) {
      segment(bottom + t * (top(z) - bottom), z, bottom + t * (top(next) - bottom), next);
    }
    segment(bottom, z, top(z), z);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: tennis ? 0x192b31 : 0x354653, transparent: true, opacity: 0.72 })));
  const tapePoints = Array.from({ length: 25 }, (_, i) => {
    const z = -W / 2 + W * i / 24; return new THREE.Vector3(0, top(z), z);
  });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tapePoints), 32, tennis ? 0.025 : 0.035, 8, false),
    new THREE.MeshStandardMaterial({ color: 0xfcf4e4, roughness: 0.78 })));
  if (tennis) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.94, 0.045), new THREE.MeshStandardMaterial({ color: 0xfcf4e4 }));
    strap.position.y = 0.47; group.add(strap);
  }
  for (const z of [-W / 2 - 0.25, W / 2 + 0.25]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, height + 0.15, 12),
      new THREE.MeshStandardMaterial({ color: tennis ? 0x30473d : 0x667f95, roughness: 0.4, metalness: 0.5 }));
    post.position.set(0, (height + 0.15) / 2, z); group.add(post);
    if (!tennis) {
      const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 1.7, 3, 12), new THREE.MeshStandardMaterial({ color: 0x237c91, roughness: 0.7 }));
      pad.position.set(0, 1.02, z); group.add(pad);
      for (let i = 0; i < 8; i++) {
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 6),
          new THREE.MeshLambertMaterial({ color: i % 2 ? 0xf4f3e8 : 0xe54b54 }));
        antenna.position.set(0, height + i * 0.1 + 0.05, Math.sign(z) * W / 2); group.add(antenna);
      }
    }
  }
  return group;
}

function refereeChair(W: number) {
  const group = new THREE.Group(), z = -W / 2 - 1.1;
  const height = SPORT === 'tennis' ? 1.85 : 1.65;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb7c5cf, roughness: 0.4, metalness: 0.55 });
  const bars: THREE.BufferGeometry[] = [];
  const addBar = (from: THREE.Vector3, to: THREE.Vector3, radius = 0.028) => {
    const bar = rod(from, to, radius, steel); bar.updateMatrix(); bars.push(bar.geometry.applyMatrix4(bar.matrix));
  };
  for (const x of [-0.32, 0.32]) for (const side of [-1, 1]) {
    addBar(new THREE.Vector3(x, 0, z + side * 0.4), new THREE.Vector3(x, height, z + side * 0.24));
  }
  for (let y = 0.25; y < height; y += 0.3) addBar(new THREE.Vector3(-0.32, y, z - 0.4 + y * 0.08), new THREE.Vector3(0.32, y, z - 0.4 + y * 0.08));
  group.add(new THREE.Mesh(mergeGeometries(bars)!, steel)); bars.forEach(geometry => geometry.dispose());
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.6), new THREE.MeshStandardMaterial({ color: 0x285771, roughness: 0.65 }));
  seat.position.set(0, height, z); group.add(seat);
  if (SPORT === 'tennis') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.06), seat.material);
    back.position.set(0, height + 0.3, z - 0.28); group.add(back);
    const parasol = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.35, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xe5dbc0, roughness: 0.9, side: THREE.DoubleSide }));
    parasol.position.set(0, height + 1.3, z); group.add(parasol);
  }
  return group;
}
