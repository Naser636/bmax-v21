#!/usr/bin/env node
"use strict";
/* V17.6 — odg-radar-build-engine: determinism, source citation, dedup vs existing register items / in-flight builds,
 * deny-by-default (nothing authorized / executed), owner gate, no network calls, no store, honest NOT_MEASURED. */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const net = require("net");
const dns = require("dns");
const E = require("./odg-radar-build-engine.js");
const CLI = require("../bin/odg-v176-radar-build-proposals.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const ROOT = path.resolve(__dirname, "..", "..");
const NOW = Date.parse("2026-11-24T00:00:00Z");
const P = (k: string) => `docs/test/${k}.json`;
function fixture(): any {
  return {
    register: { path: P("reg"), data: { register: { items: [
      { id: "CP8-GAP-7-validateIndependently", criteria: { speedEfficiency: { status: "NOT_MEASURED" }, reusability: { status: "MEASURED", value: 1 } } },
      { id: "J", criteria: { speedEfficiency: { status: "NOT_MEASURED" }, reusability: { status: "NOT_MEASURED" } } },
    ], contradictions: { detected: [{ rule: "CTR-3", kind: "STALE_CHECKPOINT_POINTER", a: "x", b: "y", state: "OPEN" }] } } } },
    contracts: { path: P("contracts"), data: { contracts: [{ scenario: "G2" }] } },
    outcome: { path: P("ol"), data: { findings: [
      { id: "OL-2", status: "HYPOTHESIS", n: 2, statement: "selection drift: 2 items" },
      { id: "OL-5", status: "HYPOTHESIS", n: 4, statement: "on these items the score did not separate outcomes" },
      { id: "OL-6", status: "HYPOTHESIS", n: 2, statement: "this criterion did not anticipate success on these items" },
      { id: "OL-9", status: "HYPOTHESIS", n: 1, statement: "an unmapped finding nobody linked" },
    ] } },
    production: { path: P("pm"), data: { windowShare: { prs: "#1–#2", nativeCodeLinesMerged: 0, providerLinesMerged: 10 }, missions: [{ cost: { providerEngagedEur: { status: "NOT_MEASURED" } } }, { cost: { providerEngagedEur: { status: "NOT_MEASURED" } } }], prTimeline: { prs: [], aggregate: { prs: 2, withInspectionFindingCommits: ["#1"], split: { afterOpenUntilLastCommitShare: 0.8 } } } } },
    checkpoint: { path: P("cp"), data: { openGaps: ["4 register criteria NOT_MEASURED for every item (build in progress: native criteria measurement)", "cryptographic inspector identity (declared session ids only)"], ownerDecisionsOpen: ["GitHub AUP §6/§7"] } },
    precedence: { path: P("prec"), data: { ownerQuestions: [{ id: "Q-CTR2", blocking: true, question: "does 'le Radar existant' cover …", answer: null }, { id: "Q-DONE", question: "answered", answer: "yes" }] } },
    nb1Validation: { path: P("nb1"), data: { limits: ["oracle lacked cases — target of V175-NB2 (ODG-designed repair)", "module lacks 'use strict' (scan finding, not a defect)"] } },
    nativeBuild: { path: P("nb"), data: { integration: "OWNER_GATED: migrating audit-log / agent-identity changes preimages", detection: { defectiveSites: [{ file: "runtime/core/audit-log.ts" }, { file: "runtime/core/agent-identity.ts" }] } } },
    externalRadar: [{ path: P("ext"), data: { results: [{ claim: "automation with a human touch", capability: "jidoka", admitted: 1, verdict: "RETURN_TO_EXPERIMENT", sources: ["https://a.example"] }, { claim: "single source", capability: "x", admitted: 0 }] } }],
    testReports: [],
  };
}
const GRAPH = { modules: ["odg-go-cycle", "mission-priority-selector", "odg-outcome-learning", "odg-strategic-register", "odg-production-metric", "evaluator-independence", "inspection-boundary", "odg-jidoka-completeness", "odg-native-repair-item", "odg-governance-precedence", "odg-radar-source-admission", "audit-log", "agent-identity", "x1", "x2"],
  deps: {}, consumers: { "mission-priority-selector": ["odg-go-cycle", "x1"], "odg-go-cycle": ["x2"], "audit-log": ["x1"] } };
const ctx = (over?: any) => {
  const src = fixture(); const ep: any = {};
  for (const k of Object.keys(src)) { const v = src[k]; for (const d of (Array.isArray(v) ? v : [v])) if (d && d.path) ep[d.path] = NOW - 86400000; }
  return Object.assign({ graph: GRAPH, nowEpochMs: NOW, sourceEpochMs: ep, classifyPath: (p: string) => (/radar/.test(p) ? "RADAR_STAGE" : "OTHER") }, over || {});
};

function main() {
  const src = fixture();
  const r = E.buildProposals(src, ctx());
  const by = (id: string) => r.signals.filter((s: any) => s.id === id);
  const prop = (id: string) => r.proposals.find((p: any) => p.id === id);

  // determinism
  check("deterministic: same injected inputs ⇒ byte-identical result", JSON.stringify(E.buildProposals(fixture(), ctx())) === JSON.stringify(r));
  // source citation
  check("every signal cites ≥1 committed source pointer (path#pointer)", r.signals.length > 0 && r.signals.every((s: any) => Array.isArray(s.sources) && s.sources.length && s.sources.every((p: string) => /#/.test(p))));
  check("every proposal draft cites the signals it came from", r.top.every((t: any) => t.contract.source.signals.length >= 1));
  // dedup vs register / contracts / in-flight
  check("signal mapped to an EXISTING register item ⇒ DUPLICATE (reinforces it, no new proposal)", by("CP8-GAP-7-validateIndependently").every((s: any) => s.gate.verdict === "REFUSED" && s.gate.reasons.includes("DUPLICATE")) && !prop("CP8-GAP-7-validateIndependently") && r.reinforcesExisting.some((x: any) => x.existing === "CP8-GAP-7-validateIndependently"));
  check("register NOT_MEASURED criteria + checkpoint gap ⇒ DUPLICATE of the in-flight build named by the checkpoint", r.inFlightBuilds.includes("IN_FLIGHT:native-criteria-measurement") && by("IN_FLIGHT:native-criteria-measurement").length >= 2 && by("IN_FLIGHT:native-criteria-measurement").every((s: any) => s.gate.reasons.includes("DUPLICATE")));
  check("NB1 lesson targeting V175-NB2 ⇒ DUPLICATE of in-flight V175-NB2", by("V175-NB2").length === 1 && by("V175-NB2")[0].gate.reasons.includes("DUPLICATE"));
  check("two signals with the same improvement key ⇒ one proposal (second DUPLICATE, counted as repetition)", by("RB-OUTCOME-FEEDBACK-TO-SCORING").length === 2 && by("RB-OUTCOME-FEEDBACK-TO-SCORING")[1].gate.reasons.includes("DUPLICATE") && prop("RB-OUTCOME-FEEDBACK-TO-SCORING").signalCount === 2);
  check("'not a defect' lesson and non-admitted external observation are ignored, not signals", r.ignored.length === 2 && !r.signals.some((s: any) => /single source|use strict/.test(s.statement)));
  check("answered owner question is not a signal; open one is", r.signals.some((s: any) => s.id === "RB-OWNER-Q-CTR2") && !r.signals.some((s: any) => /Q-DONE/.test(s.statement)));
  check("unmapped statement ⇒ REFUSED NO_COMPONENT_ATTACHED (no invented target)", r.signals.filter((s: any) => /^RB-UNMAPPED-/.test(s.id)).every((s: any) => s.gate.reasons.includes("NO_COMPONENT_ATTACHED")) && r.signals.some((s: any) => /^RB-UNMAPPED-/.test(s.id)));
  // deny-by-default
  check("nothing authorized, nothing executed, no canonical write", r.loopInvariants.authorizedCount === 0 && r.loopInvariants.executedCount === 0 && r.loopInvariants.canonicalWritesPerformed === 0 && r.loopInvariants.executionsPerformed === 0);
  check("every draft is PROPOSED with authorizedBy null and an ESTIMATE write_set", r.top.length > 0 && r.top.every((t: any) => t.contract.state === "PROPOSED" && t.contract.authorizedBy === null && t.contract.write_set.estimate === true));
  check("owner questions ⇒ OWNER_GATED, never auto-selectable", prop("RB-OWNER-Q-CTR2").verdict === "OWNER_GATED" && prop("RB-OWNER-Q-CTR2").requiresOwnerAuthorization === true && !r.top.some((t: any) => t.id === "RB-OWNER-Q-CTR2"));
  check("link-declared owner gate (caller migration) ⇒ OWNER_GATED", prop("RB-CANON-CALLER-MIGRATION").verdict === "OWNER_GATED");
  check("selection is a proposal, not an authorization", /PROPOSAL/.test(r.selection.selectionIsNotAuthorization));
  check("expired source ⇒ refused EXPIRED (no proposal from stale evidence)", (() => { const c = ctx(); for (const k of Object.keys(c.sourceEpochMs)) c.sourceEpochMs[k] = NOW - 400 * 86400000; const x = E.buildProposals(fixture(), c); return x.proposals.length === 0 && x.signals.every((s: any) => s.gate.verdict === "REFUSED" && (s.gate.reasons.includes("EXPIRED_OR_UNDATED_SIGNAL"))); })());
  // honesty
  check("unknown benefit criteria stay NOT_MEASURED (only RB-EVD/RB-BLK/RB-REU/CRC-1 measured)", r.proposals.every((p: any) => ["autonomyBenefit", "capabilityGain", "speedEfficiency", "strategicValue", "reliabilityQuality", "dependencyAvailability"].every((k) => p.criteria[k].status === "NOT_MEASURED")));
  check("component outside the core graph ⇒ multiplier NOT_MEASURED (null), not 0", E.multiplierOf(["runtime/bin/odg-go.ts"], GRAPH).maxDirectConsumers === null);
  check("multiplier from the injected graph: transitive dependents counted", E.multiplierOf(["mission-priority-selector"], GRAPH).maxTransitiveDependents === 3);
  check("before-metric recorded for MEASURE/LEARN; after = null", r.top.every((t: any) => Array.isArray(t.contract.measure.before) && t.contract.measure.before.length >= 1 && t.contract.measure.after === null));
  check("absent test report recorded as NOT_MEASURED, not assumed green", r.absentSources.some((a: string) => /testReport/.test(a)));
  check("Radar-stage paths in a draft are flagged with the V12.4 I / V14.4 phase 1 anchor", (() => { const x = E.buildProposals(fixture(), ctx({ classifyPath: () => "RADAR_STAGE" })); return x.top.every((t: any) => t.contract.write_set.paths.length === 0 || /V12\.4 I/.test(t.contract.governance.anchorIfRadarStage)); })());

  // no network: trap every egress primitive while the engine AND the CLI compute run (CLI reads the committed repo)
  let calls = 0; const trap = () => { calls++; throw new Error("network forbidden"); };
  const saved = [http.request, http.get, https.request, https.get, net.connect, net.createConnection, dns.lookup, (globalThis as any).fetch];
  http.request = http.get = https.request = https.get = trap as any; net.connect = net.createConnection = trap as any; dns.lookup = trap as any; (globalThis as any).fetch = trap;
  let cliRec: any = null, cliErr: any = null;
  try { E.buildProposals(fixture(), ctx()); cliRec = CLI.compute(ROOT); } catch (e) { cliErr = e; }
  [http.request, http.get, https.request, https.get, net.connect, net.createConnection, dns.lookup] = saved.slice(0, 7) as any; (globalThis as any).fetch = saved[7];
  check("no network call during engine + CLI compute (all egress primitives trapped)", calls === 0 && cliErr === null && cliRec !== null);
  check("CLI compute is deterministic over the committed repo", JSON.stringify(CLI.compute(ROOT)) === JSON.stringify(cliRec));
  check("CLI record: nothing authorized/executed; every top draft PROPOSED", cliRec.loopInvariants.authorizedCount === 0 && cliRec.loopInvariants.executedCount === 0 && cliRec.top.every((t: any) => t.contract.state === "PROPOSED"));
  // no store: the engine writes nothing; the CLI writes only its one declared output
  const engSrc = fs.readFileSync(path.join(__dirname, "odg-radar-build-engine.ts"), "utf8");
  check("engine has no file write / network / store import", !/writeFileSync|appendFileSync|mkdirSync|require\("(https?|net|dns|fs)"\)|fetch\(/.test(engSrc));
  const cliSrc = fs.readFileSync(path.join(ROOT, "runtime/bin/odg-v176-radar-build-proposals.ts"), "utf8");
  check("CLI writes exactly one file (its declared OUT_REL)", (cliSrc.match(/writeFileSync\(/g) || []).length === 1 && /writeFileSync\(path\.join\(ROOT, OUT_REL\)/.test(cliSrc) && !/appendFileSync|mkdirSync/.test(cliSrc));

  // freshness reproducibility: epochs are pinned by content hash — an unrelated commit (time source moves) cannot drift --check
  {
    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, CLI.OUT_REL), "utf8"));
    const pinned = CLI.pinnedInputsOf(committed);
    let derived = 0;
    const moved = CLI.loadSources(ROOT, pinned, () => { derived++; return 9e12; });
    check("unchanged inputs keep their pinned epoch (time source never consulted)", derived === 0 && moved.inputs.every((i: any) => i.sha256 === null || pinned[i.source].epochMs === i.epochMs));
    check("committed record reproduces with a moved time source (--check stays OK after an unrelated commit)", CLI.render(ROOT) === fs.readFileSync(path.join(ROOT, CLI.OUT_REL), "utf8"));
    const ins = [{ source: "a.json", sha256: "h1" }, { source: "b.json", sha256: "h2-new" }, { source: "c.json", sha256: null }];
    const pin = { "a.json": { sha256: "h1", epochMs: 100 }, "b.json": { sha256: "h2-old", epochMs: 200 } };
    const seen: string[] = [];
    const ep = CLI.resolveEpochs(ins, pin, (rel: string) => { seen.push(rel); return 300; });
    check("changed input is re-dated, unchanged one keeps its pin, absent one is skipped", ep["a.json"] === 100 && ep["b.json"] === 300 && !("c.json" in ep) && seen.join() === "b.json" && (ins[1] as any).epochMs === 300);
    check("record without pinned epochs pins nothing (first regeneration derives everything)", Object.keys(CLI.pinnedInputsOf({ inputs: [{ source: "x", sha256: "y" }] })).length === 0);
    // git time source in a temp repo: last commit of the file; unrelated commit does not move it; dirty ⇒ current commit time
    const os = require("os"); const { execFileSync } = require("child_process");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-fresh-"));
    const g = (args: string[], date: string) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
    try {
      g(["init", "-q"], "2026-01-01T00:00:00Z");
      fs.writeFileSync(path.join(dir, "a.json"), "{}"); g(["add", "a.json"], "2026-01-01T00:00:00Z"); g(["commit", "-qm", "a"], "2026-01-01T00:00:00Z");
      const e1 = CLI.gitEpochOf(dir, "a.json");
      fs.writeFileSync(path.join(dir, "b.json"), "{}"); g(["add", "b.json"], "2026-02-01T00:00:00Z"); g(["commit", "-qm", "b"], "2026-02-01T00:00:00Z");
      check("git epoch of an input is unchanged by an unrelated commit", e1 === Date.parse("2026-01-01T00:00:00Z") && CLI.gitEpochOf(dir, "a.json") === e1);
      fs.writeFileSync(path.join(dir, "a.json"), "{\"x\":1}");
      check("dirty input is dated at the current commit (its content postdates it)", CLI.gitEpochOf(dir, "a.json") === Date.parse("2026-02-01T00:00:00Z"));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  process.stdout.write(failures ? `\n${failures} FAILURE(S)\n` : "\nALL PASS — odg-radar-build-engine (detect→analyse→gate/dedup→rank→PROPOSED drafts; deny-by-default; no network; no store)\n");
  process.exit(failures ? 1 : 0);
}
main();
export {};
