// INACTIVE provider adapter — CONTRACT ONLY. Defines the interface a real media provider would implement, but
// performs NO network call, uses NO API key, and generates NO media. Every capability returns an explicit BLOCKED
// state until gate `12` authorization + keys are supplied AND a real adapter is wired. This file intentionally
// contains no fetch/http/exec/import of any network or child-process API — it CANNOT reach a provider.
export const CONTRACT = {
  name: 'ProviderAdapter',
  methods: ['available', 'generateVideo', 'generateImage', 'generateVoice', 'generateMusic'],
  note: 'Interface/contract for a future real adapter. Inactive here by design.',
};

// The inactive adapter: constructed with an auth object; refuses everything unless explicitly authorized AND wired.
export class InactiveProviderAdapter {
  constructor(auth = {}) { this.auth = auth; this.wired = false; } // wired=false ⇒ no real implementation attached
  _blocked(method) {
    return { status: 'BLOCKED', ok: false, media: null, file: null, sha256: null,
      reason: `EXTERNAL_SERVICE_REQUIRED: ${method} — provider adapter is INACTIVE (no real implementation wired; gate 12 ungranted). No network call, no key used, no media produced.` };
  }
  available() {
    const hasKey = this.auth && this.auth.providerKeys && Object.keys(this.auth.providerKeys).length > 0;
    return { authorized: !!(this.auth?.allowPaidGeneration && hasKey), wired: this.wired, usable: false,
      reason: this.wired ? 'authorized-but-not-dry-safe' : 'no real adapter wired (inactive by design)' };
  }
  generateVideo() { return this._blocked('generateVideo'); }
  generateImage() { return this._blocked('generateImage'); }
  generateVoice() { return this._blocked('generateVoice'); }
  generateMusic() { return this._blocked('generateMusic'); }
}
