// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention (see autonomy-rate.test.ts).
// mission-attempt-log — maps recordMission results to attempts, append/read round-trip, representable failures,
// first-attempt ordering, composition with evaluateConfiguredSLO, parity. Uses an injected in-memory io (no real fs).
const assert = require("assert");
const TS = require("./mission-attempt-log.ts");
const JS = require("./mission-attempt-log.js");
const { evaluateConfiguredSLO } = require("./slo-targets.ts");

let n = 0;
const t = (name: any, fn: any) => { fn(); n++; console.log("ok  " + name); };

// In-memory io seam (no real filesystem).
function memIo() {
  const store: any = {};
  return {
    store,
    appendFileSync: (p: any, s: any) => { store[p] = (store[p] || "") + s; },
    readFileSync: (p: any) => { if (store[p] === undefined) throw new Error("ENOENT"); return store[p]; },
  };
}

// 1. recordMission result → attempt record mapping (RECORDED vs SKIPPED+reason), recordedAt never invented.
t("maps recordMission results (RECORDED / SKIPPED+reason)", () => {
  const ok = TS.attemptFromLedgerResult("M1", { skipped: false, entry: { mission: "M1" } }, "2026-09-01T10:00:00.000Z");
  assert.strictEqual(ok.outcome, "RECORDED");
  assert.strictEqual(ok.reason, null);
  const bad = TS.attemptFromLedgerResult("M2", { skipped: true, reason: "UNPROVEN" }, "2026-09-01T11:00:00.000Z");
  assert.strictEqual(bad.outcome, "SKIPPED");
  assert.strictEqual(bad.reason, "UNPROVEN");
  // no recordedAt supplied ⇒ null (not fabricated)
  assert.strictEqual(TS.attemptFromLedgerResult("M3", { skipped: false }, undefined).recordedAt, null);
});

// 2. durationMs only when caller supplies a real startedAt/endedAt pair.
t("durationMs only from a real startedAt/endedAt pair", () => {
  const r = TS.attemptFromLedgerResult("M", { skipped: false }, "2026-09-01T10:00:00.000Z",
    { startedAt: "2026-09-01T10:00:00.000Z", endedAt: "2026-09-01T10:00:02.500Z" });
  assert.strictEqual(r.durationMs, 2500);
  assert.strictEqual(TS.attemptFromLedgerResult("M", { skipped: false }, "2026-09-01T10:00:00.000Z").durationMs, undefined);
});

// 3. append/read round-trip + invalid record refused.
t("append/read round-trip + invalid refused", () => {
  const io = memIo();
  assert.strictEqual(TS.recordAttempt("/log", { mission: "M1", recordedAt: "t", outcome: "RECORDED" }, { io }).written, true);
  assert.strictEqual(TS.recordAttempt("/log", { mission: null, recordedAt: "t" }, { io }).written, false); // invalid
  const back = TS.readAttempts("/log", { io });
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].mission, "M1");
});

// 4. summarize: failures ARE representable here (SKIPPED recorded) ⇒ a genuine rate, not survivorship.
t("summarize computes a real rate (failures representable)", () => {
  const attempts = [];
  for (let i = 0; i < 18; i++) attempts.push({ mission: `OK_${i}`, outcome: "RECORDED", recordedAt: `2026-09-10T10:${String(i).padStart(2, "0")}:00.000Z` });
  attempts.push({ mission: "FAIL_1", outcome: "SKIPPED", reason: "NOT_ACCEPTED", recordedAt: "2026-09-10T11:00:00.000Z" });
  attempts.push({ mission: "FAIL_2", outcome: "SKIPPED", reason: "UNPROVEN", recordedAt: "2026-09-10T11:01:00.000Z" });
  const s = TS.summarizeAttempts(attempts, { minSampleN: 20 });
  assert.strictEqual(s.failuresRepresentable, true);
  assert.strictEqual(s.distinctMissions, 20);
  assert.strictEqual(s.slis.MISSION_SUCCESS_VERIFIED.measurable, true);
  assert.strictEqual(s.slis.MISSION_SUCCESS_VERIFIED.numerator, 18);
  assert.strictEqual(s.slis.MISSION_SUCCESS_VERIFIED.denominator, 20);
});

// 5. first-attempt uses the CHRONOLOGICALLY first attempt per mission (retry that later succeeds ≠ first-attempt success).
t("first-attempt = chronologically first outcome per mission", () => {
  const attempts = [
    { mission: "RETRIED", outcome: "SKIPPED", reason: "UNPROVEN", recordedAt: "2026-09-10T10:00:00.000Z" },
    { mission: "RETRIED", outcome: "RECORDED", recordedAt: "2026-09-10T10:05:00.000Z" },
  ];
  const s = TS.summarizeAttempts(attempts, { minSampleN: 1 });
  assert.strictEqual(s.slis.MISSION_SUCCESS_VERIFIED.numerator, 1);     // eventually succeeded
  assert.strictEqual(s.slis.MISSION_SUCCESS_FIRST_ATTEMPT.numerator, 0); // but NOT on first attempt
});

// 6. composes with evaluateConfiguredSLO (sufficient + meeting target ⇒ WITHIN).
t("composes with evaluateConfiguredSLO", () => {
  const attempts = [];
  for (let i = 0; i < 100; i++) attempts.push({ mission: `M_${i}`, outcome: i < 96 ? "RECORDED" : "SKIPPED", reason: i < 96 ? null : "UNPROVEN", recordedAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z` });
  const s = TS.summarizeAttempts(attempts, { minSampleN: 20 });
  const v = evaluateConfiguredSLO("MISSION_SUCCESS_VERIFIED", s.slis.MISSION_SUCCESS_VERIFIED);
  assert.strictEqual(v.status, "WITHIN"); // 96/100 = 0.96 >= 0.95
  assert.strictEqual(v.validated, true);
});

// 7. parity.
t("TS/JS parity", () => {
  const attempts = [
    { mission: "A", outcome: "RECORDED", recordedAt: "2026-09-01T10:00:00.000Z" },
    { mission: "B", outcome: "SKIPPED", reason: "UNPROVEN", recordedAt: "2026-09-01T10:01:00.000Z" },
  ];
  assert.deepStrictEqual(TS.summarizeAttempts(attempts, { minSampleN: 1 }), JS.summarizeAttempts(attempts, { minSampleN: 1 }));
  assert.deepStrictEqual(TS.attemptFromLedgerResult("A", { skipped: true, reason: "X", verdict: "Y" }, "t"), JS.attemptFromLedgerResult("A", { skipped: true, reason: "X", verdict: "Y" }, "t"));
});

console.log(`\nALL PASS — mission-attempt-log (${n} tests)`);
