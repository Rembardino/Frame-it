/** Native SDK lifecycle, kept separate from React so placement/error paths can be verified. */
export class AdManager {
  constructor({ enabled, consent, sdk, createInterstitial, events, onState, onPause, warn = console.warn }) {
    Object.assign(this, { enabled, consent, sdk, createInterstitial, events, onState, onPause, warn });
    this.screen = 'menu';
    this.foreground = true;
    this.allowed = false;
    this.initialized = false;
    this.disposed = false;
    this.showing = false;
    this.matchHandled = false;
    this.ready = false;
    this.ad = null;
    this.unsubscribe = [];
    this.state = { allowed: false, privacyOptionsRequired: false };
  }

  emit(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  async initialize() {
    if (!this.enabled || this.disposed) return;
    await this.refreshConsent(false);
  }

  async refreshConsent(privacy) {
    if (!this.enabled || this.disposed || this.consentBusy) return;
    this.consentBusy = true;
    let info;
    try {
      if (privacy) {
        await this.consent.showPrivacyOptionsForm();
        info = await this.consent.getConsentInfo();
      } else info = await this.consent.gatherConsent();
    } catch (error) {
      this.warn('[Frame It] Ad consent:', error);
      try { info = await this.consent.getConsentInfo(); }
      catch (cachedError) { this.warn('[Frame It] Cached ad consent:', cachedError); }
    } finally { this.consentBusy = false; }
    if (this.disposed) return;
    // Only UMP's own canRequestAds flag permits SDK initialization and ad requests.
    this.allowed = info?.canRequestAds === true;
    this.emit({ privacyOptionsRequired: info?.privacyOptionsRequirementStatus === this.consent.REQUIRED });
    if (!this.allowed) {
      this.clearAd();
      this.emit({ allowed: false });
      return;
    }
    try {
      if (!this.initialized) { await this.sdk.initialize(); this.initialized = true; }
      if (this.disposed) return;
      this.emit({ allowed: this.allowed });
      if (this.screen === 'playing') this.prepare();
    } catch (error) {
      this.allowed = false;
      this.emit({ allowed: false });
      this.warn('[Frame It] Ad SDK:', error);
    }
  }

  setScreen(screen) {
    if (screen === 'playing' && this.screen !== 'playing') {
      this.matchHandled = false;
      this.prepare();
    }
    this.screen = screen;
  }

  prepare() {
    if (!this.allowed || !this.initialized || this.disposed || this.ad || this.showing) return;
    try {
      const ad = this.createInterstitial();
      this.ad = ad;
      this.ready = false;
      this.unsubscribe = [
        ad.addAdEventListener(this.events.LOADED, () => { if (this.ad === ad) this.ready = true; }),
        ad.addAdEventListener(this.events.CLOSED, () => this.finish()),
        ad.addAdEventListener(this.events.ERROR, error => {
          this.warn('[Frame It] Interstitial:', error);
          this.finish();
        }),
      ];
      ad.load();
    } catch (error) {
      this.warn('[Frame It] Interstitial load:', error);
      this.finish();
    }
  }

  /** Exactly one opportunity per completed match. No delayed ad during the next match. */
  matchEnded() {
    if (this.disposed || this.screen !== 'playing' || this.matchHandled) return;
    this.matchHandled = true;
    this.screen = 'results';
    if (!this.allowed || !this.foreground || !this.ad || !this.ready || this.showing) {
      this.clearAd();
      return;
    }
    this.showing = true;
    this.ready = false;
    this.onPause(true);
    try {
      // Load only during a match. Closed/error ads are discarded until the next match.
      Promise.resolve(this.ad.show()).catch(error => {
        this.warn('[Frame It] Interstitial show:', error);
        this.finish();
      });
    } catch (error) {
      this.warn('[Frame It] Interstitial show:', error);
      this.finish();
    }
  }

  finish() {
    const wasShowing = this.showing;
    this.showing = false;
    this.clearAd();
    if (wasShowing && !this.disposed) this.onPause(false);
  }

  clearAd() {
    this.unsubscribe.forEach(remove => remove());
    this.unsubscribe = [];
    this.ad = null;
    this.ready = false;
  }

  dispose() {
    this.disposed = true;
    this.finish();
  }
}
