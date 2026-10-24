import type * as THREE from 'three';
import type { Actor } from '../match';
import type { Key, Species } from '../fauna';

export type SportAction = 'serve' | 'forehand' | 'backhand' | 'volley' | 'smash' | 'winner' | 'ace' | 'backhandWinner' | 'volleyWinner' | 'lob'
  | 'receive' | 'set' | 'spike' | 'rallySpike' | 'block' | 'jab' | 'hook' | 'uppercut' | 'counter' | 'knockdown'
  /** Golf: l'esito del colpo lo sceglie l'evento (ace = buca in uno). */
  | 'drive' | 'driveBunker' | 'driveTree' | 'driveWater' | 'layup' | 'layupWater'
  | 'approach' | 'approachClose' | 'approachShort' | 'approachBunker' | 'approachWater'
  | 'chip' | 'chipIn' | 'bunkerShot' | 'bunkerIn' | 'puttShort' | 'putt' | 'puttLong' | 'puttLag' | 'puttLip'
  /** Ciclismo. */
  | 'attack' | 'catch' | 'crash' | 'sprintFinish' | 'runAlong'
  /** Vela. */
  | 'gun' | 'tack' | 'foil' | 'capsize';

/** Sabbia, spruzzi, foglie, zolle, polvere: la grafica li disegna in base a match.time (anche nei replay). */
export type Effect = { kind: 'sand' | 'splash' | 'leaves' | 'turf' | 'spray' | 'dust'; at: THREE.Vector3; t: number };

export interface SportSimulation {
  /** A scripted action waits for the current rally flight to finish. */
  readonly busy?: boolean;
  /** Golf: la buca in gioco. */
  readonly pin?: THREE.Vector3;
  readonly effects?: Effect[];
  update(dt: number): void;
  action(kind: SportAction, actor: Actor, target?: Actor): void;
  scoreText(): string;
  /** Scritta al posto del cronometro (golf: buca e par). */
  clockText?(): string;
  /** Punto notevole per i copioni, con uno scarto [avanti, di lato] (golf: tribuna, bandiera, bunker). */
  spot?(name: string, off: [number, number]): THREE.Vector3;
  /** Sport solo col drone: dove parte e dove guarda. */
  droneStart?(): { pos: THREE.Vector3; look: THREE.Vector3 };
  /** Percorso di un animale per un evento (vedi sim/fauna.ts). */
  animalRoute?(route: string, species: Species): Key[];
  /** Chi è in testa (i primi corridori, l'equipaggio della barca in testa): soggetto 'leader' degli eventi. */
  leaders?(): Actor[];
  /** true = l'attore lo muove la simulazione (ciclisti, equipaggi): niente passi né spinte automatiche. */
  drives?(a: Actor): boolean;
  /** Stato da registrare per i replay (numeri, interpolati) e da rimettere. */
  capture?(): number[];
  restore?(state: number[]): void;
}
