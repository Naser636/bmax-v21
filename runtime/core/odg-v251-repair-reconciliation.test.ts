#!/usr/bin/env node
"use strict";
/* V258/V259 §5 — V251 repair reconciliation. GROUNDS the reconciliation against a LIVE catalog scan of the current core
 * (reusing odg-transform-catalog), proves the classification is HONEST (valid patterns NOT called defects; only dedupe is a
 * confirmed minor defect), and proves APPLICATION STAYS OWNER_GATED (0 applied, no disk write). Deterministic. */
const fs = require("fs");
const R = require("./odg-v251-repair-reconciliation.js");
const T = require("./odg-transform-catalog.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

// LIVE scan of the current core (the real grounding) — reuse the catalog, no second engine.
const POST_V251_FILES = ["odg-canonical-json.ts"];
function postBaselineFindings(): any { const out: any = {}; for (const file of POST_V251_FILES) { const src = fs.readFileSync("runtime/core/" + file, "utf8"); out[file] = T.TRANSFORM_IDS.filter((c: string) => T.runTransform({ classId: c, source: src }).outcome === "NATIVE_REPAIRED_GREEN"); } return out; }
function liveScan(): any {
  const dir = "runtime/core";
  // V17.5: files ADDED AFTER the V251 baseline are excluded from the baseline-stability scan (declared, not silent) and checked
  // separately below — ODG-native code (odg-canonical-json.ts, #978) must not be hand-edited by the provider to fit a frozen count.
  const files = fs.readdirSync(dir).filter((x: string) => x.endsWith(".ts") && !x.endsWith(".test.ts") && !POST_V251_FILES.includes(x));
  const perClass: any = {}; for (const c of T.TRANSFORM_IDS) perClass[c] = 0;
  for (const file of files) { let s: string; try { s = fs.readFileSync(dir + "/" + file, "utf8"); } catch (e) { continue; } for (const c of T.TRANSFORM_IDS) if (T.runTransform({ classId: c, source: s }).outcome === "NATIVE_REPAIRED_GREEN") perClass[c]++; }
  return { perClass };
}

function main() {
  const live = liveScan();
  const r = R.reconcile(live);

  // GROUNDED: the reconciliation reflects the REAL current scan, and it is STABLE vs the V251 baseline of 230.
  { const pb = postBaselineFindings(); check("post-V251 files (declared): odg-canonical-json.ts (ODG-native, #978) has only the ensure-use-strict scan finding (a scan count, not a defect) — excluded from the baseline-stability scan", JSON.stringify(pb["odg-canonical-json.ts"]) === JSON.stringify(["ensure-use-strict@1"])); }
  check("live scan reconciles to the V251 baseline total (230) — stable, grounded in the real catalog scan", r.baselineTotal === 230 && r.liveTotal === 230 && r.scanStable === true);
  check("per-class live counts are grounded (fed from the real catalog scan), with drift reported per class", r.classes.every((c: any) => typeof c.liveCount === "number" && typeof c.drift === "string") && r.classes.find((c: any) => c.classId === "ensure-dual-export@1").liveCount === 177);

  // HONEST classification (crux): valid patterns are NOT defects; only dedupe-require is a confirmed minor defect.
  check("CRUX: the '230' is NOT 230 defects — only dedupe-require-lines@1 is a CONFIRMED defect (4 instances)", JSON.stringify(r.confirmedDefectClasses) === JSON.stringify(["dedupe-require-lines@1"]) && r.confirmedDefectInstances === 4);
  check("dual-export / use-strict / sort-destructure are VALID_EXISTING_PATTERN (convention/style, not defects)", ["ensure-dual-export@1", "ensure-use-strict@1", "sort-named-destructure@1"].every((id) => { const c = r.classes.find((x: any) => x.classId === id); return c.isDefect === false && c.disposition === "VALID_EXISTING_PATTERN"; }));
  check("normalize-strict-equality@1 is NEEDS_CONTEXT (per-site review), not a blind defect", r.classes.find((c: any) => c.classId === "normalize-strict-equality@1").disposition === "NEEDS_CONTEXT");
  check("the overwhelming majority (216) are VALID_EXISTING_PATTERN, not defects", r.validPatternInstances === 177 + 36 + 3);

  // OWNER_GATED (crux): nothing applied, nothing written, mandate is not an implicit authorization.
  check("CRUX: APPLICATION STAYS OWNER_GATED — 0 applied, writesDisk false, ownerGated true", r.appliedCount === 0 && r.writesDisk === false && r.ownerGated === true);
  check("note states the mandate is NOT an implicit authorization to apply + '230 is a scan count not defects'", /NOT an implicit authorization/i.test(r.note) && /NOT 230 defects/i.test(r.note));

  // every class carries a rationale + rollback (auditable inventory).
  check("each class has a rationale + rollback (auditable inventory)", r.classes.every((c: any) => typeof c.rationale === "string" && c.rationale.length > 20 && typeof c.rollback === "string"));
  check("contract invariants: scan-count≠defects, valid-pattern-never-defect, OWNER_GATED, no 2nd engine", R.V251_REPAIR_RECONCILIATION_CONTRACT.invariants.some((i: string) => /NOT 230 defects/.test(i)) && R.V251_REPAIR_RECONCILIATION_CONTRACT.invariants.some((i: string) => /OWNER_GATED/.test(i)) && R.V251_REPAIR_RECONCILIATION_CONTRACT.invariants.some((i: string) => /no second engine/i.test(i)));

  // fail-closed + deterministic: no live counts ⇒ liveTotal null (NOT_RESCANNED), still owner-gated; frozen.
  const noScan = R.reconcile({});
  check("fail-closed: no live scan ⇒ liveTotal null / NOT_RESCANNED, still OWNER_GATED (never auto-apply)", noScan.liveTotal === null && noScan.appliedCount === 0 && noScan.ownerGated === true && noScan.classes.every((c: any) => c.drift === "NOT_RESCANNED"));
  check("deterministic + frozen", JSON.stringify(R.reconcile(live)) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(r.classes));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-v251-repair-reconciliation (V258/V259 §5: the '230' is a SCAN count not 230 defects; grounded live re-scan STABLE at 230; only dedupe-require@1 [4] is a CONFIRMED minor defect, 216 are VALID_EXISTING_PATTERN convention/style, strict-eq NEEDS_CONTEXT; APPLICATION STAYS OWNER_GATED [0 applied, no disk write]; reuses catalog, no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
