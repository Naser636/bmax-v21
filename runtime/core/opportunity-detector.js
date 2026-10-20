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

function req(name) { try { return require("./" + name); } catch { return null; } }
const LEAD = req("enterprise-lead-grade");
const POLICY = req("opportunity-policy");
const REV = req("revenue-model");
const crypto = require("crypto");

function str(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }

// Reuse the sha256 primitive (same as evidence-provenance). Hash of the raw fetched content bytes.
function sha256(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }

/**
 * verifyWebProvenance — reproducible, 4-DIMENSION provenance of a fetched web claim (WEB_PROVENANCE_VERIFICATION_V1).
 * Dimensions are kept SEPARATE and NEVER conflated:
 *   (a) retrieval   — HTTP 2xx (technical fetch succeeded).
 *   (b) integrity   — content hash vs a previously-recorded baseline: MATCH (verified, tamper-evident) /
 *                     MISMATCH (content changed since capture) / FIRST_CAPTURE (baseline recorded, not yet verified) /
 *                     NO_CONTENT. **Integrity proves the BYTES are unchanged — NOT that the information is true.**
 *   (c) freshness   — FRESH/STALE/UNKNOWN from lastCheckedAt vs maxAgeDays.
 *   (d) businessPresence — whether the claimed value's string appears in the content: a WEAK locate signal, NOT authenticity.
 * Verdict: PROVEN only when retrieval ok + content present + integrity===MATCH (reproducibly re-verified against the
 * recorded hash). FIRST_CAPTURE ⇒ CANDIDATE (baseline recorded, verification pending a re-check). non-2xx / empty /
 * MISMATCH ⇒ REJECTED (fail-closed). Returns the recomputed hash so the caller can PERSIST it as the next baseline.
 */
function verifyWebProvenance(input) {
  const i = input && typeof input === "object" ? input : {};
  const nowMs = Number.isFinite(i.nowMs) ? i.nowMs : NaN;
  const maxAgeDays = Number.isFinite(i.maxAgeDays) ? i.maxAgeDays : 7;
  const retrievalOk = typeof i.httpStatus === "number" && i.httpStatus >= 200 && i.httpStatus <= 299;
  const content = typeof i.content === "string" ? i.content : null;
  const contentPresent = !!(content && content.trim());
  const computedHash = contentPresent ? sha256(content) : null;
  let integrity;
  if (!contentPresent) integrity = "NO_CONTENT";
  else if (typeof i.expectedHash === "string" && i.expectedHash) integrity = computedHash === i.expectedHash ? "MATCH" : "MISMATCH";
  else integrity = "FIRST_CAPTURE";
  const t = i.lastCheckedAt ? Date.parse(i.lastCheckedAt) : NaN;
  const ageDays = Number.isFinite(t) && Number.isFinite(nowMs) ? Math.floor((nowMs - t) / 86400000) : null;
  const freshness = ageDays === null ? "UNKNOWN" : (ageDays <= maxAgeDays ? "FRESH" : "STALE");
  const businessPresence = (i.value !== undefined && i.value !== null && content)
    ? (content.includes(String(i.value)) ? "PRESENT" : "ABSENT") : "UNKNOWN";
  let verdict;
  if (!retrievalOk || !contentPresent || integrity === "MISMATCH") verdict = "REJECTED";
  else if (integrity === "MATCH") verdict = "PROVEN";
  else verdict = "CANDIDATE"; // FIRST_CAPTURE
  return {
    verdict, retrievalOk, contentPresent, computedHash, integrity, freshness, ageDays, businessPresence,
    note: "PROVEN = 2xx + content + integrity re-verified vs recorded hash. Integrity proves BYTES unchanged, NOT information authenticity; businessPresence is a weak locate signal, not truth.",
  };
}

/** Map a raw collected item to a canonical opportunity record. nowMs drives deadline freshness (no Date in-module). */
function normalizeOpportunity(raw, nowMs) {
  const r = raw && typeof raw === "object" ? raw : {};
  const url = str(r.url);
  const deadline = str(r.deadline);
  const deadlineMs = deadline ? Date.parse(deadline) : NaN;
  const deadlineDays = Number.isFinite(deadlineMs) && Number.isFinite(nowMs) ? Math.floor((deadlineMs - nowMs) / 86400000) : null;
  const missing = [];
  for (const k of ["buyer", "subject", "url", "publishedAt", "deadline", "budgetEur"]) {
    const v = r[k];
    if (v === undefined || v === null || v === "" || (k === "budgetEur" && !Number.isFinite(Number(v)))) missing.push(k);
  }
  return {
    id: str(r.id) || str(r.ref) || url || (str(r.buyer) + "|" + str(r.subject)),
    ref: str(r.ref),
    buyer: str(r.buyer),
    subject: str(r.subject),
    sourceType: str(r.sourceType) || "unknown",     // "official-tender" | "job-board" | "company" | ...
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
    content: typeof r.content === "string" ? r.content : null,   // raw fetched content (for integrity hash); not persisted in shortlist
    expectedHash: str(r.expectedHash),                          // previously-recorded baseline hash (enables PROVEN)
    lastCheckedAt: str(r.lastCheckedAt),
    scamFlags: Array.isArray(r.scamFlags) ? r.scamFlags.filter(Boolean) : [],
    missing,
  };
}

/** Dedupe by url (fallback buyer|subject). Keeps the FIRST occurrence; counts duplicates dropped. */
function dedupeOpportunities(list) {
  const seen = new Set();
  const out = [];
  let dropped = 0;
  for (const o of Array.isArray(list) ? list : []) {
    // Prefer a stable per-item reference; else url+buyer+subject (a SHARED listing url must not collapse distinct
    // items — the real-feed failure mode where many items carry the same listing-page URL).
    const key = (o && (o.ref || [o.url, o.buyer, o.subject].map((x) => x || "").join("|"))) || JSON.stringify(o);
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key); out.push(o);
  }
  return { list: out, dropped };
}

/** Conservative grade-evidence from a normalized record (§3 discipline). */
function evidenceFrom(rec) {
  const officialOrCompany = rec.sourceType === "official-tender" || rec.sourceType === "company";
  return {
    existenceVerified: officialOrCompany === true,           // job-board ⇒ false until registry-verified ⇒ caps at C
    needEvidence: "explicit",                                // a tender / active job post IS an explicit current need
    budget: rec.budgetEur !== null ? (rec.budgetKind === "published" ? "published" : "qualified-estimate") : "unknown",
    decisionMakerIdentified: rec.sourceType === "official-tender",  // official procurement channel; else unknown
    contradictions: false,
    scamFlags: rec.scamFlags,
  };
}

/** Provenance of the budget field via opportunity-policy (was its source really fetched 2xx?). */
function budgetProvenance(rec) {
  if (!POLICY || rec.budgetEur === null || !rec.url) return { verification_status: "N/A", reason: "no budget/url to verify" };
  const opp = { id: rec.id, identity: { name: rec.buyer }, fields: [{ name: "budgetEur", value: rec.budgetEur, source_url: rec.url }] };
  // Observation MUST carry `field` so the policy matches it; `content_hash` (+ status OBSERVED) is required for
  // PROVEN — only a caller that actually extracted+hashed the source can supply it. Honest outcomes: non-2xx ⇒
  // REJECTED (fail-closed); 2xx with a content hash ⇒ PROVEN; 2xx without extraction ⇒ CANDIDATE (seen, not proven).
  const obs = { url: rec.url, field: "budgetEur", http_status: rec.httpStatus, fetched_at: rec.lastCheckedAt || null };
  if (typeof rec.contentHash === "string" && rec.contentHash) { obs.status = "OBSERVED"; obs.content_hash = rec.contentHash; obs.raw = String(rec.budgetEur); }
  try { const c = POLICY.classifyOne(opp, [obs], {}); return { verification_status: c.verification_status, reason: c.reason }; }
  catch { return { verification_status: "N/A", reason: "policy error" }; }
}

/** Transparent priority score. Higher = act sooner. Documented weights; no hidden magic. */
function scoreOpportunity(rec, grade, feasible) {
  const gradeW = { A: 100, B: 60, C: 20, REJECTED: -1000 }[grade] || 0;
  const valueW = rec.budgetEur ? Math.min(40, Math.log10(rec.budgetEur) * 6) : 0;   // log-scaled, capped
  const urgencyW = rec.deadlineDays === null ? 0 : (rec.deadlinePassed ? -50 : Math.max(0, 20 - rec.deadlineDays)); // sooner (not past) = higher
  const feasW = feasible === true ? 15 : (feasible === false ? -10 : 0);
  return Math.round(gradeW + valueW + urgencyW + feasW);
}

/**
 * Full detection over raw items. opts: { nowMs, capacityDaysPerPeriod, deliveryDaysPerContract, conversionRate }.
 * Returns a ranked shortlist with grade, provenance, feasibility, score, honest flags, and a recommended action.
 */
function detect(rawItems, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const nowMs = Number.isFinite(o.nowMs) ? o.nowMs : NaN;
  const normalized = (Array.isArray(rawItems) ? rawItems : []).map((x) => normalizeOpportunity(x, nowMs));
  const { list, dropped } = dedupeOpportunities(normalized);
  const shortlist = list.map((rec) => {
    const grade = LEAD ? LEAD.gradeLead(evidenceFrom(rec)).grade : "C";
    const provenance = budgetProvenance(rec);
    // Content-integrity provenance (reproducible, 4-dimension) — distinct from the budget-field 2xx policy check.
    const contentProvenance = verifyWebProvenance({
      httpStatus: rec.httpStatus, content: rec.content, expectedHash: rec.expectedHash,
      value: rec.budgetEur, lastCheckedAt: rec.lastCheckedAt, nowMs: nowMs, maxAgeDays: o.maxAgeDays,
    });
    let feasible = null;
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
    // Do NOT persist raw fetched content in the shortlist — keep only the computed hash (baseline for next check).
    const { content, expectedHash, ...recPublic } = rec; // eslint-disable-line no-unused-vars
    return { ...recPublic, grade, provenance, contentProvenance, feasible, score, nextAction };
  }).sort((a, b) => b.score - a.score);
  const counts = { total: normalized.length, deduped: shortlist.length, duplicatesDropped: dropped,
    byGrade: shortlist.reduce((m, r) => { m[r.grade] = (m[r.grade] || 0) + 1; return m; }, {}) };
  return { shortlist, counts };
}

module.exports = { normalizeOpportunity, dedupeOpportunities, evidenceFrom, budgetProvenance, verifyWebProvenance, sha256, scoreOpportunity, detect };
