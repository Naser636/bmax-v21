// REAL Replicate provider adapter — implements the ProviderAdapter CONTRACT (provider-adapter.mjs) with an actual
// official-Replicate-API client. Fail-closed by construction:
//   - the token is read from process.env.REPLICATE_API_TOKEN ONLY; it is NEVER accepted via argv, logged, put in a
//     URL, embedded in source, or included in any error/trace/report (all error text is redacted).
//   - token presence ALONE never authorizes a paid call: auth.allowPaidGeneration === true AND
//     auth.confirmedBillingArrears === true are BOTH required (the second is the CTO no-prepayment gate).
//   - every paid call MUST carry an explicit, verified worstCaseCostEur; absent/invalid => refuse (no call).
//   - the worst-case is RESERVED in the persistent ledger BEFORE the HTTP call; settle to actual (<= reserved) after.
//   - dryRun is permanently non-spending: it reserves nothing and issues no network call.
//   - no automatic retries: each attempt is an explicit caller action that re-enters the ledger.
// This file does NOT modify or weaken provider-adapter.mjs (the inactive contract) or the dry-run runner.
const API = 'https://api.replicate.com/v1';
const TOKEN_VAR = 'REPLICATE_API_TOKEN';
// Verified members of replicate.com/collections/try-for-free (first-party, 2026-10-24). A freeTier call is permitted
// ONLY for these models. Free runs are tagged is_free_trial_prediction=true by the provider and cost €0; if a
// freeTier call comes back WITHOUT that tag, a charge occurred (free allowance did not apply) and the orchestrator
// MUST stop. This path never sets confirmedBillingArrears and never bypasses the ledger.
const FREE_TIER_ALLOWLIST = new Set([
  'minimax/video-01', 'black-forest-labs/flux-dev', 'black-forest-labs/flux-1.1-pro', 'black-forest-labs/flux-2-pro',
  'black-forest-labs/flux-kontext-pro', 'google/imagen-4', 'ideogram-ai/ideogram-v3-turbo', 'resemble-ai/chatterbox',
]);

export class ReplicateAdapter {
  // deps.fetchImpl is injectable for tests; defaults to global fetch. deps.ledger is a PersistentLedger.
  constructor({ auth = {}, ledger = null, fetchImpl = null, now = () => 0, sleep = null } = {}) {
    // ctoBoundedPaidRunAuthorized: explicit human authorization for a HARD-CAPPED paid run when billing MODE is
    // unconfirmed but a strict ledger ceiling bounds total spend. It is a DISTINCT, honestly-named gate — it does
    // NOT set/falsify confirmedBillingArrears and does NOT bypass the ledger (the ledger ceiling still enforces).
    this.auth = { allowPaidGeneration: false, confirmedBillingArrears: false, ctoBoundedPaidRunAuthorized: false, ...auth };
    this.ledger = ledger;
    this._fetch = fetchImpl || globalThis.fetch;
    this._now = now;
    this._sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this._idem = new Map(); // idempotencyKey -> terminal result (prevents duplicate paid calls)
    this.wired = true;
  }

  _token() { const t = process.env[TOKEN_VAR]; return t && t.trim() ? t.trim() : null; }
  _redact(s) { const t = this._token(); let out = String(s == null ? '' : s); if (t) out = out.split(t).join('***REDACTED***'); return out; }
  _headers() { return { Authorization: `Bearer ${this._token()}`, 'Content-Type': 'application/json', 'User-Agent': 'odg-film-factory/1.0' }; }

  available() {
    const hasKey = !!this._token();
    // paid calls need: allowPaidGeneration AND (billing mode confirmed arrears OR an explicit CTO bounded-run
    // authorization) AND a credential. The ledger ceiling still bounds total spend regardless.
    const billingOk = this.auth.confirmedBillingArrears === true || this.auth.ctoBoundedPaidRunAuthorized === true;
    const authorized = this.auth.allowPaidGeneration === true && billingOk && hasKey;
    return { authorized, wired: this.wired, hasKey,
      reason: authorized ? 'authorized' :
        (!hasKey ? 'no credential present' :
          !this.auth.allowPaidGeneration ? 'allowPaidGeneration not set' :
          'neither confirmedBillingArrears nor ctoBoundedPaidRunAuthorized set (no human paid-run authorization)') };
  }

  // Core: generate one output. Returns a structured result; NEVER throws the token. Fail-closed on every branch.
  async generate(opts = {}) {
    const { model, version, input = {}, worstCaseCostEur, idempotencyKey = null,
      dryRun = false, timeoutMs = 120000, pollMs = 2000, validate = null, kind = 'output' } = opts;

    // 1) cost-bounding gate — a verified worst-case is mandatory before any paid path
    if (typeof worstCaseCostEur !== 'number' || !(worstCaseCostEur >= 0) || !Number.isFinite(worstCaseCostEur)) {
      return this._blocked(kind, 'COST_UNBOUNDED: a verified numeric worstCaseCostEur is required before any call');
    }
    if (!model || typeof model !== 'string') return this._blocked(kind, 'no model specified');

    // 2) dry-run is permanently non-spending — no reservation, no network
    if (dryRun) {
      return { status: 'DRY_RUN', ok: true, paid: false, file: null, sha256: null, costEur: 0,
        plannedReservationEur: worstCaseCostEur, note: 'DRY-RUN: no reservation, no network call, €0' };
    }

    // 3) authorization gate — token presence alone is NOT sufficient
    const freeTier = opts.freeTier === true;
    if (freeTier) {
      // free-tier path: explicit allowFreeTier + model on the verified try-for-free allowlist. Does NOT touch the
      // paid guard and does NOT set confirmedBillingArrears. The run must come back is_free_trial_prediction=true.
      const okFree = this.auth.allowFreeTier === true && FREE_TIER_ALLOWLIST.has(model) && !!this._token();
      if (!okFree) return this._blocked(kind, `NOT_AUTHORIZED(freeTier): ${!this._token() ? 'no credential' : this.auth.allowFreeTier !== true ? 'allowFreeTier not set' : 'model not on verified try-for-free allowlist'}`);
    } else {
      const av = this.available();
      if (!av.authorized) return this._blocked(kind, `NOT_AUTHORIZED: ${av.reason}`);
    }

    // 4) idempotency — never issue a duplicate paid call for the same key
    if (idempotencyKey && this._idem.has(idempotencyKey)) {
      return { ...this._idem.get(idempotencyKey), deduped: true };
    }

    // 5) ledger gate + RESERVE worst-case BEFORE the call (fail-closed; counts one global attempt)
    if (!this.ledger) return this._blocked(kind, 'no ledger wired — refusing to spend without accounting');
    let reservationId;
    try { reservationId = this.ledger.reserve(worstCaseCostEur, `${kind}:${model}`); }
    catch (e) { return this._blocked(kind, `LEDGER_REFUSED: ${this._redact(e.message)}`); }

    // 6) issue the call, poll to terminal (or timeout->cancel). Pre-billing failures release (€0); a post-creation
    //    timeout/interruption leaves billing UNKNOWN => we KEEP the reservation and flag INDETERMINATE (cap-safe).
    let predictionCreated = false;
    let createdPredictionId = null;
    try {
      const prediction = await this._createPrediction({ model, version, input, timeoutMs });
      predictionCreated = true;
      createdPredictionId = prediction?.id || null;
      const terminal = await this._poll(prediction, { timeoutMs, pollMs });
      if (terminal.status !== 'succeeded') {
        this.ledger.release(reservationId);
        return { status: 'FAILED', ok: false, paid: false, file: null, sha256: null, costEur: 0,
          providerStatus: terminal.status, reason: this._redact(terminal.error || `prediction ${terminal.status}`),
          ledger: this.ledger.snapshot() };
      }
      // 7) output validation — a succeeded prediction with no/invalid output is NOT usable
      const outUrls = this._extractOutputUrls(terminal.output);
      if (!outUrls.length || (validate && !validate(terminal.output))) {
        this.ledger.release(reservationId);
        return { status: 'INVALID_OUTPUT', ok: false, paid: false, file: null, sha256: null, costEur: 0,
          reason: 'succeeded but output missing/invalid', ledger: this.ledger.snapshot() };
      }
      // 8) settle at the reserved worst-case (Replicate API does not return per-call price; booking worst-case can
      //    never UNDER-count real spend, preserving the cumulative-cap guarantee). Actual files are fetched by the
      //    orchestrator, which records path+sha256+measured duration.
      // A freeTier run that comes back is_free_trial_prediction=true cost €0 (settle at 0); otherwise a charge
      // occurred and we settle at the reserved worst-case AND flag it so the orchestrator stops immediately.
      const isFreeTrial = terminal.is_free_trial_prediction === true;
      const actualEur = (freeTier && isFreeTrial) ? 0 : worstCaseCostEur;
      const ledgerAfter = this.ledger.settle(reservationId, actualEur);
      const result = { status: 'SUCCEEDED', ok: true, paid: actualEur > 0, costEur: actualEur,
        freeTrial: isFreeTrial, unexpectedCharge: freeTier && !isFreeTrial,
        outputUrls: outUrls, predictionId: terminal.id, metrics: terminal.metrics || null,
        file: null, sha256: null, ledger: ledgerAfter,
        note: freeTier
          ? (isFreeTrial ? 'free-trial run (is_free_trial_prediction=true) — €0' : 'WARNING: freeTier call was NOT free-tagged — a real charge occurred; STOP further calls')
          : 'cost booked at verified worst-case (provider returns no per-call price); orchestrator downloads + hashes files' };
      if (idempotencyKey) this._idem.set(idempotencyKey, result);
      return result;
    } catch (e) {
      const msg = this._redact(e && e.message);
      // pre-billing-safe = a definitive HTTP rejection BEFORE a prediction was created => no charge => release.
      const preBillingSafe = !predictionCreated && /AUTH_FAILED|PAYMENT_REQUIRED|PROVIDER_ERROR|MALFORMED_RESPONSE/.test((e && e.message) || '');
      if (preBillingSafe) {
        this.ledger.release(reservationId);
        return { status: 'ERROR', ok: false, paid: false, file: null, sha256: null, costEur: 0, reason: msg, ledger: this.ledger.snapshot() };
      }
      // INDETERMINATE billing: timeout / network / abort (esp. after the prediction was created). Do NOT release —
      // keeping the worst-case reserved preserves the cap (a possibly-charged in-flight call cannot be double-spent).
      // The orchestrator MUST halt; a human reconciles against the provider before any resume.
      return { status: 'INDETERMINATE_BILLING', ok: false, paid: false, file: null, sha256: null, costEur: 0,
        indeterminateBilling: true, predictionCreated, predictionId: createdPredictionId, reason: msg, ledger: this.ledger.snapshot(),
        note: 'billing status unknown (timeout/interruption). Reservation KEPT (not released) to preserve the cap. HALT and reconcile the predictionId read-only (GET /predictions/{id}) before any resume.' };
    }
  }

  async _createPrediction({ model, version, input, timeoutMs }) {
    // token travels only in the Authorization header; model/version only in the URL/body (never the token)
    const url = version ? `${API}/predictions` : `${API}/models/${model}/predictions`;
    const body = version ? JSON.stringify({ version, input }) : JSON.stringify({ input });
    const r = await this._fetch(url, { method: 'POST', headers: this._headers(), body, signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    if (r.status === 401 || r.status === 403) throw new Error('AUTH_FAILED: credential rejected by provider');
    if (r.status === 402) throw new Error('PAYMENT_REQUIRED: billing not set up / prepaid credit required — STOP');
    if (!r.ok) throw new Error(`PROVIDER_ERROR ${r.status}: ${this._redact(text).slice(0, 200)}`);
    let p; try { p = JSON.parse(text); } catch { throw new Error('MALFORMED_RESPONSE: non-JSON prediction body'); }
    if (!p || !p.id) throw new Error('MALFORMED_RESPONSE: prediction missing id');
    return p;
  }

  async _poll(prediction, { timeoutMs, pollMs }) {
    const deadline = this._now() + timeoutMs;
    let p = prediction;
    while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
      if (this._now() >= deadline) { await this._cancel(p.id).catch(() => {}); throw new Error('TIMEOUT: prediction exceeded deadline — cancelled'); }
      await this._sleep(pollMs);
      const r = await this._fetch(`${API}/predictions/${p.id}`, { headers: this._headers(), signal: AbortSignal.timeout(timeoutMs) });
      const text = await r.text();
      if (!r.ok) throw new Error(`PROVIDER_ERROR ${r.status} (poll): ${this._redact(text).slice(0, 160)}`);
      try { p = JSON.parse(text); } catch { throw new Error('MALFORMED_RESPONSE: non-JSON poll body'); }
    }
    return p;
  }

  async _cancel(id) {
    if (!id) return;
    await this._fetch(`${API}/predictions/${id}/cancel`, { method: 'POST', headers: this._headers() });
  }

  _extractOutputUrls(output) {
    if (!output) return [];
    const urls = [];
    const walk = (v) => { if (typeof v === 'string' && /^https?:\/\//.test(v)) urls.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(output);
    return urls;
  }

  _blocked(kind, reason) {
    return { status: 'BLOCKED', ok: false, paid: false, file: null, sha256: null, costEur: 0, kind, reason: this._redact(reason) };
  }

  // Contract methods delegate to generate() with a kind tag.
  generateVideo(o = {}) { return this.generate({ ...o, kind: 'video' }); }
  generateImage(o = {}) { return this.generate({ ...o, kind: 'image' }); }
  generateVoice(o = {}) { return this.generate({ ...o, kind: 'voice' }); }
  generateMusic(o = {}) { return this.generate({ ...o, kind: 'music' }); }
}
