/**
 * Il percorso di golf: fairway, green, bunker, laghi, alberi, tribune dietro i green, club house, bandiere.
 * In più la scia luminosa della palla (come in TV) e un alone sulla palla quando è lontana.
 * Cielo, luce, acqua, effetti e animali vengono da render/outdoor.ts.
 * Le forme vengono da sim/sports/golfCourse.ts: sono le stesse che la simulazione usa per dove cade la palla.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { CLUBHOUSE, COURSE, LAKE_BANK, LAKE_POLY, PATHS, TREES } from '../sim/sports/golfCourse';
import type { Match } from '../sim/match';
import { radialTexture, stadiumSeats, type SeatRow } from './stage';
import { Ribbon, canvasTexture, createOutdoor, forest, groundLayer, layer, surfaceMaterial as mat, textCanvas, turf } from './outdoor';
import { t } from '../i18n';

export function golfCourse(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const world = createOutdoor(renderer, scene, camera);
  const rough = world.rough;
  const fairway = turf(renderer, '#5c9b42', '#69a94b', 2, 0.07, 5);
  const green = turf(renderer, '#70b752', '#7bc25c', 4, 0.05, 7);
  const sand = turf(renderer, '#e4d3a4', null, 0, 0.13, 9);
  const path = turf(renderer, '#bcb7a9', null, 0, 0.1, 11);
  const holes = COURSE;
  scene.add(
    layer(PATHS, mat(path), 4, 1),
    layer(holes.flatMap((h) => h.fairwayPoly ? [h.fairwayPoly] : []), mat(fairway), 18, 1),
    layer(holes.map((h) => h.teePoly), mat(green, 0xf2fff0), 8, 2),
    layer([LAKE_BANK, ...holes.flatMap((h) => h.bankPolys)], mat(rough, 0x93a070), 9, 2),
    layer(holes.map((h) => h.fringePoly), mat(fairway, 0xe8f5df), 6, 2),
    layer(holes.map((h) => h.greenPoly), mat(green), 8, 3),
    layer(holes.flatMap((h) => h.lipPolys), mat(rough, 0xa7b392), 9, 4),
    layer(holes.flatMap((h) => h.bunkerPolys), mat(sand, 0xffffff, 1), 4, 5),
    layer([LAKE_POLY, ...holes.flatMap((h) => h.waterPolys)], world.water(), 10, 5),
  );
  forest(scene, TREES);

  // ---------------------------------------------------------------- bandiere, buche, tee
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.5 });
  const cupMat = new THREE.MeshBasicMaterial({ color: 0x1b2416 });
  const flags: THREE.Object3D[] = [];
  for (const h of holes) {
    const [px, pz] = h.pin;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6).translate(0, 1.2, 0), white);
    pole.position.set(px, 0, pz); pole.castShadow = true;
    const cup = groundLayer(new THREE.Mesh(new THREE.CircleGeometry(0.16, 20).rotateX(-Math.PI / 2), cupMat), 9);
    cup.position.set(px, 0.003, pz);
    const tex = canvasTexture(textCanvas(128, 96, (g) => {
      g.fillStyle = '#ffd23f'; g.fillRect(0, 0, 128, 96);
      g.fillStyle = '#1b1b1b'; g.font = 'bold 64px Arial'; g.fillText(String(h.n), 64, 52);
    }), renderer, false);
    const flag = new THREE.Group();
    flag.add(new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.46).translate(0.33, 0, 0), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 })));
    flag.position.set(px, 2.15, pz);
    flags.push(flag);
    // Paletti del tee e cartello della buca.
    const d = h.line[4].clone().sub(h.line[0]).setY(0).normalize(), side = new THREE.Vector3(-d.z, 0, d.x);
    const tee = new THREE.Vector3(h.tee[0], 0, h.tee[1]);
    for (const k of [-3, 3]) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6), new THREE.MeshStandardMaterial({ color: h.n % 2 ? 0x2f6fde : 0xf2f2f2, roughness: 0.4 }));
      marker.position.copy(tee).addScaledVector(d, 3).addScaledVector(side, k).setY(0.1);
      scene.add(marker);
    }
    const signTex = canvasTexture(textCanvas(256, 160, (g) => {
      g.fillStyle = '#234b31'; g.fillRect(0, 0, 256, 160);
      g.strokeStyle = '#e9dfc4'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 148);
      g.fillStyle = '#f4ecd6'; g.font = 'bold 46px Arial'; g.fillText(`${t('BUCA')} ${h.n}`, 128, 58, 230);
      g.font = 'bold 30px Arial'; g.fillText(`PAR ${h.par} · ${Math.round(h.length)} m`, 128, 116, 230);
    }), renderer, false);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, side: THREE.DoubleSide }));
    sign.position.copy(tee).addScaledVector(side, 8).addScaledVector(d, -4).setY(1.3);
    sign.lookAt(sign.position.clone().sub(d));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), new THREE.MeshStandardMaterial({ color: 0x5b4330 }));
    post.position.copy(sign.position).setY(0.4);
    scene.add(pole, cup, flag, sign, post);
  }

  // ---------------------------------------------------------------- tribune dietro i green
  const rows: SeatRow[] = [];
  const standBoxes: THREE.BufferGeometry[] = [];
  const bannerTex = canvasTexture(textCanvas(512, 64, (g) => {
    g.fillStyle = '#1f4a30'; g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#ffd23f'; g.font = 'bold 38px Arial'; g.fillText('FRAME IT OPEN', 160, 34);
    g.fillStyle = '#f4ecd6'; g.font = 'bold 30px Arial'; g.fillText('LIVE SPORTS TV', 392, 34);
  }), renderer);
  for (const h of holes) {
    const f = new THREE.Vector3(h.stand.forward[0], 0, h.stand.forward[1]), along = new THREE.Vector3(-f.z, 0, f.x);
    const at = new THREE.Vector3(h.stand.at[0], 0, h.stand.at[1]);
    const basis = new THREE.Matrix4().makeBasis(along, new THREE.Vector3(0, 1, 0), f.clone().negate());
    for (let i = 0; i < 4; i++) {
      const top = 0.6 + i * 0.5, c = at.clone().addScaledVector(f, -(i * 0.9 + 0.45));
      standBoxes.push(new THREE.BoxGeometry(30, top, 0.9).applyMatrix4(basis).translate(c.x, top / 2, c.z));
      rows.push({ from: c.clone().addScaledVector(along, -14).setY(top), to: c.clone().addScaledVector(along, 14).setY(top), facing: -Math.atan2(f.z, f.x), team: -1 });
    }
    bannerTex.repeat.set(3, 1);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.6), new THREE.MeshBasicMaterial({ map: bannerTex }));
    banner.position.copy(at).addScaledVector(f, 0.02).setY(0.3);
    banner.lookAt(banner.position.clone().add(f));
    scene.add(banner);
  }
  const stands = new THREE.Mesh(mergeGeometries(standBoxes)!, new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.8 }));
  stands.castShadow = stands.receiveShadow = true;
  scene.add(stands, stadiumSeats(rows));

  // ---------------------------------------------------------------- club house, golf cart, tabellone
  const [cx, cz] = CLUBHOUSE.at, [sx, sz] = CLUBHOUSE.size;
  const wallTex = canvasTexture(textCanvas(256, 128, (g) => {
    g.fillStyle = '#ece0c6'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#3d5566';
    for (let x = 18; x < 256; x += 60) { g.fillRect(x, 26, 32, 34); g.fillRect(x, 80, 32, 34); }
  }), renderer);
  wallTex.repeat.set(2, 1);
  const house = new THREE.Mesh(new THREE.BoxGeometry(sx, 7, sz), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 }));
  house.position.set(cx, 3.5, cz);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).scale(sx * 0.78, 4, sz * 0.78), new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.8 }));
  roof.position.set(cx, 9, cz);
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, sz - 2), new THREE.MeshStandardMaterial({ color: 0xa47d55, roughness: 0.9 }));
  terrace.position.set(cx + sx / 2 + 3.5, 0.2, cz);
  for (const m of [house, roof, terrace]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
  for (const dz of [-5, 0, 5]) {
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 10), new THREE.MeshStandardMaterial({ color: dz ? 0xf2efe6 : 0x245a3a, roughness: 0.8 }));
    umbrella.position.set(cx + sx / 2 + 3.5, 2.6, cz + dz);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), white);
    stick.position.set(umbrella.position.x, 1.4, cz + dz);
    scene.add(umbrella, stick);
  }
  // Cinque golf cart parcheggiati: una geometria per colore (carrozzeria, tettuccio, ruote).
  const cartParts: THREE.BufferGeometry[][] = [[], [], []];
  for (let i = 0; i < 5; i++) {
    const at = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(cx + 2, 0, cz - sz / 2 - 6 - i * 2.2);
    cartParts[0].push(new THREE.BoxGeometry(2.3, 0.7, 1.2).translate(0, 0.6, 0).applyMatrix4(at));
    for (const x of [-0.7, 0.7]) cartParts[0].push(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4).translate(x, 1.3, 0.55).applyMatrix4(at));
    cartParts[1].push(new THREE.BoxGeometry(2, 0.08, 1.3).translate(0, 1.9, 0).applyMatrix4(at));
    for (const x of [-0.75, 0.75]) for (const z of [-0.6, 0.6]) cartParts[2].push(new THREE.CylinderGeometry(0.22, 0.22, 0.15, 10).rotateX(Math.PI / 2).translate(x, 0.22, z).applyMatrix4(at));
  }
  [white, new THREE.MeshStandardMaterial({ color: 0x245a3a }), new THREE.MeshStandardMaterial({ color: 0x1d1d1d })].forEach((m, k) => {
    const mesh = new THREE.Mesh(mergeGeometries(cartParts[k].map((g) => g.toNonIndexed()))!, m);
    mesh.castShadow = true;
    scene.add(mesh);
  });
  const [t0, t1] = CONFIG.teams;
  const boardTex = canvasTexture(textCanvas(1024, 512, (g) => {
    g.fillStyle = '#1d4430'; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#ffd23f'; g.font = 'bold 74px Arial'; g.fillText('FRAME IT OPEN', 512, 70);
    g.fillStyle = '#f4ecd6'; g.font = 'bold 40px Arial'; g.fillText('LEADERBOARD', 512, 140);
    g.textAlign = 'left'; g.font = 'bold 44px Arial';
    [`${t0.name} & ${t1.name}`, 'ROSSI & VERDI', 'KOWALSKI & DUPONT', 'MÜLLER & GARCÍA'].forEach((name, i) => {
      g.fillStyle = i ? '#f4ecd6' : '#ffd23f'; g.fillText(`${i + 1}  ${name}`, 70, 230 + i * 72);
      g.textAlign = 'right'; g.fillText(['—', '−3', '−1', 'PAR'][i], 960, 230 + i * 72); g.textAlign = 'left';
    });
  }), renderer, false);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7 }));
  board.position.set(-392, 5, 152);
  board.lookAt(board.position.clone().add(new THREE.Vector3(0.75, 0, -0.66)));
  const legs = new THREE.Mesh(new THREE.BoxGeometry(11, 2, 0.4), new THREE.MeshStandardMaterial({ color: 0x23352a }));
  legs.position.set(-392, 1, 152); legs.rotation.y = board.rotation.y;
  scene.add(board, legs);

  // ---------------------------------------------------------------- scia della palla (come in TV)
  const tracer = new Ribbon(scene, 240), trail: THREE.Vector3[] = [], last = new THREE.Vector3(1e9, 0, 0);
  let flewAt = -Infinity;
  // Alone sulla palla quando è lontana: sul telefono una pallina da golf a 100 m non si vedrebbe.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: 0xfffbe6, sizeAttenuation: false, depthTest: false, transparent: true, fog: false }));
  halo.renderOrder = 21;
  scene.add(halo);

  return {
    seatRows: rows,
    /** A ogni fotogramma (anche nei replay): luce, animali, effetti, scia, bandiere al vento. */
    update(match: Match) {
      const time = match.time;
      world.update(match);
      flags.forEach((f, i) => { f.rotation.y = Math.sin(time * 1.7 + i) * 0.35 + 0.4; });
      // Scia: i punti del volo, finché la palla non torna in mano al golfista o salta (stacco, replay).
      const b = match.ball;
      if (b.state === 'held' || b.pos.distanceTo(last) > 30) { trail.length = 0; flewAt = -Infinity; }
      last.copy(b.pos);
      if (b.state === 'flight') {
        if (!trail.length || trail[trail.length - 1].distanceTo(b.pos) > 0.5) { if (trail.length >= 240) trail.shift(); trail.push(b.pos.clone()); }
        flewAt = time;
      }
      const far = b.pos.distanceTo(camera.position);
      halo.visible = b.pos.y > 0 && far > 25;
      halo.position.copy(b.pos);
      halo.scale.setScalar(0.035);
      halo.material.opacity = THREE.MathUtils.clamp((far - 25) / 40, 0, 0.75);
      const fade = THREE.MathUtils.clamp(1 - (time - flewAt) / CONFIG.golf.tracerSec, 0, 1);
      // Rossa, più chiara verso la palla.
      if (fade > 0) tracer.draw(trail, camera, CONFIG.golf.tracerWidth, (u) => [0.8 + 0.2 * u, 0.02 + 0.3 * u * u, 0.01, fade * (0.45 + 0.5 * u)]);
      else tracer.mesh.visible = false;
    },
  };
}
