#!/usr/bin/env node
/**
 * odg-exposure-check — P3 private-exposure drift CLI (READ-ONLY). Observes the live LISTEN sockets via
 * `ss -ltnp` and reports whether any ODG-OWNED listener binds a public (non-loopback) address. It NEVER
 * changes a bind, a firewall, a port, or a co-tenant service — fixing drift is a reserved human/authorized
 * action. Exit 1 ONLY on ODG-owned DRIFT (actionable); UNKNOWN (foreign public listeners we can't attribute)
 * and LOOPBACK_OK exit 0. On DRIFT a deduped alert line is appended to runtime/generated/exposure-alerts.jsonl.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { classifyExposure } = require(path.resolve(__dirname, "..", "core", "exposure-audit.js"));

function readSs() {
  try { return execFileSync("ss", ["-ltnp"], { encoding: "utf8" }); }
  catch { try { return execFileSync("ss", ["-ltn"], { encoding: "utf8" }); } catch { return null; } }
}

function nowIso() { return new Date().toISOString(); }

function appendDedupedAlert(file, rec) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let last = null;
    try { const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean); last = lines.length ? JSON.parse(lines[lines.length - 1]) : null; } catch { /* none */ }
    if (last && last.verdict === rec.verdict && last.signature === rec.signature) return false; // deduped
    fs.appendFileSync(file, JSON.stringify(rec) + "\n");
    return true;
  } catch { return false; }
}

function main() {
  const ss = readSs();
  if (ss === null) {
    console.log("Exposure   : UNKNOWN — `ss` unavailable (cannot observe listeners; not a pass)");
    process.exit(0);
  }
  const r = classifyExposure(ss);
  const line = (l) => `${l.localAddr}${l.pid ? ` pid=${l.pid}` : ""}`;
  console.log(`Exposure   : ${r.verdict}  (odg-loopback=${r.counts.odgLoopback} drift=${r.counts.drift} foreign-public=${r.counts.foreign})`);
  for (const l of r.odgLoopback) console.log(`  odg(loopback) : ${line(l)}`);
  for (const l of r.drift) console.log(`  DRIFT(public) : ${line(l)}  <-- ODG-owned listener on a PUBLIC address`);
  for (const l of r.foreign) console.log(`  foreign(info) : ${line(l)}  (not ODG-owned — co-tenant/system; not touched)`);

  const ALERTS = path.resolve(process.cwd(), "runtime", "generated", "exposure-alerts.jsonl");
  if (r.verdict === "DRIFT") {
    const signature = r.drift.map((l) => l.localAddr).sort().join(",");
    const wrote = appendDedupedAlert(ALERTS, { at: nowIso(), verdict: "DRIFT", signature, drift: r.drift.map((l) => l.localAddr) });
    console.log(wrote ? `  alert       : appended to ${ALERTS}` : "  alert       : (deduped — same drift already recorded)");
    process.exit(1);
  }
  process.exit(0);
}

main();
