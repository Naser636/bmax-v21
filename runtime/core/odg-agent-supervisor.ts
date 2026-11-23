#!/usr/bin/env node
"use strict";
/*
 * V155 (CTO directive V15.5 step 4) — ODG NATIVE AGENT SUPERVISOR. Read-only observer + fail-closed assignment gate.
 *
 * Classifies every agent / sub-agent / agent-shaped resource from OBSERVABLE evidence ONLY (never from a UI label) into
 * exactly one of STATES. Evidence sources (each injectable, each optional): `git worktree list --porcelain`, branch-vs-
 * origin/main ahead/behind, uncommitted changes (+ their mtimes), pushed-ness, `gh pr list` JSON (injected — this module
 * never calls the network) matched by branch name AND head oid, process liveness (pid / process cwd inside a worktree),
 * heartbeat files, fleet-bridge claims, and Claude Code task-output files (STRUCTURE ONLY: presence, mtime, record type /
 * stop reason / tool NAME of the tail records — message text is never ingested, stored or treated as instructions).
 *
 * REUSE MAP (no second orchestrator / registry / lock mechanism):
 *   - odg-writeset-contention.computeLayerContention / pathsConflict → write-set conflict + protected-path checks. The
 *     shared canonical module is NOT modified: paths are canonicalised (and rejected) HERE first — absolute, '..', '\',
 *     empty and root paths are refused; comparisons use a lower-cased key (case variants fail closed).
 *   - fleet-bridge.tryClaim / releaseClaim / currentClaim → the ONE lock: a generation-numbered claim serialises every
 *     mutation (assign / renew / close); the holder is re-verified before writing (TTL overrun ⇒ abort, nothing written)
 *   - odg-sovereign-delegation.ALWAYS_PROTECTED → protected paths (plus runtime/governance and the v124 roadmap)
 *   - heartbeat files → the ONLY persisted per-agent record (declaration + liveness, renewed via renew())
 *   - odg-open-mission-recovery / mission-attempt-log / checkpoint-engine / mission-lifecycle keep mission-level state;
 *     this module supervises AGENTS (processes/worktrees/branches) and never rewrites mission status or the register
 *
 * Honesty invariants: a label is not evidence; COMPLETED_WITH_RESULT needs delivery evidence (tip-matched PR/commit +
 * tests) — a final report alone is "report recoverable", NOT a result, unless the agent DECLARED itself read-only; a
 * RUNNING agent (live pid) is never relaunched; a heartbeat-held write-set is released only by close()/supersede, never by
 * staleness; a corrupt heartbeat blocks assignment; CLOSED needs an INDEPENDENT inspection on a RE-CLASSIFIED agent with
 * a known owner; the supervisor never deletes worktrees/branches/locks — it emits a freeing PROPOSAL.
 */
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const contention = require("./odg-writeset-contention.js");
const fleetBridge = require("./fleet-bridge.js");
const sovereign = require("./odg-sovereign-delegation.js");

const STATES = Object.freeze(["RUNNING", "COMPLETED_WITH_RESULT", "COMPLETED_NO_RESULT", "BLOCKED", "INTERRUPTED", "ORPHAN", "AWAITING_VALIDATION"]);
// observed (non-heartbeat) units in these states hold their write-set
const HOLDING = Object.freeze(["RUNNING", "AWAITING_VALIDATION", "INTERRUPTED", "BLOCKED"]);
// heartbeat statuses that release the write-set / work item (everything else is non-terminal ⇒ holds + dedups)
const TERMINAL_HB = Object.freeze(["CLOSED", "SUPERSEDED"]);
const PROTECTED_PREFIXES = Object.freeze([...sovereign.ALWAYS_PROTECTED, "runtime/governance", "docs/odg/v124-consolidated-roadmap.json"]);
const DEFAULTS = Object.freeze({ ignoredScanBudget: 200000, staleMs: 15 * 60 * 1000, taskWindowMs: 72 * 3600 * 1000, mutexTtlMs: 30000, mutexId: "odg-agent-supervisor.assign" });

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function num(v: any): number | null { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : Date.parse(v); return Number.isFinite(n) ? n : null; }
function iso(ms: number | null): string | null { return ms === null ? null : new Date(ms).toISOString(); }
function maxMs(...xs: (number | null)[]): number | null { const v = xs.filter((x) => x !== null) as number[]; return v.length ? Math.max(...v) : null; }
function within(child: string, parent: string): boolean { if (!child || !parent) return false; const c = path.resolve(child), p = path.resolve(parent); return c === p || c.startsWith(p + path.sep); }

// ---------------------------------------------------------------------------------------------------------------------
// Path canonicalisation (fail-closed, done HERE — the shared contention module is not modified)
// ---------------------------------------------------------------------------------------------------------------------
/** canonPath(p) → { ok, path, key } | { ok:false, reason }. Repo-relative only: absolute / '~' / drive / '\' / NUL / '..'
 *  / empty / repo-root paths are REFUSED. './' and duplicate/trailing slashes are collapsed. key = lower-cased path, so
 *  case variants (Runtime/Governance vs runtime/governance) compare equal — on a case-insensitive FS they ARE equal. */
function canonPath(p: any): any {
  if (typeof p !== "string") return { ok: false, reason: "NOT_A_STRING" };
  const s = p.trim();
  if (s === "") return { ok: false, reason: "EMPTY" };
  if (s.includes("\\") || s.includes("\0")) return { ok: false, reason: "BACKSLASH_OR_NUL" };
  if (s.startsWith("/") || s.startsWith("~") || /^[A-Za-z]:/.test(s)) return { ok: false, reason: "ABSOLUTE" };
  const segs = s.split("/").filter((x) => x !== "" && x !== ".");
  if (segs.some((x) => x === "..")) return { ok: false, reason: "DOTDOT" };
  if (!segs.length) return { ok: false, reason: "REPO_ROOT" };
  const c = segs.join("/");
  return { ok: true, path: c, key: c.toLowerCase() };
}
function canonList(list: any): any {
  if (!Array.isArray(list) || !list.length) return { ok: false, reason: "EMPTY_OR_NOT_ARRAY", bad: [] };
  const bad: any[] = [], paths: string[] = [], keys: string[] = [];
  for (const p of list) { const c = canonPath(p); if (!c.ok) bad.push({ path: String(p), reason: c.reason }); else if (!keys.includes(c.key)) { paths.push(c.path); keys.push(c.key); } }
  return bad.length ? { ok: false, reason: "INVALID_PATHS", bad } : { ok: true, paths, keys };
}
/** ONE write-set per request. writeSet / authorizedPaths / paths may each be given, but if more than one is present they
 *  must canonicalise to the SAME key set — otherwise the request is ambiguous and refused (validate == record). */
function resolveRequestWriteSet(req: any): any {
  const fields = ["writeSet", "authorizedPaths", "paths"].filter((f) => req && req[f] !== undefined && req[f] !== null);
  if (req && req.readOnly === true) return fields.length ? { ok: false, outcome: "REFUSED_AMBIGUOUS_WRITESET", reason: "readOnly AND a write-set declared" } : { ok: true, readOnly: true, paths: [], keys: [] };
  if (!fields.length) return { ok: false, outcome: "REFUSED_UNKNOWN_WRITESET", reason: "write-set must be declared (or readOnly) — fail-closed" };
  const lists = fields.map((f) => canonList(req[f]));
  const badIdx = lists.findIndex((l: any) => !l.ok);
  if (badIdx >= 0) return { ok: false, outcome: "REFUSED_INVALID_PATH", field: fields[badIdx], bad: lists[badIdx].bad, reason: "absolute / '..' / '\\' / empty / repo-root paths are refused" };
  const sig = (l: any) => l.keys.slice().sort().join("\n");
  if (lists.some((l: any) => sig(l) !== sig(lists[0]))) return { ok: false, outcome: "REFUSED_AMBIGUOUS_WRITESET", fields, reason: "write-set fields disagree — one write-set is validated AND recorded" };
  return { ok: true, readOnly: false, paths: lists[0].paths, keys: lists[0].keys };
}
function protectedHits(keys: string[]): string[] {
  const prot = PROTECTED_PREFIXES.map((p: string) => p.toLowerCase());
  return keys.filter((k) => prot.some((q: string) => contention.pathsConflict(k, q)));
}
// holder write-set keys for contention: an invalid recorded path becomes "" (repo root ⇒ conflicts with everything)
function holderKeys(ws: any): string[] | null {
  if (!Array.isArray(ws) || !ws.length) return null;
  return ws.map((p: any) => { const c = canonPath(p); return c.ok ? c.key : ""; });
}

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
 *        worktreeStatus{path: {dirty, dirtyPaths[], lastActivityMs}}, prs[{number, headRefName, headRefOid, state, checks}],
 *        integratedOids[], procs[{pid, cwd}], alivePids[], heartbeats[{...declaration, mtimeMs} | {corrupt, file}],
 *        tasks[{id, sessionId, mtimeMs, createdMs, present, tail}], claims[{id, gen, holderPid, mtimeMs, released}] }
 */
/*
 * Recovery handle for a supervised child with NO worktree (e.g. a wave child): the heartbeat declares
 * recovery: { kind: "MISSION_RERUN", missionId } — the mission is re-runnable through the governed tick. Usable ONLY if:
 *   - missionId equals the heartbeat's workItem (ids compared case-insensitively, everywhere);
 *   - the heartbeat recorded a pid, and that pid is NOT alive (a killed child, not one that never reported a pid);
 *   - no final report is recorded;
 *   - completion evidence WITH PROVENANCE was checked: ev.completionEvidence = { source: "mission-ledger" | "report",
 *     checkedAt (ISO, not earlier than the heartbeat's last time), ids: string[] } and its ids do not include the mission.
 * An empty or bare list is NOT evidence of a check (fail-closed: never re-run a mission that may already have completed).
 */
const COMPLETION_SOURCES = Object.freeze(["mission-ledger", "report"]);
function idKey(x: any): string { return String(x).trim().toLowerCase(); }
function recoveryHandleOf(hb: any, ev: any, pidAliveNow: boolean, hbAt: number | null): any {
  const r = hb && hb.recovery;
  if (!r || typeof r !== "object") return null;
  const kind = r.kind === "MISSION_RERUN" ? r.kind : null;
  const missionId = typeof r.missionId === "string" && r.missionId.trim() ? r.missionId.trim() : null;
  const no = (reason: string) => ({ kind: kind || String(r.kind || "?"), missionId, recoverable: false, reason });
  if (!kind || !missionId) return no("unsupported kind or missing missionId");
  if (typeof hb.workItem !== "string" || idKey(hb.workItem) !== idKey(missionId)) return no("missionId does not match the heartbeat workItem");
  if (!Number.isInteger(hb.pid)) return no("no pid recorded — cannot prove the child was killed");
  if (pidAliveNow) return no("recorded pid is alive");
  if (hb.finalReport === true) return no("final report recorded — completed, not interrupted");
  const ce = ev.completionEvidence;
  const checkedAt = ce ? num(ce.checkedAt) : null;
  if (!ce || typeof ce !== "object" || !COMPLETION_SOURCES.includes(ce.source) || checkedAt === null || !Array.isArray(ce.ids) || !ce.ids.every((x: any) => typeof x === "string")) return no("completion evidence (with provenance: source, checkedAt, ids) not provided");
  if (hbAt !== null && checkedAt < hbAt) return no("completion evidence predates the child's last heartbeat");
  if (ce.ids.some((x: string) => idKey(x) === idKey(missionId))) return no(`${ce.source} shows the mission completed`);
  return { kind, missionId, recoverable: true, reason: null, evidence: { source: ce.source, checkedAt: iso(checkedAt) } };
}

function correlate(ev: any, opts: any = {}): any[] {
  const now = num(ev.now) ?? Date.now();
  const staleMs = opts.staleMs ?? DEFAULTS.staleMs;
  const mainBranch = ev.mainBranch || "main";
  const repoRoot = ev.repoRoot ? path.resolve(ev.repoRoot) : null;
  const branches = new Map<string, any>((ev.branches || []).map((b: any) => [b.name, b]));
  const integratedOids = new Set<string>(ev.integratedOids || []);
  const prsByBranch = new Map<string, any[]>();
  for (const p of ev.prs || []) { const k = p.headRefName; if (!prsByBranch.has(k)) prsByBranch.set(k, []); prsByBranch.get(k)!.push(p); }
  const alive = new Set<number>((ev.alivePids || []).map(Number));
  const isMain = (p: string) => !!repoRoot && path.resolve(p) === repoRoot;
  const wts = (ev.worktrees || []).filter((w: any) => !isMain(w.path));
  const units: any[] = [];
  const ownedWorktrees = new Set<string>(), ownedBranches = new Set<string>();

  // a cwd inside a linked worktree ⇒ that worktree; inside the MAIN checkout ⇒ the main checkout (write-intent, not report-only)
  const resourceFor = (wtPath: string | null, branch: string | null) => {
    const wt = wtPath ? wts.find((w: any) => within(wtPath, w.path)) : (branch ? wts.find((w: any) => w.branch === branch) : null);
    const mainCheckout = !wt && !!wtPath && !!repoRoot && within(wtPath, repoRoot);
    const br = branch || (wt && wt.branch) || null;
    return { wt: wt || null, mainCheckout, branch: br && br !== mainBranch ? br : null };
  };
  const procAliveIn = (wt: any) => !!wt && (ev.procs || []).some((p: any) => within(p.cwd, wt.path));
  // activity UNKNOWN (ignored-file scan truncated / unreadable / git failed) counts as fresh — fail-closed.
  const activityFresh = (wt: any) => { const st = wt && ev.worktreeStatus ? ev.worktreeStatus[wt.path] : null; if (!st) return false; if (st.activityUnknown === true) return true; const a = st.lastActivityMs; return a !== null && a !== undefined && now - a <= staleMs; };

  // 1) heartbeat-declared agents (the supervisor's own assignments). Corrupt ⇒ a BLOCKED unit holding EVERYTHING.
  for (const hb of ev.heartbeats || []) {
    if (hb.corrupt) {
      units.push({ id: "heartbeat-corrupt:" + hb.file, kind: "HEARTBEAT_CORRUPT", parent_id: null, child_ids: [], mission: null, owner: null, worktree: null, branch: null, write_set: null, readOnly: false, created_at: null, last_progress_at: num(hb.mtimeMs), heartbeat: num(hb.mtimeMs), deadline: null, relaunchOf: null,
        e: { corrupt: true, hasOwner: false } });
      continue;
    }
    if (TERMINAL_HB.includes(hb.status)) continue;
    const r = resourceFor(hb.worktree || null, hb.branch || null);
    if (r.wt) ownedWorktrees.add(r.wt.path); if (r.branch) ownedBranches.add(r.branch);
    const hbAt = maxMs(num(hb.heartbeatAt), num(hb.mtimeMs));
    units.push({
      id: String(hb.id), kind: "HEARTBEAT_AGENT", parent_id: hb.parentId ?? null, child_ids: [], mission: hb.workItem ?? null, owner: hb.owner ?? null,
      worktree: r.wt ? r.wt.path : (hb.worktree ?? null), branch: r.branch, write_set: Array.isArray(hb.writeSet) ? hb.writeSet : null, readOnly: hb.readOnly === true, mainCheckout: r.mainCheckout,
      created_at: num(hb.createdAt), last_progress_at: num(hb.progressAt) ?? hbAt, heartbeat: hbAt, deadline: num(hb.deadline), relaunchOf: hb.relaunchOf ?? null,
      e: { pidAlive: hb.pid !== undefined && hb.pid !== null && alive.has(Number(hb.pid)), procInWorktree: procAliveIn(r.wt), heartbeatFresh: hbAt !== null && now - hbAt <= staleMs, declared: hb.status ?? null, declaredReason: hb.reason ?? null, testEvidence: hb.testEvidence ?? null, finalReport: hb.finalReport === true, hasOwner: true,
        recovery: recoveryHandleOf(hb, ev, hb.pid !== undefined && hb.pid !== null && alive.has(Number(hb.pid)), hbAt) },
    });
  }
  // 2) Claude Code task-output agents (structure only)
  for (const t of ev.tasks || []) {
    const tail = t.tail || {};
    const r = resourceFor(tail.cwd || null, tail.gitBranch || null);
    const fresh = t.present && t.mtimeMs !== null && now - t.mtimeMs <= staleMs;
    units.push({
      id: "task:" + t.id, kind: "CLAUDE_TASK", parent_id: "session:" + (t.sessionId || tail.sessionId || "?"), child_ids: [], mission: null, owner: "claude-code-subagent:" + t.id,
      worktree: r.wt ? r.wt.path : (r.mainCheckout ? repoRoot : null), branch: r.branch, write_set: null, readOnly: false, mainCheckout: r.mainCheckout, cwdKnown: !!tail.cwd,
      created_at: t.createdMs ?? null, last_progress_at: maxMs(tail.lastRecordAt ?? null, t.present ? t.mtimeMs : null), heartbeat: t.present ? t.mtimeMs : null, deadline: null, relaunchOf: null,
      e: { pidAlive: false, procInWorktree: false, heartbeatFresh: fresh && !tail.finalReport, declared: null, declaredReason: null, testEvidence: null, finalReport: !!tail.finalReport, present: !!t.present, hasOwner: true },
    });
  }
  // the most recent task per LINKED worktree owns it (older tasks keep their own evidence but do not own the resource)
  const latestByWt = new Map<string, any>();
  for (const u of units) if (u.kind === "CLAUDE_TASK" && u.worktree && !u.mainCheckout) { const cur = latestByWt.get(u.worktree); if (!cur || (u.last_progress_at ?? 0) > (cur.last_progress_at ?? 0)) latestByWt.set(u.worktree, u); }
  for (const u of units) if (u.kind === "CLAUDE_TASK" && u.worktree && !u.mainCheckout) {
    if (latestByWt.get(u.worktree) === u) { ownedWorktrees.add(u.worktree); if (u.branch) ownedBranches.add(u.branch); u.e.procInWorktree = procAliveIn(wts.find((w: any) => w.path === u.worktree)); }
    else { u.ownsResource = false; }
  }
  // 3a) the MAIN checkout is observed like any worktree: production ticks write its gitignored runtime/generated. It is
  // a unit when a live process sits in it (outside linked worktrees), its index / dirty / ignored files changed within
  // staleMs, activity is UNKNOWN (scan incomplete), or it has uncommitted paths. RUNNING ⇒ UNKNOWN write-set (blocks).
  const mainWt = repoRoot ? (ev.worktrees || []).find((w: any) => isMain(w.path)) : null;
  if (mainWt) {
    const ms = ev.worktreeStatus ? ev.worktreeStatus[mainWt.path] : null;
    const procIn = (ev.procs || []).some((p: any) => within(p.cwd, mainWt.path) && !wts.some((w: any) => within(p.cwd, w.path)));
    const act = activityFresh(mainWt);
    if (procIn || act || (ms && ms.dirty > 0)) {
      units.push({ id: "main-checkout:" + mainWt.path, kind: "MAIN_CHECKOUT", parent_id: null, child_ids: [], mission: null, owner: null, worktree: mainWt.path, branch: null, write_set: null, readOnly: false, mainCheckout: true, created_at: null, last_progress_at: ms ? num(ms.lastActivityMs) : null, heartbeat: null, deadline: null, relaunchOf: null,
        e: { pidAlive: false, procInWorktree: procIn, heartbeatFresh: false, recentActivity: act, declared: null, finalReport: false, hasOwner: false } });
    }
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
  // attach resource evidence + parent/child links. A PR is matched by branch name; it is TRUSTED as delivery evidence
  // only if its head oid == the local branch tip, or (branch gone locally) its head oid is integrated into origin/main.
  for (const u of units) {
    const b = u.branch ? branches.get(u.branch) : null;
    const st = u.worktree && ev.worktreeStatus ? ev.worktreeStatus[u.worktree] : null;
    const prs = (u.branch ? (prsByBranch.get(u.branch) || []) : []).map((p: any) => {
      const tipMatch = b && b.head && p.headRefOid ? b.head === p.headRefOid : null;
      const integrated = p.state === "MERGED" && ((!!p.headRefOid && integratedOids.has(p.headRefOid)) || (!!p.mergeCommitOid && integratedOids.has(p.mergeCommitOid)));
      // local branch exists but the PR carries no head oid ⇒ the tip cannot be compared: trusted only if the branch has
      // NOT moved past origin/main (ahead === 0) and the PR is integrated; a moved branch is never trusted.
      const trusted = tipMatch === true || (tipMatch === null && integrated && (!b || (!p.headRefOid && b.ahead === 0)));
      return { number: p.number, state: p.state, checks: p.checks || "UNKNOWN", headRefOid: p.headRefOid || null, tipMatch, trusted };
    });
    u.r = { worktreeExists: !!(u.worktree && (wts.some((w: any) => w.path === u.worktree) || (u.mainCheckout && isMain(u.worktree)))), dirty: st ? st.dirty : 0, dirtyPaths: st && Array.isArray(st.dirtyPaths) ? st.dirtyPaths.slice() : [], ahead: b ? b.ahead : (st && Number.isInteger(st.headAhead) ? st.headAhead : null), behind: b ? b.behind : null, pushed: b ? !!b.pushed : false, integrated: b ? b.ahead === 0 : (st && Number.isInteger(st.headAhead) ? st.headAhead === 0 : null), prs };
    if (!b && !u.write_set && st && Array.isArray(st.headDiff) && st.headDiff.length) { u.write_set = st.headDiff.slice(); u.writeSetSource = "OBSERVED_DIFF"; }
    // git observation failed (rev-list / diff error) ⇒ the write-set is UNKNOWN, never "integrated / holds nothing"
    u.r.observeFailed = (b && b.observeOk === false) || (!b && st && st.headObserveOk === false) || false;
    if (u.r.observeFailed) { u.r.integrated = null; u.writeSetSource = "UNKNOWN"; }
    if (!u.write_set && b && Array.isArray(b.writeSet) && b.writeSet.length) { u.write_set = b.writeSet.slice(); u.writeSetSource = "OBSERVED_DIFF"; }
    else u.writeSetSource = u.write_set ? "DECLARED" : "UNKNOWN";
    if (st && Array.isArray(st.dirtyPaths) && st.dirtyPaths.length) { u.write_set = [...new Set([...(u.write_set || []), ...st.dirtyPaths])]; if (u.writeSetSource === "UNKNOWN") u.writeSetSource = "OBSERVED_DIRTY"; }
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
  return u.r.prs.some((p: any) => p.trusted && p.checks === "SUCCESS");
}

function classify(u: any, now: number): any {
  const reasons: string[] = [];
  if (u.e.corrupt) {
    return freeze({ id: u.id, kind: u.kind, state: "BLOCKED", reasons: freeze(["heartbeat file unreadable/invalid — its write-set is UNKNOWN and blocks every assignment (fail-closed)"]), parent_id: null, child_ids: freeze([]), mission: null, owner: null, worktree: null, branch: null, mainCheckout: false, write_set: null, writeSetSource: "UNKNOWN", readOnly: false,
      created_at: null, last_progress_at: iso(u.last_progress_at), heartbeat: iso(u.heartbeat), deadline: null, relaunchOf: null, timedOut: false, action: "REPAIR_HEARTBEAT", recoverable: false,
      delivery: freeze({ ahead: null, dirty: 0, pushed: false, integrated: null, prs: freeze([]) }), quality: freeze({ hasFinalReport: false, hasPR: false, hasTestsEvidence: false, hasCommits: false, resultKind: "NONE" }) });
  }
  const openPr = u.r.prs.find((p: any) => p.state === "OPEN");
  const mergedPr = u.r.prs.find((p: any) => p.state === "MERGED" && p.trusted);
  const staleMerged = u.r.prs.find((p: any) => p.state === "MERGED" && p.tipMatch === false);
  const live = u.e.pidAlive || u.e.procInWorktree || u.e.heartbeatFresh || u.e.recentActivity === true;
  const partialWork = u.r.worktreeExists && ((u.r.dirty || 0) > 0 || (u.r.ahead || 0) > 0);
  const delivered = !!mergedPr || (u.r.pushed && (u.r.ahead || 0) > 0);
  const tests = testsEvidenceOf(u);
  const declaredReadOnly = u.kind === "HEARTBEAT_AGENT" && u.readOnly === true;
  let state: string;
  let resultKind = "NONE";

  if (u.e.isClaim) {
    state = u.e.pidAlive ? "RUNNING" : "ORPHAN"; reasons.push(u.e.pidAlive ? "claim holder pid alive" : "unreleased claim, holder pid not alive");
  } else if (u.e.declared === "CANCELLED" && !u.e.pidAlive && !u.e.procInWorktree) {
    // CANCELLED is final once its recorded pid is dead (or immediately when no pid was recorded) — a renew() that
    // recorded the cancellation refreshed the heartbeat, but freshness must not keep a cancelled agent RUNNING.
    state = "COMPLETED_NO_RESULT"; reasons.push("cancelled (recorded pid not alive or none recorded, and no live process in its worktree)");
  } else if (live) {
    state = "RUNNING";
    if (u.e.pidAlive) reasons.push("pid alive"); if (u.e.procInWorktree) reasons.push("live process cwd inside worktree"); if (u.e.heartbeatFresh) reasons.push("fresh heartbeat/output without final record"); if (u.e.recentActivity) reasons.push("recent write activity in worktree (dirty-path / index mtime within staleMs)");
  } else if (openPr) {
    state = "AWAITING_VALIDATION"; reasons.push(`PR #${openPr.number} OPEN (checks=${openPr.checks}${openPr.tipMatch === false ? ", local tip differs from PR head" : ""})`);
  } else if (u.e.declared === "BLOCKED") {
    state = "BLOCKED"; reasons.push("declared BLOCKED: " + (u.e.declaredReason || "no reason given"));
  } else if (u.e.declared === "CANCELLED") {
    state = "COMPLETED_NO_RESULT"; reasons.push("cancelled");
  } else if (u.ownsResource !== false && delivered && tests) {
    state = "COMPLETED_WITH_RESULT"; resultKind = mergedPr ? "INTEGRATED" : "DELIVERED";
    reasons.push(mergedPr ? `PR #${mergedPr.number} MERGED (head oid verified) with passing checks` : "pushed commits with test evidence");
  } else if (declaredReadOnly && u.e.finalReport && !partialWork) {
    state = "COMPLETED_WITH_RESULT"; resultKind = "REPORT_ONLY"; reasons.push("declared read-only agent; final report recoverable; no writes observed");
  } else if (u.kind === "CLAUDE_TASK" && !u.e.present) {
    state = "COMPLETED_NO_RESULT"; reasons.push("task output dangling (transcript gone) — no result recoverable; how it ended is NOT_MEASURED");
  } else if (u.e.hasOwner && !u.e.finalReport) {
    state = "INTERRUPTED"; reasons.push(u.kind === "CLAUDE_TASK" ? "stale output, last record is not a final report" : "stale heartbeat, process not alive");
  } else if (u.e.hasOwner) {
    state = "COMPLETED_NO_RESULT"; resultKind = u.e.finalReport ? "REPORT_RECOVERABLE" : "NONE";
    reasons.push(delivered ? "delivery without test evidence" : u.mainCheckout ? "final report recoverable, but the task ran in the MAIN checkout — no attributable delivery (report ≠ integrated result)" : "final report recoverable, but no delivery evidence (report ≠ integrated result)");
    if (staleMerged) reasons.push(`PR #${staleMerged.number} merged but branch tip moved on (new commits after merge)`);
  } else if (mergedPr && tests) {
    state = "COMPLETED_WITH_RESULT"; resultKind = "INTEGRATED"; reasons.push(`no owner, PR #${mergedPr.number} MERGED (head oid verified) with passing checks`);
  } else {
    state = "ORPHAN"; reasons.push(u.r.integrated && !(u.r.dirty > 0) ? "no owning agent; nothing unintegrated" : `no owning agent; ${u.r.ahead ?? "?"} unintegrated commit(s), ${u.r.dirty || 0} dirty path(s)`);
    if (staleMerged) reasons.push(`PR #${staleMerged.number} merged but branch tip moved on (new commits after merge)`);
  }
  const timedOut = u.deadline !== null && now > u.deadline && (state === "RUNNING" || state === "INTERRUPTED");
  const handle = u.e.recovery || null;
  const recoverable = state === "INTERRUPTED" && ((partialWork && !u.mainCheckout) || !!(handle && handle.recoverable));
  if (state === "INTERRUPTED" && handle) reasons.push(handle.recoverable ? `recovery handle ${handle.kind}:${handle.missionId} — no completion evidence, re-runnable through the governed tick` : `recovery handle present but not usable: ${handle.reason}`);
  return freeze({
    id: u.id, kind: u.kind, state, reasons: freeze(reasons), parent_id: u.parent_id, child_ids: freeze(u.child_ids.slice()), mission: u.mission, owner: u.owner,
    worktree: u.worktree, branch: u.branch, mainCheckout: !!u.mainCheckout, write_set: u.write_set ? freeze(u.write_set.slice()) : null, writeSetSource: u.writeSetSource, observeFailed: !!u.r.observeFailed, readOnly: u.readOnly, dirty_paths: freeze(u.r.dirtyPaths.slice()),
    created_at: iso(u.created_at), last_progress_at: iso(u.last_progress_at), heartbeat: iso(u.heartbeat), deadline: iso(u.deadline), relaunchOf: u.relaunchOf,
    timedOut, action: timedOut && state === "RUNNING" ? "CANCEL_PROPOSED" : null,
    recoverable, recoveryHandle: handle ? freeze({ kind: handle.kind, missionId: handle.missionId, recoverable: handle.recoverable, reason: handle.reason }) : null, delivery: freeze({ ahead: u.r.ahead, dirty: u.r.dirty, pushed: u.r.pushed, integrated: u.r.integrated, prs: freeze(u.r.prs.map((p: any) => freeze({ number: p.number, state: p.state, checks: p.checks, tipMatch: p.tipMatch, trusted: p.trusted }))) }),
    quality: freeze({ hasFinalReport: !!u.e.finalReport, hasPR: u.r.prs.length > 0, hasTestsEvidence: tests, hasCommits: (u.r.ahead || 0) > 0 || !!mergedPr, resultKind }),
  });
}

function decideRecovery(a: any): any {
  if (a.state === "RUNNING") return freeze({ decision: "REFUSE", reason: "RUNNING — never relaunch a live agent" + (a.timedOut ? " (timed out ⇒ CANCEL_PROPOSED, owner decides)" : "") });
  if (a.state !== "INTERRUPTED") return freeze({ decision: "NONE", reason: `state ${a.state} is not INTERRUPTED` });
  if (!a.recoverable) return freeze({ decision: "NOT_RECOVERABLE", reason: a.recoveryHandle ? "INTERRUPTED; recovery handle not usable: " + a.recoveryHandle.reason : a.mainCheckout ? "INTERRUPTED in the MAIN checkout — partial work is not isolated, not auto-recoverable" : "INTERRUPTED without recoverable worktree state (no dirty paths / no commits ahead)" });
  if (a.recoveryHandle && a.recoveryHandle.recoverable && !(a.worktree && (a.delivery.dirty > 0 || (a.delivery.ahead || 0) > 0))) return freeze({ decision: "RELAUNCH", reason: "INTERRUPTED, no completion evidence — re-run the declared mission through the governed tick", via: a.recoveryHandle.kind, missionId: a.recoveryHandle.missionId });
  return freeze({ decision: "RELAUNCH", reason: "INTERRUPTED with partial work in worktree — resume from it", worktree: a.worktree, branch: a.branch });
}

function metrics(agents: any[], now: number): any {
  const completed = agents.filter((a) => a.state === "COMPLETED_WITH_RESULT" || a.state === "COMPLETED_NO_RESULT");
  const lat = completed.map((a) => (a.created_at && a.last_progress_at ? Date.parse(a.last_progress_at) - Date.parse(a.created_at) : null)).filter((x) => x !== null && x >= 0) as number[];
  lat.sort((x, y) => x - y);
  const relaunches = agents.filter((a) => a.relaunchOf);
  const useless = relaunches.filter((a) => a.state === "COMPLETED_NO_RESULT" || (a.state === "INTERRUPTED" && !a.recoverable));
  const byState: any = {}; for (const s of STATES) byState[s] = 0; for (const a of agents) byState[a.state]++;
  const byResultKind: any = {}; for (const a of agents) byResultKind[a.quality.resultKind] = (byResultKind[a.quality.resultKind] || 0) + 1;
  const withWrite = agents.filter((a) => a.branch);
  return freeze({
    byState: freeze(byState), byResultKind: freeze(byResultKind), total: agents.length,
    reportQuality: freeze({ withFinalReport: agents.filter((a) => a.quality.hasFinalReport).length, withPR: agents.filter((a) => a.quality.hasPR).length, withTestsEvidence: agents.filter((a) => a.quality.hasTestsEvidence).length, completedWithResult: byState.COMPLETED_WITH_RESULT, note: "a recoverable final report is NOT a result: COMPLETED_WITH_RESULT = tip-verified delivery + tests (INTEGRATED/DELIVERED) or a DECLARED read-only agent's report (REPORT_ONLY)" }),
    latencyMs: lat.length ? freeze({ n: lat.length, median: lat[Math.floor(lat.length / 2)], max: lat[lat.length - 1] }) : "NOT_MEASURED",
    uselessRelaunches: relaunches.length ? freeze({ relaunches: relaunches.length, useless: useless.length }) : "NOT_MEASURED (no relaunch records)",
    integratedIntoMain: freeze({ branchesObserved: withWrite.length, integrated: withWrite.filter((a) => a.delivery.integrated === true).length, verifiedMergedPRs: agents.filter((a) => a.delivery.prs.some((p: any) => p.state === "MERGED" && p.trusted)).length }),
    measuredAt: iso(now),
  });
}

// does an observed (non-heartbeat) unit hold its FULL write-set? HOLDING states, plus an ORPHAN with unintegrated work
// (commits ahead OR uncommitted paths — fail-closed: unowned dirty work is never overwritable).
function holdsFull(a: any): boolean {
  if (a.kind === "HEARTBEAT_CORRUPT") return true;
  // UNOWNED worktree/branch: writes to gitignored paths are invisible to git diff/status. Rule (fail-closed but usable):
  // while it is RUNNING — a live process inside it, or index / dirty / GITIGNORED-file mtime within staleMs — it holds
  // UNKNOWN ⇒ blocks EVERY assignment, whatever diff it also shows (see contentionRecord); once idle beyond staleMs with
  // no live process, one with no observed write-set holds NOTHING (a dead process can no longer write; no tracked work).
  // LIMIT (documented): a writer that pauses longer than staleMs and has no live process inside the worktree is invisible
  // during that pause; any live process or fresh mtime makes it RUNNING again (and blocking).
  if (a.observeFailed) return true;
  if ((a.kind === "WORKTREE" || a.kind === "BRANCH") && !(a.write_set && a.write_set.length) && a.state !== "RUNNING") return false;
  if (HOLDING.includes(a.state)) return true;
  return a.state === "ORPHAN" && !(a.delivery.integrated === true && (a.delivery.dirty || 0) === 0);
}
// ANY observed unit with uncommitted paths (whatever its state — e.g. a stale COMPLETED_NO_RESULT main-checkout task)
// holds at least those dirty paths, so a new assignment can never overwrite unowned uncommitted work.
function observedHolds(a: any): boolean {
  if (a.kind === "CLAIM" || a.kind === "HEARTBEAT_AGENT") return false;
  return holdsFull(a) || (a.delivery.dirty || 0) > 0;
}
function contentionRecord(a: any): any {
  // an OBSERVED (non-heartbeat) unit that is RUNNING may be writing gitignored paths (runtime/generated, …) that no git
  // diff can show ⇒ its write-set is UNKNOWN and blocks every assignment, whatever diff it also has (fail-closed).
  if (a.kind !== "HEARTBEAT_AGENT" && a.kind !== "HEARTBEAT_CORRUPT" && (a.state === "RUNNING" || a.observeFailed)) return { id: a.id, authorizedPaths: undefined, readOnly: false };
  const dirtyOnly = a.kind !== "HEARTBEAT_AGENT" && !holdsFull(a) && (a.delivery.dirty || 0) > 0;
  const ws = dirtyOnly ? (a.dirty_paths && a.dirty_paths.length ? a.dirty_paths : null) : a.write_set;
  return { id: a.id, authorizedPaths: holderKeys(ws) || undefined, readOnly: !dirtyOnly && a.readOnly === true };
}

// write-set conflicts among agents that currently hold their write-set (reuses computeLayerContention, fail-closed UNKNOWN)
function holdingContention(agents: any[]): any {
  const holders = agents.filter((a) => (a.kind === "HEARTBEAT_AGENT" || observedHolds(a)) && (a.worktree || a.branch || a.write_set || a.kind === "HEARTBEAT_CORRUPT"));
  const r = contention.computeLayerContention([holders.map((a) => a.id)], holders.map(contentionRecord));
  return freeze({ holders: holders.length, contentions: r.ok ? r.layers[0].contentions : [], note: "UNKNOWN write-set conflicts with everything (fail-closed); keys are canonical lower-cased paths" });
}

function snapshot(ev: any, opts: any = {}): any {
  const now = num(ev.now) ?? Date.now();
  const agents = correlate(ev, opts).map((u) => classify(u, now)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const recovery = agents.filter((a) => a.state === "INTERRUPTED" || a.state === "RUNNING").map((a) => ({ id: a.id, ...decideRecovery(a) }));
  const sessions: any = {};
  for (const a of agents) if (a.parent_id && a.parent_id.startsWith("session:")) { const s = (sessions[a.parent_id] = sessions[a.parent_id] || { id: a.parent_id, child_ids: [], byState: {} }); s.child_ids.push(a.id); s.byState[a.state] = (s.byState[a.state] || 0) + 1; }
  return freeze({ schema: "ODG_AGENT_SUPERVISOR_SNAPSHOT", version: 2, at: iso(now), states: STATES, agents: freeze(agents), sessions: freeze(Object.values(sessions)), metrics: metrics(agents, now), contention: holdingContention(agents), recovery: freeze(recovery), freeing: freeingProposal(agents), sources: ev.sources || null });
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
    if (a.worktree && a.kind !== "CLAUDE_TASK" && !a.mainCheckout) out.push({ kind: "worktree", path: a.worktree, safe, proposal: safe ? `git worktree remove ${a.worktree}` : "REVIEW FIRST — unintegrated or uncommitted work" });
    if (a.branch && a.kind !== "CLAUDE_TASK") out.push({ kind: "branch", name: a.branch, safe, proposal: safe ? `git branch -d ${a.branch}` : "REVIEW FIRST — branch has commits not in origin/main" });
  }
  return freeze({ executed: false, note: "PROPOSAL ONLY — the supervisor never deletes worktrees, branches or locks", items: freeze(out) });
}

// ---------------------------------------------------------------------------------------------------------------------
// Heartbeat files + the fleet-bridge mutex
// ---------------------------------------------------------------------------------------------------------------------
// A heartbeat that cannot be parsed, or whose id / write-set is invalid, is returned as { corrupt } — NEVER dropped.
function readHeartbeats(dir: string): any[] {
  let names: string[] = [];
  try { names = fs.readdirSync(dir).filter((n: string) => n.endsWith(".json")); } catch { return []; }
  const out: any[] = [];
  for (const n of names) {
    const p = path.join(dir, n);
    let mtimeMs: number | null = null; try { mtimeMs = fs.statSync(p).mtimeMs; } catch { mtimeMs = null; }
    try {
      const o = JSON.parse(fs.readFileSync(p, "utf8"));
      const hasWs = o && o.writeSet !== undefined && o.writeSet !== null && !(Array.isArray(o.writeSet) && o.writeSet.length === 0);
      const wsOk = o && (o.readOnly === true ? !hasWs : (Array.isArray(o.writeSet) && canonList(o.writeSet).ok));
      if (!o || typeof o !== "object" || typeof o.id !== "string" || !o.id || !wsOk) { out.push({ corrupt: true, file: n, mtimeMs, reason: o && o.readOnly === true && hasWs ? "readOnly with a non-empty write-set" : "invalid id or write-set" }); continue; }
      if (safeId(o.id) + ".json" !== n) { out.push({ corrupt: true, file: n, mtimeMs, reason: "filename does not match heartbeat id" }); continue; }
      o.mtimeMs = mtimeMs; out.push(o);
    } catch { out.push({ corrupt: true, file: n, mtimeMs, reason: "unparseable" }); }
  }
  return out;
}
function writeJsonAtomic(p: string, obj: any): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, p);
}
function safeId(id: string): string { return String(id).replace(/[^A-Za-z0-9._-]/g, "_"); }

// run fn() while holding the supervisor's fleet-bridge claim. fn gets stillHeld(): false once the TTL budget (half the
// claim TTL) is spent or the claim generation is no longer ours — the caller must then abort WITHOUT writing.
function withMutex(ctx: any, fn: (stillHeld: () => boolean) => any): any {
  const ttl = ctx.mutexTtlMs ?? DEFAULTS.mutexTtlMs;
  const cfg = { locksDir: ctx.locksDir, lockTtlMs: ttl };
  if (!ctx.locksDir) return freeze({ outcome: "REFUSED_NO_LOCKS_DIR", reason: "a locksDir is required — mutations are never unserialised" });
  if (!fleetBridge.tryClaim(cfg, DEFAULTS.mutexId)) return freeze({ outcome: "REFUSED_BUSY", reason: "another mutation holds the supervisor claim — retry; never proceed unserialised" });
  const clock = ctx.clock || (() => Date.now());
  const start = clock();
  const stillHeld = () => {
    if (clock() - start > ttl / 2) return false;
    const c = fleetBridge.currentClaim(cfg, DEFAULTS.mutexId);
    return !!(c && c.holder && c.holder.pid === process.pid && c.mtimeMs !== 0);
  };
  try { return fn(stillHeld); } finally { fleetBridge.releaseClaim(cfg, DEFAULTS.mutexId); }
}
const MUTEX_EXPIRED = freeze({ outcome: "REFUSED_MUTEX_EXPIRED", reason: "supervisor claim TTL budget exceeded or claim lost before the write — aborted, nothing written" });

/*
 * Evidence used by assign/renew/close. Liveness is ALWAYS collected here (heartbeat pids checked with ctx.pidAlive ||
 * process.kill(pid,0)) — a caller cannot make a live agent look dead by omitting alivePids. Non-heartbeat evidence:
 *   - ctx.repo given  ⇒ collectEvidence(repo) (worktrees, branches + observed write-sets, process cwds, task outputs)
 *   - ctx.evidence    ⇒ injected evidence (tests)
 *   - ctx.heartbeatOnly === true ⇒ TEST-ONLY: the caller asserts every agent in scope is supervisor-assigned
 *     (heartbeat-backed); non-heartbeat evidence is skipped. Production callers must pass ctx.repo.
 *   - none of these   ⇒ REFUSED_EVIDENCE_UNKNOWN (unknown non-heartbeat agents could hold any path)
 * Non-heartbeat agents whose write-set is UNKNOWN (e.g. a RUNNING task in the main checkout with no dirty paths) conflict
 * with every assignment — fail-closed, by design.
 */
function gatherForMutation(ctx: any): any {
  if (!ctx.repo && !ctx.evidence && ctx.heartbeatOnly !== true) return { refused: freeze({ outcome: "REFUSED_EVIDENCE_UNKNOWN", reason: "no repo / evidence and heartbeatOnly not asserted — non-heartbeat agents unknown, fail-closed" }) };
  const now = num(ctx.now) ?? Date.now();
  const heartbeats = readHeartbeats(ctx.heartbeatDir);
  const corrupt = heartbeats.filter((h: any) => h.corrupt);
  if (corrupt.length) return { refused: freeze({ outcome: "REFUSED_CORRUPT_HEARTBEAT", files: freeze(corrupt.map((c: any) => c.file)), reason: "a corrupt heartbeat's write-set is unknown — repair it first (fail-closed)" }) };
  const base = ctx.evidence ? ctx.evidence : ctx.repo ? collectEvidence({ repo: ctx.repo, prs: ctx.prs, tasksRoot: ctx.tasksRoot, now }) : {};
  const ev = Object.assign({ now, worktrees: [], branches: [], prs: [], procs: [], alivePids: [], tasks: [], claims: [] }, base, { now, heartbeats: heartbeats.filter((h: any) => !TERMINAL_HB.includes(h.status)), claims: [] });
  if (ctx.completionEvidence) ev.completionEvidence = ctx.completionEvidence;
  const isAlive = ctx.pidAlive || pidAlive;
  const hbPids = heartbeats.map((h: any) => h.pid).filter((x: any) => Number.isInteger(x));
  ev.alivePids = [...new Set([...(base.alivePids || []), ...hbPids.filter((p: number) => isAlive(p))])];
  const agents = correlate(ev, { staleMs: ctx.staleMs }).map((u) => classify(u, now));
  return { now, heartbeats, agents };
}

/*
 * assign(request, ctx) — request = { id, workItem, writeSet[] (or authorizedPaths/paths — must agree) | readOnly, owner,
 *   parentId?, worktree?, branch?, deadline?, relaunchOf?, pid? }
 * ctx = { heartbeatDir, locksDir, repo? | evidence? | heartbeatOnly?, now?, staleMs?, mutexTtlMs?, pidAlive?, clock? }
 */
function assign(request: any, ctx: any): any {
  if (!request || typeof request.id !== "string" || !request.id || typeof request.workItem !== "string" || !request.workItem) return freeze({ outcome: "REFUSED_INVALID", reason: "id and workItem (strings) required" });
  const ws = resolveRequestWriteSet(request);
  if (!ws.ok) { const { ok, ...rest } = ws; return freeze(rest); }
  const hit = protectedHits(ws.keys);
  if (hit.length) return freeze({ outcome: "REFUSED_PROTECTED_PATH", paths: freeze(hit) });
  return withMutex(ctx, (stillHeld) => {
    const g = gatherForMutation(ctx);
    if (g.refused) return g.refused;
    const { now, heartbeats, agents } = g;
    if (heartbeats.some((h: any) => h.id === request.id || safeId(h.id) === safeId(request.id))) return freeze({ outcome: "REFUSED_DUPLICATE_ID", against: request.id });
    // dedup on WORK ITEM across every non-terminal heartbeat (staleness does NOT release a work item; only close/supersede)
    const dup = heartbeats.find((h: any) => !TERMINAL_HB.includes(h.status) && h.workItem === request.workItem && h.id !== request.relaunchOf);
    if (dup) { const a = agents.find((x: any) => x.id === dup.id); return freeze({ outcome: "REFUSED_DUPLICATE", against: dup.id, state: a ? a.state : null }); }
    if (request.relaunchOf) {
      const orig = agents.find((a: any) => a.id === request.relaunchOf && a.kind === "HEARTBEAT_AGENT");
      const d = orig ? decideRecovery(orig) : { decision: "NONE", reason: "unknown / non-heartbeat original" };
      if (d.decision !== "RELAUNCH") return freeze({ outcome: "REFUSED_NOT_RECOVERABLE", against: request.relaunchOf, state: orig ? orig.state : null, reason: d.reason });
      if (orig.mission !== request.workItem) return freeze({ outcome: "REFUSED_NOT_RECOVERABLE", against: request.relaunchOf, reason: "relaunch must keep the original work item" });
    }
    // holders: every non-terminal heartbeat agent (whatever its liveness) + observed holders (worktrees/branches/tasks)
    const holders = agents.filter((a: any) => a.id !== request.relaunchOf && (a.kind === "HEARTBEAT_AGENT" || observedHolds(a)));
    const self = { id: "__new__", authorizedPaths: ws.readOnly ? undefined : ws.keys, readOnly: ws.readOnly };
    const c = contention.computeLayerContention([[...holders.map((a: any) => a.id), "__new__"]], [...holders.map(contentionRecord), self]);
    const mine = c.ok ? c.layers[0].contentions.filter((x: any) => x.a === "__new__" || x.b === "__new__") : [{ a: "__new__", b: "?", reason: "CONTENTION_CHECK_FAILED", shared: [] }];
    if (mine.length) return freeze({ outcome: "REFUSED_WRITESET_CONFLICT", conflicts: freeze(mine.map((x: any) => ({ with: x.a === "__new__" ? x.b : x.a, reason: x.reason, shared: x.shared }))) });
    if (!stillHeld()) return MUTEX_EXPIRED;
    const file = path.join(ctx.heartbeatDir, safeId(request.id) + ".json");
    const hb = { id: request.id, workItem: request.workItem, owner: request.owner ?? null, parentId: request.parentId ?? null, worktree: request.worktree ?? null, branch: request.branch ?? null,
      writeSet: ws.readOnly ? null : ws.paths, readOnly: ws.readOnly, createdAt: iso(now), heartbeatAt: iso(now), deadline: request.deadline ?? null, relaunchOf: request.relaunchOf ?? null, pid: Number.isInteger(request.pid) ? request.pid : null, status: "ASSIGNED" };
    writeJsonAtomic(file, hb);
    if (request.relaunchOf) {
      const op = path.join(ctx.heartbeatDir, safeId(request.relaunchOf) + ".json");
      try { const o = JSON.parse(fs.readFileSync(op, "utf8")); o.status = "SUPERSEDED"; o.supersededBy = request.id; writeJsonAtomic(op, o); } catch { /* checked above: original is heartbeat-backed */ }
    }
    return freeze({ outcome: "ASSIGNED", id: request.id, writeSet: freeze(ws.paths.slice()), heartbeat: file });
  });
}

/*
 * renew(id, ctx, patch?) — the heartbeat renewal API. Refreshes heartbeatAt (and progressAt when patch.progress), and may
 * record { pid, finalReport, testEvidence, status: "BLOCKED"|"CANCELLED", reason }. Write-set / work item are immutable.
 * The caller must prove it is the agent: patch.owner must equal the recorded owner, and if a pid is recorded patch.pid is
 * REQUIRED and must match it.
 */
function renew(id: string, ctx: any, patch: any = {}): any {
  return withMutex(ctx, (stillHeld) => {
    const file = path.join(ctx.heartbeatDir, safeId(id) + ".json");
    let o: any;
    try { o = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return freeze({ outcome: "REFUSED_UNKNOWN_AGENT", id }); }
    if (!o || o.id !== id) return freeze({ outcome: "REFUSED_UNKNOWN_AGENT", id });
    if (TERMINAL_HB.includes(o.status)) return freeze({ outcome: "REFUSED_TERMINAL", id, status: o.status });
    if ((o.owner ?? null) !== (patch.owner ?? null)) return freeze({ outcome: "REFUSED_OWNER_MISMATCH", id });
    if (Number.isInteger(o.pid) && patch.pid !== o.pid) return freeze({ outcome: "REFUSED_PID_MISMATCH", id });
    if (patch.writeSet !== undefined || patch.workItem !== undefined) return freeze({ outcome: "REFUSED_IMMUTABLE", id, reason: "write-set / work item cannot change on renew" });
    const now = num(ctx.now) ?? Date.now();
    o.heartbeatAt = iso(now);
    if (patch.progress) o.progressAt = iso(now);
    if (Number.isInteger(patch.pid) && !Number.isInteger(o.pid)) o.pid = patch.pid;
    if (patch.finalReport === true) o.finalReport = true;
    if (patch.testEvidence) o.testEvidence = patch.testEvidence;
    if (patch.status === "BLOCKED" || patch.status === "CANCELLED") { o.status = patch.status; o.reason = patch.reason ?? null; }
    if (!stillHeld()) return MUTEX_EXPIRED;
    writeJsonAtomic(file, o);
    return freeze({ outcome: "RENEWED", id, heartbeatAt: o.heartbeatAt });
  });
}

/*
 * close(id, inspection, ctx) — the agent is RE-CLASSIFIED from evidence here (a caller-passed agent object is never
 * trusted). CLOSED requires: a completed state; an inspection { inspector, verdict: ACCEPT|REJECT }; a KNOWN owner
 * (owner null ⇒ independence cannot be established ⇒ refused — orphans get a freeing proposal, an owner decides);
 * inspector ≠ owner and ≠ parent. The inspector is a declared identity string — it is NOT cryptographically bound here
 * (agent-identity Ed25519 binding is available upstream via odg-provider-governance; not re-implemented).
 */
function close(id: string, inspection: any, ctx: any = {}): any {
  if (typeof id !== "string" || !id) return freeze({ outcome: "REFUSED", reason: "agent id (string) required — agent objects are never trusted" });
  if (!inspection || typeof inspection.inspector !== "string" || !inspection.inspector.trim() || !["ACCEPT", "REJECT"].includes(inspection.verdict)) return freeze({ outcome: "REFUSED", reason: "independent inspection verdict (ACCEPT|REJECT + inspector) required before CLOSED" });
  return withMutex(ctx, (stillHeld) => {
    const g = gatherForMutation(ctx);
    if (g.refused) return g.refused;
    const agent = g.agents.find((a: any) => a.id === id);
    if (!agent) return freeze({ outcome: "REFUSED", reason: "unknown agent (not found in re-collected evidence)" });
    if (!["COMPLETED_WITH_RESULT", "COMPLETED_NO_RESULT"].includes(agent.state)) return freeze({ outcome: "REFUSED", state: agent.state, reason: `re-classified state ${agent.state} cannot be closed` });
    const insp = inspection.inspector.trim();
    if (!agent.owner) return freeze({ outcome: "REFUSED", reason: "agent has no owner — inspector independence cannot be established" });
    if (insp === agent.owner || insp === agent.parent_id) return freeze({ outcome: "REFUSED", reason: "inspector is the owner/parent — not independent" });
    if (agent.state === "COMPLETED_WITH_RESULT" && inspection.verdict === "ACCEPT" && !(agent.quality.hasTestsEvidence || agent.quality.resultKind === "REPORT_ONLY")) return freeze({ outcome: "REFUSED", reason: "ACCEPT without delivery+tests evidence" });
    if (!stillHeld()) return MUTEX_EXPIRED;
    const now = num(ctx.now) ?? Date.now();
    if (agent.kind === "HEARTBEAT_AGENT") {
      const p = path.join(ctx.heartbeatDir, safeId(agent.id) + ".json");
      const o = JSON.parse(fs.readFileSync(p, "utf8")); o.status = "CLOSED"; o.closedAt = iso(now); o.inspection = { inspector: insp, verdict: inspection.verdict }; writeJsonAtomic(p, o);
    }
    const verdict = agent.state === "COMPLETED_WITH_RESULT" && inspection.verdict === "ACCEPT" ? "CLOSED_ACCEPTED" : inspection.verdict === "REJECT" ? "CLOSED_REJECTED" : "CLOSED_NO_RESULT";
    return freeze({ outcome: verdict, id: agent.id, state: agent.state, inspection: freeze({ inspector: insp, verdict: inspection.verdict }), freeing: freeingProposal([agent]) });
  });
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
    const countsRaw = git(repo, ["rev-list", "--left-right", "--count", `${base}...${name}`]);
    const counts = (countsRaw || "").trim().split(/\s+/);
    const remote = (git(repo, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${name}`]) || "").trim();
    const diffRaw = git(repo, ["diff", "--name-only", `${base}...${name}`]);
    const observeOk = countsRaw !== null && diffRaw !== null && counts.length === 2 && counts.every((c) => /^\d+$/.test(c));
    return { name, head, committedAt, behind: observeOk ? Number(counts[0]) : null, ahead: observeOk ? Number(counts[1]) : null, pushed: remote === head, writeSet: (diffRaw || "").split("\n").filter(Boolean), observeOk };
  });
  const worktreeStatus: any = {};
  for (const w of worktrees) {
    const s = git(w.path, ["status", "--porcelain"]);
    if (s === null) continue;
    const dirtyPaths = s.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ""));
    // last observable write activity: mtimes of the dirty paths and of the worktree's git index (stat only, never read)
    const gitDir = (git(w.path, ["rev-parse", "--absolute-git-dir"]) || "").trim();
    const stamps = [...dirtyPaths.map((d) => path.join(w.path, d)), gitDir ? path.join(gitDir, "index") : ""].filter(Boolean).map((f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } });
    // gitignored writes (runtime/generated, …) are invisible to status/diff: include the newest mtime under the
    // ignored entries (bounded walk, symlinks never followed) so an actively-written worktree counts as active.
    const ign = ignoredActivity(w.path, path.resolve(w.path) === path.resolve(repo));
    stamps.push(ign.ms);
    // a DETACHED worktree has no branch diff: observe its own commits vs base so its write-set is not UNKNOWN.
    // A git failure leaves headAhead/headDiff null and headObserveOk=false ⇒ UNKNOWN (holds / blocks), never "integrated".
    let headAhead: number | null = null, headDiff: string[] | null = null, headObserveOk: boolean | null = null;
    if (w.detached || !w.branch) {
      const cRaw = git(w.path, ["rev-list", "--count", `${base}..HEAD`]);
      const dRaw = git(w.path, ["diff", "--name-only", `${base}...HEAD`]);
      headObserveOk = cRaw !== null && dRaw !== null && /^\d+$/.test(cRaw.trim());
      headAhead = headObserveOk ? Number((cRaw as string).trim()) : null;
      headDiff = headObserveOk ? (dRaw as string).split("\n").filter(Boolean) : null;
    }
    worktreeStatus[w.path] = { dirty: dirtyPaths.length, dirtyPaths, lastActivityMs: maxMs(...stamps), activityUnknown: !ign.complete, headAhead, headDiff, headObserveOk };
  }
  return { worktrees, branches, worktreeStatus };
}
/*
 * Newest mtime under the worktree's gitignored entries (writes there are invisible to git). FAIL-CLOSED: if git fails,
 * the walk is truncated (budget), or any entry cannot be stat'ed / read, the result is { complete:false } and the caller
 * treats the worktree as ACTIVE. No directory is skipped by name — except the ROOT-level node_modules of the MAIN checkout
 * (an npm-managed dependency tree, rewritten only by `npm install`, not agent output; linked worktrees carry it as a
 * symlink). Symlinks contribute their own lstat mtime and are not followed.
 */
function ignoredActivity(root: string, isMainCheckout: boolean, budget = DEFAULTS.ignoredScanBudget): { ms: number | null; complete: boolean } {
  const out = git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"]);
  if (out === null) return { ms: null, complete: false };
  let best: number | null = null, left = budget;
  const top = out.split("\n").filter(Boolean).map((rel) => rel.replace(/\/$/, "")).filter((rel) => !(isMainCheckout && rel === "node_modules"));
  const stack = top.map((rel) => path.join(root, rel));
  while (stack.length) {
    if (left-- <= 0) return { ms: best, complete: false };
    const p = stack.pop() as string;
    let st: any; try { st = fs.lstatSync(p); } catch (e: any) { if (e && e.code === "ENOENT") continue; return { ms: best, complete: false }; }
    if (best === null || st.mtimeMs > best) best = st.mtimeMs;
    if (st.isSymbolicLink() || !st.isDirectory()) continue;
    let names: string[];
    try { names = fs.readdirSync(p); } catch (e: any) { if (e && e.code === "ENOENT") continue; return { ms: best, complete: false }; }
    for (const n of names) stack.push(path.join(p, n));
  }
  return { ms: best, complete: true };
}
// merged-PR head / merge-commit oids that are ancestors of origin/main (delivery evidence for branches deleted locally)
function collectIntegratedOids(repo: string, prs: any[], base = "origin/main"): string[] {
  const out: string[] = [];
  for (const p of prs || []) {
    if (p.state !== "MERGED") continue;
    for (const oid of [p.headRefOid, p.mergeCommitOid]) {
      if (typeof oid !== "string" || !/^[0-9a-f]{40}$/.test(oid) || out.includes(oid)) continue;
      const r = childProcess.spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", oid, base], { encoding: "utf8" });
      if (r.status === 0) out.push(oid);
    }
  }
  return out;
}
function collectProcs(roots: string[]): any[] {
  const out: any[] = [];
  let pids: string[] = [];
  try { pids = fs.readdirSync("/proc").filter((n: string) => /^\d+$/.test(n)); } catch { return out; }
  for (const p of pids) { let cwd: string; try { cwd = fs.readlinkSync(`/proc/${p}/cwd`); } catch { continue; } if (roots.some((r) => within(cwd, r))) out.push({ pid: Number(p), cwd }); }
  return out;
}
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (e: any) { return !!e && e.code === "EPERM"; } }
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
  const roots = g.worktrees.map((w: any) => w.path); // the MAIN checkout included: its processes count as liveness too
  const procs = collectProcs(roots).filter((p: any) => p.pid !== process.pid);
  const t = o.tasksRoot ? collectTasks(o.tasksRoot, now, o.taskWindowMs ?? DEFAULTS.taskWindowMs) : { tasks: [], older: 0, sessions: 0, shells: { fresh: 0, stale: 0 } };
  const heartbeats = o.heartbeatDir ? readHeartbeats(o.heartbeatDir) : [];
  const claims = o.locksDir ? collectClaims(o.locksDir) : [];
  const pids = [...heartbeats.map((h: any) => h.pid), ...claims.map((c: any) => c.holderPid)].filter((x: any) => Number.isInteger(x));
  const integratedOids = o.prs ? collectIntegratedOids(o.repo, o.prs, o.base || "origin/main") : [];
  return {
    now, repoRoot: o.repo, mainBranch: "main", ...g, prs: o.prs || [], integratedOids, procs, alivePids: pids.filter(pidAlive), heartbeats, tasks: t.tasks, claims,
    sources: { worktrees: g.worktrees.length, branches: g.branches.length, prs: o.prs ? o.prs.length : "NOT_PROVIDED", integratedMergedPrOids: integratedOids.length, procsInWorktrees: procs.length, heartbeats: heartbeats.length, corruptHeartbeats: heartbeats.filter((h: any) => h.corrupt).length, heartbeatDir: o.heartbeatDir || null, claims: claims.length, taskSessions: t.sessions, tasksInWindow: t.tasks.length, tasksOlderThanWindow: t.older, backgroundShellOutputs: t.shells, taskContentIngested: false },
  };
}

// gh pr list --json number,headRefName,state,headRefOid,mergeCommit,statusCheckRollup  →  [{number, headRefName, state, headRefOid, checks}]
function normalizePrs(raw: any[]): any[] {
  return (raw || []).map((p: any) => {
    const roll = Array.isArray(p.statusCheckRollup) ? p.statusCheckRollup : [];
    const concl = roll.map((c: any) => c.conclusion || c.state || c.status);
    const checks = !roll.length ? "UNKNOWN" : concl.some((x: string) => /FAIL|ERROR|CANCELLED|TIMED_OUT/i.test(x)) ? "FAILURE" : concl.every((x: string) => /SUCCESS|NEUTRAL|SKIPPED/i.test(x)) ? "SUCCESS" : "PENDING";
    return { number: p.number, headRefName: p.headRefName, state: p.state, headRefOid: p.headRefOid, mergeCommitOid: p.mergeCommit && typeof p.mergeCommit.oid === "string" ? p.mergeCommit.oid : null, checks };
  });
}

const AGENT_SUPERVISOR_CONTRACT = freeze({
  id: "ODG-AGENT-SUPERVISOR",
  states: STATES,
  reuses: freeze(["odg-writeset-contention (computeLayerContention, pathsConflict) — unmodified; canonicalisation done in the supervisor", "fleet-bridge (tryClaim/releaseClaim/currentClaim — the only lock)", "odg-sovereign-delegation.ALWAYS_PROTECTED", "heartbeat files as the only per-agent record"]),
  invariants: freeze([
    "classification uses observable evidence only — never a UI label; exactly one state per agent",
    "COMPLETED_WITH_RESULT requires tip-verified delivery (PR head oid == branch tip, or merged oid integrated) + tests, or a DECLARED read-only agent's report; a recoverable report alone is NOT a result",
    "one write-set per request: writeSet/authorizedPaths/paths must agree; absolute/'..'/'\\'/empty/root paths refused; comparisons case-insensitive",
    "liveness is collected by the gate itself (pid alive ⇒ RUNNING); staleness never releases a heartbeat's write-set or work item — only close/supersede do",
    "a RUNNING agent is never relaunched; only INTERRUPTED with recoverable (isolated) worktree state may be",
    "a corrupt heartbeat blocks assignment (fail-closed)",
    "observed units (incl. the MAIN checkout) that are RUNNING — live process, or index/dirty/gitignored mtime within staleMs, or an incomplete ignored-file scan — hold UNKNOWN and block every assignment; LIMIT: a writer idle longer than staleMs with no live process is invisible until it writes again",
    "a MISSION_RERUN recovery handle is usable only with a dead recorded pid, missionId == workItem (case-insensitive) and completion evidence with provenance {source, checkedAt, ids}",
    "every mutation is serialised by a fleet-bridge generation claim; TTL overrun or lost claim ⇒ abort before writing",
    "CLOSED re-classifies from evidence and requires an independent inspector (≠ owner/parent) and a known owner",
    "task-output content is never ingested — structure only (presence, mtime, record type, stop reason, tool name)",
    "the supervisor never deletes worktrees/branches/locks — freeing is a PROPOSAL",
  ]),
});

module.exports = { STATES, HOLDING, TERMINAL_HB, PROTECTED_PREFIXES, DEFAULTS, canonPath, resolveRequestWriteSet, parseWorktreePorcelain, summarizeTaskTail, correlate, classify, decideRecovery, metrics, snapshot, freeingProposal, assign, renew, close, readHeartbeats, collectGit, collectIntegratedOids, collectProcs, collectTasks, collectClaims, collectEvidence, normalizePrs, pidAlive, ignoredActivity, AGENT_SUPERVISOR_CONTRACT };
export {};
