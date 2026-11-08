#!/usr/bin/env node
"use strict";

/*
 * GM-CI-8 / WI-DISC-10 — DISCOVERY ENGINE (capability discovery, §21/§22/§42). PURE, read-only analytic lens
 * over a SUPPLIED capability inventory: it discovers GAPS (needed-but-not-operational), UNMET DEPENDENCIES,
 * DUPLICATES (consolidation candidates, §110) and REUSE OPPORTUNITIES, each as an EXPLAINABLE finding with a
 * verdict, confidence, priority, signals, evidence and a recommendation. Findings are HYPOTHESES to verify
 * (§22/§23) unless a HARD structural fact holds (a dependency id simply absent from the inventory ⇒ CONFIRMED).
 * It discovers nothing from the outside world and performs no I/O — it consumes the inventory the caller gives
 * (e.g. derived from capability-registry.missingCapabilities). This is NOT the src/core BOAMP external-source
 * stub (a different concern, preserved). Deterministic; sorted outputs. Dual export (CJS + ESM export {}).
 */

const VERDICTS = Object.freeze(["NO_DATA", "NONE", "HYPOTHESIS", "CONFIRMED"]);
const KINDS = Object.freeze(["gap", "unmet-dependency", "duplicate", "reuse-opportunity"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function clamp01(n: any): number { return typeof n === "number" && isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }

// An inventory item: { id, provides?, need?(bool), declared?, implemented?, tested?, verified?, deps?:[id], duplicateOf? }
function operational(it: any): boolean { return !!(it && it.verified === true); }
function finding(kind: any, subject: any, verdict: any, confidence: any, priority: any, signals: any, evidence: any, recommendation: any): any {
  return Object.freeze({ kind, subject, verdict, confidence: clamp01(confidence), priority, signals: Object.freeze(signals || []), evidence: Object.freeze(evidence || []), recommendation });
}
function byId(inv: any[]): any { const m: any = {}; for (const it of inv) if (isObj(it) && isStr(it.id)) m[it.id] = it; return m; }

/** GAPS: a capability that is NEEDED but not operational (verified). declared-not-implemented ranks highest. */
function discoverGaps(inv: any[]): any[] {
  const out: any[] = [];
  for (const it of inv) {
    if (!isObj(it) || !isStr(it.id)) continue;
    const needed = it.need === true;
    if (!needed || operational(it)) continue;
    let conf = 0.5; let sig = "needed but not verified";
    if (it.declared === true && it.implemented !== true) { conf = 0.85; sig = "declared but NOT implemented (declared ≠ operational, §13)"; }
    else if (it.implemented === true && it.tested !== true) { conf = 0.7; sig = "implemented but NOT tested"; }
    else if (it.tested === true && it.verified !== true) { conf = 0.6; sig = "tested but NOT independently verified"; }
    out.push(finding("gap", it.id, "HYPOTHESIS", conf, Math.round(conf * 100), [{ name: "maturity", value: sig }], [], `build/verify capability "${it.id}" to close the gap`));
  }
  return out;
}

/** UNMET DEPENDENCIES: a dep id absent from inventory ⇒ CONFIRMED; present but not verified ⇒ HYPOTHESIS. */
function discoverUnmetDeps(inv: any[]): any[] {
  const m = byId(inv); const out: any[] = [];
  for (const it of inv) {
    if (!isObj(it) || !isStr(it.id)) continue;
    for (const dep of arr(it.deps)) {
      if (!isStr(dep)) continue;
      if (!m[dep]) out.push(finding("unmet-dependency", `${it.id}→${dep}`, "CONFIRMED", 0.95, 90, [{ name: "missingDep", value: dep, explanation: "dependency id is absent from the inventory (hard)" }], [dep], `supply or register dependency "${dep}" required by "${it.id}"`));
      else if (!operational(m[dep])) out.push(finding("unmet-dependency", `${it.id}→${dep}`, "HYPOTHESIS", 0.6, 65, [{ name: "unverifiedDep", value: dep, explanation: "dependency exists but is not verified" }], [dep], `verify dependency "${dep}" before relying on "${it.id}"`));
    }
  }
  return out;
}

/** DUPLICATES: explicit duplicateOf ⇒ CONFIRMED; two+ items providing the same tag ⇒ HYPOTHESIS (consolidate, §110). */
function discoverDuplicates(inv: any[]): any[] {
  const out: any[] = []; const byProvides: any = {};
  for (const it of inv) {
    if (!isObj(it) || !isStr(it.id)) continue;
    if (isStr(it.duplicateOf)) out.push(finding("duplicate", it.id, "CONFIRMED", 0.9, 80, [{ name: "duplicateOf", value: it.duplicateOf }], [it.duplicateOf], `consolidate "${it.id}" into "${it.duplicateOf}" (§110)`));
    if (isStr(it.provides)) (byProvides[it.provides] = byProvides[it.provides] || []).push(it.id);
  }
  for (const tag of Object.keys(byProvides).sort()) {
    const ids = byProvides[tag].sort();
    if (ids.length > 1) out.push(finding("duplicate", ids.join(","), "HYPOTHESIS", 0.55, 60, [{ name: "sameProvides", value: tag, explanation: "multiple capabilities provide the same thing" }], ids, `review ${ids.length} capabilities providing "${tag}" for consolidation (§110)`));
  }
  return out;
}

/** REUSE OPPORTUNITIES: a gap whose `provides` tag is already delivered by a VERIFIED capability ⇒ reuse, don't rebuild. */
function discoverReuse(inv: any[]): any[] {
  const out: any[] = []; const verifiedByProvides: any = {};
  for (const it of inv) if (isObj(it) && operational(it) && isStr(it.provides)) (verifiedByProvides[it.provides] = verifiedByProvides[it.provides] || []).push(it.id);
  for (const it of inv) {
    if (!isObj(it) || !isStr(it.id) || it.need !== true || operational(it)) continue;
    const prov = isStr(it.provides) ? it.provides : null;
    if (prov && verifiedByProvides[prov]) {
      const cands = verifiedByProvides[prov].filter((x: string) => x !== it.id).sort();
      if (cands.length) out.push(finding("reuse-opportunity", it.id, "HYPOTHESIS", 0.65, 70, [{ name: "reuseCandidate", value: cands.join(","), explanation: "an already-verified capability provides the same thing" }], cands, `reuse ${cands.join("/")} instead of building "${it.id}" (§139 no useless reconstruction)`));
    }
  }
  return out;
}

/** discover(input) -> { summary, findings } prioritised desc. input: { inventory: [...] }. Pure, read-only. */
function discover(input: any): any {
  const inv = arr(input && input.inventory).filter(isObj);
  if (inv.length === 0) return Object.freeze({ summary: Object.freeze({ verdict: "NO_DATA", total: 0, byKind: Object.freeze({}) }), findings: Object.freeze([]) });
  const all: any[] = ([] as any[]).concat(discoverGaps(inv), discoverUnmetDeps(inv), discoverDuplicates(inv), discoverReuse(inv));
  all.sort((a: any, b: any) => (b.priority - a.priority) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (String(a.subject) < String(b.subject) ? -1 : 1));
  const byKind: any = {}; for (const f of all) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  const verdict = all.length === 0 ? "NONE" : (all.some((f: any) => f.verdict === "CONFIRMED") ? "CONFIRMED" : "HYPOTHESIS");
  return Object.freeze({ summary: Object.freeze({ verdict, total: all.length, byKind: Object.freeze(byKind) }), findings: Object.freeze(all) });
}

const DISCOVERY_ENGINE_CONTRACT = Object.freeze({
  id: "GM-CI-8-DISCOVERY-ENGINE",
  source: "FICHE §21/§22 (autonomous discovery) + §42 (capability discovery); supersedes the src/core BOAMP stub's capability-discovery role (stub preserved for its external-source concern)",
  verdicts: VERDICTS, kinds: KINDS,
  notAuthority: "read-only analytic lens over a supplied inventory; discovers nothing externally, performs no I/O, mutates nothing; findings are hypotheses unless a hard structural fact holds",
  invariants: Object.freeze([
    "pure/deterministic: inventory in → prioritised findings out; no clock/random/network; sorted",
    "a finding is a HYPOTHESIS to verify unless a hard structural fact (absent dep / explicit duplicateOf) ⇒ CONFIRMED",
    "declared ≠ implemented ≠ tested ≠ verified ≠ operational — maturity drives gap confidence (§13)",
    "prefers reuse over reconstruction (§139); flags consolidation (§110)",
  ]),
});

module.exports = {
  VERDICTS, KINDS, DISCOVERY_ENGINE_CONTRACT,
  discoverGaps, discoverUnmetDeps, discoverDuplicates, discoverReuse, discover,
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(DISCOVERY_ENGINE_CONTRACT, null, 2) + "\n");
}

export {};
