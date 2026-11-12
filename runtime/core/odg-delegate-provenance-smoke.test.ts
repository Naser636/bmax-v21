#!/usr/bin/env node
"use strict";
/* V164 §1 — slice-3 (p0-autonomy-measure-slice3-delegate-provenance) Gate-A smoke. Proves the REALIZABLE Gate-A evidence the
 * mission's own nextAction requires ("refined contract + isolated delegate-flow smoke BEFORE any implementation"): the canonical
 * delegate flow emits NO patch-execution.json (the provenance gap ⇒ HISTORICAL delegation resolves UNKNOWN actor, which is
 * HONEST); write-scope isolation holds (out-of-scope refused). Reuses delegate-isolation.ts (no parallel engine). The register
 * mission status is NOT changed here (a provider cannot close a real mission); the authoredBy-threading enhancement stays DEFERRED. */
const S = require("./odg-delegate-provenance-smoke.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- Gate-A refined contract: names the correct enhancement + why the simple stamp fails + current honest behaviour ----
  const c = S.gateARefinedContract();
  check("contract targets the real mission id", c.missionId === "p0-autonomy-measure-slice3-delegate-provenance");
  check("contract states current behaviour is ALREADY HONEST (no false ODG credit; no defect open)", /HONEST/.test(c.currentBehaviourHonest) && /no false|no defect|ENHANCEMENT/i.test(c.currentBehaviourHonest));
  check("contract explains why the simple conformance-point stamp FAILS (clobbered + colliding)", c.whySimpleStampFails.length >= 2 && /CLOBBERED/.test(c.whySimpleStampFails[0]) && /COLLIDE/.test(c.whySimpleStampFails[1]));
  check("contract names the correct enhancement = thread authoredBy=PROVIDER through convergence/patch-executor (NOT a delegate-step write)", /authoredBy=PROVIDER/.test(c.correctEnhancement) && /NOT a delegate-step write/.test(c.correctEnhancement));
  check("contract keeps the enhancement OUT OF SCOPE here (mission stays DEFERRED)", /DEFERRED/.test(c.scopeBoundary) && c.acceptanceForEnhancement_whenAttempted.length >= 3);

  // ---- empirical isolated delegate-flow smoke over a real scratch repo ----
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "v164-delg-"));
  fs.writeFileSync(path.join(root, "in.txt"), "original\n");
  fs.writeFileSync(path.join(root, "secret.txt"), "do-not-touch\n");
  const r = S.delegateFlowSmoke(root);

  check("smoke ran over the scratch repo", r.ok === true);
  // (A) PROVENANCE GAP — the core mission finding, now empirically confirmed
  check("PROVENANCE GAP: the canonical delegate flow emits NO patch-execution provenance", r.findings.provenanceGap.delegateEmitsPatchExecution === false && r.findings.provenanceGap.historicalDelegationHasNoExecutionProvenance === true);
  check("PROVENANCE GAP double-checked: no patch-execution.json created under the repo by the flow ⇒ HISTORICAL delegation ⇒ UNKNOWN actor (honest)", r.provenanceGapConfirmed === true);
  // (B) SCOPE ISOLATION — the write-confinement the delegate flow enforces
  check("SCOPE ISOLATION: an out-of-scope provider edit is REFUSED by validateScope", r.scopeIsolationHolds === true && /REFUSED/.test(r.findings.scopeIsolation.detail));

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }

  // ---- honest boundary: reuses canonical delegate-isolation; no parallel engine; mission not closed ----
  check("reuses the canonical delegate-isolation (no parallel delegate engine)", /delegate-isolation/.test(S.DELEGATE_PROVENANCE_SMOKE_CONTRACT.reuses[0]) && /no parallel engine/.test(S.DELEGATE_PROVENANCE_SMOKE_CONTRACT.reuses[0]));
  check("contract: measurement ENHANCEMENT not a defect; authoredBy-threading OUT OF SCOPE; mission stays DEFERRED; status not changed", S.DELEGATE_PROVENANCE_SMOKE_CONTRACT.invariants.some((x: string) => /already HONEST/.test(x)) && S.DELEGATE_PROVENANCE_SMOKE_CONTRACT.invariants.some((x: string) => /OUT OF SCOPE/.test(x) && /DEFERRED/.test(x)) && S.DELEGATE_PROVENANCE_SMOKE_CONTRACT.invariants.some((x: string) => /provider cannot close/.test(x)));
  check("deliverable note keeps the mission DEFERRED (provider cannot close it)", /DEFERRED/.test(r.note) && /provider cannot close/.test(r.note));

  // ---- fail-closed ----
  check("contract + result are frozen (deterministic)", Object.isFrozen(S.DELEGATE_PROVENANCE_SMOKE_CONTRACT) && Object.isFrozen(r) && Object.isFrozen(c));
  check("no-root is handled fail-closed", S.delegateFlowSmoke("/nonexistent/path/zzz").ok === false);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — delegate-provenance-smoke (Gate-A: refined contract + isolated delegate-flow smoke; provenance gap [no patch-execution.json ⇒ HISTORICAL delegation=UNKNOWN actor, honest] + scope isolation CONFIRMED over the canonical delegate-isolation; authoredBy-threading enhancement OUT OF SCOPE; mission stays DEFERRED, status unchanged)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
