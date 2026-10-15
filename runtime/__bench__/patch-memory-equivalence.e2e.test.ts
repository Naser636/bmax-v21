#!/usr/bin/env node
/*
 * LOT patch-memory — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/patch-memory.ts →
 * runtime/dist/core/patch-memory.js; build-dist-closure co-locates its dep (autonomy-store.js — a TS
 * port) in dist/core. The store is CWD-relative, so a seeded temp cwd makes record/lookup/hit/recall/list
 * fully deterministic ⇒ BYTE-IDENTICAL. The only non-deterministic field is learnedAt (real ISO
 * timestamp); it is compared with learnedAt normalised. signature() is pure.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/patch-memory-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "patch-memory.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "patch-memory.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function both(jsFn: () => any, tsFn: () => any): boolean {
  const run = (f: () => any) => {
    try {
      return { ok: true, value: f() };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };
  return EQ(run(jsFn), run(tsFn));
}

console.log("LOT patch-memory — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/patch-memory.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/patch-memory.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "autonomy-store.js")), "prerequisite: dep autonomy-store.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["signature", "record", "lookup", "recall", "hit", "list", "NAME"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(js.NAME === ts.NAME && js.NAME === "patch-memory", "NAME constant identical");

// signature() — pure.
check(js.signature("literal-sig") === ts.signature("literal-sig") && js.signature("literal-sig") === "literal-sig", "signature(string) passthrough");
const SIGS = [
  { rootCause: "RC", goal: "  Fix   The  Parser ", target: "src/a.ts" },
  { objectiveId: "M_1", target: "" }, // goal absent ⇒ objectiveId fallback
  { goal: "same GOAL", objectiveId: "ignored-because-goal-present" },
  {},
];
for (const [i, t] of SIGS.entries()) check(js.signature(t) === ts.signature(t), `signature[${i}] = ${JSON.stringify(js.signature(t))} identical (norm/goal-fallback)`);

const origCwd = process.cwd();
const temps: string[] = [];
const seed = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pmem-"));
  temps.push(d);
  return d;
};
const normAt = (e: any) => (e ? { ...e, learnedAt: "<ts>" } : e);
try {
  // record() throws on empty edits (both).
  const dX = seed(); process.chdir(dX);
  check(both(() => js.record({ goal: "g", edits: [] }), () => ts.record({ goal: "g", edits: [] })), "record(empty edits) ⇒ throws identical message");
  process.chdir(origCwd);

  // record → lookup/recall/hit/list over separate seeded cwds; compare with learnedAt normalised.
  const entry = { rootCause: "RC1", goal: "fix parser", target: "src/a.ts", mission: "M1", authoredBy: "PROVIDER", edits: [{ target: "src/a.ts", content: "x" }] };
  const dJ = seed(); process.chdir(dJ);
  const recJ = js.record(entry);
  const lookJ = js.lookup({ rootCause: "RC1", goal: "fix parser", target: "src/a.ts" });
  const recallJ = js.recall(entry);
  const hit1J = js.hit(entry); const hit2J = js.hit(entry);
  const listJ = js.list();
  // re-record WITHOUT explicit authoredBy preserves reuseCount + learnedAt + prior provenance.
  const reNoAuthJ = js.record({ rootCause: "RC1", goal: "fix parser", target: "src/a.ts", mission: "M1", edits: entry.edits });
  // re-record WITH explicit authoredBy: the caller's proven value wins (documented precedence).
  const reExplicitJ = js.record({ ...entry, authoredBy: "ODG_CAPABILITY" });
  process.chdir(origCwd);

  const dT = seed(); process.chdir(dT);
  const recT = ts.record(entry);
  const lookT = ts.lookup({ rootCause: "RC1", goal: "fix parser", target: "src/a.ts" });
  const recallT = ts.recall(entry);
  const hit1T = ts.hit(entry); const hit2T = ts.hit(entry);
  const listT = ts.list();
  const reNoAuthT = ts.record({ rootCause: "RC1", goal: "fix parser", target: "src/a.ts", mission: "M1", edits: entry.edits });
  const reExplicitT = ts.record({ ...entry, authoredBy: "ODG_CAPABILITY" });
  process.chdir(origCwd);

  check(EQ(normAt(recJ), normAt(recT)), "record() entry BYTE-IDENTICAL (learnedAt normalised)");
  check(recJ.authoredBy === "PROVIDER" && recJ.reuseCount === 0, "record() stores explicit authoredBy + reuseCount 0");
  check(EQ(lookJ, lookT) && EQ(lookJ, entry.edits), "lookup() returns stored edits (symmetric sig) identical");
  check(EQ(normAt(recallJ), normAt(recallT)), "recall() full entry BYTE-IDENTICAL");
  check(hit1J === hit1T && hit2J === hit2T && hit1J === 1 && hit2J === 2, "hit() increments reuseCount (1 then 2, both)");
  check(listJ.length === listT.length && listJ.length === 1, "list() length identical (1)");
  check(reNoAuthJ.authoredBy === "PROVIDER" && reNoAuthT.authoredBy === "PROVIDER", "re-record w/o authoredBy PRESERVES prior provenance (PROVIDER, not fabricated)");
  check(reExplicitJ.authoredBy === "ODG_CAPABILITY" && reExplicitT.authoredBy === "ODG_CAPABILITY", "re-record WITH explicit authoredBy ⇒ caller's proven value wins (documented precedence, JS≡TS)");
  check(reNoAuthJ.reuseCount === 2 && reNoAuthT.reuseCount === 2 && reNoAuthJ.learnedAt === recJ.learnedAt, "re-record preserves reuseCount(2) + learnedAt (idempotent)");

  // miss paths.
  const dM = seed(); process.chdir(dM);
  check(js.lookup({ goal: "absent" }) === null && ts.lookup({ goal: "absent" }) === null, "lookup(miss) ⇒ null (both)");
  check(js.hit({ goal: "absent" }) === 0 && ts.hit({ goal: "absent" }) === 0, "hit(miss) ⇒ 0 (both)");
  check(js.recall({ goal: "absent" }) === null && ts.recall({ goal: "absent" }) === null, "recall(miss) ⇒ null (both)");
  process.chdir(origCwd);
} finally {
  process.chdir(origCwd);
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT patch-memory EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
