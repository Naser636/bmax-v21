#!/usr/bin/env node
/**
 * broad-it-eval-ingest — the COMPUTER-PREPARABLE completion of the broad-it-independent-eval-set blocker: an
 * ingestion + measurement harness that, GIVEN an independent third-party-labelled eval set, admits it (fail-closed
 * via independent-label-policy) and computes a REAL broad-IT rate by running each VALIDATION case through the REAL
 * code-execution checker and comparing the checker's PASS/FAIL to the EXTERNAL label. After this, the ONLY remaining
 * step for the blocker is the owner supplying a genuinely independent labelled file — the mechanism is done.
 *
 * Honesty (fail-closed, no self-certification): a set whose provenance is self-authored/ODG-labelled, or lacks
 * dev/validation separation, is NOT admitted ⇒ broadIT = NO_DATA (never MEASURED). A MEASURED rate is produced ONLY
 * over an admitted, independent set, and reflects the REAL checker run against the supplied labels (the harness does
 * NOT trust labels blindly — it executes the checker and reports the confusion, so a wrong label shows up as an error).
 * Composes independent-label-policy + code-execution; NO new primitive. Pure given an injected runner.
 */
"use strict";

const fs = require("fs");
const LP = require("./independent-label-policy.js");
const EXEC = require("./code-execution.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * measureOnEvalSet(evalSet, opts?): evalSet = { provenance, cases:[{id, partition:"dev"|"validation", language,
 * content, label:"PASS"|"FAIL"}] }. opts: { runner?, toolchain? }. Returns a fail-closed measurement:
 *   - not admitted ⇒ { admitted:false, broadIT:"NO_DATA", reasons }
 *   - admitted ⇒ { admitted:true, broadIT: n>0?"MEASURED":"NO_DATA", n, accuracy, confusion }
 * Only VALIDATION-partition cases are scored (dev is for development). UNSUPPORTED/BLOCKED checks are excluded (not guessed).
 */
function measureOnEvalSet(evalSet: any, opts: any = {}): any {
  if (!isObj(evalSet) || !Array.isArray(evalSet.cases)) return { ok: false, code: "INVALID_INPUT", reason: "evalSet { provenance, cases:[...] } required" };
  const cases = evalSet.cases.filter((c: any) => isObj(c) && typeof c.id === "string");
  const devIds = cases.filter((c: any) => c.partition === "dev").map((c: any) => c.id);
  const validationIds = cases.filter((c: any) => c.partition === "validation").map((c: any) => c.id);

  const admit = LP.admitEvalSet({ provenance: evalSet.provenance, devIds, validationIds });
  if (!admit.admitted) {
    return { ok: true, admitted: false, broadIT: "NO_DATA", reasons: admit.reasons, note: "eval set NOT admitted (not independent / not dev-val-separated) — broad-IT stays NO_DATA, never self-certified" };
  }

  const runner = typeof opts.runner === "function" ? opts.runner : undefined;
  const toolchain = isObj(opts.toolchain) ? opts.toolchain : EXEC.detectToolchain(runner ? { runner } : {});
  const confusion = { truePass: 0, trueFail: 0, falsePass: 0, falseFail: 0, excluded: 0 };
  let n = 0, correct = 0;
  for (const c of cases) {
    if (c.partition !== "validation") continue;                       // score the held-out validation partition only
    if (c.label !== "PASS" && c.label !== "FAIL") { confusion.excluded++; continue; }
    const available = toolchain[c.language] === true;
    const r = EXEC.runSyntaxCheck({ language: c.language, content: c.content, toolchainAvailable: available, ...(runner ? { runner } : {}) });
    if (r.status !== "PASS" && r.status !== "FAIL") { confusion.excluded++; continue; }   // UNSUPPORTED/BLOCKED ⇒ excluded, not guessed
    n++;
    const predicted = r.status, actual = c.label;
    if (predicted === actual) { correct++; if (actual === "PASS") confusion.truePass++; else confusion.trueFail++; }
    else if (predicted === "PASS") confusion.falsePass++;             // checker said PASS, label FAIL
    else confusion.falseFail++;                                        // checker said FAIL, label PASS
  }
  const accuracy = n > 0 ? Number((correct / n).toFixed(4)) : null;
  return {
    ok: true, admitted: true, broadIT: n > 0 ? "MEASURED" : "NO_DATA",
    n, accuracy, confusion, validationCount: validationIds.length, devCount: devIds.length,
    note: n > 0
      ? "MEASURED broad-IT rate over an ADMITTED independent eval set: real code-execution checker vs EXTERNAL labels on the validation partition. Labels not trusted blindly — mismatches appear as falsePass/falseFail."
      : "admitted, but no scorable validation case ran (toolchain absent for all) — NO_DATA, not guessed",
  };
}

/** ingestFile(path, opts?): read a JSON eval-set file and measure. Missing/unparseable ⇒ fail-closed error. */
function ingestFile(path: string, opts: any = {}): any {
  const sink = opts.fs || fs;
  let text: string;
  try { text = sink.readFileSync(path, "utf8"); } catch { return { ok: false, code: "NO_FILE", reason: `cannot read eval-set file '${path}'` }; }
  let parsed: any;
  try { parsed = JSON.parse(text); } catch (e: any) { return { ok: false, code: "PARSE_ERROR", reason: `invalid JSON: ${(e && e.message) || e}` }; }
  return measureOnEvalSet(parsed, opts);
}

export { measureOnEvalSet, ingestFile };
module.exports = { measureOnEvalSet, ingestFile };

if (require.main === module) {
  const p = process.argv[2];
  if (!p) { process.stdout.write(JSON.stringify({ usage: "broad-it-eval-ingest <eval-set.json> — admits an INDEPENDENT eval set + measures broad-IT; NO_DATA if not independent" }, null, 2) + "\n"); process.exit(0); }
  const r = ingestFile(p);
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  process.exit(r.ok && r.broadIT === "MEASURED" ? 0 : 1);
}
