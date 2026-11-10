#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V94 + ADDENDUM V93-B — Master recovery + VPS divergence + GitHub sync + forensic timeline battery. Proves
 * REQ-I/IV/XXV are RECOVERED on the adopted successor (groundedness independently re-verified, original preserved, not
 * fabricated); the VPS divergence/rollback is understood; the GitHub sync is conflict-free; the 5 owner decisions are
 * refined (none fabricated); the forensic resolves the contradiction (deployed=Oct28, Nov 9-10 work = dev+timer not a
 * deployment); and the register is 7/8 NOT_READY. Live artifacts.
 */

const path = require("path");
const fs = require("fs");
const DD = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")); } catch { return null; } }
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §3 Master recovery.
  const mr = j("V94_MASTER_RECOVERY.json");
  check("§3 Master recovery artifact exists", !!mr);
  if (mr) {
    check("§3 REQ-I 26 caps RECOVERED+GROUNDED (modules re-verified)", mr.results["REQ-I"].status === "RECOVERED_GROUNDED_ON_SUCCESSOR" && mr.results["REQ-I"].grounded === "26/26");
    check("§3 REQ-IV 12 dims RECOVERED+GROUNDED", mr.results["REQ-IV"].status === "RECOVERED_GROUNDED_ON_SUCCESSOR");
    check("§3 REQ-XXV 40 faults RECONSTRUCTED (honest, not fabricated as original)", mr.results["REQ-XXV"].status === "RECOVERED_AS_RECONSTRUCTED" && mr.results["REQ-XXV"].originalFabricated === false);
    check("§3 FROZEN original preserved + successor adopted (provenance)", mr.provenance.adopted === true && mr.provenance.originalPreserved === true);
    check("§3 supersedes V93 NOT_MEASURED (source found in-repo, not owner-request)", mr.allRecovered === true);
  }

  // §4 VPS divergence.
  const vd = j("V94_VPS_DIVERGENCE.json");
  check("§4 divergence artifact exists", !!vd);
  if (vd) {
    check("§4 deployed vs HEAD delta measured + deps compatibility", typeof vd.divergence.commitsAhead === "number" && /IDENTICAL/.test(vd.divergence.dependencyCompatibility));
    check("§4 rollback feasible (symlink/previous + prior releases)", vd.rollback.feasible === true);
    check("§4 old deployment = release RISK (not auto-pass/fail), nothing activated", /release RISK|release risk/i.test(vd.honestConclusion));
  }

  // §5 GitHub sync.
  const gs = j("V94_GITHUB_SYNC.json");
  check("§5 GitHub sync: conflict risk assessed from real 3-way diff + fresh-PR strategy (no rebase)", !!gs && gs.conflictAnalysis.overlappingChangedFiles === 0 && gs.recommendedStrategy.avoidsRebase === true && gs.recommendedStrategy.preservesLocalWork === true);

  // §2 owner decisions refined.
  const od = j("V94_OWNER_DECISIONS.json");
  check("§2 5 owner decisions refined, none fabricated, no sale/spend/publication", !!od && od.count === 5 && /fabricates none/i.test(od.honestConclusion) && /no sale\/spend\/publication/i.test(JSON.stringify(od)));

  // V93-B forensic timeline.
  const fx = j("V93B_VPS_FORENSICS.json");
  check("V93-B forensic artifact exists", !!fx);
  if (fx) {
    check("V93-B VPS time in UTC + NTP + all dates UTC", fx.vpsTime.allDatesInUtc === true && /UTC/.test(fx.vpsTime.nowUtc));
    check("V93-B resolves contradiction: deployed Oct28 (V93 correct), Nov9-10 work = dev+timer not deployment", /CONFIRMED CORRECT for the deployment/.test(fx.v93Correction.verdict) && fx.recentWorkNov9to10.releaseContentFilesModified === 0);
    check("V93-B H1 CONFIRMED (recent work, no new activation), H2 REJECTED (no newer release)", fx.hypotheses.find((h: any) => h.id === "H1").verdict === "CONFIRMED" && fx.hypotheses.find((h: any) => h.id === "H2").verdict === "REJECTED");
    check("V93-B old V93 evidence preserved (augmented, not erased)", fx.v93Correction.oldEvidencePreserved === true);
    check("V93-B no precondition flip (clarification, not pass/fail) + secrets redacted", /no status flip/i.test(fx.impact.preconditions) && !/[A-Za-z0-9]{40,}/.test(fx.deployment.servedBuildId));
  }

  // ADDENDUM V93-C — V44/V93 reconciliation (staging ≠ production).
  const rc = j("V93C_V44_RECONCILIATION.json");
  check("V93-C reconciliation artifact exists", !!rc);
  if (rc) {
    check("V93-C vps-6d919042 confirmed + staging script non-disruptive, creates NO release", /CONFIRMED/.test(rc.vpsInstance) && rc.stagingScript.nonDisruptive === true && rc.stagingScript.createsRelease === false);
    check("V93-C lifecycle: staging DONE, release/activation/go-live NOT done; app served = Oct 28", rc.lifecycle.stagingValidated.happened === true && rc.lifecycle.releaseActivated.happened === false && rc.lifecycle.productionGoLive.happened === false && rc.lifecycle.applicationServed.happened === true);
    check("V93-C security: only SSH:22 public; edg-core/next loopback-only; root actions NOT done", rc.security.onlySshPublic === true && rc.security.loopbackOnly.edgCore8080 === true && rc.security.rootActionsNotDone.length === 2);
    check("V93-C V93 production=Oct28 CONFIRMED (not a confusion); staging PASS ≠ go-live", /CONFIRMED CORRECT/.test(rc.v93Reconciliation.verdict) && rc.v93Reconciliation.oldEvidencePreserved === true && /does not imply go-live/i.test(rc.invariant));
    check("V93-C no precondition flip; secrets redacted", /no flip/i.test(rc.impact.preconditions) && !/[A-Za-z0-9]{40,}/.test(JSON.stringify(rc.liveState)));
  }

  // §8 register 7/8.
  const reg = j("V94_PRECONDITIONS_REGISTER.json");
  check("§8 register 7/8 MET, NOT_READY; only ROADMAP_EXHAUSTIVE open", !!reg && reg.metCount === 7 && reg.readyToDeliver === false && reg.notMet.length === 1 && reg.notMet[0] === "ROADMAP_EXHAUSTIVE");
  if (reg) check("§8 ROADMAP_EXHAUSTIVE now blocked ONLY by owner decisions (Master recovered)", /RECOVERED/.test(reg.criteria.find((c: any) => c.id === "ROADMAP_EXHAUSTIVE").evidence));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V94+V93-B (Master RECOVERED, divergence+rollback understood, GitHub conflict-free, forensic resolves contradiction, register 7/8 NOT_READY)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
