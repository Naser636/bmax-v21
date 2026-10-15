#!/usr/bin/env node
/*
 * LOT capability-metrics — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/capability-metrics.ts →
 * runtime/dist/core/capability-metrics.js; build-dist-closure co-locates its dep (autonomy-store.js) in
 * dist/core so the compiled module resolves `require("./autonomy-store")` with no manual relocation.
 * autonomy-store reads/writes a CWD-relative store (runtime/generated/autonomy), so a seeded temp cwd
 * makes stats/successRate/best fully deterministic ⇒ BYTE-IDENTICAL. record() carries a real
 * new Date().toISOString() timestamp (genuinely non-deterministic env value, NOT a behavioural diff):
 * it is compared with ONLY the `at` field normalised; every other field + the returned count are exact.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/capability-metrics-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "capability-metrics.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "capability-metrics.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const OUTCOMES_FIXTURE = { version: 1, outcomes: [
  { capability: "A", success: true }, { capability: "A", success: false }, { capability: "A", success: true },
  { capability: "B", success: true }, { capability: "B", success: true },
  { capability: "C", success: false },
] };
function seedCwd(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cm-bench-"));
  const f = path.join(d, "runtime", "generated", "autonomy", "capability-outcomes.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(OUTCOMES_FIXTURE, null, 2));
  return d;
}

console.log("LOT capability-metrics — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/capability-metrics.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/capability-metrics.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "autonomy-store.js")), "prerequisite: dep autonomy-store.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["record", "stats", "successRate", "best", "OUTCOMES"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(js.OUTCOMES === ts.OUTCOMES && js.OUTCOMES === "capability-outcomes", "OUTCOMES constant identical");

const origCwd = process.cwd();
const temps: string[] = [];
try {
  // Pure read+compute over a seeded store (same cwd ⇒ identical read ⇒ identical output).
  const cwd = seedCwd(); temps.push(cwd); process.chdir(cwd);
  check(EQ(js.stats(), ts.stats()), "stats() over seeded store BYTE-IDENTICAL JS≡TS");
  check(EQ(js.successRate("A"), ts.successRate("A")) && js.successRate("A") === 2 / 3, "successRate('A')=2/3 identical");
  check(EQ(js.successRate("B"), ts.successRate("B")) && js.successRate("B") === 1, "successRate('B')=1 identical");
  check(js.successRate("UNSEEN") === 0 && ts.successRate("UNSEEN") === 0, "successRate(unseen)=0 (both)");
  check(js.best(["A", "B", "C"]) === "B" && ts.best(["A", "B", "C"]) === "B", "best picks highest rate (B)");
  check(js.best(["C", "A"]) === "A" && ts.best(["C", "A"]) === "A", "best stable tie-break/order (A over C)");
  check(js.best([]) === null && ts.best([]) === null, "best([]) ⇒ null (both)");
  check(js.best(["X", "Y"]) === "X" && ts.best(["X", "Y"]) === "X", "best of all-unseen ⇒ first candidate (rate 0)");

  // record(): separate seeded cwds; compare store content with the non-deterministic `at` normalised.
  const norm = (db: any) => ({ ...db, outcomes: (db.outcomes || []).map((o: any) => ({ ...o, at: o.at ? "<ts>" : o.at })) });
  const cJ = seedCwd(); temps.push(cJ); process.chdir(cJ);
  const nJ = js.record("CAP_NEW", true);
  const dbJ = JSON.parse(fs.readFileSync(path.join(cJ, "runtime", "generated", "autonomy", "capability-outcomes.json"), "utf8"));
  const cT = seedCwd(); temps.push(cT); process.chdir(cT);
  const nT = ts.record("CAP_NEW", true);
  const dbT = JSON.parse(fs.readFileSync(path.join(cT, "runtime", "generated", "autonomy", "capability-outcomes.json"), "utf8"));
  check(nJ === nT && nJ === OUTCOMES_FIXTURE.outcomes.length + 1, "record() returns identical new length");
  check(EQ(norm(dbJ), norm(dbT)), "record() writes identical store content (at-timestamp normalised)");
  const last = dbJ.outcomes[dbJ.outcomes.length - 1];
  check(last.capability === "CAP_NEW" && last.success === true && last.direct === true && typeof last.at === "string", "record() appends {capability,success,direct,at:ISO}");
} finally {
  process.chdir(origCwd);
  for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT capability-metrics EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
