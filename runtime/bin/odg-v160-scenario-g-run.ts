#!/usr/bin/env node
"use strict";
/*
 * V16.0 — SCENARIO G (V15.0 §45): "ODG retrouve une connaissance, vérifie sa fraîcheur, sa provenance et ses conditions,
 * puis démontre son utilité." First REAL use of admitted knowledge in a mission decision. Offline, deterministic.
 *
 *  1. RETRIEVE: the pinned V160 collection (docs/odg/evidence/V160_PRACTICES_COLLECTION.json) is authenticated against its
 *     COLLECTION_REGISTRY pin (odg-knowledge-intelligence.attestCollection) and the two Google eng-practices claims about
 *     change size (G_SMALL_ONE "one self-contained change", G_SMALL_SIZE "100 lines is usually a reasonable size") are
 *     re-assessed IN-PROCESS with the canonical path (assessClaim → toMemory), reusing the V160 authored keys.
 *  2. CHECK: provenance + freshness + conditions at USE time via usableFor(mem, "DESIGN_PROPOSAL", now, {assessment}) —
 *     the decision may only be a DESIGN_PROPOSAL (what the knowledge authorizes); a stale/ungrounded record ⇒ refused.
 *  3. USE: the mission question is ODG's own — "should ODG bound the size of delegated changes?". The knowledge is a
 *     single-source official statement (SUPPORTED, not a fact); ODG tests whether ITS OWN history agrees, on a committed
 *     snapshot of 400 merged PRs (docs/odg/evidence/V160_SCENARIO_G_PR_HISTORY.json), with the canonical
 *     odg-rank-correlation (Spearman) — size vs open→merge minutes and vs commit count (a proxy for fix cycles).
 *  4. DECIDE with a rule PRE-REGISTERED here (written before the analysis was run):
 *       ADOPT_AS_PROPOSAL iff  spearman(size, minutes) ≥ 0.3  AND  spearman(size, commits) ≥ 0.3
 *                         AND median(minutes | size > 1000) > median(minutes | size ≤ 100)
 *       otherwise NOT_ADOPTED (knowledge not confirmed on ODG's data).
 *     Correlation ≠ causation: an ADOPT is a DESIGN_PROPOSAL (a size-budget advisory), never an enforced rule.
 * Writes docs/odg/evidence/V160_SCENARIO_G.json (--write) or re-derives and compares (--check, exit 1 on drift).
 */
const fs = require("fs");
const path = require("path");
const K = require("../core/odg-knowledge-intelligence.js");
const RC = require("../core/odg-rank-correlation.js");
const KR = require("./odg-v160-practices-knowledge-run.ts");

const ROOT = path.resolve(__dirname, "..", "..");
const COL = "docs/odg/evidence/V160_PRACTICES_COLLECTION.json";
const REG = "docs/odg/evidence/COLLECTION_REGISTRY.json";
const HIST = "docs/odg/evidence/V160_SCENARIO_G_PR_HISTORY.json";
const OUT = "docs/odg/evidence/V160_SCENARIO_G.json";
const CLAIMS = Object.freeze(["G_SMALL_ONE", "G_SMALL_SIZE"]);
const RULE = Object.freeze({ minSpearmanMinutes: 0.3, minSpearmanCommits: 0.3, smallMax: 100, largeMin: 1000 });
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const median = (a: number[]): number | null => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** retrieve + check: canonical in-process re-assessment of the chosen claims, then usableFor at USE time. */
function retrieveAndCheck(useAt: number): any {
  const col = readJson(COL); const reg = readJson(REG);
  const pins = (reg.collections || []).filter((c: any) => c.path === COL).map((c: any) => c.sha256);
  const collection = K.attestCollection(col, { pinnedDigests: pins });
  if (!collection.attested) return { ok: false, reason: "collection NOT authenticated against COLLECTION_REGISTRY — refusing to use it" };
  const asOf = Date.parse(col.consultedDate + "T12:00:00Z");
  const out: any[] = [];
  for (const id of CLAIMS) {
    const cy = (col.cycles || []).find((c: any) => String(c.query).endsWith(":: " + id));
    const st = KR.STRUCT[id];
    if (!cy || !st) { out.push({ id, status: "NOT_FOUND" }); continue; }
    const a = K.assessClaim({ ...st, nature: "OFFICIAL_DOCUMENTATION", text: cy.claim, sources: (cy.support || []).map((sp: any) => ({ url: sp.url, citation: sp.quote, structured: st })) },
      { asOfEpochMs: asOf, collection, quarantined: [], missionAuthorization: "DESIGN_PROPOSAL" });
    const mem = K.toMemory(a, asOf);
    const use = K.usableFor(mem, "DESIGN_PROPOSAL", useAt, { assessment: a });
    out.push({ id, claim: cy.claim, url: (cy.support || [])[0] && cy.support[0].url, epistemic: a.dimensions.epistemic, isFact: a.isFact === true,
      provenance: use.attestedBy || null, useAuthorization: use.authorization, useReason: use.reason, validUntil: Number.isFinite(mem.validUntil) ? new Date(mem.validUntil).toISOString() : null });
  }
  const usable = out.length === CLAIMS.length && out.every((x) => x.useAuthorization === "DESIGN_PROPOSAL");
  return { ok: usable, reason: usable ? "both claims SUPPORTED, provenance via the pinned collection, fresh at use time, authorized for DESIGN_PROPOSAL" : "a claim is missing, stale, ungrounded or not authorized for DESIGN_PROPOSAL", claims: out };
}

/** measure: ODG's own merged-PR history (committed snapshot). Pure. */
function measure(hist: any): any {
  const prs = (hist && Array.isArray(hist.prs) ? hist.prs : []).filter((p: any) => Number.isFinite(p.additions) && Number.isFinite(p.deletions) && typeof p.createdAt === "string" && typeof p.mergedAt === "string" && Number.isFinite(p.commits));
  const rows = prs.map((p: any) => ({ number: p.number, size: p.additions + p.deletions, minutes: (Date.parse(p.mergedAt) - Date.parse(p.createdAt)) / 60000, commits: p.commits }))
    .filter((r: any) => Number.isFinite(r.minutes) && r.minutes >= 0);
  const sm = RC.spearman(rows.map((r: any) => r.size), rows.map((r: any) => r.minutes));
  const sc = RC.spearman(rows.map((r: any) => r.size), rows.map((r: any) => r.commits));
  const bucket = (f: (r: any) => boolean) => { const b = rows.filter(f); return { n: b.length, medianMinutes: median(b.map((r: any) => r.minutes)), medianCommits: median(b.map((r: any) => r.commits)) }; };
  return {
    n: rows.length, range: rows.length ? [Math.min(...rows.map((r: any) => r.number)), Math.max(...rows.map((r: any) => r.number))] : null,
    spearmanSizeMinutes: sm, spearmanSizeCommits: sc,
    buckets: { small_le_100: bucket((r) => r.size <= RULE.smallMax), medium_101_1000: bucket((r) => r.size > RULE.smallMax && r.size <= RULE.largeMin), large_gt_1000: bucket((r) => r.size > RULE.largeMin) },
  };
}

function decide(check: any, m: any): any {
  if (!check.ok) return { decision: "NOT_USED", reason: "knowledge not usable at use time: " + check.reason };
  const rm = m.spearmanSizeMinutes && Number.isFinite(m.spearmanSizeMinutes.rho) ? m.spearmanSizeMinutes.rho : null;
  const rc = m.spearmanSizeCommits && Number.isFinite(m.spearmanSizeCommits.rho) ? m.spearmanSizeCommits.rho : null;
  const ms = m.buckets.small_le_100.medianMinutes, ml = m.buckets.large_gt_1000.medianMinutes;
  if (rm === null || rc === null || ms === null || ml === null) return { decision: "NOT_MEASURABLE", reason: "insufficient data for the pre-registered rule" };
  const confirmed = rm >= RULE.minSpearmanMinutes && rc >= RULE.minSpearmanCommits && ml > ms;
  return confirmed
    ? { decision: "ADOPT_AS_PROPOSAL", proposal: "delegated missions should target one self-contained change and flag > 1000 changed lines for splitting (advisory, DESIGN_PROPOSAL — not an enforced rule)", reason: `ODG's own history agrees with the knowledge: spearman(size,minutes)=${rm}, spearman(size,commits)=${rc}, median minutes ${ms} (≤100) vs ${ml} (>1000)` }
    : { decision: "NOT_ADOPTED", reason: `pre-registered rule not met: spearman(size,minutes)=${rm}, spearman(size,commits)=${rc}, median minutes ${ms} (≤100) vs ${ml} (>1000)` };
}

function run(useAt: number): any {
  const check = retrieveAndCheck(useAt);
  const m = measure(readJson(HIST));
  const d = decide(check, m);
  return {
    scenario: "G", contract: "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#G", useAt: new Date(useAt).toISOString().slice(0, 10),
    rule: RULE, knowledge: check, measurement: m, decision: d,
    classification: d.decision === "ADOPT_AS_PROPOSAL" || d.decision === "NOT_ADOPTED" ? "REAL — admitted knowledge retrieved, checked at use time and used to decide an ODG design question on ODG's real data" : "NOT_MEASURABLE",
    honesty: [
      "correlational evidence on ODG's own PR history (confounded by task difficulty and by the inspection loop) — it CONFIRMS OR NOT the published guidance on ODG's data, it does not prove causation",
      "the knowledge is a single-source official statement (SUPPORTED), never a fact; the decision can only be a DESIGN_PROPOSAL",
      "provider (Claude Code) wrote this runner; the checks (attestation, usableFor, rank correlation) and the decision rule are executed by ODG components",
    ],
  };
}

if (require.main === module) {
  // the use date is pinned for reproducibility (re-running --check later must not drift with the clock)
  const useAt = Date.parse("2026-11-23T18:00:00Z");
  const text = JSON.stringify(run(useAt), null, 2) + "\n";
  if (process.argv.includes("--check")) {
    let cur = ""; try { cur = fs.readFileSync(path.join(ROOT, OUT), "utf8"); } catch { cur = ""; }
    process.stdout.write(cur === text ? "CHECK OK\n" : "CHECK FAILED — scenario G evidence drifts\n"); process.exitCode = cur === text ? 0 : 1;
  } else {
    if (process.argv.includes("--write")) fs.writeFileSync(path.join(ROOT, OUT), text);
    const r = JSON.parse(text); process.stdout.write(JSON.stringify({ knowledgeUsable: r.knowledge.ok, n: r.measurement.n, rhoMinutes: r.measurement.spearmanSizeMinutes && r.measurement.spearmanSizeMinutes.rho, rhoCommits: r.measurement.spearmanSizeCommits && r.measurement.spearmanSizeCommits.rho, buckets: r.measurement.buckets, decision: r.decision.decision }, null, 1) + "\n");
  }
}
module.exports = { retrieveAndCheck, measure, decide, run, RULE, CLAIMS };
export {};
