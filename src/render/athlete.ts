/** Invisible motion controls for sports without a supplied capture, plus equipment sockets. */
import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import type { Actor } from '../sim/match';
import { bicycle, golfBag, golfClub, jerseyNumber, quietSign, racket, ringBox } from './equipment';

export interface Athlete {
  body: THREE.Group; torso: THREE.Group; head: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group;
  wristL: THREE.Group; wristR: THREE.Group;
  mouth: THREE.Mesh;
  ring?: THREE.Group; sparkle?: THREE.Sprite;
  bike?: { group: THREE.Group; crank: THREE.Object3D };
}
const mouthGeometry=new THREE.SphereGeometry(1,10,6).scale(.008,.006,.021);
const mouthMaterial=new THREE.MeshStandardMaterial({color:0x4a1d1f,roughness:.7});
export function createAthlete(actor: Actor): Athlete {
  const body=new THREE.Group();body.position.y=.94;
  const torso=new THREE.Group();torso.position.y=.1;body.add(torso);
  const head=new THREE.Group();head.position.y=.74;torso.add(head);
  const mouth=new THREE.Mesh(mouthGeometry,mouthMaterial);mouth.position.set(.112,.08,0);head.add(mouth);
  const leg=(side: number)=>{
    const root=new THREE.Group();root.position.set(0,-.02,side*.102);body.add(root);
    const knee=new THREE.Group();knee.position.y=-.43;root.add(knee);return{root,knee};
  };
  const arm=(side: number)=>{
    const root=new THREE.Group();root.position.set(0,.5,side*.238);torso.add(root);
    const elbow=new THREE.Group();elbow.position.y=-.3;root.add(elbow);
    const wrist=new THREE.Group();wrist.position.y=-.27;elbow.add(wrist);return{root,elbow,wrist};
  };
  const left=leg(1),right=leg(-1),armL=arm(1),armR=arm(-1);
  const player=!['ref','coach','fan','steward','spectator'].includes(actor.role),team=CONFIG.teams[actor.team];
  if(SPORT==='tennis'&&player)armR.wrist.add(racket(team.shirt));
  if(SPORT==='golf'&&player){const club=golfClub();club.name='golf-club';armR.wrist.add(club);}
  if(SPORT==='golf'&&actor.role==='ref')armR.wrist.add(quietSign());
  if(SPORT==='golf'&&actor.role==='coach')torso.add(golfBag(team.shirt));
  if(player&&SPORT!=='boxe'&&SPORT!=='golf')torso.add(jerseyNumber(actor.id%99+1));
  const ring=actor.role==='spectator'&&actor.look==='plain'?ringBox():undefined;
  if(ring)armR.wrist.add(ring.group);
  return{body,torso,head,legL:left.root,legR:right.root,kneeL:left.knee,kneeR:right.knee,
    armL:armL.root,armR:armR.root,elbowL:armL.elbow,elbowR:armR.elbow,wristL:armL.wrist,wristR:armR.wrist,mouth,
    bike:SPORT==='ciclismo'&&player?bicycle(team.shirt):undefined,ring:ring?.group,sparkle:ring?.sparkle};
}
