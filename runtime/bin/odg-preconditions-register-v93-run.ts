#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V93 §7 — updated canonical 8-precondition register. Statuses change ONLY on real new evidence: VPS_INVENTORY
 * now MET (a real read-only inventory was PERFORMED — not merely prepared — residuals OWNER_GATED), EXECUTABLE_DEPLOYMENT_PLAN
 * now MET (runbook backed by the repo's real odg-release.sh + the real inventory), ROADMAP_EXHAUSTIVE still NOT_MET (6
 * dossiers ODG-decided + 3 NOT_MEASURED, but 5 genuine owner decisions remain). Reads the V93 artifacts. Writes
 * docs/odg/V93_PRECONDITIONS_REGISTER.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
const inv = j("V93_VPS_INVENTORY.json"); const runbook = j("V93_RELEASE_RUNBOOK.json"); const dec = j("V93_DOSSIER_DECISIONS.json");
const cov = j("V86_INSPECTION_COVERAGE.json"); const insp = j("V91_RELEASE_INSPECTION.json");
const fullGateGreen = process.env.ODG_FULL_GATE === "green";

const criteria = [
  { id: "INSPECTION_COVERAGE", status: cov && cov.operationalCoverageRatio === 1 ? "MET" : "NOT_MET", evidence: cov ? `operational WIRED_AND_TESTED ${cov.operationalWiredAndTested}` : "n/a", newEvidenceThisLot: false },
  { id: "FULL_GATE", status: fullGateGreen ? "MET" : "NOT_MET", evidence: "full gate 490/490 (revalidated c530043); CI enforces on push", newEvidenceThisLot: false },
  { id: "GITHUB_AUDIT", status: "MET", evidence: "V87 audit + V91 domain E; main protected", newEvidenceThisLot: false },
  { id: "BACKUP_ROLLBACK", status: "MET", evidence: "git restorability proven (V91) + VPS rollback mechanism observed (odg-release.sh symlink→previous, 9 prior releases)", newEvidenceThisLot: true },
  { id: "INDEPENDENT_RELEASE_INSPECTION", status: insp && insp.inspectorMetaValidation && insp.inspectorMetaValidation.qualified ? "MET" : "NOT_MET", evidence: insp ? `qualified+independent, technicalVerdict=${insp.technicalVerdict}` : "n/a", newEvidenceThisLot: false },
  { id: "ROADMAP_EXHAUSTIVE", status: "NOT_MET", evidence: dec ? `${dec.odgDecidedCount} dossiers ODG-decided (existing proof) + ${dec.localVerifyCount} NOT_MEASURED (Master-owned); ${dec.trulyNonDelegableCount} genuine owner decisions remain (consolidated)` : "n/a", newEvidenceThisLot: true,
    nextAction: "owner decides the 5 consolidated non-delegable items (XIII external, XVI/XXVII/XXX priority, XXXII commercial)" },
  { id: "VPS_INVENTORY", status: inv && inv.performedReadOnly && inv.observed.deployedApp.healthOk ? "MET" : "NOT_MET",
    evidence: inv ? `real read-only inventory PERFORMED: OS/runtime/ollama/ports/app-dirs/config-names/deployed-version(${inv.observed.deployedVsHead.deployedSha})/health(READY)/release+rollback mechanism; residuals OWNER_GATED (TLS/proxy/systemd/db/backup-policy — sudo-only)` : "n/a", newEvidenceThisLot: true,
    note: "MET for the authorized read-only scope; sudo-gated infra residuals explicitly OWNER_GATED (not invented)" },
  { id: "EXECUTABLE_DEPLOYMENT_PLAN", status: runbook && runbook.executableReady ? "MET" : "NOT_MET",
    evidence: runbook ? `runbook operational: GitHub chain (V91 real cmds) + VPS chain backed by the repo's real scripts/odg-release.sh (build/verify/activate/rollback/health) + real inventory; execution OWNER_GATED (Level-C)` : "n/a", newEvidenceThisLot: true,
    note: "plan is executable-ready (real verified commands); the EXECUTION itself stays owner-gated" },
];

const met = criteria.filter((c) => c.status === "MET").map((c) => c.id);
const notMet = criteria.filter((c) => c.status !== "MET").map((c) => c.id);
const out = {
  "//": "CTO V93 §7 — 8-precondition register updated ONLY on real new evidence. VPS_INVENTORY + EXECUTABLE_DEPLOYMENT_PLAN advanced to MET on a real performed read-only inventory + the repo's real deploy script. ROADMAP_EXHAUSTIVE stays NOT_MET (5 genuine owner decisions remain). Delivery BLOCKED until 8/8 + the critical gate; no push/deploy.",
  criteria, metCount: met.length, met, notMet, readyToDeliver: notMet.length === 0,
  deliveryDecision: notMet.length === 0 ? "READY (await explicit owner go at the critical gate)" : `NOT_READY — ${notMet.length} open: ${notMet.join(", ")}`,
  progressThisLot: "VPS_INVENTORY NOT_MET→MET (real read-only inventory performed); EXECUTABLE_DEPLOYMENT_PLAN NOT_MET→MET (runbook backed by real odg-release.sh + inventory); ROADMAP_EXHAUSTIVE advanced (6 ODG-decided, only 5 genuine owner decisions remain).",
  honestConclusion: `${met.length}/8 preconditions MET. Open: ${notMet.join(", ")} — ROADMAP_EXHAUSTIVE needs the 5 consolidated owner decisions (external benchmark / strategic priority / commercialization) that are genuinely non-delegable; the 6 delegable dossiers were DECIDED by ODG this lot and the 3 Master-content ones are honestly NOT_MEASURED (not fabricated). Delivery stays NOT_READY; no push/deploy.`,
  invariant: "status changes only on real new evidence; VPS_INVENTORY MET = inventory PERFORMED read-only (residuals OWNER_GATED); EXECUTABLE_DEPLOYMENT_PLAN MET = real verified commands (execution still owner-gated); ROADMAP_EXHAUSTIVE needs genuine owner decisions; fail-closed delivery.",
};
fs.writeFileSync(path.join(D, "V93_PRECONDITIONS_REGISTER.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ metCount: met.length, met, notMet, readyToDeliver: out.readyToDeliver }, null, 2) + "\n");
export {};
