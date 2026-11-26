#!/usr/bin/env node
"use strict";
/*
 * V15.0 §45 SCENARIO M — MULTI-TASK RESUME AFTER BRUTAL INTERRUPTION (measured, real SIGKILL).
 *
 * N=4 independent missions × 4 chained ops each run in a CHILD PROCESS that is SIGKILLed mid-run (twice, at two
 * different points), then a resume that itself crashes (injected), then a resume to completion, then an idempotent
 * re-run. Everything lives in a throw-away state dir (mkdtemp) — nothing touches runtime/generated.
 *
 * REUSES the canonical components — no second scheduler / queue / orchestrator / lease engine:
 *   - campaign-loop.runCampaignLoop({registerPath})  — the durable driver: selection, persist after EACH op, ACCEPTED
 *     ops never re-run (each op is one register lot; deps chain the ops of a mission; missions are independent).
 *   - campaign-controller.saveRegister / loadRegister — crash-atomic (temp + rename) JSON persistence; ALSO used here as
 *     the atomic writer of each per-op durable record (ops/<opId>.json).
 *   - idempotency-guard.admit                         — DUPLICATE detection by op id against the journal of durable op
 *     records (closes the window "op committed, register not yet persisted" ⇒ reconcile, never re-apply).
 *   - fleet-bridge.tryClaim / releaseClaim            — the only cross-process O_EXCL claim with TTL expiry, used as the
 *     per-mission lease (a killed holder's lease expires and is taken over; TOCTOU double-hold fixed in this lot).
 *
 * Usage:
 *   tsx runtime/bin/odg-scenario-m-resume.ts                       # run the scenario in a temp dir, print the result
 *   tsx runtime/bin/odg-scenario-m-resume.ts --write-evidence      # + write docs/odg/evidence/V150_SCENARIO_M_RESUME.json
 *   (internal) worker <stateDir> | atomic-writer <file>
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const CL = require(path.join(ROOT, "runtime", "core", "campaign-loop.js"));
const CC = require(path.join(ROOT, "runtime", "core", "campaign-controller.js"));
const IG = require(path.join(ROOT, "runtime", "core", "idempotency-guard.js"));
const FB = require(path.join(ROOT, "runtime", "core", "fleet-bridge.js"));

const MISSIONS = ["M1", "M2", "M3", "M4"];
const OPS_PER_MISSION = 4;
const LEASE_TTL_MS = Number(process.env.ODG_SCENARIO_M_TTL_MS || 1500);
/* MR-1: read one claim generation file (fleet-bridge layout <locksDir>/<id>.lock.<gen>) — { holder, mtimeMs } | null. */
function readGeneration(cfg: any, id: string, gen: number): any {
  const f = path.join(cfg.locksDir, `${id}.lock.${gen}`);
  try { return { holder: JSON.parse(fs.readFileSync(f, "utf8")), mtimeMs: fs.statSync(f).mtimeMs }; } catch { return null; }
}
const OP_MS = Number(process.env.ODG_SCENARIO_M_OP_MS || 120);

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const sleepSync = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const paths = (dir: string) => ({ register: path.join(dir, "register.json"), ops: path.join(dir, "ops"), leases: path.join(dir, "leases"), events: path.join(dir, "events.jsonl") });
const opIds = () => MISSIONS.flatMap((m) => Array.from({ length: OPS_PER_MISSION }, (_, k) => `${m}.o${k + 1}`));
const GENESIS = "genesis";
/** the pure expected value of every op (the chain a correct, loss-free, duplicate-free execution must produce). */
function expectedValues(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of MISSIONS) { let prev = GENESIS; for (let k = 1; k <= OPS_PER_MISSION; k++) { const id = `${m}.o${k}`; prev = sha(prev + "|" + id); out[id] = prev; } }
  return out;
}
function seedRegister(): any {
  return { version: "v150-scenario-m", items: MISSIONS.flatMap((m) => Array.from({ length: OPS_PER_MISSION }, (_, k) => ({
    id: `${m}.o${k + 1}`, mission: m, status: "READY", deps: k === 0 ? [] : [`${m}.o${k}`], priority: k + 1,
  }))) };
}

// ------------------------------------------------------------------------------------------------ worker (child)
function runWorker(dir: string): void {
  const P = paths(dir);
  fs.mkdirSync(P.ops, { recursive: true });
  const pid = process.pid;
  const ev = (o: any) => fs.appendFileSync(P.events, JSON.stringify({ ...o, pid, t: Date.now() }) + "\n");
  if (!fs.existsSync(P.register)) CC.saveRegister(P.register, seedRegister());
  ev({ e: "WORKER_START" });
  const pauseAfterCommit = Number(process.env.ODG_SCENARIO_M_PAUSE_AFTER_COMMIT || 0);
  const crashAtStart = Number(process.env.ODG_SCENARIO_M_CRASH_AT_START || 0);
  let commits = 0, starts = 0;
  const leaseCfg = { locksDir: P.leases, lockTtlMs: LEASE_TTL_MS };

  // the journal is DERIVED from durable state (complete op records only; temp files are never read).
  const journal = () => {
    const j: any = {};
    for (const f of fs.readdirSync(P.ops)) if (/^M\d+\.o\d+\.json$/.test(f)) { try { const r = JSON.parse(fs.readFileSync(path.join(P.ops, f), "utf8")); j[r.opId] = r; } catch { /* torn ⇒ not a result */ } }
    return j;
  };
  const execute = (lot: any) => {
    const j = journal();
    const adm = IG.admit({ actionId: lot.id, idempotencyKey: lot.id }, j);
    if (adm.decision === IG.DECISION.DUPLICATE) {           // committed by a killed run before its register persist
      ev({ e: "DUP_RECONCILED", op: lot.id });
      return { status: "ACCEPTED", evidence: `reconciled (idempotency DUPLICATE) value=${adm.reconciledResult.value.slice(0, 12)}` };
    }
    // per-mission lease (canonical O_EXCL generation claim with TTL expiry). Bounded wait = 4×TTL.
    const deadline = Date.now() + 4 * LEASE_TTL_MS;
    let contended = 0, prevClaim: any = null;
    for (;;) {
      prevClaim = FB.currentClaim(leaseCfg, lot.mission);
      if (FB.tryClaim(leaseCfg, lot.mission)) break;
      contended++;
      if (Date.now() > deadline) { ev({ e: "LEASE_UNAVAILABLE", op: lot.id, mission: lot.mission, contended }); return { status: "WAITING_EXTERNAL", reason: "lease held" }; }
      sleepSync(25);
    }
    // takeover = the generation we SUPERSEDED belonged to another pid and was NEVER released (released claims carry
    // mtime=epoch). MR-1 (V17.8): it is read AFTER our successful claim from the predecessor generation file (fleet-bridge
    // keeps gen-1), not from the pre-claim snapshot — a holder that RELEASED between that snapshot and our claim is a normal
    // hand-off, not a takeover (that stale-snapshot race produced the CI flake "takeover younger than TTL").
    // Its age is measured from the claimedAt the dead holder wrote INTO the lock (independent of the TTL/mtime test).
    const mine = FB.currentClaim(leaseCfg, lot.mission);
    const pred = mine && mine.gen > 1 ? readGeneration(leaseCfg, lot.mission, mine.gen - 1) : null;
    const takeover = pred && pred.holder && pred.holder.pid !== pid && pred.mtimeMs !== 0
      ? { fromPid: pred.holder.pid, fromGen: mine.gen - 1, ageFromClaimedAtMs: Date.now() - Date.parse(pred.holder.claimedAt) } : null;
    void prevClaim;
    ev({ e: "CLAIM", op: lot.id, mission: lot.mission, contended, takeover });
    // AUTHORITATIVE idempotency check UNDER the lease (another resumer may have committed this op while we waited).
    const adm2 = IG.admit({ actionId: lot.id, idempotencyKey: lot.id }, journal());
    if (adm2.decision === IG.DECISION.DUPLICATE) {
      ev({ e: "DUP_RECONCILED", op: lot.id, underLease: true });
      ev({ e: "RELEASE", op: lot.id, mission: lot.mission }); FB.releaseClaim(leaseCfg, lot.mission);
      return { status: "ACCEPTED", evidence: `reconciled under lease (idempotency DUPLICATE) value=${adm2.reconciledResult.value.slice(0, 12)}` };
    }
    starts++;
    ev({ e: "START", op: lot.id, mission: lot.mission });
    const recPath = path.join(P.ops, lot.id + ".json");
    if (crashAtStart && starts === crashAtStart) {          // INJECTED resume failure: a torn temp write, then the process dies
      fs.writeFileSync(`${recPath}.tmp-${pid}`, '{"opId":"' + lot.id + '","val');
      ev({ e: "INJECTED_CRASH", op: lot.id });
      process.exit(70);
    }
    const dep = (lot.deps || [])[0];
    const prev = dep ? (j[dep] && j[dep].value) : GENESIS;
    if (typeof prev !== "string") { ev({ e: "RELEASE", op: lot.id, mission: lot.mission }); FB.releaseClaim(leaseCfg, lot.mission); return { status: "FAILED", reason: `dependency ${dep} has no durable result` }; }
    sleepSync(OP_MS);                                        // the op's work (a kill can land here = mid-op)
    const record = { opId: lot.id, mission: lot.mission, value: sha(prev + "|" + lot.id), prev, pid, at: Date.now() };
    if (!CC.saveRegister(recPath, record)) { ev({ e: "RELEASE", op: lot.id, mission: lot.mission }); FB.releaseClaim(leaseCfg, lot.mission); return { status: "FAILED", reason: "durable op record write failed" }; }
    commits++;
    ev({ e: "COMMIT", op: lot.id, mission: lot.mission, sha: sha(fs.readFileSync(recPath, "utf8")) });
    if (pauseAfterCommit && commits === pauseAfterCommit) {  // window: op committed, lease held, register NOT yet persisted
      fs.writeFileSync(path.join(dir, `pause-${pid}.marker`), lot.id);
      sleepSync(10000);
    }
    ev({ e: "RELEASE", op: lot.id, mission: lot.mission });
    FB.releaseClaim(leaseCfg, lot.mission);
    return { status: "ACCEPTED", evidence: `op ${lot.id} value=${record.value.slice(0, 12)}` };
  };
  const r = CL.runCampaignLoop({ registerPath: P.register, execute, maxIterations: 200 });
  ev({ e: "WORKER_END", stopped: r.stopped });
  process.exit(r.stopped === "COMPLETED" ? 0 : 3);
}

// atomic-write stress child: rewrites a ~1 MB JSON via the canonical saveRegister forever (killed by the parent).
function runAtomicWriter(file: string): void {
  const blob = "x".repeat(1 << 20);
  for (let v = 1; ; v++) CC.saveRegister(file, { items: [], v, blob, check: sha(blob + v) });
}

// ------------------------------------------------------------------------------------------------ parent (scenario)
function readEvents(dir: string): any[] {
  try { return fs.readFileSync(paths(dir).events, "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)); } catch { return []; }
}
function spawnSelf(args: string[], env: any = {}): any {
  // `node --import tsx` (NOT the tsx CLI, which forks a grandchild a SIGKILL would not reach) ⇒ child.pid IS the worker.
  return spawn(process.execPath, ["--import", "tsx", __filename, ...args], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "pipe"] });
}
function integrity(dir: string): any {
  const P = paths(dir);
  const out: any = { registerParses: false, records: 0, tornRecords: [] as string[], tmpLeftovers: [] as string[] };
  try { const r = JSON.parse(fs.readFileSync(P.register, "utf8")); out.registerParses = Array.isArray(r.items) && r.items.length === MISSIONS.length * OPS_PER_MISSION; } catch { /* torn */ }
  const exp = expectedValues();
  if (fs.existsSync(P.ops)) for (const f of fs.readdirSync(P.ops)) {
    if (/\.tmp-\d+$/.test(f)) { out.tmpLeftovers.push(f); continue; }
    try { const r = JSON.parse(fs.readFileSync(path.join(P.ops, f), "utf8")); if (r.value !== exp[r.opId]) out.tornRecords.push(f + " (wrong value)"); else out.records++; } catch { out.tornRecords.push(f); }
  }
  return out;
}
function runPhase(dir: string, name: string, env: any, killWhen: ((evs: any[], pid: number) => boolean) | null): Promise<any> {
  return new Promise((resolve) => {
    const before = integrity(dir);
    const committedBefore = new Set(readEvents(dir).filter((e) => e.e === "COMMIT").map((e) => e.op));
    const t0 = Date.now();
    const child = spawnSelf(["worker", dir], env);
    let stderr = ""; child.stderr.on("data", (d: any) => { stderr += d; });
    let killedAt: number | null = null; let timer: any = null;
    const watchdog = setTimeout(() => { if (!killedAt) { killedAt = Date.now(); child.kill("SIGKILL"); } }, 60000);
    if (killWhen) timer = setInterval(() => {
      const evs = readEvents(dir).filter((e) => e.pid === child.pid);
      if (!killedAt && killWhen(evs, child.pid)) { killedAt = Date.now(); child.kill("SIGKILL"); }
    }, 5);
    child.on("exit", (code: any, signal: any) => {
      clearInterval(timer); clearTimeout(watchdog);
      const t1 = Date.now();
      const evs = readEvents(dir).filter((e) => e.pid === child.pid);
      const firstCommit = evs.find((e) => e.e === "COMMIT");
      const workerStart = evs.find((e) => e.e === "WORKER_START");
      const lastOpEvent = [...evs].reverse().find((e) => ["CLAIM", "START", "COMMIT", "RELEASE"].includes(e.e));
      resolve({
        name, pid: child.pid, exitCode: code, signal, killedAt, wallMs: t1 - t0,
        toFirstCommitMs: firstCommit ? firstCommit.t - t0 : null, startupMs: workerStart ? workerStart.t - t0 : null,
        killPoint: killedAt ? (lastOpEvent ? `${lastOpEvent.e}:${lastOpEvent.op}` : "before-first-op") : null,
        started: evs.filter((e) => e.e === "START").map((e) => e.op),
        committed: evs.filter((e) => e.e === "COMMIT").map((e) => e.op),
        reconciled: evs.filter((e) => e.e === "DUP_RECONCILED").map((e) => e.op),
        takeovers: evs.filter((e) => e.e === "CLAIM" && e.takeover).map((e) => ({ op: e.op, mission: e.mission, ...e.takeover })),
        leaseContentions: evs.reduce((n, e) => n + (e.e === "CLAIM" ? e.contended : 0), 0),
        reStartedAlreadyCommitted: evs.filter((e) => e.e === "START" && committedBefore.has(e.op)).map((e) => e.op),
        integrityBefore: before, stderrTail: stderr.slice(-400),
      });
    });
  });
}
async function atomicWriteStress(dir: string, kills: number): Promise<any> {
  const file = path.join(dir, "atomic-target.json");
  const results: any[] = [];
  for (let i = 0; i < kills; i++) {
    await new Promise<void>((resolve) => {
      const child = spawnSelf(["atomic-writer", file]);
      const delay = 400 + Math.floor(Math.random() * 400);
      setTimeout(() => child.kill("SIGKILL"), delay);
      child.on("exit", () => {
        let ok = false, v = null;
        if (!fs.existsSync(file)) ok = true;                  // killed before the first rename: nothing published, nothing torn
        else try { const r = JSON.parse(fs.readFileSync(file, "utf8")); v = r.v; ok = r.check === sha(r.blob + r.v); } catch { ok = false; }
        const tmps = fs.readdirSync(dir).filter((f: string) => f.startsWith("atomic-target.json.tmp-")).length;
        results.push({ killAfterMs: delay, targetIntact: ok, version: v, tmpLeftovers: tmps });
        resolve();
      });
    });
  }
  return { kills, allIntact: results.every((r) => r.targetIntact), killsLandedWithTornTemp: results.filter((r) => r.tmpLeftovers > 0).length, results };
}

/** analyse(dir, phases): the verification over the durable trail (events + records + register). */
/* leaseDoubleHeld(evs, ttlMs) — MR-2 ROOT FIX (CI run 45887839647 diagnostics: doubleHeld gapMs 4000 = TTL while the takeover's
 * ageFromClaimedAtMs was 4001): a CLAIM on a mission is legitimate iff the previous claim was RELEASED before it, or the previous
 * holder died holding it and the lease had EXPIRED — measured on the lease's OWN clock (the claimedAt the holder wrote INTO the lock,
 * the same instant the expiry test reads), never on the CLAIM event timestamps, which are logged AFTER the lock write and therefore
 * under-state the lease age by the logging delay (a false double-hold at the TTL boundary). The threshold stays strictly > TTL. */
function leaseDoubleHeld(evs: any[], ttlMs: number): any[] {
  const claims = evs.filter((e: any) => e.e === "CLAIM");
  const released = (c: any) => evs.find((r: any) => r.e === "RELEASE" && r.pid === c.pid && r.op === c.op);
  const out: any[] = [];
  claims.forEach((c: any, i: number) => {
    const last = claims.slice(0, i).filter((p: any) => p.mission === c.mission).pop();
    if (!last) return;
    const rel = released(last);
    if (rel && rel.t <= c.t) return;
    const leaseAge = !rel && c.takeover && c.takeover.fromPid === last.pid && Number.isFinite(c.takeover.ageFromClaimedAtMs) ? c.takeover.ageFromClaimedAtMs : c.t - last.t;
    if (!rel && leaseAge > ttlMs) return;
    out.push({ mission: c.mission, claim: c.op, pid: c.pid, priorClaim: last.op, priorPid: last.pid, gapMs: c.t - last.t, leaseAgeMs: leaseAge });
  });
  return out;
}

function analyse(dir: string, phases: any[]): any {
  const evs = readEvents(dir).map((e, i) => ({ ...e, i })).sort((x, y) => x.t - y.t || x.i - y.i);
  const ids = opIds();
  const exp = expectedValues();
  const commitsBy: Record<string, number> = {}, startsBy: Record<string, number> = {};
  for (const e of evs) { if (e.e === "COMMIT") commitsBy[e.op] = (commitsBy[e.op] || 0) + 1; if (e.e === "START") startsBy[e.op] = (startsBy[e.op] || 0) + 1; }
  const reg = CC.loadRegister(paths(dir).register);
  const accepted = reg.ok ? reg.register.items.filter((it: any) => it.status === "ACCEPTED").map((it: any) => it.id) : [];
  const lastCommitSha: Record<string, string> = {};
  for (const e of evs) if (e.e === "COMMIT") lastCommitSha[e.op] = e.sha;
  const lost: string[] = [], wrong: string[] = [];
  for (const id of ids) {
    const f = path.join(paths(dir).ops, id + ".json");
    if (!fs.existsSync(f)) { lost.push(id); continue; }
    const raw = fs.readFileSync(f, "utf8");
    if (lastCommitSha[id] && sha(raw) !== lastCommitSha[id]) lost.push(id + " (record changed after commit)");
    try { if (JSON.parse(raw).value !== exp[id]) wrong.push(id); } catch { wrong.push(id + " (torn)"); }
  }
  const perMission: any = {};
  for (const m of MISSIONS) {
    const mine = ids.filter((id) => id.startsWith(m + "."));
    perMission[m] = {
      ops: mine.length,
      attempts: mine.reduce((n, id) => n + (startsBy[id] || 0), 0),
      reRunInterruptedOps: mine.reduce((n, id) => n + Math.max(0, (startsBy[id] || 0) - 1), 0),
      repeatedCompletedOps: mine.reduce((n, id) => n + Math.max(0, (commitsBy[id] || 0) - 1), 0),
      reconciledDuplicates: evs.filter((e) => e.e === "DUP_RECONCILED" && e.op.startsWith(m + ".")).length,
    };
  }
  // lease exclusivity: each CLAIM on a mission must follow the RELEASE of the previous claim on that mission, or — when
  // the previous holder died holding it (never released) — come strictly after its TTL expiry (legitimate takeover).
  const claims = evs.filter((e) => e.e === "CLAIM");
  const released = (c: any) => evs.find((r) => r.e === "RELEASE" && r.pid === c.pid && r.op === c.op);
  const orphaned = claims.filter((c) => !released(c));
  const doubleHeld = leaseDoubleHeld(evs, LEASE_TTL_MS);
  return {
    opsTotal: ids.length, opsAccepted: accepted.length, allAccepted: accepted.length === ids.length,
    opsRepeatedCompleted: Object.values(commitsBy).reduce((n: number, c: number) => n + Math.max(0, c - 1), 0),
    opsLost: lost.length, lost, wrongValues: wrong,
    opsCommittedExactlyOnce: ids.every((id) => commitsBy[id] === 1),
    noStartAfterCommit: ids.every((id) => { const c = evs.find((e) => e.e === "COMMIT" && e.op === id); return !c || !evs.some((e) => e.e === "START" && e.op === id && e.t > c.t); }),
    reconciledUnderLease: evs.filter((e) => e.e === "DUP_RECONCILED" && e.underLease).length,
    interruptedAttemptsReRun: Object.values(startsBy).reduce((n: number, c: number) => n + Math.max(0, c - 1), 0),
    reconciledDuplicates: evs.filter((e) => e.e === "DUP_RECONCILED").length,
    perMission,
    leases: {
      ttlMs: LEASE_TTL_MS, claims: evs.filter((e) => e.e === "CLAIM").length,
      orphanedByDeath: orphaned.map((c) => ({ op: c.op, mission: c.mission, pid: c.pid })),
      takeovers: evs.filter((e) => e.e === "CLAIM" && e.takeover).map((e) => ({ op: e.op, mission: e.mission, ...e.takeover })),
      contentionsWhileUnexpired: evs.reduce((n, e) => n + (e.e === "CLAIM" ? e.contended : 0), 0),
      doubleHeld, leftHeldAtEnd: MISSIONS.filter((m) => { const c = FB.currentClaim({ locksDir: paths(dir).leases, lockTtlMs: LEASE_TTL_MS }, m); return c && c.mtimeMs !== 0; }),
    },
  };
}

async function runScenario(opts: any = {}): Promise<any> {
  const dir = opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), "odg-scenario-m-"));
  const phases: any[] = [];
  // K1: SIGKILL mid-op (after ≥3 commits, while an op is between START and COMMIT).
  phases.push(await runPhase(dir, "run1-sigkill-mid-op", {}, (evs) => evs.filter((e) => e.e === "COMMIT").length >= 3 && evs.length > 0 && evs[evs.length - 1].e === "START"));
  // K2: SIGKILL in the window "op record committed + lease held, register NOT yet persisted" (a different point).
  phases.push(await runPhase(dir, "run2-sigkill-after-commit-before-persist", { ODG_SCENARIO_M_PAUSE_AFTER_COMMIT: "2" }, (_evs, pid) => fs.existsSync(path.join(dir, `pause-${pid}.marker`))));
  // R1: a resume that itself FAILS (injected: torn temp write, then the process dies with exit 70).
  phases.push(await runPhase(dir, "run3-resume-injected-crash", { ODG_SCENARIO_M_CRASH_AT_START: "2" }, null));
  // R2: the retried resume, to completion — as TWO CONCURRENT resumers (multi-claimant: same register, same leases).
  phases.push(...await Promise.all([runPhase(dir, "run4a-concurrent-resumer", {}, null), runPhase(dir, "run4b-concurrent-resumer", {}, null)]));
  // R3: an idempotent re-run on the completed state ⇒ must execute nothing.
  phases.push(await runPhase(dir, "run5-idempotent-rerun", {}, null));
  const finalIntegrity = integrity(dir);
  const analysis = analyse(dir, phases);
  const atomic = await atomicWriteStress(dir, opts.atomicKills || 6);
  const killed = phases.filter((p) => p.signal === "SIGKILL");
  const resumes = phases.slice(1);
  const [run3, run4a, run4b, run5] = [phases[2], phases[3], phases[4], phases[5]];
  const verdicts = {
    killedTwiceAtDifferentPoints: killed.length >= 2 && new Set(killed.map((p) => p.killPoint && p.killPoint.split(":")[0])).size >= 2,
    onlyMissingOpsReRun: resumes.every((p) => p.reStartedAlreadyCommitted.length === 0),
    noOpExecutedTwice: analysis.opsRepeatedCompleted === 0 && analysis.opsCommittedExactlyOnce,
    noLostValidatedResult: analysis.opsLost === 0 && analysis.wrongValues.length === 0 && analysis.allAccepted,
    noCorruptRecordAtAnyRestart: phases.every((p) => p.integrityBefore.tornRecords.length === 0 && (p.name === "run1-sigkill-mid-op" || p.integrityBefore.registerParses)) && finalIntegrity.tornRecords.length === 0,
    atomicWriteSurvivesSigkill: atomic.allIntact,
    leasesOfKilledRunTakenOverNotDoubleHeld: analysis.leases.takeovers.length >= 1 && analysis.leases.takeovers.every((t: any) => t.ageFromClaimedAtMs > LEASE_TTL_MS) && analysis.leases.contentionsWhileUnexpired >= 1 && analysis.leases.doubleHeld.length === 0 && analysis.leases.leftHeldAtEnd.length === 0,
    failedResumeRetriedSafely: run3.exitCode === 70 && run4a.exitCode === 0 && run4b.exitCode === 0 && analysis.opsRepeatedCompleted === 0,
    concurrentResumersNoDoubleEffect: run4a.exitCode === 0 && run4b.exitCode === 0 && analysis.opsRepeatedCompleted === 0 && analysis.noStartAfterCommit && analysis.leases.doubleHeld.length === 0,
    idempotentRerunExecutesNothing: run5.exitCode === 0 && run5.started.length === 0,
  };
  const out = {
    scenario: "V15.0 §45 M — multi-task resume after brutal interruption (real SIGKILL, measured)",
    setup: { missions: MISSIONS.length, opsPerMission: OPS_PER_MISSION, opMs: OP_MS, leaseTtlMs: LEASE_TTL_MS, stateDir: opts.keepDirInEvidence ? dir : "<mkdtemp, discarded>" },
    phases: phases.map((p) => { const { stderrTail, integrityBefore, ...rest } = p; return { ...rest, integrityBefore: { registerParses: integrityBefore.registerParses, records: integrityBefore.records, tornRecords: integrityBefore.tornRecords, tmpLeftovers: integrityBefore.tmpLeftovers.length }, stderrTail: p.exitCode === 0 || p.signal ? undefined : stderrTail }; }),
    measurements: {
      resumeWallMs: Object.fromEntries(resumes.map((p) => [p.name, p.wallMs])),
      resumeToFirstNewCommitMs: Object.fromEntries(resumes.map((p) => [p.name, p.toFirstCommitMs])),
      processStartupMs: Object.fromEntries(phases.map((p) => [p.name, p.startupMs])),
      opsRepeatedCompleted: analysis.opsRepeatedCompleted, opsLost: analysis.opsLost,
      interruptedAttemptsReRun: analysis.interruptedAttemptsReRun, reconciledDuplicates: analysis.reconciledDuplicates,
      concurrentResumers: { a: { started: run4a.started.length, reconciled: run4a.reconciled.length, contentions: run4a.leaseContentions, wallMs: run4a.wallMs }, b: { started: run4b.started.length, reconciled: run4b.reconciled.length, contentions: run4b.leaseContentions, wallMs: run4b.wallMs }, reconciledUnderLease: analysis.reconciledUnderLease },
      leaseContentionsWhileUnexpired: analysis.leases.contentionsWhileUnexpired, leaseTakeovers: analysis.leases.takeovers.length, doubleHeldLeases: analysis.leases.doubleHeld.length,
    },
    analysis, finalIntegrity: { ...finalIntegrity, tmpLeftovers: finalIntegrity.tmpLeftovers.length }, atomicWriteStress: atomic,
    verdicts, allProven: Object.values(verdicts).every(Boolean),
    attribution: {
      odgRuntimeCore: [
        "campaign-loop.runCampaignLoop: which op runs next (dep order + priority), persisting the register after EACH op, never re-running an ACCEPTED op on resume",
        "campaign-controller.saveRegister: crash-atomic temp+rename for the register AND every per-op record",
        "idempotency-guard.admit: DUPLICATE decision by op id ⇒ an op committed before the kill is reconciled, not re-applied",
        "fleet-bridge.tryClaim/releaseClaim: lease exclusivity (O_EXCL) and TTL expiry/takeover of a killed holder's lease (generation-numbered race-free takeover, fixed in this lot)",
      ],
      providerWrittenHarness: [
        "the scenario itself: missions/ops definition, op effect (hash chain), deriving the idempotency journal from the durable op records, the lease bounded wait, the kill points, the injected crash, and every check/measurement in this file",
        "the decision to wrap each op in a per-mission lease (the canonical loop has no lease concept of its own)",
      ],
    },
    limits: [
      "single host, local filesystem (ext4-class rename atomicity); no fsync of the directory ⇒ power-loss durability NOT measured (only process death)",
      "two concurrent resumers only (not N>2); they last-writer-win the shared register file — op effects stay exactly-once through the lease + the idempotency check made UNDER the lease, and a later run reconciles the register",
      "leases are TTL-based with no renewal/heartbeat: an op longer than the TTL could be taken over while alive — ops here are short (opMs << TTL)",
      "fleet-bridge takeover is TTL-based: a holder that overruns its TTL while alive can be superseded (inherent to TTL leases; no fencing token is checked by the effect)",
      "the injected resume failure is a process death (exit 70); an execute() THROW is caught by campaign-loop as FAILED and the lot then stalls (no-repeat guard) until its definition changes — by design, not exercised here",
      "timings are wall-clock on a shared VPS; startup is dominated by node+tsx (~hundreds of ms)",
    ],
  };
  if (!opts.keepDir) fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

module.exports = { runScenario, expectedValues, seedRegister, LEASE_TTL_MS, leaseDoubleHeld };

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === "worker") runWorker(process.argv[3]);
  else if (mode === "atomic-writer") runAtomicWriter(process.argv[3]);
  else {
    runScenario({}).then((out: any) => {
      if (process.argv.includes("--write-evidence")) {
        const f = path.join(ROOT, "docs", "odg", "evidence", "V150_SCENARIO_M_RESUME.json");
        fs.writeFileSync(f, JSON.stringify({ ...out, generatedAt: new Date().toISOString() }, null, 2) + "\n");
      }
      process.stdout.write(JSON.stringify({ verdicts: out.verdicts, measurements: out.measurements, allProven: out.allProven }, null, 2) + "\n");
      process.exit(out.allProven ? 0 : 1);
    });
  }
}
export {};
