/**
 * Pubblico con instancing: corpo, testa, capelli e sciarpa condividono le stesse matrici (un solo aggiornamento per tifoso).
 * Le braccia alzate (col telefono acceso in mano quando si guarda il cielo) hanno matrici proprie e compaiono
 * quando si esulta, durante l'ola o quando il pubblico guarda in alto.
 * I tifosi stanno seduti quando la partita è tranquilla e si alzano man mano che sale l'eccitazione; nelle curve
 * sventolano bandiere e dai distinti partono i flash delle macchine fotografiche, più fitti nei momenti caldi.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { SeatRow } from './stage';
import { radialTexture } from './stage';

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
  /** Corporatura: larghezza e altezza (1 = media). */
  wide: number;
  tall: number;
  /** Sopra questo livello di eccitazione si alza in piedi (alcuni stanno sempre in piedi, altri quasi mai). */
  standAt: number;
  /** 0 = seduto, 1 = in piedi (lisciato nel tempo). */
  stand: number;
  /** Indice della bandiera che tiene, o -1. */
  flag: number;
}

export interface CrowdState {
  /** 0..1: 0 = ondeggiano, 1 = saltano tutti. */
  excitement: number;
  /** Zona calda (x sul campo) dove il pubblico si alza prima degli altri: segnale premonitore. */
  hot: { x: number; level: number };
  /** 0..1: tutti fermi a guardare il cielo, molti col braccio alzato (stella cadente in arrivo). */
  lookUp: number;
}

const NEUTRAL = [0x3a3f4b, 0xd8d8d8, 0x6b4f3a, 0x2e5d4b, 0x8c8c8c, 0x1f2633, 0xb5651d, 0x5b6b8c, 0xe8e2d0, 0x7a2e3a, 0x2f4f6f];
const SKIN = [0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69, 0xffdbac, 0x5c3a21];
const HAIR = [0x30241e, 0x8c613c, 0x111111, 0xd9b26a, 0x4a2a1a, 0x9a9a9a];
const FLASHES = 48;
/** Scala del tifoso: il modello è alto ~0,85 m, moltiplicato arriva a una persona vera; da seduto si abbassa. */
const SCALE = 1.5;

export class Crowd {
  private fans: Fan[] = [];
  private body: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private armsL: THREE.InstancedMesh;
  private phones: THREE.InstancedMesh;
  private flagPoles: THREE.InstancedMesh;
  private flagCloth: THREE.InstancedMesh;
  private flagFans: number[] = [];
  private flashes: THREE.Points;
  private flashLife = new Float32Array(FLASHES);
  private time = 0;
  /** Ola: posizione lungo la tribuna lunga (x) e se è in corso. */
  private wave = { x: 0, active: false, next: 18 };
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private lean = new THREE.Quaternion();
  private tilt = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private zero = new THREE.Vector3(0, 0, 0);
  private zAxis = new THREE.Vector3(0, 0, 1);
  private xAxis = new THREE.Vector3(1, 0, 0);

  constructor(scene: THREE.Scene, rows: SeatRow[]) {
    const up = new THREE.Vector3(0, 1, 0);
    const shirts: number[] = [];
    const scarves: number[] = [];
    const flagColors: number[] = [];
    for (const row of rows) {
      const len = row.from.distanceTo(row.to);
      const n = Math.max(1, Math.floor(len / CONFIG.crowd.spacing));
      const rot = new THREE.Quaternion().setFromAxisAngle(up, row.facing);
      // I vuoti si raggruppano: qualche posto libero vicino a un altro, non un rumore uniforme.
      let empty = 0;
      for (let i = 0; i <= n; i++) {
        if (empty > 0) { empty--; continue; }
        if (Math.random() > CONFIG.crowd.fill) { empty = Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 3) : 0; continue; }
        const pos = new THREE.Vector3().lerpVectors(row.from, row.to, i / n);
        // Le curve tifano soprattutto una squadra, la tribuna è mista.
        const team = row.team >= 0 && Math.random() < 0.75 ? row.team : Math.random() < 0.5 ? (Math.random() < 0.5 ? 0 : 1) : -1;
        const curve = row.team >= 0;
        const flag = (curve && Math.random() < 0.12) || (!curve && team >= 0 && Math.random() < 0.02);
        this.fans.push({
          x: pos.x + (Math.random() - 0.5) * 0.2, y: pos.y, z: pos.z, rot,
          phase: Math.random() * 10, energy: 0.5 + Math.random() * 0.5, pointer: Math.random() < 0.75,
          wide: 0.86 + Math.random() * 0.3, tall: 0.9 + Math.random() * 0.2,
          // Nelle curve si sta in piedi quasi sempre; in tribuna ci si alza solo per le occasioni.
          standAt: curve ? Math.random() * 0.35 : 0.2 + Math.random() * 0.75,
          stand: 0, flag: flag ? this.flagFans.length : -1,
        });
        if (flag) { this.flagFans.push(this.fans.length - 1); flagColors.push(team >= 0 ? CONFIG.teams[team].shirt : 0xffffff); }
        shirts.push(team >= 0 && Math.random() < 0.7 ? CONFIG.teams[team].shirt : NEUTRAL[Math.floor(Math.random() * NEUTRAL.length)]);
        // Sciarpa della squadra per alcuni; gli altri mostrano il collo.
        scarves.push(team >= 0 && Math.random() < 0.35 ? CONFIG.teams[team].socks : -1);
      }
    }
    for (const f of this.fans) f.stand = f.standAt < 0.1 ? 1 : 0;

    const count = this.fans.length;
    const mat = new THREE.MeshLambertMaterial();
    // Corpo con spalle: tronco leggermente più largo in alto, un accenno di braccia lungo i fianchi.
    this.body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.19, 0.13, 0.52, 8).scale(0.68, 1, 1).translate(0, 0.3, 0), mat, count);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 8, 6).scale(0.82, 1.16, 0.86).translate(0, 0.7, 0), mat, count);
    head.instanceMatrix = this.body.instanceMatrix; // stesse matrici, un solo upload
    const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.84, 0.88, 0.86).translate(-0.008, 0.73, 0), mat, count);
    hair.instanceMatrix = this.body.instanceMatrix;
    const scarf = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.11, 0.07, 8).scale(0.8, 1, 1).translate(0, 0.575, 0), mat, count);
    scarf.instanceMatrix = this.body.instanceMatrix;
    // Braccia lungo i fianchi: manica del colore della maglia e avambraccio di pelle, così il busto non è un birillo.
    const sleeves = new THREE.InstancedMesh(mergeGeometries([
      new THREE.CylinderGeometry(0.04, 0.036, 0.16, 6).translate(0.01, 0.44, 0.19), new THREE.CylinderGeometry(0.04, 0.036, 0.16, 6).translate(0.01, 0.44, -0.19)])!, mat, count);
    sleeves.instanceMatrix = this.body.instanceMatrix;
    const forearms = new THREE.InstancedMesh(mergeGeometries([
      new THREE.CylinderGeometry(0.034, 0.03, 0.2, 6).translate(0.05, 0.28, 0.2), new THREE.CylinderGeometry(0.034, 0.03, 0.2, 6).translate(0.05, 0.28, -0.2)])!, mat, count);
    forearms.instanceMatrix = this.body.instanceMatrix;
    // Braccia alzate, dalle spalle verso l'alto e un po' in avanti.
    this.arms = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.038, 0.05, 0.5, 6).translate(0.08, 0.9, 0.17), mat, count);
    const armsL = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.038, 0.05, 0.5, 6).translate(0.08, 0.9, -0.17), mat, count);
    armsL.instanceMatrix = this.arms.instanceMatrix;
    // Telefono acceso in cima al braccio: stesse matrici del braccio.
    this.phones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.2, 0.05).translate(0.08, 1.2, 0.19), new THREE.MeshBasicMaterial({ color: 0xeaf4ff }), count);
    this.phones.instanceMatrix = this.arms.instanceMatrix;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const skin = SKIN[(i * 7) % SKIN.length];
      this.body.setColorAt(i, c.set(shirts[i]));
      head.setColorAt(i, c.set(skin));
      hair.setColorAt(i, c.set(HAIR[(i * 5) % HAIR.length]));
      scarf.setColorAt(i, c.set(scarves[i] >= 0 ? scarves[i] : skin));
      sleeves.setColorAt(i, c.set(shirts[i]));
      forearms.setColorAt(i, c.set(skin));
      this.arms.setColorAt(i, c.set(skin));
      armsL.setColorAt(i, c.set(skin));
    }
    // Bandiere: asta e telo, colore della squadra; sventolano con una rotazione attorno alla mano.
    const flags = this.flagFans.length;
    this.flagPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 5).translate(0, 0.85, 0), new THREE.MeshLambertMaterial({ color: 0xe8e4d8 }), Math.max(1, flags));
    this.flagCloth = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.8, 0.5, 4, 1).translate(0.42, 1.42, 0), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), Math.max(1, flags));
    this.flagCloth.instanceMatrix = this.flagPoles.instanceMatrix;
    for (let i = 0; i < flags; i++) this.flagCloth.setColorAt(i, c.set(flagColors[i]));
    this.flagPoles.visible = this.flagCloth.visible = flags > 0;
    // Flash: punti luminosi che compaiono per pochi fotogrammi fra le teste.
    const flashGeo = new THREE.BufferGeometry();
    flashGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FLASHES * 3).fill(-1000), 3));
    this.flashes = new THREE.Points(flashGeo, new THREE.PointsMaterial({ map: radialTexture('255,250,235'), color: 0xffffff, size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    // I tifosi saltano: evito che il culling li faccia sparire ai bordi.
    for (const mesh of [this.body, head, hair, scarf, sleeves, forearms, this.arms, armsL, this.phones, this.flagPoles, this.flagCloth]) mesh.frustumCulled = false;
    this.flashes.frustumCulled = false;
    this.arms.visible = armsL.visible = this.phones.visible = false;
    this.armsL = armsL;
    this.update(0, { excitement: 0, hot: { x: 0, level: 0 }, lookUp: 0 });
    scene.add(this.body, head, hair, scarf, sleeves, forearms, this.arms, armsL, this.phones, this.flagPoles, this.flagCloth, this.flashes);
  }

  /** gaps = posti occupati dagli spettatori "veri" dei momenti segreti: lì il tifoso finto sparisce. */
  update(dt: number, s: CrowdState, gaps: THREE.Vector3[] = []) {
    this.time += dt;
    const t = this.time;
    const look = s.lookUp;
    this.updateWave(dt, s.excitement);
    // Guardare in alto = sporgersi indietro (il corpo guarda verso +x locale).
    this.lean.setFromAxisAngle(this.zAxis, 0.42 * look);
    const cheering = s.excitement > 0.2 || s.hot.level > 0.2 || this.wave.active;
    const showArms = look > 0.05 || cheering;
    this.arms.visible = this.armsL.visible = showArms;
    this.phones.visible = look > 0.05;
    const flagPos = this.flagPoles.visible;
    const k = dt > 0 ? 1 - Math.exp(-dt * 3.5) : 1;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      const local = s.hot.level * Math.max(0, 1 - Math.abs(f.x - s.hot.x) / 14);
      const excite = Math.min(1, s.excitement + local);
      // Ola: una gobba che corre lungo la tribuna lunga.
      const wave = this.wave.active && f.z < -CONFIG.pitch.width / 2 ? Math.max(0, 1 - Math.abs(f.x - this.wave.x) / 4.5) : 0;
      const standTarget = excite > f.standAt || wave > 0.3 || look > 0.3 ? 1 : 0;
      f.stand += (standTarget - f.stand) * k;
      const stand = f.stand;
      const idle = Math.sin(t * 1.5 + f.phase) * 0.025;
      const jump = excite * f.energy * Math.max(0, Math.sin(t * 9 + f.phase)) * 0.4 * stand * (1 - look);
      const rise = wave * 0.35 * (1 - look);
      // Seduto: più basso e un po' più corto; in piedi: altezza piena.
      const seatDrop = (1 - stand) * 0.28;
      this.p.set(f.x, f.y + idle * (1 - look) + jump + rise - seatDrop, f.z);
      // Applausi/esultanza: oscillazione laterale del busto quando si esulta.
      this.tilt.setFromAxisAngle(this.xAxis, Math.sin(t * 7 + f.phase) * 0.08 * excite * stand);
      this.q.multiplyQuaternions(f.rot, this.lean).multiply(this.tilt);
      const gap = gaps.length > 0 && gaps.some((g) => Math.abs(g.y - f.y) < 0.3 && Math.hypot(g.x - f.x, g.z - f.z) < 0.6);
      if (gap) this.m.compose(this.p, this.q, this.zero);
      else { this.s.set(f.wide * SCALE, f.tall * SCALE * (0.8 + 0.2 * stand), f.wide * SCALE); this.m.compose(this.p, this.q, this.s); }
      this.body.setMatrixAt(i, this.m);
      if (showArms) {
        // Braccia su: chi indica il cielo, una parte di chi esulta (a turno, con la propria energia), la cresta dell'ola.
        const raised = !gap && (look > 0.05 ? f.pointer : (excite * f.energy > 0.55 && f.phase % 3 < 1.2 && Math.sin(t * 2.3 + f.phase) > 0.1) || wave > 0.6);
        this.arms.setMatrixAt(i, raised ? this.m : this.m.compose(this.p, this.q, this.zero));
      }
      if (flagPos && f.flag >= 0) {
        // La bandiera parte dalla mano e ondeggia; da seduti la si tiene più bassa.
        const swing = Math.sin(t * 2.6 + f.phase) * (0.15 + excite * 0.25);
        this.tilt.setFromAxisAngle(this.zAxis, 0.12 + swing);
        this.q.multiplyQuaternions(f.rot, this.tilt);
        this.p.y += 0.7 - seatDrop * 0.5;
        this.s.set(1, 0.8 + 0.2 * stand, 1);
        this.m.compose(this.p, this.q, gap ? this.zero : this.s);
        this.flagPoles.setMatrixAt(f.flag, this.m);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    if (showArms) this.arms.instanceMatrix.needsUpdate = true;
    if (flagPos) this.flagPoles.instanceMatrix.needsUpdate = true;
    this.updateFlashes(dt, s.excitement + s.hot.level * 0.5);
  }

  /** Ola: parte nei momenti tranquilli ogni tanto, attraversa la tribuna lunga e si spegne. */
  private updateWave(dt: number, excitement: number) {
    const half = CONFIG.pitch.length / 2 + 10;
    if (this.wave.active) {
      this.wave.x += dt * 11;
      if (this.wave.x > half) this.wave.active = false;
      return;
    }
    this.wave.next -= dt;
    if (this.wave.next <= 0 && excitement < 0.25) {
      this.wave.active = true; this.wave.x = -half;
      this.wave.next = 35 + Math.random() * 40;
    }
  }

  /** Flash: pochi di base, molti nei momenti caldi; ognuno dura un paio di fotogrammi. */
  private updateFlashes(dt: number, heat: number) {
    const pos = this.flashes.geometry.attributes.position as THREE.BufferAttribute;
    const rate = 1.5 + Math.min(1, heat) * 40;
    let spawn = Math.random() < rate * dt ? 1 + (heat > 0.6 && Math.random() < 0.5 ? 1 : 0) : 0;
    for (let i = 0; i < FLASHES; i++) {
      if (this.flashLife[i] > 0) {
        this.flashLife[i] -= dt;
        if (this.flashLife[i] <= 0) pos.setXYZ(i, -1000, -1000, -1000);
      } else if (spawn > 0 && this.fans.length > 0) {
        spawn--;
        const f = this.fans[Math.floor(Math.random() * this.fans.length)];
        pos.setXYZ(i, f.x + (Math.random() - 0.5) * 0.3, f.y + 1.0 + Math.random() * 0.35, f.z + (Math.random() - 0.5) * 0.3);
        this.flashLife[i] = 0.06 + Math.random() * 0.06;
      }
    }
    pos.needsUpdate = true;
  }
}
