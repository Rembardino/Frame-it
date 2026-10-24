/**
 * ANIMALI — cervi, volpi, lepri, anatre, stormi, mucche, cani, delfini, gabbiani, aquile, balene.
 * Ognuno segue un percorso a tappe (punto + secondo): la posizione dipende solo dal tempo della partita,
 * così nei replay gli animali rifanno esattamente lo stesso tragitto. Li fanno comparire gli eventi
 * (step 'animal' in events/types.ts); i percorsi tipici stanno in standardRoute().
 */
import * as THREE from 'three';

export type Species = 'deer' | 'fox' | 'rabbit' | 'duck' | 'birds' | 'cow' | 'dog' | 'dolphin' | 'gull' | 'eagle' | 'whale';
/** Una tappa del percorso: dove si trova al secondo t (dall'inizio). Due tappe nello stesso punto = si ferma. */
export interface Key { p: THREE.Vector3; t: number }
export interface Animal { species: Species; keys: Key[]; t0: number; n: number }
export interface AnimalPose { pos: THREE.Vector3; heading: number; gait: number; visible: boolean }

/** Altezza e lunghezza del corpo (m): per disegnarli e per l'inquadratura. fly = vola, swim = nuota. */
export const BODY: Record<Species, { h: number; len: number; fly?: boolean; swim?: boolean }> = {
  deer: { h: 1.5, len: 1.6 }, fox: { h: 0.45, len: 0.8 }, rabbit: { h: 0.3, len: 0.4 }, cow: { h: 1.45, len: 2.2 }, dog: { h: 0.6, len: 0.9 },
  duck: { h: 0.35, len: 0.45, fly: true }, birds: { h: 0.25, len: 0.3, fly: true }, gull: { h: 0.3, len: 0.45, fly: true }, eagle: { h: 0.5, len: 0.9, fly: true },
  dolphin: { h: 0.6, len: 2.4, swim: true }, whale: { h: 3, len: 13, swim: true },
};

export class Fauna {
  readonly list: Animal[] = [];

  spawn(species: Species, keys: Key[], t0: number, n = 1): Animal {
    const a = { species, keys, t0, n };
    // Chi ha finito da un pezzo non serve più (nemmeno ai replay, che guardano al massimo 12 s indietro).
    for (let i = this.list.length - 1; i >= 0; i--) if (this.end(this.list[i]) < t0 - 30) this.list.splice(i, 1);
    this.list.push(a);
    return a;
  }

  end(a: Animal) { return a.t0 + a.keys[a.keys.length - 1].t; }

  /** Dove si trova il membro i del gruppo (stormo, branco) all'istante time. */
  at(a: Animal, i: number, time: number): AnimalPose {
    const t = time - a.t0, keys = a.keys, body = BODY[a.species];
    const visible = t >= 0 && t <= keys[keys.length - 1].t;
    const tt = THREE.MathUtils.clamp(t, 0, keys[keys.length - 1].t);
    let k = 1, walked = 0;
    while (k < keys.length - 1 && keys[k].t < tt) { walked += keys[k].p.distanceTo(keys[k - 1].p); k++; }
    const a0 = keys[k - 1], a1 = keys[k], u = THREE.MathUtils.clamp((tt - a0.t) / Math.max(1e-6, a1.t - a0.t), 0, 1);
    const pos = a0.p.clone().lerp(a1.p, u);
    walked += a0.p.distanceTo(a1.p) * u;
    // Guarda dove sta andando; da fermo, dove andava prima.
    let j = k;
    while (j > 1 && keys[j].p.distanceTo(keys[j - 1].p) < 0.01) j--;
    const heading = Math.atan2(keys[j].p.z - keys[j - 1].p.z, keys[j].p.x - keys[j - 1].p.x);
    // Il gruppo: dietro e di lato al capofila; gli stormi ondeggiano in tre dimensioni.
    if (i > 0) {
      // Gli stormi sono larghi decine di metri; i branchi camminano vicini.
      const side = (i % 2 ? 1 : -1) * Math.ceil(i / 2), r = body.fly && a.species !== 'duck' ? Math.max(body.len, 1.6) : body.len;
      if (body.fly && a.species !== 'duck') {
        pos.x += Math.sin(i * 2.1) * r * 6 + Math.sin(time * 0.9 + i) * r;
        pos.y += Math.cos(i * 1.7) * r * 3 + Math.sin(time * 1.3 + i * 0.5) * r * 0.8;
        pos.z += Math.cos(i * 2.9) * r * 6 + Math.cos(time * 0.8 + i) * r;
      } else {
        const back = Math.ceil(i / 2) * r * 1.1;
        pos.x += -Math.cos(heading) * back - Math.sin(heading) * side * r * 0.9;
        pos.z += -Math.sin(heading) * back + Math.cos(heading) * side * r * 0.9;
      }
    }
    if (a.species === 'dolphin') pos.y = Math.max(-0.8, 1.6 * Math.sin(t * 2.2 + i * 1.3));
    if (a.species === 'whale') pos.y = -3 + 9 * Math.max(0, Math.sin(THREE.MathUtils.clamp((t - 3) / 4, 0, 1) * Math.PI));
    return { pos, heading, gait: walked / Math.max(0.2, body.len * 1.2) + i * 0.37, visible };
  }
}

/**
 * Percorsi tipici attorno a un punto c, con d = direzione del gioco (strada, fairway, rotta) e half = metà
 * della zona di gioco (oltre ci sono bosco, campi, mare aperto). side sceglie il lato.
 */
export function standardRoute(route: string, c: THREE.Vector3, d: THREE.Vector3, half: number, side = Math.random() < 0.5 ? 1 : -1): Key[] {
  const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(side), at = (f: number, l: number, y = 0) => c.clone().addScaledVector(d, f).addScaledVector(n, l).setY(y);
  switch (route) {
    // Esce dal bosco fino al bordo, si ferma a guardare, poi torna di corsa tra gli alberi.
    case 'peek': return [{ p: at(-4, half + 16), t: 0 }, { p: at(0, half + 2), t: 3.5 }, { p: at(0, half + 2), t: 6 }, { p: at(14, half + 18), t: 8.5 }];
    // Attraversa la zona di gioco da un lato all'altro.
    case 'cross': return [{ p: at(-8, half + 12), t: 0 }, { p: at(0, 0), t: 3 }, { p: at(8, -half - 12), t: 6 }];
    // Pascolano piano in un prato.
    case 'graze': return [{ p: at(0, half + 25), t: 0 }, { p: at(4, half + 24), t: 4 }, { p: at(4, half + 24), t: 6 }, { p: at(9, half + 20), t: 10 }];
    // Passano alti nel cielo sopra il gioco.
    case 'sky': return [{ p: at(-160, 90, 38), t: 0 }, { p: at(0, 0, 30), t: 5 }, { p: at(160, -80, 36), t: 10 }];
    // Girano in tondo, alti (aquila, gabbiani).
    case 'glide': return Array.from({ length: 13 }, (_, k) => ({ p: at(Math.cos(k * 0.6) * 45, Math.sin(k * 0.6) * 45, 28 + Math.sin(k) * 4), t: k }));
    // Sull'acqua, poi si alzano in volo (anatre).
    case 'takeoff': return [{ p: at(0, 0, 0.05), t: 0 }, { p: at(8, 0, 0.05), t: 2.5 }, { p: at(30, 4, 6), t: 4.5 }, { p: at(110, 10, 22), t: 9 }];
    // Nuotano accanto al gioco (delfini).
    case 'swim': return [{ p: at(-30, half + 6), t: 0 }, { p: at(60, half + 6), t: 9 }];
    // Lontano: emerge, salta e ricade (balena).
    case 'breach': return [{ p: at(40, half + 60), t: 0 }, { p: at(60, half + 60), t: 10 }];
  }
  return [{ p: c.clone(), t: 0 }, { p: c.clone(), t: 5 }];
}
