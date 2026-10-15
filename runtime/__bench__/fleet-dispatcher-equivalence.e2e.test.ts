#!/usr/bin/env node
/*
 * LOT fleet-dispatcher — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/fleet-dispatcher.ts →
 * runtime/dist/core/fleet-dispatcher.js; build-dist-closure co-locates its deps (fleet-envelope.js,
 * mission-ledger.js — both TS ports) in dist/core. All of dispatch()'s reads/writes are CWD-relative, so a
 * seeded temp cwd makes it fully deterministic ⇒ BYTE-IDENTICAL and NO real repo write. The request
 * envelope carries a non-deterministic createdAt (fleet-envelope) — compared with createdAt normalised.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/fleet-dispatcher-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "fleet-dispatcher.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "fleet-dispatcher.js");

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

console.log("LOT fleet-dispatcher — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/fleet-dispatcher.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/fleet-dispatcher.js emitted");
for (const dep of ["fleet-envelope.js", "mission-ledger.js"]) {
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", dep)), `prerequisite: dep ${dep} co-located in dist by build-dist-closure`);
}

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.dispatch === "function" && typeof ts.dispatch === "function", "both export dispatch");

const origCwd = process.cwd();
const temps: string[] = [];
// Seed a temp cwd with a fleet-agents registry (+ optional brief/instruction), run dispatch there.
function seed(agents: any[], extra: Record<string, string> = {}): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "fdisp-")); temps.push(d);
  fs.mkdirSync(path.join(d, "runtime", "connectors"), { recursive: true });
  fs.writeFileSync(path.join(d, "runtime", "connectors", "fleet-agents.json"), JSON.stringify({ agents }));
  for (const [rel, body] of Object.entries(extra)) {
    const abs = path.join(d, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body);
  }
  return d;
}
const normReq = (o: any) => (o && o.value ? o : o); // return envelopes read from disk handled separately
const AGENTS = [{ id: "claude", enabled: true }, { id: "other", enabled: true }, { id: "off", enabled: false }];

try {
  // Default routing ⇒ first enabled agent (claude). Compare dispatch() result + written request (createdAt normalised).
  const dJ = seed(AGENTS, { "runtime/generated/engineering-brief.json": JSON.stringify({ mission: "M1", scope: "x" }), "runtime/generated/llm/patch-request.md": "do the thing" });
  process.chdir(dJ); const rJ = js.dispatch("M1"); const reqJ = JSON.parse(fs.readFileSync(path.join(dJ, rJ.file), "utf8")); process.chdir(origCwd);
  const dT = seed(AGENTS, { "runtime/generated/engineering-brief.json": JSON.stringify({ mission: "M1", scope: "x" }), "runtime/generated/llm/patch-request.md": "do the thing" });
  process.chdir(dT); const rT = ts.dispatch("M1"); const reqT = JSON.parse(fs.readFileSync(path.join(dT, rT.file), "utf8")); process.chdir(origCwd);
  check(EQ(rJ, rT) && rJ.agent === "claude" && rJ.status === "PENDING" && rJ.requestId === "M1-001", "dispatch(default) ⇒ first-enabled agent, M1-001 PENDING BYTE-IDENTICAL");
  const norm = (r: any) => ({ ...r, createdAt: "<ts>" });
  check(EQ(norm(reqJ), norm(reqT)) && reqJ.brief.scope === "x" && reqJ.instruction === "do the thing", "written request envelope BYTE-IDENTICAL (brief + instruction carried; createdAt normalised)");

  // Explicit routing to an enabled non-default agent.
  const eJ = seed(AGENTS); process.chdir(eJ); const xJ = js.dispatch("M2", "other"); process.chdir(origCwd);
  const eT = seed(AGENTS); process.chdir(eT); const xT = ts.dispatch("M2", "other"); process.chdir(origCwd);
  check(EQ(xJ, xT) && xJ.agent === "other", "dispatch(explicit enabled agent) ⇒ that agent BYTE-IDENTICAL");

  // Requested agent that is disabled ⇒ no agent ⇒ throws.
  const fJ = seed(AGENTS); process.chdir(fJ);
  const fT = seed(AGENTS);
  check(both(() => { process.chdir(fJ); try { return js.dispatch("M3", "off"); } finally { process.chdir(origCwd); } },
             () => { process.chdir(fT); try { return ts.dispatch("M3", "off"); } finally { process.chdir(origCwd); } }),
        "dispatch(requested disabled agent) ⇒ throws identical message");

  // No enabled agent at all ⇒ throws.
  const nJ = seed([{ id: "a", enabled: false }]);
  const nT = seed([{ id: "a", enabled: false }]);
  check(both(() => { process.chdir(nJ); try { return js.dispatch("M4"); } finally { process.chdir(origCwd); } },
             () => { process.chdir(nT); try { return ts.dispatch("M4"); } finally { process.chdir(origCwd); } }),
        "dispatch(no enabled agent) ⇒ throws identical message");

  // Missing brief/instruction ⇒ defaults ({mission} brief, "" instruction).
  const mJ = seed(AGENTS); process.chdir(mJ); const bJ = js.dispatch("M5"); const rbJ = JSON.parse(fs.readFileSync(path.join(mJ, bJ.file), "utf8")); process.chdir(origCwd);
  const mT = seed(AGENTS); process.chdir(mT); const bT = ts.dispatch("M5"); const rbT = JSON.parse(fs.readFileSync(path.join(mT, bT.file), "utf8")); process.chdir(origCwd);
  check(EQ({ ...rbJ, createdAt: "<ts>" }, { ...rbT, createdAt: "<ts>" }) && EQ(rbJ.brief, { mission: "M5" }) && rbJ.instruction === "", "dispatch(no brief/instruction) ⇒ default brief{mission} + empty instruction BYTE-IDENTICAL");
} finally {
  process.chdir(origCwd);
  for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT fleet-dispatcher EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
