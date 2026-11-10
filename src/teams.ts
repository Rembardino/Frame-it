import type { SportId } from './config';

export type KitPattern = 'stripes' | 'sash' | 'hoops' | 'split' | 'chevron' | 'diamonds' | 'pinstripes';
export interface TeamKit {
  id: string; name: string; short: string; logo: string;
  shirt: number; shorts: number; socks: number; keeper: number;
  accent: number; pattern: KitPattern;
}

const crests = import.meta.glob('./assets/teams/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const clubs = [
  ['aurora', 'AURORA', 'AUR', 0x275bd8, 0xeaf8ff, 0x152b59, 'sash'],
  ['vulcani', 'VULCANI', 'VUL', 0xda363e, 0x241f29, 0x241f29, 'stripes'],
  ['lupi', 'LUPI', 'LUP', 0x7542be, 0xf2edf8, 0x30214b, 'chevron'],
  ['delfini', 'DELFINI', 'DEL', 0x089caa, 0x12354b, 0xf2f4ee, 'hoops'],
  ['falchi', 'FALCHI', 'FAL', 0xedb821, 0x192f50, 0x192f50, 'split'],
  ['aquile', 'AQUILE', 'AQU', 0xd92f72, 0xf7f2f7, 0x17223b, 'pinstripes'],
  ['leoni', 'LEONI', 'LEO', 0xe76823, 0x3b2921, 0x3b2921, 'sash'],
  ['draghi', 'DRAGHI', 'DRA', 0x18834c, 0xf0db9c, 0x17372e, 'diamonds'],
  ['tigri', 'TIGRI', 'TIG', 0xf3ead5, 0x222733, 0x222733, 'stripes'],
  ['saette', 'SAETTE', 'SAE', 0x55dce2, 0x203b59, 0x203b59, 'chevron'],
  ['orsi', 'ORSI', 'ORS', 0x7f2144, 0xe5d2ac, 0xe5d2ac, 'hoops'],
  ['fenici', 'FENICI', 'FEN', 0x30276f, 0xff7963, 0xf4eadb, 'split'],
] as const;

// The clubs have departments in every sport; the emblem follows the club, while names and kits belong to the sport.
const names: Record<SportId, string[]> = {
  calcio: ['AURORA FC', 'VULCANI ROSSI', 'LUPI DEL BORGO', 'DELFINI COSTIERI', 'FALCHI REALI', 'AQUILE ROSA', 'LEONI DI RAME', 'DRAGHI VERDI', 'TIGRI UNITED', 'SAETTE AZZURRE', 'ORSI GRANATA', 'FENICI SPORTING'],
  basket: ['AURORA COMETS', 'VULCANI HEAT', 'LUPI BASKET', 'DELFINI HOOPS', 'FALCHI SKY', 'AQUILE FLIGHT', 'LEONI DUNK', 'DRAGHI COURT', 'TIGRI METRO', 'SAETTE THUNDER', 'ORSI NORTH', 'FENICI RISE'],
  pallavolo: ['AURORA VOLLEY', 'VULCANI SPIKE', 'LUPI DELLA RETE', 'DELFINI BEACH', 'FALCHI ALTI', 'AQUILE VOLLEY', 'LEONI DEL SET', 'DRAGHI BLOCK', 'TIGRI VOLLEY', 'SAETTE SMASH', 'ORSI POLARI', 'FENICI ACE'],
  boxe: ['LUCA FERRI', 'DIEGO ROJAS', 'AMIR HADDAD', 'NOAH SILVA', 'LEON WEBER', 'KENJI MORI', 'RAFAEL COSTA', 'OMAR DIAZ', 'MATEO RUIZ', 'ADAM NOVAK', 'ELIAS BERG', 'NICO ROMANO'],
  tennis: ['ANDREA RIVA', 'DANIEL VEGA', 'HUGO MARTIN', 'ELIAS LIND', 'LIAM COSTA', 'REN SATO', 'SOFIA MORETTI', 'EMMA DUBOIS', 'MAYA SILVA', 'NORA BERG', 'ELENA CRUZ', 'AKI TANAKA'],
  golf: ['MARCO VALENTI', 'ALEX MORENO', 'JAMES REED', 'ERIK HOLM', 'PAOLO SERRA', 'JUN PARK', 'GIULIA CONTI', 'ALICE LAURENT', 'LARA SANTOS', 'FREYA LUND', 'ISABEL REYES', 'YUNA KIM'],
  ciclismo: ['AURORA RACING', 'VULCANI VELO', 'LUPI CYCLING', 'DELFINI PRO RIDE', 'FALCHI SPRINT', 'AQUILE PEDAL', 'LEONI CORSA', 'DRAGHI TEAM', 'TIGRI ROAD', 'SAETTE VELOCE', 'ORSI ALPINE', 'FENICI ENDURANCE'],
  vela: ['AURORA SAILING', 'VULCANI REGATTA', 'LUPI DI MARE', 'DELFINI FOIL', 'FALCHI DEL VENTO', 'AQUILE OCEAN', 'LEONI MARINI', 'DRAGHI DEL MARE', 'TIGRI DEL PORTO', 'SAETTE FOIL', 'ORSI ARTICI', 'FENICI A VELA'],
};

export function teamCatalog(sport: SportId): TeamKit[] {
  const offset = ['calcio', 'basket', 'pallavolo', 'boxe', 'tennis', 'golf', 'ciclismo', 'vela'].indexOf(sport);
  const patterns: KitPattern[] = ['stripes', 'sash', 'hoops', 'split', 'chevron', 'diamonds', 'pinstripes'];
  return clubs.map(([id, , short, shirt, accent, shorts, pattern], i) => ({
    id, name: names[sport][i], short: ['boxe', 'tennis', 'golf'].includes(sport) ? names[sport][i].split(' ').at(-1)!.slice(0, 3) : short,
    logo: crests[`./assets/teams/${id}.webp`], shirt, accent, shorts,
    socks: i % 2 ? accent : shirt, keeper: i % 2 ? 0x9bdd45 : 0xf5ba35,
    pattern: offset === 0 ? pattern : patterns[(i + offset) % patterns.length],
  }));
}

function random() { return Math.random(); }
function take(sport: SportId, eligible: number[]): number {
  const key = `frameit.teams.${sport}.${eligible[0]}.${eligible.length}`;
  let used: number[] = [];
  try { used = JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { /* Storage can be unavailable in an offline WebView. */ }
  if (!Array.isArray(used)) used = [];
  let available = eligible.filter(i => !used.includes(i));
  if (!available.length) { used = used.slice(-Math.min(2, eligible.length - 1)); available = eligible.filter(i => !used.includes(i)); }
  const index = available[Math.floor(random() * available.length)];
  try { localStorage.setItem(key, JSON.stringify([...used, index])); } catch { /* The random draw also works without storage. */ }
  return index;
}

export function selectTeams(sport: SportId): TeamKit[] {
  const catalog = teamCatalog(sport), all = catalog.map((_, i) => i);
  const singles = sport === 'tennis' || sport === 'golf';
  const home = take(sport, singles ? all.slice(0, 6) : all);
  let away = take(sport, singles ? all.slice(6) : all);
  if (away === home) away = (home + 1 + Math.floor(random() * (catalog.length - 1))) % catalog.length;
  const pair = [catalog[home], { ...catalog[away] }];
  // An away strip keeps both teams readable even when a draw pairs two similar club colours.
  const rgb = (c: number) => [c >> 16 & 255, c >> 8 & 255, c & 255];
  const a = rgb(pair[0].shirt), b = rgb(pair[1].shirt);
  if (Math.hypot(...a.map((v, i) => v - b[i])) < 155) {
    const brightness = a[0] * .299 + a[1] * .587 + a[2] * .114;
    pair[1].accent = pair[1].shirt;
    pair[1].shirt = brightness > 145 ? 0x14233c : 0xf4f0e3;
    pair[1].shorts = pair[1].shirt;
    pair[1].socks = pair[1].shirt;
  }
  return pair;
}
