#!/usr/bin/env node
"use strict";
/* V15.9 §10 — offline tests (NO network) for the V158 collector + knowledge assessment:
 * extractor (verbatim, ≤300 chars, e-mail drop, pre-registered patterns only, ≤4/page), DRY never fetches/writes, an existing
 * collection is never overwritten, the committed collection's digest equals the registry pin, the committed assessment
 * re-derives from the committed collection, and no committed quote holds an e-mail address or a page body. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const C = require("./odg-v158-collection-run.ts");
const KR = require("./odg-v158-knowledge-run.ts");
const ATT = require("../core/odg-knowledge-attestation.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PG = C.TARGETS.find((t: any) => t.url.includes("postgresql"));
const NPM = C.TARGETS.find((t: any) => t.url.includes("/react/"));

// ── extractor ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const html = `<html><head><title>T</title><script>var s="PostgreSQL automatically detects deadlock situations";</script></head><body>
<p>PostgreSQL provides a means for creating locks that have application-defined
   meanings. Write to admin@example.org: PostgreSQL provides various lock modes to control concurrent access to data in tables.</p>
<p>There are two ways to acquire an advisory lock in PostgreSQL: at session level or at transaction level.</p>
<p>Unrelated sentence about tables and nothing registered at all here.</p>
<p>PostgreSQL automatically detects deadlock situations and ${"x ".repeat(200)}resolves them.</p></body></html>`;
const qs = C.extractQuotes(PG, html);
const norm = C.normalise(html, "HTML");
check("every quote is a verbatim substring of the documented normalisation", qs.length > 0 && qs.every((q: any) => norm.includes(q.quote)));
check("every quote is ≤ 300 chars (an over-long matching sentence is dropped, never truncated)", qs.every((q: any) => q.quote.length <= 300) && !qs.some((q: any) => q.patternId === "PG_DEADLOCK"));
check("a quote containing an e-mail address is DROPPED", qs.every((q: any) => !EMAIL.test(q.quote)) && !qs.some((q: any) => q.patternId === "PG_LOCK_MODES"));
check("<script> content never yields a quote", !qs.some((q: any) => /deadlock/.test(q.quote)));
check("only pre-registered patterns produce quotes (unrelated text never quoted)", qs.every((q: any) => PG.patterns.some((p: any) => p.id === q.patternId && p.re.test(q.quote))) && !qs.some((q: any) => /Unrelated/.test(q.quote)));
check("expected registered matches found (advisory def + levels)", qs.map((q: any) => q.patternId).join(",") === "PG_ADVISORY_DEF,PG_ADVISORY_LEVELS");
check("a target with no patterns yields no quotes", C.extractQuotes({ mode: "HTML", patterns: [] }, html).length === 0 && C.extractQuotes(null, html).length === 0);
const many = { mode: "HTML", patterns: [1, 2, 3, 4, 5, 6].map((i) => ({ id: "P" + i, question: "q", re: new RegExp("Sentence number " + i) })) };
check("≤ 4 quotes per page", C.extractQuotes(many, [1, 2, 3, 4, 5, 6].map((i) => `<p>Sentence number ${i} is long enough to count.</p>`).join("")).length === 4);
const js = '{"name":"react","description":"React is a JavaScript library for building user interfaces.","keywords":["react"],"version":"19.2.4"}';
const jq = C.extractQuotes(NPM, js);
check("JSON mode: raw verbatim substring with the version", jq.length === 1 && js.includes(jq[0].quote) && /"version":"19\.2\.4"/.test(jq[0].quote));
check("entities decoded per the documented list", C.normalise("<p>a &amp; b &mdash; c&#39;s</p>", "HTML") === "a & b — c's");

(async () => {
  // ── collector write discipline (fake fetch; nothing touches the network) ─────────────────────────────────────────────
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v158col-"));
  const out = path.join(dir, "c.json");
  let called = 0;
  const dry = await C.collect({ live: false, outPath: out, fetchImpl: () => { called++; throw new Error("must not fetch"); } });
  check("DRY (no live mode) never fetches and writes NOTHING", dry.written === false && called === 0 && !fs.existsSync(out));
  const SECRET_BODY_MARK = "ZZBODYMARKZZ";
  const fake = async (u: string) => ({ ok: true, statusCode: 200, contentType: u.includes("npmjs") ? "application/json" : "text/html", body: u.includes("/react/") ? js : `<p>${SECRET_BODY_MARK} is an unrelated filler sentence of the body.</p><p>PostgreSQL provides various lock modes to control concurrent access to data in tables.</p>` });
  const live = await C.collect({ live: true, nowMs: Date.UTC(2026, 10, 23, 12), outPath: out, fetchImpl: fake });
  const written = live.written ? fs.readFileSync(out, "utf8") : "";
  check("live (injected fetch) writes pattern-matched quotes but never the rest of the page body", live.written === true && written.includes("lock modes to control") && !written.includes(SECRET_BODY_MARK) && !/"body"/.test(written));
  const again = await C.collect({ live: true, nowMs: Date.UTC(2026, 10, 23, 12), outPath: out, fetchImpl: fake });
  check("an existing collection is never overwritten (immutable once recorded)", again.written === false && /REFUSED/.test(again.reason));
  const expired = await C.collect({ live: true, nowMs: Date.UTC(2027, 0, 30), outPath: path.join(dir, "d.json"), fetchImpl: fake });
  check("outside the grant window the chain DENIES and nothing is written", expired.written === false && !fs.existsSync(path.join(dir, "d.json")));
  const none = await C.collect({ live: true, nowMs: Date.UTC(2026, 10, 23, 12), outPath: path.join(dir, "e.json"), fetchImpl: async () => ({ ok: false, code: "TIMEOUT" }) });
  check("live with zero responses ⇒ REFUSED, nothing written (never a false success)", none.written === false && !fs.existsSync(path.join(dir, "e.json")));

  // ── committed artefacts ────────────────────────────────────────────────────────────────────────────────────────────
  const colText = fs.readFileSync(path.join(ROOT, C.COLLECTION_PATH), "utf8");
  const col = JSON.parse(colText);
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/COLLECTION_REGISTRY.json"), "utf8"));
  const pin = reg.collections.find((c: any) => c.path === C.COLLECTION_PATH);
  check("committed collection digest equals its COLLECTION_REGISTRY pin", !!pin && ATT.contentSha256(col) === pin.sha256 && pin.calls === col.callsUsed && pin.grant === col.grant);
  const allQuotes = col.sources.flatMap((s: any) => s.quotes || []);
  check("committed collection: every quote ≤ 300 chars and matches a pre-registered pattern of ITS url", col.sources.every((s: any) => { const t = C.TARGETS.find((x: any) => x.url === s.url); return (s.quotes || []).length <= 4 && (s.quotes || []).every((q: string, i: number) => { const p = t && t.patterns.find((pp: any) => pp.id === s.quotePatterns[i]); return q.length <= 300 && !!p && new RegExp(p.re.source, p.re.flags).test(q); }); }));
  check("committed collection: calls ≤ the grant's per-run budget", col.callsUsed <= col.budgetMaxCalls);
  const asmText = fs.readFileSync(path.join(ROOT, KR.OUT_PATH), "utf8");
  check("no quote / claim in the committed files contains an e-mail address", !allQuotes.some((q: string) => EMAIL.test(q)) && !EMAIL.test(colText) && !EMAIL.test(asmText));
  check("committed collection stores no page body", !/"body"/.test(colText));
  check("assessment re-derives exactly from the committed collection (--check semantics)", JSON.stringify(KR.derive(col, reg), null, 2) + "\n" === asmText);
  const asm = JSON.parse(asmText);
  check("honest verdicts: nothing presented as fact, nothing CORROBORATED (single source)", asm.summary.presentedAsFact === 0 && asm.summary.CORROBORATED === 0 && asm.summary.admittedAsFact === 0);
  check("unanswered questions / unmeasured time-sensitive values are NOT_MEASURED, never a number", asm.unanswered.every((u: any) => /^NOT_MEASURED/.test(u.status)) && asm.timeSensitive.every((t: any) => t.quotes > 0 || t.value === "NOT_MEASURED"));
  const tampered = JSON.parse(colText); tampered.sources[0].quotes[0] += " (forged)";
  let threw = false; try { KR.derive(tampered, reg); } catch { threw = true; }
  check("a tampered collection (digest ≠ pin) is refused by the assessment", threw);
  fs.rmSync(dir, { recursive: true, force: true });
  if (failures) { process.stdout.write(`\n${failures} FAILED\n`); process.exit(1); }
  process.stdout.write("\nall V158 collection/knowledge checks passed\n");
})();
export {};
