// SHARED-CORE retry/backoff (Domain-A) — bounded retries with exponential backoff, hard limits, DETERMINISTIC
// (injectable clock/sleep; NO Math.random — jitter is seeded & pure), idempotency (a cached key is NOT re-run),
// and loop/circuit-break prevention (same error repeating → CIRCUIT_OPEN abort). Closes the Domain-A inventory gap
// "no generic retry/backoff primitive". Pure where it counts; €0, no network. Complements runtime/core
// build-recovery-engine (bounded repair) + bash-command-governor (timeouts) — does NOT duplicate them.

// Pure: compute the delay schedule (ms) for a given policy. delay(n) = min(maxDelayMs, baseDelayMs * factor^(n-1)).
export function backoffSchedule({ maxAttempts = 3, baseDelayMs = 100, maxDelayMs = 5000, factor = 2 } = {}) {
  const out = [];
  for (let n = 1; n < maxAttempts; n++) out.push(Math.min(maxDelayMs, Math.round(baseDelayMs * factor ** (n - 1))));
  return out; // length = maxAttempts-1 (delays BETWEEN attempts)
}

// Seeded deterministic jitter in [0,1) — replaces Math.random so retries stay reproducible/testable.
function seededJitter(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }

// Execute fn with retries. fn: (attemptNo) => value | Promise<value>; throws to signal failure.
// opts: maxAttempts, baseDelayMs, maxDelayMs, factor, jitterRatio (0..1 of the delay, deterministic),
//       isRetryable(err)->bool, sleep(ms)->Promise (injectable; default real), idempotencyKey, seen (Map),
//       circuitThreshold (abort if the SAME error message repeats this many times).
export async function withRetry(fn, opts = {}) {
  const { maxAttempts = 3, baseDelayMs = 100, maxDelayMs = 5000, factor = 2, jitterRatio = 0,
    isRetryable = () => true, sleep = (ms) => new Promise(r => setTimeout(r, ms)),
    idempotencyKey, seen, circuitThreshold = 0 } = opts;

  // IDEMPOTENCE: a previously-succeeded key is reconciled, never re-run.
  if (idempotencyKey && seen && seen.has(idempotencyKey)) return { ok: true, value: seen.get(idempotencyKey), attempts: 0, outcome: 'DUPLICATE', delaysMs: [] };

  const base = backoffSchedule({ maxAttempts, baseDelayMs, maxDelayMs, factor });
  const delaysMs = []; const errors = []; let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn(attempt);
      if (idempotencyKey && seen) seen.set(idempotencyKey, value);
      return { ok: true, value, attempts: attempt, outcome: 'SUCCESS', delaysMs };
    } catch (e) {
      lastErr = e; const msg = String(e && e.message || e); errors.push(msg);
      // LOOP/CIRCUIT PREVENTION: identical error repeating ≥ threshold ⇒ stop early (retrying won't help).
      if (circuitThreshold > 0 && errors.filter(m => m === msg).length >= circuitThreshold) return { ok: false, error: msg, attempts: attempt, outcome: 'CIRCUIT_OPEN', delaysMs };
      if (!isRetryable(e)) return { ok: false, error: msg, attempts: attempt, outcome: 'NON_RETRYABLE', delaysMs };
      if (attempt === maxAttempts) break; // exhausted
      let d = base[attempt - 1];
      if (jitterRatio > 0) d = Math.round(d * (1 - jitterRatio) + d * jitterRatio * seededJitter(attempt));
      delaysMs.push(d); await sleep(d);
    }
  }
  return { ok: false, error: String(lastErr && lastErr.message || lastErr), attempts: maxAttempts, outcome: 'EXHAUSTED', delaysMs };
}
