// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// front-door-attempt (§2) — the direct front-door records every real run into the EXISTING attempt-log, with
// an HONEST outcome (no false completion) and IDEMPOTENCY by (mission, runId) to prevent double-recording.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const JS = require("./front-door-attempt.js");
const TS = require("./front-door-attempt.ts");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
function sandbox(report) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fda-"));
  fs.mkdirSync(path.join(root, "runtime", "generated"), { recursive: true });
  if (report) fs.writeFileSync(path.join(root, "runtime", "generated", "mission-report.json"), JSON.stringify(report));
  return root;
}
const logOf = (root) => path.join(root, "runtime", "generated", "mission-attempts.jsonl");
const readAll = (lp) => fs.readFileSync(lp, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const TIMING = { startedAt: "2026-10-20T12:00:00.000Z", endedAt: "2026-10-20T12:00:05.000Z" };

// 1 — SUCCESS: validated SUCCESS report + exit 0 ⇒ RECORDED, finalStatus SUCCESS, provenance + stages.
t("success ⇒ RECORDED with provenance + stages", () => {
  const root = sandbox({ mission: "FDA_OK", validated: true, status: "SUCCESS" });
  const r = JS.recordFrontDoorAttempt({ mission: "FDA_OK", exitCode: 0, runId: "r1", repoRoot: root, logPath: logOf(root), ...TIMING,
    runLogText: ">>> Mission Interpreter          OK   (203ms)\n>>> Validation Engine  OK   (99ms)\n" });
  assert.strictEqual(r.written, true);
  const rec = readAll(logOf(root))[0];
  assert.strictEqual(rec.outcome, "RECORDED");
  assert.strictEqual(rec.finalStatus, "SUCCESS");
  assert.strictEqual(rec.durationMs, 5000);
  assert.deepStrictEqual(rec.provenance, ["runtime/generated/mission-report.json"]);
  assert.deepStrictEqual(rec.stagesExecuted, ["Mission Interpreter", "Validation Engine"]);
  assert.strictEqual(rec.retries, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

// 2 — FAIL (Validation BLOCKED): report validated:false status BLOCKED + exit 1 ⇒ SKIPPED, reason BLOCKED.
t("validation BLOCKED ⇒ SKIPPED (never RECORDED)", () => {
  const root = sandbox({ mission: "FDA_BLK", validated: false, status: "BLOCKED" });
  JS.recordFrontDoorAttempt({ mission: "FDA_BLK", exitCode: 1, runId: "r1", repoRoot: root, logPath: logOf(root), ...TIMING });
  const rec = readAll(logOf(root))[0];
  assert.strictEqual(rec.outcome, "SKIPPED");
  assert.strictEqual(rec.reason, "BLOCKED");
  assert.strictEqual(rec.finalStatus, "BLOCKED");
  fs.rmSync(root, { recursive: true, force: true });
});

// 3 — INTERRUPT: a SIGTERM wins even over a stale SUCCESS report on disk ⇒ INTERRUPTED (NO false completion).
t("interruption ⇒ INTERRUPTED even with a stale SUCCESS report (no false completion)", () => {
  const root = sandbox({ mission: "FDA_INT", validated: true, status: "SUCCESS" }); // stale/foreign success
  JS.recordFrontDoorAttempt({ mission: "FDA_INT", exitCode: 143, signal: "SIGTERM", runId: "r1", repoRoot: root, logPath: logOf(root), ...TIMING });
  const rec = readAll(logOf(root))[0];
  assert.strictEqual(rec.outcome, "SKIPPED");
  assert.strictEqual(rec.finalStatus, "INTERRUPTED");
  fs.rmSync(root, { recursive: true, force: true });
});

// 4 — absent report + clean exit ⇒ UNVERIFIED (never a fabricated success).
t("absent report ⇒ UNVERIFIED (no false success)", () => {
  const root = sandbox(null);
  JS.recordFrontDoorAttempt({ mission: "FDA_NONE", exitCode: 0, runId: "r1", repoRoot: root, logPath: logOf(root), ...TIMING });
  const rec = readAll(logOf(root))[0];
  assert.strictEqual(rec.outcome, "SKIPPED");
  assert.strictEqual(rec.finalStatus, "UNVERIFIED");
  assert.deepStrictEqual(rec.provenance, []);
  fs.rmSync(root, { recursive: true, force: true });
});

// 5 — FOREIGN report (another mission) + exit 0 ⇒ UNVERIFIED (identity guard, not RECORDED).
t("foreign report ignored ⇒ UNVERIFIED (identity guard)", () => {
  const root = sandbox({ mission: "SOMEONE_ELSE", validated: true, status: "SUCCESS" });
  JS.recordFrontDoorAttempt({ mission: "FDA_ME", exitCode: 0, runId: "r1", repoRoot: root, logPath: logOf(root), ...TIMING });
  const rec = readAll(logOf(root))[0];
  assert.strictEqual(rec.outcome, "SKIPPED");
  assert.strictEqual(rec.finalStatus, "UNVERIFIED");
  fs.rmSync(root, { recursive: true, force: true });
});

// 6 — IDEMPOTENT: a second record for the same (mission, runId) is refused ⇒ no double-count.
t("same (mission, runId) twice ⇒ second refused (no double-record)", () => {
  const root = sandbox({ mission: "FDA_DUP", validated: true, status: "SUCCESS" });
  const a = JS.recordFrontDoorAttempt({ mission: "FDA_DUP", exitCode: 0, runId: "r1", repoRoot: root, logPath: logOf(root), ...TIMING });
  const b = JS.recordFrontDoorAttempt({ mission: "FDA_DUP", exitCode: 0, runId: "r1", repoRoot: root, logPath: logOf(root), ...TIMING });
  assert.strictEqual(a.written, true);
  assert.strictEqual(b.written, false);
  assert.ok(/duplicate/.test(b.reason));
  assert.strictEqual(readAll(logOf(root)).length, 1);
  // a DIFFERENT runId is a legitimately new attempt.
  const c = JS.recordFrontDoorAttempt({ mission: "FDA_DUP", exitCode: 0, runId: "r2", repoRoot: root, logPath: logOf(root), ...TIMING });
  assert.strictEqual(c.written, true);
  assert.strictEqual(readAll(logOf(root)).length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

// 6b — stage parsing handles the run.log "===== >>> Stage (exit N) =====" format (exit!=0 ⇒ failed).
t("parseStages handles the run.log (exit N) format", () => {
  const st = JS.parseStages("===== >>> Mission Interpreter (exit 0) =====\n===== >>> Validation Engine (exit 1) =====\n");
  assert.deepStrictEqual(st.executed, ["Mission Interpreter", "Validation Engine"]);
  assert.deepStrictEqual(st.failed, ["Validation Engine"]);
});

// 7 — JS/TS parity: identical inputs ⇒ identical persisted record.
t("JS/TS parity", () => {
  const mk = (M) => {
    const root = sandbox({ mission: "FDA_P", validated: true, status: "SUCCESS" });
    M.recordFrontDoorAttempt({ mission: "FDA_P", exitCode: 0, runId: "r1", repoRoot: root, logPath: logOf(root), ...TIMING, runLogText: ">>> Stage A  OK\n>>> Stage B  FAIL\n" });
    const rec = readAll(logOf(root))[0];
    fs.rmSync(root, { recursive: true, force: true });
    return rec;
  };
  assert.deepStrictEqual(mk(JS), mk(TS));
});

console.log(`\nALL PASS — front-door-attempt (${n} tests)`);
