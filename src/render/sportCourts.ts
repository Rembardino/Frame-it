import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, SPORT } from '../config';
import { courtSurface, surfaceGrain, rod } from './surfaces';
import { propObject, withProps } from './props';

/** Clay, sports flooring and a padded competition ring, generated entirely offline. */
export function sportCourt(renderer: THREE.WebGLRenderer) {
  const { length: L, width: W } = CONFIG.pitch;
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  const ppm = 60, margin = SPORT === 'boxe' ? RING_APRON : 3;
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
  if (SPORT === 'boxe') group.add(boxingRing(L, renderer));
  else group.add(courtNet(W), refereeChair(W));
  return group;
}

/** Dal quadrato delle corde al bordo della pedana (m): lo stesso del modello scripts/blender/arena.py. */
const RING_APRON = 0.55;

/**
 * Ring rialzato, modellato in Blender: pedana con la gonna fino a terra, pali, tenditori, cuscini d'angolo, corde,
 * scalette, tavoli dei giudici e l'americana delle luci. Il tappeto resta la superficie disegnata qui sopra.
 */
function boxingRing(L: number, renderer: THREE.WebGLRenderer) {
  const group = new THREE.Group();
  withProps('arena', (props) => group.add(propObject(props.ring), propObject(props.ring_rig)));
  // Scritte sulla gonna, una per lato.
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8c15a'; ctx.font = 'italic bold 92px Arial'; ctx.fillText('FRAME IT', 330, 68);
  ctx.fillStyle = '#eef2f6'; ctx.font = 'bold 54px Arial'; ctx.fillText('LIVE SPORTS', 780, 70);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (let side = 0; side < 4; side++) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.55), material);
    banner.rotation.y = side * Math.PI / 2;
    banner.position.set(Math.sin(side * Math.PI / 2), 0, Math.cos(side * Math.PI / 2)).multiplyScalar(L / 2 + RING_APRON - 0.01).setY(-0.62);
    group.add(banner);
  }
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
  const height = SPORT === 'tennis' ? 1.85 : 1.665;
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
