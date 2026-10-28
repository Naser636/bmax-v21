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

/** saveRegister(path, register): persist (durable resume point). */
function saveRegister(path: string, register: any): boolean {
  try { fs.writeFileSync(path, JSON.stringify(register, null, 2)); return true; } catch { return false; }
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
 * selectNextLot(register): the next ADMISSIBLE lot — OPEN (READY/IN_PROGRESS), not BLOCKED, deps all ACCEPTED —
 * chosen by dep-layer order then by numeric `priority` (lower = sooner). Returns { lot } | { lot:null, reason }.
 */
function selectNextLot(register: any): any {
  const { byId, layers, planError } = layering(register);
  if (planError) return { lot: null, reason: `dependency planning error: ${planError}` };
  const eligible: any[] = [];
  for (const it of register.items) {
    if (!OPEN_STATES.includes(it.status)) continue;        // skip ACCEPTED/BLOCKED/DEFERRED/REJECTED
    if (!depsSatisfied(it, byId)) continue;                // deps not all ACCEPTED ⇒ not yet admissible
    eligible.push(it);
  }
  if (eligible.length === 0) {
    const open = register.items.filter((it: any) => OPEN_STATES.includes(it.status));
    const blocked = register.items.filter((it: any) => it.status === "BLOCKED").map((it: any) => it.id);
    return { lot: null, reason: open.length ? `all ${open.length} open lot(s) await dependencies; blocked: [${blocked.join(", ")}]` : "no open lots — campaign register fully resolved/blocked", blocked };
  }
  // Order by dep layer, then priority.
  const layerOf = new Map<string, number>(); layers.forEach((l: string[], i: number) => l.forEach((id: string) => layerOf.set(id, i)));
  eligible.sort((a, b) => (layerOf.get(a.id) ?? 0) - (layerOf.get(b.id) ?? 0) || (a.priority ?? 999) - (b.priority ?? 999) || String(a.id).localeCompare(String(b.id)));
  return { lot: eligible[0], layer: layerOf.get(eligible[0].id) ?? 0 };
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
  };
}

export { loadRegister, saveRegister, selectNextLot, advance, summary, layering, STATES };
module.exports = { loadRegister, saveRegister, selectNextLot, advance, summary, layering, STATES };

if (require.main === module) {
  const r = loadRegister(process.argv[2] || "docs/odg/closure-register.json");
  process.stdout.write(JSON.stringify(r.ok ? summary(r.register) : r, null, 2) + "\n");
}
