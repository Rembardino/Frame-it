/**
 * Effetti nel cielo (eventi rari e momenti segreti). Legge Match.sky e lo disegna: nessuna regola qui.
 * Stella cadente = una testa luminosa più una scia di sprite che sfumano.
 * Navicella = disco con cupola e luci che girano, raggio traente a cono sotto la pancia.
 */
import * as THREE from 'three';
import type { Match } from '../sim/match';
import { radialTexture } from './stage';

const TRAIL = 14;
const LIGHTS = 12;

export class SkyEffects {
  private sprites: THREE.Sprite[] = [];
  private ufo = new THREE.Group();
  private spin = new THREE.Group();
  private lights: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private glow: THREE.Sprite;

  constructor(scene: THREE.Scene, private match: Match) {
    const tex = radialTexture();
    for (let i = 0; i < TRAIL; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: i === 0 ? 0xffffff : 0xcfe4ff, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, transparent: true,
      }));
      s.visible = false;
      s.renderOrder = 10;
      scene.add(s);
      this.sprites.push(s);
    }

    // Disco schiacciato, cupola di vetro verde, pancia luminosa; le luci sul bordo girano col disco.
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, emissive: 0x1c232b, metalness: 0.35, roughness: 0.35 });
    this.spin.add(new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 12).scale(1, 0.24, 1), metal));
    this.spin.add(new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.12, 6, 40).rotateX(Math.PI / 2), metal));
    this.spin.add(new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.45, 0),
      new THREE.MeshStandardMaterial({ color: 0x8fffd6, emissive: 0x2a8f6f, transparent: true, opacity: 0.85, roughness: 0.1 })));
    this.spin.add(new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.3, 0.22, 24).translate(0, -0.72, 0), new THREE.MeshBasicMaterial({ color: 0xc8ffe6 })));
    for (let i = 0; i < LIGHTS; i++) {
      const a = (i / LIGHTS) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial());
      l.position.set(Math.cos(a) * 3.1, 0.02, Math.sin(a) * 3.1);
      this.spin.add(l);
      this.lights.push(l);
    }
    // Cono aperto, alto 1 m: lo allungo fino a terra. Il bagliore sotto la pancia si vede anche da lontano.
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.8, 1, 32, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0x9dffcf, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beam.position.y = -0.75;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('170,255,210'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.position.y = -0.6;
    this.glow.scale.setScalar(7);
    this.ufo.add(this.spin, this.beam, this.glow);
    this.ufo.visible = false;
    scene.add(this.ufo);
  }

  update() {
    const star = this.match.sky.star;
    const u = star.t / star.dur;
    // Entra e sfuma dolcemente.
    const fade = star.active ? Math.min(1, u / 0.15, (1 - u) / 0.3) : 0;
    const { head, tail } = this.match.starPoints();
    this.sprites.forEach((s, i) => {
      s.visible = fade > 0;
      if (!s.visible) return;
      const k = i / (TRAIL - 1); // 0 = testa, 1 = fine della scia
      s.position.lerpVectors(head, tail, k);
      s.scale.setScalar((i === 0 ? 15 : 8) * (1 - k * 0.7));
      s.material.opacity = fade * (1 - k) * (i === 0 ? 1 : 0.8);
    });
    this.updateUfo();
  }

  private updateUfo() {
    const m = this.match, p = m.ufoPose();
    this.ufo.visible = p.visible;
    if (!p.visible) return;
    this.ufo.position.copy(p.pos);
    // Si inclina nel verso in cui vola.
    const v = m.ufoPose(m.time + 0.1).pos.sub(p.pos);
    this.ufo.rotation.set(THREE.MathUtils.clamp(v.z * 0.08, -0.4, 0.4), 0, THREE.MathUtils.clamp(-v.x * 0.08, -0.4, 0.4));
    this.spin.rotation.y = p.t * 1.6;
    // Luci che si rincorrono sul bordo.
    this.lights.forEach((l, i) => l.material.color.setHSL(((i + Math.floor(p.t * 8)) % 3) / 3 * 0.3 + 0.1, 1, (i + Math.floor(p.t * 8)) % 3 ? 0.35 : 0.75));
    const seat = m.sky.ufo.seat!;
    this.beam.visible = p.beam > 0;
    this.beam.scale.y = Math.max(0.1, p.pos.y - 0.75 - seat.y);
    this.beam.material.opacity = p.beam * (0.2 + Math.sin(p.t * 30) * 0.04);
    this.glow.material.opacity = 0.5 + p.beam * 0.5;
  }
}
