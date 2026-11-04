import { SPORT } from '../config';
import type { Actor } from '../sim/match';
import type { TeamKit } from '../teams';
import { riderName } from '../sim/sports/cyclingRiders';

const colours = [0x275bd8, 0xda363e, 0x7542be, 0x089caa, 0xedb821, 0xd92f72, 0xe76823, 0x18834c, 0xf3ead5, 0x55dce2, 0x7f2144, 0x30276f, 0x8bc34a, 0xf28dad];

/** Stable rider colours also survive kit refreshes and saved replays. */
export function riderKit(actor: Actor, team: TeamKit): TeamKit {
  if (SPORT !== 'ciclismo' || ['ref', 'coach', 'fan', 'steward', 'spectator'].includes(actor.role)) return team;
  return { ...team, id: `rider-${actor.id}`, name: riderName(actor.id), short: String(actor.id + 1), logo: '',
    shirt: colours[actor.id % colours.length], shorts: 0x202938, socks: 0xf4f0e3, accent: 0xeff3f5, pattern: 'chevron' };
}
