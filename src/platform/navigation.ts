export type NativeMessage =
  | { type: 'screen'; screen: 'menu' | 'tutorial' | 'album' | 'playing' | 'results' }
  | { type: 'camera-active'; active: boolean }
  | { type: 'gyroscope'; enabled: boolean }
  | { type: 'match-ended' }
  | { type: 'privacy-options' }
  | { type: 'app-update'; immediate: boolean };

export function postNative(message: NativeMessage): boolean {
  const bridge = (globalThis.window as Window & {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  })?.ReactNativeWebView;
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify(message));
  return true;
}

/** The offline native container handles navigation without contacting a website. */
export function nativeMessage(type: 'select-sport' | 'restart' | 'set-language' | 'language-ready', sport?: string, language?: string): boolean {
  const bridge = (window as Window & {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }).ReactNativeWebView;
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify({ type, sport, language }));
  return true;
}

export function restartGame() {
  if (!nativeMessage('restart')) location.reload();
}
