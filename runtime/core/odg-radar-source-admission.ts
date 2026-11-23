#!/usr/bin/env node
"use strict";
/*
 * V15.8 §3.3 — GOVERNED RADAR SOURCE ADMISSION. PURE, deterministic, deny-by-default.
 *
 * WHAT: turns a list of QUALIFIED candidate public sources (each with fetched evidence: robots.txt verdict for its exact
 * path prefixes, redirect behaviour observed on those prefixes, terms URL reviewed, documented rate limit, access type,
 * reputation tier) into (a) a per-candidate ADMIT / DEFER / REFUSE decision with reasons and an evidence hash, and (b) a
 * versioned research-governor GRANT in the canonical V16 shape (hostMatch:"EXACT", allowedPaths, ≤29-day expiry, GET only,
 * per-run budget). The grant is then consumed UNCHANGED by the existing chain: research-governor.govern() (authorized +
 * unexpired + EXACT host + path prefix) → research-budget.governWithBudget() → bounded-http-client (ODG_RADAR_LIVE kill-switch,
 * redirects blocked, SSRF guard, size cap) → stampFinding/sanitizeExternal (retrieved content = untrusted data).
 *
 * WHAT IT IS NOT: no second radar, no second governor, no network access, no mutation of the canonical bounded-http-client
 * ALLOWLIST, no universal allowance. It never admits a host on reputation alone: every admitted (host, prefix) needs fetched
 * robots/redirect/terms evidence. Discovery ≠ authorization: the produced grant is only as authorized as the directive that
 * issues it (recorded in issuedBy), and live egress still requires ODG_RADAR_LIVE=1.
 *
 * DESIGN INPUTS (research dossier V158, verified references): RFC 9309 (robots: 4xx ⇒ allow; 5xx/unreachable ⇒ disallow;
 * "not a form of access authorization"), OWASP SSRF prevention (no redirect following, exact allowlists), prompt-injection
 * literature (defences are partial ⇒ the GRANT, not retrieved content, must fix which hosts/paths are fetched).
 * Contradiction kept explicit: an API whose terms allow access but whose robots.txt disallows the path (export.arxiv.org)
 * is DEFERRED to the owner, never silently admitted either way.
 */
const crypto = require("crypto");

const DECISIONS = Object.freeze({ ADMIT: "ADMIT", DEFER: "DEFER", REFUSE: "REFUSE" });
const ROBOTS = Object.freeze({ ALLOW: "ALLOW", NO_ROBOTS_4XX: "NO_ROBOTS_4XX", DISALLOW: "DISALLOW", UNREACHABLE_5XX: "UNREACHABLE_5XX", REDIRECTED: "REDIRECTED", UNKNOWN: "UNKNOWN" });
const REDIRECT = Object.freeze({ NONE: "NONE", SAME_HOST: "SAME_HOST", OFF_HOST: "OFF_HOST", UNKNOWN: "UNKNOWN" });
const TIERS = Object.freeze(["T1", "T2"]);
const ACCESS_OK = Object.freeze(["ANONYMOUS_PUBLIC_API", "ANONYMOUS_PUBLIC_HTML"]);
const DEFAULT_POLICY = Object.freeze({
  maxHosts: 25,
  maxPrefixesPerHost: 6,
  expiryDays: 29,                // canonical ceiling is 30; renewal = a new versioned grant file
  budget: Object.freeze({ maxCalls: 30, maxBytes: 6000000, perResponseMaxBytes: 300000, timeoutMs: 15000 }),
  contentTypes: Object.freeze({ T1: Object.freeze(["application/json", "application/atom+xml", "application/xml", "text/html", "text/plain", "text/markdown"]), T2: Object.freeze(["application/json", "text/plain", "text/markdown"]) }),
});
// Host classes that are never admitted regardless of evidence (private/loopback/link-local/internal, raw IPs, shorteners,
// paste/file hosts — content there is anonymous-UGC with no provenance).
const NEVER_HOSTS = Object.freeze([/^localhost$/, /\.localhost$/, /\.local$/, /\.internal$/, /\.lan$/, /\.home\.arpa$/, /^(bit\.ly|t\.co|tinyurl\.com|goo\.gl|ow\.ly)$/, /(^|\.)pastebin\.com$/, /(^|\.)transfer\.sh$/]);

const isStr = (x: any): boolean => typeof x === "string" && x.length > 0;
function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }
function stable(o: any): string { return JSON.stringify(o, Object.keys(o || {}).sort()); }

/** A host must be a lower-case DNS name with ≥2 labels, no IP literal, no port, no wildcard, not a never-host. */
function validHost(h: any): { ok: boolean; reason?: string } {
  if (!isStr(h)) return { ok: false, reason: "HOST_MISSING" };
  if (h !== h.trim() || h !== h.toLowerCase()) return { ok: false, reason: "HOST_NOT_CANONICAL_LOWERCASE" };
  if (/[*:\/\\@\s%]/.test(h)) return { ok: false, reason: "HOST_HAS_FORBIDDEN_CHAR" };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^\[/.test(h)) return { ok: false, reason: "HOST_IS_IP_LITERAL" };
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return { ok: false, reason: "HOST_NOT_DNS_NAME" };
  if (NEVER_HOSTS.some((re) => re.test(h))) return { ok: false, reason: "HOST_CLASS_NEVER_ADMITTED" };
  return { ok: true };
}

/** A prefix must be an absolute, narrow, canonical path: starts with "/", not "/" alone, no dot-segments, no encoded
 *  separators, no query/fragment, no whitespace, and equal to its WHATWG-normalized form (what the governor compares). */
function validPrefix(p: any): { ok: boolean; reason?: string } {
  if (!isStr(p)) return { ok: false, reason: "PREFIX_MISSING" };
  if (!p.startsWith("/")) return { ok: false, reason: "PREFIX_NOT_ABSOLUTE" };
  if (p === "/" || /^\/+$/.test(p)) return { ok: false, reason: "PREFIX_TOO_BROAD" };
  if (/[?#\s\\]/.test(p)) return { ok: false, reason: "PREFIX_HAS_QUERY_FRAGMENT_OR_SPACE" };
  if (/%(2f|5c|25|2e)/i.test(p)) return { ok: false, reason: "PREFIX_HAS_ENCODED_SEPARATOR" };
  if (/(^|\/)\.\.?(\/|$)/.test(p) || p.includes("//")) return { ok: false, reason: "PREFIX_NOT_NORMALIZED" };
  let norm: string | null = null;
  try { norm = new URL("https://example.invalid" + p).pathname; } catch { norm = null; }
  if (norm !== p) return { ok: false, reason: "PREFIX_NOT_WHATWG_CANONICAL" };
  return { ok: true };
}

/** Decide ONE candidate. Deny-by-default: any missing/unknown evidence ⇒ DEFER (never ADMIT); a hard violation ⇒ REFUSE. */
function decideCandidate(c: any, policy: any = DEFAULT_POLICY): any {
  const refuse: string[] = [];
  const defer: string[] = [];
  const x = c && typeof c === "object" ? c : {};
  const hv = validHost(x.host);
  if (!hv.ok) refuse.push(hv.reason as string);
  if (x.scheme !== "https") refuse.push("NOT_HTTPS");
  // Hard-violation flags are TRI-STATE and STRICTLY typed: exactly `false` is the only verified-clean value; exactly `true`
  // ⇒ REFUSE; ABSENT or any other type ("true", 1, null…) ⇒ unverified ⇒ DEFER (deny-by-default never reads absence as clean).
  const FLAGS: [string, string][] = [["requiresAuth", "REQUIRES_AUTHENTICATION"], ["paid", "PAID_ACCESS"], ["termsForbidAutomation", "TERMS_FORBID_AUTOMATED_ACCESS"], ["botChallengeObserved", "BOT_CHALLENGE_OR_CAPTCHA_OBSERVED (never bypassed)"]];
  for (const [k, why] of FLAGS) {
    if (x[k] === true) refuse.push(why);
    else if (x[k] !== false) defer.push(`${k.toUpperCase()}_NOT_VERIFIED (must be explicitly false)`);
  }
  if (!ACCESS_OK.includes(x.access)) (x.access === undefined ? defer : refuse).push("ACCESS_TYPE_NOT_ANONYMOUS_PUBLIC:" + String(x.access));
  if (!TIERS.includes(x.tier)) defer.push("REPUTATION_TIER_UNKNOWN");
  if (x.termsVerified !== true) defer.push("TERMS_NOT_VERIFIED");
  if (!isStr(x.termsUrl)) defer.push("TERMS_URL_MISSING");
  const finitePos = (v: any): boolean => typeof v === "number" && Number.isFinite(v) && v > 0;
  // Rate limit: either a finite positive hourly figure, or rateLimitDocumented === false (verified: none published). Any
  // other shape (NaN, Infinity, negative, string, a non-boolean "documented" flag) ⇒ DEFER.
  if (x.rateLimitPerHour !== undefined && !finitePos(x.rateLimitPerHour)) defer.push("RATE_LIMIT_MALFORMED:" + String(x.rateLimitPerHour));
  else if (x.rateLimitPerHour === undefined && x.rateLimitDocumented !== false) defer.push("RATE_LIMIT_UNDOCUMENTED");
  if (x.rateLimitDocumented !== undefined && typeof x.rateLimitDocumented !== "boolean") defer.push("RATE_LIMIT_DOCUMENTED_FLAG_MALFORMED");
  if (isStr(x.ownerDecisionRequired)) defer.push("OWNER_DECISION_REQUIRED: " + x.ownerDecisionRequired);
  // Politeness that the transport cannot enforce today must not be promised: the chain enforces only a PER-RUN call budget,
  // not per-host pacing and not a cumulative cap. Any Crawl-delay, any per-second or concurrency limit, or an hourly limit
  // that fewer than 4 runs would exhaust ⇒ DEFER until per-host pacing exists (never admit a source we would over-call).
  const pacing = policy.perHostPacingEnforced === true;
  if (x.crawlDelaySeconds !== undefined) {
    if (!(typeof x.crawlDelaySeconds === "number" && Number.isFinite(x.crawlDelaySeconds) && x.crawlDelaySeconds >= 0)) defer.push("CRAWL_DELAY_MALFORMED:" + String(x.crawlDelaySeconds));
    else if (x.crawlDelaySeconds > 0 && !pacing) defer.push(`CRAWL_DELAY_${x.crawlDelaySeconds}s_NOT_ENFORCEABLE (no per-host pacing in the transport)`);
  }
  if (x.maxRequestsPerSecond !== undefined && !pacing) defer.push(`PER_SECOND_LIMIT_${String(x.maxRequestsPerSecond)}_NOT_ENFORCEABLE`);
  if (x.maxConcurrency !== undefined && !pacing) defer.push(`CONCURRENCY_LIMIT_${String(x.maxConcurrency)}_NOT_ENFORCEABLE`);
  if (finitePos(x.rateLimitPerHour) && x.rateLimitPerHour < 4 * policy.budget.maxCalls && !pacing) defer.push(`RATE_LIMIT_${x.rateLimitPerHour}/h_TOO_CLOSE_TO_RUN_BUDGET_${policy.budget.maxCalls} (no cumulative cap enforced)`);
  // Content types: the host's expected response types must all be grantable for its tier, else the host would be unusable
  // (or tempt a hand-widening). Absent ⇒ the tier default is assumed (recorded).
  const tierTypes: string[] = (policy.contentTypes[x.tier] || []) as string[];
  if (x.expectedContentTypes !== undefined) {
    if (!Array.isArray(x.expectedContentTypes) || !x.expectedContentTypes.every(isStr)) defer.push("EXPECTED_CONTENT_TYPES_MALFORMED");
    else for (const ct of x.expectedContentTypes) if (!tierTypes.includes(ct)) defer.push("CONTENT_TYPE_NOT_GRANTABLE:" + ct);
  }
  const prefixes: any[] = Array.isArray(x.prefixes) ? x.prefixes : [];
  if (prefixes.length === 0) refuse.push("NO_PATH_PREFIX (a host is never admitted without narrow paths)");
  if (prefixes.length > policy.maxPrefixesPerHost) refuse.push("TOO_MANY_PREFIXES");
  const admittedPrefixes: string[] = [];
  for (const pr of prefixes) {
    const p = pr && typeof pr === "object" ? pr : {};
    const pv = validPrefix(p.path);
    if (!pv.ok) { refuse.push(`${pv.reason}:${String(p.path)}`); continue; }
    if (p.robots === ROBOTS.DISALLOW) { refuse.push("ROBOTS_DISALLOWS:" + p.path); continue; }
    if (p.method !== undefined && p.method !== "GET") { defer.push(`NON_GET_ENDPOINT_${String(p.method)}:${p.path} (grant is GET-only)`); continue; }
    if (p.robots !== ROBOTS.ALLOW && p.robots !== ROBOTS.NO_ROBOTS_4XX) { defer.push(`ROBOTS_${p.robots === undefined ? "UNKNOWN" : p.robots}:${p.path} (RFC 9309: 5xx/unreachable ⇒ disallow; redirected robots ⇒ unknown)`); continue; }
    if (p.redirect === REDIRECT.OFF_HOST) { refuse.push("OFF_HOST_REDIRECT_ON_PREFIX:" + p.path); continue; }
    // The governor matches a prefix and EVERYTHING below it: a prefix that contains robots-disallowed sub-paths cannot be
    // admitted as is (the governor would ALLOW the disallowed sub-paths). 
    // The FULL robots.txt must have been analysed for this prefix (RFC 9309 group merging, wildcards honoured): both lists
    // are REQUIRED and explicit — absent ⇒ not analysed ⇒ DEFER (a "prefix allowed" line says nothing about rules INSIDE it).
    const listOk = (v: any): boolean => Array.isArray(v) && v.every(isStr);
    if (!listOk(p.robotsDisallowedWithin) || !listOk(p.robotsWildcardRulesInside)) { defer.push("ROBOTS_SUBPATHS_NOT_ANALYSED:" + p.path + " (robotsDisallowedWithin + robotsWildcardRulesInside must be explicit arrays)"); continue; }
    if (p.robotsDisallowedWithin.length > 0) { defer.push(`PREFIX_CONTAINS_ROBOTS_DISALLOWED_SUBPATHS:${p.path} ⊃ ${p.robotsDisallowedWithin.join(",")} (governor cannot exclude sub-paths — narrow the prefix)`); continue; }
    if (p.robotsWildcardRulesInside.length > 0) { defer.push(`ROBOTS_WILDCARD_RULES_MAY_MATCH_INSIDE:${p.path} (${p.robotsWildcardRulesInside.slice(0, 3).join(" | ")}${p.robotsWildcardRulesInside.length > 3 ? " …" : ""})`); continue; }
    if (p.redirect === REDIRECT.SAME_HOST) { defer.push("PREFIX_NOT_CANONICAL (same-host redirect; transport blocks redirects — use the canonical form):" + p.path); continue; }
    if (p.redirect !== REDIRECT.NONE) { defer.push("REDIRECT_BEHAVIOUR_UNKNOWN:" + p.path); continue; }
    if (p.sampled200 !== true) { defer.push("PREFIX_NOT_SAMPLED_200:" + p.path); continue; }
    admittedPrefixes.push(p.path);
  }
  const decision = refuse.length ? DECISIONS.REFUSE : (defer.length || admittedPrefixes.length === 0 ? DECISIONS.DEFER : DECISIONS.ADMIT);
  return Object.freeze({
    host: isStr(x.host) ? x.host : null, decision, tier: x.tier || null,
    admittedPrefixes: decision === DECISIONS.ADMIT ? Object.freeze(admittedPrefixes.slice().sort()) : Object.freeze([]),
    reasons: Object.freeze([...refuse, ...defer]),
    // a CONDITIONAL permission (e.g. GitHub AUP: research use only if resulting publications are open access) is carried
    // explicitly into the grant, never left only as free text in the evidence.
    termsCondition: isStr(x.termsCondition) ? x.termsCondition : null,
    evidenceSha256: sha256(stable(x)),
  });
}

/** Admit a candidate list and emit the versioned grant. Hosts beyond policy.maxHosts are DEFERRED (never silently dropped).
 *  Duplicate hosts ⇒ all copies REFUSED (ambiguous evidence). Returns { decisions, grant, summary }. */
function admitSources(candidates: any, opts: any = {}): any {
  const policy = { ...DEFAULT_POLICY, ...(opts.policy || {}) };
  const list: any[] = Array.isArray(candidates) ? candidates : [];
  const counts: any = {};
  for (const c of list) { const h = c && c.host; if (isStr(h)) counts[h] = (counts[h] || 0) + 1; }
  const decisions: any[] = [];
  let admittedHosts = 0;
  for (const c of list) {
    let d = decideCandidate(c, policy);
    if (isStr(c && c.host) && counts[c.host] > 1) d = Object.freeze({ ...d, decision: DECISIONS.REFUSE, admittedPrefixes: Object.freeze([]), reasons: Object.freeze([...d.reasons, "DUPLICATE_HOST_ENTRY"]) });
    if (d.decision === DECISIONS.ADMIT) {
      if (admittedHosts >= policy.maxHosts) d = Object.freeze({ ...d, decision: DECISIONS.DEFER, admittedPrefixes: Object.freeze([]), reasons: Object.freeze(["MAX_HOSTS_REACHED"]) });
      else admittedHosts++;
    }
    decisions.push(d);
  }
  const admitted = decisions.filter((d) => d.decision === DECISIONS.ADMIT);
  const issuedMs = Number.isFinite(opts.issuedMs) ? opts.issuedMs : null;
  const grantOk = admitted.length > 0 && issuedMs !== null && isStr(opts.issuedBy);
  const expiresMs = issuedMs !== null ? issuedMs + Math.min(policy.expiryDays, 29) * 86400000 : null;
  const allowedPaths: any = {}; const contentTypesPerCall: any = {};
  for (const d of admitted) { allowedPaths[d.host] = d.admittedPrefixes.slice(); contentTypesPerCall[d.host] = (policy.contentTypes[d.tier] || policy.contentTypes.T2).slice(); }
  const grant = grantOk ? {
    authorized: true,
    issuedBy: opts.issuedBy,
    issuedMs, issuedIso: new Date(issuedMs as number).toISOString(),
    expiresMs, expiresIso: new Date(expiresMs as number).toISOString(),
    expiryNote: `${Math.min(policy.expiryDays, 29)} days (≤ 30-day ceiling). Not renewable in place: renewal = a new versioned grant file produced by a new admission run.`,
    scope: "READ_ONLY_PUBLIC_RESEARCH — admitted public, unauthenticated sources only (each host+prefix admitted with fetched robots/redirect/terms evidence)",
    hostMatch: "EXACT",
    allowedDomains: admitted.map((d) => d.host).sort(),
    allowedPaths,
    methods: ["GET"],
    transport: "HTTPS only (bounded-http-client.get — GET only, redirects blocked, SSRF guard, size cap, timeout)",
    contentTypesPerCall,
    budget: { ...policy.budget, quotaScope: "PER RUN — enforced by research-budget.governWithBudget (requireBudget); per-host documented rate limits are recorded in the admission log and are ADVISORY (not enforced per host in code) — the per-run maxCalls is the enforced bound" },
    contentPolicy: "fetched content is untrusted data; never executed; never treated as instructions; findings evaluated before integration",
    hostConditions: admitted.filter((d) => isStr(d.termsCondition)).reduce((m: any, d: any) => { m[d.host] = d.termsCondition; return m; }, {}),
    admission: { mechanism: "runtime/core/odg-radar-source-admission.ts admitSources()", admitted: admitted.length, deferred: decisions.filter((d) => d.decision === DECISIONS.DEFER).length, refused: decisions.filter((d) => d.decision === DECISIONS.REFUSE).length, decisionsSha256: sha256(JSON.stringify(decisions)) },
  } : null;
  return Object.freeze({
    decisions: Object.freeze(decisions),
    grant: grant ? Object.freeze(grant) : null,
    grantRefusedReason: grant ? null : (admitted.length === 0 ? "NO_ADMITTED_SOURCE" : (issuedMs === null ? "ISSUED_MS_MISSING" : "ISSUED_BY_MISSING")),
    summary: Object.freeze({ candidates: list.length, admitted: admitted.length, deferred: decisions.filter((d) => d.decision === DECISIONS.DEFER).length, refused: decisions.filter((d) => d.decision === DECISIONS.REFUSE).length }),
  });
}

const RADAR_SOURCE_ADMISSION_CONTRACT = Object.freeze({
  pure: true, network: false, denyByDefault: true,
  never: ["admit without fetched robots+redirect+terms evidence", "admit a bare host (no narrow prefix)", "admit on reputation alone", "follow or admit an off-host redirect", "admit auth/paid/bot-challenged sources", "mutate the canonical bounded-http-client ALLOWLIST", "grant a universal network allowance"],
  consumers: ["research-governor.govern (EXACT + allowedPaths)", "research-budget.governWithBudget", "bounded-http-client (ODG_RADAR_LIVE kill-switch)"],
});

module.exports = { DECISIONS, ROBOTS, REDIRECT, DEFAULT_POLICY, validHost, validPrefix, decideCandidate, admitSources, RADAR_SOURCE_ADMISSION_CONTRACT };
export {};
