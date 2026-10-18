#!/usr/bin/env node
/*
 * LOT delegate-isolation — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, NO real provider / NO network / NO secrets / NO real bwrap. build:runtime
 * compiles runtime/core/delegate-isolation.ts → runtime/dist/core/delegate-isolation.js; its internal
 * deps (./provider-sandbox, ./bash-command-governor, unmodified) are co-located into dist by the closure.
 *
 * PARITY SURFACE (byte-identical .js rollback twin vs compiled .ts):
 *   - resolveWriteSet: concrete file ok, glob/boundary refused, escape refused, empty refused, missing refused.
 *   - buildIsolatedArgs: PURE argv — isolation flags present, NEVER `--ro-bind / /`, real work dir bound.
 *   - diffWorkingCopy: added/modified/deleted classification over an injected snapshot (no fs).
 *   - validateScope: in-scope ok, out-of-scope/mixed/added-unauthorized refused — results byte-identical.
 *   - applyProposal: out-of-scope ⇒ refused (no write), via an injected io recorder — results byte-identical.
 *   - runIsolated fail-closed: sandbox-unavailable (injected spawn status!=0) ⇒ refused on BOTH.
 *   - export surface identical.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/delegate-isolation-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "delegate-isolation.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "delegate-isolation.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures += 1; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT delegate-isolation — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/delegate-isolation.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/delegate-isolation.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

const EXPORTS = ["isBoundary", "resolveWriteSet", "materializeWorkingCopy", "buildIsolatedArgs", "listFilesRel", "diffWorkingCopy", "validateScope", "applyProposal", "selectDelegateMode", "acceptanceGate", "runIsolated"];
for (const x of EXPORTS) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);

// ── resolveWriteSet parity (against this very repo as a real root; all relative to REPO) ────────────
const rsCases: [string, string[]][] = [
  ["concrete", ["runtime/core/delegate-isolation.js"]],
  ["glob", ["runtime/**"]],
  ["boundary-dir", ["runtime/core/"]],
  ["escape", ["../../etc/passwd"]],
  ["empty", []],
  ["missing", ["runtime/core/does-not-exist.js"]],
];
for (const [label, ws] of rsCases) check(EQ(js.resolveWriteSet(REPO, ws), ts.resolveWriteSet(REPO, ws)), `resolveWriteSet parity: ${label}`);
check(js.resolveWriteSet(REPO, ["runtime/**"]).ok === false, "resolveWriteSet refuses a glob (fail-closed)");

// ── buildIsolatedArgs parity (PURE) ────────────────────────────────────────────────────────────────
{
  const ja = js.buildIsolatedArgs("/tmp/realwork", ["node", "-e", "1"]);
  const ta = ts.buildIsolatedArgs("/tmp/realwork", ["node", "-e", "1"]);
  check(EQ(ja, ta), "buildIsolatedArgs byte-identical argv");
  for (const flag of ["--unshare-all", "--clearenv", "--info-fd", "--die-with-parent"]) {
    check(ja.includes(flag) && ta.includes(flag), `buildIsolatedArgs carries ${flag}`);
  }
  check(!ja.some((a: string, i: number) => a === "--ro-bind" && ja[i + 1] === "/" && ja[i + 2] === "/"), "buildIsolatedArgs never --ro-bind / /");
}

// ── diffWorkingCopy parity (injected reader + snapshot — no real fs) ─────────────────────────────────
{
  const pristine = { "a.js": "1", "b.js": "2", "gone.js": "x" };
  const now: Record<string, string> = { "a.js": "1", "b.js": "CHANGED", "new.js": "n" };
  const io = {
    readdirSync: (_d: string) => Object.keys(now).map((n) => ({ name: n, isDirectory: () => false, isFile: () => true })),
    readFileSync: (p: string) => now[path.basename(p)],
  };
  check(EQ(js.diffWorkingCopy(pristine, "/x", io), ts.diffWorkingCopy(pristine, "/x", io)), "diffWorkingCopy byte-identical (added/modified/deleted)");
}

// ── validateScope parity ─────────────────────────────────────────────────────────────────────────
const vsCases: [any[], string[]][] = [
  [[{ rel: "a.js", kind: "modified" }], ["a.js"]],
  [[{ rel: "a.js", kind: "modified" }, { rel: "evil.js", kind: "added" }], ["a.js"]],
  [[{ rel: "evil.js", kind: "added" }], ["a.js"]],
  [[], ["a.js"]],
];
for (let i = 0; i < vsCases.length; i += 1) {
  check(EQ(js.validateScope(vsCases[i][0], vsCases[i][1]), ts.validateScope(vsCases[i][0], vsCases[i][1])), `validateScope parity: case ${i}`);
}

// ── applyProposal parity (injected io recorder — refuses out-of-scope, no write) ────────────────────
{
  const mk = () => { const w: string[] = []; return { rec: w, io: { mkdirSync: () => {}, writeFileSync: (p: string) => w.push(p), rmSync: () => {} } }; }; // eslint-disable-line
  const a = mk(); const b = mk();
  const changes = [{ rel: "a.js", kind: "modified", after: "x" }, { rel: "evil.js", kind: "added", after: "y" }];
  const ra = js.applyProposal("/tmp/root", changes, ["a.js"], a.io);
  const rb = ts.applyProposal("/tmp/root", changes, ["a.js"], b.io);
  check(EQ(ra, rb), "applyProposal byte-identical result (out-of-scope refused)");
  check(a.rec.length === 0 && b.rec.length === 0, "applyProposal wrote nothing for an out-of-scope proposal (both)");
}

// ── selectDelegateMode parity (pure decision) ───────────────────────────────────────────────────
const smCases: any[] = [
  { isolationRequested: false },
  { isolationRequested: true, writeSet: ["a.js"] },
  { isolationRequested: true, command: "claude", declaredOffline: false, writeSet: ["a.js"] },
  { isolationRequested: true, command: "m", declaredOffline: true, writeSet: [] },
  { isolationRequested: true, command: "m", declaredOffline: true, writeSet: ["runtime/**"] },
  { isolationRequested: true, command: "/opt/m", declaredOffline: true, writeSet: ["src/app.js"] },
];
for (let i = 0; i < smCases.length; i += 1) {
  check(EQ(js.selectDelegateMode(smCases[i]), ts.selectDelegateMode(smCases[i])), `selectDelegateMode parity: case ${i}`);
}
check(js.selectDelegateMode({ isolationRequested: false }).isolated === false, "selectDelegateMode: flag OFF ⇒ NOT isolated (both)");

// ── acceptanceGate parity (pure, injected git seam — no real repo) ─────────────────────────────────
const seam = (working: string[], committed: string[]) => ({ status: () => working, diffNames: () => committed });
const agCases: any[] = [
  { writeSet: ["a.js"], git: seam(["a.js"], []) },                       // PROPOSED
  { writeSet: ["a.js"], git: seam(["evil.js"], []) },                    // BLOCKED (working out-of-scope)
  { writeSet: ["a.js"], baselineRef: "B0", git: seam([], ["a.js"]) },    // ACCEPTED
  { writeSet: ["a.js"], baselineRef: "B0", git: seam([], ["evil.js"]) }, // BLOCKED (unauthorized commit)
  { writeSet: ["a.js"], baselineRef: "B0", git: seam([], []) },          // NO_PROPOSAL
  { writeSet: [], git: seam(["a.js"], []) },                             // BLOCKED (empty write-set)
];
for (let i = 0; i < agCases.length; i += 1) {
  check(EQ(js.acceptanceGate(agCases[i]), ts.acceptanceGate(agCases[i])), `acceptanceGate parity: case ${i}`);
}
check(js.acceptanceGate({ writeSet: ["a.js"], git: seam(["a.js"], []) }).state === "PROPOSED_AWAITING_ACCEPTANCE", "acceptanceGate: uncommitted in-scope ⇒ PROPOSED (both)");

// ── runIsolated fail-closed parity (sandbox unavailable via injected spawn) ─────────────────────────
{
  const opts = { root: REPO, writeSet: ["runtime/core/delegate-isolation.js"], command: "node -e 1", spawn: () => ({ status: 1, stdout: "" }) };
  const ra = js.runIsolated(opts); const rb = ts.runIsolated(opts);
  check(EQ(ra, rb), "runIsolated byte-identical when sandbox unavailable");
  check(ra.refused === true && ra.launched === false, "runIsolated refuses (no unisolated fallback)");
}

console.log(`\nDELEGATE ISOLATION EQUIVALENCE — ${failures === 0 ? "ALL PARITY CHECKS PASS" : failures + " FAILED"}.`);
process.exit(failures === 0 ? 0 : 1);
