#!/usr/bin/env node
"use strict";

/*
 * odg-exposure-check — P3 private-exposure drift CLI (READ-ONLY). TS port → runtime/dist/bin/odg-exposure-check.js
 * (the canonical compiled entrypoint invoked by scripts/odg-monitor.sh). The original runtime/bin/odg-exposure-check.js
 * was retired by the zero-JS convergence (commit fba76c7) WITHOUT a TS replacement, which left odg-monitor.sh crashing
 * with MODULE_NOT_FOUND every tick; this file restores the CLI faithfully over the surviving pure core module
 * runtime/core/exposure-audit.ts (classifyExposure) — NO classification logic is duplicated here.
 *
 * It observes the live LISTEN sockets via `ss -ltnp` and reports whether any ODG-OWNED listener binds a public
 * (non-loopback) address. It NEVER changes a bind, firewall, port, or co-tenant service — fixing drift is a reserved
 * human/authorized action. Exit 1 ONLY on ODG-owned DRIFT (actionable); UNKNOWN (foreign public listeners we can't
 * attribute) and LOOPBACK_OK exit 0. On DRIFT a deduped alert line is appended to runtime/generated/exposure-alerts.jsonl.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { classifyExposure } = require(path.resolve(__dirname, "..", "core", "exposure-audit.js"));

function readSs(): string | null {
  try { return execFileSync("ss", ["-ltnp"], { encoding: "utf8" }); }
  catch { try { return execFileSync("ss", ["-ltn"], { encoding: "utf8" }); } catch { return null; } }
}

function nowIso(): string { return new Date().toISOString(); }

function appendDedupedAlert(file: string, rec: any): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let last: any = null;
    try { const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean); last = lines.length ? JSON.parse(lines[lines.length - 1]) : null; } catch { /* none */ }
    if (last && last.verdict === rec.verdict && last.signature === rec.signature) return false; // deduped
    fs.appendFileSync(file, JSON.stringify(rec) + "\n");
    return true;
  } catch { return false; }
}

function main(): void {
  const ss = readSs();
  if (ss === null) {
    console.log("Exposure   : UNKNOWN — `ss` unavailable (cannot observe listeners; not a pass)");
    process.exit(0);
  }
  const r = classifyExposure(ss);
  const line = (l: any) => `${l.localAddr}${l.pid ? ` pid=${l.pid}` : ""}`;
  console.log(`Exposure   : ${r.verdict}  (odg-loopback=${r.counts.odgLoopback} drift=${r.counts.drift} foreign-public=${r.counts.foreign})`);
  for (const l of r.odgLoopback) console.log(`  odg(loopback) : ${line(l)}`);
  for (const l of r.drift) console.log(`  DRIFT(public) : ${line(l)}  <-- ODG-owned listener on a PUBLIC address`);
  for (const l of r.foreign) console.log(`  foreign(info) : ${line(l)}  (not ODG-owned — co-tenant/system; not touched)`);

  // Steady-state status (every run) — the single source odg-health §G reads read-only for a freshness summary.
  try {
    const STATUS = path.resolve(process.cwd(), "runtime", "generated", "exposure-status.json");
    fs.mkdirSync(path.dirname(STATUS), { recursive: true });
    fs.writeFileSync(STATUS, JSON.stringify({ at: nowIso(), verdict: r.verdict, odgLoopback: r.counts.odgLoopback, drift: r.counts.drift, foreign: r.counts.foreign }));
  } catch { /* status is best-effort */ }

  const ALERTS = path.resolve(process.cwd(), "runtime", "generated", "exposure-alerts.jsonl");
  if (r.verdict === "DRIFT") {
    const signature = r.drift.map((l: any) => l.localAddr).sort().join(",");
    const wrote = appendDedupedAlert(ALERTS, { at: nowIso(), verdict: "DRIFT", signature, drift: r.drift.map((l: any) => l.localAddr) });
    console.log(wrote ? `  alert       : appended to ${ALERTS}` : "  alert       : (deduped — same drift already recorded)");
    process.exit(1);
  }
  process.exit(0);
}

main();
export {};
