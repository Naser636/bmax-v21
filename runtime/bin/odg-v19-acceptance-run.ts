#!/usr/bin/env node
"use strict";
/*
 * V19 — generic contract ACCEPTANCE runner (the declared RUN_CONTROLLED_EXPERIMENTS target of engineering work items whose
 * criteria are acceptance tests + a LEARN-1 before-metric, e.g. V178-P5 / P6 / P7). ONE execution per contract:
 *   ACC-T  every acceptance test id of the contract ("<SCENARIO>/ACn" in acceptance_tests[]) is reported "ok - <id>…" by its
 *          declared test file, each file run ONCE, one at a time, exit 0;
 *   ACC-C  tsc --noEmit --incremental false -p tsconfig.json exit 0;
 *   ACC-M  LEARN-1: every beforeMetric entry { source: "<file>#<symbol>", value: "ABSENT" } is recomputed from the current tree:
 *          IMPROVED iff the symbol is now an exported/defined name of that file; unchanged ⇒ NOT_IMPROVED; file missing ⇒
 *          NOT_MEASURED. (Other beforeMetric shapes ⇒ NOT_MEASURED — never guessed.)
 * outcome PASS ⇔ ACC-T ∧ ACC-C ∧ every ACC-M IMPROVED; any NOT_MEASURED ⇒ NOT_MEASURED; else FAIL.
 * Positional args only (GO-DT-1): npx tsx runtime/bin/odg-v19-acceptance-run.ts <SCENARIO> <OUT>. Writes ONLY <OUT>, which must
 * equal the contract's declared dispatch writeSet; refuses an existing OUT (exit 4); gated on deriveAuthorizationScope + the
 * contract's committed inspection (exit 2). No model, no network.
 */
const fs = require("fs"), path = require("path"), cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return null; } }
function runFile(f: string): any { const r = cp.spawnSync("npx", ["tsx", f], { cwd: ROOT, encoding: "utf8", timeout: 600000 }); return { file: f, exit: r.status, out: String(r.stdout || "") + String(r.stderr || "") }; }
function runTsc(): any { const r = cp.spawnSync("npx", ["tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"], { cwd: ROOT, encoding: "utf8", timeout: 600000 }); return { command: "tsc --noEmit --incremental false -p tsconfig.json", exit: r.status, ok: r.status === 0 }; }
function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function measure(entry: any, root: string): any {
  const src = entry && typeof entry.source === "string" ? entry.source : "";
  const m = /^([^#]+)#([A-Za-z_$][\w$]*)$/.exec(src);
  if (!m || entry.value !== "ABSENT") return { source: src, before: entry && entry.value, after: null, verdict: "NOT_MEASURED", reason: "only '<file>#<symbol>' ABSENT metrics are recomputable here" };
  let text: string | null = null; try { text = fs.readFileSync(path.join(root, m[1]), "utf8"); } catch { text = null; }
  if (text === null) return { source: src, before: "ABSENT", after: null, verdict: "NOT_MEASURED", reason: "source file missing" };
  const defined = new RegExp(`(?:function|const|let|class)\\s+${esc(m[2])}\\b`).test(text) && new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${esc(m[2])}\\b`).test(text);
  return { source: src, before: "ABSENT", after: defined ? "PRESENT" : "ABSENT", verdict: defined ? "IMPROVED" : "NOT_IMPROVED" };
}

function runAcceptance(contract: any, o: any): any {
  const w = contract.WORK_ITEM_CONTRACT || {};
  const tests = Array.isArray(w.acceptance_tests) ? w.acceptance_tests : [];
  const files = [...new Set(tests.map((t: any) => t.file))] as string[];
  const outs = new Map(files.map((f) => [f, o.runFile(f)]));
  const perTest = tests.map((t: any) => { const r = outs.get(t.file); const seen = !!r && new RegExp(`^[ \\t]*ok - ${esc(t.id)}\\b`, "m").test(r.out); return { id: t.id, file: t.file, reportedOk: seen, fileExit: r ? r.exit : null }; });
  const accT = { met: tests.length > 0 && perTest.every((x: any) => x.reportedOk) && files.every((f) => outs.get(f).exit === 0), tests: perTest, files: files.map((f) => ({ file: f, exit: outs.get(f).exit })) };
  const tsc = o.runTsc();
  const metrics = (Array.isArray(contract.beforeMetric) ? contract.beforeMetric : []).map((e: any) => measure(e, o.root));
  const accM = { verdicts: metrics, met: metrics.length > 0 && metrics.every((x: any) => x.verdict === "IMPROVED") };
  const nm = metrics.some((x: any) => x.verdict === "NOT_MEASURED") || metrics.length === 0;
  const outcome = nm ? "NOT_MEASURED" : accT.met && tsc.ok && accM.met ? "PASS" : "FAIL";
  return { criteria: { "ACC-T": accT, "ACC-C": { met: tsc.ok, ...tsc }, "ACC-M": accM }, outcome };
}

function main(argv: string[]): number {
  const [scenario, out] = argv;
  if (!scenario || !out || argv.some((a) => a.startsWith("-"))) { process.stdout.write("REFUSED: usage <SCENARIO> <OUT> (positional only)\n"); return 3; }
  const d = readJson(CONTRACTS); const c = d && (d.contracts || []).find((x: any) => x && x.scenario === scenario);
  if (!c) { process.stdout.write(`REFUSED: no contract ${scenario}\n`); return 3; }
  const t = c.authorization && c.authorization.dispatchTargets && c.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS;
  if (!t || t.command !== "runtime/bin/odg-v19-acceptance-run.ts" || JSON.stringify(t.args) !== JSON.stringify([scenario, out]) || JSON.stringify(t.writeSet) !== JSON.stringify([out])) { process.stdout.write("REFUSED: OUT / args are not the contract's declared dispatch target of this runner\n"); return 3; }
  if (fs.existsSync(path.join(ROOT, out))) { process.stdout.write(`ALREADY_RECORDED: ${out} exists — one execution only\n`); return 4; }
  const AS = require("../core/odg-authorization-scope");
  const ev = require("../core/odg-authorization-evidence-paths.js").AUTH_EVIDENCE[scenario];
  const insp = ev ? readJson(ev.inspection) : null;
  const sc = AS.deriveAuthorizationScope(c, { inspection: insp ? { ...insp, recordPath: ev.inspection } : null, probes: require("../core/odg-observation-currency.js").localGitProbes(ROOT) });
  if (!(sc.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && sc.executionAuthorized === true)) { process.stdout.write(`NOT_AUTHORIZED: scope ${sc.currentStep} executionAuthorized=${sc.executionAuthorized} — ${sc.reason}\n`); return 2; }
  const r = runAcceptance(c, { root: ROOT, runFile, runTsc });
  const rec = { schema: "odg-v19-acceptance-result/1", scenario, label: "NATIVE (ODG GO dispatch)", rule: "ACC-1: PASS ⇔ every acceptance test id reported ok by its file (each file once, exit 0) ∧ tsc clean ∧ every LEARN-1 before-metric IMPROVED; NOT_MEASURED if any metric cannot be recomputed", ...r,
    contractSha256: AS.contractSha256(c), provenance: { codeAuthor: "PROVIDER (Claude Code)", decisionAuthority: "ODG GO (dispatch of the declared target)", network: "none", modelCalls: 0, providerCalls: 0 } };
  fs.writeFileSync(path.join(ROOT, out), JSON.stringify(rec, null, 2) + "\n");
  process.stdout.write(`${scenario} acceptance outcome ${rec.outcome} → ${out}\n`);
  return rec.outcome === "PASS" ? 0 : 1;
}

module.exports = { runAcceptance, measure, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
export {};
