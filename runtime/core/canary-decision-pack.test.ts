#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the canary decision pack PREPARES without activating: safe read-only candidate
// ⇒ READY_FOR_OWNER_AUTHORIZATION with the exact one-shot env change; unsafe (engineering/network/spend/destructive)
// ⇒ NOT_READY + blockers; never activates, never fabricates, deny-by-default preserved.
"use strict";
const assert = require("assert");
const C = require("./canary-decision-pack.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) a real read-only mission (G10) ⇒ safe.
const g10 = { mission: "G10_READONLY_AUTONOMY_PROBE", requiresEngineering: false, authorizedPaths: [] };
const a = C.assessCanaryCandidate(g10);
ok("read-only mission ⇒ safe, no blockers", a.safe === true && a.blockers.length === 0 && a.checks.readOnly === true);

// (2) engineering mission (authorizedPaths) ⇒ NOT safe.
ok("engineering mission ⇒ NOT safe", C.assessCanaryCandidate({ mission: "SOME_ENG", requiresEngineering: true, authorizedPaths: ["src/"] }).safe === false);
// network / spend / destructive ⇒ blocked.
ok("network ⇒ blocked", C.assessCanaryCandidate({ mission: "NET_X", requiresEngineering: false, authorizedPaths: [], network: true }).blockers.some(b => /network/.test(b)));
ok("spend ⇒ blocked", C.assessCanaryCandidate({ mission: "SPEND_X", requiresEngineering: false, authorizedPaths: [], budgetEur: 10 }).blockers.some(b => /spend/.test(b)));
ok("destructive ⇒ blocked", C.assessCanaryCandidate({ mission: "DESTROY", requiresEngineering: false, authorizedPaths: [], destructive: true }).blockers.some(b => /destructive/.test(b)));
// invalid id (shell metachars) ⇒ blocked (no injection).
ok("invalid mission id ⇒ blocked", C.assessCanaryCandidate({ mission: "bad; rm -rf", requiresEngineering: false, authorizedPaths: [] }).safe === false);

// (3) decision pack for a safe candidate: NOT activated, exact minimal change, acceptance+revocation present.
const pack = C.buildDecisionPack(g10);
ok("pack NOT activated + deny-by-default preserved", pack.activated === false && /did NOT authorize/.test(pack.note));
ok("pack verdict READY_FOR_OWNER_AUTHORIZATION", pack.verdict.startsWith("READY_FOR_OWNER_AUTHORIZATION") && pack.safeForCanary === true);
ok("pack exact minimal change = one-shot ENV single id", /ODG_CANARY_ALLOWLIST=G10_READONLY_AUTONOMY_PROBE/.test(pack.minimalChange.exact) && /NOT committed/.test(pack.minimalChange.type));
ok("pack forbids weakening deny-by-default / multi-id", pack.minimalChange.forbidden.some(f => /deny-by-default/.test(f)) && pack.minimalChange.forbidden.some(f => />1 id/.test(f)));
ok("pack has bounds + acceptance + revocation", pack.bounds.stop && /PASSES iff/.test(pack.acceptance) && /deny-by-default IDLE/.test(pack.revocation));
ok("pack confirms no network/spend/destructive for the candidate", pack.noNetworkSpendDestructive === true);

// (4) unsafe candidate ⇒ NOT_READY, no activation.
const bad = C.buildDecisionPack({ mission: "ENG_X", requiresEngineering: true, authorizedPaths: ["src/"] });
ok("unsafe candidate ⇒ NOT_READY, no minimal change offered", bad.verdict.startsWith("NOT_READY") && bad.minimalChange.exact === "none — resolve blockers first" && bad.activated === false);

console.log(`\nCANARY-DECISION-PACK suite — ${pass} assertions passed. (prepares without activating; safe read-only ⇒ READY; unsafe ⇒ NOT_READY+blockers; deny-by-default preserved; no fabrication)`);
