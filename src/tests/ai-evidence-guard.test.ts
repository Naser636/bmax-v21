import { AiEvidenceGuard } from "@/core/ai-evidence-guard";
import { AI_EVIDENCE_GUARD_CONTRACT_VERSION, type AiEvidenceGuardInputs } from "@/contracts/ai-evidence-guard";

const cap = new AiEvidenceGuard();

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const d = cap.describe();
check(d.class === "capability" && d.owner === "Governance", "describe: capability owned by Governance");
check(cap.initialize().ready === true, "initialize ready");

const base = (over: Partial<AiEvidenceGuardInputs>): AiEvidenceGuardInputs => ({
  aiEvidenceGuardContractVersion: AI_EVIDENCE_GUARD_CONTRACT_VERSION,
  mission: "PROVIDER_SMOKE",
  provider: { classification: "OK", changedFiles: ["src/app/provider-smoke/marker.ts"] },
  verification: { build: true, typescript: true, gitClean: true },
  authorizedPaths: ["src/app/provider-smoke/**"],
  ...over,
});

// admissible: OK + green + in-scope
const rOk = cap.guard(base({}));
check(rOk.ok === true && rOk.verdict.admissible === true && rOk.verdict.reasons.length === 0, "admissible: OK + green verification + in-scope writes");

// provider not OK → quarantine
const rNotOk = cap.guard(base({ provider: { classification: "ERROR", changedFiles: [] } }));
check(rNotOk.ok === true && rNotOk.verdict.admissible === false && rNotOk.verdict.reasons.includes("PROVIDER_NOT_OK"), "quarantine: provider classification not OK");

// red verification → quarantine with the specific gate reasons
const rRed = cap.guard(base({ verification: { build: false, typescript: true, gitClean: false } }));
check(
  rRed.ok === true && rRed.verdict.admissible === false &&
    rRed.verdict.reasons.includes("BUILD_NOT_GREEN") && rRed.verdict.reasons.includes("GIT_NOT_CLEAN") &&
    !rRed.verdict.reasons.includes("TYPESCRIPT_NOT_GREEN"),
  "quarantine: red build/gitClean flagged, green typescript not flagged",
);

// out-of-scope write → quarantine, offending file reported
const rScope = cap.guard(base({ provider: { classification: "OK", changedFiles: ["src/core/release-manager.ts", "src/app/provider-smoke/ok.ts"] } }));
check(
  rScope.ok === true && rScope.verdict.admissible === false &&
    rScope.verdict.reasons.includes("OUT_OF_SCOPE_WRITE") &&
    rScope.verdict.outOfScope.length === 1 && rScope.verdict.outOfScope[0] === "src/core/release-manager.ts",
  "quarantine: an out-of-scope write is caught and reported, in-scope sibling allowed",
);

// no scope declared but files changed → out of scope
const rNoScope = cap.guard(base({ authorizedPaths: [], provider: { classification: "OK", changedFiles: ["a.ts"] } }));
check(rNoScope.ok === true && rNoScope.verdict.reasons.includes("OUT_OF_SCOPE_WRITE"), "quarantine: writes with no authorized scope are out of scope");

// determinism
const a = cap.guard(base({}));
const b = cap.guard(base({}));
check(a.ok && b.ok && JSON.stringify(a.verdict) === JSON.stringify(b.verdict), "determinism: identical inputs produce identical verdict");

// malformed / version
const rBad = cap.guard(base({ provider: { classification: "OK", changedFiles: [1 as unknown as string] } }));
check(rBad.ok === false && rBad.error.code === "INPUTS_MALFORMED", "malformed: non-string changedFiles rejected");
const rVer = cap.guard(base({ aiEvidenceGuardContractVersion: "3.0.0" }));
check(rVer.ok === false && rVer.error.code === "AI_EVIDENCE_GUARD_CONTRACT_INCOMPATIBLE", "version: major mismatch rejected");

if (failures > 0) { console.error(`\nAI Evidence Guard: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAI Evidence Guard OK");
