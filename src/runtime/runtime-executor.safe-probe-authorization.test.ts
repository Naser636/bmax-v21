/*
 * GOVERNED SAFE-PROBE AUTHORIZATION — regression contract for EXTERNAL_RESEARCH_SAFE_PROBE_AUTHORIZATION.
 * Run: node_modules/.bin/tsx src/runtime/runtime-executor.safe-probe-authorization.test.ts
 *
 * DEFECT (before this fix): the execution-chokepoint consequential-capability gate
 * (runtime-executor.ts → capability-authorization) denied a consequential capability whenever no human
 * grant was carried — even for the capability's SAFE, zero-effect dry-run. So a disk-driven probe mission
 * proving `external-research-dry-run-planned` could never run the (zero-network, plan-only) executor and
 * was BLOCKED, although the capability explicitly DECLARES that safeProbe.
 *
 * FIX: `capability-authorization.safeModeDryRunExemption` authorizes ONLY the safe dry-run WITHOUT a grant
 * when ALL hold — the capability declares a non-null safeProbe, the mission's declared verify evidence IS
 * that safeProbe, and there is NO live intent (no execute, no fetcher). The LIVE `probe`/execute path and
 * every capability without a safeProbe stay grant-gated (unchanged). The runtime-executor consults this
 * ONLY as a fallback after authorizeCapability denies; the ALLOW path is untouched.
 *
 * Integration (A,B) drives the REAL RuntimeExecutor via LocalMissionRunner with throwaway git-ignored
 * mission files and a spy ledger. Pure invariants (C,D) call the exemption function directly. Zero
 * network, no human grant simulated, self-cleaning (saves/restores the shared artifact).
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { LocalMissionRunner } from "./local-mission-runner";

const require_ = createRequire(import.meta.url);
const authz = require_("../../runtime/core/capability-authorization.js") as {
  safeModeDryRunExemption: (
    c: string,
    req: { verifyEvidence?: string; capabilitySpecPresent?: boolean; executeRequested?: boolean; fetcherPresent?: boolean },
  ) => { exempt: boolean; code?: string; detail?: string; safeProbe?: string };
};

const SAFE_PROBE = "external-research-dry-run-planned";
let passed = 0;
function ok(label: string, fn: () => void): void { fn(); passed += 1; console.log(`  ok - ${label}`); }

const evi = path.join("runtime", "generated", "external-research-acquisition.json");
const prior = (() => { try { return fs.readFileSync(evi, "utf8"); } catch { return null; } })();
const spy = () => ({ skipped: true });

/** Throwaway mission. `live` injects a capabilitySpec requesting execute=true (LIVE intent) but NEVER a
 *  human grant — proving the LIVE path is not reachable through the safe-mode exemption. */
function writeMission(id: string, objectiveId: string, live = false): string {
  const file = path.join("runtime", "missions", `${id}.json`);
  const governance = live
    ? { capabilitySpec: { field: "research_acquisition", value: { authorized: true, execute: true, source_allowlist: ["https://src.example.org"], objective: "plan", items: [] } } }
    : {};
  fs.writeFileSync(file, JSON.stringify({
    mission: id, mode: "ENGINEERING", requires_engineering: true,
    authorized_paths: ["runtime/**"], authorizedPaths: ["runtime/**"],
    objectives: [{ id: objectiveId, goal: "produce a governed research dry-run plan (no network)", done_when: ["plan produced"], ...governance }],
    verify: [{ capability: "External Research Acquisition", evidence: SAFE_PROBE }],
  }));
  return file;
}

try {
  fs.mkdirSync(path.join("runtime", "generated"), { recursive: true });

  // A — ACCEPTANCE A/E: NO human grant, plan-only ⇒ safe dry-run runs, produces a DRY_RUN/acquired:false
  //     artifact with zero sources and ranked:[], and the mission is PROVEN (validated).
  {
    const id = "__SAFE_PROBE_NOGRANT__";
    const file = writeMission(id, "EXTERNAL_RESEARCH_1");
    fs.rmSync(evi, { force: true });
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id);
      ok("no grant + plan-only ⇒ safe dry-run executes and writes a DRY_RUN plan artifact", () => {
        assert.strictEqual(fs.existsSync(evi), true, "dry-run plan artifact was not written");
        const ev = JSON.parse(fs.readFileSync(evi, "utf8"));
        assert.strictEqual(ev.mode, "DRY_RUN");
        assert.strictEqual(ev.acquired, false);
        assert.deepStrictEqual(ev.sources, []);
        assert.deepStrictEqual(ev.ranked, []);
      });
      ok("no grant + plan-only ⇒ mission PROVEN via the safe-mode exemption (SUCCESS, validated)", () => {
        const status = (out.execution as { report?: { status?: string } })?.report?.status;
        assert.strictEqual(status, "SUCCESS");
        assert.strictEqual(out.validated, true);
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  // B — ACCEPTANCE B/D: LIVE intent (execute=true) WITHOUT a human grant ⇒ NOT exempt ⇒ blocked, the
  //     executor never runs, no artifact, and the mission is NOT proven. The exemption never arms LIVE.
  {
    const id = "__SAFE_PROBE_LIVE_NOGRANT__";
    const file = writeMission(id, "EXTERNAL_RESEARCH_1", true);
    fs.rmSync(evi, { force: true });
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id);
      ok("LIVE intent (execute=true) + no grant ⇒ blocked: no acquisition artifact written", () => {
        assert.strictEqual(fs.existsSync(evi), false, "a LIVE run produced an artifact without a human grant");
      });
      ok("LIVE intent (execute=true) + no grant ⇒ mission NOT proven (fail-closed)", () => {
        const status = (out.execution as { report?: { status?: string } })?.report?.status;
        assert.strictEqual(status, "FAILED");
        assert.strictEqual(out.validated, false);
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  // C — ACCEPTANCE C: a capability with NO safeProbe (git/bash) is never exempt — grant stays mandatory.
  ok("Governed Bash/Linux Command (no safeProbe) ⇒ exempt:false NO_SAFE_PROBE", () => {
    const r = authz.safeModeDryRunExemption("Governed Bash/Linux Command", { verifyEvidence: "bash-command-governed" });
    assert.strictEqual(r.exempt, false);
    assert.strictEqual(r.code, "NO_SAFE_PROBE");
  });
  ok("Governed Git Branch Integration (no safeProbe) ⇒ exempt:false NO_SAFE_PROBE", () => {
    assert.strictEqual(authz.safeModeDryRunExemption("Governed Git Branch Integration", { verifyEvidence: "git-branch-integrated" }).exempt, false);
  });

  // D — ACCEPTANCE D: the exemption is a strict conjunction; any live intent or a mismatched probe fails
  //     closed, and the positive case requires exactly the declared safeProbe with no live intent.
  ok("External Research + safeProbe + plan-only ⇒ exempt:true (the governed safe path)", () => {
    const r = authz.safeModeDryRunExemption("External Research Acquisition", { verifyEvidence: SAFE_PROBE });
    assert.strictEqual(r.exempt, true);
    assert.strictEqual(r.safeProbe, SAFE_PROBE);
  });
  ok("safeProbe declared but execute=true ⇒ exempt:false LIVE_EXECUTE (never exempts LIVE)", () => {
    const r = authz.safeModeDryRunExemption("External Research Acquisition", { verifyEvidence: SAFE_PROBE, executeRequested: true });
    assert.strictEqual(r.exempt, false);
    assert.strictEqual(r.code, "LIVE_EXECUTE");
  });
  ok("safeProbe declared but a fetcher is present ⇒ exempt:false LIVE_FETCHER", () => {
    const r = authz.safeModeDryRunExemption("External Research Acquisition", { verifyEvidence: SAFE_PROBE, fetcherPresent: true });
    assert.strictEqual(r.exempt, false);
    assert.strictEqual(r.code, "LIVE_FETCHER");
  });
  ok("a privileged capabilitySpec present ⇒ exempt:false PRIVILEGED_SPEC (grant-gated; bypass defense kept)", () => {
    const r = authz.safeModeDryRunExemption("External Research Acquisition", { verifyEvidence: SAFE_PROBE, capabilitySpecPresent: true });
    assert.strictEqual(r.exempt, false);
    assert.strictEqual(r.code, "PRIVILEGED_SPEC");
  });
  ok("declared verify evidence is the LIVE probe, not the safeProbe ⇒ exempt:false NOT_SAFE_PROBE", () => {
    const r = authz.safeModeDryRunExemption("External Research Acquisition", { verifyEvidence: "research-acquired" });
    assert.strictEqual(r.exempt, false);
    assert.strictEqual(r.code, "NOT_SAFE_PROBE");
  });
  ok("no declared verify evidence ⇒ exempt:false NOT_SAFE_PROBE (a safeProbe alone is insufficient)", () => {
    assert.strictEqual(authz.safeModeDryRunExemption("External Research Acquisition", {}).exempt, false);
  });

  console.log(`\nruntime-executor.safe-probe-authorization: ${passed} assertions passed`);
} finally {
  if (prior === null) fs.rmSync(evi, { force: true });
  else fs.writeFileSync(evi, prior);
}
