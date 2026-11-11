/**
 * Pubblico con instancing: figure umane con le pose cotte nei vertici (vedi createCrowdHumans), una matrice e uno stato per tifoso.
 * I tifosi stanno seduti quando la partita è tranquilla e si alzano man mano che sale l'eccitazione. Ognuno ha il suo modo
 * di tifare (braccia al cielo, pugno alzato, applauso, salti), segue l'azione con il busto e reagisce alle scenette
 * che succedono vicino a lui: chi sta intorno si gira, si alza e applaude.
 * Nelle curve sventolano bandiere e dai distinti partono i flash delle macchine fotografiche, più fitti nei momenti caldi.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { SeatRow } from './stage';
import { radialTexture } from './stage';
import { createCrowdHumans } from './characters';

interface Fan {
  x: number;
  y: number;
  z: number;
  /** Rotazione Y a riposo (guarda il campo). */
  facing: number;
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
  /** Moltiplica SCALE: chi sta in piedi a bordo strada ha la statura dei corridori. */
  size: number;
  /** Come tifa: 0 braccia al cielo, 1 pugno alzato, 2 applauso, 3 salta a braccia alzate. */
  style: number;
  /** Braccio preferito: 2 = destro, 3 = sinistro (come lo legge lo shader). */
  side: number;
  /** Braccia alzate, applauso, rotazione verso ciò che guarda (lisciati nel tempo). */
  arm: number;
  clap: number;
  turn: number;
  /** Angolo verso l'azione (ricalcolato a turno, non a ogni fotogramma). */
  aim: number;
  /** Direzione in cui guarda a riposo, sul piano (x, z). */
  fx: number;
  fz: number;
}

export interface CrowdState {
  /** 0..1: 0 = ondeggiano, 1 = saltano tutti. */
  excitement: number;
  /** Zona calda (x sul campo) dove il pubblico si alza prima degli altri: segnale premonitore. */
  hot: { x: number; level: number };
  /** 0..1: tutti fermi a guardare il cielo, molti col braccio alzato (stella cadente in arrivo). */
  lookUp: number;
  /** Dov'è l'azione (la palla): il pubblico la segue con il busto. */
  focus?: { x: number; z: number };
  /** Scenette fra il pubblico (proposta, bacio, ballerino, capitombolo...): chi sta intorno si gira, si alza e applaude. */
  spots?: { x: number; y: number; z: number; level: number }[];
}

const NEUTRAL = [0x3a3f4b, 0xd8d8d8, 0x6b4f3a, 0x2e5d4b, 0x8c8c8c, 0x1f2633, 0xb5651d, 0x5b6b8c, 0xe8e2d0, 0x7a2e3a, 0x2f4f6f, 0xc9b458, 0x4f7a8c, 0x9a4a5c];
const FLASHES = 48;
/** Scala del tifoso: il modello è alto ~0,85 m, moltiplicato arriva a una persona vera; da seduto si abbassa. */
const SCALE = 1.5;
/** Pubblico in piedi visto da vicino (bordo strada): circa 1,85 m, accanto ad atleti e spettatori veri di ~2 m. */
const STANDING = 1.45;
/** Raggio (m) entro cui una scenetta fa girare i vicini, e quanto possono ruotare il busto (rad). */
const SPOT_RADIUS = 4.5;
const SPOT_TURN = 1.25;
const FOCUS_TURN = 0.38;
const ROADSIDE_TURN = 1.1;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Crowd {
  readonly ready: Promise<void>;
  private fanState?: THREE.InstancedBufferAttribute;
  private fans: Fan[] = [];
  /** Una matrice per tifoso, condivisa da tutte le parti del corpo (un solo upload). */
  private matrices: THREE.InstancedBufferAttribute;
  private phones: THREE.InstancedMesh;
  private flagPoles: THREE.InstancedMesh;
  private flagCloth: THREE.InstancedMesh;
  private flagTime = { value: 0 };
  private flashes: THREE.Points;
  private flashLife = new Float32Array(FLASHES);
  private time = 0;
  private frame = 0;
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
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, rows: SeatRow[]) {
    const shirts: number[] = [];
    const flagColors: number[] = [];
    const flagFans: number[] = [];
    for (const row of rows) {
      const len = row.from.distanceTo(row.to);
      const n = Math.max(1, Math.floor(len / (CONFIG.crowd.spacing * (row.standing ? 1.3 : 1))));
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
        const style = Math.random();
        this.fans.push({
          x: pos.x + (Math.random() - 0.5) * 0.2, y: pos.y, z: pos.z, facing: row.facing,
          phase: Math.random() * 10, energy: 0.5 + Math.random() * 0.5, pointer: Math.random() < 0.75,
          wide: 0.86 + Math.random() * 0.3, tall: 0.9 + Math.random() * 0.2,
          // Nelle curve si sta in piedi quasi sempre; in tribuna ci si alza solo per le occasioni.
          standAt: row.standing ? -1 : curve ? Math.random() * 0.35 : 0.2 + Math.random() * 0.75,
          stand: 0, flag: flag ? flagFans.length : -1, size: row.standing ? STANDING : 1,
          style: style < 0.36 ? 0 : style < 0.56 ? 1 : style < 0.84 ? 2 : 3, side: Math.random() < 0.7 ? 2 : 3,
          arm: 0, clap: 0, turn: 0, aim: 0, fx: Math.cos(row.facing), fz: -Math.sin(row.facing),
        });
        if (flag) { flagFans.push(this.fans.length - 1); flagColors.push(team >= 0 ? CONFIG.teams[team].shirt : 0xffffff); }
        shirts.push(team >= 0 && Math.random() < 0.7 ? CONFIG.teams[team].shirt : NEUTRAL[Math.floor(Math.random() * NEUTRAL.length)]);
      }
    }
    for (const f of this.fans) f.stand = f.standAt < 0.1 ? 1 : 0;

    const count = this.fans.length;
    this.matrices = new THREE.InstancedBufferAttribute(new Float32Array(count * 16), 16);
    // Telefono acceso in mano a chi riprende il cielo: la geometria arriva con la posa del braccio alzato.
    this.phones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.1, 0.055), new THREE.MeshBasicMaterial({ color: 0xeaf4ff }), count);
    this.phones.visible = false;
    // Bandiere: asta e telo del colore della squadra, con una banda chiara; il telo ondeggia nello shader.
    const flags = flagFans.length;
    this.flagPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 5).translate(0, 0.75, 0), new THREE.MeshLambertMaterial({ color: 0xe8e4d8 }), Math.max(1, flags));
    const cloth = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: flagTexture() });
    cloth.onBeforeCompile = (shader) => {
      shader.uniforms.flagTime = this.flagTime;
      shader.vertexShader = 'uniform float flagTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float flagWave = sin(position.x * 7.0 - flagTime * 8.0 + position.y * 2.0) * 0.07 * position.x;
        transformed.z += flagWave; transformed.y += flagWave * 0.35;`);
    };
    this.flagCloth = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.72, 0.46, 8, 2).translate(0.38, 1.26, 0), cloth, Math.max(1, flags));
    this.flagCloth.instanceMatrix = this.flagPoles.instanceMatrix;
    const c = new THREE.Color();
    for (let i = 0; i < flags; i++) this.flagCloth.setColorAt(i, c.set(flagColors[i]));
    this.flagPoles.visible = this.flagCloth.visible = flags > 0;
    // Flash: punti luminosi che compaiono per pochi fotogrammi fra le teste.
    const flashGeo = new THREE.BufferGeometry();
    flashGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FLASHES * 3).fill(-1000), 3));
    this.flashes = new THREE.Points(flashGeo, new THREE.PointsMaterial({ map: radialTexture('255,250,235'), color: 0xffffff, size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    // I tifosi saltano: evito che il culling li faccia sparire ai bordi.
    for (const mesh of [this.phones, this.flagPoles, this.flagCloth, this.flashes]) mesh.frustumCulled = false;
    scene.add(this.phones, this.flagPoles, this.flagCloth, this.flashes);
    this.ready = createCrowdHumans(count, shirts).then(({ meshes, fanState, hand }) => {
      for (const mesh of meshes) { mesh.instanceMatrix = this.matrices; scene.add(mesh); }
      this.phones.geometry.translate(hand.x + 0.02, hand.y + 0.03, hand.z);
      this.fanState = fanState;
      this.update(0, { excitement: 0, hot: { x: 0, level: 0 }, lookUp: 0 });
    });
  }

  /** gaps = posti occupati dagli spettatori "veri" dei momenti segreti: lì il tifoso finto sparisce. */
  update(dt: number, s: CrowdState, gaps: THREE.Vector3[] = []) {
    this.time += dt;
    this.flagTime.value = this.time;
    const t = this.time;
    const look = s.lookUp;
    this.updateWave(dt, s.excitement);
    // Guardare in alto = sporgersi indietro (il corpo guarda verso +x locale).
    this.lean.setFromAxisAngle(this.zAxis, 0.42 * look);
    const showPhones = this.phones.visible = look > 0.05;
    const flagPos = this.flagPoles.visible;
    // dt = 0 (fotogramma fermo per una miniatura): tutto va subito a destinazione.
    const k = dt > 0 ? 1 - Math.exp(-dt * 3.5) : 1, kArm = dt > 0 ? 1 - Math.exp(-dt * 9) : 1;
    const spots = s.spots ?? [], focus = s.focus;
    const matrices = this.matrices.array as Float32Array, states = this.fanState?.array as Float32Array | undefined;
    this.frame++;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      const local = s.hot.level * Math.max(0, 1 - Math.abs(f.x - s.hot.x) / 14);
      const excite = Math.min(1, s.excitement + local);
      // Ola: una gobba che corre lungo la tribuna lunga.
      const wave = this.wave.active && f.z < -CONFIG.pitch.width / 2 ? Math.max(0, 1 - Math.abs(f.x - this.wave.x) / 4.5) : 0;
      const gap = gaps.length > 0 && gaps.some((g) => Math.abs(g.y - f.y) < 0.3 && Math.hypot(g.x - f.x, g.z - f.z) < 0.6);
      // Scenetta vicina: ci si gira a guardarla. Chi sta davanti (più in basso) resta seduto per non coprirla.
      // A bordo strada (in piedi, a grandezza naturale) ci si volta molto di più per veder arrivare i corridori.
      const follow = f.size > 1 ? ROADSIDE_TURN : FOCUS_TURN;
      // La direzione dell'azione cambia piano: ogni tifoso la ricalcola un fotogramma su quattro, a turno.
      if (focus && (i + this.frame) % 4 === 0) f.aim = wrap(Math.atan2(f.z - focus.z, focus.x - f.x) - f.facing);
      let react = 0, lookAt = focus ? f.aim : 0, limit = follow, behind = false;
      for (const spot of spots) {
        const d = Math.hypot(spot.x - f.x, spot.z - f.z);
        const level = Math.abs(spot.y - f.y) < 2.4 ? spot.level * THREE.MathUtils.clamp(1 - (d - 1.2) / (SPOT_RADIUS - 1.2), 0, 1) : 0;
        if (level <= react) continue;
        react = level; lookAt = wrap(Math.atan2(f.z - spot.z, spot.x - f.x) - f.facing); limit = SPOT_TURN; behind = f.y > spot.y - 0.2;
      }
      // Da seduti ci si volta meno (le gambe restano fra i sedili).
      limit = THREE.MathUtils.lerp(follow, limit, Math.min(1, react * 2)) * (0.55 + 0.45 * f.stand);
      f.turn += (THREE.MathUtils.clamp(lookAt, -limit, limit) * (react > 0 ? 1 : 0.7) * (1 - look) - f.turn) * k;

      const drive = excite * f.energy;
      const standTarget = excite > f.standAt || wave > 0.3 || look > 0.3 || (react > 0.35 && behind && f.energy > 0.62) ? 1 : 0;
      f.stand += (standTarget - f.stand) * k;
      const stand = f.stand;
      // Braccia: chi indica il cielo, la cresta dell'ola, e nei momenti caldi ognuno a modo suo (a turno, non tutti insieme).
      // (I seni si calcolano solo per chi si sta muovendo davvero: il pubblico tranquillo costa quasi niente.)
      const turnUp = drive > 0.85 || (drive > 0.42 && Math.sin(t * 1.3 + f.phase * 2.1) > -0.3);
      const oneArm = look > 0.05 ? f.pointer : f.style === 1 && wave <= 0.6;
      const armTarget = gap ? 0 : look > 0.05 ? (f.pointer ? 1 : 0) : wave > 0.6 ? 1
        : turnUp && drive > (f.style === 2 ? 0.85 : f.style === 1 ? 0.42 : 0.5) ? 1 : 0;
      const clapTarget = gap || look > 0.05 ? 0 : Math.max(react > 0.15 ? react : 0, drive > 0.22 && !armTarget ? Math.min(1, drive * 1.6) : 0);
      f.arm += (armTarget - f.arm) * kArm;
      f.clap += (clapTarget - f.clap) * kArm;
      const beat = f.arm > 0.01 || drive > 0.01 ? Math.sin(t * 9 + f.phase) : 0;
      const pump = look > 0.05 ? 1 : 0.84 + 0.16 * beat;
      const clap = f.clap > 0.01 ? f.clap * (0.62 + 0.38 * Math.abs(Math.sin(t * (4.2 + f.energy * 1.6) + f.phase))) : 0;
      if (states) {
        const o = i * 4;
        states[o] = stand; states[o + 1] = f.arm * pump;
        states[o + 2] = Math.round(clap * 16) + (stand < 0.99 ? Math.min(0.99, (0.5 + 0.5 * Math.sin(t * 0.8 + f.phase)) * (1 - stand) * 0.65) : 0);
        states[o + 3] = (standTarget >= stand ? 1 : -1) * (oneArm ? f.side : 1);
      }

      const idle = stand > 0.01 ? Math.sin(t * 1.5 + f.phase) * 0.025 : 0;
      // Salta chi ha le braccia al cielo; gli altri molleggiano appena.
      const hop = f.style === 3 ? 0.34 : f.style === 0 ? 0.22 : 0.07;
      const jump = drive * Math.max(0, beat) * hop * stand * (1 - look);
      const rise = wave * 0.35 * (1 - look);
      // Seduto sta indietro, sul sedile; in piedi un passo avanti, davanti al sedile.
      const along = STAND_STEP * stand - SEAT_BACK * (1 - stand);
      this.p.set(f.x + f.fx * along, f.y + idle * (1 - look) * stand + jump + rise, f.z + f.fz * along);
      // Applausi/esultanza: oscillazione laterale del busto quando si esulta.
      const sway = excite * stand > 0.05 ? Math.sin(t * 7 + f.phase) * 0.08 * excite * stand : 0;
      const wide = gap ? 0 : f.wide * SCALE * f.size, tall = gap ? 0 : f.tall * SCALE * f.size;
      if (look === 0 && Math.abs(sway) < 0.004 && f.flag < 0) {
        // Caso più comune (tifoso tranquillo): sola rotazione attorno alla verticale, matrice scritta a mano.
        const o = i * 16, c = Math.cos(f.facing + f.turn), sn = Math.sin(f.facing + f.turn);
        matrices[o] = c * wide; matrices[o + 1] = 0; matrices[o + 2] = -sn * wide; matrices[o + 3] = 0;
        matrices[o + 4] = 0; matrices[o + 5] = tall; matrices[o + 6] = 0; matrices[o + 7] = 0;
        matrices[o + 8] = sn * wide; matrices[o + 9] = 0; matrices[o + 10] = c * wide; matrices[o + 11] = 0;
        matrices[o + 12] = this.p.x; matrices[o + 13] = this.p.y; matrices[o + 14] = this.p.z; matrices[o + 15] = 1;
        continue;
      }
      this.tilt.setFromAxisAngle(this.xAxis, sway);
      this.q.setFromAxisAngle(this.yAxis, f.facing + f.turn).multiply(this.lean).multiply(this.tilt);
      this.m.compose(this.p, this.q, this.s.set(wide, tall, wide));
      this.m.toArray(matrices, i * 16);
      if (showPhones) this.phones.setMatrixAt(i, f.pointer && f.side === 2 && !gap ? this.m : this.m.compose(this.p, this.q, this.zero));
      if (flagPos && f.flag >= 0) {
        // La bandiera parte dalla mano e ondeggia; da seduti la si tiene più bassa.
        const swing = Math.sin(t * 2.6 + f.phase) * (0.15 + excite * 0.3);
        this.tilt.setFromAxisAngle(this.zAxis, 0.12 + swing);
        this.q.setFromAxisAngle(this.yAxis, f.facing).multiply(this.tilt);
        this.p.y += (0.62 - 0.12 * (1 - stand)) * f.size;
        this.s.setScalar(f.size * (0.85 + 0.15 * stand));
        this.m.compose(this.p, this.q, gap ? this.zero : this.s);
        this.flagPoles.setMatrixAt(f.flag, this.m);
      }
    }
    this.matrices.needsUpdate = true;
    if (this.fanState) this.fanState.needsUpdate = true;
    if (showPhones) this.phones.instanceMatrix.needsUpdate = true;
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

/** Da seduti il tifoso arretra fin sul sedile (vedi stadiumSeats in stage.ts); in piedi sta un passo avanti (m). */
const SEAT_BACK = 0.26;
const STAND_STEP = 0.05;

/** Telo della bandiera: banda chiara al centro e bordo più scuro, tinto dal colore della squadra. */
function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 32);
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, 64, 5); g.fillRect(0, 27, 64, 5);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 13, 64, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
