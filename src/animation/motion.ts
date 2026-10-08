import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import type { Actor, Pose } from '../sim/match';

export interface MotionPose {
  legSwing: number; legSpread: number; legL: number; legR: number; strideSide: number;
  armL: number; armR: number; raiseL: number; raiseR: number;
  kneeL: number; kneeR: number; elbowL: number; elbowR: number;
  wristL: number; wristR: number; wristFlexL: number; wristFlexR: number; turn: number;
  tiltSide: number; lean: number; lift: number; headUp: number; bodyWeight: number;
}

const clamp = THREE.MathUtils.clamp;
const ease = (u: number) => { const t = clamp(u, 0, 1); return t * t * (3 - 2 * t); };
type Key = [number, number];
function curve(u: number, keys: Key[]) {
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) return THREE.MathUtils.lerp(keys[i - 1][1], keys[i][1], ease((u - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  }
  return keys[keys.length - 1][1];
}

/** Shared animation sampling keeps live gestures and replay timing identical. */
export function samplePose(a: Actor, time: number, pose: Pose = a.pose, pt = a.poseTime, duration = a.poseDur, carrying = false): MotionPose {
  const sp = Math.hypot(a.vel.x, a.vel.z), speed = clamp(sp / CONFIG.match.runSpeed, 0, 1);
  const swing = Math.sin(a.runPhase), amp = speed * 0.68;
  const forward = sp > 0.05 ? (a.vel.x * Math.cos(a.heading) + a.vel.z * Math.sin(a.heading)) / sp : 1;
  const sideways = sp > 0.05 ? (a.vel.z * Math.cos(a.heading) - a.vel.x * Math.sin(a.heading)) / sp : 0;
  const u = Number.isFinite(duration) ? clamp(pt / Math.max(duration, 0.001), 0, 1) : 0;
  const hit = curve(u, [[0, 0], [0.12, -0.18], [0.32, 1], [0.58, 0.65], [1, 0]]);
  const jump = Math.sin(Math.PI * u);
  const wiggle = (frequency: number, offset = 0) => Math.sin(time * frequency + a.id + offset);
  const player = !['ref', 'coach', 'fan', 'steward'].includes(a.role);
  const p: MotionPose = {
    legSwing: swing * amp * forward, strideSide: swing * amp * sideways * 0.55,
    legSpread: 0.025, legL: 0, legR: 0,
    armL: -swing * amp * forward * 0.65, armR: swing * amp * forward * 0.65,
    raiseL: 0.05, raiseR: 0.05,
    kneeL: -Math.max(0, -swing * (Math.abs(forward) > 0.3 ? forward : 1)) * speed * 0.9,
    kneeR: -Math.max(0, swing * (Math.abs(forward) > 0.3 ? forward : 1)) * speed * 0.9,
    elbowL: 0.15 + speed * 0.85, elbowR: 0.15 + speed * 0.85,
    wristL: 0, wristR: 0, wristFlexL: 0, wristFlexR: 0, turn: wiggle(1.8) * 0.025 * speed,
    tiltSide: swing * speed * 0.025 + sideways * sp * 0.012, lean: -sp * forward * 0.018,
    lift: Math.abs(Math.cos(a.runPhase)) * 0.025 * speed,
    headUp: Math.sin(time * 1.7 + a.id) * 0.003,
    bodyWeight: 0,
  };
  const plant = () => { p.legSwing *= 0.12; p.strideSide *= 0.12; p.kneeL = p.kneeR = -0.22; };
  const guard = () => {
    p.armL = 0.95; p.armR = 0.88; p.elbowL = 1.65; p.elbowR = 1.68;
    p.raiseL = p.raiseR = 0.08; p.legSpread = 0.13; p.legL = 0.12; p.legR = -0.12;
    p.kneeL = -0.25 - Math.max(0, -swing) * speed * 0.18;
    p.kneeR = -0.25 - Math.max(0, swing) * speed * 0.18; p.lean = -0.08;
    p.legSwing *= 0.38; p.strideSide *= 0.75; p.turn = -0.12;
    p.lift = wiggle(5) * 0.01;
  };
  switch (pose) {
    case 'normal':
      if (player && (SPORT === 'tennis' || SPORT === 'pallavolo')) {
        p.armL += 0.35; p.armR += SPORT === 'tennis' ? 0.65 : 0.35;
        p.elbowL += 0.22; p.elbowR += 0.22;
        if (sp < 0.8) { p.legSpread = 0.1; p.kneeL = p.kneeR = -0.2; p.lean = -0.06; }
      } else if (SPORT === 'basket' && carrying) {
        // The hand follows the existing dribble instead of swinging through the ball.
        const bounce = Math.abs(Math.sin(time * 6 + a.seed));
        p.armL += 0.3; p.armR = 0.4 + bounce * 0.35; p.elbowR = 0.2 + bounce * 0.4;
      }
      break;
    case 'guard': guard(); break;
    case 'jab': case 'hook': case 'uppercut':
      guard(); p.armR += hit * (pose === 'uppercut' ? 0.95 : 0.86);
      p.elbowR -= hit * (pose === 'jab' ? 1.45 : pose === 'hook' ? 0.65 : 0.5);
      p.raiseR = pose === 'hook' ? 0.08 + hit * 0.7 : 0.08;
      p.turn += hit * (pose === 'jab' ? 0.13 : 0.42); p.lean -= hit * 0.14;
      p.wristR = pose === 'uppercut' ? -0.55 * hit : 0;
      break;
    case 'recoil':
      guard(); p.lean += jump * 0.28; p.turn += jump * 0.18;
      p.tiltSide = jump * 0.06; break;
    case 'racket': case 'backhand':
      p.armR = 0.85 + hit * 0.9; p.elbowR = 0.75 - hit * 0.65;
      p.raiseR = pose === 'backhand' ? -hit * 0.42 : hit * 0.38;
      p.turn = (pose === 'backhand' ? -1 : 1) * curve(u, [[0, -0.28], [0.32, 0.38], [0.65, 0.2], [1, 0]]);
      p.wristR = (pose === 'backhand' ? -1 : 1) * hit * 0.65;
      p.wristFlexR = -Math.max(0, hit) * 1.4;
      p.armL = 0.55; p.raiseL = 0.2; p.lean = -0.08; break;
    case 'serve':
      plant(); p.armL = curve(u, [[0, 0.7], [0.2, 2.75], [0.5, 2.3], [1, 0.45]]);
      p.armR = curve(u, [[0, 1.2], [0.16, 2.4], [0.32, 2.95], [0.65, 1.2], [1, 0.7]]);
      p.elbowL = 0.15; p.elbowR = curve(u, [[0, 1.2], [0.18, 1.55], [0.32, 0.12], [1, 0.5]]);
      p.lean = curve(u, [[0, 0.08], [0.18, 0.15], [0.36, -0.15], [1, -0.03]]);
      p.turn = hit * 0.22; p.lift = jump * (SPORT === 'pallavolo' ? 0.32 : 0.12); break;
    case 'receive':
      plant(); p.armL = p.armR = 1.1 + jump * 0.22; p.elbowL = p.elbowR = 0.06;
      p.raiseL = p.raiseR = -0.13; p.legSpread = 0.18;
      p.legL = p.legR = 0.28; p.kneeL = p.kneeR = -0.65; p.lean = -0.28; break;
    case 'set':
      plant(); p.armL = p.armR = curve(u, [[0, 1.8], [0.32, 2.65], [0.62, 2.25], [1, 0.6]]);
      p.elbowL = p.elbowR = 0.7 - Math.max(0, hit) * 0.5;
      p.raiseL = p.raiseR = 0.2; p.legSpread = 0.14; p.lift = jump * 0.09; break;
    case 'spike': case 'block':
      plant(); p.lift = jump * (SPORT === 'pallavolo' ? 0.98 : 0.4); p.kneeL = p.kneeR = -0.25 - jump * 0.32;
      p.armR = pose === 'block' ? 2.85 : curve(u, [[0, 1.6], [0.16, 2.45], [0.32, 2.9], [0.6, 1.3], [1, 0.65]]);
      p.armL = pose === 'block' ? 2.85 : 1.25 + jump * 0.5;
      p.elbowL = pose === 'block' ? 0.1 : 0.25;
      p.elbowR = pose === 'block' ? 0.1 : curve(u, [[0, 1], [0.16, 1.4], [0.32, 0.1], [1, 0.4]]);
      p.lean = -Math.max(0, hit) * 0.18; p.turn = pose === 'block' ? 0 : hit * 0.25; break;
    case 'windUp':
      if (SPORT === 'basket') {
        plant(); p.armL = p.armR = 0.85; p.elbowL = p.elbowR = 1.25;
        p.legL = p.legR = 0.16; p.kneeL = p.kneeR = -0.5; p.lean = -0.1;
      } else {
        const back = ease((pt - (duration - 0.4)) / 0.3);
        p.legSwing *= 0.4; p.legR = -1.35 * back;
        p.raiseL = 0.5 + 0.7 * back; p.raiseR = 0.4 + 0.5 * back; p.lean = -0.05 + 0.18 * back;
      }
      break;
    case 'shoot':
      plant(); p.lift = jump * 0.42;
      p.armL = p.armR = curve(u, [[0, 1.7], [0.26, 2.6], [0.42, 2.85], [0.72, 2.65], [1, 0.5]]);
      p.elbowL = p.elbowR = curve(u, [[0, 1.1], [0.32, 0.15], [0.7, 0.1], [1, 0.35]]);
      p.wristR = Math.max(0, hit) * 0.25; p.lean = 0.025; break;
    case 'throw':
      p.armL = p.armR = 0.8 + Math.max(0, hit) * 0.65;
      p.elbowL = p.elbowR = 1 - Math.max(0, hit) * 0.9; p.lean = -Math.max(0, hit) * 0.1; break;
    case 'kick': p.legSwing = 0; p.legR = 1.3 * jump; p.raiseL = p.raiseR = 0.6 * jump; p.lean = 0.12 * jump; break;
    case 'dive': {
      p.bodyWeight = 1;
      const k = clamp(pt * 5, 0, 1);
      p.tiltSide = a.poseDir * Math.sign(Math.cos(a.heading) || 1) * k * 1.35;
      p.lift = Math.sin(clamp(pt * 2.5, 0, 1) * Math.PI) * 0.5;
      p.raiseL = p.raiseR = 2.8 * k; p.legSwing = p.armL = p.armR = p.lean = 0;
      p.elbowL = p.elbowR = 0.08; break;
    }
    case 'fall': {
      p.bodyWeight = 1;
      const k = Math.min(ease(pt * 4), ease((duration - pt) / 0.6));
      p.lean = -1.5 * k; p.lift = -0.69 * k;
      p.legSwing = Math.sin(time * 14) * (pt < 1.2 ? 0.4 : 0.08) * k;
      p.armL = p.armR = 2.6 * k; break;
    }
    case 'tackle': p.bodyWeight = 1; p.lean = ease(pt * 6); p.lift = -0.55 * ease(pt * 6); p.legSwing = 0; p.legL = 1.3 * ease(pt * 6); p.armL = p.armR = -0.6 * ease(pt * 6); break;
    case 'crouch':
      plant(); p.legSpread = 0.2; p.legL = p.legR = 0.25; p.kneeL = p.kneeR = -0.65;
      p.lean = -0.22; p.raiseL = p.raiseR = 0.65; break;
    case 'stumble': p.tiltSide = wiggle(10) * 0.24; p.lean = -0.3 + wiggle(7) * 0.12; p.raiseL = 1.4 + wiggle(12) * 0.4; p.raiseR = 1.4 + wiggle(12, 1.5) * 0.4; break;
    case 'protest': p.armL = p.armR = 1.45 + wiggle(5) * 0.12; p.elbowL = p.elbowR = 0.25; p.raiseL = p.raiseR = 0.25; p.lean = 0.06; break;
    case 'argue': p.armR = 1.2 + wiggle(9) * 0.25; p.elbowR = 0.3; p.raiseL = 0.4; p.armL = -0.2; p.lean = -0.1 + wiggle(6) * 0.06; break;
    case 'shove': p.armL = p.armR = 0.9 + 0.7 * jump; p.elbowL = p.elbowR = 0.8 - jump * 0.7; p.lean = -0.25 * jump; break;
    case 'card': p.raiseR = 2.95; p.armR = 0; p.elbowR = 0.05; break;
    case 'wave': p.raiseL = 2.6 + wiggle(8) * 0.2; p.raiseR = 2.6 + wiggle(8, 2) * 0.2; p.lift += Math.abs(wiggle(6)) * 0.1; p.armL = p.armR = 0; break;
    case 'celebrate':
      if (sp < 2) { p.lift = (0.5 + 0.5 * wiggle(6)) * 0.22; p.raiseL = p.raiseR = 2.5 + wiggle(8) * 0.15; }
      else p.raiseL = p.raiseR = 1.5;
      p.armL = p.armR = 0; p.elbowL = p.elbowR = 0.12; break;
    case 'dejected': p.lean = -0.22; p.armL *= 0.3; p.armR *= 0.3; break;
  }
  return p;
}

export function actorMotion(a: Actor, time: number, carrying = false): MotionPose {
  const pose = samplePose(a, time, a.pose, a.poseTime, a.poseDur, carrying);
  const blend = ease(a.poseBlendTime / CONFIG.visuals.poseBlendSec);
  if (blend >= 1) return pose;
  const previous = a.poseFrom ?? samplePose(a, time, a.previousPose, a.previousPoseTime, a.previousPoseDur, carrying);
  for (const key of Object.keys(pose) as (keyof MotionPose)[]) pose[key] = THREE.MathUtils.lerp(previous[key], pose[key], blend);
  return pose;
}

/** The lowest stance foot anchors both rendering and strike kinematics to the court. */
export function stanceOffset(p: MotionPose) {
  const footY = (angle: number, knee: number, side: number) =>
    0.92 - (0.43 * Math.cos(angle) + 0.44 * Math.cos(angle + knee)) * Math.cos(side) - 0.03;
  return -(1 - p.bodyWeight) * Math.min(
    footY(p.legSwing + p.legL, p.kneeL, -p.legSpread + p.strideSide),
    footY(-p.legSwing + p.legR, p.kneeR, p.legSpread - p.strideSide));
}

/** Sample the same articulated hand/racket chain used by the athlete rig. */
export function netContactPoint(a: Actor, time: number, poseTime = a.poseTime) {
  const p = samplePose(a, time, a.pose, poseTime, a.poseDur);
  const hand = (side: number) => {
    const right = side < 0;
    const point = new THREE.Vector3(0, SPORT === 'tennis' ? -0.57 : -0.04, 0);
    point.applyEuler(new THREE.Euler(0, right ? p.wristR : p.wristL, right ? p.wristFlexR : p.wristFlexL));
    point.y -= 0.27;
    point.applyAxisAngle(new THREE.Vector3(0, 0, 1), right ? p.elbowR : p.elbowL);
    point.y -= 0.3;
    point.applyEuler(new THREE.Euler(right ? p.raiseR : -p.raiseL, 0, right ? p.armR : p.armL));
    point.add(new THREE.Vector3(0, 0.5, side * 0.238));
    point.applyEuler(new THREE.Euler(p.tiltSide * (1 - p.bodyWeight), p.turn, p.lean * (1 - p.bodyWeight)));
    point.y += 0.1;
    point.applyEuler(new THREE.Euler(p.tiltSide * p.bodyWeight, 0, p.lean * p.bodyWeight));
    point.y += 0.94 + p.lift + stanceOffset(p);
    return point.multiplyScalar(CONFIG.visuals.playerScale).applyAxisAngle(new THREE.Vector3(0, 1, 0), -a.heading).add(a.pos);
  };
  const contact = hand(-1);
  if (SPORT === 'pallavolo' && (a.pose === 'set' || a.pose === 'receive')) contact.add(hand(1)).multiplyScalar(0.5);
  return contact;
}
