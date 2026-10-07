import type { Actor } from '../match';

export type SportAction = 'serve' | 'forehand' | 'backhand' | 'volley' | 'smash' | 'winner' | 'ace' | 'backhandWinner' | 'volleyWinner' | 'lob'
  | 'receive' | 'set' | 'spike' | 'block' | 'jab' | 'hook' | 'uppercut' | 'counter' | 'knockdown';

export interface SportSimulation {
  update(dt: number): void;
  action(kind: SportAction, actor: Actor, target?: Actor): void;
  scoreText(): string;
}
