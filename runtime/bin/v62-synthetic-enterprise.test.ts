#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§7) — synthetic-enterprise lifecycle test. Verifies the engine runs the full 9-stage lifecycle,
 * is deterministic, fail-closed on malformed input, honestly degrades adversarial/high-pressure tiers (no inflated
 * success), labels everything SYNTHETIC/FICTIF (never a real client/sale/payment), and the runner artifact aggregates
 * outcomes across métiers × tiers.
 */

const path = require("path");
const fs = require("fs");
const SE = require("../core/synthetic-enterprise.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V62_SYNTHETIC_ENTERPRISE_SIM.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const baseMid = { metier: "P9", company: { name: "TestCo", sector: "SaaS", size: "PME" }, tier: "MID", unitPriceEur: 5000 };

function main(): void {
  // nominal MID ⇒ full lifecycle, renewed
  const mid = SE.simulateEnterpriseLifecycle(baseMid);
  check("MID lifecycle ok + 9 stages traced", mid.ok === true && mid.trace.length === SE.STAGES.length);
  check("MID reaches RENEWED", mid.outcome === "RENEWED");
  check("basis SYNTHETIC/FICTIF (never real client/sale/payment)", /SYNTHETIC|FICTIF/i.test(mid.basis) && /never a real client/i.test(mid.basis));

  // determinism
  check("deterministic (same input ⇒ identical lifecycle)", JSON.stringify(SE.simulateEnterpriseLifecycle(baseMid)) === JSON.stringify(mid));

  // fail-closed
  check("malformed input ⇒ ok:false", SE.simulateEnterpriseLifecycle(null).ok === false && SE.simulateEnterpriseLifecycle({ metier: "P9" }).ok === false);

  // ADVERSARIAL ⇒ honest degradation (no inflated success)
  const adv = SE.simulateEnterpriseLifecycle({ ...baseMid, tier: "ADVERSARIAL" });
  check("ADVERSARIAL tier does NOT renew (honest degradation)", adv.ok === true && adv.outcome !== "RENEWED");
  check("ADVERSARIAL fails early (qualification)", adv.outcome === "LOST_AT_QUALIFICATION" && adv.stagesCompleted < SE.STAGES.length);

  // invoicing is TEST-mode (no real payment) somewhere in a completed lifecycle
  check("invoicing stage is TEST-mode (no real payment)", mid.trace.some((t: any) => t.stage === "invoicing" && /TEST-mode/i.test(t.detail)));

  // runner artifact
  let art: any = null; try { art = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("runner artifact exists + runs across métiers×tiers", !!art && art.runCount === art.companyCount * art.tiers.length && art.runCount >= 24);
  check("artifact: adversarial runs correctly not all renewed", !!art && /adversarial runs correctly did NOT renew/i.test(art.adversarialHandled));
  check("artifact invariant labels everything synthetic", !!art && /clearly labelled synthetic|nothing is presented as a real result/i.test(art.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V62 synthetic-enterprise lifecycle (deterministic, fail-closed, adversarial honest, SYNTHETIC)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
