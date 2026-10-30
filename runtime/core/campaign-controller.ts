#!/usr/bin/env node
/**
 * campaign-controller — the PERSISTENT closure-campaign driver. It is NOT a tenth primitive and NOT a second
 * orchestrator: it is a PURE decision/ordering helper over a durable closure register (STATE), analogous to
 * mission-scheduler (pure `schedulerStep`). It NEVER executes an effect itself — it SELECTS the next admissible lot
 * and records state transitions; ODG performs the work. Dependency eligibility reuses ODG5 `dep-planner.planLayers`
 * (topological; fail-closed on cycle/missing). State is persisted to a durable JSON register so the campaign resumes
 * after interruption/restart without re-analysing the project.
 *
 * Fail-closed closure discipline: an item becomes ACCEPTED only via `advance(..., {status:"ACCEPTED", evidence})`
 * with NON-EMPTY evidence — a command succeeding is NOT acceptance. BLOCKED items are skipped (never selected) but
 * their dependents stay open; independent lots keep flowing.
 */
"use strict";

const fs = require("fs");
const crypto = require("crypto");
const DEP = require("./dep-planner.js");

const OPEN_STATES = ["READY", "IN_PROGRESS"];
const TERMINAL_OK = "ACCEPTED";
const STATES = ["READY", "IN_PROGRESS", "BLOCKED", "ACCEPTED", "DEFERRED", "REJECTED"];

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function readJsonSafe(f: string): any { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }

/** loadRegister(path): durable register {items:[...]} or {ok:false}. */
function loadRegister(path: string): any {
  const r = readJsonSafe(path);
  if (!isObj(r) || !Array.isArray(r.items)) return { ok: false, code: "NO_REGISTER", reason: `closure register not readable at ${path}` };
  return { ok: true, register: r };
}

/** saveRegister(path, register): persist (durable resume point). CRASH-ATOMIC. */
function saveRegister(path: string, register: any): boolean {
  // CRASH-ATOMIC write (mirror mission-ledger S3b): serialize to a temp file in the SAME directory, then rename()
  // over the target. rename(2) is atomic on POSIX, so a crash/SIGKILL/OOM/power-loss mid-write can NEVER leave a
  // torn/truncated register. This is THE durable campaign resume point — campaign-loop persists it after EVERY
  // mission and loadRegister is the resume entry; a plain writeFileSync could leave it half-written ⇒ loadRegister
  // reads it as corrupt (NO_REGISTER) ⇒ the campaign cannot resume. Same hardening the mission-ledger already has.
  try {
    const tmp = `${path}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(register, null, 2));
    try { fs.renameSync(tmp, path); } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { /* best-effort */ } throw e; }
    return true;
  } catch { return false; }
}

/** itemsById(register) + a dep-planner layering over OPEN+ACCEPTED items (ACCEPTED are "done" layer-0 anchors). */
function layering(register: any): any {
  const items = Array.isArray(register.items) ? register.items : [];
  const byId = new Map(items.map((it: any) => [it.id, it]));
  // dep-planner over all items; deps restricted to known ids (unknown dep ⇒ surfaced as a blocker, not a crash).
  const work = items.map((it: any) => ({ id: it.id, deps: (Array.isArray(it.deps) ? it.deps : []).filter((d: string) => byId.has(d)) }));
  let layers: string[][] = [];
  let planError: string | null = null;
  try { layers = DEP.planLayers(work); } catch (e: any) { planError = (e && e.message) || String(e); }
  return { byId, layers, planError };
}

/** depsSatisfied(item, byId): every declared dep exists AND is ACCEPTED. */
function depsSatisfied(item: any, byId: Map<string, any>): boolean {
  const deps = Array.isArray(item.deps) ? item.deps : [];
  return deps.every((d: string) => { const dep = byId.get(d); return dep && dep.status === TERMINAL_OK; });
}

/**
 * lotFingerprint(lot): a stable hash of the lot's ACTIONABLE definition — what would be attempted. Deterministic (no
 * clock/random). Changing the title, deps, `strategy` or `inputsHash` changes the fingerprint ⇒ a genuinely different
 * attempt. Used to detect "same mission, unchanged" so a previously-failed lot is NOT re-selected without a change.
 */
function lotFingerprint(lot: any): string {
  const def = {
    id: lot.id, title: lot.title || "",
    deps: Array.isArray(lot.deps) ? [...lot.deps].sort() : [],
    strategy: lot.strategy || "", inputsHash: lot.inputsHash || "",
  };
  return crypto.createHash("sha256").update(JSON.stringify(def)).digest("hex").slice(0, 16);
}

/** stalled(lot): true if the lot recorded a failed attempt AND its definition is UNCHANGED since (same fingerprint). */
function isStalled(lot: any): boolean {
  return typeof lot.lastFailureFingerprint === "string" && lot.lastFailureFingerprint === lotFingerprint(lot);
}

/**
 * staleAcceptances(register): ACCEPTED items whose evidence BASIS is no longer valid — a declared dependency is not
 * ACCEPTED (it regressed / was reverted / is missing). Such evidence must NOT be blindly reused ("réutilise uniquement
 * les preuves toujours valides"). Pure/read-only. Returns [{ id, invalidatedBy: string[] }].
 */
function staleAcceptances(register: any): any[] {
  const items = Array.isArray(register.items) ? register.items : [];
  const byId = new Map<string, any>(items.map((it: any) => [it.id, it] as [string, any]));
  const stale: any[] = [];
  for (const it of items) {
    if (it.status !== TERMINAL_OK) continue;
    const deps = Array.isArray(it.deps) ? it.deps : [];
    const invalidatedBy = deps.filter((d: string) => { const dep = byId.get(d); return !dep || dep.status !== TERMINAL_OK; });
    if (invalidatedBy.length) stale.push({ id: it.id, invalidatedBy });
  }
  return stale;
}

/**
 * reconcile(register, { demote }): update the dependency graph AFTER a mission — stamp each ACCEPTED item's evidence
 * validity (it.staleEvidence). With demote:true, a stale ACCEPTED item is sent back to IN_PROGRESS for re-verification
 * (its old proof is preserved under priorEvidence, never silently trusted). Mutates + returns { stale, demoted }.
 */
function reconcile(register: any, opts: any = {}): any {
  const stale = staleAcceptances(register);
  const staleSet = new Set(stale.map((s) => s.id));
  const demoted: string[] = [];
  for (const it of (register.items || [])) {
    if (it.status !== TERMINAL_OK) continue;
    it.staleEvidence = staleSet.has(it.id);
    if (it.staleEvidence && opts.demote === true) {
      const by = (stale.find((s) => s.id === it.id) || {}).invalidatedBy || [];
      it.status = "IN_PROGRESS";
      it.priorEvidence = it.evidence;                       // preserved for audit; no longer a valid ACCEPTED proof
      it.evidence = "";                                     // must be re-earned before ACCEPTED again (fail-closed)
      it.nextAction = `re-verify: evidence basis invalidated (dep no longer ACCEPTED: ${by.join(", ")})`;
      demoted.push(it.id);
    }
  }
  return { stale, demoted };
}

/**
 * selectNextLot(register): the next ADMISSIBLE lot — OPEN (READY/IN_PROGRESS), not BLOCKED, deps all ACCEPTED —
 * chosen by dep-layer order then by numeric `priority` (lower = sooner). Returns { lot } | { lot:null, reason }.
 */
function selectNextLot(register: any): any {
  const { byId, layers, planError } = layering(register);
  if (planError) return { lot: null, reason: `dependency planning error: ${planError}` };
  const eligible: any[] = [];
  const stalledIds: string[] = [];
  for (const it of register.items) {
    if (!OPEN_STATES.includes(it.status)) continue;        // skip ACCEPTED/BLOCKED/DEFERRED/REJECTED
    if (!depsSatisfied(it, byId)) continue;                // deps not all ACCEPTED ⇒ not yet admissible
    if (isStalled(it)) { stalledIds.push(it.id); continue; } // NO-REPEAT: a failed attempt, unchanged ⇒ not re-selected
    eligible.push(it);
  }
  if (eligible.length === 0) {
    const open = register.items.filter((it: any) => OPEN_STATES.includes(it.status));
    const blocked = register.items.filter((it: any) => it.status === "BLOCKED").map((it: any) => it.id);
    const parts: string[] = [];
    if (stalledIds.length) parts.push(`stalled (failed, unchanged — need new evidence/strategy): [${stalledIds.join(", ")}]`);
    if (blocked.length) parts.push(`blocked: [${blocked.join(", ")}]`);
    const reason = open.length ? `${open.length} open lot(s), none admissible — ${parts.join("; ") || "awaiting dependencies"}` : "no open lots — campaign register fully resolved/blocked";
    return { lot: null, reason, blocked, stalled: stalledIds };
  }
  // Order by dep layer, then priority.
  const layerOf = new Map<string, number>(); layers.forEach((l: string[], i: number) => l.forEach((id: string) => layerOf.set(id, i)));
  eligible.sort((a, b) => (layerOf.get(a.id) ?? 0) - (layerOf.get(b.id) ?? 0) || (a.priority ?? 999) - (b.priority ?? 999) || String(a.id).localeCompare(String(b.id)));
  return { lot: eligible[0], layer: layerOf.get(eligible[0].id) ?? 0, stalled: stalledIds };
}

/**
 * advance(register, id, { status, evidence, nextAction, blockReason }): fail-closed transition. ACCEPTED REQUIRES
 * non-empty evidence. Mutates + returns the register (caller persists via saveRegister). Returns {ok:false} on bad input.
 */
function advance(register: any, id: string, change: any = {}): any {
  const it = (register.items || []).find((x: any) => x.id === id);
  if (!it) return { ok: false, code: "NO_SUCH_LOT", reason: `lot '${id}' not in register` };
  const status = change.status;
  if (status !== undefined) {
    if (!STATES.includes(status)) return { ok: false, code: "BAD_STATUS", reason: `invalid status '${status}'` };
    if (status === TERMINAL_OK) {
      const ev = change.evidence;
      const hasEv = typeof ev === "string" ? ev.trim().length > 0 : Array.isArray(ev) && ev.length > 0;
      if (!hasEv) return { ok: false, code: "EVIDENCE_REQUIRED", reason: "ACCEPTED requires non-empty evidence (a command succeeding is not acceptance)" };
      it.evidence = ev;
    }
    it.status = status;
  }
  // NO-REPEAT: record a failed attempt. Stamps the CURRENT fingerprint so the SAME unchanged lot won't be re-selected
  // (isStalled); it becomes selectable again only when its definition changes (strategy/inputsHash/title/deps) or the
  // failure is explicitly cleared. Recorded BEFORE applying any strategy change so a same-call change un-stalls.
  if (change.attemptFailed === true) {
    it.attempts = (typeof it.attempts === "number" ? it.attempts : 0) + 1;
    it.lastFailureFingerprint = lotFingerprint(it);
    if (typeof change.reason === "string") it.lastFailureReason = change.reason;
  }
  if (change.clearFailure === true) { delete it.lastFailureFingerprint; delete it.lastFailureReason; }
  // A new strategy / new inputs = a genuinely different attempt ⇒ fingerprint changes ⇒ no longer stalled.
  if (typeof change.strategy === "string") it.strategy = change.strategy;
  if (typeof change.inputsHash === "string") it.inputsHash = change.inputsHash;
  if (typeof change.evidence === "string" && change.evidence.trim()) it.evidence = change.evidence;
  if (typeof change.nextAction === "string") it.nextAction = change.nextAction;
  if (typeof change.blockReason === "string") it.blockReason = change.blockReason;
  return { ok: true, register, item: it };
}

/** summary(register): counts + next lot + blockers — the resumable campaign status. */
function summary(register: any): any {
  const counts: Record<string, number> = {};
  for (const it of (register.items || [])) counts[it.status] = (counts[it.status] || 0) + 1;
  const next = selectNextLot(register);
  return {
    total: (register.items || []).length, counts,
    nextLot: next.lot ? { id: next.lot.id, program: next.lot.program, priority: next.lot.priority, layer: next.layer } : null,
    idle: !next.lot, idleReason: next.lot ? null : next.reason,
    blocked: (register.items || []).filter((it: any) => it.status === "BLOCKED").map((it: any) => ({ id: it.id, blockReason: it.blockReason || null })),
    stalled: (register.items || []).filter((it: any) => OPEN_STATES.includes(it.status) && isStalled(it)).map((it: any) => ({ id: it.id, attempts: it.attempts || 0, lastFailureReason: it.lastFailureReason || null })),
    staleEvidence: staleAcceptances(register),   // ACCEPTED items whose dependency basis is no longer valid (don't reuse blindly)
  };
}

export { loadRegister, saveRegister, selectNextLot, advance, summary, layering, lotFingerprint, isStalled, staleAcceptances, reconcile, STATES };
module.exports = { loadRegister, saveRegister, selectNextLot, advance, summary, layering, lotFingerprint, isStalled, staleAcceptances, reconcile, STATES };

if (require.main === module) {
  const r = loadRegister(process.argv[2] || "docs/odg/closure-register.json");
  process.stdout.write(JSON.stringify(r.ok ? summary(r.register) : r, null, 2) + "\n");
}
