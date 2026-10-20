/**
 * opportunity-detector — PURE normalize + dedupe + grade + rank pipeline for high-value commercial opportunities
 * (AUTOMATED_ENTERPRISE_OPPORTUNITY_DETECTOR_V1). It does NOT fetch — collection is done by the caller (the only
 * component with network access); this module PROCESSES already-collected raw items and fabricates nothing.
 *
 * Reuses the existing, proven modules (no parallel logic):
 *   - enterprise-lead-grade.gradeLead  → A/B/C/REJECTED + anti-scam (§3/§4)
 *   - opportunity-policy.classifyOne    → budget-field PROVENANCE (OBSERVED/PROVEN vs REJECTED by 2xx source)
 *   - revenue-model.targetPlan          → delivery-capacity feasibility per opportunity
 *
 * Honesty: a missing deadline/budget is flagged, never guessed. A past deadline is flagged (kept, not hidden).
 * Grade evidence is conservative: a non-official source (job board) is NOT registry-verified ⇒ capped at C until a
 * human/registry check upgrades it (§3). A published budget is provenance-checked, never assumed available to us.
 */

function req(name: string): any { try { return require("./" + name); } catch { return null; } }
const LEAD: any = req("enterprise-lead-grade");
const POLICY: any = req("opportunity-policy");
const REV: any = req("revenue-model");

function str(v: any): string | null { return typeof v === "string" && v.trim() ? v.trim() : null; }

function normalizeOpportunity(raw: any, nowMs: number): any {
  const r = raw && typeof raw === "object" ? raw : {};
  const url = str(r.url);
  const deadline = str(r.deadline);
  const deadlineMs = deadline ? Date.parse(deadline) : NaN;
  const deadlineDays = Number.isFinite(deadlineMs) && Number.isFinite(nowMs) ? Math.floor((deadlineMs - nowMs) / 86400000) : null;
  const missing: string[] = [];
  for (const k of ["buyer", "subject", "url", "publishedAt", "deadline", "budgetEur"]) {
    const v = (r as any)[k];
    if (v === undefined || v === null || v === "" || (k === "budgetEur" && !Number.isFinite(Number(v)))) missing.push(k);
  }
  return {
    id: str(r.id) || str(r.ref) || url || (str(r.buyer) + "|" + str(r.subject)),
    ref: str(r.ref),
    buyer: str(r.buyer),
    subject: str(r.subject),
    sourceType: str(r.sourceType) || "unknown",
    source: str(r.source),
    url,
    httpStatus: Number.isFinite(Number(r.httpStatus)) ? Number(r.httpStatus) : null,
    publishedAt: str(r.publishedAt),
    deadline,
    deadlineDays,
    deadlinePassed: deadlineDays !== null ? deadlineDays < 0 : null,
    budgetEur: Number.isFinite(Number(r.budgetEur)) ? Number(r.budgetEur) : null,
    budgetKind: Number.isFinite(Number(r.budgetEur)) ? (str(r.budgetKind) || "published") : "unknown",
    contentHash: str(r.contentHash),
    lastCheckedAt: str(r.lastCheckedAt),
    scamFlags: Array.isArray(r.scamFlags) ? r.scamFlags.filter(Boolean) : [],
    missing,
  };
}

function dedupeOpportunities(list: any): any {
  const seen = new Set();
  const out: any[] = [];
  let dropped = 0;
  for (const o of Array.isArray(list) ? list : []) {
    // Prefer a stable per-item reference; else url+buyer+subject (a SHARED listing url must not collapse distinct
    // items — the real-feed failure mode where many items carry the same listing-page URL).
    const key = (o && (o.ref || [o.url, o.buyer, o.subject].map((x: any) => x || "").join("|"))) || JSON.stringify(o);
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key); out.push(o);
  }
  return { list: out, dropped };
}

function evidenceFrom(rec: any): any {
  const officialOrCompany = rec.sourceType === "official-tender" || rec.sourceType === "company";
  return {
    existenceVerified: officialOrCompany === true,
    needEvidence: "explicit",
    budget: rec.budgetEur !== null ? (rec.budgetKind === "published" ? "published" : "qualified-estimate") : "unknown",
    decisionMakerIdentified: rec.sourceType === "official-tender",
    contradictions: false,
    scamFlags: rec.scamFlags,
  };
}

function budgetProvenance(rec: any): any {
  if (!POLICY || rec.budgetEur === null || !rec.url) return { verification_status: "N/A", reason: "no budget/url to verify" };
  const opp = { id: rec.id, identity: { name: rec.buyer }, fields: [{ name: "budgetEur", value: rec.budgetEur, source_url: rec.url }] };
  // Observation MUST carry `field` so the policy matches it; `content_hash` (+ status OBSERVED) is required for
  // PROVEN — only a caller that actually extracted+hashed the source can supply it. Honest outcomes: non-2xx ⇒
  // REJECTED (fail-closed); 2xx with a content hash ⇒ PROVEN; 2xx without extraction ⇒ CANDIDATE (seen, not proven).
  const obs: any = { url: rec.url, field: "budgetEur", http_status: rec.httpStatus, fetched_at: rec.lastCheckedAt || null };
  if (typeof rec.contentHash === "string" && rec.contentHash) { obs.status = "OBSERVED"; obs.content_hash = rec.contentHash; obs.raw = String(rec.budgetEur); }
  try { const c = POLICY.classifyOne(opp, [obs], {}); return { verification_status: c.verification_status, reason: c.reason }; }
  catch { return { verification_status: "N/A", reason: "policy error" }; }
}

function scoreOpportunity(rec: any, grade: string, feasible: any): number {
  const gradeW = ({ A: 100, B: 60, C: 20, REJECTED: -1000 } as any)[grade] || 0;
  const valueW = rec.budgetEur ? Math.min(40, Math.log10(rec.budgetEur) * 6) : 0;
  const urgencyW = rec.deadlineDays === null ? 0 : (rec.deadlinePassed ? -50 : Math.max(0, 20 - rec.deadlineDays));
  const feasW = feasible === true ? 15 : (feasible === false ? -10 : 0);
  return Math.round(gradeW + valueW + urgencyW + feasW);
}

function detect(rawItems: any, opts: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const nowMs = Number.isFinite(o.nowMs) ? o.nowMs : NaN;
  const normalized = (Array.isArray(rawItems) ? rawItems : []).map((x: any) => normalizeOpportunity(x, nowMs));
  const { list, dropped } = dedupeOpportunities(normalized);
  const shortlist = list.map((rec: any) => {
    const grade = LEAD ? LEAD.gradeLead(evidenceFrom(rec)).grade : "C";
    const provenance = budgetProvenance(rec);
    let feasible: any = null;
    if (REV && rec.budgetEur) {
      const plan = REV.targetPlan({
        targetRevenue: rec.budgetEur, avgContractValue: rec.budgetEur,
        conversionRate: Number.isFinite(o.conversionRate) ? o.conversionRate : 0.2,
        deliveryDaysPerContract: Number.isFinite(o.deliveryDaysPerContract) ? o.deliveryDaysPerContract : 15,
        capacityDaysPerPeriod: Number.isFinite(o.capacityDaysPerPeriod) ? o.capacityDaysPerPeriod : 20,
      });
      feasible = plan.ok ? !plan.capacityExceeded : null;
    }
    const score = scoreOpportunity(rec, grade, feasible);
    const nextAction = grade === "REJECTED" ? "DROP (scam/contradiction)"
      : rec.sourceType === "job-board" && grade === "C" ? "VERIFY company in official registry (RNE) to upgrade, then subcontracting outreach (CTO GO)"
      : grade === "A" || grade === "B" ? "QUALIFY: verify buyer+eligibility, draft proposal (send human-gated)"
      : "MONITOR (insufficient evidence)";
    return { ...rec, grade, provenance, feasible, score, nextAction };
  }).sort((a: any, b: any) => b.score - a.score);
  const counts = { total: normalized.length, deduped: shortlist.length, duplicatesDropped: dropped,
    byGrade: shortlist.reduce((m: any, r: any) => { m[r.grade] = (m[r.grade] || 0) + 1; return m; }, {}) };
  return { shortlist, counts };
}

module.exports = { normalizeOpportunity, dedupeOpportunities, evidenceFrom, budgetProvenance, scoreOpportunity, detect };
export {};
