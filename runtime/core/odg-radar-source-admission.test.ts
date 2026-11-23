#!/usr/bin/env node
"use strict";
/* Tests for odg-radar-source-admission (V15.8 §3.3). Pure fixtures; the produced grant is also checked against the REAL
 * research-governor.govern() so admission and enforcement agree. */
const A = require("./odg-radar-source-admission.js");
const G = require("./research-governor.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const good = (over: any = {}) => ({
  host: "www.rfc-editor.org", scheme: "https", access: "ANONYMOUS_PUBLIC_HTML", tier: "T1", termsVerified: true,
  termsUrl: "https://www.rfc-editor.org/policy.html", rateLimitPerHour: 600,
  prefixes: [{ path: "/rfc/", robots: "ALLOW", redirect: "NONE", sampled200: true }], ...over,
});
const dec = (c: any) => A.decideCandidate(c);

// ── ADMIT path
let d = dec(good());
check("fully evidenced T1 candidate ⇒ ADMIT with its prefix", d.decision === "ADMIT" && d.admittedPrefixes.join() === "/rfc/");
check("evidence hash present (64 hex)", /^[0-9a-f]{64}$/.test(d.evidenceSha256));
check("4xx robots (no robots.txt) counts as allow (RFC 9309)", dec(good({ prefixes: [{ path: "/rfc/", robots: "NO_ROBOTS_4XX", redirect: "NONE", sampled200: true }] })).decision === "ADMIT");

// ── REFUSE: hard violations
const refusedFor = (over: any, re: RegExp) => { const r = dec(good(over)); return r.decision === "REFUSE" && r.reasons.some((x: string) => re.test(x)) && r.admittedPrefixes.length === 0; };
check("http (not https) ⇒ REFUSE", refusedFor({ scheme: "http" }, /NOT_HTTPS/));
check("IP literal host ⇒ REFUSE", refusedFor({ host: "93.184.216.34" }, /IP_LITERAL/));
check("upper-case host ⇒ REFUSE (canonical lower-case only)", refusedFor({ host: "WWW.RFC-Editor.org" }, /CANONICAL/));
check("wildcard host ⇒ REFUSE", refusedFor({ host: "*.example.org" }, /FORBIDDEN_CHAR/));
check("host with port ⇒ REFUSE", refusedFor({ host: "example.org:8443" }, /FORBIDDEN_CHAR/));
check("localhost / .internal / .local ⇒ REFUSE", ["localhost", "svc.internal", "printer.local"].every((h) => refusedFor({ host: h }, /NEVER_ADMITTED|NOT_DNS_NAME/)));
check("URL shortener ⇒ REFUSE", refusedFor({ host: "bit.ly" }, /NEVER_ADMITTED/));
check("auth required ⇒ REFUSE", refusedFor({ requiresAuth: true }, /AUTHENTICATION/));
check("paid ⇒ REFUSE", refusedFor({ paid: true }, /PAID/));
check("bot challenge observed ⇒ REFUSE (never bypassed)", refusedFor({ botChallengeObserved: true }, /BOT_CHALLENGE/));
check("terms forbid automation ⇒ REFUSE", refusedFor({ termsForbidAutomation: true }, /TERMS_FORBID/));
check("robots DISALLOW on the prefix ⇒ REFUSE", refusedFor({ prefixes: [{ path: "/rfc/", robots: "DISALLOW", redirect: "NONE", sampled200: true }] }, /ROBOTS_DISALLOWS/));
check("off-host redirect on the prefix ⇒ REFUSE", refusedFor({ prefixes: [{ path: "/rfc/", robots: "ALLOW", redirect: "OFF_HOST", sampled200: true }] }, /OFF_HOST_REDIRECT/));
check("bare host (no prefix) ⇒ REFUSE", refusedFor({ prefixes: [] }, /NO_PATH_PREFIX/));
check("prefix '/' ⇒ REFUSE (too broad)", refusedFor({ prefixes: [{ path: "/", robots: "ALLOW", redirect: "NONE", sampled200: true }] }, /TOO_BROAD/));
check("prefix with '..' ⇒ REFUSE", refusedFor({ prefixes: [{ path: "/rfc/../admin/", robots: "ALLOW", redirect: "NONE", sampled200: true }] }, /NOT_NORMALIZED/));
check("prefix with encoded separator ⇒ REFUSE", refusedFor({ prefixes: [{ path: "/rfc%2fx/", robots: "ALLOW", redirect: "NONE", sampled200: true }] }, /ENCODED/));
check("prefix with query ⇒ REFUSE", refusedFor({ prefixes: [{ path: "/rfc/?q=1", robots: "ALLOW", redirect: "NONE", sampled200: true }] }, /QUERY/));
check("non-WHATWG-canonical prefix (space/backslash) ⇒ REFUSE", refusedFor({ prefixes: [{ path: "/rfc\\x/", robots: "ALLOW", redirect: "NONE", sampled200: true }] }, /QUERY_FRAGMENT_OR_SPACE|CANONICAL/));
check("non-anonymous access type ⇒ REFUSE", refusedFor({ access: "FREE_OAUTH" }, /ACCESS_TYPE/));

// ── DEFER: missing / unknown evidence never admits
const deferredFor = (over: any, re: RegExp) => { const r = dec(good(over)); return r.decision === "DEFER" && r.reasons.some((x: string) => re.test(x)) && r.admittedPrefixes.length === 0; };
check("terms not verified ⇒ DEFER", deferredFor({ termsVerified: false }, /TERMS_NOT_VERIFIED/));
check("terms URL missing ⇒ DEFER", deferredFor({ termsUrl: undefined }, /TERMS_URL_MISSING/));
check("undocumented rate limit ⇒ DEFER", deferredFor({ rateLimitPerHour: undefined }, /RATE_LIMIT_UNDOCUMENTED/));
check("unknown tier ⇒ DEFER", deferredFor({ tier: "T9" }, /TIER_UNKNOWN/));
check("missing access field ⇒ DEFER (unknown, not assumed anonymous)", deferredFor({ access: undefined }, /ACCESS_TYPE/));
check("robots unknown ⇒ DEFER", deferredFor({ prefixes: [{ path: "/rfc/", redirect: "NONE", sampled200: true }] }, /ROBOTS_UNKNOWN/));
check("robots 5xx/unreachable ⇒ DEFER (RFC 9309 treats as disallow — never admit)", deferredFor({ prefixes: [{ path: "/rfc/", robots: "UNREACHABLE_5XX", redirect: "NONE", sampled200: true }] }, /UNREACHABLE/));
check("redirected robots.txt ⇒ DEFER (dossier contradiction #1)", deferredFor({ prefixes: [{ path: "/rfc/", robots: "REDIRECTED", redirect: "NONE", sampled200: true }] }, /ROBOTS_REDIRECTED/));
check("same-host redirect (non-canonical prefix) ⇒ DEFER", deferredFor({ prefixes: [{ path: "/rfc", robots: "ALLOW", redirect: "SAME_HOST", sampled200: true }] }, /NOT_CANONICAL/));
check("redirect behaviour unknown ⇒ DEFER", deferredFor({ prefixes: [{ path: "/rfc/", robots: "ALLOW", sampled200: true }] }, /REDIRECT_BEHAVIOUR_UNKNOWN/));
check("prefix not sampled 200 ⇒ DEFER", deferredFor({ prefixes: [{ path: "/rfc/", robots: "ALLOW", redirect: "NONE" }] }, /NOT_SAMPLED/));
check("owner decision required (terms allow vs robots disallow) ⇒ DEFER", deferredFor({ ownerDecisionRequired: "robots Disallow:/ vs API terms" }, /OWNER_DECISION/));
check("robots Crawl-delay without per-host pacing ⇒ DEFER", deferredFor({ crawlDelaySeconds: 15 }, /CRAWL_DELAY_15s_NOT_ENFORCEABLE/));
check("hourly limit below one run's budget ⇒ DEFER", deferredFor({ rateLimitPerHour: 20 }, /BELOW_RUN_BUDGET/));
check("crawl-delay admitted only if the policy declares per-host pacing enforced", A.decideCandidate(good({ crawlDelaySeconds: 15 }), { ...A.DEFAULT_POLICY, perHostPacingEnforced: true }).decision === "ADMIT");
check("one bad prefix among good ones ⇒ whole host not ADMITTED (no partial admit)", dec(good({ prefixes: [{ path: "/rfc/", robots: "ALLOW", redirect: "NONE", sampled200: true }, { path: "/x/", robots: "UNKNOWN", redirect: "NONE", sampled200: true }] })).decision === "DEFER");
check("garbage candidate (null) ⇒ REFUSE, no throw", dec(null).decision === "REFUSE");

// ── admitSources + grant
const NOW = Date.UTC(2026, 10, 23);
const second = good({ host: "datatracker.ietf.org", termsUrl: "https://www.ietf.org/privacy-statement/", prefixes: [{ path: "/doc/", robots: "ALLOW", redirect: "NONE", sampled200: true }] });
let r = A.admitSources([good(), second, good({ host: "export.arxiv.org", ownerDecisionRequired: "robots vs terms" }), good({ host: "dl.acm.org", botChallengeObserved: true })], { issuedMs: NOW, issuedBy: "owner (V15.8 §3.3 directive) — test" });
check("summary counts 2 admit / 1 defer / 1 refuse", r.summary.admitted === 2 && r.summary.deferred === 1 && r.summary.refused === 1);
check("grant: EXACT, GET only, admitted hosts only, sorted", r.grant && r.grant.hostMatch === "EXACT" && r.grant.methods.join() === "GET" && r.grant.allowedDomains.join() === "datatracker.ietf.org,www.rfc-editor.org");
check("grant expiry ≤ 29 days", r.grant.expiresMs - r.grant.issuedMs === 29 * 86400000);
check("grant allowedPaths only admitted prefixes", JSON.stringify(r.grant.allowedPaths) === JSON.stringify({ "www.rfc-editor.org": ["/rfc/"], "datatracker.ietf.org": ["/doc/"] }));
check("policy cannot extend expiry beyond 29 days", A.admitSources([good()], { issuedMs: NOW, issuedBy: "x", policy: { expiryDays: 365 } }).grant.expiresMs - NOW === 29 * 86400000);
check("no issuedMs ⇒ no grant (refused reason)", A.admitSources([good()], { issuedBy: "x" }).grant === null);
check("no issuedBy ⇒ no grant", A.admitSources([good()], { issuedMs: NOW }).grant === null);
check("nothing admitted ⇒ no grant", A.admitSources([good({ paid: true })], { issuedMs: NOW, issuedBy: "x" }).grantRefusedReason === "NO_ADMITTED_SOURCE");
r = A.admitSources([good(), good()], { issuedMs: NOW, issuedBy: "x" });
check("duplicate host entries ⇒ both REFUSED", r.decisions.every((x: any) => x.decision === "REFUSE" && x.reasons.includes("DUPLICATE_HOST_ENTRY")));
r = A.admitSources([good(), second], { issuedMs: NOW, issuedBy: "x", policy: { maxHosts: 1 } });
check("beyond maxHosts ⇒ DEFER (not silently dropped)", r.summary.admitted === 1 && r.decisions[1].decision === "DEFER" && r.decisions[1].reasons.includes("MAX_HOSTS_REACHED"));

// ── admission ⇔ enforcement agreement (REAL research-governor.govern)
r = A.admitSources([good(), second], { issuedMs: NOW, issuedBy: "x" });
const g = r.grant; const t = NOW + 1000;
check("governor ALLOWs an admitted host+prefix", G.govern({ urls: ["https://www.rfc-editor.org/rfc/rfc9309.html"] }, g, t).decision === "ALLOW");
check("governor DENYs an admitted host outside its prefix", G.govern({ urls: ["https://www.rfc-editor.org/admin/"] }, g, t).decision === "DENY");
check("governor DENYs a sub-domain of an admitted host (EXACT)", G.govern({ urls: ["https://x.www.rfc-editor.org/rfc/a"] }, g, t).decision === "DENY");
check("governor DENYs a deferred/refused host", G.govern({ urls: ["https://export.arxiv.org/api/query?x=1"] }, g, t).decision === "DENY");
check("governor DENYs after expiry", G.govern({ urls: ["https://www.rfc-editor.org/rfc/a"] }, g, g.expiresMs + 1).decision === "DENY");

process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exit(failures === 0 ? 0 : 1);
export {};
