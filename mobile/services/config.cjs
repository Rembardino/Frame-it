const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';

/** Disabled by default. Live builds require IDs belonging to Frame It. */
function resolveAdsConfig(saved = {}, env = {}) {
  const enabled = env.FRAMEIT_ADS_ENABLED === undefined ? saved.enabled === true : env.FRAMEIT_ADS_ENABLED === 'true';
  const testAds = env.FRAMEIT_ADS_MODE === undefined ? saved.testAds !== false : env.FRAMEIT_ADS_MODE !== 'live';
  const appId = env.FRAMEIT_ADMOB_APP_ID || saved.appId || null;
  const bannerId = env.FRAMEIT_ADMOB_BANNER_ID || saved.bannerId || '';
  const interstitialId = env.FRAMEIT_ADMOB_INTERSTITIAL_ID || saved.interstitialId || '';
  if (enabled && !testAds && (!/^ca-app-pub-\d+~\d+$/.test(appId ?? '') || !/^ca-app-pub-\d+\/\d+$/.test(bannerId ?? '') || !/^ca-app-pub-\d+\/\d+$/.test(interstitialId ?? ''))) {
    throw new Error('Live ads require the Frame It App ID, banner ID and interstitial ID. Supply FRAMEIT_ADMOB_APP_ID, FRAMEIT_ADMOB_BANNER_ID and FRAMEIT_ADMOB_INTERSTITIAL_ID.');
  }
  return { enabled, testAds, appId: enabled && !testAds ? appId : TEST_APP_ID, bannerId, interstitialId };
}

module.exports = { resolveAdsConfig, TEST_APP_ID };
