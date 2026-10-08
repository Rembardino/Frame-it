const { resolveAdsConfig } = require('./services/config.cjs');

module.exports = ({ config }) => {
  const ads = resolveAdsConfig(config.extra?.frameit?.ads, process.env);
  return {
    ...config,
    android: {
      ...config.android,
      permissions: [...new Set([...(config.android?.permissions ?? []), 'com.google.android.gms.permission.AD_ID'])],
    },
    extra: { ...config.extra, frameit: { ...config.extra?.frameit, ads } },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-sensors', { motionPermission: 'Allow Frame It to use phone motion for camera controls.' }],
      ['react-native-google-mobile-ads', { androidAppId: ads.appId, delayAppMeasurementInit: true }],
    ],
  };
};
