/** Scene views: articulated motion, contact shadows and the existing ball rotation. */
import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import { Match, type Actor, BALL_RADIUS } from '../sim/match';
import { radialTexture } from './stage';
import { createAthlete, type Athlete } from './athlete';
import { createBall } from './ball';
import { actorMotion, stanceOffset } from '../animation/motion';
import { mouthPose } from '../audio/speech';

interface PlayerView extends Athlete { actor: Actor; root: THREE.Group; shadow: THREE.Mesh }

export class ActorViews {
  readonly group = new THREE.Group();
  private views: PlayerView[] = [];
  private ball: THREE.Mesh;
  /** Il pivot porta posizione e schiacciamento; la palla dentro ruota su se stessa. */
  private ballPivot = new THREE.Group();
  private ballShadow: THREE.Mesh;
  private squash = 0;

  constructor(scene: THREE.Scene, private match: Match) {
    scene.add(this.group);
    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture('0,0,0'), transparent: true, depthWrite: false, opacity: 0.6 });
    for (const actor of [...match.actors, ...match.extras]) {
      const root = new THREE.Group(); root.scale.setScalar(actor.role === 'spectator' ? CONFIG.visuals.spectatorScale : CONFIG.visuals.playerScale);
      const athlete = createAthlete(actor); root.add(athlete.body);
      if (athlete.bike) { root.add(athlete.bike.group); root.rotation.order = 'YXZ'; }
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      this.group.add(root, shadow); this.views.push({ actor, root, ...athlete, shadow });
    }
    this.ball = createBall(); this.ball.castShadow = true; this.ballPivot.add(this.ball);
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat); this.group.add(this.ballPivot, this.ballShadow);
    this.ballPivot.visible = this.ballShadow.visible = SPORT !== 'boxe';
  }

  /** La palla tocca terra: si schiaccia un istante e torna tonda. */
  bounce() { this.squash = 1; }

  update(dt: number) {
    for (const view of this.views) {
      view.root.visible = view.shadow.visible = view.actor.active;
      if (view.actor.active) this.apply(view);
    }
    const b = this.match.ball;
    this.ballPivot.position.copy(b.pos); this.ball.rotation.set(0, 0, -b.spin);
    this.squash = Math.max(0, this.squash - dt * 9);
    const s = Math.sin(this.squash * Math.PI) * 0.28;
    this.ballPivot.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
    this.ballShadow.position.set(b.pos.x, 0.015, b.pos.z);
    // Palla in buca o in acqua: niente ombra.
    this.ballShadow.visible = SPORT !== 'boxe' && b.pos.y > 0;
    this.ballShadow.scale.setScalar((BALL_RADIUS * 4) / (1 + b.pos.y * 0.4));
  }

  private apply(v: PlayerView) {
    const a = v.actor, p = actorMotion(a, this.match.time, this.match.ball.holder === a);
    // y: gli spettatori in tribuna stanno sul loro gradone.
    v.root.position.set(a.pos.x, a.pos.y, a.pos.z); v.root.rotation.y = -a.heading;
    if (v.bike) {
      // Piega in curva (poseDir), bici sul fianco se cade, che dondola nello scatto; ruote che girano.
      const down = a.pose === 'fall';
      v.root.rotation.x = down ? 0 : a.poseDir;
      v.bike.group.rotation.x = down ? a.poseDir : Math.sin(a.runPhase) * (a.pose === 'sprint' ? 0.14 : 0.015);
      v.bike.group.position.y = down ? 0.15 : 0;
      v.bike.crank.rotation.z = -a.runPhase;
    }
    v.shadow.position.set(a.pos.x, a.pos.y + 0.02, a.pos.z);
    v.shadow.scale.setScalar(1.15 * CONFIG.visuals.playerScale / (1 + Math.max(0, p.lift) * 0.3));
    // Rotate a falling body at the hips. Other gestures bend only the torso, keeping feet planted.
    v.body.rotation.set(p.tiltSide * p.bodyWeight, 0, p.lean * p.bodyWeight);
    v.torso.rotation.set(p.tiltSide * (1 - p.bodyWeight), p.turn, p.lean * (1 - p.bodyWeight));
    v.head.position.y = 0.74 + p.headUp;
    // Bocca: segue le sillabe della frase; chi esulta la tiene un po' aperta anche in silenzio.
    const m = mouthPose(a.say, this.match.time);
    const open = Math.max(m.open, a.pose === 'celebrate' ? 0.3 : 0);
    v.mouth.scale.set(1, 1 + open * 3.4, m.wide);
    v.head.rotation.set(0, -p.turn * 0.35, -p.lean * 0.25 * (1 - p.bodyWeight));
    const left = p.legSwing + p.legL, right = -p.legSwing + p.legR;
    v.legL.rotation.set(-p.legSpread + p.strideSide, 0, left);
    v.legR.rotation.set(p.legSpread - p.strideSide, 0, right);
    v.kneeL.rotation.z = p.kneeL; v.kneeR.rotation.z = p.kneeR;
    // In bici i piedi stanno sui pedali, non a terra.
    v.body.position.y = 0.94 + p.lift + (v.bike && a.pose !== 'fall' ? 0 : stanceOffset(p));
    v.armL.rotation.set(-p.raiseL, 0, p.armL); v.armR.rotation.set(p.raiseR, 0, p.armR);
    v.elbowL.rotation.z = p.elbowL; v.elbowR.rotation.z = p.elbowR;
    v.wristL.rotation.set(0, p.wristL, p.wristFlexL); v.wristR.rotation.set(0, p.wristR, p.wristFlexR);
    if (v.ring) {
      v.ring.visible = a.pose === 'kneel';
      v.sparkle!.scale.setScalar(0.32 + 0.12 * Math.sin(this.match.time * 9));
    }
  }
}
