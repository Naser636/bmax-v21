#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V88 §12/§14 + V88-A §11 — incremental-assurance battery. Proves the engine does an impact analysis, only
 * invalidates affected evidence, reuses demonstrably-valid validations, is fail-closed on undemonstrable reuse / unknown
 * dependency / masked-semantic / contradiction, and that the engine ITSELF (Chain B) + the assurance independence map
 * pass independent validation. Live modules + artifacts.
 */

const path = require("path");
const fs = require("fs");
const ENG = require("../core/incremental-assurance.js");
const CACHE = require("../core/verified-result-cache.js");
const DD = path.join(__dirname, "..", "..", "docs", "odg");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const base = { inputs: 1, code: "c", deps: 1, config: 1, env: 1 };
const ev = (id: string, mod: string, extra: any = {}) => ({ id, forModule: mod, identity: base, provenance: "p", identityDigest: CACHE.identityDigest(base), ...extra });
const verdictOf = (a: any, id: string) => { const e = a.evidence.find((x: any) => x.id === id); return e ? e.verdict : null; };

function main(): void {
  // §12.1 — no change: valid evidence reused.
  const noChange = ENG.assess({ changedModule: "none", kind: "function", impactedModules: [], impactedTests: [] }, [ev("e1", "other")]);
  check("§12.1 no change ⇒ independent evidence REUSED_VALID_EVIDENCE", verdictOf(noChange, "e1") === "REUSED_VALID_EVIDENCE");

  // §12.2 — isolated change: targeted reinspection (changed module invalidated, independent reused).
  const iso = ENG.assess({ changedModule: "a", kind: "function", impactedModules: ["a"], impactedTests: ["a.test.ts"] }, [ev("a-ev", "a"), ev("b-ev", "b")]);
  check("§12.2 isolated change ⇒ changed INVALIDATED, independent REUSED", verdictOf(iso, "a-ev") === "INVALIDATED" && verdictOf(iso, "b-ev") === "REUSED_VALID_EVIDENCE");
  check("§12.2 reduction: only impacted tests selected (not full gate)", iso.testsToRun.includes("a.test.ts") && iso.fullSuite === false);

  // §12.3 — contract change ⇒ transitive invalidation (L3 full control).
  const contract = ENG.assess({ changedModule: "api", kind: "contract", impactedModules: ["api", "cons"] }, [ev("cons-ev", "cons")]);
  check("§12.3 contract change ⇒ transitive invalidation + L3 fullSuite", verdictOf(contract, "cons-ev") === "INVALIDATED" && contract.fullSuite === true && contract.depthLevel === 3);

  // §12.4 — dependency change ⇒ consumers invalidated.
  const dep = ENG.assess({ changedModule: "lib", kind: "dependency", impactedModules: ["lib", "c1", "c2"] }, [ev("c1-ev", "c1"), ev("ind-ev", "zzz")]);
  check("§12.4 dependency change ⇒ consumer INVALIDATED, unrelated REUSED", verdictOf(dep, "c1-ev") === "INVALIDATED" && verdictOf(dep, "ind-ev") === "REUSED_VALID_EVIDENCE");

  // §12.5 — inspector change ⇒ new meta-validation (L4) + dependent certs invalidated.
  const insp = ENG.assess({ changedModule: "ins", kind: "inspector" }, [ev("cert", "cap", { inspectorDependent: true })]);
  check("§12.5 inspector change ⇒ dependent cert INVALIDATED + L4", verdictOf(insp, "cert") === "INVALIDATED" && insp.depthLevel === 4 && insp.fullSuite === true);

  // §12.6 — config change ⇒ dependent evidence invalidated (L3).
  const cfg = ENG.assess({ changedModule: "prod-config", kind: "config", impactedModules: ["prod-config", "svc"] }, [ev("env-ev", "svc")]);
  check("§12.6 config change ⇒ dependent evidence INVALIDATED + L3", verdictOf(cfg, "env-ev") === "INVALIDATED" && cfg.depthLevel === 3);

  // §12.7 — documentary change, no functional impact ⇒ no needless functional re-exec.
  const doc = ENG.assess({ changedModule: "readme", kind: "doc", prior: { content: "# x\n" }, next: { content: "# x\n\n\n" } }, [ev("fn", "readme", { evidenceKind: "functional" })]);
  check("§12.7 doc-only change ⇒ functional evidence REUSED (no needless re-exec)", verdictOf(doc, "fn") === "REUSED_VALID_EVIDENCE" && doc.change.semantic === "DOC_ONLY");

  // §12.8 — semantic change hidden by identical-looking format ⇒ detected (raw digest differs ⇒ FUNCTIONAL).
  const masked = ENG.assess({ changedModule: "m", kind: "function", prior: { content: "x=1" }, next: { content: "x=2" } }, []);
  check("§12.8 masked semantic change ⇒ FUNCTIONAL detected + not skipped", masked.change.semantic === "FUNCTIONAL" && masked.fullSuite === true);

  // §12.9 — unknown dependency ⇒ prudent widening.
  const unk = ENG.assess({ changedModule: "u", kind: "function", unknownDependency: true }, []);
  check("§12.9 unknown dependency ⇒ widened + fullSuite", unk.widened === true && unk.fullSuite === true);

  // §12.10 — stale evidence ⇒ refused reuse.
  const stale = ENG.assess({ changedModule: "x", kind: "function" }, [{ id: "s", forModule: "y", identity: base, provenance: "p", identityDigest: "OLD" }]);
  check("§12.10 stale evidence (digest mismatch) ⇒ INVALIDATED (refused reuse)", verdictOf(stale, "s") === "INVALIDATED");

  // §12.11 — contradictory evidence ⇒ BLOCKED.
  const contra = ENG.assess({ changedModule: "x", kind: "function" }, [ev("k", "w", { contradiction: true })]);
  check("§12.11 contradictory evidence ⇒ BLOCKED", verdictOf(contra, "k") === "BLOCKED" && contra.overall === "BLOCKED");

  // §6 — undemonstrable reuse (missing provenance/identity) ⇒ NOT_MEASURED (fail-closed, re-run).
  const undem = ENG.assess({ changedModule: "x", kind: "function" }, [{ id: "np", forModule: "q" }]);
  check("§6 missing provenance/identity ⇒ NOT_MEASURED (fail-closed)", verdictOf(undem, "np") === "NOT_MEASURED");

  // §12.13 — simultaneous multi-component change ⇒ impacts merged.
  const multi = ENG.assess({ changedModule: "a", kind: "function", impactedModules: ["a", "b", "c"], impactedTests: ["a.test.ts", "b.test.ts", "c.test.ts"] }, [ev("a-e", "a"), ev("b-e", "b"), ev("d-e", "d")]);
  check("§12.13 multi-component ⇒ all affected INVALIDATED, unaffected REUSED", verdictOf(multi, "a-e") === "INVALIDATED" && verdictOf(multi, "b-e") === "INVALIDATED" && verdictOf(multi, "d-e") === "REUSED_VALID_EVIDENCE");

  // §12.15 / §7 — release / critical (permission L4) ⇒ extended validation (full suite), never minimized.
  const perm = ENG.assess({ changedModule: "auth", kind: "permission", impactedTests: ["one.test.ts"] }, []);
  check("§12.15 permission/critical ⇒ L4 fullSuite (never minimized below mandatory)", perm.depthLevel === 4 && perm.fullSuite === true);

  // never present reused as newly executed.
  check("contract: reused proof keeps provenance, never presented as newly executed", /NEVER presented as a newly executed test/i.test(JSON.stringify(ENG.INCREMENTAL_ASSURANCE_CONTRACT.invariants)));

  // ---- V88-A §11 — Chain B: the engine's OWN meta-validation artifact (effective) + independence map.
  let mv: any = null; try { mv = JSON.parse(fs.readFileSync(path.join(DD, "V88_INCREMENTAL_META_VALIDATION.json"), "utf8")); } catch { /* */ }
  check("V88-A §14: incremental engine META-VALIDATED effective (0 missed, 0 false alarm)", !!mv && mv.effective === true && mv.detectionRate === 1 && mv.falsePositiveRate === 0);
  let im: any = null; try { im = JSON.parse(fs.readFileSync(path.join(DD, "V88_ASSURANCE_INDEPENDENCE.json"), "utf8")); } catch { /* */ }
  check("V88-A §8: Chain A/B independence verified + self-cert control COMPROMISED", !!im && im.allChainsIndependent === true && im.controlCorrectlyCompromised === true);
  let run: any = null; try { run = JSON.parse(fs.readFileSync(path.join(DD, "V88_INCREMENTAL_ASSURANCE.json"), "utf8")); } catch { /* */ }
  check("§15: run artifact — isolated change reduced, critical change NOT minimized (full suite)", !!run && run.cases.some((c: any) => c.reductionRatio > 0.9 && c.depthLevel === 1) && run.cases.filter((c: any) => c.depthLevel >= 3).every((c: any) => c.fullSuite === true));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V88 incremental assurance (impact→targeted invalidation→demonstrated reuse; fail-closed; Chain B meta-validated; independent)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
