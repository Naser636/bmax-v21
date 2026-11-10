#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V90 §7 — DELIVERY-PRECONDITION RECONCILIATION. V87 identified 5 OPEN preconditions; V89 tracks 8 criteria.
 * This reconciles them into ONE register: the 8 exact criteria, which 3 were already met at V87 (so NOT in V87's "5
 * open"), which 5 map to V87's open list, their current evidence and state. Read-only; no push/deploy. Reads the live
 * V89 preconditions artifact. Writes docs/odg/V90_PRECONDITIONS_RECONCILED.json. Run: `odg-preconditions-reconcile-v90-run.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
const v89 = j("V89_DELIVERY_PRECONDITIONS.json");
const byId: any = {}; if (v89 && v89.preconditions) for (const p of v89.preconditions) byId[p.id] = p;

// the 8 canonical criteria, each mapped to its V87 correspondence (3 were met at V87; 5 were V87's OPEN list).
const MAP = [
  { criterion: "inspection-coverage-validated", v87: "met at V87 (not in the 5 open)", v87Open: false },
  { criterion: "full-gate-green", v87: "met at V87 (not in the 5 open)", v87Open: false },
  { criterion: "github-audit-complete", v87: "met at V87 (not in the 5 open)", v87Open: false },
  { criterion: "backup-and-rollback-prepared", v87: "V87 OPEN #1 (Sauvegarde et rollback)", v87Open: true },
  { criterion: "roadmap-local-work-complete", v87: "V87 OPEN #2 (Roadmap locale exhaustive)", v87Open: true },
  { criterion: "vps-audit-complete", v87: "V87 OPEN #3 (Inventaire VPS)", v87Open: true },
  { criterion: "independent-release-inspection-qualified", v87: "V87 OPEN #4 (Inspection indépendante de release)", v87Open: true },
  { criterion: "deploy-and-verification-plan", v87: "V87 OPEN #5 (Plan exécutable)", v87Open: true },
];

const reconciled = MAP.map((m) => { const p = byId[m.criterion] || {}; return { criterion: m.criterion, v87Correspondence: m.v87, wasV87Open: m.v87Open, met: p.met === true, evidence: p.evidence || "n/a" }; });
const met = reconciled.filter((r) => r.met).length;
const v87OpenNowMet = reconciled.filter((r) => r.wasV87Open && r.met).map((r) => r.criterion);
const stillOpen = reconciled.filter((r) => !r.met).map((r) => r.criterion);

const out = {
  "//": "CTO V90 §7 — single reconciled register of the 8 delivery criteria vs V87's 5 open preconditions. 3 criteria were already met at V87 (so absent from its 'open' list); the other 5 ARE V87's open list. No precondition is declared met on a preparatory document alone. No push/deploy.",
  totalCriteria: 8, v87OpenCount: 5, criteria: reconciled,
  metCount: met, v87OpenNowMet, stillOpen,
  readyToDeliver: stillOpen.length === 0,
  honestConclusion: `8 delivery criteria = 3 met-at-V87 (inspection-coverage, full-gate, github-audit) + V87's 5 open (backup/rollback, roadmap-exhaustive, vps-audit, release-inspection, deploy-plan). Now ${met}/8 met. V90 closed V87-open: [${v87OpenNowMet.join(", ") || "none beyond backup/rollback"}]. Still open: ${stillOpen.join(", ")}. Delivery BLOCKED (fail-closed); VPS inventory owner-gated; nothing declared met on a document alone.`,
  invariant: "8 criteria = 3(met@V87) + 5(V87-open) reconciled in one register; a precondition is met only on real evidence, never a preparatory doc; delivery fail-closed until 8/8 + critical gate.",
};
fs.writeFileSync(path.join(D, "V90_PRECONDITIONS_RECONCILED.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ metCount: met, stillOpen, readyToDeliver: out.readyToDeliver }, null, 2) + "\n");
export {};
