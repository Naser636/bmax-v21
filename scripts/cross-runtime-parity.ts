// @ts-nocheck
/*
 * ARTIFACT-COMPARISON CORE (formerly the cross-runtime JS/TS parity harness).
 *
 * ZERO-JS: the impure parity DRIVER (which spawned `node runtime/bin/odg-run.js` vs the compiled dist entry
 * and backed `npm run parity:runtimes`) is RETIRED — there is no longer a JavaScript runtime to compare the
 * compiled TypeScript against. What remains are the PURE, reusable, unit-testable comparison primitives
 * (normalizeArtifact / compareArtifact / verdict) still consumed by src/runtime/semantic-parity.ts to
 * compare any two artifacts after ISO-8601 timestamp normalization. No child process, no network, no I/O.
 */
"use strict";

const ARTIFACTS = ["mission-report.json", "mission-ledger.json", "mission-lifecycle.json", "patch-execution.json"];
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g;

// Normalize ONLY justified volatile data: ISO-8601 timestamps → "<TS>". Returns the normalized text and
// the count of substitutions (an ASYMMETRIC count between runtimes is itself treated as a divergence).
function normalizeArtifact(text: any) {
  if (typeof text !== "string") return { text: "", tsCount: 0 };
  let tsCount = 0;
  const out = text.replace(ISO, () => { tsCount += 1; return "<TS>"; });
  return { text: out, tsCount };
}

// Compare one artifact across two sources. `js`/`ts` are {present, raw} where raw is the file text
// (or null when absent). Business bytes must match after timestamp normalization; presence and timestamp
// counts must match too. No other normalization is applied.
function compareArtifact(name: any, js: any, ts: any) {
  const result = { name, jsPresent: js.present, tsPresent: ts.present, identical: false, reason: "" };
  if (js.present !== ts.present) { result.reason = `presence mismatch (js=${js.present} ts=${ts.present})`; return result; }
  if (!js.present && !ts.present) { result.identical = true; result.reason = "both absent"; return result; }
  const njs = normalizeArtifact(js.raw);
  const nts = normalizeArtifact(ts.raw);
  if (njs.tsCount !== nts.tsCount) { result.reason = `timestamp-count asymmetry (js=${njs.tsCount} ts=${nts.tsCount}) — possible real divergence`; return result; }
  if (njs.text === nts.text) { result.identical = true; result.reason = njs.tsCount ? `byte-identical after ${njs.tsCount} timestamp normalizations` : "byte-identical (no normalization)"; return result; }
  // first divergent offset for forensics (on the normalized text, so it points at a BUSINESS diff)
  let i = 0; const a = njs.text, b = nts.text;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  result.reason = `BUSINESS DIVERGENCE at offset ${i}: js=${JSON.stringify(a.slice(i, i + 60))} ts=${JSON.stringify(b.slice(i, i + 60))}`;
  return result;
}

// Decide an overall verdict + exit code from per-scenario results.
// scenarios: [{ name, class, blocked?:string, exitJs, exitTs, artifacts:[compareArtifact...], touchProof?:{ok,detail} }]
function verdict(scenarios: any) {
  const required = ["READ_ONLY", "ENGINEERING_WRITE", "ECONOMIC_TOUCH"];
  const covered = new Set(scenarios.filter((s: any) => !s.blocked).map((s: any) => s.class));
  const blockedClasses = required.filter((c: any) => !covered.has(c));
  let hasDivergence = false;
  const notes = [];
  for (const s of scenarios) {
    if (s.blocked) { notes.push(`${s.class}: BLOCKED — ${s.blocked}`); continue; }
    if (s.exitJs !== s.exitTs) { hasDivergence = true; notes.push(`${s.class}: exit-code mismatch js=${s.exitJs} ts=${s.exitTs}`); }
    for (const a of s.artifacts) if (!a.identical) { hasDivergence = true; notes.push(`${s.class}/${a.name}: ${a.reason}`); }
    if (s.touchProof && !s.touchProof.ok) { hasDivergence = true; notes.push(`${s.class}: touch-proof failed — ${s.touchProof.detail}`); }
  }
  if (hasDivergence) return { verdict: "FAIL", exitCode: 1, notes, blockedClasses };
  if (blockedClasses.length) return { verdict: "BLOCKED", exitCode: 2, notes, blockedClasses };
  return { verdict: "PASS", exitCode: 0, notes, blockedClasses };
}

module.exports = { normalizeArtifact, compareArtifact, verdict, ARTIFACTS };
export {};
