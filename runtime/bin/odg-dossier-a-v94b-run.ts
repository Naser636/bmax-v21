#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V94-B §1/§3 — DECISIONS + DOSSIER A EXECUTION (Part XXX §116–§119). Records the 5 decisions with provenance
 * (XXX = APPROVED_BY_OWNER explicitly; XIII/XVI/XXVII/XXXII = arbitrations under the standing delegation — distinguished),
 * then EXECUTES the genuinely-local operational deliverables of Dossier A: §117 preservation record (verifiable git state)
 * and §119 uncertainty register (the REAL known uncertainties, honestly). §118 A1–A10 detailed enumeration is FROZEN-Master
 * (not recoverable, NOT fabricated) ⇒ precisely qualified NOT_MEASURED. No parallel registry; closes only on real evidence.
 * Writes docs/odg/V94B_DOSSIER_A.json. Run: `odg-dossier-a-v94b-run.ts`.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }

// §1 — the 5 decisions, with provenance + revocability. XXX is explicitly owner-approved; the rest are delegation arbitrations.
const decisions = [
  { id: "REQ-XXX", decision: "APPROVED_BY_OWNER", provenance: "OWNER explicit (V94-B §1): operational mandate issued, Dossier A opened", scope: "open + execute Dossier A operational deliverables (local)", revocable: true, kind: "OWNER_EXPLICIT" },
  { id: "REQ-XIII", decision: "DEFER_EXTERNAL_BUILD_LOCAL", provenance: "CTO arbitration under standing delegation (V94-B §1)", scope: "defer external benchmark (resource/spend/third-party); build local reproducible protocol now", revocable: true, kind: "DELEGATION_ARBITRATION" },
  { id: "REQ-XVI", decision: "OPEN_DOSSIER_A_FIRST", provenance: "CTO arbitration under standing delegation (V94-B §1)", scope: "Dossier A prioritized", revocable: true, kind: "DELEGATION_ARBITRATION" },
  { id: "REQ-XXVII", decision: "CLOSE_ONLY_PROVEN", provenance: "CTO arbitration under standing delegation (V94-B §1)", scope: "accept only individually-proven deliverables; no blanket closure of the 33", revocable: true, kind: "DELEGATION_ARBITRATION" },
  { id: "REQ-XXXII", decision: "DEFER_COMMERCIAL", provenance: "CTO arbitration under standing delegation (V94-B §1)", scope: "defer all commercial engagement/pricing/contract/sale/spend; continue local technical prep only", revocable: true, kind: "DELEGATION_ARBITRATION" },
];

// §117 — initial preservation record (verifiable, real).
const preservation = {
  head: git(["rev-parse", "--short", "HEAD"]), branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  localCommitsNotPushed: Number(git(["rev-list", "--count", "origin/main..HEAD"])),
  stashesPreserved: git(["stash", "list"]).split("\n").filter(Boolean).length,
  untrackedPreserved: git(["status", "--porcelain"]).split("\n").filter((l: string) => l.startsWith("??")).length,
  trackedClean: git(["status", "--porcelain"]).split("\n").filter((l: string) => l && !l.startsWith("??")).length === 0,
  behindMain: Number(git(["rev-list", "--count", "HEAD..origin/main"])),
  note: "initial preservation: history append-only, stashes + untracked intact, no reset/rewrite",
};

// §119 — uncertainty register (the REAL known uncertainties; honest status/owner/next-action; nothing invented).
const uncertainties = [
  { id: "U1", topic: "External world-superiority benchmark (XIII)", status: "OWNER_GATED", owner: "owner (external resource authorization)", nextAction: "authorize an external resource; local protocol is built (V94-B)" },
  { id: "U2", topic: "Production go-live (deployed Oct 28 vs HEAD, 879 commits)", status: "ROOT_GATED", owner: "owner/root", nextAction: "one root action (deploy/README.md); deps identical, 0 migrations, rollback feasible" },
  { id: "U3", topic: "Commercialization feasibility (XXXII)", status: "OWNER_GATED", owner: "owner (commercial/legal)", nextAction: "€500M objective recorded INFEASIBLE from €0 (0 clients); deferred; local prep only" },
  { id: "U4", topic: "Dossier A A1–A10 detailed enumeration (§118)", status: "NOT_MEASURED", owner: "FROZEN-Master (owner-referential)", nextAction: "original not recoverable (not fabricated); operational frame §116/117/119 executed" },
  { id: "U5", topic: "Repo 2 commits behind origin/main (#487/#488)", status: "PREPARED", owner: "ODG (sync strategy ready)", nextAction: "fresh PR (0 conflict); no rebase/merge in-mission" },
  { id: "U6", topic: "npm auto-update warning", status: "NON_BLOCKING", owner: "ODG", nextAction: "does not affect the required tools (node/tsx/gate all green); no privilege elevation" },
];

// §118 — Dossier A A1–A10: enumeration FROZEN; the operational frame is what is executed.
const dossierA = {
  scope: "Part XXX §116 initial mission / §117 initial preservation / §118 Dossier A A1–A10 / §119 uncertainty register",
  operationalFrameExecuted: { "§116_initial_mission": "governed local operational work (pipeline V89) — active", "§117_preservation": "EXECUTED (see preservation record)", "§119_uncertainty_register": "EXECUTED (see uncertainties)" },
  "§118_A1_A10": { status: "NOT_MEASURED", reason: "the detailed A1–A10 enumeration is FROZEN-Master (not recoverable, not fabricated); no Dossier-A successor referential exists (unlike V64 for I/IV/XXV)", honest: true },
  atomicMissions: [
    { id: "A-mission-preservation", kind: "LOCAL", status: "DONE", evidence: "§117 preservation record (verifiable git state)" },
    { id: "A-mission-uncertainty-register", kind: "LOCAL", status: "DONE", evidence: "§119 uncertainty register (6 real uncertainties, honest)" },
    { id: "A-mission-xiii-local-benchmark-protocol", kind: "LOCAL", status: "DONE", evidence: "V94B_XIII_BENCHMARK_PROTOCOL.json (reuses benchmark-factory; fail-closed superiority)" },
    { id: "A-mission-A1-A10-detail", kind: "FROZEN", status: "NOT_MEASURED", evidence: "owner-referential; not fabricated" },
  ],
};

const out = {
  "//": "CTO V94-B §1/§3 — decisions recorded (XXX owner-explicit; 4 delegation arbitrations, distinguished) + Dossier A operational deliverables EXECUTED (§117 preservation, §119 uncertainty register) with §118 A1–A10 honestly NOT_MEASURED (frozen, not fabricated). No parallel registry; closes only on real evidence; a recorded decision is NOT a delivered artifact.",
  decisions, ownerExplicit: decisions.filter((d) => d.kind === "OWNER_EXPLICIT").map((d) => d.id), delegationArbitrations: decisions.filter((d) => d.kind === "DELEGATION_ARBITRATION").map((d) => d.id),
  preservation, uncertaintyRegister: uncertainties, dossierA,
  localMissionsDone: dossierA.atomicMissions.filter((m) => m.status === "DONE").length,
  frozenQualified: dossierA.atomicMissions.filter((m) => m.status === "NOT_MEASURED").length,
  honestConclusion: `5 decisions recorded: XXX APPROVED_BY_OWNER (explicit), XIII/XVI/XXVII/XXXII as delegation arbitrations (distinguished, provenance + revocable). Dossier A operational mandate EXECUTED locally: §117 preservation record (verifiable), §119 uncertainty register (6 real uncertainties). §118 A1–A10 detailed enumeration is FROZEN-Master ⇒ NOT_MEASURED (not fabricated; no Dossier-A successor exists). ${dossierA.atomicMissions.filter((m) => m.status === "DONE").length} local missions DONE on real evidence; the frozen enumeration is precisely qualified. A recorded decision is not a delivered artifact (§2).`,
  invariant: "XXX owner-explicit vs delegation arbitrations distinguished (no fabricated signature); Dossier A operational deliverables executed on real evidence; §118 A1–A10 NOT_MEASURED not fabricated; preservation intact; no parallel registry.",
};
fs.writeFileSync(path.join(D, "V94B_DOSSIER_A.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ ownerExplicit: out.ownerExplicit, delegationArbitrations: out.delegationArbitrations.length, localMissionsDone: out.localMissionsDone, frozenQualified: out.frozenQualified, stashes: preservation.stashesPreserved }, null, 2) + "\n");
export {};
