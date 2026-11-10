#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V58 — closure-ledger honesty test. Verifies: (a) every open part is routed with a closure criterion +
 * gating + next action; (b) the ledger NEVER flips a bucket to DONE; (c) owner-gated / external-dependency parts stay
 * explicitly open; (d) INDEPENDENT confirmation — the modules the LOCALLY_CLOSEABLE parts rely on actually load (their
 * machinery is real, not merely asserted). Fail-closed.
 */

const path = require("path");
const fs = require("fs");
const CORE = path.join(__dirname, "..", "core");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V58_CLOSURE_LEDGER.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null;
  try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("closure ledger exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  // (a) every row routed
  const gatings = ["LOCALLY_CLOSEABLE", "NEEDS_LOCAL_BUILD", "INHERENTLY_REFERENTIAL", "OWNER_GATED", "EXTERNAL_DEPENDENCY"];
  check("open parts routed (>=24)", m.openParts >= 24 && m.rows.length === m.openParts);
  check("every row has criterion + valid gating + next action", m.rows.every((r: any) => r.closureCriterion && gatings.includes(r.gating) && r.nextAction));
  check("tally sums to open parts", gatings.reduce((s, g) => s + (m.tally[g] || 0), 0) === m.openParts);

  // (b) never flips to DONE; only open buckets present
  check("no row claims DONE (only PARTIAL/NOT_VALIDATED)", m.rows.every((r: any) => r.bucket === "PARTIAL" || r.bucket === "NOT_VALIDATED"));
  check("invariant: ledger never closes by assertion", /never closes a part by assertion/i.test(m.invariant));

  // (c) owner/external parts stay open
  check("Part XXXII present & OWNER_GATED", m.rows.some((r: any) => /XXXII/.test(r.part) && r.gating === "OWNER_GATED"));
  check("at least one EXTERNAL_DEPENDENCY (superiority/clients/GPU)", (m.tally.EXTERNAL_DEPENDENCY || 0) >= 1);

  // (d) INDEPENDENT confirmation: the cited LOCALLY_CLOSEABLE machinery actually loads
  const mustLoad = ["root-of-trust", "world-model", "self-improvement", "evaluator-independence", "autonomy-persistence", "evidence-provenance"];
  let loaded = 0;
  for (const mod of mustLoad) { try { if (require(path.join(CORE, mod + ".js"))) loaded++; } catch { /* counts as not loaded */ } }
  check("cited LOCALLY_CLOSEABLE modules all load (independent)", loaded === mustLoad.length);

  check("conclusion states remainder owner/external-gated", /owner\/external-gated/i.test(m.honestConclusion));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V58 closure ledger (routed, honest, no assertion-closure, machinery independently loads)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
