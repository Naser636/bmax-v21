#!/usr/bin/env node
"use strict";
/*
 * V155 (CTO directive V15.5 step 4) — ODG NATIVE AGENT SUPERVISOR. Read-only observer + fail-closed assignment gate.
 *
 * Classifies every agent / sub-agent / agent-shaped resource from OBSERVABLE evidence ONLY (never from a UI label) into
 * exactly one of STATES. Evidence sources (each injectable, each optional): `git worktree list --porcelain`, branch-vs-
 * origin/main ahead/behind, uncommitted changes, pushed-ness, `gh pr list` JSON (injected — this module never calls the
 * network), process liveness (pid / process cwd inside a worktree), heartbeat files, fleet-bridge claims, and Claude Code
 * task-output files (STRUCTURE ONLY: presence, mtime, and the record type / stop reason / tool NAME of the tail records —
 * message text is never ingested, stored or treated as instructions).
 *
 * REUSE MAP (no second orchestrator / registry / lock mechanism):
 *   - odg-writeset-contention.writeSetOf + computeLayerContention → write-set conflict check on assignment (UNKNOWN ⇒ conflicts all)
 *   - fleet-bridge.tryClaim / releaseClaim / currentClaim        → the ONE lock: a generation-numbered claim serialises
 *     assignment (check+record is atomic across processes); currentClaim is the read-only view of fleet locks (orphan locks)
 *   - odg-sovereign-delegation.ALWAYS_PROTECTED                  → a write-set touching a protected path is refused
 *   - heartbeat files                                              → the ONLY persisted per-agent record (declaration + liveness);
 *     no separate assignment registry
 *   - odg-open-mission-recovery / mission-attempt-log / checkpoint-engine / mission-lifecycle → mission-level state is theirs;
 *     this module supervises AGENTS (processes/worktrees/branches), never rewrites mission status or the closure register
 *
 * Honesty invariants: a label is not evidence; COMPLETED_WITH_RESULT needs delivery evidence (PR/commit + tests) or a
 * recoverable final report for a report-only agent; a RUNNING agent is never relaunched; CLOSED needs an INDEPENDENT
 * inspection verdict; the supervisor never deletes worktrees/branches/locks — it emits a freeing PROPOSAL.
 */
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const contention = require("./odg-writeset-contention.js");
const fleetBridge = require("./fleet-bridge.js");
const sovereign = require("./odg-sovereign-delegation.js");

const STATES = Object.freeze(["RUNNING", "COMPLETED_WITH_RESULT", "COMPLETED_NO_RESULT", "BLOCKED", "INTERRUPTED", "ORPHAN", "AWAITING_VALIDATION"]);
// states that still HOLD their write-set (a new assignment overlapping them is refused)
const HOLDING = Object.freeze(["RUNNING", "AWAITING_VALIDATION", "INTERRUPTED", "BLOCKED"]);
// states a duplicate launch is refused against
const DEDUP = Object.freeze(["RUNNING", "AWAITING_VALIDATION"]);
const PROTECTED_PREFIXES = Object.freeze([...sovereign.ALWAYS_PROTECTED, "runtime/governance", "docs/odg/v124-consolidated-roadmap.json"]);
const DEFAULTS = Object.freeze({ staleMs: 15 * 60 * 1000, taskWindowMs: 72 * 3600 * 1000, mutexTtlMs: 30000, mutexId: "odg-agent-supervisor.assign" });

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function num(v: any): number | null { const n = typeof v === "number" ? v : Date.parse(v); return Number.isFinite(n) ? n : null; }
function iso(ms: number | null): string | null { return ms === null ? null : new Date(ms).toISOString(); }
function maxMs(...xs: (number | null)[]): number | null { const v = xs.filter((x) => x !== null) as number[]; return v.length ? Math.max(...v) : null; }
function within(child: string, parent: string): boolean { if (!child || !parent) return false; const c = path.resolve(child), p = path.resolve(parent); return c === p || c.startsWith(p + path.sep); }

// ---------------------------------------------------------------------------------------------------------------------
// Evidence parsing (pure)
// ---------------------------------------------------------------------------------------------------------------------
function parseWorktreePorcelain(text: string): any[] {
  const out: any[] = [];
  let cur: any = null;
  for (const line of String(text || "").split("\n")) {
    if (line.startsWith("worktree ")) { if (cur) out.push(cur); cur = { path: line.slice(9), head: null, branch: null, detached: false, locked: false, prunable: false }; continue; }
    if (!cur) continue;
    if (line.startsWith("HEAD ")) cur.head = line.slice(5);
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (line === "detached") cur.detached = true;
    else if (line.startsWith("locked")) cur.locked = true;
    else if (line.startsWith("prunable")) cur.prunable = true;
  }
  if (cur) out.push(cur);
  return out;
}

// STRUCTURE-ONLY summary of a Claude Code task-output transcript tail. Only whitelisted metadata survives; any message
// text is dropped here and never returned.
function summarizeTaskTail(tailText: string): any {
  const recs: any[] = [];
  for (const line of String(tailText || "").split("\n")) { const s = line.trim(); if (!s) continue; try { recs.push(JSON.parse(s)); } catch { /* partial first/last line of the tail window */ } }
  let finalReport = false, lastType: string | null = null, lastStop: string | null = null, cwd: string | null = null, gitBranch: string | null = null, lastAt: number | null = null, agentId: string | null = null, sessionId: string | null = null;
  for (const r of recs) {
    const m = r && r.message;
    const content = m && Array.isArray(m.content) ? m.content : [];
    if (content.some((c: any) => c && c.type === "tool_use" && c.name === "SubagentHandback")) finalReport = true;
    lastType = typeof r.type === "string" ? r.type : lastType;
    lastStop = m && typeof m.stop_reason === "string" ? m.stop_reason : (r.type === "assistant" ? null : lastStop);
    if (typeof r.cwd === "string") cwd = r.cwd;
    if (typeof r.gitBranch === "string") gitBranch = r.gitBranch;
    if (typeof r.agentId === "string") agentId = r.agentId;
    if (typeof r.sessionId === "string") sessionId = r.sessionId;
    const t = num(r.timestamp); if (t !== null) lastAt = t;
  }
  if (lastType === "assistant" && lastStop === "end_turn") finalReport = true;
  return freeze({ records: recs.length, finalReport, lastType, lastStop, cwd, gitBranch, agentId, sessionId, lastRecordAt: lastAt });
}

// ---------------------------------------------------------------------------------------------------------------------
// Correlation: evidence → agent units (pure)
// ---------------------------------------------------------------------------------------------------------------------
/*
 * ev = { now, repoRoot, mainBranch, worktrees[], branches[{name, head, ahead, behind, pushed, writeSet[]}],
 *        worktreeStatus{path: {dirty, dirtyPaths[]}}, prs[{number, headRefName, state, headRefOid, checks}],
 *        procs[{pid, cwd}], alivePids[], heartbeats[{...declaration, mtimeMs}], tasks[{id, sessionId, mtimeMs, createdMs, present, tail}],
 *        claims[{id, gen, holderPid, mtimeMs, released}] }
 */
function correlate(ev: any, opts: any = {}): any[] {
  const now = num(ev.now) ?? Date.now();
  const staleMs = opts.staleMs ?? DEFAULTS.staleMs;
  const mainBranch = ev.mainBranch || "main";
  const branches = new Map<string, any>((ev.branches || []).map((b: any) => [b.name, b]));
  const prsByBranch = new Map<string, any[]>();
  for (const p of ev.prs || []) { const k = p.headRefName; if (!prsByBranch.has(k)) prsByBranch.set(k, []); prsByBranch.get(k)!.push(p); }
  const alive = new Set<number>((ev.alivePids || []).map(Number));
  const wts = (ev.worktrees || []).filter((w: any) => !(w.branch === mainBranch && path.resolve(w.path) === path.resolve(ev.repoRoot || w.path)));
  const units: any[] = [];
  const ownedWorktrees = new Set<string>(), ownedBranches = new Set<string>();

  const resourceFor = (wtPath: string | null, branch: string | null) => {
    const wt = wtPath ? wts.find((w: any) => within(wtPath, w.path)) : (branch ? wts.find((w: any) => w.branch === branch) : null);
    const br = branch || (wt && wt.branch) || null;
    return { wt: wt || null, branch: br && br !== mainBranch ? br : null };
  };
  const procAliveIn = (wt: any) => !!wt && (ev.procs || []).some((p: any) => within(p.cwd, wt.path));
  const activityFresh = (wt: any) => { const a = wt && ev.worktreeStatus && ev.worktreeStatus[wt.path] ? ev.worktreeStatus[wt.path].lastActivityMs : null; return a !== null && a !== undefined && now - a <= staleMs; };

  // 1) heartbeat-declared agents (the supervisor's own assignments)
  for (const hb of ev.heartbeats || []) {
    if (hb.status === "CLOSED" || hb.status === "SUPERSEDED") continue;
    const r = resourceFor(hb.worktree || null, hb.branch || null);
    if (r.wt) ownedWorktrees.add(r.wt.path); if (r.branch) ownedBranches.add(r.branch);
    const hbAt = maxMs(num(hb.heartbeatAt), num(hb.mtimeMs));
    units.push({
      id: String(hb.id), kind: "HEARTBEAT_AGENT", parent_id: hb.parentId ?? null, child_ids: [], mission: hb.workItem ?? null, owner: hb.owner ?? null,
      worktree: r.wt ? r.wt.path : (hb.worktree ?? null), branch: r.branch, write_set: Array.isArray(hb.writeSet) ? hb.writeSet : null, readOnly: hb.readOnly === true,
      created_at: num(hb.createdAt), last_progress_at: num(hb.progressAt) ?? hbAt, heartbeat: hbAt, deadline: num(hb.deadline), relaunchOf: hb.relaunchOf ?? null,
      e: { pidAlive: hb.pid !== undefined && alive.has(Number(hb.pid)), procInWorktree: procAliveIn(r.wt), heartbeatFresh: hbAt !== null && now - hbAt <= staleMs, declared: hb.status ?? null, declaredReason: hb.reason ?? null, testEvidence: hb.testEvidence ?? null, finalReport: hb.finalReport === true, hasOwner: true },
    });
  }
  // 2) Claude Code task-output agents (structure only)
  for (const t of ev.tasks || []) {
    const tail = t.tail || {};
    const r = resourceFor(tail.cwd || null, tail.gitBranch || null);
    const fresh = t.present && t.mtimeMs !== null && now - t.mtimeMs <= staleMs;
    units.push({
      id: "task:" + t.id, kind: "CLAUDE_TASK", parent_id: "session:" + (t.sessionId || tail.sessionId || "?"), child_ids: [], mission: null, owner: "claude-code-subagent",
      worktree: r.wt ? r.wt.path : null, branch: r.branch, write_set: null, readOnly: false,
      created_at: t.createdMs ?? null, last_progress_at: maxMs(tail.lastRecordAt ?? null, t.present ? t.mtimeMs : null), heartbeat: t.present ? t.mtimeMs : null, deadline: null, relaunchOf: null,
      e: { pidAlive: false, procInWorktree: false, heartbeatFresh: fresh && !tail.finalReport, declared: null, declaredReason: null, testEvidence: null, finalReport: !!tail.finalReport, present: !!t.present, hasOwner: true },
    });
  }
  // the most recent task per worktree owns it (older tasks keep their own evidence but do not own the resource)
  const latestByWt = new Map<string, any>();
  for (const u of units) if (u.kind === "CLAUDE_TASK" && u.worktree) { const cur = latestByWt.get(u.worktree); if (!cur || (u.last_progress_at ?? 0) > (cur.last_progress_at ?? 0)) latestByWt.set(u.worktree, u); }
  for (const u of units) if (u.kind === "CLAUDE_TASK" && u.worktree) {
    if (latestByWt.get(u.worktree) === u) { ownedWorktrees.add(u.worktree); if (u.branch) ownedBranches.add(u.branch); u.e.procInWorktree = procAliveIn(wts.find((w: any) => w.path === u.worktree)); }
    else { u.ownsResource = false; }
  }
  // 3) unowned worktrees / branches (resource units)
  for (const w of wts) {
    if (ownedWorktrees.has(w.path)) continue;
    if (w.branch) ownedBranches.add(w.branch);
    units.push({ id: "worktree:" + w.path, kind: "WORKTREE", parent_id: null, child_ids: [], mission: null, owner: null, worktree: w.path, branch: w.branch, write_set: null, readOnly: false, created_at: null, last_progress_at: null, heartbeat: null, deadline: null, relaunchOf: null,
      e: { pidAlive: false, procInWorktree: procAliveIn(w), heartbeatFresh: false, recentActivity: activityFresh(w), declared: null, finalReport: false, hasOwner: false } });
  }
  for (const b of ev.branches || []) {
    if (b.name === mainBranch || ownedBranches.has(b.name)) continue;
    units.push({ id: "branch:" + b.name, kind: "BRANCH", parent_id: null, child_ids: [], mission: null, owner: null, worktree: null, branch: b.name, write_set: null, readOnly: false, created_at: null, last_progress_at: num(b.committedAt), heartbeat: null, deadline: null, relaunchOf: null,
      e: { pidAlive: false, procInWorktree: false, heartbeatFresh: false, declared: null, finalReport: false, hasOwner: false } });
  }
  // 4) fleet-bridge claims: a live (unreleased, unexpired) claim whose holder pid is dead is an orphan lock
  for (const c of ev.claims || []) {
    if (c.released) continue;
    const holderAlive = c.holderPid !== null && c.holderPid !== undefined && alive.has(Number(c.holderPid));
    units.push({ id: "claim:" + c.id + "#" + c.gen, kind: "CLAIM", parent_id: null, child_ids: [], mission: c.id, owner: c.holderPid ? "pid:" + c.holderPid : null, worktree: null, branch: null, write_set: null, readOnly: true, created_at: null, last_progress_at: c.mtimeMs ?? null, heartbeat: c.mtimeMs ?? null, deadline: null, relaunchOf: null,
      e: { pidAlive: holderAlive, procInWorktree: false, heartbeatFresh: false, declared: null, finalReport: false, hasOwner: holderAlive, isClaim: true } });
  }
  // attach resource evidence + parent/child links
  for (const u of units) {
    const b = u.branch ? branches.get(u.branch) : null;
    const st = u.worktree && ev.worktreeStatus ? ev.worktreeStatus[u.worktree] : null;
    const prs = u.branch ? (prsByBranch.get(u.branch) || []) : [];
    u.r = { worktreeExists: !!(u.worktree && wts.some((w: any) => w.path === u.worktree)), dirty: st ? st.dirty : 0, ahead: b ? b.ahead : null, behind: b ? b.behind : null, pushed: b ? !!b.pushed : false, integrated: b ? b.ahead === 0 : null, prs };
    if (!u.write_set && b && Array.isArray(b.writeSet) && b.writeSet.length) { u.write_set = b.writeSet.slice(); u.writeSetSource = "OBSERVED_DIFF"; }
    else u.writeSetSource = u.write_set ? "DECLARED" : "UNKNOWN";
    if (st && Array.isArray(st.dirtyPaths) && st.dirtyPaths.length) { u.write_set = [...new Set([...(u.write_set || []), ...st.dirtyPaths])]; }
  }
  const byId = new Map(units.map((u) => [u.id, u]));
  for (const u of units) if (u.parent_id && byId.has(u.parent_id)) byId.get(u.parent_id).child_ids.push(u.id);
  return units;
}

// ---------------------------------------------------------------------------------------------------------------------
// Classification (pure, exactly one state, precedence documented)
// ---------------------------------------------------------------------------------------------------------------------
function testsEvidenceOf(u: any): boolean {
  if (u.e.testEvidence && (u.e.testEvidence.passed === true || u.e.testEvidence.ok === true)) return true;
  return u.r.prs.some((p: any) => p.checks === "SUCCESS");
}

function classify(u: any, now: number): any {
  const reasons: string[] = [];
  const openPr = u.r.prs.find((p: any) => p.state === "OPEN");
  const mergedPr = u.r.prs.find((p: any) => p.state === "MERGED");
  const live = u.e.pidAlive || u.e.procInWorktree || u.e.heartbeatFresh || u.e.recentActivity === true;
  const partialWork = u.r.worktreeExists && ((u.r.dirty || 0) > 0 || (u.r.ahead || 0) > 0);
  const delivered = !!mergedPr || (u.r.pushed && (u.r.ahead || 0) > 0) || (!!openPr);
  const tests = testsEvidenceOf(u);
  const writeIntent = !!(u.worktree || u.branch);
  let state: string;

  if (u.e.isClaim) {
    state = u.e.pidAlive ? "RUNNING" : "ORPHAN"; reasons.push(u.e.pidAlive ? "claim holder pid alive" : "unreleased claim, holder pid not alive");
  } else if (live) {
    state = "RUNNING";
    if (u.e.pidAlive) reasons.push("pid alive"); if (u.e.procInWorktree) reasons.push("live process cwd inside worktree"); if (u.e.heartbeatFresh) reasons.push("fresh heartbeat/output without final record"); if (u.e.recentActivity) reasons.push("recent write activity in worktree (dirty-path / index mtime within staleMs)");
  } else if (openPr) {
    state = "AWAITING_VALIDATION"; reasons.push(`PR #${openPr.number} OPEN (checks=${openPr.checks || "UNKNOWN"})`);
  } else if (u.e.declared === "BLOCKED") {
    state = "BLOCKED"; reasons.push("declared BLOCKED: " + (u.e.declaredReason || "no reason given"));
  } else if (u.e.declared === "CANCELLED") {
    state = "COMPLETED_NO_RESULT"; reasons.push("cancelled");
  } else if (u.ownsResource !== false && delivered && tests) {
    state = "COMPLETED_WITH_RESULT"; reasons.push(mergedPr ? `PR #${mergedPr.number} MERGED with passing checks` : "pushed commits with test evidence");
  } else if (u.kind === "CLAUDE_TASK" && u.e.finalReport && (!writeIntent || u.ownsResource === false)) {
    state = "COMPLETED_WITH_RESULT"; reasons.push("final report recoverable (report-only agent)");
  } else if (u.kind === "CLAUDE_TASK" && !u.e.present) {
    state = "COMPLETED_NO_RESULT"; reasons.push("task output dangling (transcript gone) — no result recoverable; how it ended is NOT_MEASURED");
  } else if (u.e.hasOwner && !u.e.finalReport) {
    state = "INTERRUPTED"; reasons.push(u.kind === "CLAUDE_TASK" ? "stale output, last record is not a final report" : "stale heartbeat, process not alive");
  } else if (u.e.hasOwner) {
    state = "COMPLETED_NO_RESULT"; reasons.push(delivered ? "delivery without test evidence" : "final report but no delivery evidence for a write-intent agent");
  } else if (mergedPr && tests) {
    state = "COMPLETED_WITH_RESULT"; reasons.push(`no owner, PR #${mergedPr.number} MERGED with passing checks`);
  } else {
    state = "ORPHAN"; reasons.push(u.r.integrated && !(u.r.dirty > 0) ? "no owning agent; nothing unintegrated" : `no owning agent; ${u.r.ahead ?? "?"} unintegrated commit(s), ${u.r.dirty || 0} dirty path(s)`);
  }
  const timedOut = u.deadline !== null && now > u.deadline && (state === "RUNNING" || state === "INTERRUPTED");
  const recoverable = state === "INTERRUPTED" && partialWork;
  return freeze({
    id: u.id, kind: u.kind, state, reasons: freeze(reasons), parent_id: u.parent_id, child_ids: freeze(u.child_ids.slice()), mission: u.mission, owner: u.owner,
    worktree: u.worktree, branch: u.branch, write_set: u.write_set ? freeze(u.write_set.slice()) : null, writeSetSource: u.writeSetSource, readOnly: u.readOnly,
    created_at: iso(u.created_at), last_progress_at: iso(u.last_progress_at), heartbeat: iso(u.heartbeat), deadline: iso(u.deadline), relaunchOf: u.relaunchOf,
    timedOut, action: timedOut && state === "RUNNING" ? "CANCEL_PROPOSED" : null,
    recoverable, delivery: freeze({ ahead: u.r.ahead, dirty: u.r.dirty, pushed: u.r.pushed, integrated: u.r.integrated, prs: freeze(u.r.prs.map((p: any) => ({ number: p.number, state: p.state, checks: p.checks || "UNKNOWN" }))) }),
    quality: freeze({ hasFinalReport: !!u.e.finalReport, hasPR: u.r.prs.length > 0, hasTestsEvidence: tests, hasCommits: (u.r.ahead || 0) > 0 || !!mergedPr }),
  });
}

function decideRecovery(a: any): any {
  if (a.state === "RUNNING") return freeze({ decision: "REFUSE", reason: "RUNNING — never relaunch a live agent" + (a.timedOut ? " (timed out ⇒ CANCEL_PROPOSED, owner decides)" : "") });
  if (a.state !== "INTERRUPTED") return freeze({ decision: "NONE", reason: `state ${a.state} is not INTERRUPTED` });
  if (!a.recoverable) return freeze({ decision: "NOT_RECOVERABLE", reason: "INTERRUPTED without recoverable worktree state (no dirty paths / no commits ahead)" });
  return freeze({ decision: "RELAUNCH", reason: "INTERRUPTED with partial work in worktree — resume from it", worktree: a.worktree, branch: a.branch });
}

function metrics(agents: any[], now: number): any {
  const completed = agents.filter((a) => a.state === "COMPLETED_WITH_RESULT" || a.state === "COMPLETED_NO_RESULT");
  const lat = completed.map((a) => (a.created_at && a.last_progress_at ? Date.parse(a.last_progress_at) - Date.parse(a.created_at) : null)).filter((x) => x !== null && x >= 0) as number[];
  lat.sort((x, y) => x - y);
  const relaunches = agents.filter((a) => a.relaunchOf);
  const useless = relaunches.filter((a) => a.state === "COMPLETED_NO_RESULT" || (a.state === "INTERRUPTED" && !a.recoverable));
  const byState: any = {}; for (const s of STATES) byState[s] = 0; for (const a of agents) byState[a.state]++;
  const withWrite = agents.filter((a) => a.branch);
  return freeze({
    byState: freeze(byState), total: agents.length,
    reportQuality: freeze({ withFinalReport: agents.filter((a) => a.quality.hasFinalReport).length, withPR: agents.filter((a) => a.quality.hasPR).length, withTestsEvidence: agents.filter((a) => a.quality.hasTestsEvidence).length, completedWithResult: byState.COMPLETED_WITH_RESULT }),
    latencyMs: lat.length ? freeze({ n: lat.length, median: lat[Math.floor(lat.length / 2)], max: lat[lat.length - 1] }) : "NOT_MEASURED",
    uselessRelaunches: relaunches.length ? freeze({ relaunches: relaunches.length, useless: useless.length }) : "NOT_MEASURED (no relaunch records)",
    integratedIntoMain: freeze({ branchesObserved: withWrite.length, integrated: withWrite.filter((a) => a.delivery.integrated === true).length, mergedPRs: agents.filter((a) => a.delivery.prs.some((p: any) => p.state === "MERGED")).length }),
    measuredAt: iso(now),
  });
}

// write-set conflicts among agents that currently hold their write-set (reuses computeLayerContention, fail-closed UNKNOWN)
function holdingContention(agents: any[]): any {
  const holders = agents.filter((a) => HOLDING.includes(a.state) && a.kind !== "CLAIM" && (a.worktree || a.branch || a.write_set));
  const r = contention.computeLayerContention([holders.map((a) => a.id)], holders.map((a) => ({ id: a.id, authorizedPaths: a.write_set || undefined, readOnly: a.readOnly })));
  return freeze({ holders: holders.length, contentions: r.ok ? r.layers[0].contentions : [], note: "UNKNOWN write-set conflicts with everything (fail-closed)" });
}

function snapshot(ev: any, opts: any = {}): any {
  const now = num(ev.now) ?? Date.now();
  const agents = correlate(ev, opts).map((u) => classify(u, now)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const recovery = agents.filter((a) => a.state === "INTERRUPTED" || a.state === "RUNNING").map((a) => ({ id: a.id, ...decideRecovery(a) }));
  const sessions: any = {};
  for (const a of agents) if (a.parent_id && a.parent_id.startsWith("session:")) { const s = (sessions[a.parent_id] = sessions[a.parent_id] || { id: a.parent_id, child_ids: [], byState: {} }); s.child_ids.push(a.id); s.byState[a.state] = (s.byState[a.state] || 0) + 1; }
  return freeze({ schema: "ODG_AGENT_SUPERVISOR_SNAPSHOT", version: 1, at: iso(now), states: STATES, agents: freeze(agents), sessions: freeze(Object.values(sessions)), metrics: metrics(agents, now), contention: holdingContention(agents), recovery: freeze(recovery), freeing: freeingProposal(agents), sources: ev.sources || null });
}

// ---------------------------------------------------------------------------------------------------------------------
// Freeing proposal (never executed)
// ---------------------------------------------------------------------------------------------------------------------
function freeingProposal(agents: any[]): any {
  const out: any[] = [];
  for (const a of agents) {
    if (!["ORPHAN", "COMPLETED_WITH_RESULT", "COMPLETED_NO_RESULT"].includes(a.state)) continue;
    const safe = a.delivery.integrated === true && (a.delivery.dirty || 0) === 0;
    if (a.kind === "CLAIM") { out.push({ kind: "claim", id: a.id, safe: true, proposal: "claim holder dead: a new tryClaim takes over the next generation (no deletion needed)" }); continue; }
    if (a.worktree && a.kind !== "CLAUDE_TASK") out.push({ kind: "worktree", path: a.worktree, safe, proposal: safe ? `git worktree remove ${a.worktree}` : "REVIEW FIRST — unintegrated or uncommitted work" });
    if (a.branch && a.kind !== "CLAUDE_TASK") out.push({ kind: "branch", name: a.branch, safe, proposal: safe ? `git branch -d ${a.branch}` : "REVIEW FIRST — branch has commits not in origin/main" });
  }
  return freeze({ executed: false, note: "PROPOSAL ONLY — the supervisor never deletes worktrees, branches or locks", items: freeze(out) });
}

// ---------------------------------------------------------------------------------------------------------------------
// Assignment gate: dedup + protected paths + write-set contention, serialised by a fleet-bridge claim
// ---------------------------------------------------------------------------------------------------------------------
function readHeartbeats(dir: string): any[] {
  let names: string[] = [];
  try { names = fs.readdirSync(dir).filter((n: string) => n.endsWith(".json")); } catch { return []; }
  const out: any[] = [];
  for (const n of names) { const p = path.join(dir, n); try { const o = JSON.parse(fs.readFileSync(p, "utf8")); o.mtimeMs = fs.statSync(p).mtimeMs; out.push(o); } catch { /* unreadable ⇒ ignored, never guessed */ } }
  return out;
}
function writeJsonAtomic(p: string, obj: any): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, p);
}
function safeId(id: string): string { return String(id).replace(/[^A-Za-z0-9._-]/g, "_"); }

/*
 * assign(request, ctx) — request = { id, workItem, writeSet[] | readOnly, owner, parentId?, worktree?, branch?, deadline?, relaunchOf? }
 * ctx = { heartbeatDir, locksDir, evidence? (extra snapshot evidence), now?, staleMs?, mutexTtlMs? }
 * Under the fleet-bridge mutex: re-read heartbeats, classify, refuse duplicates / protected paths / write-set overlap,
 * then record the assignment as its heartbeat file. Returns { outcome: ASSIGNED | REFUSED_*, ... }.
 */
function assign(request: any, ctx: any): any {
  const ws = contention.writeSetOf(request);
  if (!request || !request.id || !request.workItem) return freeze({ outcome: "REFUSED_INVALID", reason: "id and workItem required" });
  if (ws.kind === "UNKNOWN") return freeze({ outcome: "REFUSED_UNKNOWN_WRITESET", reason: "write-set must be declared (or readOnly) — fail-closed" });
  if (ws.kind === "KNOWN") {
    const hit = ws.paths.filter((p: string) => PROTECTED_PREFIXES.some((q: string) => contention.pathsConflict(p, q)));
    if (hit.length) return freeze({ outcome: "REFUSED_PROTECTED_PATH", paths: freeze(hit) });
  }
  const cfg = { locksDir: ctx.locksDir, lockTtlMs: ctx.mutexTtlMs ?? DEFAULTS.mutexTtlMs };
  if (!fleetBridge.tryClaim(cfg, DEFAULTS.mutexId)) return freeze({ outcome: "REFUSED_BUSY", reason: "another assignment holds the supervisor claim — retry; never proceed unserialised" });
  try {
    const now = num(ctx.now) ?? Date.now();
    const ev = Object.assign({ now, worktrees: [], branches: [], prs: [], procs: [], alivePids: [], tasks: [], claims: [] }, ctx.evidence || {}, { heartbeats: readHeartbeats(ctx.heartbeatDir) });
    const agents = correlate(ev, { staleMs: ctx.staleMs }).map((u) => classify(u, now));
    const dup = agents.find((a) => DEDUP.includes(a.state) && (a.mission === request.workItem || a.id === String(request.id)));
    if (dup) return freeze({ outcome: "REFUSED_DUPLICATE", against: dup.id, state: dup.state });
    const holders = agents.filter((a) => HOLDING.includes(a.state) && a.kind !== "CLAIM" && a.id !== request.relaunchOf);
    if (request.relaunchOf) {
      const orig = agents.find((a) => a.id === request.relaunchOf);
      const d = orig ? decideRecovery(orig) : { decision: "NONE", reason: "unknown original" };
      if (d.decision !== "RELAUNCH") return freeze({ outcome: "REFUSED_NOT_RECOVERABLE", against: request.relaunchOf, reason: d.reason });
    }
    const self = { id: "__new__", authorizedPaths: request.writeSet, readOnly: request.readOnly === true };
    const c = contention.computeLayerContention([[...holders.map((a) => a.id), "__new__"]], [...holders.map((a) => ({ id: a.id, authorizedPaths: a.write_set || undefined, readOnly: a.readOnly })), self]);
    const mine = c.ok ? c.layers[0].contentions.filter((x: any) => x.a === "__new__" || x.b === "__new__") : [{ reason: "CONTENTION_CHECK_FAILED" }];
    if (mine.length) return freeze({ outcome: "REFUSED_WRITESET_CONFLICT", conflicts: freeze(mine.map((x: any) => ({ with: x.a === "__new__" ? x.b : x.a, reason: x.reason, shared: x.shared }))) });
    const hb = { id: String(request.id), workItem: request.workItem, owner: request.owner ?? null, parentId: request.parentId ?? null, worktree: request.worktree ?? null, branch: request.branch ?? null,
      writeSet: request.writeSet ?? null, readOnly: request.readOnly === true, createdAt: iso(now), heartbeatAt: iso(now), deadline: request.deadline ?? null, relaunchOf: request.relaunchOf ?? null, pid: request.pid ?? null, status: "ASSIGNED" };
    writeJsonAtomic(path.join(ctx.heartbeatDir, safeId(request.id) + ".json"), hb);
    if (request.relaunchOf) {
      const op = path.join(ctx.heartbeatDir, safeId(request.relaunchOf) + ".json");
      try { const o = JSON.parse(fs.readFileSync(op, "utf8")); o.status = "SUPERSEDED"; o.supersededBy = String(request.id); writeJsonAtomic(op, o); } catch { /* original not heartbeat-backed */ }
    }
    return freeze({ outcome: "ASSIGNED", id: String(request.id), heartbeat: path.join(ctx.heartbeatDir, safeId(request.id) + ".json") });
  } finally {
    fleetBridge.releaseClaim(cfg, DEFAULTS.mutexId);
  }
}

/*
 * close(agent, inspection, ctx) — CLOSED requires an INDEPENDENT inspection verdict (inspector ≠ owner) on a completed /
 * orphan agent. Clean closure: heartbeat marked CLOSED, any claim THIS process holds for it released, freeing PROPOSAL emitted.
 */
function close(agent: any, inspection: any, ctx: any = {}): any {
  if (!agent) return freeze({ outcome: "REFUSED", reason: "unknown agent" });
  if (!["COMPLETED_WITH_RESULT", "COMPLETED_NO_RESULT", "ORPHAN"].includes(agent.state)) return freeze({ outcome: "REFUSED", reason: `state ${agent.state} cannot be closed (RUNNING/AWAITING/BLOCKED/INTERRUPTED must resolve first)` });
  if (!inspection || !inspection.inspector || !["ACCEPT", "REJECT"].includes(inspection.verdict)) return freeze({ outcome: "REFUSED", reason: "independent inspection verdict (ACCEPT|REJECT + inspector) required before CLOSED" });
  if (agent.owner && inspection.inspector === agent.owner) return freeze({ outcome: "REFUSED", reason: "inspector is the owner — not independent" });
  if (agent.state === "COMPLETED_WITH_RESULT" && inspection.verdict === "ACCEPT" && !(agent.quality.hasTestsEvidence || (agent.quality.hasFinalReport && !agent.branch))) return freeze({ outcome: "REFUSED", reason: "ACCEPT without delivery+tests evidence" });
  if (ctx.heartbeatDir && agent.kind === "HEARTBEAT_AGENT") {
    const p = path.join(ctx.heartbeatDir, safeId(agent.id) + ".json");
    try { const o = JSON.parse(fs.readFileSync(p, "utf8")); o.status = "CLOSED"; o.closedAt = iso(num(ctx.now) ?? Date.now()); o.inspection = { inspector: inspection.inspector, verdict: inspection.verdict }; writeJsonAtomic(p, o); } catch { /* no heartbeat file */ }
  }
  if (ctx.locksDir && ctx.claimId) fleetBridge.releaseClaim({ locksDir: ctx.locksDir }, ctx.claimId);
  const verdict = agent.state === "COMPLETED_WITH_RESULT" && inspection.verdict === "ACCEPT" ? "CLOSED_ACCEPTED" : agent.state === "ORPHAN" ? "CLOSED_ORPHAN" : inspection.verdict === "REJECT" ? "CLOSED_REJECTED" : "CLOSED_NO_RESULT";
  return freeze({ outcome: verdict, id: agent.id, inspection: freeze({ inspector: inspection.inspector, verdict: inspection.verdict }), freeing: freeingProposal([agent]) });
}

// ---------------------------------------------------------------------------------------------------------------------
// Real collectors (read-only). Every one is best-effort: a failing source yields no evidence, never fabricated evidence.
// ---------------------------------------------------------------------------------------------------------------------
function git(repo: string, args: string[]): string | null {
  const r = childProcess.spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
function collectGit(repo: string, base = "origin/main"): any {
  const worktrees = parseWorktreePorcelain(git(repo, ["worktree", "list", "--porcelain"]) || "");
  const refs = (git(repo, ["for-each-ref", "--format=%(refname:short)\t%(objectname)\t%(committerdate:iso-strict)", "refs/heads"]) || "").split("\n").filter(Boolean);
  const branches = refs.map((line) => {
    const [name, head, committedAt] = line.split("\t");
    const counts = (git(repo, ["rev-list", "--left-right", "--count", `${base}...${name}`]) || "").trim().split(/\s+/);
    const remote = (git(repo, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${name}`]) || "").trim();
    const diff = (git(repo, ["diff", "--name-only", `${base}...${name}`]) || "").split("\n").filter(Boolean);
    return { name, head, committedAt, behind: Number(counts[0]) || 0, ahead: Number(counts[1]) || 0, pushed: remote === head, writeSet: diff };
  });
  const worktreeStatus: any = {};
  for (const w of worktrees) {
    const s = git(w.path, ["status", "--porcelain"]);
    if (s === null) continue;
    const dirtyPaths = s.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ""));
    // last observable write activity: mtimes of the dirty paths and of the worktree's git index (stat only, never read)
    const gitDir = (git(w.path, ["rev-parse", "--absolute-git-dir"]) || "").trim();
    const stamps = [...dirtyPaths.map((d) => path.join(w.path, d)), gitDir ? path.join(gitDir, "index") : ""].filter(Boolean).map((f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } });
    worktreeStatus[w.path] = { dirty: dirtyPaths.length, dirtyPaths, lastActivityMs: maxMs(...stamps) };
  }
  return { worktrees, branches, worktreeStatus };
}
function collectProcs(roots: string[]): any[] {
  const out: any[] = [];
  let pids: string[] = [];
  try { pids = fs.readdirSync("/proc").filter((n: string) => /^\d+$/.test(n)); } catch { return out; }
  for (const p of pids) { let cwd: string; try { cwd = fs.readlinkSync(`/proc/${p}/cwd`); } catch { continue; } if (roots.some((r) => within(cwd, r))) out.push({ pid: Number(p), cwd }); }
  return out;
}
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (e: any) { return e && e.code === "EPERM"; } }
function readTail(file: string, bytes = 65536): string | null {
  let fd: number | null = null;
  try { const st = fs.statSync(file); fd = fs.openSync(file, "r"); const len = Math.min(bytes, st.size); const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, st.size - len); return buf.toString("utf8"); } catch { return null; } finally { if (fd !== null) fs.closeSync(fd); }
}
// task-output files: /tmp/claude-<uid>/<project>/<session>/tasks/*.output — STRUCTURE only via summarizeTaskTail.
function collectTasks(tasksRoot: string, now: number, windowMs: number): any {
  const tasks: any[] = []; let older = 0, sessions = 0;
  const shells = { fresh: 0, stale: 0 };
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(tasksRoot); } catch { return { tasks, older, sessions, shells }; }
  for (const s of dirs) {
    const td = path.join(tasksRoot, s, "tasks");
    let names: string[] = [];
    try { names = fs.readdirSync(td).filter((n: string) => n.endsWith(".output")); } catch { continue; }
    sessions++;
    for (const n of names) {
      const p = path.join(td, n);
      let st: any = null; try { st = fs.statSync(p); } catch { st = null; }
      let lst: any = null; try { lst = fs.lstatSync(p); } catch { lst = null; }
      const mtimeMs = st ? st.mtimeMs : (lst ? lst.mtimeMs : null);
      // A sub-agent task output is a SYMLINK to its transcript. A regular file is a background SHELL's stdout — not an
      // agent, and arbitrary command output: it is never read, only counted (fresh/stale by mtime).
      if (lst && !lst.isSymbolicLink()) { if (mtimeMs !== null && now - mtimeMs <= DEFAULTS.staleMs) shells.fresh++; else shells.stale++; continue; }
      if (mtimeMs !== null && now - mtimeMs > windowMs) { older++; continue; }
      const tail = st ? summarizeTaskTail(readTail(p) || "") : null;
      tasks.push({ id: n.replace(/\.output$/, ""), sessionId: s, present: !!st, mtimeMs, createdMs: st ? (st.birthtimeMs || null) : null, tail });
    }
  }
  return { tasks, older, sessions, shells };
}
function collectClaims(locksDir: string): any[] {
  let names: string[] = [];
  try { names = fs.readdirSync(locksDir); } catch { return []; }
  const ids = [...new Set(names.map((n: string) => (n.match(/^(.*)\.lock\.\d+$/) || [])[1]).filter(Boolean))] as string[];
  return ids.map((id) => { const c = fleetBridge.currentClaim({ locksDir }, id); return { id, gen: c ? c.gen : null, holderPid: c && c.holder ? c.holder.pid : null, mtimeMs: c ? c.mtimeMs : null, released: !c || c.mtimeMs === 0 }; });
}

function collectEvidence(o: any): any {
  const now = num(o.now) ?? Date.now();
  const g = collectGit(o.repo, o.base || "origin/main");
  const roots = g.worktrees.filter((w: any) => path.resolve(w.path) !== path.resolve(o.repo)).map((w: any) => w.path);
  const procs = collectProcs(roots).filter((p: any) => p.pid !== process.pid);
  const t = o.tasksRoot ? collectTasks(o.tasksRoot, now, o.taskWindowMs ?? DEFAULTS.taskWindowMs) : { tasks: [], older: 0, sessions: 0, shells: { fresh: 0, stale: 0 } };
  const heartbeats = o.heartbeatDir ? readHeartbeats(o.heartbeatDir) : [];
  const claims = o.locksDir ? collectClaims(o.locksDir) : [];
  const pids = [...heartbeats.map((h: any) => h.pid), ...claims.map((c: any) => c.holderPid)].filter((x: any) => Number.isInteger(x));
  return {
    now, repoRoot: o.repo, mainBranch: "main", ...g, prs: o.prs || [], procs, alivePids: pids.filter(pidAlive), heartbeats, tasks: t.tasks, claims,
    sources: { worktrees: g.worktrees.length, branches: g.branches.length, prs: o.prs ? o.prs.length : "NOT_PROVIDED", procsInWorktrees: procs.length, heartbeats: heartbeats.length, heartbeatDir: o.heartbeatDir || null, claims: claims.length, taskSessions: t.sessions, tasksInWindow: t.tasks.length, tasksOlderThanWindow: t.older, backgroundShellOutputs: t.shells, taskContentIngested: false },
  };
}

// gh pr list --json number,headRefName,state,headRefOid,statusCheckRollup  →  [{number, headRefName, state, checks}]
function normalizePrs(raw: any[]): any[] {
  return (raw || []).map((p: any) => {
    const roll = Array.isArray(p.statusCheckRollup) ? p.statusCheckRollup : [];
    const concl = roll.map((c: any) => c.conclusion || c.state || c.status);
    const checks = !roll.length ? "UNKNOWN" : concl.some((x: string) => /FAIL|ERROR|CANCELLED|TIMED_OUT/i.test(x)) ? "FAILURE" : concl.every((x: string) => /SUCCESS|NEUTRAL|SKIPPED/i.test(x)) ? "SUCCESS" : "PENDING";
    return { number: p.number, headRefName: p.headRefName, state: p.state, headRefOid: p.headRefOid, checks };
  });
}

const AGENT_SUPERVISOR_CONTRACT = freeze({
  id: "ODG-AGENT-SUPERVISOR",
  states: STATES,
  reuses: freeze(["odg-writeset-contention (writeSetOf, pathsConflict, computeLayerContention)", "fleet-bridge (tryClaim/releaseClaim/currentClaim — the only lock)", "odg-sovereign-delegation.ALWAYS_PROTECTED", "heartbeat files as the only per-agent record"]),
  invariants: freeze([
    "classification uses observable evidence only — never a UI label; exactly one state per agent",
    "COMPLETED_WITH_RESULT requires delivery evidence (PR/commit + tests) or a recoverable final report for a report-only agent",
    "a RUNNING agent is never relaunched; only INTERRUPTED with recoverable worktree state may be",
    "duplicate of a RUNNING/AWAITING_VALIDATION work item is refused; overlapping or UNKNOWN write-sets are refused (fail-closed)",
    "assignment check+record is serialised by a fleet-bridge generation claim — never unserialised",
    "CLOSED requires an independent inspection verdict (inspector ≠ owner)",
    "task-output content is never ingested — structure only (presence, mtime, record type, stop reason, tool name)",
    "the supervisor never deletes worktrees/branches/locks — freeing is a PROPOSAL",
  ]),
});

module.exports = { STATES, HOLDING, DEDUP, PROTECTED_PREFIXES, DEFAULTS, parseWorktreePorcelain, summarizeTaskTail, correlate, classify, decideRecovery, metrics, snapshot, freeingProposal, assign, close, readHeartbeats, collectGit, collectProcs, collectTasks, collectClaims, collectEvidence, normalizePrs, pidAlive, AGENT_SUPERVISOR_CONTRACT };
export {};
