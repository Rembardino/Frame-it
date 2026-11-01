import { CONFIG, SPORT } from '../config';
import type { Actor, Pose } from '../sim/match';

export interface AssetMotion { group: string; variant: number; time: number; duration: number; contact: number; loop: boolean; side?: number }

/** Pure selection: no renderer clock or random calls, including when seeking through a saved replay. */
export function assetMotion(a: Actor, time: number, carrying: boolean, previous = false): AssetMotion | null {
  const pose: Pose = previous ? a.previousPose : a.pose;
  const pt = previous ? a.previousPoseTime : a.poseTime;
  const duration = previous ? a.previousPoseDur : a.poseDur;
  const variant = (previous ? a.previousGestureVariant : a.gestureVariant) ?? 0;
  const variation=variant+a.id+(a.appearance??0)*31;
  let group = previous ? a.previousGesture : a.gesture;
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const athlete = !['ref','coach','steward','fan','spectator'].includes(a.role);
  if (!group) {
    if (pose === 'dance' || pose === 'celebrate') group = SPORT === 'golf' && athlete ? 'golfVictory' : 'celebration';
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
      else if (pose === 'guard' && speed < 0.35) group = 'idle';
    } else if (SPORT === 'calcio' && athlete) {
      if (pose === 'kick') group = a.role === 'gk' ? 'keeperPass' : 'footballShot';
      else if (pose === 'tackle') group = 'footballTackle';
      else if (pose === 'throw') group = a.role === 'gk' ? 'keeperThrow' : 'footballThrow';
      else if (pose === 'dive') group = 'keeperDive';
      else if (pose === 'crouch' && a.role === 'gk') group = 'keeperCatch';
    } else if (SPORT === 'golf' && athlete) {
      if (pose === 'swing' || pose === 'practice') group = 'golfDrive';
      else if (pose === 'putt') group = 'golfPutt';
    }
    if (!group && (pose === 'normal' || pose === 'guard' || pose === 'sprint')) {
      if (athlete && (SPORT === 'ciclismo' || SPORT === 'vela')) return null;
      if (speed > 0.3) {
        const forward = (a.vel.x * Math.cos(a.heading) + a.vel.z * Math.sin(a.heading)) / speed;
        const side = (a.vel.z * Math.cos(a.heading) - a.vel.x * Math.sin(a.heading)) / speed;
        group = forward < -0.35 ? 'backward' : Math.abs(side) > 0.65 ? (side > 0 ? 'stepRight' : 'stepLeft')
          : SPORT === 'boxe' && athlete ? (speed > 1 ? 'boxingWalk' : 'boxingStep')
          : speed > CONFIG.match.walkSpeed * 1.2 ? 'run' : 'walk';
        if(forward>.15&&forward<.4&&speed>CONFIG.match.walkSpeed)group='turn';
        if (a.role === 'gk' && SPORT === 'calcio') group = 'keeperStep';
        if (carrying && SPORT === 'calcio' && a.role !== 'gk') group = 'footballDribble';
      } else group = a.role === 'gk' && SPORT === 'calcio' ? 'keeperIdle' : SPORT === 'calcio' && athlete ? 'footballIdle' : SPORT === 'boxe' && athlete ? 'idle' : undefined;
    }
  }
  if (!group) return null;
  if(pose==='fall'&&Number.isFinite(duration)&&pt>duration*.62){
    const recover=SPORT!=='boxe'&&pt>duration*.8;
    return{group:recover?'getUp':a.role==='fan'?'crawl':'fallenIdle',variant:variation,
      time:recover?pt-duration*.8:pt-duration*.62,duration:duration*(recover?.2:.18),contact:.32,loop:!recover};
  }
  const looping = ['normal','guard','sprint','dance','celebrate'].includes(pose) && !a.gesture;
  return { group, variant: variation, time: looping ? (speed > .3 ? a.runPhase / (Math.PI * 2) : time * .3 + a.id * .17) : Math.max(0,pt),
    duration, contact: SPORT === 'golf' ? (pose === 'putt' ? CONFIG.golf.puttImpact : CONFIG.golf.impact) / duration : .32, loop: looping,
    side:pose==='dive'?Math.sign(a.poseDir*Math.cos(a.heading)):0 };
}
