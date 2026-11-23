#!/usr/bin/env node
"use strict";
/* V16.0 — offline tests (NO network) for the V160 engineering-practices collection + knowledge run, which REUSE the V158
 * collector/extractor/writer (config-driven) and the V158 knowledge derive(). Injected fetch only. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const R = require("../core/odg-v16-claude-code-research.js");
const K = require("../core/odg-knowledge-intelligence.js");
const ATT = require("../core/odg-knowledge-attestation.js");
const C = require("./odg-v158-collection-run.ts");
const V = require("./odg-v160-practices-collection-run.ts");
const VK = require("./odg-v160-practices-knowledge-run.ts");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const grant = JSON.parse(fs.readFileSync(path.join(ROOT, V.GRANT_PATH), "utf8")).grant;
const inWindow = grant.issuedMs + 3600000;

// ── targets & pre-registration ─────────────────────────────────────────────────────────────────────────────────────────
const plan = R.planRun(V.TARGETS, grant, inWindow);
check("≤ 10 targets (one governed run: runResearch MAX_TARGETS, unchanged) and ≤ the grant's per-run budget", V.TARGETS.length <= R.MAX_TARGETS && V.TARGETS.length <= grant.budget.maxCalls);
check("every target is ALLOWed by governor+quota+transport inside the V160 grant window (exact host + admitted prefix)", plan.denied === 0 && plan.allowed === V.TARGETS.length);
check("after the grant expires the same targets are all DENIED", R.planRun(V.TARGETS, grant, grant.expiresMs + 1).allowed === 0);
check("a NASA handbook SECTION outside the admitted prefix would be DENIED (why NASA is index-only)", R.planRun([{ url: "https://www.nasa.gov/reference/5-3-product-verification/" }], grant, inWindow).denied === 1);
check("every target pre-registers org, practiceArea, a valid nature and 1..4 patterns with unique ids + a question", V.TARGETS.every((t: any) => typeof t.org === "string" && typeof t.practiceArea === "string" && K.NATURE.includes(t.nature) && t.patterns.length >= 1 && t.patterns.length <= 4 && new Set(t.patterns.map((p: any) => p.id)).size === t.patterns.length && t.patterns.every((p: any) => p.re instanceof RegExp && typeof p.question === "string" && p.question.length > 10)));
check("every target host is a known PRIMARY_OFFICIAL publisher whose organisation matches the target's org", V.TARGETS.every((t: any) => { const id = K.identityOf(t.url); return id.known && id.role === "PRIMARY_OFFICIAL" && new RegExp(t.org === "GitHub" ? "^GitHub" : "^(" + t.org + ")").test(id.organization); }));
check("research.google paper abstracts are SCIENTIFIC_PUBLICATION (findings ≠ documentation)", V.TARGETS.filter((t: any) => /research\.google\/pubs\//.test(t.url)).every((t: any) => t.nature === "SCIENTIFIC_PUBLICATION"));
check("pattern ids are globally unique across the campaign (cycle query → key lookup is unambiguous)", (() => { const all = V.TARGETS.flatMap((t: any) => t.patterns.map((p: any) => p.id)); return new Set(all).size === all.length; })());

// ── generalised collector: config validation and V158 default unchanged ──────────────────────────────────────────────
check("default collector config is the V158 one (targets, grant, output)", C.configOf(undefined).targets === C.TARGETS && C.configOf(undefined).grantPath === C.GRANT_PATH && C.configOf(undefined).collectionPath === C.COLLECTION_PATH);
let bad = 0; for (const cfg of [{ targets: [{ url: "https://x.example/" }] }, { targets: [{ url: "https://a.example/", patterns: [], retired: true }] }, { targets: [{ url: "https://a.example/", patterns: [] }, { url: "https://a.example/", patterns: [] }] }]) { try { C.configOf(cfg); } catch { bad++; } }
check("config refuses targets without patterns, retired targets and duplicate urls (fail-closed)", bad === 3);
check("sentence:true accepts only fragments that end like a sentence", C.extractQuotes({ mode: "HTML", patterns: [{ id: "X", sentence: true, question: "q", re: /code review/i }] }, "<li>Code review speed and other menu items here</li><p>Code review is done within one day by the team.</p>").map((q: any) => q.quote).join("|") === "Code review is done within one day by the team.");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v160col-"));
  const out = path.join(dir, "c.json");
  let called = 0;
  const dry = await C.collect({ live: false, config: V.CONFIG, outPath: out, fetchImpl: () => { called++; throw new Error("must not fetch"); } });
  check("DRY (no live mode) never fetches and writes NOTHING", dry.written === false && called === 0 && !fs.existsSync(out) && dry.plan.length === V.TARGETS.length);
  const MARK = "QQBODYMARKQQ";
  const page = (u: string) => `<html><head><title>Page</title></head><body><nav><li>Code review speed</li></nav><p>${MARK} filler sentence that matches nothing registered.</p>`
    + `<p>In general, reviewers should favor approving a CL once it is in a state where it definitely improves the overall code health of the system being worked on.</p>`
    + `<p>Write to someone@example.org: one business day is the maximum time it should take to respond to a code review request.</p>`
    + (u.includes("nasa") ? `<li>5.3 Product Verification</li><li>6.4 Technical Risk Management</li>` : "") + `</body></html>`;
  const fake = async (u: string) => ({ ok: true, statusCode: 200, contentType: "text/html", body: page(u) });
  const live = await C.collect({ live: true, config: V.CONFIG, nowMs: inWindow, outPath: out, fetchImpl: fake });
  const text = live.written ? fs.readFileSync(out, "utf8") : "";
  const col = text ? JSON.parse(text) : { sources: [], cycles: [] };
  check("live (injected fetch) writes the V160 collection under the V160 grant, one source per target", live.written === true && col.grant === V.GRANT_PATH && col.sources.length === V.TARGETS.length && /V16\.0/.test(col["//"]));
  check("each source carries its org and practiceArea", col.sources.every((s: any, i: number) => s.org === V.TARGETS[i].org && s.practiceArea === V.TARGETS[i].practiceArea));
  check("quotes are verbatim, ≤ 300 chars, registered, e-mail-free; body text never stored", col.sources.every((s: any) => { const t = V.TARGETS.find((x: any) => x.url === s.url); return s.quotes.every((q: string, i: number) => q.length <= 300 && !EMAIL.test(q) && C.normalise(page(s.url), "HTML").includes(q) && t.patterns.some((p: any) => p.id === s.quotePatterns[i] && p.re.test(q))); }) && !text.includes(MARK) && !/"body"/.test(text));
  check("Google standard page: the code-health sentence is quoted; the e-mail-bearing sentence is dropped", (() => { const s = col.sources.find((x: any) => /standard\.html/.test(x.url)); const sp = col.sources.find((x: any) => /speed\.html/.test(x.url)); return s.quotePatterns.includes("G_STD_HEALTH") && !sp.quotePatterns.includes("G_SPD_ONEDAY"); })());
  check("NASA index: TOC fragments (non-sentence patterns) are quoted", (() => { const n = col.sources.find((x: any) => /nasa/.test(x.url)); return n.quotePatterns.includes("N_VV") && n.quotePatterns.includes("N_RISK"); })());
  const again = await C.collect({ live: true, config: V.CONFIG, nowMs: inWindow, outPath: out, fetchImpl: fake });
  check("an existing collection is never overwritten", again.written === false && /REFUSED/.test(again.reason));
  const denied = await C.collect({ live: true, config: V.CONFIG, nowMs: grant.expiresMs + 1, outPath: path.join(dir, "d.json"), fetchImpl: fake });
  check("outside the grant window ⇒ DENIED, nothing written", denied.written === false && !fs.existsSync(path.join(dir, "d.json")));

  // ── knowledge run over the (sandbox-pinned) fake collection ────────────────────────────────────────────────────────
  let unpinned = false; try { VK.derive(col, { collections: [] }); } catch { unpinned = true; }
  check("knowledge run refuses an unpinned collection", unpinned);
  const reg = { collections: [{ path: V.COLLECTION_PATH, sha256: ATT.contentSha256(col) }] };
  const a = VK.derive(col, reg);
  check("knowledge run derives one result per cycle, carrying org/practiceArea/nature", a.results.length === col.cycles.length && a.results.length > 0 && a.results.every((r: any) => typeof r.org === "string" && typeof r.practiceArea === "string" && K.NATURE.includes(r.nature)));
  check("without authored keys every claim is UNKNOWN (keys are authored from REAL quotes only, after the live run)", Object.keys(VK.STRUCT).length > 0 || a.results.every((r: any) => r.dimensions.epistemic === "UNKNOWN" && r.keyAuthored === false));
  check("a caller-pinned (non-repo) collection is never a fact", a.summary.presentedAsFact === 0 && a.summary.admittedAsFact === 0);
  check("research.google cycles are assessed as SCIENTIFIC_PUBLICATION; an unregistered url gets an invalid nature (never SUPPORTED)", a.results.filter((r: any) => /research\.google/.test(r.query)).every((r: any) => r.nature === "SCIENTIFIC_PUBLICATION") && VK.natureOf({ url: "https://evil.example/" }) === "UNREGISTERED_TARGET");
  check("NOT_MEASURED for unanswered questions (never a number)", a.unanswered.length > 0 && a.unanswered.every((u: any) => /^NOT_MEASURED/.test(u.status)));
  fs.rmSync(dir, { recursive: true, force: true });

  // ── committed artefacts (enforced once the LIVE collection exists) ─────────────────────────────────────────────────
  const regReal = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/COLLECTION_REGISTRY.json"), "utf8"));
  const pin = regReal.collections.find((c: any) => c.path === V.COLLECTION_PATH);
  const colPath = path.join(ROOT, V.COLLECTION_PATH);
  if (!fs.existsSync(colPath)) check("no LIVE collection yet ⇒ nothing pinned for it (never pin what was not collected)", !pin);
  else {
    const ct = fs.readFileSync(colPath, "utf8"); const cc = JSON.parse(ct);
    check("committed V160 collection digest equals its COLLECTION_REGISTRY pin", !!pin && ATT.contentSha256(cc) === pin.sha256 && pin.calls === cc.callsUsed && pin.grant === cc.grant && cc.callsUsed <= grant.budget.maxCalls);
    check("committed V160 collection: quotes ≤ 300, registered for ITS url, no e-mail, no body", !/"body"/.test(ct) && !EMAIL.test(ct) && cc.sources.every((s: any) => { const t = V.TARGETS.find((x: any) => x.url === s.url); return !!t && (s.quotes || []).length <= 4 && (s.quotes || []).every((q: string, i: number) => { const p = t.patterns.find((pp: any) => pp.id === s.quotePatterns[i]); return q.length <= 300 && !!p && new RegExp(p.re.source, p.re.flags).test(q); }); }));
    const kp = path.join(ROOT, VK.OUT_PATH);
    check("committed V160 knowledge re-derives exactly from the committed collection", fs.existsSync(kp) && JSON.stringify(VK.derive(cc, regReal), null, 2) + "\n" === fs.readFileSync(kp, "utf8") && !EMAIL.test(fs.readFileSync(kp, "utf8")));
  }
  if (failures) { process.stdout.write(`\n${failures} FAILED\n`); process.exit(1); }
  process.stdout.write("\nall V160 practices collection/knowledge checks passed\n");
})();
export {};
