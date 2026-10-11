// Modalità Carriera: economia, negozio e potenziamenti, senza browser. Uso: npm run check:career
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.location = { search: '?sport=calcio' };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const C = await server.ssrLoadModule('/src/career/career.ts');
  const s = C.fresh();
  assert.equal(s.offers.length, 3);
  assert(s.offers.every((o) => o.sport === 'calcio'), 'only football is open at the start');

  // Lavoro: 3 stelle medie = paga piena, assistita -30%.
  const offer = s.offers[0];
  let r = C.settle(s, { kind: 'job', sport: 'calcio', offerId: offer.id }, [], 3, false);
  assert.equal(r.earned, offer.pay);
  const pay = s.offers[0].pay;
  r = C.settle(s, { kind: 'job', sport: 'calcio', offerId: s.offers[0].id }, [], 3, true);
  assert.equal(r.earned, Math.round(pay * 0.7));

  // In proprio: solo le riprese da 3 stelle in su diventano video; i video portano soldi e iscritti.
  const before = s.money;
  r = C.settle(s, { kind: 'own', sport: 'calcio' }, [{ label: 'Gol', stars: 5, rare: false }, { label: 'x', stars: 2, rare: false }], 4, false);
  assert.equal(r.videos.length, 1);
  assert(r.earned > 0 && s.money === before + r.earned && s.subs === r.newSubs && r.newSubs > 0);

  // Negozio: prezzo, livelli, requisiti, sblocco sport.
  s.money = 100000;
  assert.equal(C.canBuy(s, C.SHOP.find((i) => i.id === 'battery')), 'needs');
  assert(C.buy(s, 'drone') && C.buy(s, 'battery') && C.buy(s, 'pass-boxe') && C.buy(s, 'mic'));
  assert.equal(C.level(s, 'battery'), 1);
  assert(C.unlocked(s, 'boxe'));
  assert(!C.buy(s, 'drone'), 'drone has one level');

  // Potenziamenti applicati solo nella partita di carriera.
  C.saveCareer(s);
  C.setPending({ kind: 'own', sport: 'calcio' });
  const { CONFIG, CAREER } = await server.ssrLoadModule('/src/config.ts');
  assert(CAREER && CONFIG.camera.droneBattery === 35 && CONFIG.voice.hintChance > 0.75);
  console.log('OK: career economy, shop and upgrades');
} finally { await server.close(); }
