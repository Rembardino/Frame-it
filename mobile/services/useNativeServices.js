import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { DeviceMotion } from 'expo-sensors';
import * as InAppUpdates from 'expo-in-app-updates';
import mobileAds, { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, AdEventType, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';
import { AdManager } from './adManager';

const configuration = Constants.expoConfig?.extra?.frameit?.ads ?? { enabled: false, testAds: true };
const testAds = __DEV__ || configuration.testAds !== false;
export const bannerUnitId = testAds ? TestIds.ADAPTIVE_BANNER : configuration.bannerId;
const interstitialUnitId = testAds ? TestIds.INTERSTITIAL : configuration.interstitialId;
const STORE_ID = 'com.frameitnow';

export function useNativeServices(webview) {
  const [screen, setScreen] = useState('menu');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [adState, setAdState] = useState({ allowed: false, privacyOptionsRequired: false });
  const [update, setUpdate] = useState(null);
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const gyroRequest = useRef(0);
  const updateBusy = useRef(false);
  const manager = useRef(null);
  const emit = useCallback((name, detail) => {
    // JSON is injected as a JS value, never concatenated into an HTML document.
    webview.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent(${JSON.stringify(name)},{detail:${JSON.stringify(detail)}}));true;`);
  }, [webview]);
  const pause = useCallback(paused => emit(`frameit:${paused || AppState.currentState !== 'active' ? 'pause' : 'resume'}`, null), [emit]);

  useEffect(() => {
    const ads = new AdManager({
      enabled: configuration.enabled === true,
      consent: {
        gatherConsent: () => AdsConsent.gatherConsent(),
        getConsentInfo: () => AdsConsent.getConsentInfo(),
        showPrivacyOptionsForm: () => AdsConsent.showPrivacyOptionsForm(),
        REQUIRED: AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      },
      sdk: { initialize: () => mobileAds().initialize() },
      createInterstitial: () => InterstitialAd.createForAdRequest(interstitialUnitId),
      events: AdEventType,
      onState: setAdState,
      onPause: pause,
    });
    manager.current = ads;
    ads.foreground = AppState.currentState === 'active';
    void ads.initialize();
    const subscription = AppState.addEventListener('change', state => {
      const active = state === 'active';
      ads.foreground = active;
      setForeground(active);
      if (!active) { setCameraActive(false); pause(true); }
      else pause(ads.showing);
    });
    return () => { ads.dispose(); manager.current = null; subscription.remove(); };
  }, [pause]);

  useEffect(() => {
    let cancelled = false;
    // Play knows this app's package and signed install; no FF URL or version is copied.
    InAppUpdates.checkForUpdate().then(info => {
      if (!cancelled && info?.updateAvailable) setUpdate({ available: true, immediate: !info.flexibleAllowed && !!info.immediateAllowed });
    }).catch(() => { /* Offline and sideloaded builds continue without a prompt. */ });
    return () => { cancelled = true; };
  }, []);

  const sync = useCallback(() => {
    const state = { privacyOptionsRequired: adState.privacyOptionsRequired, update };
    webview.current?.injectJavaScript(`window.__frameitNativeState=${JSON.stringify(state)};window.dispatchEvent(new CustomEvent('frameit:native-state',{detail:window.__frameitNativeState}));true;`);
  }, [webview, adState.privacyOptionsRequired, update]);
  useEffect(sync, [sync]);

  useEffect(() => {
    if (!gyroEnabled || !cameraActive || !foreground) return;
    DeviceMotion.setUpdateInterval(33); // 30 Hz bridge traffic; camera smoothing remains at render rate.
    let received = false;
    const timeout = setTimeout(() => {
      if (!received) {
        setGyroEnabled(false);
        emit('frameit:gyro-state', { enabled: false, reason: 'unavailable' });
      }
    }, 5000);
    let subscription;
    try { subscription = DeviceMotion.addListener(sample => {
      const rotation = sample.rotation;
      if (!rotation || ![rotation.alpha, rotation.beta, rotation.gamma].every(Number.isFinite)) return;
      received = true;
      clearTimeout(timeout);
      const degrees = 180 / Math.PI;
      emit('frameit:orientation', {
        alpha: rotation.alpha * degrees, beta: rotation.beta * degrees, gamma: rotation.gamma * degrees,
        screen: sample.orientation,
      });
    }); } catch (error) {
      clearTimeout(timeout);
      setGyroEnabled(false);
      emit('frameit:gyro-state', { enabled: false, reason: 'unavailable' });
      console.warn('[Frame It] Motion sensor:', error);
    }
    return () => { clearTimeout(timeout); subscription?.remove(); };
  }, [gyroEnabled, cameraActive, foreground, emit]);

  const reset = () => {
    gyroRequest.current++;
    setGyroEnabled(false);
    setCameraActive(false);
    setScreen('menu');
    manager.current?.setScreen('menu');
  };

  const handle = message => {
    const ads = manager.current;
    if (message.type === 'screen' && ['menu', 'tutorial', 'album', 'playing', 'results'].includes(message.screen)) {
      setScreen(message.screen);
      ads?.setScreen(message.screen);
      return true;
    }
    if (message.type === 'camera-active') { setCameraActive(message.active === true); return true; }
    if (message.type === 'match-ended') { ads?.matchEnded(); return true; }
    if (message.type === 'privacy-options') { void ads?.refreshConsent(true); return true; }
    if (message.type === 'gyroscope') {
      const request = ++gyroRequest.current;
      if (!message.enabled) { setGyroEnabled(false); emit('frameit:gyro-state', { enabled: false }); return true; }
      (async () => {
        try {
          if (!await DeviceMotion.isAvailableAsync()) throw new Error('unavailable');
          // Android orientation sensors at 30 Hz need no runtime permission.
          // DeviceMotion's Android permission helper asks for physical activity, used by step counting.
          const permission = Platform.OS === 'android' ? { granted: true } : await DeviceMotion.requestPermissionsAsync();
          if (request !== gyroRequest.current) return;
          setGyroEnabled(permission.granted);
          emit('frameit:gyro-state', { enabled: permission.granted, reason: permission.granted ? undefined : 'denied' });
        } catch {
          if (request !== gyroRequest.current) return;
          setGyroEnabled(false);
          emit('frameit:gyro-state', { enabled: false, reason: 'unavailable' });
        }
      })();
      return true;
    }
    if (message.type === 'app-update') {
      if (screen !== 'menu' || !update?.available || updateBusy.current) return true;
      updateBusy.current = true;
      const openStore = async () => {
        try { await Linking.openURL(`market://details?id=${STORE_ID}`); }
        catch { await Linking.openURL(`https://play.google.com/store/apps/details?id=${STORE_ID}`).catch(error => console.warn('[Frame It] Open store:', error)); }
      };
      // User cancellation is handled by Play; only a failure to start opens the listing.
      InAppUpdates.startUpdate(update.immediate).then(started => { if (!started) return openStore(); })
        .catch(openStore).finally(() => { updateBusy.current = false; });
      return true;
    }
    return false;
  };

  return { handle, reset, sync, showingAd: () => manager.current?.showing === true,
    bannerVisible: adState.allowed && foreground && screen === 'menu' };
}
