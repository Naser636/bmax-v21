#!/usr/bin/env node
"use strict";
/* V182 §4.2 — digital_distribution. Proves: semver + checksum + metadata enforcement; rights deny-by-default; channel
 * checks; publication ALWAYS OWNER_GATED (never autonomous); version ledger traceability + retract. */
const D = require("./odg-digital-distribution.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const md = { title: "ODG Compliance SaaS", description: "NIS2 readiness", license: "proprietary" };
  const pkg = D.preparePackage("odg-nis2", "1.2.0", [{ path: "app.tgz", bytes: 1024, content: "x" }], md);
  check("valid package prepared with deterministic manifest checksum", pkg.ok === true && typeof pkg.manifestChecksum === "string" && pkg.manifestChecksum.length === 64 && pkg.metadataComplete === true);
  check("bad semver rejected", D.preparePackage("p", "1.2", [{ path: "a" }], md).code === "BAD_SEMVER");
  check("no artifacts rejected", D.preparePackage("p", "1.0.0", [], md).code === "NO_ARTIFACTS");
  check("incomplete metadata ⇒ not publishable", (() => { const p = D.preparePackage("p", "1.0.0", [{ path: "a", bytes: 1 }], { title: "t" }); return p.ok && p.metadataComplete === false && p.missingMetadata.includes("license"); })());
  check("checksum deterministic across identical inputs", D.preparePackage("p", "1.0.0", [{ path: "a", content: "z", bytes: 1 }], md).manifestChecksum === D.preparePackage("p", "1.0.0", [{ path: "a", content: "z", bytes: 1 }], md).manifestChecksum);

  // ---- rights ----
  check("rights deny-by-default without a license declaration", D.validateRights(pkg, []).ok === false && D.validateRights(pkg, []).code === "NO_LICENSE_DECLARED");
  check("rights ok with explicit license", D.validateRights(pkg, ["proprietary"]).ok === true);

  // ---- channel compatibility ----
  const chan = { name: "partner-portal", requires: ["title", "license"] };
  check("channel compatible when required metadata present", D.channelCompatibility(pkg, chan).compatible === true);
  check("channel incompatible when required metadata missing", (() => { const p = D.preparePackage("p", "1.0.0", [{ path: "a", bytes: 1 }], { title: "t" }); return D.channelCompatibility(p, chan).compatible === false && D.channelCompatibility(p, chan).missing.includes("license"); })());

  // ---- publication is ALWAYS owner-gated ----
  const pub = D.publishDecision(pkg, D.validateRights(pkg, ["proprietary"]), chan);
  check("publishDecision is OWNER_GATED and never publishes autonomously", pub.status === "OWNER_GATED" && pub.published === false && /NEVER publishes autonomously/.test(pub.note));
  check("ready package has no blockers but still owner-gated", pub.readyForOwnerReview === true && pub.blockers.length === 0 && pub.published === false);
  check("unready package surfaces blockers (still not published)", (() => { const p = D.preparePackage("p", "1.0.0", [{ path: "a", bytes: 1 }], { title: "t" }); const dec = D.publishDecision(p, D.validateRights(p, []), chan); return dec.published === false && dec.blockers.includes("metadata-incomplete") && dec.blockers.includes("rights-missing"); })());

  // ---- version ledger + retract ----
  const led = D.versionLedger([{ version: "1.0.0", checksum: "a" }, { version: "1.2.0", checksum: "b" }, D.retract({ version: "1.1.0", checksum: "c" }, "security")]);
  check("ledger latest-publishable excludes retracted versions", led.latestPublishable === "1.2.0" && led.retracted.includes("1.1.0"));
  check("retract is governed + traceable", D.retract({ version: "2.0.0" }, "defect").retracted === true && /traceable/.test(D.retract({ version: "2.0.0" }, "defect").note));

  // ---- contract ----
  check("contract: OWNER_GATED publish + rights-deny-by-default + no parallel system", D.DIGITAL_DISTRIBUTION_CONTRACT.invariants.some((i: string) => /OWNER_GATED/.test(i) && /NEVER publishes/.test(i)) && D.DIGITAL_DISTRIBUTION_CONTRACT.invariants.some((i: string) => /denied by default/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — digital-distribution (§4.2: semver+checksum+metadata enforced; rights deny-by-default; channel checks; publication ALWAYS OWNER_GATED never autonomous; version ledger traceability + governed retract)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
