#!/usr/bin/env node
"use strict";

/*
 * V17.6 — GO PARALLEL WAVES on INDEPENDENT WRITE ZONES (owner record docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json:
 * « Construire les vagues GO parallèles sur des zones d'écriture indépendantes. »; scenario F « ODG décompose une mission,
 * affecte des fournisseurs, réceptionne leurs résultats, détecte les incompatibilités et valide l'intégration. »).
 *
 * NOT a second orchestrator / scheduler / decision engine. It COMPOSES:
 *   - odg-go-cycle.actionabilityOf / resolveDispatchTarget  → which items GO may act on now and the write-set each
 *                                                              dispatch would touch (selectWaveFromState only)
 *   - parallel-execution-planner.plan (writeSetSafe, maxConcurrency k) → dependency barrier + k bound
 *   - odg-writeset-contention.computeLayerContention / pathsConflict   → the AUTHORITATIVE write-isolation verdict
 *                                                              (UNKNOWN write-set conflicts with everything ⇒ serial)
 *   - odg-concurrency-policy.decide (optional, injected decision)      → admitted builders bound k (admit 0 ⇒ no wave)
 *   - git (merge-tree --write-tree, commit-tree, diff --name-only)     → post-receipt merge simulation on real commits
 * Execution is ALWAYS through an injected port (ports.runItem) — this module never chooses a provider, never launches a
 * model, never writes the repository it is given except for git objects (commit-tree) in the repository it is handed.
 *
 * Steps:
 *   selectWave(candidates, opts)      PURE. Candidates in the caller's (GO's) ranked order. The first actionable candidate
 *                                     always leads; each next candidate joins only if actionable, its write-set is KNOWN,
 *                                     disjoint from every member (pathsConflict), it is not a dep of / dependent on a
 *                                     member, and |wave| < k (checked in that order; the first failing reason is recorded). The final set is re-verified by BOTH computeLayerContention
 *                                     (parallelSafe) and parallel-execution-planner (one wave) — any disagreement ⇒ SERIAL
 *                                     (leader alone). A leader with an UNKNOWN write-set ⇒ SERIAL (alone).
 *   dispatchWave(wave, ports, mode)   each item via ports.runItem(item, ctx) in its OWN scratch (the port's duty); PARALLEL
 *                                     = all started together (Promise.all), SERIAL = one after another (the baseline).
 *   detectIncompatibilities(...)      after receipt, from the received commits only: WRITESET_VIOLATION (changed path ⊄
 *                                     the item's declared write-set), OVERLAPPING_WRITES (two items changed conflicting
 *                                     paths), MERGE_CONFLICT (git merge-tree --write-tree of the received commits, in rank
 *                                     order, onto the common base), CHECK_FAILED (a declared per-item post-receipt check,
 *                                     run by ODG on the item's commit, exited ≠ 0). Every verdict comes from git / a check
 *                                     process exit code — never from a caller-supplied flag.
 *   integrate(...)                    only when no incompatibility: the merged tree becomes a commit (commit-tree, parents =
 *                                     the received commits), is checked out in its own scratch, and EVERY declared
 *                                     integration check runs there; INTEGRATED_VALIDATED ⇔ all exit 0 AND the integrated
 *                                     change-set = the union of the items' change-sets.
 * Honesty: a wave is a write-ISOLATION claim, not a semantic-independence claim — semantic incompatibilities are what
 * the post-receipt checks are for. Nothing here grades a scenario.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const PEP = require("./parallel-execution-planner.js");
const CONT = require("./odg-writeset-contention.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
const arr = (v: any) => (Array.isArray(v) ? v : []);
const isObj = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: any) => typeof v === "string" && v.trim().length > 0;

const WAVE_RULE = "GO-WAVE-1 (provider rule, Claude Code; owner V176 BUILD_MISSIONS « vagues GO parallèles sur des zones d'écriture indépendantes »): a wave = the GO-ranked leader + every next actionable candidate whose write-set is KNOWN and disjoint from all members (odg-writeset-contention.pathsConflict), with no dependency edge to a member, up to k (k ≤ odg-concurrency-policy admitted builders when a decision is given; admit 0 ⇒ no wave). The set is re-verified by computeLayerContention (parallelSafe) AND parallel-execution-planner.plan (writeSetSafe, maxConcurrency k ⇒ exactly one wave); any disagreement ⇒ SERIAL (leader alone). UNKNOWN write-set ⇒ never parallelised. Post-receipt: WRITESET_VIOLATION / OVERLAPPING_WRITES / MERGE_CONFLICT (git merge-tree --write-tree) / CHECK_FAILED; integration only when none, validated by every declared integration check on the merged commit.";

/* RES-1 resource classes. EXCLUSIVE: at most one wave member may hold it. resourcesOf(c) = the candidate's declared classes. */
const EXCLUSIVE_RESOURCES = Object.freeze(["LOCAL_MODEL_HOST"]);
function resourcesOf(c: any): string[] { return arr(c && c.resourceClasses).map(String); }
/* resourceClassesOfContract(contract) — explicit WORK_ITEM_CONTRACT.resourceClasses, else DERIVED fail-closed: a contract
 * whose budgets name a local model (model / models / embedModel) uses the LOCAL_MODEL_HOST. */
function resourceClassesOfContract(contract: any): string[] {
  const w = contract && isObj(contract.WORK_ITEM_CONTRACT) ? contract.WORK_ITEM_CONTRACT : {};
  if (Array.isArray(w.resourceClasses)) return w.resourceClasses.map(String);
  const b = isObj(w.budgets) ? w.budgets : {};
  return (str(b.model) || (Array.isArray(b.models) && b.models.length) || str(b.embedModel)) ? ["LOCAL_MODEL_HOST"] : [];
}

/* writeSetKind(c) — KNOWN (non-empty string list, no repo-root path), READ_ONLY, or UNKNOWN (fail-closed). */
function writeSetKind(c: any): any {
  const ws = CONT.writeSetOf({ authorizedPaths: c && c.writeSet, readOnly: c && c.readOnly === true });
  if (ws.kind === "KNOWN" && ws.paths.some((p: string) => p === "")) return { kind: "UNKNOWN", reason: "a declared path normalises to the repo root (whole-tree writer)" };
  return ws.kind === "KNOWN" ? { kind: "KNOWN", paths: ws.paths } : ws.kind === "READ_ONLY" ? { kind: "READ_ONLY", paths: [] } : { kind: "UNKNOWN", reason: "no declared write-set (and not read-only)" };
}
function conflictsWith(a: any, b: any): string[] {
  const shared: string[] = [];
  for (const x of a.paths) for (const y of b.paths) if (CONT.pathsConflict(x, y)) shared.push(x === y ? x : `${x} ↔ ${y}`);
  return shared;
}

/*
 * selectWave(candidates, opts) → frozen { mode: PARALLEL|SERIAL|NONE, wave:[ids], k, kRequested, excluded:[{id,reason}], verification }
 * candidates: [{ id, writeSet?: string[], readOnly?: boolean, deps?: string[], actionable: boolean, reason? }] in GO's ranked order.
 * opts: { k (≥1), concurrencyDecision? (odg-concurrency-policy.decide result) }.
 */
function selectWave(candidates: any, opts: any = {}): any {
  const list = arr(candidates).filter((c: any) => c && str(c.id));
  const kRequested = Number.isInteger(opts.k) && opts.k >= 1 ? opts.k : 1;
  let k = kRequested; let kBasis = "requested";
  const dec = isObj(opts.concurrencyDecision) ? opts.concurrencyDecision : null;
  if (dec) {
    const adm = dec.admit && Number.isInteger(dec.admit.builders) ? dec.admit.builders : 0;
    if (adm < 1) return freeze({ rule: WAVE_RULE, mode: "NONE", wave: freeze([]), k: 0, kRequested, kBasis: "odg-concurrency-policy admitted 0 builders", excluded: freeze(list.map((c: any) => ({ id: c.id, reason: "CONCURRENCY_POLICY_ADMIT_0" }))), verification: null });
    if (adm < k) { k = adm; kBasis = `odg-concurrency-policy admitted ${adm} builder(s)`; }
  }
  const excluded: any[] = [];
  const members: any[] = [];
  const depsOf = (c: any) => arr(c.deps).map(String);
  for (const c of list) {
    if (c.actionable !== true) { excluded.push({ id: c.id, reason: `NOT_ACTIONABLE${c.reason ? ": " + c.reason : ""}` }); continue; }
    const ws = writeSetKind(c);
    if (!members.length) { members.push({ c, ws }); continue; }
    if (members[0].ws.kind === "UNKNOWN") { excluded.push({ id: c.id, reason: "LEADER_WRITESET_UNKNOWN ⇒ SERIAL (the leader runs alone)" }); continue; }
    if (ws.kind === "UNKNOWN") { excluded.push({ id: c.id, reason: `WRITESET_UNKNOWN (${ws.reason}) ⇒ never parallelised` }); continue; }
    // F-B RES-1: an EXCLUSIVE resource class (e.g. LOCAL_MODEL_HOST — one local-model host whose speed/RSS measurements a
    // concurrent sibling would contaminate) is held by at most one member; checked BEFORE write-set disjointness.
    const held = members.flatMap((m) => resourcesOf(m.c).filter((r: string) => EXCLUSIVE_RESOURCES.includes(r)).map((r: string) => ({ id: m.c.id, r })));
    const res = resourcesOf(c).filter((r: string) => held.some((h) => h.r === r));
    if (res.length) { excluded.push({ id: c.id, reason: `RESOURCE_EXCLUSIVE ${res.join(", ")} held by ${held.filter((h) => res.includes(h.r)).map((h) => h.id).join(", ")} (RES-1)` }); continue; }
    const clash = members.map((m) => ({ id: m.c.id, shared: conflictsWith(ws, m.ws) })).filter((x) => x.shared.length);
    if (clash.length) { excluded.push({ id: c.id, reason: `WRITESET_OVERLAP with ${clash.map((x) => `${x.id} (${x.shared.join(", ")})`).join("; ")}` }); continue; }
    const depEdge = members.find((m) => depsOf(c).includes(m.c.id) || depsOf(m.c).includes(c.id));
    if (depEdge) { excluded.push({ id: c.id, reason: `DEPENDENCY_EDGE with ${depEdge.c.id} (a wave holds no dependent pair)` }); continue; }
    if (members.length >= k) { excluded.push({ id: c.id, reason: `K_REACHED (k=${k}, ${kBasis})` }); continue; }
    members.push({ c, ws });
  }
  if (!members.length) return freeze({ rule: WAVE_RULE, mode: "NONE", wave: freeze([]), k, kRequested, kBasis, excluded: freeze(excluded), verification: null });
  const ids = members.map((m) => m.c.id);
  // independent re-verification by the two canonical components (fail-closed: any disagreement ⇒ SERIAL)
  const recs = members.map((m) => (m.ws.kind === "READ_ONLY" ? { id: m.c.id, readOnly: true } : m.ws.kind === "KNOWN" ? { id: m.c.id, authorizedPaths: m.ws.paths } : { id: m.c.id }));
  const lc = CONT.computeLayerContention([ids], recs);
  const pep = PEP.plan(members.map((m) => ({ id: m.c.id, writeSet: m.ws.kind === "KNOWN" ? m.ws.paths : [], deps: depsOf(m.c).filter((d) => ids.includes(d)) })), { maxConcurrency: k, writeSetSafe: true });
  const contentionOk = lc.ok === true && lc.layers[0].parallelSafe === true;
  const plannerOk = pep.waves.length === 1 && pep.waves[0].length === ids.length && pep.unscheduled.length === 0;
  const verification = { contention: { parallelSafe: contentionOk, contentions: lc.ok ? lc.layers[0].contentions : null, component: "odg-writeset-contention.computeLayerContention" }, planner: { oneWave: plannerOk, waves: pep.waves, unscheduled: pep.unscheduled, component: "parallel-execution-planner.plan(writeSetSafe, maxConcurrency k)" } };
  if (ids.length > 1 && !(contentionOk && plannerOk)) {
    return freeze({ rule: WAVE_RULE, mode: "SERIAL", wave: freeze([ids[0]]), k, kRequested, kBasis, excluded: freeze([...excluded, ...ids.slice(1).map((id) => ({ id, reason: "RE-VERIFICATION DISAGREED (contention/planner) ⇒ SERIAL" }))]), verification: freeze(verification) });
  }
  const serialReason = members[0].ws.kind === "UNKNOWN" ? "leader write-set UNKNOWN" : ids.length === 1 ? "no other candidate could join" : null;
  return freeze({ rule: WAVE_RULE, mode: ids.length > 1 ? "PARALLEL" : "SERIAL", ...(serialReason ? { serialReason } : {}), wave: freeze(ids), writeSets: freeze(Object.fromEntries(members.map((m) => [m.c.id, m.ws.kind === "KNOWN" ? m.ws.paths : m.ws.kind]))), k, kRequested, kBasis, excluded: freeze(excluded), verification: freeze(verification) });
}

/*
 * selectWaveFromState(state, register, opts) — the wave GO could form NOW over the real register (READ-ONLY, pure over
 * the state). A candidate is a register item whose current step is an AUTHORIZED EXECUTION step (odg-go-cycle
 * actionabilityOf … executionAuthorized) with a valid contract-declared dispatch target (GO-DT-1); its write-set is the
 * target's writeSet. A plain AUTHORIZED contract (odg-run path) is a candidate with an UNKNOWN write-set (serial only). Other items are listed as not dispatchable (with the reason). opts: { k, rankedIds?, leader?, concurrencyDecision? }.
 */
function selectWaveFromState(state: any, register: any, opts: any = {}): any {
  const GOC = require("./odg-go-cycle.js");   // lazy: odg-go-cycle is the canonical actionability / dispatch-target source
  const items = arr(register && register.items);
  const byId = new Map(items.map((it: any) => [String(it.id), it]));
  let order: string[] = arr(opts.rankedIds).map(String).filter((id: string) => byId.has(id));
  for (const it of items) if (!order.includes(String(it.id))) order.push(String(it.id));
  if (str(opts.leader) && byId.has(opts.leader)) order = [opts.leader, ...order.filter((x) => x !== opts.leader)];
  const contracts = state && state.sources && state.sources.contracts && state.sources.contracts.data ? arr(state.sources.contracts.data.contracts) : [];
  const cands: any[] = []; const notDispatchable: any[] = [];
  for (const id of order) {
    const it = byId.get(id); const a = GOC.actionabilityOf(state, it);
    if (!a.actionable) continue;   // unauthorized items are not candidates (GO-ACT-1 feasibility) — counted, not listed
    const contract = contracts.find((c: any) => String(c.scenario) === id) || null;
    if (a.basis === "CONTRACT_AUTHORIZED") { cands.push({ id, writeSet: undefined, deps: arr(it.deps).map(String), actionable: true, step: "PLAIN_ODG_RUN", writeSetNote: "plain AUTHORIZED contract ⇒ odg-run <id> path declares no dispatch write-set ⇒ UNKNOWN (serial only)" }); continue; }
    if (a.basis !== "SCOPED_STEP_AUTHORIZED" || a.executionAuthorized !== true) { notDispatchable.push({ id, reason: `actionable step ${a.step || a.basis} is not an authorized EXECUTION step (provider/docs/inspection work is reported, never dispatched)` }); continue; }
    const dt = GOC.resolveDispatchTarget(contract, a.step);
    if (!dt.ok) { notDispatchable.push({ id, reason: dt.reason }); continue; }
    cands.push({ id, writeSet: dt.target.writeSet, deps: arr(it.deps).map(String), actionable: true, step: a.step, resourceClasses: resourceClassesOfContract(contract) });
  }
  const sel = selectWave(cands, opts);
  return freeze({ ...sel, candidates: freeze(cands.map((c) => ({ id: c.id, step: c.step, writeSet: c.writeSet || "UNKNOWN", resourceClasses: c.resourceClasses || [], ...(c.writeSetNote ? { note: c.writeSetNote } : {}) }))), notDispatchable: freeze(notDispatchable), source: "odg-go-cycle.actionabilityOf + resolveDispatchTarget (GO-ACT-1, GO-DT-1) — read-only" });
}

/* dispatchWave(wave, ports, mode) — ports.runItem(item, { index, mode }) → Promise<receipt>; receipt = { id, ok, commit?,
 * branch?, scratch?, pid?, ... }. Records per-item start/end and the wave wall time. Never throws: a rejected item ⇒ ok:false. */
async function dispatchWave(items: any[], ports: any, mode: string = "PARALLEL"): Promise<any> {
  const now = typeof ports.now === "function" ? ports.now : () => Date.now();
  const t0 = now();
  const one = async (it: any, index: number) => {
    const s = now();
    let r: any;
    try { r = await ports.runItem(it, { index, mode }); } catch (e: any) { r = { id: it.id, ok: false, error: String((e && e.message) || e).slice(0, 300) }; }
    return { ...(isObj(r) ? r : { ok: false, error: "no receipt" }), id: it.id, startedMs: s - t0, endedMs: now() - t0 };
  };
  const receipts: any[] = [];
  if (mode === "PARALLEL") receipts.push(...(await Promise.all(items.map((it, i) => one(it, i)))));
  else for (let i = 0; i < items.length; i++) receipts.push(await one(items[i], i));
  const overlapMs = (() => { if (receipts.length < 2) return 0; const st = Math.max(...receipts.map((r) => r.startedMs)), en = Math.min(...receipts.map((r) => r.endedMs)); return Math.max(0, en - st); })();
  return { mode, wallMs: now() - t0, receipts, concurrentOverlapMs: overlapMs };
}

/* ---------- git helpers (repo given by the caller; only object writes: commit-tree) ---------- */
function git(repo: string, args: string[], input?: string): any {
  const r = cp.spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_AUTHOR_NAME: "ODG", GIT_AUTHOR_EMAIL: "odg@localhost", GIT_COMMITTER_NAME: "ODG", GIT_COMMITTER_EMAIL: "odg@localhost", GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" } });
  return { status: r.status, out: String(r.stdout || ""), err: String(r.stderr || "") };
}
/* mergeTreeSupported(repo) — git ≥ 2.38 `merge-tree --write-tree` (probe; absent ⇒ the merge simulation is NOT_MEASURED). */
function mergeTreeSupported(repo: string): boolean { const r = git(repo, ["merge-tree", "-h"]); return /--write-tree/.test(r.out + r.err); }
function changedFiles(repo: string, base: string, commit: string): string[] | null {
  const r = git(repo, ["diff", "--name-only", "--no-renames", base, commit]);
  return r.status === 0 ? r.out.split("\n").filter(Boolean).sort() : null;
}
const within = (p: string, ws: string[]) => ws.some((w) => { const a = String(p), b = String(w).replace(/\/+$/, ""); return a === b || a.startsWith(b + "/"); });

/*
 * detectIncompatibilities({ repo, base, receipts, declared, checks? , runCheck? }) → { incompatible, findings, offending, perItem, merge }
 *   declared: { [id]: writeSet[] } (the wave's declared write-sets); receipts in wave rank order.
 *   checks:   { [id]: [{ id, argv:[cmd,...args] }] } per-item post-receipt checks, run by ODG on the item's commit through
 *             runCheck(commit, check) → { exitCode } (injected; the runner checks out the commit in a scratch).
 */
async function detectIncompatibilities(o: any): Promise<any> {
  const findings: any[] = []; const perItem: any = {};
  const rec = arr(o.receipts);
  const received = rec.filter((r: any) => r && r.ok === true && str(r.commit));
  for (const r of rec) if (!(r && r.ok === true && str(r.commit))) findings.push({ kind: "NOT_RECEIVED", items: [r && r.id], detail: (r && (r.error || r.reason)) || "no commit received", detectedBy: "receipt check (no commit)" });
  for (const r of received) {
    const files = changedFiles(o.repo, o.base, r.commit);
    const ws = arr(o.declared && o.declared[r.id]).map(String);
    const outside = files ? files.filter((f) => !within(f, ws)) : null;
    perItem[r.id] = { commit: r.commit, changedFiles: files, declaredWriteSet: ws, outsideDeclared: outside };
    if (files === null) findings.push({ kind: "NOT_RECEIVED", items: [r.id], detail: "commit not readable in the integration repository", detectedBy: "git diff --name-only" });
    else if (!files.length) findings.push({ kind: "EMPTY_OUTPUT", items: [r.id], detail: "received commit changes nothing", detectedBy: "git diff --name-only" });
    else if (outside && outside.length) findings.push({ kind: "WRITESET_VIOLATION", items: [r.id], files: outside, detail: `changed ${outside.join(", ")} outside the declared write-set [${ws.join(", ")}]`, detectedBy: "git diff --name-only ⊄ declared write-set" });
  }
  for (let i = 0; i < received.length; i++) for (let j = i + 1; j < received.length; j++) {
    const a = perItem[received[i].id], b = perItem[received[j].id];
    if (!a.changedFiles || !b.changedFiles) continue;
    const shared: string[] = [];
    for (const x of a.changedFiles) for (const y of b.changedFiles) if (CONT.pathsConflict(x, y)) shared.push(x === y ? x : `${x} ↔ ${y}`);
    if (shared.length) findings.push({ kind: "OVERLAPPING_WRITES", items: [received[i].id, received[j].id], files: shared, detail: `both changed ${shared.join(", ")}`, detectedBy: "odg-writeset-contention.pathsConflict over the received change-sets" });
  }
  // merge simulation (rank order) — git merge-tree --write-tree, accumulating clean merges as commits (commit-tree)
  const merge: any = { status: "NOT_RUN", steps: [] as any[], tree: null as string | null, commit: null as string | null };
  if (received.length && received.length === rec.length) {
    if (!mergeTreeSupported(o.repo)) { merge.status = "NOT_MEASURED"; merge.reason = "git merge-tree --write-tree unavailable (git < 2.38)"; }
    else {
      let acc = received[0].commit; merge.status = "CLEAN"; merge.commit = acc;
      merge.tree = git(o.repo, ["rev-parse", acc + "^{tree}"]).out.trim();
      for (let i = 1; i < received.length; i++) {
        const r = received[i];
        const m = git(o.repo, ["merge-tree", "--write-tree", "--name-only", "--no-messages", acc, r.commit]);
        const lines = m.out.split("\n").filter(Boolean);
        if (m.status === 0) {
          const tree = lines[0];
          const c = git(o.repo, ["commit-tree", tree, "-p", acc, "-p", r.commit, "-m", `odg-go-wave merge simulation: ${received.slice(0, i + 1).map((x: any) => x.id).join(" + ")}`]);
          if (c.status !== 0) { merge.status = "ERROR"; merge.reason = c.err.slice(0, 300); break; }
          acc = c.out.trim(); merge.tree = tree; merge.commit = acc; merge.steps.push({ with: r.id, status: "CLEAN", tree });
        } else if (m.status === 1) {
          const conflicted = lines.slice(1);
          merge.status = "CONFLICT"; merge.steps.push({ with: r.id, status: "CONFLICT", conflictedFiles: conflicted });
          findings.push({ kind: "MERGE_CONFLICT", items: [...received.slice(0, i).map((x: any) => x.id), r.id], files: conflicted, detail: `git merge-tree --write-tree reports conflicts in ${conflicted.join(", ")}`, detectedBy: "git merge-tree --write-tree (exit 1)" });
          merge.commit = null; merge.tree = null; break;
        } else { merge.status = "ERROR"; merge.reason = (m.err || m.out).slice(0, 300); break; }
      }
    }
  }
  // per-item post-receipt checks (declared by the decomposition, run by ODG — never by the producing agent)
  const checks = isObj(o.checks) ? o.checks : {};
  for (const r of received) {
    const list = arr(checks[r.id]);
    perItem[r.id].checks = [];
    for (const ch of list) {
      let res: any; try { res = await o.runCheck(r.commit, ch); } catch (e: any) { res = { exitCode: null, error: String((e && e.message) || e).slice(0, 300) }; }
      perItem[r.id].checks.push({ id: ch.id, exitCode: res ? res.exitCode : null, output: res && res.output ? String(res.output).slice(0, 600) : null });
      if (!res || res.exitCode !== 0) findings.push({ kind: "CHECK_FAILED", items: [r.id], check: ch.id, detail: `post-receipt check ${ch.id} exit ${res ? res.exitCode : null}`, output: res && res.output ? String(res.output).slice(0, 600) : null, detectedBy: `declared post-receipt check ${ch.id} (process exit code)` });
    }
  }
  // offending = items to re-dispatch: violators / check failures / not received; an overlap or conflict without a
  // violator names the LATER-ranked item (the leader's receipt is kept — deterministic, stated).
  const off = new Set<string>();
  for (const f of findings) if (["WRITESET_VIOLATION", "CHECK_FAILED", "NOT_RECEIVED", "EMPTY_OUTPUT"].includes(f.kind)) f.items.forEach((x: string) => off.add(x));
  for (const f of findings) if ((f.kind === "OVERLAPPING_WRITES" || f.kind === "MERGE_CONFLICT") && !f.items.some((x: string) => off.has(x))) off.add(f.items[f.items.length - 1]);
  const order = rec.map((r: any) => r && r.id);
  return { incompatible: findings.length > 0, findings, offending: order.filter((id: string) => off.has(id)), perItem, merge, detectedBy: "odg-go-wave.detectIncompatibilities (git diff / git merge-tree / declared check exit codes)" };
}

/*
 * integrate({ repo, base, detection, receipts, checks, runCheck }) → { status, commit, changedFiles, unionOk, checks }
 *   status INTEGRATED_VALIDATED ⇔ no incompatibility, a clean merge commit, changed files(base→merge) = ∪ items' change-sets,
 *   and EVERY declared integration check (runCheck(mergeCommit, check)) exits 0. Otherwise INTEGRATION_REFUSED (incompatible
 *   input) or INTEGRATION_CHECK_FAILED.
 */
async function integrate(o: any): Promise<any> {
  const d = o.detection;
  if (!d || d.incompatible || !d.merge || d.merge.status !== "CLEAN" || !str(d.merge.commit)) return { status: "INTEGRATION_REFUSED", reason: d && d.incompatible ? `incompatible receipts: ${d.findings.map((f: any) => f.kind).join(", ")}` : `merge simulation ${d && d.merge ? d.merge.status : "absent"}`, commit: null, checks: [] };
  const commit = d.merge.commit;
  const files = changedFiles(o.repo, o.base, commit);
  const union = [...new Set(Object.values(d.perItem).flatMap((p: any) => arr(p.changedFiles)))].sort();
  const unionOk = !!files && JSON.stringify(files) === JSON.stringify(union);
  const res: any[] = [];
  for (const ch of arr(o.checks)) {
    let r: any; try { r = await o.runCheck(commit, ch); } catch (e: any) { r = { exitCode: null, error: String((e && e.message) || e).slice(0, 300) }; }
    res.push({ id: ch.id, exitCode: r ? r.exitCode : null, output: r && r.output ? String(r.output).slice(0, 600) : null });
  }
  const allPass = res.length > 0 && res.every((r) => r.exitCode === 0);
  return { status: allPass && unionOk ? "INTEGRATED_VALIDATED" : "INTEGRATION_CHECK_FAILED", commit, tree: d.merge.tree, changedFiles: files, union, unionOk, checks: res, validatedBy: "declared integration checks (process exit codes) on the merged commit, run by ODG in its own scratch" };
}

/* runCheckInScratch(repo, commit, check, opts) — git worktree add --detach <tmp> <commit>; run check.argv there; remove. */
function spawnP(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve) => {
    let out = ""; const t0 = Date.now();
    const p = cp.spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_OPTIONS: "" } });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* gone */ } }, timeoutMs);
    p.stdout.on("data", (b: any) => { out += String(b); }); p.stderr.on("data", (b: any) => { out += String(b); });
    p.on("close", (code: any, sig: any) => { clearTimeout(timer); resolve({ exitCode: code, signal: sig || null, output: out.slice(-2000), wallMs: Date.now() - t0, pid: p.pid }); });
    p.on("error", (e: any) => { clearTimeout(timer); resolve({ exitCode: null, error: String(e && e.message), output: out, wallMs: Date.now() - t0, pid: p.pid }); });
  });
}
async function runCheckInScratch(repo: string, commit: string, check: any, opts: any = {}): Promise<any> {
  const dir = fs.mkdtempSync(path.join(opts.tmpRoot || os.tmpdir(), "odg-wave-check-"));
  const wt = path.join(dir, "wt");
  const add = git(repo, ["worktree", "add", "--detach", "-q", wt, commit]);
  if (add.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return { exitCode: null, error: "worktree add failed: " + add.err.slice(0, 200) }; }
  try { const argv = arr(check.argv).map(String); return await spawnP(argv[0], argv.slice(1), wt, opts.timeoutMs || 60000); }
  finally { git(repo, ["worktree", "remove", "--force", wt]); fs.rmSync(dir, { recursive: true, force: true }); }
}

const GO_WAVE_CONTRACT = freeze({
  id: "V176-ODG-GO-WAVE",
  source: "owner V176 BUILD_MISSIONS (docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json) « Construire les vagues GO parallèles sur des zones d'écriture indépendantes. » — scenario F contract revision (docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#F)",
  rule: WAVE_RULE,
  reuses: freeze(["odg-go-cycle.actionabilityOf / resolveDispatchTarget", "parallel-execution-planner.plan", "odg-writeset-contention.computeLayerContention / pathsConflict / writeSetOf", "odg-concurrency-policy.decide (admitted builders, injected)", "git merge-tree --write-tree / commit-tree / diff"]),
  invariants: freeze([
    "NO second orchestrator: selection is over GO's ranked candidates and GO's actionability; execution only through an injected port",
    "INDEPENDENT IN WRITE-SET is checked twice (contention + planner); any disagreement ⇒ SERIAL; UNKNOWN write-set ⇒ never parallelised",
    "incompatibility verdicts come only from git (diff / merge-tree exit codes) and declared check exit codes — never from a caller flag",
    "integration only on a clean merge of compatible receipts; validated only if every declared integration check exits 0 and the integrated change-set = the union of the items' change-sets",
    "write isolation ≠ semantic independence: semantic incompatibilities are detected by the declared post-receipt / integration checks, not assumed away",
    "GO's odg-go-cycle EXECUTE still dispatches ONE item per cycle; wiring waves into the cycle is a separate GO change (not done here)",
  ]),
});

module.exports = { EXCLUSIVE_RESOURCES, resourcesOf, resourceClassesOfContract, selectWave, selectWaveFromState, dispatchWave, detectIncompatibilities, integrate, runCheckInScratch, spawnP, mergeTreeSupported, changedFiles, writeSetKind, git, WAVE_RULE, GO_WAVE_CONTRACT };
export {};
