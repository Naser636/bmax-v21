#!/usr/bin/env node
// @ts-nocheck — L5 test bucket: runs under tsx; suppresses tsc typecheck (not strict typing).
"use strict";

/*
 * IMPLEMENT_VIA_LOCAL_PROVIDER (Stage-6) — governance proof with a deterministic STUB generator.
 * Proves ODG orchestrates autonomous code implementation end-to-end while the provider holds NO authority:
 * it only proposes a diff inside a disposable working copy; ODG resolves the write-set, isolates, validates
 * scope (fail-closed/atomic), applies within scope only, verifies independently, and NEVER commits. No model
 * download, no network, no cost. This does NOT prove a real model can write correct code.
 */
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const JS = require("./capability-executors.js");
const TS = require("./capability-executors.ts");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const ACT = "AUTONOMOUS_SANDBOXED";
// A disposable repo-free root with one authorized file. Returns {root, read, cleanup}.
function makeRoot(initial) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ivlp-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "target.ts"), initial);
  return {
    root,
    read: (rel) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return null; } },
    cleanup: () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } },
  };
}
const OBJ = { objectiveId: "IMPLEMENT_LOCAL_CODE_T", authorized_paths: ["src/target.ts"] };
// Stub generators (write into the provider's working COPY only).
const genInScope = ({ workDir }) => { fs.writeFileSync(path.join(workDir, "src", "target.ts"), "export const V = 2;\n"); };
const genOutOfScope = ({ workDir }) => { fs.writeFileSync(path.join(workDir, "src", "evil.ts"), "export const HACK = 1;\n"); };
const genMalformed = () => ({ error: "model produced unparseable output" });
const genThrows = () => { throw new Error("provider crashed"); };

for (const [label, mod] of [["JS", JS], ["TS", TS]]) {
  console.log(`implement-via-local-provider — ${label} port`);

  // 1. valid in-scope STUB generation ⇒ EXECUTED, verified, committed:false, file updated by ODG.
  { const r = makeRoot("export const V = 1;\n");
    const res = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: genInScope, verify: () => ({ ok: true, detail: "ok" }) });
    ok(`${label} 1 in-scope ⇒ EXECUTED+verified, committed:false`, res.status === "EXECUTED" && res.verified === true && res.committed === false && res.appliedBy === "ODG_EXECUTOR" && res.authoredBy === "LOCAL_PROVIDER");
    ok(`${label} 1 ODG applied the change to the real tree`, r.read("src/target.ts") === "export const V = 2;\n");
    r.cleanup(); }

  // 2. out-of-scope proposal ⇒ atomic REFUSE, NOTHING applied (real tree unchanged, no evil file).
  { const r = makeRoot("export const V = 1;\n");
    const res = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: genOutOfScope, verify: () => ({ ok: true }) });
    ok(`${label} 2 out-of-scope ⇒ REFUSED (OUT_OF_SCOPE)`, res.status === "REFUSED" && res.code === "OUT_OF_SCOPE");
    ok(`${label} 2 atomic: authorized file UNCHANGED + no out-of-scope write`, r.read("src/target.ts") === "export const V = 1;\n" && r.read("src/evil.ts") === null);
    r.cleanup(); }

  // 3. provider unavailable (no stub + no local model) ⇒ GENERATOR_UNAVAILABLE, no external fallback.
  //    `present:false` FORCES no-model deterministically (the host may actually have a local model installed).
  { const r = makeRoot("x\n");
    const res = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, present: false });
    ok(`${label} 3 unavailable ⇒ GENERATOR_UNAVAILABLE (no external fallback)`, res.status === "REFUSED" && res.code === "GENERATOR_UNAVAILABLE");
    r.cleanup(); }

  // 4. malformed output ⇒ MALFORMED_OUTPUT (and a throwing provider ⇒ PROVIDER_ERROR) — no false success.
  { const r = makeRoot("x\n");
    const m = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: genMalformed, verify: () => ({ ok: true }) });
    const t = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: genThrows, verify: () => ({ ok: true }) });
    ok(`${label} 4 malformed ⇒ MALFORMED_OUTPUT; throw ⇒ PROVIDER_ERROR; neither EXECUTED`, m.code === "MALFORMED_OUTPUT" && t.code === "PROVIDER_ERROR" && m.status !== "EXECUTED" && t.status !== "EXECUTED");
    r.cleanup(); }

  // 5. authorization absent/invalid ⇒ PROVIDER_NOT_ACTIVATED (LOCAL policy gate; external untouched).
  { const r = makeRoot("x\n");
    const res = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: "DISABLED", generate: genInScope, verify: () => ({ ok: true }) });
    ok(`${label} 5 not-activated ⇒ PROVIDER_NOT_ACTIVATED, nothing applied`, res.status === "REFUSED" && res.code === "PROVIDER_NOT_ACTIVATED" && r.read("src/target.ts") === "x\n");
    r.cleanup(); }

  // 6. independent verification fails ⇒ FAILED (no false success even though a diff was applied).
  { const r = makeRoot("export const V = 1;\n");
    const res = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: genInScope, verify: () => ({ ok: false, detail: "tests red" }) });
    ok(`${label} 6 verification fails ⇒ FAILED (VERIFICATION_FAILED), not EXECUTED`, res.status === "FAILED" && res.code === "VERIFICATION_FAILED" && res.verified === false);
    r.cleanup(); }

  // 7. idempotence/resume: run1 applies (effective=1); a replay sees the target already present ⇒ NO_CHANGE,
  //    zero mutation (never double-applies — safe to resume after an interruption).
  { const r = makeRoot("export const V = 1;\n");
    const r1 = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: genInScope, verify: () => ({ ok: true }) });
    const r2 = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: genInScope, verify: () => ({ ok: true }) });
    ok(`${label} 7 idempotent replay: run1 EXECUTED(effective=1), run2 NO_CHANGE (zero mutation, no double-apply)`, r1.status === "EXECUTED" && r1.effectiveChanges === 1 && r2.status === "REFUSED" && r2.code === "NO_CHANGE" && r.read("src/target.ts") === "export const V = 2;\n");
    r.cleanup(); }

  // 8. provider holds NO authority: never committed; cannot widen scope (covered by 2); cannot self-activate (5).
  { const r = makeRoot("export const V = 1;\n");
    const res = mod.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: genInScope, verify: () => ({ ok: true }) });
    ok(`${label} 8 provider never commits (committed:false) and ODG is the applicator`, res.committed === false && res.appliedBy === "ODG_EXECUTOR");
    r.cleanup(); }
}

// Registration/dispatch wiring: resolve() routes an IMPLEMENT_VIA_LOCAL_PROVIDER objective to the capability,
// and in production (no local generator) it fails CLOSED (throws GENERATOR_UNAVAILABLE), never a false success.
console.log("implement-via-local-provider — dispatch registration (resolve)");
{ const ex = JS.resolve({ objectiveId: "IMPLEMENT_LOCAL_CODE_X" });
  ok("resolve() matches the capability by objectiveId", ex && ex.capability === "Implement Via Local Provider");
  ok("activation policy reader reads AUTONOMOUS_SANDBOXED from runtime-mode.json", JS.localProviderActivation() === "AUTONOMOUS_SANDBOXED" && TS.localProviderActivation() === "AUTONOMOUS_SANDBOXED"); }

// --- defaultLocalGenerate (the PRODUCTION local adapter) — deterministic, injected model runner ---------
console.log("implement-via-local-provider — defaultLocalGenerate (local adapter, injected runner)");
{
  const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "ivlp-gen-")); fs.mkdirSync(path.join(d, "src"), { recursive: true }); fs.writeFileSync(path.join(d, "src", "math.ts"), "// todo\n"); return d; };
  const ctx = (wd) => ({ objective: { objectiveId: "IMPLEMENT_LOCAL_CODE_T", goal: "add(a,b)" }, files: ["src/math.ts"], workDir: wd, io: fs });
  // cleanCompletion strips fences + ANSI
  ok("cleanCompletion strips ``` fences + ANSI", JS.cleanCompletion("```ts\n\x1B[1mexport const X=1;\x1B[0m\n```") === "export const X=1;" && TS.cleanCompletion("```\na\n```") === "a");
  // resolveModelInvocation defaults to ollama; honors ODG_LOCAL_MODEL_CMD
  ok("resolveModelInvocation defaults to ollama run <model>", (() => { const i = JS.resolveModelInvocation("P"); return i.cmd === "ollama" && i.args[0] === "run" && i.args[2] === "P"; })());
  ok("resolveModelInvocation honors ODG_LOCAL_MODEL_CMD (argv + stdin)", (() => { process.env.ODG_LOCAL_MODEL_CMD = "mycli --flag"; const i = TS.resolveModelInvocation("P"); delete process.env.ODG_LOCAL_MODEL_CMD; return i.cmd === "mycli" && i.args[0] === "--flag" && i.input === "P"; })());
  // localModelPresent is fail-closed + injectable
  ok("localModelPresent honors injected present + probe (fail-closed)", JS.localModelPresent({ present: false }) === false && JS.localModelPresent({ probe: () => ({ status: 0 }) }) === true && JS.localModelPresent({ probe: () => { throw new Error("x"); } }) === false);
  for (const [label, mod] of [["JS", JS], ["TS", TS]]) {
    // valid completion ⇒ cleaned code written into the working copy
    { const wd = mk(); const g = mod.defaultLocalGenerate(ctx(wd), { modelRunner: () => ({ status: 0, stdout: "```ts\nexport function add(a,b){return a+b;}\n```" }) });
      ok(`${label} gen: valid completion ⇒ ok + fences stripped + written`, g.ok === true && fs.readFileSync(path.join(wd, "src", "math.ts"), "utf8") === "export function add(a,b){return a+b;}\n");
      fs.rmSync(wd, { recursive: true, force: true }); }
    // model non-zero ⇒ error (no false success); working copy untouched
    { const wd = mk(); const g = mod.defaultLocalGenerate(ctx(wd), { modelRunner: () => ({ status: 1, stdout: "" }) });
      ok(`${label} gen: model non-zero ⇒ error`, !!g.error && fs.readFileSync(path.join(wd, "src", "math.ts"), "utf8") === "// todo\n");
      fs.rmSync(wd, { recursive: true, force: true }); }
    // empty cleaned output ⇒ error
    { const wd = mk(); const g = mod.defaultLocalGenerate(ctx(wd), { modelRunner: () => ({ status: 0, stdout: "```\n```" }) });
      ok(`${label} gen: empty output ⇒ error`, !!g.error);
      fs.rmSync(wd, { recursive: true, force: true }); }
  }
  // END-TO-END with the injected generate: implementViaLocalProvider using defaultLocalGenerate-via-runner.
  { const r = makeRoot("export const V = 1;\n");
    const gen = (c) => JS.defaultLocalGenerate(c, { modelRunner: () => ({ status: 0, stdout: "export const V = 2;\n" }) });
    const res = JS.implementViaLocalProvider(OBJ, { root: r.root, activation: ACT, generate: gen, verify: () => ({ ok: true }) });
    ok("end-to-end: defaultLocalGenerate(runner) ⇒ EXECUTED, applied in-scope, committed:false", res.status === "EXECUTED" && res.verified === true && res.committed === false && r.read("src/target.ts") === "export const V = 2;\n");
    r.cleanup(); }
}

console.log(`\nIMPLEMENT-VIA-LOCAL-PROVIDER — ${passed} assertions passed.`);
