/**
 * Grafica di giocatori, arbitro, extra e palla. Legge lo stato della partita (sim/match.ts) e lo disegna:
 * nessuna regola di gioco qui, solo pose e animazioni (esagerate, stile cartoon).
 */
import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import { Match, Actor, BALL_RADIUS } from '../sim/match';
import { radialTexture } from './stage';

interface PlayerView {
  actor: Actor;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  shadow: THREE.Mesh;
}

/** Parametri di una posa: tutti a 0 = in piedi fermo. */
interface PoseParams {
  legSwing: number;   // gambe avanti/indietro alternate
  legSpread: number;  // gambe divaricate
  legL: number;       // gamba sinistra in avanti (scivolata)
  legR: number;       // gamba destra: < 0 caricata indietro, > 0 calcio in avanti
  armL: number;       // braccia avanti/indietro (rotazione sul fianco)
  armR: number;
  raiseL: number;     // braccia alzate di lato (0 = lungo i fianchi, ~2.8 = sopra la testa)
  raiseR: number;
  tiltSide: number;   // busto piegato di lato
  lean: number;       // busto in avanti (<0) o indietro (>0)
  lift: number;       // salto / abbassamento
  headUp: number;
}

const SKIN = [0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69];
const clamp = THREE.MathUtils.clamp;

export class ActorViews {
  private views: PlayerView[] = [];
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private time = 0;

  constructor(scene: THREE.Scene, private match: Match) {
    // Modello rivolto verso +x. Gambe e braccia hanno il perno in alto (anca / spalla).
    const geo = {
      leg: new THREE.BoxGeometry(0.17, 0.88, 0.19).translate(0, -0.44, 0),
      shorts: new THREE.BoxGeometry(0.28, 0.26, 0.46),
      torso: new THREE.BoxGeometry(0.28, 0.55, 0.48),
      arm: new THREE.BoxGeometry(0.12, 0.58, 0.12).translate(0, -0.29, 0),
      head: new THREE.IcosahedronGeometry(0.16, 1),
    };
    const mats = new Map<number, THREE.Material>();
    const mat = (c: number) => {
      if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
      return mats.get(c)!;
    };
    const V = CONFIG.visuals;
    const look = (a: Actor) => {
      if (a.role === 'ref') return V.referee;
      if (a.role === 'steward') return V.steward;
      if (a.role === 'fan') return V.fan;
      if (a.role === 'coach') return { shirt: CONFIG.teams[a.team].socks, shorts: 0x22252b, socks: 0x22252b }; // tuta
      const t = CONFIG.teams[a.team];
      return { shirt: a.role === 'gk' ? t.keeper : t.shirt, shorts: t.shorts, socks: t.socks };
    };
    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture('0,0,0'), transparent: true, depthWrite: false, opacity: 0.6 });

    for (const a of [...match.actors, ...match.extras]) {
      const c = look(a);
      const skin = mat(SKIN[a.id % SKIN.length]);
      const root = new THREE.Group();
      root.scale.setScalar(V.playerScale);
      const body = new THREE.Group();
      root.add(body);

      const legL = new THREE.Mesh(geo.leg, mat(c.socks));
      legL.position.set(0, 0.9, 0.11);
      const legR = new THREE.Mesh(geo.leg, mat(c.socks));
      legR.position.set(0, 0.9, -0.11);
      const shorts = new THREE.Mesh(geo.shorts, mat(c.shorts));
      shorts.position.y = 0.95;
      const torso = new THREE.Mesh(geo.torso, mat(c.shirt));
      if (SPORT === 'boxe' && a.role === 'fwd') torso.material = skin;
      torso.position.y = 1.335;
      const armL = new THREE.Mesh(geo.arm, skin);
      armL.position.set(0, 1.57, 0.31);
      const armR = new THREE.Mesh(geo.arm, skin);
      armR.position.set(0, 1.57, -0.31);
      const head = new THREE.Mesh(geo.head, skin);
      head.position.y = 1.78;
      body.add(legL, legR, shorts, torso, armL, armR, head);

      if (SPORT === 'boxe' && a.role === 'fwd') {
        for (const arm of [armL, armR]) {
          const glove = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(c.shorts));
          glove.position.y = -0.56; arm.add(glove);
        }
      }
      if (SPORT === 'tennis' && a.role === 'fwd') {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), mat(0x232735));
        handle.position.y = -0.7;
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 6, 20), mat(c.shirt));
        hoop.scale.y = 1.25; hoop.position.y = -1.05;
        const strings = new THREE.Mesh(new THREE.CircleGeometry(0.21, 20),
          new THREE.MeshBasicMaterial({ color: 0xd6e2ee, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        strings.scale.y = 1.25; strings.position.y = -1.05;
        armR.add(handle, hoop, strings);
      }

      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.scale.setScalar(1.3 * V.playerScale);
      scene.add(root, shadow);
      this.views.push({ actor: a, root, body, head, legL, legR, armL, armR, shadow });
    }

    // Pallone sfaccettato bianco/nero (basket: arancione con cuciture scure): così si vede anche la rotazione.
    const ballGeo = new THREE.IcosahedronGeometry(BALL_RADIUS, 1);
    const colors: number[] = [];
    const [light, dark] = SPORT === 'basket' ? [[0.93, 0.42, 0.1], [0.15, 0.08, 0.05]]
      : SPORT === 'tennis' ? [[0.88, 1, 0.18], [0.96, 1, 0.72]]
      : SPORT === 'pallavolo' ? [[1, 0.86, 0.25], [0.14, 0.35, 0.85]] : [[1, 1, 1], [0.12, 0.12, 0.12]];
    for (let f = 0; f < ballGeo.attributes.position.count / 3; f++) {
      const c = f % 4 === 0 ? dark : light;
      for (let k = 0; k < 3; k++) colors.push(...c);
    }
    ballGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.ball = new THREE.Mesh(ballGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    scene.add(this.ball, this.ballShadow);
    this.ball.visible = this.ballShadow.visible = SPORT !== 'boxe';
  }

  update(dt: number) {
    this.time += dt;
    for (const v of this.views) {
      v.root.visible = v.shadow.visible = v.actor.active;
      if (v.actor.active) this.apply(v);
    }

    const b = this.match.ball;
    this.ball.position.copy(b.pos);
    this.ball.rotation.set(0, 0, -b.spin);
    this.ballShadow.position.set(b.pos.x, 0.015, b.pos.z);
    this.ballShadow.scale.setScalar((BALL_RADIUS * 4) / (1 + b.pos.y * 0.4));
  }

  private apply(v: PlayerView) {
    const a = v.actor;
    v.root.position.set(a.pos.x, 0, a.pos.z);
    v.root.rotation.y = -a.heading;
    v.shadow.position.set(a.pos.x, 0.02, a.pos.z);

    const p = this.pose(a);
    v.body.position.y = p.lift;
    v.body.rotation.set(p.tiltSide, 0, p.lean);
    v.head.position.y = 1.78 + p.headUp;
    v.legL.rotation.set(-p.legSpread, 0, p.legSwing + p.legL);
    v.legR.rotation.set(p.legSpread, 0, -p.legSwing + p.legR);
    // Braccio sinistro a +z: alzarlo di lato = rotazione x negativa; il destro il contrario.
    v.armL.rotation.set(-p.raiseL, 0, p.armL);
    v.armR.rotation.set(p.raiseR, 0, p.armR);
  }

  private pose(a: Actor): PoseParams {
    const t = this.time;
    const pt = a.poseTime;
    const sp = Math.hypot(a.vel.x, a.vel.z);
    const amp = Math.min(1, sp / 6) * 0.9;
    const sw = Math.sin(a.runPhase);
    // Corsa di base: gambe e braccia alternate, busto inclinato in avanti.
    const p: PoseParams = {
      legSwing: sw * amp, legSpread: 0, legL: 0, legR: 0,
      armL: -sw * amp * 0.8, armR: sw * amp * 0.8,
      raiseL: 0, raiseR: 0, tiltSide: 0,
      lean: -sp * 0.025, lift: Math.abs(Math.cos(a.runPhase)) * 0.06 * amp, headUp: 0,
    };
    const wiggle = (f: number, phase = 0) => Math.sin(t * f + a.id + phase);

    switch (a.pose) {
      case 'guard':
        p.armL = p.armR = 2; p.raiseL = p.raiseR = 0.2; p.lean = -0.08;
        p.legSpread = 0.18;
        break;
      case 'jab':
      case 'hook':
      case 'uppercut': {
        const k = Math.sin(clamp(pt / a.poseDur, 0, 1) * Math.PI);
        p.armL = 2;
        p.armR = a.pose === 'uppercut' ? 1.5 + k : 2 - k * 0.5;
        p.raiseR = a.pose === 'hook' ? 0.85 * k : 0.15;
        p.lean = -0.2 * k; p.tiltSide = a.pose === 'hook' ? 0.18 * k : 0;
        break;
      }
      case 'recoil':
        p.lean = 0.35 * Math.sin(clamp(pt / a.poseDur, 0, 1) * Math.PI);
        p.armL = p.armR = 2;
        break;
      case 'racket':
      case 'backhand': {
        const k = Math.sin(clamp(pt / a.poseDur, 0, 1) * Math.PI);
        p.armR = 1.4 + k; p.raiseR = a.pose === 'backhand' ? -0.8 * k : 0.7 * k;
        p.armL = 0.7; p.lean = -0.12; break;
      }
      case 'serve':
        p.armL = 2.7; p.armR = 2.9; p.lift = 0.2; p.lean = 0.1;
        break;
      case 'receive':
        p.armL = p.armR = 1.5; p.lean = -0.3; p.lift = -0.12; p.legSpread = 0.35;
        break;
      case 'set':
        p.armL = p.armR = 2.9; p.lift = 0.15; p.legSpread = 0.2;
        break;
      case 'spike':
      case 'block': {
        const k = Math.sin(clamp(pt / a.poseDur, 0, 1) * Math.PI);
        p.lift = 0.9 * k; p.armR = 2.9; p.armL = a.pose === 'block' ? 2.9 : 1.3;
        p.lean = -0.1 * k; p.legSwing = 0; break;
      }
      case 'dive': {
        const k = clamp(pt * 5, 0, 1);
        // poseDir è il lato nel mondo; lo converto nel lato locale del portiere.
        p.tiltSide = a.poseDir * Math.sign(Math.cos(a.heading) || 1) * k * 1.35;
        p.lift = Math.sin(clamp(pt * 2.5, 0, 1) * Math.PI) * 0.5;
        p.raiseL = p.raiseR = 2.8 * k;
        p.legSwing = p.armL = p.armR = p.lean = 0;
        break;
      }
      case 'fall': {
        // Lungo disteso in avanti, gambe che scalciano; negli ultimi 0,6 s si rialza.
        const k = Math.min(clamp(pt * 4, 0, 1), clamp((a.poseDur - pt) / 0.6, 0, 1));
        p.lean = -1.5 * k;
        p.lift = 0.18 * k + (pt < 0.5 ? Math.sin(pt * 2 * Math.PI) * 0.12 : 0);
        p.legSwing = Math.sin(t * 14) * (pt < 1.2 ? 0.6 : 0.12) * k;
        p.armL = p.armR = 2.6 * k;
        break;
      }
      case 'tackle': {
        const k = clamp(pt * 6, 0, 1);
        p.lean = 1.0 * k;
        p.lift = -0.05 * k;
        p.legSwing = 0;
        p.legL = 1.3 * k;
        p.armL = p.armR = -0.6 * k;
        break;
      }
      case 'stumble':
        p.tiltSide = wiggle(10) * 0.3;
        p.lean = -0.35 + wiggle(7) * 0.15;
        p.raiseL = 1.4 + wiggle(12) * 0.5;
        p.raiseR = 1.4 + wiggle(12, 1.5) * 0.5;
        break;
      case 'protest':
        // Braccia avanti a palmi aperti: "ma cosa ho fatto?"
        p.armL = p.armR = 2.0 + wiggle(5) * 0.15;
        p.raiseL = p.raiseR = 0.25;
        p.lean = 0.08;
        break;
      case 'argue':
        p.armR = 1.5 + wiggle(9) * 0.4; // indica l'avversario
        p.raiseL = 0.6;
        p.armL = -0.3;
        p.lean = -0.15 + wiggle(6) * 0.08;
        break;
      case 'shove': {
        const k = Math.sin(clamp(pt / a.poseDur, 0, 1) * Math.PI);
        p.armL = p.armR = 1.2 + 0.4 * k;
        p.lean = -0.35 * k;
        break;
      }
      case 'card':
        p.raiseR = 2.95; // braccio dritto in alto
        p.armR = 0;
        break;
      case 'windUp': {
        if (SPORT === 'basket') {
          // Basket: si ferma, piega le ginocchia e porta la palla al petto con due mani.
          p.legSwing *= 0.3;
          p.legSpread = 0.25;
          p.lift = -0.08;
          p.armL = p.armR = 1.3;
          p.lean = -0.1;
          break;
        }
        // Rallenta, apre le braccia per l'equilibrio e negli ultimi istanti carica la gamba indietro.
        const back = clamp((pt - (a.poseDur - 0.4)) / 0.3, 0, 1);
        p.legSwing *= 0.4;
        p.legR = -1.35 * back;
        p.raiseL = 0.5 + 0.7 * back; // braccia larghe: si vedono da ogni angolo
        p.raiseR = 0.4 + 0.5 * back;
        p.lean = -0.05 + 0.18 * back;
        break;
      }
      case 'kick': {
        // Il calcio: la gamba destra parte in avanti e accompagna.
        const k = Math.sin(clamp(pt / a.poseDur, 0, 1) * Math.PI);
        p.legSwing = 0;
        p.legR = 1.3 * k;
        p.raiseL = p.raiseR = 0.6 * k;
        p.lean = 0.12 * k;
        break;
      }
      case 'shoot': {
        // Tiro in sospensione: salto, braccia tese sopra la testa.
        const k = Math.sin(clamp(pt / a.poseDur, 0, 1) * Math.PI);
        p.legSwing = 0;
        p.lift = 0.45 * k;
        p.raiseL = p.raiseR = 0;
        p.armL = p.armR = 2.4 + 0.5 * k;
        p.lean = 0.05;
        break;
      }
      case 'throw': {
        // Passaggio a due mani dal petto.
        const k = Math.sin(clamp(pt / a.poseDur, 0, 1) * Math.PI);
        p.armL = p.armR = 1.2 + 0.4 * k;
        p.lean = -0.1 * k;
        break;
      }
      case 'crouch':
        // Gambe larghe, busto avanti, braccia aperte: pronto a tuffarsi o a entrare.
        p.legSpread = 0.45;
        p.legSwing *= 0.3;
        p.lift = -0.09;
        p.lean = -0.25;
        p.raiseL = p.raiseR = 0.9;
        break;
      case 'wave':
        p.raiseL = 2.6 + wiggle(10) * 0.35;
        p.raiseR = 2.6 + wiggle(10, 2) * 0.35;
        p.lift += Math.abs(wiggle(8)) * 0.2;
        p.armL = p.armR = 0;
        break;
      case 'celebrate':
        if (sp < 2) {
          // Saltella con le braccia al cielo.
          p.lift = Math.abs(wiggle(7)) * 0.35;
          p.raiseL = p.raiseR = 2.6 + wiggle(10) * 0.2;
        } else {
          p.raiseL = p.raiseR = 1.5; // "aeroplanino"
        }
        p.armL = p.armR = 0;
        break;
      case 'dejected':
        p.lean = -0.25;
        p.armL *= 0.3;
        p.armR *= 0.3;
        break;
    }
    return p;
  }
}
