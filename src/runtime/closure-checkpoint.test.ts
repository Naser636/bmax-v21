/*
 * recordClosureCheckpoint (§7 Lot B) — business result vs closure result are distinct; a failed checkpoint is
 * reported (closed:false) not swallowed; stale/cross-mission reports stay honest (never a false PASS); single
 * attempt (no retry loop); never throws. Uses an injected compass dep (no fs/git).
 *
 * Run: node_modules/.bin/tsx src/runtime/closure-checkpoint.test.ts
 */
import { recordClosureCheckpoint } from "./ledger-record-adapter";

let failures = 0;
function check(c: boolean, label: string): void { if (c) { console.log(`  PASS ${label}`); } else { failures++; console.log(`  FAIL ${label}`); } }

console.log("recordClosureCheckpoint — closure semantics");

// 1. success: update succeeds ⇒ closed:true with the derived status.
let calls = 0;
let r = recordClosureCheckpoint("M1", "/repo", 1000, {
  compass: { fromReport: () => ({ status: "PASS" }), update: () => { calls++; return {}; } },
});
check(r.closed === true && r.status === "PASS" && calls === 1, "success ⇒ closed:true, status PASS, update called once");

// 2. stale/cross-mission report ⇒ fromReport returns NOT_RUN; checkpoint still recorded honestly (closed:true, NOT_RUN) — never a false PASS.
r = recordClosureCheckpoint("M2", "/repo", 1000, {
  compass: { fromReport: () => ({ status: "NOT_RUN" }), update: () => ({}) },
});
check(r.closed === true && r.status === "NOT_RUN", "stale report ⇒ recorded honestly as NOT_RUN (no false PASS)");

// 3. checkpoint update FAILS ⇒ closed:false, CLOSURE_ERROR, reason surfaced (not swallowed). SINGLE attempt.
let attempts = 0;
r = recordClosureCheckpoint("M3", "/repo", 1000, {
  compass: { fromReport: () => ({ status: "PASS" }), update: () => { attempts++; throw new Error("disk full"); } },
});
check(r.closed === false && r.status === "CLOSURE_ERROR" && /disk full/.test(r.reason), "update failure ⇒ closed:false CLOSURE_ERROR (reason surfaced)");
check(attempts === 1, "single attempt (no retry loop)");

// 4. fromReport throws ⇒ closed:false, never propagates (never throws out).
let threw = false;
try {
  r = recordClosureCheckpoint("M4", "/repo", 1000, { compass: { fromReport: () => { throw new Error("boom"); }, update: () => ({}) } });
} catch { threw = true; }
check(threw === false && r.closed === false, "fromReport throw ⇒ caught, closed:false, never propagates");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS — recordClosureCheckpoint");
if (failures) process.exit(1);
