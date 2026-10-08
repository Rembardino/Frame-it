/**
 * Pubblico con instancing: corpo e testa condividono le stesse matrici (un solo aggiornamento per tifoso).
 * Le braccia alzate (col telefono acceso in mano: di sera si vede benissimo) hanno matrici proprie
 * e compaiono solo quando il pubblico guarda il cielo.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { SeatRow } from './stage';

interface Fan {
  x: number;
  y: number;
  z: number;
  rot: THREE.Quaternion;
  phase: number;
  /** Quanto si scatena quando il pubblico si eccita. */
  energy: number;
  /** Indica il cielo quando c'è qualcosa lassù. */
  pointer: boolean;
}

export interface CrowdState {
  /** 0..1: 0 = ondeggiano, 1 = saltano tutti. */
  excitement: number;
  /** Zona calda (x sul campo) dove il pubblico si alza prima degli altri: segnale premonitore. */
  hot: { x: number; level: number };
  /** 0..1: tutti fermi a guardare il cielo, molti col braccio alzato (stella cadente in arrivo). */
  lookUp: number;
}

const NEUTRAL = [0x3a3f4b, 0xd8d8d8, 0x6b4f3a, 0x2e5d4b, 0x8c8c8c, 0x1f2633, 0xb5651d];
const SKIN = [0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69];

export class Crowd {
  private fans: Fan[] = [];
  private body: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private phones: THREE.InstancedMesh;
  private time = 0;
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private lean = new THREE.Quaternion();
  private one = new THREE.Vector3(1, 1, 1);
  private zero = new THREE.Vector3(0, 0, 0);
  private zAxis = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, rows: SeatRow[]) {
    const up = new THREE.Vector3(0, 1, 0);
    const shirts: number[] = [];
    for (const row of rows) {
      const len = row.from.distanceTo(row.to);
      const n = Math.floor(len / CONFIG.crowd.spacing);
      const rot = new THREE.Quaternion().setFromAxisAngle(up, row.facing);
      for (let i = 0; i <= n; i++) {
        if (Math.random() > CONFIG.crowd.fill) continue;
        const pos = new THREE.Vector3().lerpVectors(row.from, row.to, i / n);
        this.fans.push({
          x: pos.x + (Math.random() - 0.5) * 0.2, y: pos.y, z: pos.z, rot,
          phase: Math.random() * 10, energy: 0.5 + Math.random() * 0.5, pointer: Math.random() < 0.75,
        });
        // Le curve tifano soprattutto una squadra, la tribuna è mista.
        const team = row.team >= 0 && Math.random() < 0.75 ? row.team : Math.random() < 0.5 ? (Math.random() < 0.5 ? 0 : 1) : -1;
        shirts.push(team >= 0 ? CONFIG.teams[team].shirt : NEUTRAL[Math.floor(Math.random() * NEUTRAL.length)]);
      }
    }

    const count = this.fans.length;
    const mat = new THREE.MeshLambertMaterial();
    this.body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.135, 0.51, 7).scale(0.7, 1, 1).translate(0, 0.3, 0), mat, count);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 7, 5).scale(0.82, 1.16, 0.86).translate(0, 0.68, 0), mat, count);
    head.instanceMatrix = this.body.instanceMatrix; // stesse matrici, un solo upload
    const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.84, 0.88, 0.86).translate(-0.008, 0.71, 0), mat, count);
    hair.instanceMatrix = this.body.instanceMatrix;
    // Braccio alzato, dalla spalla verso l'alto e un po' in avanti.
    this.arms = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.048, 0.59, 6).translate(0.08, 0.97, 0.18), mat, count);
    // Telefono acceso in cima al braccio: stesse matrici del braccio.
    this.phones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.2, 0.05).translate(0.08, 1.33, 0.2), new THREE.MeshBasicMaterial({ color: 0xeaf4ff }), count);
    this.phones.instanceMatrix = this.arms.instanceMatrix;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.body.setColorAt(i, c.set(shirts[i]));
      head.setColorAt(i, c.set(SKIN[i % SKIN.length]));
      hair.setColorAt(i, c.set(i % 3 ? 0x30241e : 0x8c613c));
      this.arms.setColorAt(i, c.set(SKIN[i % SKIN.length]));
    }
    // I tifosi saltano: evito che il culling li faccia sparire ai bordi.
    this.body.frustumCulled = head.frustumCulled = hair.frustumCulled = this.arms.frustumCulled = this.phones.frustumCulled = false;
    this.arms.visible = this.phones.visible = false;
    this.update(0, { excitement: 0, hot: { x: 0, level: 0 }, lookUp: 0 });
    scene.add(this.body, head, hair, this.arms, this.phones);
  }

  update(dt: number, s: CrowdState) {
    this.time += dt;
    const t = this.time;
    const look = s.lookUp;
    // Guardare in alto = sporgersi indietro (il corpo guarda verso +x locale).
    this.lean.setFromAxisAngle(this.zAxis, 0.42 * look);
    this.arms.visible = this.phones.visible = look > 0.05;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      const idle = Math.sin(t * 1.5 + f.phase) * 0.03;
      const local = s.hot.level * Math.max(0, 1 - Math.abs(f.x - s.hot.x) / 14);
      const jump = Math.min(1, s.excitement + local) * f.energy * Math.max(0, Math.sin(t * 9 + f.phase)) * 0.45 * (1 - look);
      this.p.set(f.x, f.y + idle * (1 - look) + jump, f.z);
      this.q.multiplyQuaternions(f.rot, this.lean);
      this.m.compose(this.p, this.q, this.one);
      this.body.setMatrixAt(i, this.m);
      if (this.arms.visible) this.arms.setMatrixAt(i, f.pointer ? this.m : this.m.compose(this.p, this.q, this.zero));
    }
    this.body.instanceMatrix.needsUpdate = true;
    if (this.arms.visible) this.arms.instanceMatrix.needsUpdate = true;
  }
}
