#!/usr/bin/env node
"use strict";
/*
 * V17.5 (owner CTO directive 2026-11-24 « BRAIN, NATIVE AUTONOMY & EXECUTION SPEED », PRIORITY 2) — NATIVE-REPAIR WORK
 * ITEM: ODG detects a REAL defect in its OWN repository from executed evidence, derives a targeted modification, and
 * writes the WORK_ITEM_CONTRACT + the test oracle by deterministic rules. It does NOT generate the fix (the local model
 * does, driven by runtime/bin/odg-v175-native-build-run.ts) and it authorizes nothing.
 *
 * DEFECT CLASS NON_CANONICAL_CANON (detected, not assumed): runtime/core carries many private `function canon(...)`
 * serializers used for hashing / signing / digests. detectCanonDefects() EXTRACTS each definition from the source,
 * transpiles it (typescript.transpileModule) and EXECUTES it in a fresh vm context on fixed probe pairs:
 *   NESTED_KEY_DROP  — two values that differ only in a NESTED field serialize identically (JSON.stringify replacer-array
 *                      bug: the top-level key list filters every nesting level) ⇒ a hash/signature does not cover nested
 *                      fields (audit-log: a tampered nested payload field still verifies);
 *   ORDER_SENSITIVE  — the same object with a different key insertion order serializes differently (not canonical);
 *   NOT_STRING       — returns a value, not a string (a different helper sharing the name; reported, not a defect);
 *   UNLOADABLE       — the extracted definition depends on other module state (reported, not graded);
 *   CANONICAL        — passes all probes.
 * A defect is reported only when ≥1 definition is NESTED_KEY_DROP or ORDER_SENSITIVE AND no shared canonical module
 * (TARGET_MODULE) exists yet. The REFERENCE semantics = the largest group of byte-identical CANONICAL definitions
 * (majority rule) — the oracle's expected values are COMPUTED by executing that in-repo reference, never hand-written.
 *
 * TARGETED MODIFICATION (≤2 files): add the missing shared helper runtime/core/odg-canonical-json.ts (model-authored) +
 * its oracle test runtime/core/odg-canonical-json.test.ts (rules-authored from the computed oracle). Migrating the
 * defective callers is NOT in scope: changing audit-log / agent-identity serialization changes every persisted chain hash
 * and every signature preimage ⇒ OWNER_GATED follow-up (stated in the contract, never done silently).
 *
 * Deterministic: same repo bytes ⇒ same detection, same contract, same oracle. Reads files only (no writes, no network).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const SCAN_DIR = "runtime/core";
const TARGET_MODULE = "runtime/core/odg-canonical-json.ts";
const TARGET_TEST = "runtime/core/odg-canonical-json.test.ts";
const SANDBOX_FILE = "odg-canonical-json.js";          // name of the generated module inside the bwrap sandbox
const EXPORT_NAME = "canonicalJson";
const DEFECT_CLASS = "NON_CANONICAL_CANON";
const DEFECTIVE = Object.freeze(["NESTED_KEY_DROP", "ORDER_SENSITIVE"]);

const sha256 = (s: any): string => crypto.createHash("sha256").update(String(s)).digest("hex");
function canonKey(v: any): string {   // local, nested-complete key used ONLY to compare probe outputs (not a product helper)
  if (Array.isArray(v)) return "[" + v.map(canonKey).join(",") + "]";
  if (v !== null && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonKey(v[k])).join(",") + "}";
  return v === undefined ? "<undefined>" : JSON.stringify(v);
}

/* extractDefinitions(src) — every top-level `function canon(` block (brace-matched; braces inside strings/regex are not
 * expected in these one-purpose helpers — an unbalanced extraction becomes UNLOADABLE, never a guess). */
function extractDefinitions(src: string): any[] {
  const lines = String(src).split("\n"); const out: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^function canon\(/.test(lines[i])) continue;
    let depth = 0, started = false; const body: string[] = [];
    for (let j = i; j < lines.length && j < i + 40; j++) {
      body.push(lines[j]);
      for (const ch of lines[j]) { if (ch === "{") { depth++; started = true; } else if (ch === "}") depth--; }
      if (started && depth === 0) break;
    }
    out.push({ line: i + 1, source: body.join("\n"), balanced: started && depth === 0 });
  }
  return out;
}

/* loadDefinition(source) — transpile the single TS function and evaluate it in a FRESH vm context (repo-internal trusted
 * code; nothing from a model is ever loaded here). */
function loadDefinition(source: string): any {
  const ts = require("typescript");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js + "\n;canon", Object.create(null), { timeout: 1000 });
}

const PROBES = Object.freeze({
  nested: Object.freeze([{ a: { x: 1 } }, { a: { x: 2 } }]),          // must DIFFER
  order: Object.freeze([{ b: 1, a: 2 }, { a: 2, b: 1 }]),              // must be EQUAL
});
function classify(fnc: any): string {
  const call = (v: any) => vm.runInNewContext("f(v)", Object.assign(Object.create(null), { f: fnc, v: JSON.parse(JSON.stringify(v)) }), { timeout: 1000 });
  let n1, n2, o1, o2;
  try { n1 = call(PROBES.nested[0]); n2 = call(PROBES.nested[1]); o1 = call(PROBES.order[0]); o2 = call(PROBES.order[1]); } catch { return "UNLOADABLE"; }
  if (typeof n1 !== "string") return "NOT_STRING";
  if (n1 === n2) return "NESTED_KEY_DROP";
  if (o1 !== o2) return "ORDER_SENSITIVE";
  return "CANONICAL";
}

/* detectCanonDefects(root) -> { ok, defect, defectClass, sites[], reference, evidenceDigest, scanned, targetExists } */
function detectCanonDefects(root: string): any {
  const dir = path.join(root, SCAN_DIR);
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
  const sites: any[] = [];
  for (const f of files) {
    let src = ""; try { src = fs.readFileSync(path.join(dir, f), "utf8"); } catch { continue; }
    if (src.indexOf("function canon(") < 0) continue;
    for (const d of extractDefinitions(src)) {
      let verdict = "UNLOADABLE", fnc: any = null;
      if (d.balanced) { try { fnc = loadDefinition(d.source); verdict = typeof fnc === "function" ? classify(fnc) : "UNLOADABLE"; } catch { verdict = "UNLOADABLE"; } }
      sites.push({ file: `${SCAN_DIR}/${f}`, line: d.line, sourceSha256: sha256(d.source), verdict, source: d.source, _fn: fnc });
    }
  }
  const defective = sites.filter((s) => DEFECTIVE.includes(s.verdict));
  // REFERENCE = largest group of byte-identical CANONICAL definitions (ties ⇒ lexicographically smallest sha: deterministic)
  const groups: any = {};
  for (const s of sites) if (s.verdict === "CANONICAL") (groups[s.sourceSha256] = groups[s.sourceSha256] || []).push(s);
  const best = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length || (a < b ? -1 : 1))[0] || null;
  const reference = best ? { sourceSha256: best, copies: groups[best].map((s: any) => `${s.file}:${s.line}`), source: groups[best][0].source, rule: "REF-1: largest group of byte-identical CANONICAL definitions (tie ⇒ smallest sha256)" } : null;
  const targetExists = fs.existsSync(path.join(root, TARGET_MODULE));
  const publicSites = sites.map(({ _fn, source, ...rest }) => rest);
  const evidenceDigest = sha256(canonKey(publicSites.filter((s) => DEFECTIVE.includes(s.verdict)).map((s) => ({ file: s.file, line: s.line, sha: s.sourceSha256, verdict: s.verdict }))));
  return Object.freeze({
    ok: true, defectClass: DEFECT_CLASS, defect: defective.length > 0 && !targetExists && reference !== null,
    sites: publicSites, defectiveSites: publicSites.filter((s) => DEFECTIVE.includes(s.verdict)),
    reference: reference ? { sourceSha256: reference.sourceSha256, copies: reference.copies, rule: reference.rule } : null,
    _referenceFn: best ? groups[best][0]._fn : null,
    evidenceDigest, scanned: files.length, targetExists,
    probes: PROBES,
  });
}

/* ODG oracle corpus (JSON-transportable inputs; fixed by rule ORC-1). Expected values are COMPUTED by the reference. The
 * first REPAIR_N inputs are the repair examples (shown to the model only after a failure, as input→expected/actual);
 * the rest are the held-out acceptance cases (expected values never enter a prompt or the sandbox). */
const ORACLE_INPUTS = Object.freeze([
  { b: 1, a: 2 }, { a: { y: 1, x: 2 } }, [3, "x", null], "plain",
  null, 42, 1.5, true, "q\"uote\n", [], {}, [[], [{}]],
  { z: null, a: [1, "x", false] }, [{ b: 1, a: [3, { d: 1, c: 2 }] }], { a: { b: { c: { e: 2, d: 1 } } } },
  { "k\"q": "v", "": 0, B: 1, a: 2 }, { x: [{ b: 2, a: 1 }, { a: 1 }] }, { n: -7, f: 0.25, s: "", t: false },
]);
const REPAIR_N = 4;
function buildOracle(detection: any): any {
  const ref = detection && typeof detection._referenceFn === "function" ? detection._referenceFn : null;
  if (!ref) return null;
  const rows = ORACLE_INPUTS.map((v: any) => ({ args: [JSON.parse(JSON.stringify(v))], expect: vm.runInNewContext("f(v)", Object.assign(Object.create(null), { f: ref, v: JSON.parse(JSON.stringify(v)) }), { timeout: 1000 }) }));
  return Object.freeze({
    rule: "ORC-1: fixed JSON-transportable input corpus (provider-written rule); expected = executing the detected in-repo REFERENCE definition (REF-1) on each input — no hand-written expected value",
    referenceSha256: detection.reference.sourceSha256,
    repairExamples: rows.slice(0, REPAIR_N),
    acceptanceCases: rows.slice(REPAIR_N).map((r: any) => ({ entry: SANDBOX_FILE, member: EXPORT_NAME, args: r.args, expect: r.expect })),
    sha256: sha256(canonKey(rows)),
  });
}

/* The natural-language contract given to the local model (no reference source, no expected output of a held-out case). */
const MODULE_SPEC = [
  `Export exactly one function, ${EXPORT_NAME}(value), that returns a deterministic canonical JSON STRING for any JSON-compatible value (null, boolean, number, string, array, plain object).`,
  "Rules, applied recursively at EVERY nesting level:",
  "- null, booleans, numbers and strings: return JSON.stringify(value).",
  `- arrays: "[" + each element converted with ${EXPORT_NAME} + joined with "," + "]" (element order kept).`,
  `- plain objects: sort the keys with the default Array.prototype.sort(), emit each key as JSON.stringify(key) + ":" + ${EXPORT_NAME}(child), join with ",", wrap in "{" and "}".`,
  "- no whitespace anywhere. Do not use a JSON.stringify replacer array (it drops nested keys).",
  `Export it as: module.exports = { ${EXPORT_NAME} };`,
].join("\n");

/* buildContract(detection, oracle) — the WORK_ITEM_CONTRACT written by ODG's rules from the detection (PROPOSED: the
 * owner authorizes; this function never sets AUTHORIZED). */
function buildContract(detection: any, oracle: any, runner: any): any {
  if (!detection || detection.defect !== true || !oracle) return null;
  const sites = detection.defectiveSites.map((s: any) => `${s.file}:${s.line} ${s.verdict}`);
  return {
    scenario: "V175-NB1",
    title: "First ODG-native software construction: shared canonical-JSON helper (local model authors, ODG tests/repairs/verifies)",
    state: "PROPOSED",
    authorizedBy: null,
    origin: { detectedBy: "runtime/core/odg-native-repair-item.ts detectCanonDefects (executed probes)", defectClass: detection.defectClass, evidenceDigest: detection.evidenceDigest, defectiveSites: sites, reference: detection.reference, oracleSha256: oracle.sha256 },
    WORK_ITEM_CONTRACT: {
      objective: `Add the missing shared canonical-JSON helper ${TARGET_MODULE} (export ${EXPORT_NAME}) whose code is generated by ODG's LOCAL model and accepted only on ODG's sandboxed oracle + strict typecheck — the prerequisite for repairing ${sites.length} defective private canon() serializers (${sites.join("; ")})`,
      scope: "internal repo only; loopback Ollama 127.0.0.1:11434 only; model code executes only in the bwrap native-build sandbox; €0; 0 provider calls; the patch is produced as a branch-ready diff (record) — never written into any checkout by the runner; caller migration (audit-log / agent-identity / supply-chain-attest) is OUT OF SCOPE (OWNER_GATED: changes persisted hash/signature preimages)",
      // GO-DT-1 needs the dispatch command + its writeSet ⊆ write_set ⇒ runner + result record are listed; the NATIVE patch
      // itself (what the local model's build may change, via the produced diff + a normal PR) is nativePatchWriteSet (2 files).
      write_set: [TARGET_MODULE, TARGET_TEST, runner.command, runner.out],
      nativePatchWriteSet: [TARGET_MODULE, TARGET_TEST],
      authorized_symbols: [EXPORT_NAME],
      moduleSpec: MODULE_SPEC,
      invariants: [
        "the patch module content is authored by the local model only — no provider/Claude Code edit of generated code (sha256 of every generation recorded)",
        "the test file is authored by ODG rules from the computed oracle (ORC-1/REF-1), not by the model and not by hand",
        "acceptance is decided only by the sandboxed held-out oracle + strict typecheck — never by the model's claim",
        "a FAIL is recorded as FAIL; criteria and budgets are not changed after observation",
        "no canonical module is modified; no ROADMAP.json / selector weights / V12.4 change",
      ],
      acceptance_criteria: [
        `AC1 held-out oracle: all ${oracle.acceptanceCases.length} acceptanceCases PASS inside odg-native-build-sandbox.runIsolated (executionStatus EXECUTED, executionMode SANDBOX)`,
        "AC2 strict typecheck: the generated TypeScript has 0 diagnostics under strict + isolatedModules (in-memory TypeScript program)",
        `AC3 branch-ready: the produced diff adds exactly ${TARGET_MODULE} and ${TARGET_TEST} and passes git apply --check against the run HEAD`,
        "AC4 provenance: record carries actor=ODG, executionClass ODG_LOCAL_MODEL_EXECUTION, model, every prompt sha256, every generation sha256, attempts, per-round test + typecheck results, providerCalls 0",
        "AC5 detection reproduced at run time: the fresh detection evidenceDigest equals origin.evidenceDigest (else NOT_MEASURED)",
      ],
      stop_conditions: ["model call cap reached", "wall cap reached", "sandbox unavailable (NOT_RUN ⇒ NOT_MEASURED)", "any non-loopback network request (refused + recorded ⇒ NOT_MEASURED)", "detection drift (AC5)"],
      rollback: "nothing is written into any checkout; discard the record",
      evidence_required: [runner.out],
      budgets: runner.budgets,
      preRegistration: {
        metric: "verdict of runNativeBuild (PASS ⇔ AC1 ∧ AC2 ∧ AC3 on one local-model generation, within budgets)",
        baseline: "PROBE (provider-run feasibility probe, PR #972, NOT the native result): qwen2.5-coder:7b PASS on the first generation, 0 repairs, 1 model call, 154 s",
        dataset: { oracleRule: "ORC-1/REF-1", oracleSha256: oracle.sha256, acceptanceCases: oracle.acceptanceCases.length, repairExamples: oracle.repairExamples.length, referenceSha256: detection.reference.sourceSha256 },
        decisionRule: "outcome = runner verdict, recorded verbatim: PASS / FAIL / NOT_MEASURED (sandbox NOT_RUN, refused network request, detection or oracle drift); one dispatch; no re-run to obtain a PASS",
        caps: { maxRunWallMs: Number(runner.budgets.wallMs) + Number(runner.budgets.perCallTimeoutMs), maxModelCalls: runner.budgets.maxModelCalls, basis: "runner guard: no new model call after budgets.wallMs; one in-flight call may still last perCallTimeoutMs ⇒ maxRunWallMs = wallMs + perCallTimeoutMs (GO-DTO-1 derives the dispatch kill bound from it)" },
        thresholds: { PASS: "all acceptanceCases pass in the sandbox AND 0 strict typecheck diagnostics AND git apply --check OK", FAIL: "budgets exhausted without PASS", NOT_MEASURED: "no sandbox verdict / network refusal / drift" },
        honestLimits: "the function to build is specified by the provider-written MODULE_SPEC + ORC-1 input corpus (expected values computed from the in-repo reference); a PASS means the LOCAL MODEL implemented a provider-specified function under ODG's loop — not that ODG designed the change",
      },
    },
    authorization: {
      by: null,
      scope: ["REVISE_CONTRACT", "INSPECT_REVISED_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"],
      executionAuthorized: false,
      executionCondition: "isolated, reproducible, loopback-only (127.0.0.1:11434) local-model build at €0 with 0 provider calls; model code only in the bwrap sandbox; only after an independent inspection ACCEPT of this contract is recorded",
      dispatchTargets: { RUN_CONTROLLED_EXPERIMENTS: { command: runner.command, args: [runner.out], writeSet: [runner.out] } },
    },
  };
}

const NATIVE_REPAIR_ITEM_CONTRACT = Object.freeze({
  id: "V175-NATIVE-REPAIR-ITEM",
  notAuthority: "detects + specifies; never generates the fix, never authorizes, never writes",
  defectClass: DEFECT_CLASS, target: Object.freeze([TARGET_MODULE, TARGET_TEST]),
});

module.exports = { detectCanonDefects, extractDefinitions, classify, buildOracle, buildContract, MODULE_SPEC, ORACLE_INPUTS, REPAIR_N, TARGET_MODULE, TARGET_TEST, SANDBOX_FILE, EXPORT_NAME, DEFECT_CLASS, canonKey, sha256, NATIVE_REPAIR_ITEM_CONTRACT };
export {};
