#!/usr/bin/env node
"use strict";
/* Tests for odg-local-model-execution-policy (V327 §3). Encodes the MEASURED model-size/repair-depth findings into a
 * calibrated resource policy: cheap-reliable stays cheap; medium-hard gets repair depth; low-P gets the large model +
 * repair + ESCALATE flag; no calibrated evidence ⇒ cheap probe. Deterministic (synthetic histories). */
const M = require("./odg-local-model-execution-policy.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const h = (s: number, f: number): any[] => [...Array(s).fill(0).map(() => ({ missionType: "t", verified: true })), ...Array(f).fill(0).map(() => ({ missionType: "t", verified: false }))];

const GOLDEN: Record<string, string> = {
  high: "{\"model\":\"qwen2.5-coder:3b\",\"maxRepair\":1,\"escalateIfStillFails\":false,\"tier\":\"NATIVE_CHEAP\",\"quality\":\"CALIBRATED\",\"pForPlanner\":0.9,\"observations\":20,\"authorizes\":false,\"reason\":\"calibrated P=0.9 ≥ 0.7 ⇒ reliable ⇒ cheap/fast is measured-sufficient (3b, maxRepair 1)\"}",
  medium: "{\"model\":\"qwen2.5-coder:3b\",\"maxRepair\":3,\"escalateIfStillFails\":false,\"tier\":\"NATIVE_REPAIR\",\"quality\":\"CALIBRATED\",\"pForPlanner\":0.5,\"observations\":20,\"authorizes\":false,\"reason\":\"calibrated P=0.5 in [0.3,0.7) ⇒ medium-hard ⇒ apply measured lever REPAIR DEPTH (3b, maxRepair 3)\"}",
  low: "{\"model\":\"qwen2.5-coder:7b\",\"maxRepair\":3,\"escalateIfStillFails\":true,\"tier\":\"NATIVE_MAX_THEN_ESCALATE\",\"quality\":\"CALIBRATED\",\"pForPlanner\":0.2,\"observations\":20,\"authorizes\":false,\"reason\":\"calibrated P=0.2 < 0.3 ⇒ measured-unreliable ⇒ max local resource (7b, maxRepair 3) AND flag ESCALATE to provider/decomposition if still failing (some low-P types are unsolved by local compute)\"}",
  thin: "{\"model\":\"qwen2.5-coder:3b\",\"maxRepair\":1,\"escalateIfStillFails\":false,\"tier\":\"PROBE\",\"quality\":\"DEGRADED\",\"pForPlanner\":null,\"observations\":3,\"authorizes\":false,\"reason\":\"no CALIBRATED evidence (DEGRADED) ⇒ cheap probe (3b, maxRepair 1) to gather outcomes; escalate resource only on measured need\"}",
  biased: "{\"model\":\"qwen2.5-coder:3b\",\"maxRepair\":1,\"escalateIfStillFails\":false,\"tier\":\"PROBE\",\"quality\":\"BIASED\",\"pForPlanner\":null,\"observations\":12,\"authorizes\":false,\"reason\":\"no CALIBRATED evidence (BIASED) ⇒ cheap probe (3b, maxRepair 1) to gather outcomes; escalate resource only on measured need\"}",
  empty: "{\"model\":\"qwen2.5-coder:3b\",\"maxRepair\":1,\"escalateIfStillFails\":false,\"tier\":\"PROBE\",\"quality\":\"UNKNOWN\",\"pForPlanner\":null,\"observations\":0,\"authorizes\":false,\"reason\":\"no CALIBRATED evidence (UNKNOWN) ⇒ cheap probe (3b, maxRepair 1) to gather outcomes; escalate resource only on measured need\"}",
  nonArray: "{\"model\":\"qwen2.5-coder:3b\",\"maxRepair\":1,\"escalateIfStillFails\":false,\"tier\":\"PROBE\",\"quality\":\"UNKNOWN\",\"pForPlanner\":null,\"observations\":0,\"authorizes\":false,\"reason\":\"no CALIBRATED evidence (UNKNOWN) ⇒ cheap probe (3b, maxRepair 1) to gather outcomes; escalate resource only on measured need\"}",
};

// V15.9 helpers — synthetic registries in the canonical V155 shape + the REAL committed evidence.
const CAP = require("./odg-local-model-capability.js");
const ENV = M.loadMeasuredRegistry();
const NOW = Date.parse(ENV.generatedAt) + 3600 * 1000;
const TIER_HIST: Record<string, any> = { PROBE: [], NATIVE_CHEAP: h(18, 2), NATIVE_REPAIR: h(10, 10), NATIVE_MAX_THEN_ESCALATE: h(4, 16) };
const SIZE: Record<string, number> = { "qwen2.5:0.5b": 494032768, "qwen2.5-coder:3b": 3085938688, "qwen2.5-coder:7b": 7615616512 };
const decisionOf = (p: any) => JSON.stringify({ model: p.model, maxRepair: p.maxRepair, escalateIfStillFails: p.escalateIfStillFails, tier: p.tier, quality: p.quality, pForPlanner: p.pForPlanner, observations: p.observations, authorizes: p.authorizes, reason: p.reason });
function synthReg(perModel: Record<string, Record<string, [number | null, number, string]>>, sizes: Record<string, any> = SIZE): any {
  const classes = [...new Set(Object.values(perModel).flatMap((x) => Object.keys(x)))].sort();
  return { schema: CAP.REGISTRY_SCHEMA, classes, models: Object.keys(perModel).map((id) => ({ id, available: true, parameterCount: sizes[id], perClass: Object.fromEntries(Object.entries(perModel[id]).map(([c, [v, n, st]]) => [c, { passRate: v === null ? { value: null, passes: 0, n: 0, status: "NOT_MEASURED" } : { value: v, passes: Math.round(v * n), n }, status: st, totalMs: { n, p50: 1000 + (sizes[id] || 0) / 1e6 } }])) })) };
}
const env = (registry: any, extra: any = {}) => ({ ok: true, registry, generatedAt: ENV.generatedAt, taskSetVersion: "T", head: "h", source: "s", sha256: "x", ...extra });
let seed = 42; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

function main(): void {
  // CALIBRATED HIGH ⇒ cheap/fast (measured-sufficient)
  const hi = M.chooseExecutionPolicy("t", h(18, 2)); // p=0.9
  check("CALIBRATED high P ⇒ NATIVE_CHEAP (3b, maxRepair 1)", hi.tier === "NATIVE_CHEAP" && hi.model === "qwen2.5-coder:3b" && hi.maxRepair === 1 && hi.escalateIfStillFails === false);

  // CALIBRATED MEDIUM ⇒ repair depth (the measured lever for infix/lru)
  const mid = M.chooseExecutionPolicy("t", h(10, 10)); // p=0.5
  check("CALIBRATED medium P ⇒ NATIVE_REPAIR (3b, maxRepair 3) — the measured repair-depth lever", mid.tier === "NATIVE_REPAIR" && mid.model === "qwen2.5-coder:3b" && mid.maxRepair === 3);

  // CALIBRATED LOW ⇒ large model + repair + escalate flag (measured: some low-P types unsolved by local compute)
  const lo = M.chooseExecutionPolicy("t", h(4, 16)); // p=0.2
  check("CALIBRATED low P ⇒ NATIVE_MAX_THEN_ESCALATE (7b, maxRepair 3, escalate flagged)", lo.tier === "NATIVE_MAX_THEN_ESCALATE" && lo.model === "qwen2.5-coder:7b" && lo.maxRepair === 3 && lo.escalateIfStillFails === true);

  // NOT CALIBRATED ⇒ cheap probe (never spend the large model on a hunch)
  const thin = M.chooseExecutionPolicy("t", h(2, 1));
  check("thin (DEGRADED) ⇒ PROBE (3b, maxRepair 1) — gather data, never over-commit", thin.tier === "PROBE" && thin.model === "qwen2.5-coder:3b" && thin.maxRepair === 1 && thin.escalateIfStillFails === false);
  const biased = M.chooseExecutionPolicy("t", h(12, 0));
  check("survivorship BIASED ⇒ PROBE (never escalate resource on a flattering/biased rate)", biased.quality === "BIASED" && biased.tier === "PROBE" && biased.maxRepair === 1);
  const empty = M.chooseExecutionPolicy("t", []);
  check("empty (UNKNOWN) ⇒ PROBE", empty.tier === "PROBE" && empty.model === "qwen2.5-coder:3b");

  // resource is monotonic in difficulty: maxRepair/model never DECREASE as P drops across calibrated bands
  check("resource monotonic: high⇒{3b,1} ≤ medium⇒{3b,3} ≤ low⇒{7b,3}", hi.maxRepair <= mid.maxRepair && mid.maxRepair <= lo.maxRepair && lo.model === "qwen2.5-coder:7b");

  // honesty: authorizes nothing; promises no fix (escalate flag on low-P)
  check("policy authorizes nothing", hi.authorizes === false && lo.authorizes === false);
  check("fail-closed: non-array history tolerated ⇒ PROBE (UNKNOWN)", M.chooseExecutionPolicy("t", "x").tier === "PROBE");

  // frozen + determinism + contract
  check("frozen + deterministic", Object.isFrozen(hi) && JSON.stringify(M.chooseExecutionPolicy("t", h(10, 10))) === JSON.stringify(M.chooseExecutionPolicy("t", h(10, 10))));
  check("contract: reuses calibrated-P, encodes measured evidence, escalates only on calibrated need, promises no fix",
    M.EXECUTION_POLICY_CONTRACT.reuses.some((s: string) => /derivePsuccess/.test(s)) &&
    M.EXECUTION_POLICY_CONTRACT.reuses.some((s: string) => /MODEL_CHOICE,REPAIR_DEPTH/.test(s)) &&
    M.EXECUTION_POLICY_CONTRACT.invariants.some((s: string) => /never spend the large model on a hunch/.test(s)) &&
    M.EXECUTION_POLICY_CONTRACT.invariants.some((s: string) => /promises NO fix/.test(s)));


  // ---- V15.9 §6 MEASURED OVERLAY ----------------------------------------------------------------------------------
  // GOLDEN: captured from origin/main (5be27612) BEFORE this change, over every existing branch. No measured inputs ⇒
  // byte-identical (also with an explicit {} opts and with unrelated calibrated opts keys).
  const GH: Record<string, [any, any]> = { high: ["t", h(18, 2)], medium: ["t", h(10, 10)], low: ["t", h(4, 16)], thin: ["t", h(2, 1)], biased: ["t", h(12, 0)], empty: ["t", []], nonArray: ["t", "x"] };
  for (const k of Object.keys(GOLDEN)) {
    check(`GOLDEN ${k}: no measured inputs ⇒ byte-identical to origin/main`, JSON.stringify(M.chooseExecutionPolicy(GH[k][0], GH[k][1])) === GOLDEN[k] && JSON.stringify(M.chooseExecutionPolicy(GH[k][0], GH[k][1], {})) === GOLDEN[k]);
    // measured inputs present but unusable ⇒ the DECISION (every pre-existing field) is byte-identical + NOT_MEASURED
    const bad = M.chooseExecutionPolicy(GH[k][0], GH[k][1], { taskClass: "bugfix", measured: { ok: true, registry: { schema: "WRONG" }, generatedAt: ENV.generatedAt }, now: NOW });
    check(`GOLDEN ${k}: malformed registry ⇒ decision byte-identical + measured.status NOT_MEASURED`, decisionOf(bad) === decisionOf(JSON.parse(GOLDEN[k])) && bad.measured.status === "NOT_MEASURED" && bad.measured.applied === false && /malformed/.test(bad.measured.reason));
  }

  // LOADER over the REAL committed V155 evidence (canonical buildCapabilityRegistry output)
  check("loader: committed V155 evidence loads (schema, taskset V155-TASKSET-2, sha256, head)", ENV.ok === true && ENV.registry.schema === CAP.REGISTRY_SCHEMA && ENV.taskSetVersion === "V155-TASKSET-2" && /^[0-9a-f]{64}$/.test(ENV.sha256) && typeof ENV.head === "string");
  check("loader fail-closed: missing file ⇒ NOT_MEASURED", M.loadMeasuredRegistry("docs/odg/evidence/DOES_NOT_EXIST.json").ok === false);
  check("loader fail-closed: invalid JSON ⇒ NOT_MEASURED", M.loadMeasuredRegistry("x.json", { readFile: () => "{not json" }).status === "NOT_MEASURED");
  check("loader fail-closed: wrong schema ⇒ NOT_MEASURED", M.loadMeasuredRegistry("x.json", { readFile: () => JSON.stringify({ schema: "X" }) }).ok === false);
  check("loader fail-closed: read throws ⇒ NOT_MEASURED", M.loadMeasuredRegistry("x.json", { readFile: () => { throw new Error("EACCES"); } }).ok === false);
  check("loader fail-closed: bad registry inside valid envelope ⇒ NOT_MEASURED", M.loadMeasuredRegistry("x.json", { readFile: () => JSON.stringify({ schema: "V155_OLLAMA_CAPABILITY_REGISTRY_EVIDENCE", generatedAt: ENV.generatedAt, registry: { schema: CAP.REGISTRY_SCHEMA, classes: ["a"], models: [] } }) }).ok === false);

  // REAL registry: measured raise + provenance
  // #912 LOW: a hand-edited registry size cannot turn a SMALLER model into a "raise" (sizes cross-checked vs reference table)
  {
    const tampered = JSON.parse(JSON.stringify(ENV));
    const m05 = tampered.registry.models.find((m: any) => m.id === "qwen2.5:0.5b");
    if (m05) { m05.parameterCount = 9e12; for (const k of Object.keys(m05.perClass || {})) if (m05.perClass[k] && m05.perClass[k].status) { m05.perClass[k].status = "QUALIFIED"; m05.perClass[k].passRate = { value: 1, n: 99 }; } }
    const t = M.chooseExecutionPolicy("t", [], { taskClass: "bugfix", measured: tampered, now: NOW });
    check("#912 LOW: tampered parameterCount (0.5b claimed 9e12) never yields 0.5b", t.model !== "qwen2.5:0.5b");
  }
  const bf = M.chooseExecutionPolicy("t", [], { taskClass: "bugfix", measured: ENV, now: NOW });
  check("REAL bugfix (3b DEMOTED, 7b QUALIFIED) ⇒ PROBE raised 3b→7b; maxRepair/tier unchanged", bf.model === "qwen2.5-coder:7b" && bf.maxRepair === 1 && bf.tier === "PROBE" && bf.measured.raised === true && bf.escalateIfStillFails === false);
  check("provenance recorded: class, qualified model, pass rate, n, taskset version, evidence sha/time", bf.measured.taskClass === "bugfix" && bf.measured.qualifiedModel === "qwen2.5-coder:7b" && bf.measured.passRate === 1 && bf.measured.n === 3 && bf.measured.taskSetVersion === "V155-TASKSET-2" && bf.measured.sha256 === ENV.sha256 && bf.measured.generatedAt === ENV.generatedAt && /MEASURED:/.test(bf.reason));
  const im = M.chooseExecutionPolicy("t", h(18, 2), { taskClass: "implement", measured: ENV, now: NOW });
  check("REAL implement = NO_QUALIFIED_LOCAL_MODEL ⇒ escalateIfStillFails=true, model unchanged, NO fabricated pass rate", im.escalateIfStillFails === true && im.model === "qwen2.5-coder:3b" && im.measured.decision === "NO_QUALIFIED_LOCAL_MODEL" && im.measured.passRate === null && im.measured.n === null && im.measured.qualifiedModel === null);
  const ex = M.chooseExecutionPolicy("t", h(4, 16), { taskClass: "extract", measured: ENV, now: NOW });
  check("REAL extract (best = 0.5b) under a 7b calibrated policy ⇒ NEVER downgraded (stays 7b, escalate stays true)", ex.model === "qwen2.5-coder:7b" && ex.escalateIfStillFails === true && ex.measured.raised === false && /never downgrade/.test(ex.measured.reason));
  const rf = M.chooseExecutionPolicy("t", h(18, 2), { taskClass: "refactor", measured: ENV, now: NOW });
  check("REAL refactor (best = 3b) agrees ⇒ no change, reason unchanged (applied=false)", rf.model === "qwen2.5-coder:3b" && rf.measured.applied === false && rf.reason === JSON.parse(GOLDEN.high).reason);

  // fail-closed inputs ⇒ unchanged decision + NOT_MEASURED (never a number)
  const base = JSON.parse(GOLDEN.empty);
  const nm = (o: any, re: RegExp, name: string) => { const p = M.chooseExecutionPolicy("t", [], o); check(name, decisionOf(p) === decisionOf(base) && p.measured.status === "NOT_MEASURED" && p.measured.passRate === undefined && re.test(p.measured.reason)); };
  nm({ taskClass: "bugfix", measured: ENV, now: Date.parse(ENV.generatedAt) + 31 * 86400000 }, /EXPIRED/, "EXPIRED registry (>30d) ⇒ unchanged + NOT_MEASURED");
  nm({ taskClass: "bugfix", measured: ENV, now: NOW, measuredMaxAgeMs: 1000 }, /EXPIRED/, "EXPIRED under a caller max-age ⇒ unchanged");
  nm({ taskClass: "bugfix", measured: ENV }, /freshness unverifiable/, "no now ⇒ freshness unverifiable ⇒ unchanged (fail-closed)");
  nm({ taskClass: "bugfix", measured: env(ENV.registry, { generatedAt: "garbage" }), now: NOW }, /generatedAt/, "bad generatedAt ⇒ unchanged");
  nm({ taskClass: "bugfix", measured: env(ENV.registry, { generatedAt: new Date(NOW + 5 * 86400000).toISOString() }), now: NOW }, /future/, "future generatedAt ⇒ unchanged");
  nm({ taskClass: "bugfix", measured: { ok: false, status: "NOT_MEASURED", reason: "evidence unreadable: ENOENT" }, now: NOW }, /unavailable/, "loader failure envelope ⇒ unchanged");
  nm({ taskClass: "bugfix", now: NOW }, /no measured registry/, "taskClass but no registry ⇒ unchanged");
  nm({ measured: ENV, now: NOW }, /no taskClass/, "registry but no taskClass ⇒ unchanged");
  nm({ taskClass: "astrology", measured: ENV, now: NOW }, /not a measured class/, "unknown taskClass ⇒ unchanged + reason");
  nm({ taskClass: "bugfix", measured: env(synthReg({ "qwen2.5-coder:7b": { bugfix: [1.7, 3, "QUALIFIED"] } })), now: NOW }, /out of range/, "passRate out of [0,1] ⇒ malformed ⇒ unchanged");
  nm({ taskClass: "bugfix", measured: env({ ...ENV.registry, models: "x" }), now: NOW }, /malformed/, "models not an array ⇒ unchanged");
  nm({ taskClass: "bugfix", measured: env(synthReg({ "qwen2.5-coder:7b": { bugfix: [1, 3, "QUALIFIED"] } }).models.map(() => null) as any), now: NOW }, /malformed/, "registry not an object ⇒ unchanged");
  check("measured keys never reach calibrated-P (stripped): same decision as no-opts for every tier", Object.keys(TIER_HIST).every((t) => decisionOf(M.chooseExecutionPolicy("t", TIER_HIST[t], { taskClass: "nope", measured: ENV, now: NOW })) === decisionOf(M.chooseExecutionPolicy("t", TIER_HIST[t]))));

  // DEMOTED final model ⇒ escalate (raise impossible because the qualified model's size is unknown ⇒ fail-closed kept)
  const dem = M.chooseExecutionPolicy("t", [], { taskClass: "c", measured: env(synthReg({ "qwen2.5-coder:3b": { c: [0, 3, "DEMOTED"] }, "mystery:1b": { c: [1, 3, "QUALIFIED"] } }, { ...SIZE, "mystery:1b": undefined })), now: NOW });
  check("final model DEMOTED + raise unprovable (size unknown) ⇒ model kept, escalateIfStillFails=true", dem.model === "qwen2.5-coder:3b" && dem.escalateIfStillFails === true && dem.measured.finalModelClassStatus === "DEMOTED" && /cannot prove a raise/.test(dem.measured.reason));
  const nq = M.chooseExecutionPolicy("t", h(10, 10), { taskClass: "c", measured: env(synthReg({ "qwen2.5-coder:3b": { c: [0.5, 6, "PROBATION"] }, "qwen2.5-coder:7b": { c: [0.33, 6, "DEMOTED"] } })), now: NOW });
  check("synthetic NO_QUALIFIED ⇒ escalate, maxRepair kept (3), no model change", nq.escalateIfStillFails === true && nq.maxRepair === 3 && nq.model === "qwen2.5-coder:3b");

  // MONOTONICITY PROPERTY: over every REAL class × every policy tier AND 300 random registries × tiers — the final model
  // is never smaller than the calibrated one, maxRepair/tier/quality/pForPlanner never change, escalate never turns off.
  const MODELS = Object.keys(SIZE); const STS = ["QUALIFIED", "PROBATION", "DEMOTED", "NOT_MEASURED"];
  const regs: any[] = [ENV];
  for (let i = 0; i < 300; i++) {
    const per: any = {};
    for (const id of MODELS) { per[id] = {}; for (const c of ["c1", "c2"]) { const st = STS[Math.floor(rnd() * 4)]; per[id][c] = [st === "NOT_MEASURED" ? null : Math.round(rnd() * 100) / 100, 3 + Math.floor(rnd() * 4), st]; } }
    regs.push(env(synthReg(per)));
  }
  let viol = 0, cases = 0, raisedCount = 0;
  for (const e of regs) for (const c of [...e.registry.classes, "unknown-x"]) for (const t of Object.keys(TIER_HIST)) {
    const b = M.chooseExecutionPolicy("t", TIER_HIST[t]); const p = M.chooseExecutionPolicy("t", TIER_HIST[t], { taskClass: c, measured: e, now: NOW });
    cases++; if (p.measured && p.measured.raised) raisedCount++;
    if (SIZE[p.model] < SIZE[b.model] || p.maxRepair !== b.maxRepair || p.tier !== b.tier || p.quality !== b.quality || p.pForPlanner !== b.pForPlanner || (b.escalateIfStillFails && !p.escalateIfStillFails) || p.authorizes !== false) viol++;
    if (p.measured && p.measured.status === "CONSULTED" && p.measured.passRate !== null && typeof p.measured.passRate !== "number") viol++;
  }
  check(`MONOTONE: ${cases} class×tier×registry cases (incl. all REAL classes × 4 tiers), 0 downgrades/repair-cuts/escalate-offs (raises exercised: ${raisedCount})`, viol === 0 && cases > 1000 && raisedCount > 0);
  check("measured result frozen + deterministic", Object.isFrozen(bf) && Object.isFrozen(bf.measured) && JSON.stringify(bf) === JSON.stringify(M.chooseExecutionPolicy("t", [], { taskClass: "bugfix", measured: ENV, now: NOW })));
  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-local-model-execution-policy (V327 §3: MEASURED findings → calibrated resource policy; CALIBRATED high⇒3b/1 cheap, medium⇒3b/3 repair-depth, low⇒7b/3+ESCALATE; not-calibrated⇒cheap PROBE [never over-commit on a hunch/biased rate]; resource monotonic in difficulty; promises no fix [low-P escalate-flagged]; authorizes nothing; PURE/deterministic/frozen; V15.9 measured overlay: golden no-change, monotone [never downgrade], NO_QUALIFIED/DEMOTED⇒escalate, malformed/expired/unknown⇒NOT_MEASURED unchanged, provenance)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
