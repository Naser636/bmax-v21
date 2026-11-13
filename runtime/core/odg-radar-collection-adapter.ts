#!/usr/bin/env node
"use strict";
/*
 * V187 §3/§5/§6 — radar-OWNED collection adapter. PURE, deterministic, fail-closed. NOT a second radar — the governed
 * COLLECTION interface the existing radar lacked (the weekly-scheduler's doUnit seam is explicitly no-egress; the
 * radar's OPPORTUNITIES are static records). This adapter makes the radar the OWNER of the path
 * SOURCE → COLLECT → PROVENANCE → QUALIFY → DEDUP → COMPARE → OPPORTUNITY → PROPOSAL, with the external-research
 * provider INJECTED through one controlled seam (deny-by-default: no provider ⇒ BLOCKED, autonomous egress NOT_MEASURED).
 *
 * HONEST BOUNDARY: this module performs NO network egress itself. The only authorized egress in this environment is the
 * grant-V141 WebSearch tool operated by the technical provider and INJECTED via opts.fetcher; the radar owns provenance,
 * qualification and proposal. The radar's FULLY-autonomous self-egress (no human tool in the loop) is NOT_MEASURED and
 * requires an owner-gated runtime binding. We never present an injected/synthetic result as radar-native autonomous egress.
 */

const RADAR = require("./odg-global-opportunity-radar.js");
const LOOP = require("./odg-radar-to-mission-loop.js");

const STATE = Object.freeze(["COLLECTED_REAL", "ANALYZED_REAL", "QUALIFIED_REAL", "PROPOSED", "OWNER_GATED", "REFUSED", "NOT_MEASURED", "BLOCKED"]);

/* grant validation before any use (expiry + budget) — §5.B. */
function validateGrant(grant: any, nowEpochMs: number): any {
  if (!grant || grant.authorized !== true) return Object.freeze({ ok: false, code: "NO_GRANT" });
  if (!Number.isFinite(nowEpochMs) || nowEpochMs <= 0) return Object.freeze({ ok: false, code: "NO_CLOCK" });
  if (nowEpochMs >= Number(grant.expiresMs)) return Object.freeze({ ok: false, code: "GRANT_EXPIRED" });
  const maxCalls = grant.budget && Number(grant.budget.maxCalls);
  return Object.freeze({ ok: true, maxCalls: Number.isFinite(maxCalls) ? maxCalls : 0 });
}

/* collect — the single controlled collection seam. opts.fetcher is the INJECTED authorized provider: (query)=>records[].
 * Deny-by-default: no fetcher ⇒ BLOCKED (autonomous egress NOT_MEASURED). Records get provenance + a real/synthetic tag. */
function collect(query: string, opts: any): any {
  const o = opts || {};
  const g = validateGrant(o.grant, Number(o.nowEpochMs));
  if (!g.ok) return Object.freeze({ query, state: "BLOCKED", reason: g.code, records: Object.freeze([]), autonomousEgress: "NOT_MEASURED" });
  if (typeof o.fetcher !== "function") return Object.freeze({ query, state: "BLOCKED", reason: "NO_INJECTED_PROVIDER", note: "external access must go through an injected authorized provider; the radar does not self-egress here", records: Object.freeze([]), autonomousEgress: "NOT_MEASURED" });
  if (o.callsUsed != null && o.callsUsed >= g.maxCalls) return Object.freeze({ query, state: "BLOCKED", reason: "BUDGET_EXHAUSTED", records: Object.freeze([]) });
  const raw = o.fetcher(query) || [];
  const records = (Array.isArray(raw) ? raw : []).map((r: any) => Object.freeze({
    org: r.org, url: r.url, title: r.title, consultedDate: r.consultedDate, provenance: r.provenance || "OBSERVED_EVIDENCE",
    providerTag: r.providerTag || "grant-V141-websearch (injected authorized provider)",
    real: r.synthetic === true ? false : true,
  }));
  const anyReal = records.some((r: any) => r.real);
  return Object.freeze({ query, state: anyReal ? "COLLECTED_REAL" : "NOT_MEASURED", records: Object.freeze(records), count: records.length, autonomousEgress: "NOT_MEASURED (radar self-egress needs an owner-gated runtime binding; here the provider is injected)" });
}

/* dedup across already-seen URLs. */
function dedup(records: any[], seen: Set<string>): any {
  const fresh: any[] = [], dups: any[] = [];
  for (const r of records) { const k = String(r.url || r.title); if (seen.has(k)) dups.push(r); else { seen.add(k); fresh.push(r); } }
  return { fresh, dupCount: dups.length };
}

/* runCampaign — the radar-owned pipeline over a batch of {metier, query} items. Produces §6 campaign evidence.
 * signal = {metier, buySignal, provenance, sources, segmentFit, budgetEvidence, regulatoryUrgency, ownerGatedKind?}. */
function runCampaign(campaign: any): any {
  const nowEpochMs = Number(campaign && campaign.nowEpochMs) || 0;
  const items = Array.isArray(campaign && campaign.items) ? campaign.items : [];
  const seen = new Set<string>();
  let callsUsed = 0;
  const runs = items.map((it: any, i: number) => {
    const c = collect(it.query, { grant: campaign.grant, nowEpochMs, fetcher: campaign.fetcher, callsUsed });
    if (c.state === "COLLECTED_REAL") callsUsed++;
    const d = dedup(c.records, seen);
    // build a radar signal from the collected records + the item's declared buy-signal, then qualify+gate via existing engines
    const signal = Object.freeze({ id: `${campaign.id}:${it.metier}`, metier: it.metier, buySignal: it.buySignal || "NONE", provenance: d.fresh.length ? "OBSERVED_EVIDENCE" : "HYPOTHESIS", sources: d.fresh.map((r: any) => r.url), consultedEpochMs: nowEpochMs, segmentFit: it.segmentFit || 0, budgetEvidence: it.budgetEvidence || "NONE", regulatoryUrgency: it.regulatoryUrgency || 0, metiers: [it.metier], ownerGatedKind: it.ownerGatedKind });
    const reliability = RADAR.validationTier(signal); // VALIDATED_MARKET_SIGNAL | INSUFFICIENTLY_VALIDATED
    const a = LOOP.assess(signal, nowEpochMs);
    const q = LOOP.qualify(signal);
    const att = LOOP.attachMetiers(signal);
    const gate = LOOP.governanceGate(signal, a, q, att, null);
    const analyzed = c.state === "COLLECTED_REAL" ? "ANALYZED_REAL" : "NOT_MEASURED";
    const qualified = c.state === "COLLECTED_REAL" ? "QUALIFIED_REAL" : "NOT_MEASURED";
    return Object.freeze({
      runId: `${campaign.id}:run:${i}`, metier: it.metier, query: it.query,
      collectState: c.state, analyzed, qualified, reliability,
      sourcesExamined: c.count || 0, sourcesRetained: d.fresh.length, duplicates: d.dupCount,
      opportunityVerdict: gate.verdict, autonomousEgress: c.autonomousEgress,
    });
  });
  const byVerdict: any = {}; for (const v of LOOP.GATE) byVerdict[v] = 0; for (const r of runs) if (r.opportunityVerdict) byVerdict[r.opportunityVerdict] = (byVerdict[r.opportunityVerdict] || 0) + 1;
  return Object.freeze({
    campaignId: campaign.id, itemCount: items.length, callsUsed, runs: Object.freeze(runs),
    byVerdict: Object.freeze(byVerdict),
    autonomousEgress: "NOT_MEASURED (provider injected; radar self-egress is OWNER_GATED)",
    note: "radar-OWNED pipeline: collect(injected authorized provider)→provenance→qualify(radar.validationTier)→dedup→opportunity→gate(V184). PROPOSED ≠ AUTHORIZED; no canonical write; no execution.",
  });
}

function autonomousEgressStatus(): any {
  return Object.freeze({ status: "NOT_MEASURED", reason: "the radar performs no network egress itself; the authorized provider (grant-V141 WebSearch) is injected by the technical provider. Fully-autonomous radar egress requires an owner-gated runtime binding — not installed.", ownerGated: true });
}

const RADAR_COLLECTION_ADAPTER_CONTRACT = Object.freeze({
  id: "V187-RADAR-COLLECTION-ADAPTER",
  purpose: "§3/§5/§6 — give the EXISTING radar a governed collection interface it owns; external access only via one injected authorized seam",
  invariants: Object.freeze([
    "NOT a second radar/scheduler — a collection interface over the existing radar + V184 loop",
    "deny-by-default: no injected authorized provider ⇒ BLOCKED; grant validated (expiry+budget) before use",
    "radar OWNS provenance/qualification/proposal; a score is never an authorization; PROPOSED ≠ AUTHORIZED ≠ EXECUTED",
    "radar autonomous self-egress = NOT_MEASURED (OWNER_GATED runtime binding); injected/synthetic never presented as autonomous egress",
    "no canonical register write; no execution; deterministic (injected nowEpochMs); external content untrusted",
  ]),
});

module.exports = { STATE, validateGrant, collect, dedup, runCampaign, autonomousEgressStatus, RADAR_COLLECTION_ADAPTER_CONTRACT };
export {};
