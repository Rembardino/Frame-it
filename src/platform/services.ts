import { postNative } from './navigation';

export interface NativeState {
  privacyOptionsRequired: boolean;
  update: { available: boolean; immediate: boolean } | null;
}

/** Store responses can arrive before or after the offline document loads. */
export function bindNativeServices() {
  const update = document.getElementById('app-update')!;
  const privacy = document.getElementById('privacy-options')!;
  let current: NativeState['update'] = null;
  let dismissed = false;
  const apply = (state?: NativeState) => {
    if (!state) return;
    current = state.update;
    update.classList.toggle('hidden', dismissed || !current?.available);
    privacy.classList.toggle('hidden', !state.privacyOptionsRequired);
  };
  addEventListener('frameit:native-state', event => apply((event as CustomEvent<NativeState>).detail));
  apply((window as Window & { __frameitNativeState?: NativeState }).__frameitNativeState);
  document.getElementById('update-now')!.addEventListener('click', () => {
    if (current?.available) postNative({ type: 'app-update', immediate: current.immediate });
  });
  document.getElementById('update-later')!.addEventListener('click', () => {
    dismissed = true;
    update.classList.add('hidden');
  });
  privacy.addEventListener('click', () => postNative({ type: 'privacy-options' }));
}
