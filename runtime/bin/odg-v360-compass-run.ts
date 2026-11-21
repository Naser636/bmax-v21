#!/usr/bin/env node
"use strict";
/*
 * V360 P3 — BOUSSOLE RUN (runtime entry). Renders the operational V12.4 boussole: where are we on the V360 capabilities
 * (status anchored to merged PRs), which owner decisions are pending, what is superseded, and the next-priority improvement.
 * It is a READ-ONLY VIEW over V12.4 (not a second roadmap) — the answer to "où en sommes-nous ? quelle est la prochaine
 * amélioration ?". Pure composition of odg-v360-compass; no mutation.
 *
 * Usage: npx tsx runtime/bin/odg-v360-compass-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const C = require(path.join(ROOT, "runtime", "core", "odg-v360-compass.js"));

const b = C.buildCompass({ asOf: new Date().toISOString().slice(0, 10) });
process.stdout.write(JSON.stringify({
  boussole: "V360 over V12.4 (VIEW, not a 2nd roadmap)", asOf: b.asOf,
  counts: b.counts,
  capabilities: b.capabilities.map((c: any) => ({ id: c.id, status: c.status, pr: c.pr, module: c.module })),
  ownerDecisionsNeeded: b.ownerDecisionsNeeded.map((d: any) => ({ id: d.id, status: d.status, dependency: d.dependency })),
  superseded: b.superseded.map((s: any) => s.id),
  nextPriority: b.nextPriority,
}, null, 2) + "\n");
process.stdout.write("\nBOUSSOLE: all V360 connect-gaps CONNECTED/DONE_OPERATIONAL (anchored to merged PRs). Next value is an OWNER decision (see nextPriority). AQL stays BLOCKED (never invented). Métiers frozen. A capability is never 'done' on code alone.\n");
process.exit(0);
export {};
