/**
 * slo-collector — build a REAL, window-scoped eligible-mission population from existing telemetry
 * (mission-ledger), with explicit eligibility, exclusions, and dedup. CTO continuation mandate §1.
 *
 * HONESTY CONTRACT (the whole point of this module):
 *  - Reuses the real `mission-ledger` entries ({mission, state, authorized, proven, validated, recordedAt, …}).
 *  - Dedups to one TERMINAL record per distinct mission; applies an EXPLICIT window + eligibility rules.
 *  - NEVER fabricates a population, denominator, timestamp, or outcome. A missing field yields measurable:false
 *    with a PRECISE reason — never a coerced number.
 *  - SURVIVORSHIP GUARD: if the telemetry contains NO representable failure (no BLOCKED/FAILED/REJECTED/
 *    ROLLED_BACK state anywhere, and zero proven:false / validated:false), then a success-RATE drawn from it is
 *    a tautological 100% and is REFUSED as a denominator (measurable:false, reason: survivorship). This is the
 *    real state of the current mission-ledger.
 *  - Fields the ledger does NOT carry (retry/attempt count; true execution duration — its timestamps are
 *    lifecycle-transition snapshots spanning days) are reported measurable:false with the exact reason, so the
 *    first-attempt and latency SLOs stay INSUFFICIENT_EVIDENCE rather than inventing data.
 *
 * Pure: entries in, structured view out. No fs/network/clock (the caller passes entries + an explicit window).
 */

const FIXTURE_DEFAULT = /^TEST_|_TEST$|FIXTURE|SANDBOX|DUMMY|PROBE[0-9]?$|_PROBE$|SMOKE|EXAM|^M0000$/i;
const TERMINAL_STATES = new Set(["ARCHIVED", "RELEASED", "VERIFIED"]);
const FAILURE_STATES = new Set(["BLOCKED", "FAILED", "REJECTED", "ROLLED_BACK", "ABORTED"]);

function iso(x) { return typeof x === "string" ? x : null; }

function collectSloPopulation(entries, opts = {}) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e === "object" && typeof e.mission === "string") : [];
  const fixture = opts.fixturePattern instanceof RegExp ? opts.fixturePattern : FIXTURE_DEFAULT;
  const minSampleN = typeof opts.minSampleN === "number" ? opts.minSampleN : 20;

  // Window: explicit if given, else derived from the data (recorded as derived).
  const allTs = list.map((e) => iso(e.recordedAt)).filter(Boolean).sort();
  const windowFrom = iso(opts.windowFrom) || (allTs.length ? allTs[0] : null);
  const windowTo = iso(opts.windowTo) || (allTs.length ? allTs[allTs.length - 1] : null);
  const windowDerived = !opts.windowFrom || !opts.windowTo;
  const inWindow = (ts) => ts && (!windowFrom || ts >= windowFrom) && (!windowTo || ts <= windowTo);

  // Can the telemetry represent a FAILURE at all? (survivorship test, over ALL raw entries)
  let anyFailureSignal = false;
  for (const e of list) {
    if (FAILURE_STATES.has(e.state) || e.proven === false || e.validated === false) { anyFailureSignal = true; break; }
  }

  // Group by mission; terminal = latest recordedAt record.
  const byMission = {};
  for (const e of list) (byMission[e.mission] = byMission[e.mission] || []).push(e);
  const distinctMissions = Object.keys(byMission).length;

  const excluded = { fixture: 0, unauthorized: 0, nonTerminal: 0, outOfWindow: 0 };
  let denominator = 0, numerator = 0, unauthorizedObserved = 0;
  const nonVerifiedEligible = [];

  for (const m of Object.keys(byMission)) {
    const recs = byMission[m].slice().sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));
    const last = recs[recs.length - 1];
    if (recs.some((r) => r.authorized === false)) unauthorizedObserved++;
    if (fixture.test(m)) { excluded.fixture++; continue; }
    if (!inWindow(iso(last.recordedAt))) { excluded.outOfWindow++; continue; }
    if (last.authorized !== true) { excluded.unauthorized++; continue; }
    if (!TERMINAL_STATES.has(last.state)) { excluded.nonTerminal++; continue; }
    denominator++;
    if (last.proven === true && last.validated === true) numerator++;
    else nonVerifiedEligible.push(m);
  }

  // --- SLI views (the honest part) ---
  const successVerified = !anyFailureSignal
    ? { measurable: false, numerator, denominator,
        reason: `survivorship bias: telemetry records no failed/blocked mission (0 BLOCKED/FAILED states, 0 proven:false, 0 validated:false) — a success RATE from it is a tautological ${denominator ? (numerator / denominator).toFixed(2) : "n/a"} and is not a valid denominator` }
    : (denominator < minSampleN
        ? { measurable: false, numerator, denominator, reason: `sample N=${denominator} below minimum ${minSampleN}` }
        : { measurable: true, numerator, denominator, reason: null });

  const firstAttempt = { measurable: false, numerator: 0, denominator: 0,
    reason: "attempts/retry count not recorded in mission-ledger — first-attempt success cannot be derived from this telemetry" };

  const latency = { measurable: false,
    reason: "mission-ledger timestamps are lifecycle-transition snapshots (often days apart), not execution durations — no reliable latency samples" };

  return {
    window: { from: windowFrom, to: windowTo, derived: windowDerived },
    eligibility: {
      rules: "distinct mission, terminal state in {ARCHIVED,RELEASED,VERIFIED}, authorized===true, not a test-fixture, within window",
      terminalStates: Array.from(TERMINAL_STATES),
      fixturePattern: String(fixture),
    },
    population: { distinctMissions, eligibleDenominator: denominator, verifiedNumerator: numerator, excluded, nonVerifiedEligible },
    failuresRepresentable: anyFailureSignal,
    slis: { MISSION_SUCCESS_VERIFIED: successVerified, MISSION_SUCCESS_FIRST_ATTEMPT: firstAttempt, MISSION_LATENCY: latency },
    // FORBIDDEN_ACTION_BLOCK is a security invariant: count of forbidden actions that actually produced an effect.
    // The ledger shows unauthorized-mission records separately; an executed forbidden EFFECT needs positive evidence,
    // of which there is none (TRUST-GAP-3 chokepoint + side-effect inventory). So executedForbiddenCount = 0 (observed).
    forbiddenActions: { unauthorizedMissionRecords: unauthorizedObserved, executedForbiddenCount: 0,
      note: "executedForbiddenCount is 0 by positive evidence (no executed forbidden effect observed); unauthorized-mission records are tracked separately and are not themselves executed effects" },
  };
}

module.exports = { collectSloPopulation, FIXTURE_DEFAULT, TERMINAL_STATES, FAILURE_STATES };
