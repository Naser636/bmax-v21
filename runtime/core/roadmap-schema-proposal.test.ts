#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the NON-MUTATING roadmap schema proposal: VALID on the real governed roadmap
// (dep-planner validates acyclic/layerable), fail-closed on unknown refs / uncited edges (no fabricated deps) / cycles,
// and that it never mutates the protected ROADMAP.json (the governed file still has no dependsOn field).
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const P = require("./roadmap-schema-proposal.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const rm = (ids) => ({ missions: ids.map((id) => ({ id, title: id })) });
const withProv = (edges) => { const prov = {}; for (const [k, arr] of Object.entries(edges)) for (const d of arr) prov[P.provenanceKey(k, d)] = `cited: ${k} after ${d}`; return prov; };

// (1) VALID: B depends on A, cited ⇒ dep-planner layers produced, edge applied.
const v1 = P.buildProposal({ roadmap: rm(["A", "B"]), deps: { dependencies: { B: ["A"] }, provenance: withProv({ B: ["A"] }) } });
ok("cited edge + real refs ⇒ VALID, dep-planner layered, dependsOn proposed", v1.verdict === "VALID" && v1.edgesApplied === 1 && v1.layers.length === 2 && v1.proposed.missions.find((m) => m.id === "B").dependsOn[0] === "A");

// (2) INVALID_REFERENCES: dep not in roadmap.
const v2 = P.buildProposal({ roadmap: rm(["A"]), deps: { dependencies: { A: ["GHOST"] }, provenance: withProv({ A: ["GHOST"] }) } });
ok("dep not in roadmap ⇒ INVALID_REFERENCES", v2.verdict === "INVALID_REFERENCES" && v2.unknownRefs.some((u) => u.dep === "GHOST"));

// (3) UNCITED_EDGE: a dependency with no provenance citation is NEVER proposed (no fabricated deps).
const v3 = P.buildProposal({ roadmap: rm(["A", "B"]), deps: { dependencies: { B: ["A"] }, provenance: {} } });
ok("edge without provenance citation ⇒ UNCITED_EDGE (fail-closed, no fabrication)", v3.verdict === "UNCITED_EDGE" && v3.uncitedEdges.includes("B<-A"));

// (4) CYCLE: A<->B, cited ⇒ dep-planner throws ⇒ CYCLE_OR_PLAN_ERROR (surfaced, not crash).
const v4 = P.buildProposal({ roadmap: rm(["A", "B"]), deps: { dependencies: { A: ["B"], B: ["A"] }, provenance: withProv({ A: ["B"], B: ["A"] }) } });
ok("dependency cycle ⇒ CYCLE_OR_PLAN_ERROR (from dep-planner)", v4.verdict === "CYCLE_OR_PLAN_ERROR" && !!v4.planError);

// (5) fail-closed on bad input.
ok("no missions ⇒ INVALID_INPUT", P.buildProposal({ roadmap: {}, deps: { dependencies: {} } }).verdict === "INVALID_INPUT");
ok("no dependencies map ⇒ INVALID_INPUT", P.buildProposal({ roadmap: rm(["A"]), deps: {} }).verdict === "INVALID_INPUT");

// (6) REAL governed roadmap ⇒ VALID; DEPLOY gains the cited VPS dep; 2 layers.
const real = P.proposeFromRepo(process.cwd());
ok("real governed roadmap ⇒ VALID (11 missions, cited DEPLOY<-VPS, 2 layers)", real.verdict === "VALID" && real.missionCount === 11 && real.edgesApplied === 1 && real.diff.some((d) => d.mission === "DEPLOY_BMAX_DASHBOARD_PROD_V1" && d.addsDependsOn.includes("VPS_DEPLOYMENT_READINESS")) && real.layers.length === 2);

// (7) NON-MUTATING: the protected ROADMAP.json is untouched — it has NO dependsOn field (the proposal is a preview only).
const governed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "runtime", "governance", "ROADMAP.json"), "utf8"));
const governedMissions = governed.missions || governed.roadmap || [];
ok("governed ROADMAP.json NOT mutated (no dependsOn written there)", governedMissions.every((m) => !("dependsOn" in m)) && real.proposed["//"].includes("NOT the governed file"));

console.log(`\nROADMAP-SCHEMA-PROPOSAL suite — ${pass} assertions passed. (non-mutating preview; dep-planner-validated; fail-closed on unknown/uncited/cycle; governed file untouched)`);
