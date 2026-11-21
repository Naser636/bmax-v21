#!/usr/bin/env node
"use strict";
/*
 * V360 — CHAINS RUN (runtime entry). Closes a real DRIFT the Boussole's own principle surfaced: five V360 chain modules were
 * CONNECTED to their target (they gave a dormant engine a consumer) but were themselves TEST-ONLY — no runtime entry, so not
 * OPERATIONAL "in a real execution path" (directive standard). This bin is that path: it runs all five on-demand chains with
 * SAFE inputs (SYNTHETIC / DRY), demonstrating each end-to-end so the capability is reachable + runnable, not merely tested.
 *
 * SAFE: the live-collection chain runs DRY (kill-switch OFF ⇒ no egress); everything else is pure/synthetic. No mutation, no
 * mission created, no repair applied, no activation (DEFERRED stays DEFERRED). Usage: npx tsx runtime/bin/odg-v360-chains-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const r = (m: string) => require(path.join(ROOT, "runtime", "core", m + ".js"));
const LEARN = r("odg-native-learning-pass");
const CRA = r("odg-cra-remediation-chain");
const DECO = r("odg-mission-decompose-chain");
const COLLECT = r("odg-radar-collect-to-signals");
const DEFER = r("odg-radar-to-deferred-lot");
const HTTP = r("bounded-http-client");

(async () => {
  const out: any = { ran: "v360-chains", mode: "SYNTHETIC/DRY — no egress, no mutation, no mission, no repair, no activation" };

  // 1) LEARNING: recurring real failures → lessons (P1).
  const KEY = "native-build:MONOLITHIC:COMPLEX";
  const learn = LEARN.learnFromNativeOutcomes([
    { missionId: "m1", type: KEY, outcome: "FAILURE", independentlyVerified: true },
    { missionId: "m2", type: KEY, outcome: "FAILURE", independentlyVerified: true },
    { missionId: "m3", type: "native-build:MONOLITHIC:TRIVIAL", outcome: "SUCCESS", independentlyVerified: true },
  ]);
  out.learning = { lessons: learn.lessons, recurring: learn.recurringErrors, counted: learn.counted };

  // 2) CRA auto-healing: detection→plan→verify (plan-only).
  const cra = CRA.remediationChain({ findings: [{ id: "CVE-1", severity: "HIGH", component: "left-pad", version: "1.0.0", cve: "CVE-1", fixedVersion: "1.3.0", fixVerified: true }], before: { components: [{ name: "left-pad", version: "1.0.0" }] }, after: { components: [{ name: "left-pad", version: "1.3.0" }] } });
  out.craRemediation = { stage: cra.stage, actionable: cra.plan.actionableVerifiedFix, verify: (cra.verify && cra.verify.resolutions || [])[0] && (cra.verify.resolutions[0].resolution) };

  // 3) C2 decomposition → canonical selection (select-only).
  const deco = DECO.decomposeAndSelect({ id: "P-demo", kind: "B_human", needsSignOff: true, evidence: {} }, { qualify: () => "ABSENT", resolve: () => false });
  out.decomposition = { selected: deco.selected, executable: deco.executable.length, signOffReserved: deco.signOffGated.length };

  // 4) Radar collection → qualification (DRY — no egress).
  const col = await COLLECT.collectToProposals({ url: `https://${HTTP.ALLOWLIST[0]}/api/datasets/1.0/search/?rows=1`, sourceId: "ted", recordsPath: "results", titleField: "name" });
  out.radarCollectionDry = { decision: col.decision, enabled: col.enabled };

  // 5) Radar proposals → DEFERRED governed lots (activation owner-gated).
  const prop = { status: "PROPOSED", grantsNoPermission: true, candidateId: "demo-cand", objective: "evaluate demo candidate" };
  const defer = DEFER.integrateProposals([prop], { items: [] });
  out.radarDeferred = { deferred: defer.deferred, anyDeferredSelectable: defer.anyDeferredSelectable };

  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  const ok = learn.lessons.length >= 1 && cra.stage === "DETECT_PLAN_VERIFY" && typeof deco.selected === "string" && col.decision === "DRY_RUN" && defer.deferred.length >= 1 && defer.anyDeferredSelectable === false;
  process.stdout.write(ok ? "\nOK — all 5 V360 chains ran end-to-end (SYNTHETIC/DRY). They are now reachable in a real execution path (drift closed).\n" : "\nPARTIAL — see per-chain output\n");
  process.exit(ok ? 0 : 1);
})();
export {};
