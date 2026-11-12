#!/usr/bin/env node
"use strict";
/*
 * V169 (§1/§2/§3 — master roadmap historical reconciliation). PURE, READ-ONLY, deterministic, fail-closed.
 * Builds a lossless reconciliation matrix over ODG's REAL canonical sources, classifying every closure record into the
 * directive's 8-class taxonomy GROUNDED in the record's real fields (status/evidence/staleEvidence/title) — no fabrication,
 * no silent delete/rewrite/downgrade. Also reports the structural relationship between the two operational SSOT layers
 * (ROADMAP.json governed missions vs closure-register.json closure evidence), which §3 keeps DISTINCT on purpose.
 *
 * Canonical sources (§1): docs/odg-operational/ODG_MASTER_ROADMAP_V12.4.md (strategic authority — V12.4 retained),
 * docs/odg/ODG_MASTER_TECHNOLOGICAL_SUPERIORITY_ROADMAP.md, runtime/governance/ROADMAP.json (operational missions),
 * docs/odg/closure-register.json (closure evidence), ODG_PROJECT_STATE.md (Boussole). This module introduces NO competing
 * roadmap and mutates NOTHING.
 */
const fs = require("node:fs");
const path = require("node:path");

const TAXONOMY = Object.freeze([
  "IMPLEMENTED_AND_INDEPENDENTLY_VERIFIED",
  "IMPLEMENTED_NOT_INDEPENDENTLY_VERIFIED",
  "PARTIALLY_IMPLEMENTED",
  "APPROVED_NOT_IMPLEMENTED",
  "MISSING_FROM_CANONICAL_ROADMAP",
  "BLOCKED_WITH_EXPLICIT_DEPENDENCY",
  "OBSOLETE_WITH_GOVERNED_JUSTIFICATION",
  "DUPLICATE_WITH_CANONICAL_REFERENCE",
]);

function readJson(rel: string): any { return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")); }
function exists(rel: string): boolean { try { return fs.existsSync(path.join(process.cwd(), rel)); } catch { return false; } }
function evText(e: any): string { return typeof e === "string" ? e : (e == null ? "" : JSON.stringify(e)); }

/* inventorySources — §1 existence inventory of the canonical sources (read-only; never asserts content it did not read). */
function inventorySources(): any {
  const sources = [
    { id: "MASTER_V12.4", path: "docs/odg-operational/ODG_MASTER_ROADMAP_V12.4.md", role: "strategic authority (canonical master, V12.4 retained)" },
    { id: "SUPERIORITY_ROADMAP", path: "docs/odg/ODG_MASTER_TECHNOLOGICAL_SUPERIORITY_ROADMAP.md", role: "technological superiority roadmap" },
    { id: "ROADMAP_JSON", path: "runtime/governance/ROADMAP.json", role: "operational governed missions (PROTECTED)" },
    { id: "CLOSURE_REGISTER", path: "docs/odg/closure-register.json", role: "independently-supported closure evidence" },
    { id: "BOUSSOLE", path: "ODG_PROJECT_STATE.md", role: "governance/validation compass + campaign checkpoints" },
  ];
  return Object.freeze(sources.map((s) => Object.freeze({ ...s, present: exists(s.path) })));
}

/* classifyClosureItem — map ONE closure record to the taxonomy, GROUNDED purely in its real fields. The matrix does NOT
 * itself re-run verification: AND_INDEPENDENTLY_VERIFIED is claimed only when the RECORDED evidence explicitly documents
 * independent reproduction (/independent|reproduc/i) — otherwise ACCEPTED is honestly IMPLEMENTED_NOT_INDEPENDENTLY_VERIFIED. */
function classifyClosureItem(item: any, dupTitleOwner?: string): any {
  const status = item && item.status;
  const ev = evText(item && item.evidence);
  const stale = item && item.staleEvidence === true;
  if (dupTitleOwner && dupTitleOwner !== item.id) return { class: "DUPLICATE_WITH_CANONICAL_REFERENCE", canonicalRef: dupTitleOwner };
  if (status === "REJECTED") return { class: "OBSOLETE_WITH_GOVERNED_JUSTIFICATION", canonicalRef: item.id };
  if (status === "BLOCKED") return { class: "BLOCKED_WITH_EXPLICIT_DEPENDENCY", canonicalRef: item.id };
  if (status === "DEFERRED") return { class: "APPROVED_NOT_IMPLEMENTED", canonicalRef: item.id };
  if (status === "IN_PROGRESS") return { class: "PARTIALLY_IMPLEMENTED", canonicalRef: item.id };
  if (status === "ACCEPTED") {
    if (ev.length < 3) return { class: "APPROVED_NOT_IMPLEMENTED", canonicalRef: item.id };
    if (stale) return { class: "PARTIALLY_IMPLEMENTED", canonicalRef: item.id };
    return /independent|reproduc/i.test(ev)
      ? { class: "IMPLEMENTED_AND_INDEPENDENTLY_VERIFIED", canonicalRef: item.id }
      : { class: "IMPLEMENTED_NOT_INDEPENDENTLY_VERIFIED", canonicalRef: item.id };
  }
  return { class: "PARTIALLY_IMPLEMENTED", canonicalRef: item.id }; // unknown status ⇒ conservative, never "implemented"
}

/* reconcileClosureRegister — classify all closure records; detect exact-duplicate titles (first id = canonical owner). */
function reconcileClosureRegister(): any {
  const items = readJson("docs/odg/closure-register.json").items || [];
  const titleOwner: any = {};
  for (const i of items) { const t = (i.title || "").trim().toLowerCase(); if (t && !titleOwner[t]) titleOwner[t] = i.id; }
  const rows = items.map((i: any) => {
    const t = (i.title || "").trim().toLowerCase();
    const dupOwner = t && titleOwner[t] !== i.id ? titleOwner[t] : undefined;
    const c = classifyClosureItem(i, dupOwner);
    return Object.freeze({ source: "closure-register", id: i.id, title: i.title, status: i.status, class: c.class, canonicalDestination: "closure-register.json", canonicalRef: c.canonicalRef, evidencePointer: evText(i.evidence).slice(0, 60) });
  });
  const byClass: any = {}; for (const r of rows) byClass[r.class] = (byClass[r.class] || 0) + 1;
  return { total: rows.length, byClass, rows };
}

/* reconcileGovernedLayer — the ROADMAP.json governed missions. §3 keeps this layer DISTINCT from closure-register; the two
 * use different id namespaces BY DESIGN, so "not id-present in the closure register" is a structural fact, not a defect. */
function reconcileGovernedLayer(): any {
  const gov = readJson("runtime/governance/ROADMAP.json").missions || [];
  const crIds = new Set((readJson("docs/odg/closure-register.json").items || []).map((i: any) => i.id));
  const rows = gov.map((m: any) => {
    const ownerGatedDeploy = /VPS|DEPLOY|PROD/i.test(m.id);
    const idLinked = crIds.has(m.id);
    const klass = idLinked ? "IMPLEMENTED_NOT_INDEPENDENTLY_VERIFIED" : (ownerGatedDeploy ? "BLOCKED_WITH_EXPLICIT_DEPENDENCY" : "APPROVED_NOT_IMPLEMENTED");
    return Object.freeze({ source: "ROADMAP.json", id: m.id, title: m.title, requiresEngineering: !!m.requiresEngineering, class: klass, canonicalDestination: "ROADMAP.json", crossLinkedToClosureRegister: idLinked, note: idLinked ? "id-linked to a closure record" : (ownerGatedDeploy ? "owner-gated deploy mission — explicit dependency (root/systemd/TLS/secrets)" : "governed strategic mission; closure evidence lives in dossiers, not id-linked (distinct SSOT layer by §3)") });
  });
  const byClass: any = {}; for (const r of rows) byClass[r.class] = (byClass[r.class] || 0) + 1;
  return { total: rows.length, byClass, rows, structuralNote: "ROADMAP.json (strategic/operational missions) and closure-register.json (closure evidence) are DISTINCT SSOT layers (§3) with separate id namespaces — non-linkage is expected, not a loss." };
}

/* reconcile — the full lossless matrix + coverage percentage over the closure corpus. */
function reconcile(): any {
  const sources = inventorySources();
  const closure = reconcileClosureRegister();
  const governed = reconcileGovernedLayer();
  const implemented = (closure.byClass.IMPLEMENTED_AND_INDEPENDENTLY_VERIFIED || 0) + (closure.byClass.IMPLEMENTED_NOT_INDEPENDENTLY_VERIFIED || 0);
  const coveragePercent = closure.total > 0 ? Math.round((implemented / closure.total) * 1000) / 10 : 0;
  return Object.freeze({
    sources,
    taxonomy: TAXONOMY,
    closure: Object.freeze({ total: closure.total, byClass: Object.freeze(closure.byClass) }),
    governed: Object.freeze({ total: governed.total, byClass: Object.freeze(governed.byClass), structuralNote: governed.structuralNote }),
    coveragePercent,
    independentlyVerifiedCount: closure.byClass.IMPLEMENTED_AND_INDEPENDENTLY_VERIFIED || 0,
    preserved: "every closure record and its evidence retained; nothing deleted/rewritten/downgraded; no competing roadmap introduced; no mutation.",
    note: "lossless reconciliation over the REAL canonical sources; taxonomy classes derived PURELY from recorded fields (AND_INDEPENDENTLY_VERIFIED only where the recorded evidence documents independent reproduction).",
  });
}

const RECONCILIATION_CONTRACT = Object.freeze({
  id: "V169-ROADMAP-RECONCILIATION",
  purpose: "§1/§2/§3 — lossless historical reconciliation matrix over ODG's REAL canonical sources into the 8-class taxonomy + coverage %",
  taxonomy: TAXONOMY,
  invariants: Object.freeze([
    "READ-ONLY: never mutates any source; introduces NO competing roadmap (V12.4 retained as strategic authority)",
    "taxonomy class derived PURELY from recorded fields (status/evidence/stale/title) — no fabrication, no silent downgrade",
    "AND_INDEPENDENTLY_VERIFIED claimed ONLY where recorded evidence documents independent reproduction; else NOT_INDEPENDENTLY_VERIFIED",
    "the two SSOT layers (ROADMAP.json vs closure-register.json) are kept DISTINCT (§3); non-linkage reported as structural, not loss",
    "deterministic + fail-closed; preserves all accepted work + evidence",
  ]),
});
module.exports = { inventorySources, classifyClosureItem, reconcileClosureRegister, reconcileGovernedLayer, reconcile, TAXONOMY, RECONCILIATION_CONTRACT };
export {};
