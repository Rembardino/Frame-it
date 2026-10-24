/**
 * Il campo di regata: mare che luccica, la costa con il paese, il faro e il molo con la tribuna, le boe,
 * la barca giuria e qualche barca di spettatori. I catamarani (scafi, ala rigida, fiocco, gennaker, foil)
 * seguono lo stato della simulazione (registrato anche nei replay) e lasciano una scia bianca.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Match } from '../sim/match';
import { MARKS, type SailingSimulation } from '../sim/sports/sailing';
import { blob, inside, seeded, type Tree } from '../sim/sports/shapes';
import { radialTexture, stadiumSeats, type SeatRow } from './stage';
import { Ribbon, canvasTexture, createOutdoor, forest, layer, surfaceMaterial as mat, textCanvas, turf } from './outdoor';

const LAND = [blob({ c: [900, 700], r: [420, 230], rot: 0.3 }, 0, 4), blob({ c: [-1250, -250], r: [520, 950], rot: 0.1 }, 0, 6), blob({ c: [300, -1150], r: [900, 300] }, 0, 8)];
const BEACH = [blob({ c: [900, 700], r: [420, 230], rot: 0.3 }, 14, 4), blob({ c: [-1250, -250], r: [520, 950], rot: 0.1 }, 18, 6), blob({ c: [300, -1150], r: [900, 300] }, 18, 8)];
const PIER = { from: new THREE.Vector3(600, 0, 520), to: new THREE.Vector3(640, 0, 455) };

function colored(g: THREE.BufferGeometry, color: number) {
  const flat = g.index ? g.toNonIndexed() : g, c = new THREE.Color(color), v = new Float32Array(flat.attributes.position.count * 3);
  for (let i = 0; i < v.length; i += 3) { v[i] = c.r; v[i + 1] = c.g; v[i + 2] = c.b; }
  flat.setAttribute('color', new THREE.BufferAttribute(v, 3));
  return flat;
}
const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });

/** Scafo lungo 15 m: prua a punta (verso +x), quasi pieno fino alla poppa tronca. */
function hullGeometry(z: number) {
  const g = new THREE.SphereGeometry(1, 16, 14).rotateZ(Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), r0 = Math.hypot(p.getY(i), p.getZ(i));
    if (r0 < 1e-4) continue;
    const r = (1 - x) ** 0.7 * Math.sqrt(Math.min(1, (1 + x) * 4)) / 1.48;
    p.setY(i, (p.getY(i) * r) / r0); p.setZ(i, (p.getZ(i) * r) / r0);
  }
  g.computeVertexNormals();
  return g.scale(7.5, 0.62, 0.48).translate(0, 0.5, z);
}

/** Ala rigida da y0 a y1 (m), che si stringe verso l'alto. */
function wingPart(y0: number, y1: number, color: number) {
  const g = new THREE.BoxGeometry(2.6, y1 - y0, 0.28, 1, 2, 1).translate(0.6, (y0 + y1) / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, 0.6 + (p.getX(i) - 0.6) * (1 - ((p.getY(i) - 1.2) / 20) * 0.6));
  return colored(g, color);
}

/** Catamarano volante, lungo 15 m: prua verso +x, scafi a z = ±2.6. Ala col colore della squadra; tip = colore della punta. */
function catamaran(color: number, tip: number) {
  const group = new THREE.Group();
  const jib = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.4, 1.4, 0), new THREE.Vector3(6.8, 1.2, 0), new THREE.Vector3(1.6, 15, 0)]);
  jib.computeVertexNormals();
  group.add(new THREE.Mesh(mergeGeometries([
    colored(hullGeometry(2.6), color), colored(hullGeometry(-2.6), color),
    colored(new THREE.BoxGeometry(1, 0.3, 5.6).translate(1.5, 0.95, 0), 0x22262e), colored(new THREE.BoxGeometry(1, 0.3, 5.6).translate(-3.5, 0.95, 0), 0x22262e),
    colored(new THREE.BoxGeometry(5, 0.06, 5).translate(-1, 0.95, 0), 0x3a3f48),
    wingPart(1.2, 9, color), wingPart(9, 17.5, 0xf2f4f6), wingPart(17.5, 21.2, tip),
    // Foil a T sotto gli scafi e timoni.
    colored(new THREE.BoxGeometry(0.4, 2.4, 0.1).translate(0.5, -0.9, 2.6), 0x15181d), colored(new THREE.BoxGeometry(0.4, 2.4, 0.1).translate(0.5, -0.9, -2.6), 0x15181d),
    colored(new THREE.BoxGeometry(0.5, 0.06, 1.6).translate(0.5, -2.1, 2.6), 0x15181d), colored(new THREE.BoxGeometry(0.5, 0.06, 1.6).translate(0.5, -2.1, -2.6), 0x15181d),
    colored(new THREE.BoxGeometry(0.3, 2, 0.08).translate(-7, -0.6, 2.6), 0x15181d), colored(new THREE.BoxGeometry(0.3, 2, 0.08).translate(-7, -0.6, -2.6), 0x15181d),
  ])!, painted));
  group.add(new THREE.Mesh(jib, new THREE.MeshStandardMaterial({ color: 0xf6f6f2, side: THREE.DoubleSide, roughness: 0.6 })));
  // Gennaker colorato per la poppa: si apre (scala) quando serve.
  const gen = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.6, 1.6, 0), new THREE.Vector3(9.5, 1.4, 0), new THREE.Vector3(2, 17, 0),
    new THREE.Vector3(9.5, 1.4, 0), new THREE.Vector3(6.5, 9, 1.8), new THREE.Vector3(2, 17, 0)]);
  gen.computeVertexNormals();
  const gennaker = new THREE.Mesh(gen, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 }));
  group.add(gennaker);
  group.rotation.order = 'YXZ';
  group.traverse((o) => { o.castShadow = true; });
  return { group, gennaker };
}

export function sailingWorld(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const world = createOutdoor(renderer, scene, camera, '#4a6b3c');
  // ---------------------------------------------------------------- mare e costa
  const ripples = canvasTexture(textCanvas(256, 256, (g) => {
    // Mappa delle normali con piccole onde: il sole ci luccica sopra.
    const img = g.createImageData(256, 256), r = seeded(9);
    // Onde con un numero intero di creste per tassello: la trama si ripete senza giunture.
    const waves = Array.from({ length: 10 }, () => ({ ix: Math.round((r() - 0.5) * 12), iy: Math.round((r() - 0.5) * 12), p: r() * 6.3 }));
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      let nx = 0, ny = 0;
      for (const w of waves) { const c = Math.sin((Math.PI * 2 * (w.ix * x + w.iy * y)) / 256 + w.p); nx += c * w.ix * 0.12; ny += c * w.iy * 0.12; }
      const o = (y * 256 + x) * 4;
      img.data[o] = 128 + nx * 60; img.data[o + 1] = 128 + ny * 60; img.data[o + 2] = 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }), renderer);
  ripples.colorSpace = THREE.NoColorSpace;
  ripples.repeat.set(1400, 1400);
  const seaMat = world.water(0x1f6283);
  Object.assign(seaMat, { normalMap: ripples, normalScale: new THREE.Vector2(0.1, 0.1), roughness: 0.16, envMapIntensity: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  // Due trame di onde a scale e direzioni diverse (il disegno non si ripete), sempre più lisce con la distanza
  // (da lontano il mare riflette il cielo e non mostra la trama a scacchi).
  seaMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
      mapN.xy += ( texture2D( normalMap, mat2( 0.8, -0.6, 0.6, 0.8 ) * vNormalMapUv * 0.29 ).xy * 2.0 - 1.0 ) * 0.7;
      mapN.xy /= 1.0 + length( vViewPosition ) * 0.008;`));
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), seaMat);
  sea.receiveShadow = true;
  scene.add(sea);
  scene.add(layer(BEACH, mat(turf(renderer, '#e3d3a6', null, 0, 0.12, 31)), 6, 3), layer(LAND, mat(world.rough), 9, 4));
  const rnd = seeded(12), trees: Tree[] = [];
  for (let i = 0; i < 2600; i++) {
    const x = -1800 + rnd() * 3600, z = -1500 + rnd() * 2800;
    if (LAND.some((p) => inside(p, x, z)) && !BEACH.some((p, k) => !inside(LAND[k], x, z) && inside(p, x, z)) && rnd() < 0.5) trees.push({ x, z, h: 8 + rnd() * 8, pine: rnd() < 0.6, tint: rnd() });
  }
  forest(scene, trees.filter((tr) => Math.hypot(tr.x - 760, tr.z - 560) > 160));
  // Paese sul promontorio, faro, molo con la tribuna davanti all'arrivo.
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const x = 680 + rnd() * 260, z = 560 + rnd() * 180, h = 4 + rnd() * 7, w = 6 + rnd() * 4;
    if (!inside(LAND[0], x, z)) continue;
    parts.push(colored(new THREE.BoxGeometry(w, h, w * 0.8).rotateY(rnd() * 3).translate(x, h / 2, z), [0xf2e6cf, 0xe8c9a6, 0xf4f1ea, 0xdfb48f, 0xcfe0e8][i % 5]));
    parts.push(colored(new THREE.ConeGeometry(w * 0.75, 2.4, 4).rotateY(Math.PI / 4).translate(x, h + 1.2, z), 0xa8553a));
  }
  parts.push(colored(new THREE.CylinderGeometry(2.2, 3, 26, 12).translate(560, 13, 640), 0xf4f4f2), colored(new THREE.CylinderGeometry(2.25, 2.25, 4, 12).translate(560, 10, 640), 0xd8393f),
    colored(new THREE.CylinderGeometry(1.6, 1.6, 3, 8).translate(560, 27.5, 640), 0xffe9a8));
  const pd = PIER.to.clone().sub(PIER.from), pa = Math.atan2(pd.z, pd.x), pl = pd.length(), pc = PIER.from.clone().add(PIER.to).multiplyScalar(0.5);
  parts.push(colored(new THREE.BoxGeometry(pl + 30, 1.2, 14).rotateY(-pa).translate(pc.x, 0.4, pc.z), 0xb9a98a));
  const rows: SeatRow[] = [], f = new THREE.Vector3(-0.72, 0, -0.69).normalize(), along = new THREE.Vector3(-f.z, 0, f.x);
  for (let i = 0; i < 4; i++) {
    const top = 1.6 + i * 0.5, c = PIER.to.clone().addScaledVector(f, -(i * 0.9 + 1));
    parts.push(colored(new THREE.BoxGeometry(24, top, 0.9).applyMatrix4(new THREE.Matrix4().makeBasis(along, new THREE.Vector3(0, 1, 0), f.clone().negate())).translate(c.x, top / 2, c.z), 0xdfe3e6));
    rows.push({ from: c.clone().addScaledVector(along, -11).setY(top), to: c.clone().addScaledVector(along, 11).setY(top), facing: -Math.atan2(f.z, f.x), team: -1 });
  }
  // Barche degli spettatori all'ancora ai lati del campo.
  for (const [x, z, a] of [[-320, 120, 0.3], [-300, -60, 2], [330, 40, 1.2], [300, -180, 2.6], [-250, 380, 0.9], [260, 520, 2.2], [420, 160, 1.6]]) {
    parts.push(colored(new THREE.SphereGeometry(1, 10, 6).scale(5, 0.9, 1.8).rotateY(a).translate(x, 0.3, z), 0xf4f4f2));
    parts.push(colored(new THREE.BoxGeometry(3, 1.6, 2.2).rotateY(a).translate(x, 1.4, z), 0x3d6f8f));
  }
  // Barca giuria sulla linea di partenza.
  const cm = MARKS.committee;
  parts.push(colored(new THREE.SphereGeometry(1, 12, 6).scale(9, 1.4, 3).translate(cm.x + 6, 0.4, cm.z), 0xf4f4f2), colored(new THREE.BoxGeometry(6, 2.6, 4).translate(cm.x + 6, 2.6, cm.z), 0xe6e9ec),
    colored(new THREE.CylinderGeometry(0.08, 0.08, 7, 6).translate(cm.x + 3, 5, cm.z), 0x2b2f36));
  const town = new THREE.Mesh(mergeGeometries(parts)!, painted);
  town.castShadow = town.receiveShadow = true;
  scene.add(town, stadiumSeats(rows));
  // Boe gonfiabili (ondeggiano).
  const buoys: THREE.Object3D[] = [];
  const buoy = (at: THREE.Vector3, color: number) => {
    const b = new THREE.Mesh(colored(new THREE.CylinderGeometry(1.1, 1.4, 3.4, 12).translate(0, 1.4, 0), color), painted);
    b.add(new THREE.Mesh(colored(new THREE.ConeGeometry(1.1, 1.2, 12).translate(0, 3.7, 0), color), painted));
    b.position.copy(at); b.castShadow = true;
    scene.add(b); buoys.push(b);
  };
  buoy(MARKS.pin, 0xff8a1f); buoy(MARKS.windward, 0xffd23f);
  MARKS.gate.forEach((g) => buoy(g, 0xff8a1f));
  MARKS.finish.forEach((g) => buoy(g, 0xd8393f));
  // Linea d'arrivo: una fila di galleggianti tra le due boe.
  const floats: THREE.BufferGeometry[] = [];
  for (let z = MARKS.finish[0].z + 5; z < MARKS.finish[1].z; z += 5) floats.push(colored(new THREE.SphereGeometry(0.35, 8, 5).translate(MARKS.finish[0].x, 0.15, z), 0xffffff));
  scene.add(new THREE.Mesh(mergeGeometries(floats)!, painted));

  // ---------------------------------------------------------------- barche, scie, spruzzi
  // Schiuma di traverso alla scia: bordi sfumati, due righe più bianche, il centro più chiaro.
  const foam = canvasTexture(textCanvas(64, 4, (g) => {
    for (let x = 0; x < 64; x++) {
      const e = Math.min(x + 0.5, 63.5 - x) / 32;
      g.fillStyle = `rgba(255,255,255,${Math.min(1, e * 4) * (0.4 + 0.6 * Math.exp(-((e - 0.3) ** 2) / 0.02))})`;
      g.fillRect(x, 0, 1, 4);
    }
  }), renderer, false);
  // Spruzzi dai timoni quando si vola: ogni goccia rinasce ogni SPRAY_LIFE s, la posizione dipende solo dal tempo (replay compresi).
  const SPRAY = 26, SPRAY_LIFE = 0.9, sprayPos = new Float32Array(4 * 2 * SPRAY * 3), sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3).setUsage(THREE.DynamicDrawUsage));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ map: radialTexture(), color: 0xf2f8ff, size: 1.1, transparent: true, opacity: 0.8, depthWrite: false }));
  spray.frustumCulled = false;
  scene.add(spray);
  const hash = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const fw = new THREE.Vector3(), sw = new THREE.Vector3();
  let boats: { group: THREE.Group; gennaker: THREE.Mesh; wakes: Ribbon[]; trails: THREE.Vector3[][] }[] | null = null;
  return {
    seatRows: rows,
    update(match: Match) {
      world.update(match);
      const time = match.time, s = match.sportSimulation as SailingSimulation;
      ripples.offset.set(time * 0.004, time * 0.0025);
      buoys.forEach((b, i) => { b.position.y = Math.sin(time * 1.3 + i) * 0.12; b.rotation.z = Math.sin(time * 0.9 + i) * 0.05; });
      // Seconda barca di ogni squadra: punta dell'ala scura, per distinguerle.
      boats ??= s.boats.map((b, i) => ({ ...catamaran(CONFIG.teams[b.team].shirt, i < 2 ? 0xf2f4f6 : 0x22262e),
        wakes: [new Ribbon(scene, 110, true, foam), new Ribbon(scene, 110, true, foam)], trails: [[], []] as THREE.Vector3[][] }));
      let k = 0;
      boats.forEach((v, i) => {
        const b = s.boats[i];
        if (!v.group.parent) scene.add(v.group);
        // Sui foil la barca è ferma come su un binario; in acqua beccheggia e rolla sulle onde.
        const fly = THREE.MathUtils.clamp(b.lift / 1.2, 0, 1), calm = 1 - fly;
        v.group.position.set(b.pos.x, b.lift + Math.sin(time * 1.3 + i * 2) * 0.08 * calm, b.pos.z);
        v.group.rotation.set(b.heel + Math.sin(time * 0.9 + i) * 0.02 * calm, -b.heading,
          (b.lift > 0.5 ? 0.03 : 0) + Math.sin(time * 1.1 + i * 1.7) * 0.025 * calm + Math.sin(time * 9 + i) * 0.003 * fly);
        v.gennaker.visible = b.gennaker > 0.05;
        v.gennaker.scale.setScalar(Math.max(0.05, b.gennaker));
        fw.set(Math.cos(b.heading), 0, Math.sin(b.heading)); sw.set(-fw.z, 0, fw.x);
        const foiling = b.lift > 0.5, strength = THREE.MathUtils.clamp((b.v - 8) / 8, 0, 1);
        [1, -1].forEach((side, h) => {
          // Scia di ogni scafo (sui foil: la riga sottile di timone e deriva). Si resetta se la barca "salta" (stacco, replay).
          const stern = b.pos.clone().addScaledVector(fw, -7).addScaledVector(sw, side * 2.6).setY(0.04), trail = v.trails[h];
          const last = trail[trail.length - 1];
          if (last && last.distanceTo(stern) > 25) trail.length = 0;
          if (!last || last.distanceTo(stern) > 1.5) { trail.push(stern); if (trail.length > 110) trail.shift(); }
          const alpha = foiling ? 0.5 : 0.75;
          v.wakes[h].draw(trail, camera, foiling ? 1.3 : 2 + b.v * 0.05, (u) => [0.95, 0.97, 1, u * u * alpha]);
          // Ventaglio di spruzzi dietro al timone.
          for (let j = 0; j < SPRAY; j++, k++) {
            const seed = (i * 2 + h) * SPRAY + j, age = ((time / SPRAY_LIFE + hash(seed)) % 1) * SPRAY_LIFE;
            const on = j < SPRAY * strength * (foiling ? 1 : 0.35) && time >= b.capsizeUntil;
            const up = 2.5 + hash(seed + 0.5) * 3, out = 0.4 + hash(seed + 0.7) * 1.4, y = 0.2 + up * age - 4.9 * age * age;
            sprayPos.set(on && y > 0 ? [stern.x - fw.x * (b.v * age + 0.6 * age) + sw.x * side * out * age, y, stern.z - fw.z * (b.v * age + 0.6 * age) + sw.z * side * out * age] : [0, -50, 0], k * 3);
          }
        });
      });
      sprayGeo.attributes.position.needsUpdate = true;
    },
  };
}
