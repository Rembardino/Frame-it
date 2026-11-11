import { CONFIG, SPORT } from '../config';
import type { Actor, Pose } from '../sim/match';

/** Recordings store this: catalog 2 = original clips, 3 = RPG additions, 4 = head/body hits and stride-matched locomotion pools,
 * 5 = raised boxing ring (venue floor one metre lower) and the court-sport clips keyed in Blender. */
export const ANIMATION_CATALOG = 5;

/**
 * travel = metres covered (from the simulated gait phase), so in-place loops can keep the planted foot still.
 * weight < 1: the rest is the procedural pose. mix: a second gait cross-faded in near a speed or direction threshold.
 */
export interface AssetMotion { group: string; variant: number; time: number; duration: number; contact: number; loop: boolean; side?: number; catalog?:number; travel?: number;
  weight?: number; mix?: { motion: AssetMotion; weight: number };
  /** Played at the clip's own speed, cut by the pose: a practice swing has no ball to meet. */
  natural?: boolean }

/** Gaits that advance with the distance covered (the others loop on the clock). */
const STRIDES = /^(run|walk|backward|step|turn|keeperStep|footballDribble|boxingStep|boxingWalk|mascotWalk|keeperCarry)/;
/** Half-widths of the cross-fade around a gait threshold: m/s, and radians of travel direction. */
const BLEND_SPEED = .35, BLEND_ANGLE = .22;

/** Pure selection: no renderer clock or random calls, including when seeking through a saved replay. */
export function assetMotion(a: Actor, time: number, carrying: boolean, previous = false): AssetMotion | null {
  const pose: Pose = previous ? a.previousPose : a.pose;
  const pt = previous ? a.previousPoseTime : a.poseTime;
  const duration = previous ? a.previousPoseDur : a.poseDur;
  const variant = (previous ? a.previousGestureVariant : a.gestureVariant) ?? 0;
  const variation=variant+a.id+(a.appearance??0)*31;
  let group = previous ? a.previousGesture : a.gesture;
  const speed = Math.hypot(a.vel.x, a.vel.z);
  // Gait clips follow the smoothed velocity (catalog 4), so a sudden acceleration still cross-fades.
  const gv = (a.animationCatalog ?? 3) >= 4 && a.gaitVel ? a.gaitVel : a.vel, gaitSpeed = Math.hypot(gv.x, gv.z), gaitAngle = Math.atan2(gv.z, gv.x);
  const athlete = !['ref','coach','steward','fan','spectator'].includes(a.role);
  const modern = (a.animationCatalog ?? 3) >= 3, byspeed = (a.animationCatalog ?? 3) >= 4;
  /** Which gait clip a given velocity (speed, direction in world) selects for this pose; undefined = procedural. */
  const party = pose === 'dance' || pose === 'celebrate';
  const gait = (sp: number, angle: number): string | undefined => {
    // Celebrating: run to the spot, celebrate (or dance, once there) standing still, never while sliding.
    if (party && sp <= .8) return pose === 'dance' ? 'celebrationDance' : SPORT === 'golf' && athlete ? 'golfVictory' : 'celebration';
    if (modern && a.look === 'mascot') return pose === 'normal' ? (sp > .3 ? 'mascotWalk' : 'mascotIdle') : undefined;
    if (modern && pose === 'normal' && !athlete && sp < .3) return 'sidelineIdle';
    if (SPORT === 'boxe' && athlete && pose === 'guard' && sp < 0.35) return 'idle';
    if (sp <= 0.3) return a.role === 'gk' && SPORT === 'calcio' ? modern&&carrying&&a.previousGesture==='keeperCatch'?'keeperCarry':'keeperIdle'
      : SPORT === 'calcio' && athlete ? 'footballIdle' : SPORT === 'boxe' && athlete ? 'idle'
      // Basket e pallavolo (dal catalogo 5): da fermi, in posizione d'attesa sulle gambe piegate, non dritti come pali.
      : (a.animationCatalog ?? 3) >= 5 && athlete && pose === 'normal' && !carrying && (SPORT === 'basket' || SPORT === 'pallavolo') ? 'keeperIdle' : undefined;
    const forward = Math.cos(angle - a.heading), side = Math.sin(angle - a.heading);
    let g = forward < -0.35 ? 'backward' : Math.abs(side) > 0.65 ? (side > 0 ? 'stepRight' : 'stepLeft')
      : SPORT === 'boxe' && athlete ? (sp > 1 ? 'boxingWalk' : 'boxingStep')
      : sp > CONFIG.match.walkSpeed * 1.2 ? 'run' : 'walk';
    if(forward>.15&&forward<.4&&sp>CONFIG.match.walkSpeed)g='turn';
    if (a.role === 'gk' && SPORT === 'calcio') g = 'keeperStep';
    if (carrying && SPORT === 'calcio' && a.role !== 'gk') g = 'footballDribble';
    // Clips chosen by how fast they naturally move (rig at 1.92 m), so none plays far from its own pace.
    const pace = sp / CONFIG.visuals.playerScale;
    if (byspeed && g === 'run') g = pace < 2.8 ? 'runJog' : pace < 4.6 ? 'runMid' : 'runSprint';
    if (byspeed && pace < 1 && ['backward','stepLeft','stepRight'].includes(g)) g += 'Slow';
    return g;
  };
  let walking = false;
  // Tennis: il giudice di sedia resta seduto sul seggiolone per tutta la partita.
  if (SPORT === 'tennis' && a.role === 'ref' && (a.animationCatalog ?? 3) >= 5) group = 'crowdSit';
  if (!group) {
    if(modern&&a.look==='mascot'&&['argue','wave'].includes(pose))group='mascotReact';
    else if(modern&&(pose==='argue'||pose==='protest'))group=a.role==='ref'?'officialYes':'talk';
    else if(modern&&pose==='shove')group='shove';
    else if (party && (!byspeed || SPORT === 'ciclismo' || SPORT === 'vela')) group = SPORT === 'golf' && athlete ? 'golfVictory' : 'celebration';
    else if (pose === 'dejected') group = SPORT === 'golf' && athlete ? 'golfBad' : 'dejected';
    else if (pose === 'getUp') group = 'getUp';
    else if (pose === 'count') group = 'refCount';
    else if (pose === 'stumble') group = 'trip';
    else if (pose === 'fall') group = 'knockdown';
    else if (pose === 'kiss') return null; // Coupled secret moments keep their shared contact choreography.
    else if (SPORT === 'boxe' && athlete) {
      if (pose === 'jab') group = 'boxingJab';
      else if (pose === 'hook') group = 'boxingHook';
      else if (pose === 'combo') group = 'boxingCombo';
      else if (pose === 'recoil') group = 'boxingRecoil';
      else if (pose === 'crouch') group = 'boxingDodge';
    } else if (SPORT === 'calcio' && athlete) {
      if (pose === 'kick') group = a.role === 'gk' ? 'keeperPass' : 'footballShot';
      else if (pose === 'tackle') group = 'footballTackle';
      else if (pose === 'throw') group = a.role === 'gk' ? 'keeperThrow' : 'footballThrow';
      else if (pose === 'dive') group = 'keeperDive';
      else if (pose === 'crouch' && a.role === 'gk') group = 'keeperCatch';
    } else if (SPORT === 'golf' && athlete) {
      if (pose === 'swing' || pose === 'practice') group = 'golfDrive';
      else if (pose === 'putt') group = 'golfPutt';
    } else if (athlete && (a.animationCatalog ?? 3) >= 5) {
      // Gesti animati a mano in Blender (scripts/blender/clips.py): il corpo viene dalla ripresa, le mani restano sulla palla (Character.touchBall).
      if (SPORT === 'basket' && pose === 'shoot') group = 'basketShoot';
      else if (SPORT === 'pallavolo' && pose === 'spike') group = 'volleySpike';
    }
    if (!group && (pose === 'normal' || pose === 'guard' || pose === 'sprint' || party)) {
      if (athlete && (SPORT === 'ciclismo' || SPORT === 'vela') && a.look !== 'mascot') return null;
      walking = true;
      group = gait(gaitSpeed, gaitAngle);
    }
  }
  if(group&&pose==='fall'&&Number.isFinite(duration)&&pt>duration*.62){
    const recover=SPORT!=='boxe'&&pt>duration*.8;
    return{group:recover?'getUp':a.role==='fan'?'crawl':'fallenIdle',variant:variation,
      time:recover?pt-duration*.8:pt-duration*.62,duration:duration*(recover?.2:.18),contact:.32,loop:!recover,catalog:a.animationCatalog??3};
  }
  // The ball leaves the boot when the kick pose starts; punches land at 32% of the gesture (BoxingSimulation).
  const contact = SPORT === 'golf' ? (pose === 'putt' ? CONFIG.golf.puttImpact : CONFIG.golf.impact) / duration : pose === 'kick' ? .1 : .32;
  const make = (g: string): AssetMotion => {
    // A one-shot celebration plays once from the start of the pose; a dance loops.
    const looping = (walking && !/^(celebration|golfVictory)$/.test(g)) || pose === 'dance';
    const stride = looping && STRIDES.test(g) && speed > .05;
    // Same cadence the simulation uses to advance runPhase, evaluated at the speed typical of the gait.
    const cadence = SPORT === 'boxe' ? 5 : /^(run|turn|footballDribble)/.test(g) ? 2.12 : 2.5;
    return { group: g, variant: variation, time: looping ? (g.endsWith('Slow') || g === 'celebrationDance' ? time + a.id * .37 : stride ? a.runPhase / (Math.PI * 2) : time * .3 + a.id * .17) : Math.max(0,pt),
      duration, contact, loop: looping, travel: stride && !g.endsWith('Slow') ? a.runPhase / cadence : undefined, natural: pose === 'practice' || undefined,
      // Dives: side of the dive. Keeper shuffles: lateral direction wanted from the clip (+1 = to the keeper's left).
      side:pose==='dive'?Math.sign(a.poseDir*Math.cos(a.heading)):g==='keeperStep'?-Math.sign(a.vel.z*Math.cos(a.heading)-a.vel.x*Math.sin(a.heading)):0,catalog:a.animationCatalog??3 };
  };
  if (!walking) return group ? make(group) : null;
  // Near a threshold (walk/jog/run/sprint, straight/side/back, still/moving) cross-fade the two gaits instead of switching.
  const fade = (pick: (x: number) => string | undefined, x: number, half: number) => {
    const lo = pick(x - half), hi = pick(x + half);
    if (lo === hi) return null;
    let l = x - half, h = x + half;
    for (let i = 0; i < 8; i++) { const m = (l + h) / 2; if (pick(m) === lo) l = m; else h = m; }
    const u = Math.min(1, Math.max(0, (x - (l + h) / 2 + half) / (2 * half))), w = u * u * (3 - 2 * u);
    return { lo, hi, w };
  };
  const f = fade((s) => gait(Math.max(0, s), gaitAngle), gaitSpeed, BLEND_SPEED) ?? (gaitSpeed > .3 ? fade((t) => gait(gaitSpeed, t), gaitAngle, BLEND_ANGLE) : null);
  if (!f) return group ? make(group) : null;
  const [main, other, w] = f.lo === group ? [f.lo, f.hi, f.w] : [f.hi, f.lo, 1 - f.w];
  // A procedural side (net players standing still) becomes a partial weight on the clip.
  if (!main) return other ? { ...make(other), weight: w } : null;
  return other ? { ...make(main), mix: { motion: make(other), weight: w } } : { ...make(main), weight: 1 - w };
}
