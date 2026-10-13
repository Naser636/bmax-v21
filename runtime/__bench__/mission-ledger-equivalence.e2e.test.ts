// @ts-nocheck
/*
 * LOT η3-B86 — MISSION-LEDGER EQUIVALENCE: historical runtime/core/mission-ledger.js vs compiled port.
 * ====================================================================================================
 * mission-ledger is the IMMUTABLE STATUS-OF-RECORD — the last + most sensitive stage. It is run as a stage
 * (`node mission-ledger.js <mission>`, which calls recordMission) AND consumed as a module elsewhere. Each
 * case runs BOTH engines in their OWN sandbox (cwd there; governance support dirs copied verbatim so
 * computeLifecycle/markArchived/authorizeMission resolve) and compares the persisted runtime/generated/
 * mission-ledger.json.
 *
 * VOLATILES (enumerated by inspection, mission-ledger.js:145 + :195): exactly TWO occurrences of ONE
 * wall-clock value — the entry's `recordedAt` = new Date().toISOString(), mirrored into the file-level
 * `generatedAt`. BOTH are normalised to a sentinel; nothing else. Every other field (state/proven/archived/
 * authorized/nextStates/objectives/validated/…) is a deterministic function of the seeded evidence + the
 * state-machine, compared verbatim.
 *
 * CASES (derived from the real gates, not invented):
 *  1. UNPROVEN (default-deny) — no mission-matched validated report ⇒ refuse, NOTHING written.
 *  2. PROVEN append — validated report + plan ⇒ one entry (state = evidence-walked achieved); ledger
 *     BYTE-IDENTICAL after normalising the two timestamp volatiles; announced==persisted==re-read.
 *  3. IDEMPOTENCE by (mission, runId) — a pre-existing entry for this run ⇒ DUPLICATE_RUN no-op, ledger
 *     UNCHANGED (status-of-record immutability under re-finalisation).
 *  4. CORRUPTED ledger — unreadable existing file ⇒ skip to PRESERVE evidence, file UNCHANGED.
 *
 * Closure = 14 modules; only mission-ledger ported (its deps, incl. the TS-published mission-lifecycle,
 * stay require()-loaded). Run: node_modules/.bin/tsx runtime/__bench__/mission-ledger-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const JS_ENGINE = path.join(CORE, "mission-ledger.js");
const sandboxes: string[] = [];
let failures = 0;
function check(c: boolean, l: string): void { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } }
function computeClosure(seeds: string[]) { const v = new Set<string>(), c = new Set<string>(), miss: string[] = [], st = [...seeds];
  while (st.length) { const n = st.pop()!; if (v.has(n)) continue; v.add(n); const f = path.join(CORE, n + ".js"); if (!fs.existsSync(f)) { miss.push(n); continue; } c.add(n);
    const re = /\brequire\(\s*["'`](\.\/[A-Za-z0-9_-]+)["'`]\s*\)/g; let m: RegExpExecArray | null; const s = fs.readFileSync(f, "utf8"); while ((m = re.exec(s)) !== null) st.push(m[1].replace(/^\.\//, "")); }
  return { closure: [...c].sort(), missing: miss }; }
function place(dir: string, n: string) { const comp = path.join(DIST_CORE, n + ".js"); const dest = path.join(dir, n + ".js"); if (fs.existsSync(comp)) { fs.cpSync(comp, dest); return "c"; } fs.cpSync(path.join(CORE, n + ".js"), dest); return "h"; }
function writeJson(p: string, o: any) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
function baseEnv() { const e = { ...process.env }; delete e.ODG_VERBOSE; delete e.NODE_PATH; return e; }
const SUPPORT = ["constitution", "policies", "governance"];
// Normalise ONLY the two enumerated timestamp volatiles (recordedAt + generatedAt).
function norm(s: string | null): string | null { return s === null ? null : s.replace(/("(?:recordedAt|generatedAt)":\s*)"[^"]*"/g, '$1"<VOL>"'); }
let COMPILED = "", JS_COLOCATED = "";
function buildEngine(): void {
  const { closure, missing } = computeClosure(["mission-ledger"]);
  check(missing.length === 0, `closure resolves (missing: ${missing.join(",") || "none"})`);
  check(closure.length === 14, `closure is the expected 14-module set (size=${closure.length})`);
  const cdir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-mlg-dist-")); sandboxes.push(cdir);
  for (const n of closure) place(cdir, n);
  check(fs.readFileSync(path.join(DIST_CORE, "mission-ledger.js"), "utf8") === fs.readFileSync(path.join(cdir, "mission-ledger.js"), "utf8"), "co-located mission-ledger.js IS the compiled build output");
  COMPILED = path.join(cdir, "mission-ledger.js");
  const jdir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-mlg-hist-")); sandboxes.push(jdir);
  for (const n of closure) fs.cpSync(path.join(CORE, n + ".js"), path.join(jdir, n + ".js"));
  JS_COLOCATED = path.join(jdir, "mission-ledger.js");
}
function newSandbox(tag: string, seed: Record<string, any>, rawLedger?: string): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-mlg-" + tag + "-")); sandboxes.push(sb);
  for (const d of SUPPORT) { const src = path.join(REPO, "runtime", d); if (fs.existsSync(src)) fs.cpSync(src, path.join(sb, "runtime", d), { recursive: true }); }
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  for (const [f, o] of Object.entries(seed)) {
    if (f.startsWith("missions/")) writeJson(path.join(sb, "runtime", f), o);
    else writeJson(path.join(sb, "runtime", "generated", f), o);
  }
  if (rawLedger !== undefined) fs.writeFileSync(path.join(sb, "runtime", "generated", "mission-ledger.json"), rawLedger);
  return sb;
}
function run(engine: string, mission: string, sb: string) {
  const r = spawnSync("node", [engine, mission], { cwd: sb, encoding: "utf8", env: baseEnv() });
  const p = path.join(sb, "runtime", "generated", "mission-ledger.json");
  return { status: r.status, out: (r.stdout || "") + (r.stderr || ""), ledger: fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null };
}
console.log("LOT η3-B86 — MISSION-LEDGER EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(DIST_CORE, "mission-ledger.js")), "prerequisite: compiled mission-ledger.js emitted");
  buildEngine();
  const CONTRACT = { "missions/M_LEDG.json": { mission: "M_LEDG", version: "1.0", status: "AUTHORIZED" } };
  // 1. UNPROVEN — no mission-report ⇒ default-deny refuse, NOTHING written.
  {
    const seed = { "mission-plan.json": { mission: "M_LEDG", objectives: [{ id: "o1" }] }, ...CONTRACT };
    const j = run(JS_COLOCATED, "M_LEDG", newSandbox("u", seed));
    const t = run(COMPILED, "M_LEDG", newSandbox("u", seed));
    check(j.ledger === null && t.ledger === null, "C1 UNPROVEN: neither engine wrote the ledger (default-deny)");
    check(/Refusing to record/.test(j.out) && /Refusing to record/.test(t.out), "C1 UNPROVEN: both refuse with the same reason");
  }
  // 2. PROVEN append — validated report + plan ⇒ one entry.
  {
    const seed = { "mission-report.json": { mission: "M_LEDG", status: "SUCCESS", validated: true }, "mission-plan.json": { mission: "M_LEDG", objectives: [{ id: "o1" }] }, ...CONTRACT };
    const j = run(JS_COLOCATED, "M_LEDG", newSandbox("p", seed));
    const t = run(COMPILED, "M_LEDG", newSandbox("p", seed));
    check(j.status === 0 && t.status === 0, `C2 PROVEN: both exit 0 (js=${j.status} ts=${t.status})`);
    check(j.ledger !== null && norm(j.ledger) === norm(t.ledger), "C2 PROVEN: mission-ledger.json BYTE-IDENTICAL JS≡compiled after normalising recordedAt+generatedAt (2 enumerated volatiles)");
    const e = j.ledger ? JSON.parse(j.ledger).entries[0] : {};
    check(e.proven === true && typeof e.state === "string", `C2 PROVEN: persisted entry proven=true, state=${e.state} (announced==persisted==re-read)`);
    // Prove the ONLY difference is the two volatiles: everything else is already identical raw.
    check(!!j.ledger && !!t.ledger && j.ledger.replace(/"(recordedAt|generatedAt)":\s*"[^"]*"/g, "") === t.ledger.replace(/"(recordedAt|generatedAt)":\s*"[^"]*"/g, ""), "C2 PROVEN: everything EXCEPT the two timestamp volatiles is byte-identical");
  }
  // 3. IDEMPOTENCE by (mission, runId) — a pre-existing entry for THIS run ⇒ DUPLICATE_RUN no-op, UNCHANGED.
  {
    const seed = { "mission-report.json": { mission: "M_LEDG", status: "SUCCESS", validated: true }, "mission-plan.json": { mission: "M_LEDG", objectives: [{ id: "o1" }] }, "pipeline-checkpoint.json": { mission: "M_LEDG", startedAt: "RUN-FIXED-1" }, ...CONTRACT };
    const pre = JSON.stringify({ generatedAt: "SEED", count: 1, entries: [{ recordedAt: "SEED", mission: "M_LEDG", runId: "RUN-FIXED-1", state: "ARCHIVED", proven: true }] }, null, 2);
    const jsb = newSandbox("i", seed, pre); const j = run(JS_COLOCATED, "M_LEDG", jsb);
    const tsb = newSandbox("i", seed, pre); const t = run(COMPILED, "M_LEDG", tsb);
    check(/idempotent|duplicate/i.test(j.out) && /idempotent|duplicate/i.test(t.out), "C3 IDEMPOTENCE: both skip the duplicate (mission,runId)");
    check(j.ledger === pre && t.ledger === pre, "C3 IDEMPOTENCE: ledger UNCHANGED on both (immutable under re-finalisation)");
  }
  // 4. CORRUPTED ledger — unreadable existing file ⇒ skip to preserve, UNCHANGED.
  {
    const seed = { "mission-report.json": { mission: "M_LEDG", status: "SUCCESS", validated: true }, "mission-plan.json": { mission: "M_LEDG", objectives: [{ id: "o1" }] }, ...CONTRACT };
    const garbage = "THIS IS NOT JSON {{{";
    const j = run(JS_COLOCATED, "M_LEDG", newSandbox("c", seed, garbage));
    const t = run(COMPILED, "M_LEDG", newSandbox("c", seed, garbage));
    check(/unreadable/.test(j.out) && /unreadable/.test(t.out), "C4 CORRUPTED: both refuse to overwrite an unreadable ledger");
    check(j.ledger === garbage && t.ledger === garbage, "C4 CORRUPTED: existing (corrupted) ledger PRESERVED unchanged on both");
  }
} finally { for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch {} } }
console.log(failures === 0 ? "ALL PASS — LOT η3-B86 MISSION-LEDGER EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
