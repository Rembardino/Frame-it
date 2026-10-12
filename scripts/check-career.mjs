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

  C.ECONOMY.noise = 0; // numeri esatti nel test

  // Lavoro: punteggio medio 50 = paga piena, lineare (100 = 1,75 volte), assistita -30%.
  const offer = s.offers[0];
  let r = C.settle(s, { kind: 'job', sport: 'calcio', offerId: offer.id }, [], 50, false);
  assert.equal(r.earned, offer.pay);
  let pay = s.offers[0].pay;
  r = C.settle(s, { kind: 'job', sport: 'calcio', offerId: s.offers[0].id }, [], 100, false);
  assert.equal(r.pay, Math.round(pay * 1.75));
  pay = s.offers[0].pay;
  r = C.settle(s, { kind: 'job', sport: 'calcio', offerId: s.offers[0].id }, [], 50, true);
  assert.equal(r.earned, Math.round(pay * 0.7));

  // Visualizzazioni lineari: punteggio doppio = video doppio; più iscritti = più visualizzazioni.
  const shot = { label: 'Gol', stars: 4, score: 40, rare: false };
  assert.equal(C.videoPotential(0, { ...shot, score: 80 }, 'job', false), 2 * C.videoPotential(0, shot, 'job', false));
  assert(C.videoPotential(1000, shot, 'job', false) > C.videoPotential(0, shot, 'job', false));
  assert.equal(C.videoPotential(0, { ...shot, viral: true }, 'own', false), C.videoPotential(0, shot, 'job', false) * 6 * 1.5);

  // Video: solo da 3 stelle in su; crescono a quote uguali per videoLife partite, poi si fermano.
  const before = s.money, subs0 = s.subs;
  r = C.settle(s, { kind: 'own', sport: 'calcio' }, [{ label: 'Gol', stars: 5, score: 95, rare: false }, { label: 'x', stars: 2, score: 20, rare: false }], 80, false);
  assert.equal(r.videos.length, 1);
  const v = s.videos[0], life = C.ECONOMY.videoLife;
  assert.equal(v.views, Math.round(v.potential / life));
  assert(r.pay === 0 && r.earned === r.channelMoney && s.money === before + r.earned && s.subs === subs0 + r.newSubs && r.newSubs > 0);
  for (let i = 1; i < life + 3; i++) C.settle(s, { kind: 'own', sport: 'calcio' }, [], 50, false);
  assert.equal(v.views, v.potential, 'a video ends exactly at its expected views');
  r = C.settle(s, { kind: 'own', sport: 'calcio' }, [], 50, false);
  assert.equal(r.channelViews, 0, 'finished videos stop growing');

  // Fama: con tanti iscritti arrivano clienti più importanti che pagano di più.
  const avgPay = (subs) => { let t = 0; for (let i = 0; i < 50; i++) t += C.makeOffers({ ...C.fresh(), subs }).reduce((a, o) => a + o.pay, 0); return t / 150; };
  assert(avgPay(5000) > 2 * avgPay(0));

  // Niente esplosione: gli iscritti crescono in modo lineare, non esponenziale.
  const g = C.fresh(), viral = [1, 2, 3].map(() => ({ label: 'v', stars: 4, score: 75, rare: false, viral: true }));
  const subsAt = [];
  for (let m = 1; m <= 40; m++) { C.settle(g, { kind: 'own', sport: 'calcio' }, viral, 75, false); subsAt[m] = g.subs; }
  assert(subsAt[40] - subsAt[20] < 1.1 * (subsAt[20] - subsAt[5]) * 20 / 15, 'subscribers grow linearly');

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
