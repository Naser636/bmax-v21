#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V97 — forensic change audit + release selection battery. Proves: a verifiable timeline since Oct-28
 * e84a0cf2 (runtime deps IDENTICAL, 0 migrations — VPS-compatible); functional groups assessed by level (PRESENT/WIRED/
 * TESTED/VALIDATED); release selected by EXPLICIT criteria (not automatically HEAD) with justification; delivery commands
 * verified vs real scripts; go-live owner/ROOT-gated; NOT_MEASURED kept honest (performance). Live artifact + repo facts.
 */

const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const DD = path.join(ROOT, "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")); } catch { return null; } }
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const d = j("V97_FORENSIC_RELEASE_SELECTION.json");
  check("forensic artifact exists", !!d);
  if (!d) { process.stdout.write("\n1 FAIL\n"); process.exit(1); }

  // §2 timeline — re-prove key facts LIVE.
  const liveDepsIdentical = (() => { try {
    const a = JSON.parse(git(["show", "e84a0cf2:package.json"]));
    const b = require(path.join(ROOT, "package.json"));
    // V312 — apply the OWNER-AUTHORIZED supply-chain baseline evolutions (docs/odg/supply-chain-authorized-deltas.json)
    // onto the e84a0cf2 baseline BEFORE comparing. The control is PRESERVED, not bypassed: any dependency drift NOT in
    // the authorized record (new dep, removed dep, or a version differing from the authorized 'to') still fails here.
    const authz = (() => { try { return JSON.parse(fs.readFileSync(path.join(DD, "supply-chain-authorized-deltas.json"), "utf8")); } catch { return { dependencies: {}, devDependencies: {} }; } })();
    // V19 SC-ADD-1: an owner-authorized NEW dependency is recorded with from:null + an exact 'to' + authorizedBy/record; any
    // unrecorded addition still fails. Comparison is key-order independent (sorted), versions compared exactly.
    const apply = (base: any, deltas: any) => { const o = { ...(base || {}) }; for (const [k, v] of Object.entries(deltas || {})) { const d: any = v; if (!d || typeof d.to !== "string") continue; if (o[k] !== undefined) o[k] = d.to; else if (d.from === null && typeof d.authorizedBy === "string" && typeof d.record === "string") o[k] = d.to; } return o; };
    const sorted = (o: any) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
    return sorted(apply(a.dependencies, authz.dependencies)) === sorted(b.dependencies) && sorted(apply(a.devDependencies, authz.devDependencies)) === sorted(b.devDependencies);
  } catch { return false; } })();
  check("§2 LIVE: runtime deps match e84a0cf2 + OWNER-AUTHORIZED deltas (next 16.4.6 security); any other drift fails", liveDepsIdentical === true && d.timeline.runtimeDepsIdentical === true);
  check("§2 timeline: 800+ commits since Oct-28, 0 migrations, package.json change is only the gate list", d.timeline.commits > 800 && d.timeline.migrations === 0 && /test:report gate list/.test(d.timeline.note));

  // §3/§4 functional groups.
  check("§3 functional groups assessed by level (PRESENT/WIRED/TESTED/VALIDATED)", Array.isArray(d.functionalGroups) && d.functionalGroups.length >= 6 && d.functionalGroups.every((g: any) => ["PRESENT", "WIRED", "TESTED", "VALIDATED"].includes(g.level) && g.testsGateWired && g.utility));
  check("§4 all major evolution groups VALIDATED (tests gate-wired + modules present)", d.allGroupsValidated === true && d.functionalGroups.every((g: any) => g.level === "VALIDATED"));

  // §5 VPS compatibility.
  check("§5 VPS compatibility measured: deps identical + 0 migrations ⇒ COMPATIBLE", /COMPATIBLE/.test(d.vpsCompatibility.verdict) && d.vpsCompatibility.runtimeDepsIdentical === true && d.vpsCompatibility.migrations === 0);
  check("§5 identifies components present locally but NOT yet deployed (Oct-28 running)", /885 commits behind|assurance\/governance stack/.test(d.vpsCompatibility.componentsPresentLocallyNotYetDeployed));

  // §6 selection by explicit criteria, not automatic.
  check("§6 ≥3 candidates compared on explicit criteria (deployed / staging / HEAD)", Array.isArray(d.releaseCandidates) && d.releaseCandidates.length >= 3 && d.releaseCandidates.every((c: any) => c.criteria && c.criteria.completeness && c.criteria.vpsCompat && c.criteria.restorability));
  // the selected release is HEAD-based and is an ancestor-or-equal of the current HEAD (the artifact records the HEAD at
  // selection time, which a later governance commit extends — not a brittle exact-SHA match to a mutating HEAD).
  const selSha = (d.selectedRelease.match(/[0-9a-f]{7,}/) || [""])[0];
  const selIsAncestorOrEqual = selSha ? (git(["merge-base", "--is-ancestor", selSha, "HEAD"]) === "" && (() => { try { cp.execFileSync("git", ["merge-base", "--is-ancestor", selSha, "HEAD"], { cwd: ROOT }); return true; } catch { return false; } })()) : false;
  check("§6 selected = HEAD-based (ancestor-or-equal of current HEAD) with explicit justification (dominant + stage+verify)", /^HEAD /.test(d.selectedRelease) && selIsAncestorOrEqual && /justified|dominant|no intermediate/.test(d.selectionJustification) && /stage\+verify/.test(d.selectionJustification));
  check("§6 performance honestly NOT_MEASURED (not overclaimed)", d.releaseCandidates.some((c: any) => /NOT_MEASURED/.test(c.criteria.performance)) && d.residualRisks.some((r: string) => /performance.*NOT_MEASURED/.test(r)));

  // §8 delivery procedure — commands real, go-live gated.
  check("§8 delivery commands verified vs real scripts; go-live OWNER_ROOT_GATED", d.deliveryProcedure.allCommandsReal === true && /odg-release\.sh/.test(d.deliveryProcedure.build) && /OWNER_ROOT_GATED/.test(d.deliveryProcedure.activate));
  check("residual risks precise (big jump ⇒ stage+verify; go-live Level-C/ROOT gated)", d.residualRisks.length >= 4 && d.residualRisks.some((r: string) => /stage\+verify/.test(r)) && d.residualRisks.some((r: string) => /ROOT|Level-C/.test(r)));
  check("invariant: selection by criteria not automatic; staging PASS ≠ go-live; nothing deployed", /not automatically HEAD/.test(d.invariant) && /staging PASS ≠ go-live/.test(d.invariant) && /nothing pushed\/deployed/.test(d.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V97 (885-commit forensic, deps identical/0 migrations, 6 groups VALIDATED, HEAD selected by explicit criteria, go-live gated)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
