import { Euler, Quaternion, Vector3 } from 'three';
import type { CameraController } from './cameraController';
import { postNative } from '../platform/navigation';
import { t } from '../i18n';

export interface OrientationSample { alpha: number; beta: number; gamma: number; screen: number }
const DEG = Math.PI / 180;
const correction = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

/** Device orientation is in the portrait device frame, regardless of screen rotation. */
export function orientationQuaternion(sample: OrientationSample): Quaternion {
  return new Quaternion().setFromEuler(new Euler(sample.beta * DEG, sample.alpha * DEG, -sample.gamma * DEG, 'YXZ'))
    .multiply(correction)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -sample.screen * DEG));
}

export class GyroscopeController {
  enabled = false;
  private active = false;
  private pending = false;
  private reference: Quaternion | null = null;
  private previous: { yaw: number; pitch: number } | null = null;
  private screenAngle: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly buttons = ['gyro-menu', 'gyro-toggle'].map(id => document.getElementById(id)!);
  private readonly recenter = document.getElementById('gyro-center')!;
  private readonly status = document.getElementById('gyro-status')!;
  private readonly feedback = document.getElementById('gyro-feedback')!;

  constructor(private camera: CameraController) {
    this.buttons.forEach(button => button.addEventListener('click', () => { void this.toggle(); }));
    this.recenter.addEventListener('click', () => this.center());
    addEventListener('deviceorientation', event => {
      if (!this.enabled && !this.pending) return;
      if (event.alpha === null || event.beta === null || event.gamma === null) return;
      if (this.pending) this.setState(true);
      this.sample({ alpha: event.alpha, beta: event.beta, gamma: event.gamma, screen: screen.orientation?.angle ?? Number((window as Window & { orientation?: number }).orientation ?? 0) });
    });
    addEventListener('frameit:orientation', event => this.sample((event as CustomEvent<OrientationSample>).detail));
    addEventListener('frameit:gyro-state', event => {
      const state = (event as CustomEvent<{ enabled: boolean; reason?: string }>).detail;
      this.setState(state.enabled, state.reason);
    });
    this.paint();
  }

  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    this.center();
    postNative({ type: 'camera-active', active });
  }

  center() {
    this.reference = null;
    this.previous = null;
  }

  private async toggle() {
    if (this.pending) return;
    if (this.enabled) {
      postNative({ type: 'gyroscope', enabled: false });
      this.setState(false);
      return;
    }
    this.pending = true;
    this.status.textContent = t('Attivazione giroscopio…');
    this.paint();
    // A missing native response or a browser without sensor events must remain usable.
    this.timer = setTimeout(() => {
      postNative({ type: 'gyroscope', enabled: false });
      this.setState(false, 'unavailable');
    }, 6000);
    if (postNative({ type: 'gyroscope', enabled: true })) return;
    const api = (window as Window & {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
    }).DeviceOrientationEvent;
    if (!api || !window.isSecureContext) return this.setState(false, 'unavailable');
    try {
      if (api.requestPermission && await api.requestPermission() !== 'granted') this.setState(false, 'denied');
    } catch { this.setState(false, 'denied'); }
  }

  private setState(enabled: boolean, reason?: string) {
    clearTimeout(this.timer);
    this.pending = false;
    this.enabled = enabled;
    this.center();
    this.status.textContent = t(enabled ? 'Ruota il telefono per inquadrare. Ricentra quando cambi posizione.'
      : reason === 'denied' ? 'Permesso negato. Puoi continuare a trascinare per inquadrare.'
      : reason ? 'Giroscopio non disponibile. Puoi continuare a trascinare per inquadrare.'
      : 'Giroscopio opzionale: attivalo per muovere la camera con il telefono.');
    if (document.getElementById('start')!.classList.contains('hidden')) {
      this.feedback.textContent = this.status.textContent;
      this.feedback.classList.remove('hidden');
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = setTimeout(() => this.feedback.classList.add('hidden'), 4500);
    }
    this.paint();
  }

  private paint() {
    this.buttons.forEach(button => {
      button.textContent = t(this.enabled ? 'Giroscopio: ON' : 'Giroscopio: OFF');
      button.setAttribute('aria-pressed', String(this.enabled));
      (button as HTMLButtonElement).disabled = this.pending;
    });
    this.recenter.classList.toggle('hidden', !this.enabled);
  }

  private sample(sample: OrientationSample) {
    if (!this.enabled || !this.active || !this.camera.inputsEnabled || !sample
      || ![sample.alpha, sample.beta, sample.gamma, sample.screen].every(Number.isFinite)) return;
    if (this.screenAngle !== sample.screen) {
      this.screenAngle = sample.screen;
      this.center();
    }
    const rotation = orientationQuaternion(sample);
    if (!this.reference) this.reference = rotation.clone().invert();
    const direction = new Vector3(0, 0, -1).applyQuaternion(this.reference.clone().multiply(rotation));
    const yaw = Math.atan2(direction.x, -direction.z) / DEG;
    const pitch = Math.asin(Math.max(-1, Math.min(1, direction.y))) / DEG;
    if (this.previous) {
      const dy = ((yaw - this.previous.yaw + 540) % 360) - 180;
      const dp = pitch - this.previous.pitch;
      // Rebase on sensor discontinuities rather than jumping across the field.
      if (Math.abs(dy) < 35 && Math.abs(dp) < 35) this.camera.moveBy(dy, dp);
    }
    this.previous = { yaw, pitch };
  }
}
