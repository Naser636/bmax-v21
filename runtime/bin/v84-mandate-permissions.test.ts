#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V84 §2/§3/§12 — permanent-mandate + blocked-parent-separation test. Verifies the 10 named permanent
 * permissions are owner-granted with provenance (revocable), Level-C is never granted, public research is read-only, and
 * the 7-category separation lets a gated parent's local sub-work PROCEED while human/external stays reserved. Live module
 * + artifact. No self-widening by the provider.
 */

const path = require("path");
const fs = require("fs");
const M = require("../core/local-work-mandate.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V84_MANDATE_PERMISSIONS.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §2 — 10 permanent permissions
  check("10 named permanent permissions defined", M.PERMISSIONS.length === 10);
  check("every permanent permission granted with owner provenance", M.PERMISSIONS.every((c: string) => { const r = M.permits(c); return r.permitted === true && /OWNER/.test(r.provenance); }));
  check("public web research permitted; read-only scope", M.permits("PUBLIC_WEB_RESEARCH").permitted === true && /READ_ONLY/.test(M.permits("PUBLIC_WEB_RESEARCH").scope));
  check("Level-C never granted (spend/deploy/push/sudo)", ["spend", "deploy", "push", "sudo"].every((c) => M.permits(c).permitted === false));
  check("unknown capability ⇒ not granted (fail-closed)", M.permits("frobnicate").permitted === false);
  check("revocable: revoked ⇒ not permitted", M.permits("LOCAL_ENGINEERING", { revoked: true }).permitted === false);

  // §3 — 7-category separation
  const sep = M.separateBlockedParent({ id: "P", subWork: [{ id: "a", category: "LOCAL_DONE" }, { id: "b", category: "PUBLIC_RESEARCH" }, { id: "c", category: "LOCAL_SIMULATION" }, { id: "d", category: "HUMAN_DECISION" }, { id: "e", category: "EXTERNAL_DEPENDENCY" }] });
  check("categories 1–5 PROCEED (local/research/data/sim/prep)", sep.proceedNow.length === 3 && sep.proceedNow.includes("a") && sep.proceedNow.includes("b") && sep.proceedNow.includes("c"));
  check("categories 6–7 reserved (human/external)", sep.reservedOnly.length === 2 && sep.reservedOnly.includes("d") && sep.reservedOnly.includes("e"));
  check("7 categories defined", M.CATEGORIES.length === 7);

  // artifact
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("artifact: all 10 permitted, Level-C all refused", !!m && m.allPermitted === true && m.levelCAllRefused === true);
  check("artifact: gated parents' local sub-work proceeds (>reserved)", !!m && m.totalProceedNow > m.totalReservedOnly && m.totalReservedOnly === 14);
  check("invariant: owner-granted, revocable, Level-C excluded, no self-widening", !!m && /no self-widening/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V84 permanent mandate (10 permissions, Level-C refused, blocked-parent sub-work proceeds)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
