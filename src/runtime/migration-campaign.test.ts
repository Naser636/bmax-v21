#!/usr/bin/env node
/*
 * Migration Campaign Planner — deterministic unit + integration + resume + failure tests.
 *
 * Run directly with tsx (offline; fixtures are tiny temp dirs, the only non-fixture read is the real
 * repo for the integration check):
 *   node_modules/.bin/tsx src/runtime/migration-campaign.test.ts
 *
 * Proves: deterministic inventory/ranking, exclusion + hazard policy, the four surfaced states
 * (PASS/BLOCKED/SKIPPED/NONE), checkpoint round-trip in a DEDICATED namespace (no pipeline-checkpoint
 * clobber), resume continuity (progressedSince), and that an operational failure never yields a
 * false PASS. Recommendation ≠ authorisation is asserted in the PASS rationale.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  inventory,
  selectNextLot,
  readCheckpoint,
  writeCheckpoint,
  progressedSince,
  runPlan,
  EXCLUSIONS,
  CHECKPOINT_SCHEMA,
  type Checkpoint,
} from "./migration-campaign";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const temps: string[] = [];
/** Build a fixture repo root with a runtime/core populated from {name: source|null(.ts marker)}. */
function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcamp-"));
  temps.push(root);
  const core = path.join(root, "runtime", "core");
  fs.mkdirSync(core, { recursive: true });
  for (const [name, src] of Object.entries(files)) fs.writeFileSync(path.join(core, name), src);
  return root;
}

console.log("Migration Campaign Planner — tests");

// ── Contract: inventory classification + deterministic ranking ───────────────────────────────────
{
  const root = fixture({
    "alpha.js": "module.exports={};\n",
    "alpha.ts": "export {};\n", // alpha is ported (dual)
    "bravo.js": "module.exports={};\n", // safe, deps=0
    "charlie.js": "const b=require('./bravo');module.exports={};\n", // safe, deps=1
    "delta.js": "const p=require('path');const R=path.resolve(__dirname,'..');module.exports={R};\n", // hazard
    "budget-ledger.js": "module.exports={};\n", // excluded by policy
    "bravo.test.js": "// test file — ignored\n",
  });
  const inv = inventory(root);
  check(EQ(inv.ported, ["alpha"]), "inventory: dual .js+.ts ⇒ ported=[alpha]");
  check(EQ(inv.excluded, ["budget-ledger"]), "inventory: policy exclusion ⇒ excluded=[budget-ledger]");
  check(
    inv.candidates.map((c) => c.lot).join(",") === "bravo,charlie,delta",
    "inventory: candidates ranked deps/lines (bravo<charlie<delta), test file ignored",
  );
  const delta = inv.candidates.find((c) => c.lot === "delta")!;
  check(delta.hazard === true, "inventory: __dirname+path.resolve ⇒ hazard flag");
  check(inv.candidates.find((c) => c.lot === "charlie")!.deps === 1, "inventory: deps counted (charlie=1)");
  check(inv.counts.coreDual === 1 && inv.counts.candidates === 3 && inv.counts.excluded === 1 && inv.counts.blocked === 1, "inventory: counts correct");
  check(EQ(inventory(root), inventory(root)), "inventory: deterministic (identical on repeat)");

  const sel = selectNextLot(inv);
  check(sel.state === "PASS" && sel.lot === "bravo", "select: PASS ⇒ safest lot = bravo");
  check(/RECOMMENDATION ONLY/.test(sel.rationale) && /LOT_WRITE_SET/.test(sel.rationale), "select: rationale asserts recommendation ≠ authorisation (gate preserved)");
}

// ── State: BLOCKED (all candidates hazard-blocked) ───────────────────────────────────────────────
{
  const root = fixture({
    "only.js": "const p=require('path');const R=path.join(__dirname,'x');module.exports={R};\n",
  });
  const sel = selectNextLot(inventory(root));
  check(sel.state === "BLOCKED" && sel.lot === null, "select: all-hazard pool ⇒ BLOCKED, no lot (NOT a false PASS)");
}

// ── Hazard 2: dynamic require() is flagged (build-dist-closure static tracer rejects it) ─────────
{
  const root = fixture({
    "dyn.js": "const abs='./x.js';const m=require(abs);module.exports={m};\n", // dynamic require(identifier)
    "staticdep.js": "const x=require('./x');module.exports={x};\n", // static require ⇒ NOT a hazard
    "reqmeta.js": "delete require.cache[require.resolve('./x')];module.exports={};\n", // require.cache/resolve ⇒ NOT a hazard
  });
  const inv = inventory(root);
  const dyn = inv.candidates.find((c) => c.lot === "dyn")!;
  const sdep = inv.candidates.find((c) => c.lot === "staticdep")!;
  const meta = inv.candidates.find((c) => c.lot === "reqmeta")!;
  check(dyn.hazard === true && /dynamic require/.test(dyn.reason), "hazard: dynamic require(identifier) ⇒ BLOCKED with closure-tracer reason");
  check(sdep.hazard === false && sdep.deps === 1, "no false hazard: static require('./x') is admissible (deps counted)");
  check(meta.hazard === false, "no false hazard: require.cache/require.resolve are not dynamic require() calls");
  const pick = selectNextLot(inv).lot;
  check(pick !== "dyn" && (pick === "reqmeta" || pick === "staticdep"), `select: dynamic-require lot 'dyn' skipped; a safe lot chosen (${pick})`);
}

// ── Hazard 3: external package require() is flagged (build-dist-closure rejects it) ──────────────
{
  const root = fixture({
    "ext.js": "const c=require('imapflow');module.exports={c};\n", // external package ⇒ BLOCKED
    "builtinreq.js": "const fs=require('fs');const c=require('node:crypto');module.exports={fs,c};\n", // builtins ⇒ OK
    "reldep.js": "const x=require('./x');module.exports={x};\n", // relative ⇒ OK
  });
  const inv = inventory(root);
  const ext = inv.candidates.find((c) => c.lot === "ext")!;
  const bi = inv.candidates.find((c) => c.lot === "builtinreq")!;
  const rel = inv.candidates.find((c) => c.lot === "reldep")!;
  check(ext.hazard === true && /external package/.test(ext.reason), "hazard: require('imapflow') ⇒ BLOCKED (external package, closure-tracer reason)");
  check(bi.hazard === false, "no false hazard: require('fs')/require('node:crypto') are Node builtins");
  check(rel.hazard === false && rel.deps === 1, "no false hazard: relative require('./x') is admissible");
  check(selectNextLot(inv).lot !== "ext", "select: external-package lot is never recommended");
}

// ── State: SKIPPED (only excluded remain) + NONE (campaign complete) ─────────────────────────────
{
  const skipped = selectNextLot(inventory(fixture({ "budget-ledger.js": "module.exports={};\n" })));
  check(skipped.state === "SKIPPED" && skipped.lot === null, "select: only policy-excluded remain ⇒ SKIPPED");
  const none = selectNextLot(inventory(fixture({ "done.js": "", "done.ts": "export {};\n" })));
  check(none.state === "NONE" && none.lot === null, "select: everything ported ⇒ NONE (campaign complete)");
}

// ── Checkpoint: round-trip, schema-guard, DEDICATED namespace (no pipeline-checkpoint clobber) ───
{
  const root = fixture({ "bravo.js": "module.exports={};\n" });
  check(readCheckpoint(root) === null, "checkpoint: absent ⇒ null");
  const cp: Checkpoint = { schema: CHECKPOINT_SCHEMA, updatedAt: "2026-01-01T00:00:00.000Z", head: "abc1234", acceptedLots: ["alpha"], candidateCount: 1, lastRecommended: "bravo" };
  writeCheckpoint(root, cp);
  check(EQ(readCheckpoint(root), cp), "checkpoint: write→read round-trip identical");
  // bad schema ⇒ ignored (null), never a silent accept
  fs.writeFileSync(path.join(root, "runtime", "generated", "migration-campaign-checkpoint.json"), JSON.stringify({ schema: "other/9" }));
  check(readCheckpoint(root) === null, "checkpoint: foreign schema ⇒ null (guarded)");

  // runPlan --record writes ONLY the dedicated file; the shared mission pipeline-checkpoint is untouched.
  const r2 = fixture({ "bravo.js": "module.exports={};\n" });
  const out: string[] = [];
  const res = runPlan({ root: r2, record: true, now: () => "2026-02-02T00:00:00.000Z", head: "deadbee", log: (m) => out.push(m) });
  check(fs.existsSync(path.join(r2, "runtime", "generated", "migration-campaign-checkpoint.json")), "runPlan --record: writes dedicated campaign checkpoint");
  check(!fs.existsSync(path.join(r2, "runtime", "generated", "pipeline-checkpoint.json")), "runPlan --record: does NOT clobber shared pipeline-checkpoint.json (separate namespace)");
  check(res.exitCode === 0 && res.selection.lot === "bravo", "runPlan: exitCode 0 + recommends bravo");
  check(res.checkpoint!.head === "deadbee" && res.checkpoint!.updatedAt === "2026-02-02T00:00:00.000Z", "runPlan: injected head/now flow into checkpoint (deterministic)");
}

// ── Resume continuity: progressedSince ───────────────────────────────────────────────────────────
{
  const root = fixture({ "a.js": "", "a.ts": "export {};\n", "b.js": "", "b.ts": "export {};\n", "c.js": "module.exports={};\n" });
  const inv = inventory(root); // ported=[a,b]
  const prev: Checkpoint = { schema: CHECKPOINT_SCHEMA, updatedAt: "t0", head: null, acceptedLots: ["a"], candidateCount: 1, lastRecommended: "b" };
  check(EQ(progressedSince(prev, inv), ["b"]), "resume: progressedSince reports newly-accepted lot (b), not re-publishing a");
  check(EQ(progressedSince(null, inv), ["a", "b"]), "resume: no prior checkpoint ⇒ all ported counted");
}

// ── Failure / no-false-success: missing core dir throws; read-only never mutates source ──────────
{
  let threw = false;
  try {
    inventory(path.join(os.tmpdir(), "mcamp-nonexistent-" + process.pid));
  } catch {
    threw = true;
  }
  check(threw, "failure: missing runtime/core ⇒ throws (surfaced as NOT-EXECUTED/exit 2, never a PASS)");
}

// ── Integration: the REAL repo ───────────────────────────────────────────────────────────────────
{
  const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
  const inv = inventory(REPO);
  check(inv.counts.coreDual >= 29, `integration: real repo dual ports ≥ 29 (got ${inv.counts.coreDual})`);
  check(inv.excluded.includes("budget-ledger") && inv.excluded.includes("provider-live-call-gate"), "integration: frozen exclusions present in real repo");
  check(EXCLUSIONS.every((e) => !inv.candidates.some((c) => c.lot === e)), "integration: no excluded lot ever appears as a candidate");
  const sel = selectNextLot(inv);
  check(sel.state === "PASS" && typeof sel.lot === "string", `integration: real repo yields a safe next lot (${sel.lot})`);
  check(!inv.ported.includes(sel.lot as string), "integration: recommended lot is not already ported");
  // capability-factory (dynamic require of generated modules) must now be classified hazard-blocked,
  // never recommended — the V22 finding that the dist-closure tracer rejects its dynamic require().
  const capfac = inv.candidates.find((c) => c.lot === "capability-factory");
  check(!capfac || (capfac.hazard === true && /dynamic require/.test(capfac.reason)), "integration: capability-factory flagged hazard-blocked (dynamic require), not recommended");
  check(sel.lot !== "capability-factory", "integration: capability-factory is not the recommendation");
  // email-gateway (require("imapflow")) must be hazard-blocked — the V24 external-package finding.
  const emailgw = inv.candidates.find((c) => c.lot === "email-gateway");
  check(!emailgw || (emailgw.hazard === true && /external package/.test(emailgw.reason)), "integration: email-gateway flagged hazard-blocked (external package imapflow)");
  check(sel.lot !== "email-gateway", "integration: email-gateway is not the recommendation");
}

try {
  for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
} catch {
  /* best-effort */
}

console.log(failures === 0 ? "ALL PASS — Migration Campaign Planner" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
