import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const soleGeometry = new RoundedBoxGeometry(.135, .028, .29, 2, .014);
const footGeometry = new RoundedBoxGeometry(.122, .075, .26, 2, .028);
const ankleGeometry = new THREE.CylinderGeometry(.065, .058, .19, 10);
const laceGeometry = new THREE.BoxGeometry(.09, .009, .008);
const rubber = new THREE.MeshStandardMaterial({ color: 0xe7e1d5, roughness: .95 });
const lace = new THREE.MeshStandardMaterial({ color: 0xfaf6ec, roughness: .85 });

/** Lightweight high boxing boots: a thin flat sole, ankle support and crossed laces; no studs. +Z is forward. */
export function boxingBoot(color: number) {
  const group = new THREE.Group(); group.name = 'boxing-boot';
  const leather = new THREE.MeshStandardMaterial({ color, roughness: .72 });
  const sole = new THREE.Mesh(soleGeometry, rubber); sole.name = 'boxing-flat-sole'; sole.position.set(0, -.075, .07);
  const foot = new THREE.Mesh(footGeometry, leather); foot.position.set(0, -.029, .07);
  const ankle = new THREE.Mesh(ankleGeometry, leather); ankle.position.set(0, .055, -.008);
  group.add(sole, foot, ankle);
  for (let i = 0; i < 5; i++) for (const direction of [-1, 1]) {
    const strip = new THREE.Mesh(laceGeometry, lace);
    strip.position.set(0, -.005 + i * .027, .058); strip.rotation.z = direction * .22;
    group.add(strip);
  }
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { group, sole };
}
