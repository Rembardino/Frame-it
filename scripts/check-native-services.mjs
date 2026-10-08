import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { AdManager } = await import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL('../mobile/services/adManager.js', import.meta.url), 'utf8')).toString('base64'));
const require = createRequire(import.meta.url);
const { resolveAdsConfig, TEST_APP_ID } = require('../mobile/services/config.cjs');
assert.equal(resolveAdsConfig().enabled, false);
assert.equal(resolveAdsConfig().appId, TEST_APP_ID);
assert.equal(resolveAdsConfig({}, { FRAMEIT_ADS_ENABLED: 'true' }).testAds, true);
assert.throws(() => resolveAdsConfig({}, { FRAMEIT_ADS_ENABLED: 'true', FRAMEIT_ADS_MODE: 'live' }), /Frame It App ID/);
const live = resolveAdsConfig({}, { FRAMEIT_ADS_ENABLED: 'true', FRAMEIT_ADS_MODE: 'live', FRAMEIT_ADMOB_APP_ID: 'ca-app-pub-111~222', FRAMEIT_ADMOB_BANNER_ID: 'ca-app-pub-111/333', FRAMEIT_ADMOB_INTERSTITIAL_ID: 'ca-app-pub-111/444' });
assert.equal(live.enabled, true);
assert.equal(live.testAds, false);
assert.equal(live.appId, 'ca-app-pub-111~222');

function scenario({ enabled = true, consentAllowed = true, gatherFails = false, initFails = false, showFails = false } = {}) {
  const ads = [], pauses = [], states = [], calls = { consent: 0, initialize: 0, cached: 0, warnings: 0 };
  const info = { canRequestAds: consentAllowed, privacyOptionsRequirementStatus: 'required' };
  const manager = new AdManager({
    enabled, events: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
    consent: {
      REQUIRED: 'required',
      gatherConsent: async () => { calls.consent++; if (gatherFails) throw new Error('offline'); return info; },
      getConsentInfo: async () => { calls.cached++; return info; },
      showPrivacyOptionsForm: async () => {},
    },
    sdk: { initialize: async () => { calls.initialize++; if (initFails) throw new Error('SDK unavailable'); } },
    createInterstitial: () => {
      const listeners = new Map();
      const ad = {
        loads: 0, shows: 0,
        addAdEventListener(type, callback) { listeners.set(type, callback); return () => listeners.delete(type); },
        load() { this.loads++; },
        show() { this.shows++; return showFails ? Promise.reject(new Error('no fill')) : Promise.resolve(); },
        fire(type, detail) { listeners.get(type)?.(detail); },
        listenerCount: () => listeners.size,
      };
      ads.push(ad);
      return ad;
    },
    onState: value => states.push(value), onPause: value => pauses.push(value), warn: () => calls.warnings++,
  });
  return { manager, ads, pauses, states, calls, info };
}

{
  const s = scenario({ enabled: false });
  await s.manager.initialize();
  s.manager.setScreen('playing'); s.manager.matchEnded();
  assert.equal(s.calls.consent, 0); assert.equal(s.calls.initialize, 0); assert.equal(s.ads.length, 0);
  s.manager.dispose();
}
{
  const s = scenario({ consentAllowed: false });
  await s.manager.initialize(); s.manager.setScreen('playing'); s.manager.matchEnded();
  assert.equal(s.calls.initialize, 0); assert.equal(s.ads.length, 0); assert.deepEqual(s.pauses, []);
  assert.equal(s.states.at(-1).privacyOptionsRequired, true);
}
{
  const s = scenario({ gatherFails: true });
  await s.manager.initialize(); assert.equal(s.calls.cached, 1); assert.equal(s.calls.initialize, 1);
  s.manager.setScreen('playing'); assert.equal(s.ads.length, 1);
  s.ads[0].fire('loaded'); s.manager.matchEnded(); s.manager.matchEnded();
  assert.equal(s.ads[0].shows, 1); assert.deepEqual(s.pauses, [true]);
  s.ads[0].fire('closed'); assert.deepEqual(s.pauses, [true, false]);
  assert.equal(s.ads.length, 1, 'No background retry after closing');
  s.manager.setScreen('menu'); s.manager.setScreen('playing');
  assert.equal(s.ads.length, 2); s.ads[1].fire('loaded'); s.manager.matchEnded();
  assert.equal(s.ads[1].shows, 1, 'One placement in the next match');
  s.ads[1].fire('error', new Error('SDK')); assert.deepEqual(s.pauses, [true, false, true, false]);
  s.manager.dispose(); assert.equal(s.ads[1].listenerCount(), 0);
}
{
  const s = scenario();
  await s.manager.initialize(); s.manager.setScreen('playing'); s.manager.matchEnded();
  assert.equal(s.ads[0].shows, 0, 'Unavailable ads never delay the summary');
  s.ads[0].fire('loaded'); assert.equal(s.ads[0].shows, 0, 'Late loading never shows an ad after the placement');
  s.manager.setScreen('menu'); s.manager.setScreen('playing'); s.ads[1].fire('loaded');
  s.manager.foreground = false; s.manager.matchEnded(); assert.equal(s.ads[1].shows, 0, 'No full-screen ad while backgrounded');
}
{
  const s = scenario({ showFails: true });
  await s.manager.initialize(); s.manager.setScreen('playing'); s.ads[0].fire('loaded'); s.manager.matchEnded();
  await Promise.resolve(); assert.deepEqual(s.pauses, [true, false]);
  assert.equal(s.manager.showing, false); assert.equal(s.ads.length, 1);
}
{
  const s = scenario();
  await s.manager.initialize(); s.manager.setScreen('playing');
  s.info.canRequestAds = false; await s.manager.refreshConsent(true);
  assert.equal(s.states.at(-1).allowed, false); assert.equal(s.ads[0].listenerCount(), 0);
  s.manager.matchEnded(); assert.equal(s.ads[0].shows, 0, 'Revoked consent clears preloaded ads');
}
{
  const s = scenario({ initFails: true }); await s.manager.initialize();
  s.manager.setScreen('playing'); s.manager.matchEnded(); assert.equal(s.ads.length, 0);
  assert.equal(s.states.at(-1).allowed, false);
}
console.log('OK: ads disabled by default, separate live IDs, UMP/cache/revocation, one interstitial per match, offline/no-fill/show errors, background and cleanup');
