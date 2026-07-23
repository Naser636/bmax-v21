/*
 * Validation harness — Provider Patch Engine (IMPLEMENT_ENGINEERING_PROVIDER, OBJ-003)
 *
 * Proves the Runtime-owned Patch Engine RECEIVES a provider result and normalizes it into an
 * evidence-grounded receipt that governs whether the patch is forwarded to the Validation Engine.
 * The receipt is derived ONLY from observed evidence (classification, changedFiles,
 * unauthorizedChanges) — never from the provider's own `status` prose.
 *
 * Checks, one per disposition:
 *   1. RECEIVED  — a clean OK run with in-scope changes ⇒ RECEIVED, readyForValidation.
 *   2. EMPTY     — a clean OK run that changed nothing ⇒ EMPTY, still readyForValidation.
 *   3. REJECTED  — unauthorized changes ⇒ REJECTED, NOT ready (scope violation wins over class).
 *   4. REJECTED  — a non-OK classification (BLOCKED) ⇒ REJECTED, NOT ready, reason surfaced.
 *   5. EVIDENCE  — the receipt never trusts a DONE prose status when evidence says otherwise.
 *
 * Run: `npx tsx src/tests/provider-patch-engine.test.ts`.
 */

import { ProviderPatchEngine } from "@/runtime/patch-engine";
import type { ProviderOutcome, ProviderResult } from "@/providers";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

const engine = new ProviderPatchEngine();

function result(over: Partial<ProviderResult> = {}): ProviderResult {
  return {
    mission: "M",
    providerContractVersion: "1.0.0",
    status: "DONE",
    objectivesAddressed: ["OBJ-1"],
    changedFiles: [],
    commandsRun: ["tsc --noEmit"],
    blocker: null,
    ...over,
  };
}

function outcome(over: Partial<ProviderOutcome> = {}): ProviderOutcome {
  return {
    provider: "claude-code",
    classification: "OK",
    providerExecuted: true,
    fromCache: false,
    result: result(),
    sessionId: "sess",
    changedFiles: [],
    unauthorizedChanges: [],
    raw: { exitCode: 0, stdout: "", stderr: "" },
    diagnostics: [],
    ...over,
  };
}

// --- 1) RECEIVED: clean OK run with real in-scope changes ---------------------------------------
{
  const r = engine.receive("M", outcome({ changedFiles: ["src/runtime/patch-engine.ts"] }));
  check(
    r.status === "RECEIVED" && r.readyForValidation === true && r.reason === null,
    "RECEIVED: clean OK run with changed files ⇒ RECEIVED and ready for validation",
  );
  check(
    r.changedFiles.length === 1 && r.objectivesAddressed[0] === "OBJ-1" && r.commandsRun.length === 1,
    "RECEIVED: the patch (changed files, objectives, commands) is carried through",
  );
}

// --- 2) EMPTY: clean OK run that changed nothing -------------------------------------------------
{
  const r = engine.receive("M", outcome({ changedFiles: [] }));
  check(
    r.status === "EMPTY" && r.readyForValidation === true,
    "EMPTY: clean OK no-op run ⇒ EMPTY but STILL forwarded to validation (this engine never decides)",
  );
}

// --- 3) REJECTED: unauthorized changes outrank an OK classification ------------------------------
{
  const r = engine.receive(
    "M",
    outcome({
      classification: "FAILED",
      changedFiles: ["runtime/core/patch-engine.js"],
      unauthorizedChanges: ["runtime/core/patch-engine.js"],
      diagnostics: ["unauthorized changes outside mission scope: runtime/core/patch-engine.js"],
    }),
  );
  check(
    r.status === "REJECTED" && r.readyForValidation === false && /outside the mission scope/.test(r.reason ?? ""),
    "REJECTED: unauthorized changes ⇒ REJECTED, not ready, scope reason surfaced",
  );
}

// --- 4) REJECTED: a non-OK classification cannot be validated ------------------------------------
{
  const r = engine.receive(
    "M",
    outcome({
      classification: "BLOCKED",
      result: result({ status: "BLOCKED", blocker: "precondition X missing" }),
      diagnostics: ["provider reported BLOCKED: precondition X missing"],
    }),
  );
  check(
    r.status === "REJECTED" && r.readyForValidation === false && /precondition X missing/.test(r.reason ?? ""),
    "REJECTED: BLOCKED classification ⇒ REJECTED, not ready, blocker reason surfaced",
  );
}

// --- 5) EVIDENCE over narrative: a DONE prose status does NOT rescue a FAILED run ----------------
{
  const r = engine.receive(
    "M",
    outcome({
      classification: "FAILED",
      result: result({ status: "DONE" }), // provider CLAIMS done…
      diagnostics: ["provider process failed (exit=1)"],
    }),
  );
  check(
    r.status === "REJECTED" && r.readyForValidation === false,
    "EVIDENCE: a DONE self-report is ignored when the classification is FAILED (evidence, not narrative)",
  );
}

if (failures > 0) {
  console.error(`\nProvider Patch Engine: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nProvider Patch Engine OK");
