/** Scene views: articulated motion, contact shadows and the existing ball rotation. */
import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import { Match, type Actor, BALL_RADIUS } from '../sim/match';
import { radialTexture } from './stage';
import { createAthlete, type Athlete } from './athlete';
import { createBall } from './ball';
import { actorMotion, stanceOffset } from '../animation/motion';

interface PlayerView extends Athlete { actor: Actor; root: THREE.Group; shadow: THREE.Mesh }

export class ActorViews {
  readonly group = new THREE.Group();
  private views: PlayerView[] = [];
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;

  constructor(scene: THREE.Scene, private match: Match) {
    scene.add(this.group);
    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture('0,0,0'), transparent: true, depthWrite: false, opacity: 0.6 });
    for (const actor of [...match.actors, ...match.extras]) {
      const root = new THREE.Group(); root.scale.setScalar(CONFIG.visuals.playerScale);
      const athlete = createAthlete(actor); root.add(athlete.body);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      this.group.add(root, shadow); this.views.push({ actor, root, ...athlete, shadow });
    }
    this.ball = createBall(); this.ball.castShadow = true;
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat); this.group.add(this.ball, this.ballShadow);
    this.ball.visible = this.ballShadow.visible = SPORT !== 'boxe';
  }

  update(_dt: number) {
    for (const view of this.views) {
      view.root.visible = view.shadow.visible = view.actor.active;
      if (view.actor.active) this.apply(view);
    }
    const b = this.match.ball;
    this.ball.position.copy(b.pos); this.ball.rotation.set(0, 0, -b.spin);
    this.ballShadow.position.set(b.pos.x, 0.015, b.pos.z);
    this.ballShadow.scale.setScalar((BALL_RADIUS * 4) / (1 + b.pos.y * 0.4));
  }

  private apply(v: PlayerView) {
    const a = v.actor, p = actorMotion(a, this.match.time, this.match.ball.holder === a);
    v.root.position.set(a.pos.x, 0, a.pos.z); v.root.rotation.y = -a.heading;
    v.shadow.position.set(a.pos.x, 0.02, a.pos.z);
    v.shadow.scale.setScalar(1.15 * CONFIG.visuals.playerScale / (1 + Math.max(0, p.lift) * 0.3));
    // Rotate a falling body at the hips. Other gestures bend only the torso, keeping feet planted.
    v.body.rotation.set(p.tiltSide * p.bodyWeight, 0, p.lean * p.bodyWeight);
    v.torso.rotation.set(p.tiltSide * (1 - p.bodyWeight), p.turn, p.lean * (1 - p.bodyWeight));
    v.head.position.y = 0.74 + p.headUp;
    v.head.rotation.set(0, -p.turn * 0.35, -p.lean * 0.25 * (1 - p.bodyWeight));
    const left = p.legSwing + p.legL, right = -p.legSwing + p.legR;
    v.legL.rotation.set(-p.legSpread + p.strideSide, 0, left);
    v.legR.rotation.set(p.legSpread - p.strideSide, 0, right);
    v.kneeL.rotation.z = p.kneeL; v.kneeR.rotation.z = p.kneeR;
    v.body.position.y = 0.94 + p.lift + stanceOffset(p);
    v.armL.rotation.set(-p.raiseL, 0, p.armL); v.armR.rotation.set(p.raiseR, 0, p.armR);
    v.elbowL.rotation.z = p.elbowL; v.elbowR.rotation.z = p.elbowR;
    v.wristL.rotation.set(0, p.wristL, p.wristFlexL); v.wristR.rotation.set(0, p.wristR, p.wristFlexR);
  }
}
