// COST LEDGER / OBSERVABILITY schema for FUTURE paid attempts. Pure/hermetic — no provider I/O, no real spend.
// Instruments each attempt (provider/model/params/duration/price-basis/retries/defect/acceptance/cumCost) and
// derives cost-per-accepted-shot and per-accepted-finished-minute. Does NOT fabricate historical data.
// Composes the quality-rubric defect vocabulary. For real spend control use PersistentLedger (persistent-ledger.mjs).

export const ATTEMPT_FIELDS = ['shotId', 'attemptN', 'provider', 'model', 'params', 'durationSec', 'priceBasisUSD', 'estCostUSD', 'retryOf', 'defectCategory', 'accepted', 'sourceSha256', 'ts'];
export const DEFECT_VOCAB = ['identity_drift', 'costume_prop_discontinuity', 'artifact_deformation', 'flicker_temporal', 'unreadable_action', 'fake_vfx', 'continuity_jump', 'anachronism', 'audio_defect', 'pacing_finish', 'none'];

export function validateAttempt(a) {
  const errs = [];
  for (const f of ['shotId', 'model', 'estCostUSD', 'accepted']) if (a[f] === undefined) errs.push('missing ' + f);
  if (a.accepted === false && !DEFECT_VOCAB.includes(a.defectCategory)) errs.push('rejected attempt needs a defectCategory from DEFECT_VOCAB');
  if (a.accepted === true && a.defectCategory && a.defectCategory !== 'none') errs.push('accepted attempt must not carry a defect');
  if (typeof a.estCostUSD !== 'number' || a.estCostUSD < 0) errs.push('estCostUSD must be ≥0 number');
  return { ok: errs.length === 0, errs };
}

// record an attempt into an immutable-append ledger state (pure: returns a NEW state)
export function recordAttempt(state, attempt) {
  const v = validateAttempt(attempt);
  if (!v.ok) throw new Error('invalid attempt: ' + v.errs.join('; '));
  return { attempts: [...state.attempts, attempt], cumCostUSD: +(state.cumCostUSD + attempt.estCostUSD).toFixed(4) };
}
export const emptyLedger = () => ({ attempts: [], cumCostUSD: 0 });

// economics — computed ONLY from recorded attempts (never fabricated)
export function costPerAcceptedShot(state) {
  const acceptedShots = new Set(state.attempts.filter(a => a.accepted).map(a => a.shotId));
  if (acceptedShots.size === 0) return { acceptedShots: 0, costPerAcceptedShotUSD: null, note: 'no accepted shots yet — undefined, NOT zero' };
  return { acceptedShots: acceptedShots.size, totalCostUSD: state.cumCostUSD, costPerAcceptedShotUSD: +(state.cumCostUSD / acceptedShots.size).toFixed(4) };
}
export function costPerAcceptedMinute(state) {
  const sec = state.attempts.filter(a => a.accepted).reduce((s, a) => s + (a.durationSec || 0), 0);
  if (sec === 0) return { acceptedMinutes: 0, costPerAcceptedMinuteUSD: null, note: 'no accepted finished seconds yet' };
  return { acceptedSeconds: sec, acceptedMinutes: +(sec / 60).toFixed(2), costPerAcceptedMinuteUSD: +(state.cumCostUSD / (sec / 60)).toFixed(2) };
}
export function acceptanceRate(state) {
  if (state.attempts.length === 0) return { attempts: 0, rate: null };
  const acc = state.attempts.filter(a => a.accepted).length;
  return { attempts: state.attempts.length, accepted: acc, rate: +(acc / state.attempts.length).toFixed(3) };
}
export function defectHistogram(state) {
  const h = {};
  for (const a of state.attempts) if (!a.accepted && a.defectCategory) h[a.defectCategory] = (h[a.defectCategory] || 0) + 1;
  return h;
}
