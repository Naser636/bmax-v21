// Focused tests for the REAL Replicate adapter. Uses an INJECTED fetch mock and a SENTINEL token — never a real
// secret, never the network. Covers: auth-fail, provider error, timeout, idempotency (duplicate request),
// malformed response, cost reservation ordering, bounded retries (no ledger bypass), cancellation, output
// validation, secret redaction, dry-run non-spending, and token-presence-is-not-authorization.
import { ReplicateAdapter } from './replicate-adapter.mjs';
import { PersistentLedger } from './persistent-ledger.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const SENTINEL = 'r8_SENTINEL_fake_token_for_tests_ONLY_0000'; // 40 chars; NOT a real secret
process.env.REPLICATE_API_TOKEN = SENTINEL;

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; fails.push(name); console.log('FAIL', name); } };

let _n = 0;
function freshLedger(ceiling = 250, maxAttempts = 8) {
  const p = join(tmpdir(), `odg-ledger-test-${process.pid}-${_n++}.json`);
  try { rmSync(p, { force: true }); } catch {}
  return new PersistentLedger(ceiling, p, { maxAttempts });
}

// A scriptable fetch: handler(url, init) -> { status, body } ; body object is JSON-stringified.
function mkFetch(handler) {
  return async (url, init = {}) => {
    const { status = 200, body = {}, raw = null, throwErr = null } = handler(String(url), init) || {};
    if (throwErr) throw throwErr;
    const text = raw != null ? raw : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text, headers: new Map() };
  };
}
// fake timers
const mkClock = () => { let t = 0; return { now: () => t, advance: (ms) => { t += ms; }, sleep: async function () { t += 1; } }; };

async function run() {
  // 1) token presence alone does NOT authorize
  {
    const a = new ReplicateAdapter({ auth: {}, ledger: freshLedger(), fetchImpl: mkFetch(() => ({ status: 200, body: {} })) });
    ok('token-presence-not-authorization', a.available().authorized === false && a.available().hasKey === true);
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('unauthorized-call-blocked-no-spend', r.status === 'BLOCKED' && r.paid === false && r.costEur === 0);
  }

  // 2) authorized requires BOTH flags (the no-prepayment gate)
  {
    const a1 = new ReplicateAdapter({ auth: { allowPaidGeneration: true }, ledger: freshLedger() });
    ok('allowPaid-alone-insufficient', a1.available().authorized === false);
    const a2 = new ReplicateAdapter({ auth: { allowPaidGeneration: true, confirmedBillingArrears: true }, ledger: freshLedger() });
    ok('both-flags-authorize', a2.available().authorized === true);
  }

  const auth = { allowPaidGeneration: true, confirmedBillingArrears: true };

  // 3) cost-unbounded refusal (no worstCaseCostEur)
  {
    const a = new ReplicateAdapter({ auth, ledger: freshLedger() });
    const r = await a.generateVideo({ model: 'x/y', input: {} });
    ok('cost-unbounded-refused', r.status === 'BLOCKED' && /COST_UNBOUNDED/.test(r.reason) && r.paid === false);
  }

  // 4) dry-run never spends, never calls network
  {
    let called = false;
    const a = new ReplicateAdapter({ auth, ledger: freshLedger(), fetchImpl: mkFetch(() => { called = true; return { status: 200, body: {} }; }) });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.02, dryRun: true });
    ok('dry-run-non-spending', r.status === 'DRY_RUN' && r.paid === false && r.costEur === 0 && called === false);
    ok('dry-run-no-reservation', a.ledger.snapshot().committed === 0 && a.ledger.snapshot().attempts === 0);
  }

  // 5) happy path: reserve-before-call, settle, output extracted
  {
    const clock = mkClock();
    const ledger = freshLedger();
    const steps = [];
    const fetchImpl = mkFetch((url, init) => {
      steps.push(`${init.method || 'GET'} ${url.replace(/^https:\/\/api\.replicate\.com\/v1/, '')}`);
      if (/\/predictions$/.test(url) && init.method === 'POST') return { status: 201, body: { id: 'pred1', status: 'processing' } };
      if (/\/predictions\/pred1$/.test(url)) return { status: 200, body: { id: 'pred1', status: 'succeeded', output: ['https://cdn/out.png'], metrics: { predict_time: 1.2 } } };
      return { status: 200, body: {} };
    });
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl, now: clock.now, sleep: clock.sleep });
    const r = await a.generate({ model: 'black-forest-labs/flux-schnell', input: { prompt: 'x' }, worstCaseCostEur: 0.01, kind: 'image' });
    ok('happy-succeeded', r.status === 'SUCCEEDED' && r.ok === true && r.paid === true);
    ok('happy-output-url', r.outputUrls && r.outputUrls[0] === 'https://cdn/out.png');
    ok('happy-settled-spend', Math.abs(r.ledger.spent - 0.01) < 1e-9 && r.ledger.committed === 0);
    ok('happy-attempt-counted', r.ledger.attempts === 1);
    ok('reserve-before-call-order', steps[0].startsWith('POST')); // the POST happened only after a reservation existed
  }

  // 6) auth failure (401) -> release reservation, €0
  {
    const ledger = freshLedger();
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl: mkFetch(() => ({ status: 401, body: { detail: 'Unauthorized' } })) });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('auth-fail-reported', r.status === 'ERROR' && /AUTH_FAILED/.test(r.reason));
    ok('auth-fail-no-spend', ledger.snapshot().spent === 0 && ledger.snapshot().committed === 0);
    ok('auth-fail-attempt-still-counted', ledger.snapshot().attempts === 1); // a real call was issued; it counts
  }

  // 7) payment-required (402) -> surfaced distinctly, no spend
  {
    const ledger = freshLedger();
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl: mkFetch(() => ({ status: 402, body: { detail: 'payment' } })) });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('payment-required-surfaced', /PAYMENT_REQUIRED/.test(r.reason) && ledger.snapshot().spent === 0);
  }

  // 8) provider error (500) -> release, €0
  {
    const ledger = freshLedger();
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl: mkFetch(() => ({ status: 500, body: { detail: 'boom' } })) });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('provider-500-error', r.status === 'ERROR' && /PROVIDER_ERROR 500/.test(r.reason) && ledger.snapshot().spent === 0);
  }

  // 9) malformed response -> error, no spend
  {
    const ledger = freshLedger();
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl: mkFetch(() => ({ status: 201, raw: 'not-json<html>' })) });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('malformed-response', /MALFORMED_RESPONSE/.test(r.reason) && ledger.snapshot().spent === 0);
  }

  // 10) timeout -> cancel issued, release, €0
  {
    const clock = mkClock();
    const ledger = freshLedger();
    let cancelHit = false;
    const fetchImpl = mkFetch((url, init) => {
      if (/\/predictions$/.test(url) && init.method === 'POST') return { status: 201, body: { id: 'p9', status: 'processing' } };
      if (/\/cancel$/.test(url)) { cancelHit = true; return { status: 200, body: {} }; }
      // always still processing -> force timeout
      clock.advance(60000);
      return { status: 200, body: { id: 'p9', status: 'processing' } };
    });
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl, now: clock.now, sleep: clock.sleep });
    const r = await a.generate({ model: 'x/y', input: {}, worstCaseCostEur: 0.01, timeoutMs: 1000, pollMs: 10 });
    ok('timeout-indeterminate-after-create', r.status === 'INDETERMINATE_BILLING' && r.indeterminateBilling === true && r.predictionCreated === true);
    ok('timeout-cancelled', cancelHit === true);
    // CAP-SAFE: a post-creation timeout KEEPS the reservation (billing unknown), so budget is not freed for others.
    ok('timeout-reservation-KEPT-not-released', ledger.snapshot().spent === 0 && Math.abs(ledger.snapshot().committed - 0.01) < 1e-9);
  }
  // 10b) pre-billing create failure (402 BEFORE a prediction exists) -> RELEASE (definitively no charge)
  {
    const ledger = freshLedger();
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl: mkFetch(() => ({ status: 402, body: { detail: 'payment' } })) });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('pre-billing-402-released', /PAYMENT_REQUIRED/.test(r.reason) && ledger.snapshot().committed === 0 && ledger.snapshot().spent === 0);
  }

  // 11) idempotency: same key never issues a second paid call
  {
    const ledger = freshLedger();
    let posts = 0;
    const fetchImpl = mkFetch((url, init) => {
      if (/\/predictions$/.test(url) && init.method === 'POST') { posts++; return { status: 201, body: { id: 'pi', status: 'succeeded', output: ['https://cdn/a.png'] } }; }
      return { status: 200, body: { id: 'pi', status: 'succeeded', output: ['https://cdn/a.png'] } };
    });
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl });
    const r1 = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01, idempotencyKey: 'K1' });
    const r2 = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01, idempotencyKey: 'K1' });
    ok('idempotency-single-post', posts === 1 && r2.deduped === true);
    ok('idempotency-single-spend', Math.abs(ledger.snapshot().spent - 0.01) < 1e-9 && ledger.snapshot().attempts === 1);
  }

  // 12) output validation: succeeded but no output url -> INVALID_OUTPUT, release, €0
  {
    const ledger = freshLedger();
    const fetchImpl = mkFetch((url, init) => {
      if (init.method === 'POST') return { status: 201, body: { id: 'pv', status: 'succeeded', output: null } };
      return { status: 200, body: { id: 'pv', status: 'succeeded', output: null } };
    });
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('invalid-output', r.status === 'INVALID_OUTPUT' && ledger.snapshot().spent === 0);
  }

  // 13) secret redaction: provider error text containing the token is redacted everywhere
  {
    const ledger = freshLedger();
    const fetchImpl = mkFetch(() => ({ status: 500, raw: `error leaked ${SENTINEL} in body` }));
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('secret-redacted', !JSON.stringify(r).includes(SENTINEL) && /REDACTED/.test(r.reason));
  }

  // 14) ledger cap refusal: a worst-case that would cross €250 is refused WITHOUT a call
  {
    const ledger = freshLedger(0.05); // tiny ceiling
    let posted = false;
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl: mkFetch((u, i) => { if (i.method === 'POST') posted = true; return { status: 201, body: { id: 'x', status: 'succeeded', output: ['https://c/x'] } }; }) });
    const r = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 1.0 });
    ok('ledger-cap-refusal', r.status === 'BLOCKED' && /LEDGER_REFUSED/.test(r.reason) && posted === false);
  }

  // 15) bounded retries never bypass the ledger / global attempt cap
  {
    const ledger = freshLedger(250, 3); // cap attempts at 3 for the test
    const fetchImpl = mkFetch((url, init) => {
      if (init.method === 'POST') return { status: 201, body: { id: 'pr', status: 'failed', error: 'bad' } };
      return { status: 200, body: { id: 'pr', status: 'failed', error: 'bad' } };
    });
    const a = new ReplicateAdapter({ auth, ledger, fetchImpl });
    let last;
    for (let i = 0; i < 5; i++) last = await a.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 });
    ok('retries-capped-at-max', ledger.snapshot().attempts === 3); // 4th/5th refused by attempt cap
    ok('retries-capped-reason', /ATTEMPT CAP|LEDGER_REFUSED/.test(last.reason));
    ok('failed-calls-zero-spend', ledger.snapshot().spent === 0);
  }

  // 16) persistence: reservations survive a restart (crash-safety)
  {
    const p = join(tmpdir(), `odg-ledger-persist-${process.pid}.json`);
    try { rmSync(p, { force: true }); } catch {}
    const l1 = new PersistentLedger(250, p, { maxAttempts: 8 });
    l1.reserve(10, 'r'); l1.settle(l1.reserve(5, 'r2'), 3);
    const l2 = new PersistentLedger(250, p, { maxAttempts: 8 }); // reload
    ok('persist-spent', Math.abs(l2.snapshot().spent - 3) < 1e-9);
    ok('persist-outstanding', l2.snapshot().committed === 10 && l2.snapshot().outstandingReservations === 1);
    ok('persist-attempts', l2.snapshot().attempts === 2);
    try { rmSync(p, { force: true }); } catch {}
  }

  // 17) free-tier path: authorized only with allowFreeTier + allowlisted model; tagged-free => €0; not-tagged => charge+flag
  {
    const mkOk = (free) => mkFetch((url, init) => {
      if (init.method === 'POST') return { status: 201, body: { id: 'pf', status: 'succeeded', output: ['https://cdn/f.png'], is_free_trial_prediction: free } };
      return { status: 200, body: { id: 'pf', status: 'succeeded', output: ['https://cdn/f.png'], is_free_trial_prediction: free } };
    });
    // not authorized without allowFreeTier
    const aNo = new ReplicateAdapter({ auth: {}, ledger: freshLedger(), fetchImpl: mkOk(true) });
    const rNo = await aNo.generateImage({ model: 'black-forest-labs/flux-dev', input: {}, worstCaseCostEur: 0.023, freeTier: true });
    ok('freetier-needs-allow', rNo.status === 'BLOCKED' && /allowFreeTier not set/.test(rNo.reason));
    // non-allowlisted model blocked even with allowFreeTier
    const aBad = new ReplicateAdapter({ auth: { allowFreeTier: true }, ledger: freshLedger(), fetchImpl: mkOk(true) });
    const rBad = await aBad.generateImage({ model: 'some/random-paid-model', input: {}, worstCaseCostEur: 0.023, freeTier: true });
    ok('freetier-allowlist-enforced', rBad.status === 'BLOCKED' && /allowlist/.test(rBad.reason));
    // authorized + tagged free => €0, paid=false
    const lf = freshLedger();
    const aFree = new ReplicateAdapter({ auth: { allowFreeTier: true }, ledger: lf, fetchImpl: mkOk(true) });
    const rFree = await aFree.generateImage({ model: 'black-forest-labs/flux-dev', input: {}, worstCaseCostEur: 0.023, freeTier: true });
    ok('freetier-tagged-free-zero-cost', rFree.status === 'SUCCEEDED' && rFree.freeTrial === true && rFree.costEur === 0 && rFree.paid === false && lf.snapshot().spent === 0);
    ok('freetier-attempt-counted', lf.snapshot().attempts === 1);
    // authorized + NOT tagged => charge booked at worst-case + unexpectedCharge flag
    const lc = freshLedger();
    const aChg = new ReplicateAdapter({ auth: { allowFreeTier: true }, ledger: lc, fetchImpl: mkOk(false) });
    const rChg = await aChg.generateImage({ model: 'black-forest-labs/flux-dev', input: {}, worstCaseCostEur: 0.05, freeTier: true });
    ok('freetier-untagged-charge-flagged', rChg.status === 'SUCCEEDED' && rChg.unexpectedCharge === true && Math.abs(lc.snapshot().spent - 0.05) < 1e-9);
    // free-tier path does NOT grant the paid path (confirmedBillingArrears still required for non-free calls)
    const aMix = new ReplicateAdapter({ auth: { allowFreeTier: true }, ledger: freshLedger(), fetchImpl: mkOk(true) });
    const rMix = await aMix.generateImage({ model: 'x/y', input: {}, worstCaseCostEur: 0.01 }); // no freeTier flag
    ok('freetier-does-not-grant-paid', rMix.status === 'BLOCKED' && /NOT_AUTHORIZED/.test(rMix.reason));
  }

  // 18) ctoBoundedPaidRunAuthorized is a valid paid authorization (distinct from confirmedBillingArrears)
  {
    const a1 = new ReplicateAdapter({ auth: { allowPaidGeneration: true, ctoBoundedPaidRunAuthorized: true }, ledger: freshLedger() });
    ok('cto-bounded-authorizes-paid', a1.available().authorized === true);
    const a2 = new ReplicateAdapter({ auth: { ctoBoundedPaidRunAuthorized: true }, ledger: freshLedger() });
    ok('cto-bounded-needs-allowPaid', a2.available().authorized === false); // allowPaidGeneration still required
    const a3 = new ReplicateAdapter({ auth: { allowPaidGeneration: true }, ledger: freshLedger() });
    ok('neither-billing-flag-blocks', a3.available().authorized === false && /neither confirmedBillingArrears/.test(a3.available().reason));
    // confirmedBillingArrears remains an independent valid path (unchanged)
    const a4 = new ReplicateAdapter({ auth: { allowPaidGeneration: true, confirmedBillingArrears: true }, ledger: freshLedger() });
    ok('arrears-path-still-valid', a4.available().authorized === true);
  }

  console.log(`\nREPLICATE-ADAPTER TESTS: ${fail === 0 ? 'PASS' : 'FAIL'} (pass=${pass} fail=${fail})` + (fail ? ` [${fails.join(', ')}]` : ''));
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.log('HARNESS ERROR', e); process.exit(2); });
