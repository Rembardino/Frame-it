/** Sport equipment and small props. Human geometry comes from the imported skinned assets. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { radialTexture } from './stage';
import { t } from '../i18n';
import { RACKET_REACH } from '../animation/motion';
const sphere = new THREE.SphereGeometry(1, 10, 7);
const box = new RoundedBoxGeometry(1,1,1,1,.1);
const cylinder = new THREE.CylinderGeometry(1,1,1,10);
const surface = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8});
type Part = { geometry: THREE.BufferGeometry; color: number; at: [number,number,number]; size: [number,number,number] };
const oval = (color: number, at: Part['at'], size: Part['size']): Part => ({ geometry: sphere, color, at, size });
const slab = (color: number, at: Part['at'], size: Part['size']): Part => ({ geometry: box, color, at, size });
const band = (color: number, at: Part['at'], size: Part['size']): Part => ({ geometry: cylinder, color, at, size });
const shaped = (geometry: THREE.BufferGeometry, color: number, at: Part['at']): Part => ({ geometry, color, at, size: [1,1,1] });
function mesh(parts: Part[], castShadow = false) {
  const geometries = parts.map(part => {
    let geometry = part.geometry.clone().scale(...part.size).translate(...part.at);
    if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
    const color = new THREE.Color(part.color), values = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3)); return geometry;
  });
  const result = new THREE.Mesh(mergeGeometries(geometries)!, surface);
  geometries.forEach(geometry => geometry.dispose()); result.castShadow = castShadow;
  return result;
}

/** Scatola aperta con l'anello, sul palmo. Fuori scala e con un luccichio: dalla camera è lontana decine di metri. */
export function ringBox() {
  const group = new THREE.Group();
  // Il "sopra" della scatola è il dorso della mano rivolto in alto quando il braccio è teso in avanti.
  group.position.set(0.035, -0.07, 0); group.rotation.z = -Math.PI / 2; group.scale.setScalar(1.4); group.visible = false;
  const gold = new THREE.TorusGeometry(0.034, 0.011, 6, 18);
  group.add(mesh([
    slab(0xb3123a, [0, 0.03, 0], [0.09, 0.06, 0.09]),
    slab(0xb3123a, [-0.05, 0.085, 0], [0.014, 0.08, 0.09]),
    slab(0xf6f0e6, [0, 0.062, 0], [0.07, 0.008, 0.07]),
    { geometry: gold, color: 0xffc928, at: [0, 0.095, 0], size: [1, 1, 1] },
    oval(0xe8fbff, [0, 0.135, 0], [0.02, 0.02, 0.02]),
  ]));
  gold.dispose();
  const sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('255,246,200'), blending: THREE.AdditiveBlending, depthWrite: false }));
  sparkle.position.set(0, 0.135, 0);
  group.add(sparkle);
  return { group, sparkle };
}

/** Racchetta a grandezza vera (68 cm, ovale di 25×33 cm): manico nella mano, gola a V, centro delle corde a RACKET_REACH dal polso. */
export function racket(color: number) {
  const group = new THREE.Group(); group.rotation.y = Math.PI / 2;
  const c = -RACKET_REACH, rx = 0.125, stretch = 1.3;
  const frame = new THREE.TorusGeometry(rx, 0.011, 5, 28);
  const arm = (side: number) => {
    const from = new THREE.Vector3(0, -0.2, 0), to = new THREE.Vector3(side * 0.075, c + rx * stretch * 0.72, 0), d = to.clone().sub(from);
    return new THREE.CylinderGeometry(0.009, 0.009, d.length(), 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
      .translate((from.x + to.x) / 2, (from.y + to.y) / 2, 0);
  };
  const left = arm(-1), right = arm(1);
  group.add(mesh([band(0x252c39, [0, -0.085, 0], [0.018, 0.23, 0.018]), band(0xebf0f6, [0, 0.03, 0], [0.021, 0.014, 0.021]),
    shaped(left, color, [0, 0, 0]), shaped(right, color, [0, 0, 0]),
    { geometry: frame, color, at: [0, c, 0], size: [1, stretch, 1] }])); frame.dispose(); left.dispose(); right.dispose();
  const points: number[] = [];
  for (let i = -3; i <= 3; i++) {
    const offset = i * 0.034, extent = Math.sqrt((rx - 0.007) ** 2 - offset ** 2);
    points.push(offset, c - extent * stretch, 0, offset, c + extent * stretch, 0);
    points.push(-extent, c + offset * stretch, 0, extent, c + offset * stretch, 0);
  }
  const strings = new THREE.BufferGeometry(); strings.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(strings, new THREE.LineBasicMaterial({ color: 0xd4dedb, transparent: true, opacity: 0.75 })));
  return group;
}

/** Guantone: polso lungo con la fascia chiara, sacco imbottito, nocche e pollice a parte (side = lato del pollice). +y = verso le dita; la punta è a 0,225. */
export function boxingGlove(leather: THREE.Material, tape: THREE.Material, side: number) {
  const part = (rx: number, ry: number, rz: number, x: number, y: number, z: number) => new THREE.SphereGeometry(1, 14, 10).scale(rx, ry, rz).translate(x, y, z);
  // Guantone da 12 once: copre tutta la mano. La punta resta a 0,225 m dal polso (landPunch), il volume cresce all'indietro e ai lati.
  const parts = [part(0.1, 0.12, 0.104, 0, 0.1, 0), part(0.094, 0.07, 0.1, 0, 0.155, 0.008), part(0.038, 0.07, 0.044, side * 0.094, 0.08, 0.026),
    new THREE.CylinderGeometry(0.068, 0.06, 0.15, 14).translate(0, -0.03, 0)];
  const group = new THREE.Group();
  const glove = new THREE.Mesh(mergeGeometries(parts)!, leather); glove.name = 'team-glove';
  parts.forEach(geometry => geometry.dispose());
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.071, 0.066, 0.045, 14), tape); band.position.y = -0.05;
  group.add(glove, band);
  return group;
}

/** Ferro da golf: impugnatura, asta e testa. La testa (a −0,98) è il punto che colpisce la palla. */
export function golfClub() {
  return mesh([band(0x1b1d22, [0, -0.07, 0], [0.017, 0.15, 0.017]), band(0xc9ced6, [0, -0.56, 0], [0.008, 0.84, 0.008]),
    slab(0x9aa3ad, [0.035, -0.975, 0], [0.095, 0.035, 0.03])]);
}

/** Sacca da golf sulla schiena del caddie, con le teste dei bastoni che spuntano. */
export function golfBag(color: number) {
  const parts: Part[] = [band(color, [0, 0, 0], [0.12, 0.8, 0.12]), band(0x1d1f24, [0, 0.42, 0], [0.125, 0.05, 0.125]),
    band(0x1d1f24, [0, -0.38, 0], [0.125, 0.06, 0.125])];
  [[-0.05, 0.03], [0.05, -0.02], [0, 0.06], [0.03, 0.05], [-0.03, -0.05]].forEach(([x, z], i) => {
    parts.push(band(0xb8bec6, [x, 0.5 + i * 0.02, z], [0.01, 0.2, 0.01]), slab(i % 2 ? 0x2b2f36 : 0x8a9099, [x + 0.02, 0.61 + i * 0.02, z], [0.055, 0.03, 0.035]));
  });
  const bag = mesh(parts, true);
  bag.position.set(-0.19, 0.24, 0.04); bag.rotation.z = -0.3;
  return bag;
}

/** Il cartello del marshal: quando lo alza, silenzio per il colpo. */
export function quietSign() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f2e4'; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#245a3a'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 246, 118);
  ctx.fillStyle = '#245a3a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 44px Arial';
  ctx.fillText(t('SILENZIO'), 128, 66, 230);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  group.add(mesh([band(0x6b4a2b, [0, -0.2, 0], [0.012, 0.36, 0.012])]));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  sign.position.y = -0.46;
  group.add(sign);
  return group;
}

/** Bici da corsa: telaio del colore della squadra, sella all'altezza del bacino del corridore. */
export function bicycle(color: number) {
  const tube = (a: [number, number, number], b: [number, number, number], r: number) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  };
  const bb: [number, number, number] = [0.16, 0.3, 0], seat: [number, number, number] = [0.02, 0.84, 0], head: [number, number, number] = [0.58, 0.82, 0];
  const rear: [number, number, number] = [-0.36, 0.34, 0], front: [number, number, number] = [0.64, 0.34, 0];
  const group = new THREE.Group();
  // Ruote senza raggi visibili (raggi veri a 60 fps sembrerebbero girare all'indietro): copertone, cerchio e mozzo
  // sono simmetrici, quindi stanno nel telaio e non serve farli girare. Il disco velato = raggi "mossi" come in TV.
  const wheel = (at: [number, number, number]): Part[] => [{ geometry: tire, color: 0x15181d, at, size: [1, 1, 1] },
    { geometry: rim, color: 0x9aa3ad, at, size: [1, 1, 1] }, { geometry: hub, color: 0xb8bec6, at, size: [1, 1, 1] }];
  group.add(mesh([
    shaped(tube(bb, seat, 0.02), color, [0, 0, 0]), shaped(tube(seat, head, 0.018), color, [0, 0, 0]), shaped(tube(bb, head, 0.022), color, [0, 0, 0]),
    shaped(tube(bb, rear, 0.012), color, [0, 0, 0]), shaped(tube(seat, rear, 0.012), color, [0, 0, 0]), shaped(tube(head, front, 0.014), 0x2b2f36, [0, 0, 0]),
    shaped(tube(head, [0.68, 0.92, 0], 0.014), 0x2b2f36, [0, 0, 0]), shaped(tube([0.68, 0.92, -0.21], [0.68, 0.92, 0.21], 0.014), 0x2b2f36, [0, 0, 0]),
    slab(0x15181d, [0, 0.885, 0], [0.24, 0.03, 0.09]), band(0x9aa3ad, [0.16, 0.3, 0], [0.06, 0.03, 0.06]),
    ...wheel(rear), ...wheel(front),
  ], true));
  group.add(new THREE.Mesh(spokeDiscs, spokeBlur));
  // Pedivelle e pedali: girano con le gambe (fase come in animation/motion.ts ride()).
  const crank = new THREE.Group();
  crank.position.set(...bb);
  crank.add(mesh([
    slab(0x2b2f36, [0.085, 0, 0.09], [0.19, 0.024, 0.014]), slab(0x15181d, [0.17, 0, 0.125], [0.085, 0.016, 0.06]),
    slab(0x2b2f36, [-0.085, 0, -0.09], [0.19, 0.024, 0.014]), slab(0x15181d, [-0.17, 0, -0.125], [0.085, 0.016, 0.06]),
    { geometry: chainring, color: 0x9aa3ad, at: [0, 0, -0.07], size: [1, 1, 1] },
  ]));
  group.add(crank);
  return { group, crank };
}
const tire = new THREE.TorusGeometry(0.33, 0.021, 6, 28), rim = new THREE.TorusGeometry(0.3, 0.012, 4, 28);
const hub = new THREE.CylinderGeometry(0.03, 0.03, 0.07, 8).rotateX(Math.PI / 2), chainring = new THREE.TorusGeometry(0.095, 0.012, 4, 16);
const spokeDiscs = mergeGeometries([new THREE.CircleGeometry(0.3, 20).translate(-0.36, 0.34, 0), new THREE.CircleGeometry(0.3, 20).translate(0.64, 0.34, 0)])!;
const spokeBlur = new THREE.MeshBasicMaterial({ color: 0xd5dbe2, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
