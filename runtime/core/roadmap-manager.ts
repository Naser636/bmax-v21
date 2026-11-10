#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V31 §3 — AUTONOMOUS ROADMAP MANAGEMENT. PURE, deterministic, fail-closed. Gives ODG the native cycle
 * DISCOVERY → INTAKE → DEDUPLICATION → CLASSIFICATION → IMPACT → DEPENDENCY GRAPH → PRIORITIZATION → (AUTHORIZATION) →
 * … over the EXISTING canonical register (closure-register) — it creates NO parallel roadmap/registry. The load-bearing
 * invariant (§1/§3): "la roadmap est ouverte à la découverte, jamais à l'exécution non autorisée" — a discovered item is
 * recorded as a PROPOSED record that is NEVER authorized or executed by discovery itself; authorization is a SEPARATE
 * governed step (deny-by-default). It reuses capability-map/dep signals and composes, inventing no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function norm(s: any): string { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

const CLASS = Object.freeze(["DEFECT", "MISSING_CAPABILITY", "DEPENDENCY", "INCONSISTENCY", "TECH_DEBT", "IMPROVEMENT", "SECURITY", "OTHER"]);

/** classifyDiscovery(discovery) -> a category from CLASS by keyword signals (deterministic). */
function classifyDiscovery(d: any): string {
  const t = norm((d && d.title) + " " + (d && d.detail));
  if (/\b(defect|bug|incorrect|wrong|fail|regression)\b/.test(t)) return "DEFECT";
  if (/\b(security|vuln|exposure|secret|cve)\b/.test(t)) return "SECURITY";
  if (/\b(missing|absent|not built|lacks|no capability|unimplemented)\b/.test(t)) return "MISSING_CAPABILITY";
  if (/\b(depend|coupling|import|unresolved)\b/.test(t)) return "DEPENDENCY";
  if (/\b(inconsist|mismatch|drift|diverge|contradict)\b/.test(t)) return "INCONSISTENCY";
  if (/\b(debt|refactor|cleanup|duplicat)\b/.test(t)) return "TECH_DEBT";
  if (/\b(improve|optimi|faster|better|enhance)\b/.test(t)) return "IMPROVEMENT";
  return "OTHER";
}

/**
 * intakeDiscovery(discovery, existingItems) -> record. FAIL-CLOSED: the result is ALWAYS a PROPOSED record that is NOT
 * authorized and NOT executed; discovery never promotes itself. It deduplicates against the existing register (by id and
 * by normalized-title similarity), classifies, and links provenance. A duplicate returns { duplicate:true, status:
 * "DUPLICATE" } (not re-added).
 */
function intakeDiscovery(discovery: any, existingItems: any): any {
  const d = isObj(discovery) ? discovery : {};
  const items = arr(existingItems).filter(isObj);
  if (typeof d.title !== "string" || d.title.trim() === "") return Object.freeze({ ok: false, status: "REJECTED", reason: "discovery requires a title" });
  const nt = norm(d.title);
  const dup = items.find((i) => i.id === d.id || norm(i.title) === nt || (nt.length > 8 && norm(i.title).includes(nt)) || (nt.length > 8 && nt.includes(norm(i.title))));
  if (dup) return Object.freeze({ ok: true, duplicate: true, status: "DUPLICATE", relatedTo: dup.id, reason: `already covered by register item ${dup.id} (deduplicated — not re-added)`, authorized: false, executed: false });
  return Object.freeze({
    ok: true, duplicate: false, status: "PROPOSED",          // NEVER ACCEPTED/authorized by discovery
    classification: classifyDiscovery(d),
    title: d.title, origin: d.origin || "discovery", evidence: d.evidence || null,
    authorized: false, executed: false,                      // the invariant, made explicit
    reason: "recorded as PROPOSED — discovery is not authorization; a separate governed step must authorize execution",
  });
}

/** authorizeDiscovery(proposed, authorization) -> { authorized, reason }. SEPARATE governed step; deny-by-default — a
 *  PROPOSED record is authorized ONLY with an explicit, approved external authorization (the Radar/discovery cannot
 *  self-authorize). Mirrors promotion-assurance. */
function authorizeDiscovery(proposed: any, authorization: any): any {
  const p = isObj(proposed) ? proposed : {};
  const a = isObj(authorization) ? authorization : null;
  if (p.status !== "PROPOSED") return Object.freeze({ authorized: false, reason: "only a PROPOSED discovery may be authorized" });
  if (!a || a.approved !== true || typeof a.authorizedBy !== "string" || a.authorizedBy.trim() === "") return Object.freeze({ authorized: false, reason: "external authorization required (approved + authorizedBy) — discovery cannot self-authorize" });
  return Object.freeze({ authorized: true, authorizedBy: a.authorizedBy, reason: "authorized by an explicit external decision (now eligible for the governed execution path)" });
}

/** buildInventory(items) -> the exhaustive remaining-work view + progress + a capability-based forecast. */
function buildInventory(items: any): any {
  const list = arr(items).filter(isObj);
  const byStatus: any = {}; for (const i of list) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  const accepted = byStatus.ACCEPTED || 0; const total = list.length;
  const open = list.filter((i) => i.status !== "ACCEPTED" && i.status !== "VALIDATED");
  // blocked items whose deps are unmet (a dep id not ACCEPTED) → on the critical path.
  const acceptedIds = new Set(list.filter((i) => i.status === "ACCEPTED" || i.status === "VALIDATED").map((i) => i.id));
  const blockedByDep = open.filter((i) => arr(i.deps).some((dep) => !acceptedIds.has(dep)));
  return Object.freeze({
    total, accepted, open: open.length, byStatus: Object.freeze(byStatus),
    progressPct: total > 0 ? Number((accepted / total * 100).toFixed(1)) : 0,
    openItems: Object.freeze(open.map((i) => ({ id: i.id, status: i.status }))),
    blockedByDependency: Object.freeze(blockedByDep.map((i) => i.id)),
    forecast: open.length === 0 ? "COMPLETE (no open items)" : `${open.length} open; completion depends on authorizations/owner inputs (see per-item status) — not auto-executable`,
  });
}

const ROADMAP_MANAGER_CONTRACT = Object.freeze({
  id: "V124-ROADMAP-MANAGER",
  source: "CTO V31 §3 — native autonomous roadmap management over the canonical register",
  reuses: Object.freeze(["closure-register (the ONLY roadmap — no parallel registry)", "capability-map / dep signals", "promotion-assurance discipline (discovery ≠ authorization)"]),
  notAuthority: "discovers, deduplicates, classifies and inventories; a discovery is PROPOSED only and is NEVER authorized or executed by this module — a separate governed step authorizes",
  invariants: Object.freeze([
    "the roadmap is open to DISCOVERY but never to unauthorized execution: intakeDiscovery always yields authorized:false, executed:false",
    "a discovery duplicating an existing register item is DEDUPLICATED (DUPLICATE, not re-added) — no parallel registry",
    "authorization is a SEPARATE deny-by-default step requiring an explicit approved external decision (discovery cannot self-authorize)",
    "the inventory is derived from the canonical register only; progress/forecast reflect real statuses, never a declared completion",
    "pure/deterministic: discovery + register in → classification/inventory out; grants no authority, writes nothing",
  ]),
});

module.exports = { CLASS, classifyDiscovery, intakeDiscovery, authorizeDiscovery, buildInventory, ROADMAP_MANAGER_CONTRACT };

if (require.main === module) {
  const items = [{ id: "a", title: "existing thing", status: "ACCEPTED" }];
  const disc = intakeDiscovery({ title: "a brand new missing capability for parsing" }, items);
  const dupd = intakeDiscovery({ title: "existing thing" }, items);
  process.stdout.write(JSON.stringify({ ...ROADMAP_MANAGER_CONTRACT, demo: { discovered: disc.status, authorizedByDiscovery: disc.authorized, duplicateDetected: dupd.status === "DUPLICATE" } }, null, 2) + "\n");
}

export {};
