/**
 * Effetti nel cielo (eventi rari). Legge Match.sky e lo disegna: nessuna regola qui.
 * Stella cadente = una testa luminosa più una scia di sprite che sfumano.
 */
import * as THREE from 'three';
import type { Match } from '../sim/match';
import { radialTexture } from './stage';

const TRAIL = 14;

export class SkyEffects {
  private sprites: THREE.Sprite[] = [];

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
  }
}
