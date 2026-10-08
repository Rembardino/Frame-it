import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import gameHtml, { NATIVE_TEXT } from './generated/game';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { bannerUnitId, useNativeServices } from './services/useNativeServices';

const BASE_URL = 'https://frameit.local/';
const SPORTS = ['calcio', 'basket', 'boxe', 'tennis', 'pallavolo'];
const LANGUAGES = ['en', 'it', 'es', 'fr', 'de'];

function Game() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const webview = useRef(null);
  const services = useNativeServices(webview);
  const [sport, setSport] = useState('calcio');
  // No initial URL language: the WebView can restore its saved choice on cold launch.
  const [language, setLanguage] = useState(null);
  const [uiLanguage, setUiLanguage] = useState('en');
  const [session, setSession] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const source = useMemo(() => ({
    // A stable HTTPS base gives localStorage the same origin across all sports.
    // The complete game is inline; this is NOT a request to an online website.
    baseUrl: BASE_URL,
    html: gameHtml.replace('<head>', () => `<head><script>history.replaceState(null,'','?sport=${sport}${language ? '&lang=' + language : ''}');</script>`),
  }), [sport, language]);

  useEffect(() => {
    const immersive = () => NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    immersive();
    const subscription = AppState.addEventListener('change', state => {
      const active = state === 'active';
      if (active) immersive();
    });
    // Let Android's Back button leave the app, not navigate an inline document.
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => { subscription.remove(); back.remove(); };
  }, []);

  const restart = (nextSport = sport) => {
    if (services.showingAd()) return;
    services.reset();
    setError(null);
    setLoading(true);
    setSport(nextSport);
    setSession(current => current + 1);
  };

  const onMessage = ({ nativeEvent }) => {
    try {
      const message = JSON.parse(nativeEvent.data);
      if (services.handle(message)) return;
      if (message.type === 'select-sport' && SPORTS.includes(message.sport)) restart(message.sport);
      else if (message.type === 'restart') restart();
      else if (message.type === 'language-ready' && LANGUAGES.includes(message.language)) setUiLanguage(message.language);
      else if (message.type === 'set-language' && LANGUAGES.includes(message.language)) {
        setLanguage(message.language);
        setUiLanguage(message.language);
        restart();
      }
      else if (message.type === 'game-error') {
        setLoading(false);
        setError('Impossibile avviare il gioco. Verifica che Android System WebView sia aggiornato e riprova.');
      }
    } catch { /* Ignore malformed messages; the container accepts only known actions. */ }
  };

  return (
    <View style={[styles.container, { paddingLeft: insets.left, paddingRight: insets.right, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar hidden />
      {!error && <WebView
        key={session}
        ref={webview}
        source={source}
        style={styles.webview}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank' || url === BASE_URL || url.startsWith(BASE_URL + '?')}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        allowFileAccess={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        overScrollMode="never"
        textZoom={100}
        onMessage={onMessage}
        onLoadEnd={() => {
          setLoading(false);
          services.sync();
          const active = AppState.currentState === 'active' && !services.showingAd();
          webview.current?.injectJavaScript(`window.dispatchEvent(new Event('frameit:${active ? 'resume' : 'pause'}'));true;`);
        }}
        onError={() => { setLoading(false); setError('Impossibile caricare il gioco. Tocca Riprova.'); }}
        onRenderProcessGone={() => { setLoading(false); setError('Il gioco è stato chiuso da Android. Tocca Riprova.'); }}
      />}
      {!loading && !error && services.bannerVisible && <View style={styles.banner}><BannerAd
        unitId={bannerUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={failure => console.warn('[Frame It] Banner:', failure)}
      /></View>}
      {loading && !error && <View style={styles.overlay}><ActivityIndicator size="large" color="#ffd23f" /><Text style={styles.text}>FRAME IT</Text></View>}
      {error && <View style={styles.overlay}><Text style={styles.text}>{NATIVE_TEXT[uiLanguage][error] ?? error}</Text><Pressable style={styles.button} onPress={() => restart()}><Text style={styles.buttonText}>{NATIVE_TEXT[uiLanguage]['Riprova']}</Text></Pressable></View>}
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><Game /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07112b' },
  webview: { flex: 1, backgroundColor: '#07112b' },
  banner: { alignItems: 'center', backgroundColor: '#07112b' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#07112b', padding: 32, gap: 20 },
  text: { color: '#ecf2fa', fontSize: 20, textAlign: 'center' },
  button: { backgroundColor: '#ffd23f', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  buttonText: { color: '#07112b', fontSize: 18, fontWeight: 'bold' },
});
