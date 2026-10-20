// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// opportunity-detector — normalize/dedupe/grade/rank over raw items; honest missing-data + deadline handling;
// anti-scam drop; budget provenance via opportunity-policy; feasibility via revenue-model; JS/TS parity.
const assert = require("assert");
const TS = require("./opportunity-detector.ts");
const JS = require("./opportunity-detector.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const NOW = Date.parse("2026-10-20T00:00:00.000Z");
const tender = (over) => Object.assign({
  buyer: "CD Yvelines", subject: "TMA CRM", sourceType: "official-tender", source: "francemarches",
  url: "https://www.francemarches.com/x", httpStatus: 200, publishedAt: "2026-10-01",
  deadline: "2026-11-15", budgetEur: 250000, lastCheckedAt: "2026-10-20",
}, over);

// 1. normalize: deadline math + missing-field flags (no guessing).
t("normalize — deadline days + missing flags", () => {
  const r = TS.normalizeOpportunity(tender({ budgetEur: undefined, deadline: undefined }), NOW);
  assert.ok(r.missing.includes("budgetEur") && r.missing.includes("deadline"));
  assert.strictEqual(r.budgetKind, "unknown");
  assert.strictEqual(r.deadlineDays, null);
  const r2 = TS.normalizeOpportunity(tender(), NOW);
  assert.strictEqual(r2.deadlineDays, 26);        // 2026-11-15 - 2026-10-20
  assert.strictEqual(r2.deadlinePassed, false);
});

// 2. past deadline flagged (kept, not hidden).
t("past deadline flagged deadlinePassed=true", () => {
  const r = TS.normalizeOpportunity(tender({ deadline: "2026-10-01" }), NOW);
  assert.strictEqual(r.deadlinePassed, true);
  assert.ok(r.deadlineDays < 0);
});

// 3. dedupe by url.
t("dedupe keeps first; shared listing-url + different subject NOT collapsed; ref wins", () => {
  const d = TS.dedupeOpportunities([{ url: "a" }, { url: "a" }, { url: "b" }]);
  assert.strictEqual(d.list.length, 2);
  assert.strictEqual(d.dropped, 1);
  // same listing url, DIFFERENT buyer/subject ⇒ distinct (the real-feed fix).
  const d2 = TS.dedupeOpportunities([{ url: "list", buyer: "X", subject: "p" }, { url: "list", buyer: "Y", subject: "q" }]);
  assert.strictEqual(d2.list.length, 2);
  // explicit ref dedupes even across differing urls.
  const d3 = TS.dedupeOpportunities([{ ref: "R1", url: "a" }, { ref: "R1", url: "b" }]);
  assert.strictEqual(d3.list.length, 1);
});

// 4. official tender + published budget + 200 ⇒ grade A; provenance CANDIDATE without a content hash (seen, not
//    formally extracted) and PROVEN once a content hash is supplied — honest, no over-claim.
t("official tender ⇒ grade A; provenance CANDIDATE w/o hash, PROVEN w/ hash", () => {
  const out = TS.detect([tender()], { nowMs: NOW });
  const o = out.shortlist[0];
  assert.strictEqual(o.grade, "A");
  assert.strictEqual(o.provenance.verification_status, "CANDIDATE"); // 200 but no extraction/hash ⇒ not proven
  assert.ok(o.score > 0);
  assert.strictEqual(out.counts.byGrade.A, 1);
  const proven = TS.detect([tender({ contentHash: "abc123" })], { nowMs: NOW });
  assert.strictEqual(proven.shortlist[0].provenance.verification_status, "PROVEN"); // hash ⇒ OBSERVED ⇒ PROVEN
});

// 5. job-board company NOT registry-verified ⇒ capped at C with a verify-first next action (§3 discipline).
t("job-board lead capped at C until registry-verified", () => {
  const jb = { buyer: "Webnet", subject: "Dev TS senior", sourceType: "job-board", url: "https://free-work.com/x", httpStatus: 200, publishedAt: "2026-10-19" };
  const out = TS.detect([jb], { nowMs: NOW });
  assert.strictEqual(out.shortlist[0].grade, "C");
  assert.ok(/VERIFY company in official registry/.test(out.shortlist[0].nextAction));
});

// 6. scam flag ⇒ REJECTED, ranked last (negative score), dropped-action.
t("scam flag ⇒ REJECTED last", () => {
  const out = TS.detect([tender(), tender({ buyer: "Fake", url: "https://x/fake", scamFlags: ["prepay-request"] })], { nowMs: NOW });
  const rejected = out.shortlist.find((x) => x.buyer === "Fake");
  assert.strictEqual(rejected.grade, "REJECTED");
  assert.strictEqual(out.shortlist[out.shortlist.length - 1].grade, "REJECTED"); // ranked last
});

// 7. provenance REJECTED when source not 2xx (fail-closed); parity.
t("non-2xx source ⇒ budget provenance REJECTED (fail-closed); parity", () => {
  const out = TS.detect([tender({ httpStatus: 404 })], { nowMs: NOW });
  assert.strictEqual(out.shortlist[0].provenance.verification_status, "REJECTED");
  assert.deepStrictEqual(TS.detect([tender(), { buyer: "Webnet", subject: "x", sourceType: "job-board", url: "u" }], { nowMs: NOW }),
                         JS.detect([tender(), { buyer: "Webnet", subject: "x", sourceType: "job-board", url: "u" }], { nowMs: NOW }));
});

// 8. verifyWebProvenance — CANDIDATE→PROVEN transition + the 4 separated dimensions, reproducible hash.
t("verifyWebProvenance — PROVEN only on integrity MATCH; FIRST_CAPTURE=CANDIDATE; reproducible hash", () => {
  const content = "Budget max annuel: 250000 EUR ...";
  const h = TS.sha256(content);
  assert.strictEqual(h, JS.sha256(content));              // reproducible across ports
  assert.strictEqual(h, TS.sha256(content));              // deterministic
  // first capture (no baseline) ⇒ CANDIDATE
  const first = TS.verifyWebProvenance({ httpStatus: 200, content, value: 250000, lastCheckedAt: "2026-10-20", nowMs: Date.parse("2026-10-20T00:00:00Z") });
  assert.strictEqual(first.integrity, "FIRST_CAPTURE");
  assert.strictEqual(first.verdict, "CANDIDATE");
  assert.strictEqual(first.computedHash, h);
  assert.strictEqual(first.businessPresence, "PRESENT"); // "250000" appears in content (weak signal)
  // re-check with the recorded baseline, unchanged content ⇒ PROVEN
  const proven = TS.verifyWebProvenance({ httpStatus: 200, content, expectedHash: h });
  assert.strictEqual(proven.integrity, "MATCH");
  assert.strictEqual(proven.verdict, "PROVEN");
});

// 9. negatives: non-2xx, empty content, modified content (MISMATCH), stale, business absent.
t("verifyWebProvenance negatives (non-2xx / empty / MISMATCH / STALE / ABSENT)", () => {
  assert.strictEqual(TS.verifyWebProvenance({ httpStatus: 404, content: "x" }).verdict, "REJECTED");      // non-2xx
  const empty = TS.verifyWebProvenance({ httpStatus: 200, content: "   " });
  assert.strictEqual(empty.integrity, "NO_CONTENT"); assert.strictEqual(empty.verdict, "REJECTED");       // empty
  const modified = TS.verifyWebProvenance({ httpStatus: 200, content: "TAMPERED", expectedHash: TS.sha256("ORIGINAL") });
  assert.strictEqual(modified.integrity, "MISMATCH"); assert.strictEqual(modified.verdict, "REJECTED");   // tamper-evident
  const stale = TS.verifyWebProvenance({ httpStatus: 200, content: "c", expectedHash: TS.sha256("c"), lastCheckedAt: "2026-01-01", nowMs: Date.parse("2026-10-20T00:00:00Z"), maxAgeDays: 7 });
  assert.strictEqual(stale.freshness, "STALE"); assert.strictEqual(stale.verdict, "PROVEN");              // stale but integrity still MATCH (dims separated)
  const absent = TS.verifyWebProvenance({ httpStatus: 200, content: "no number here", value: 999 });
  assert.strictEqual(absent.businessPresence, "ABSENT");                                                   // weak signal ≠ verdict
});

// 10. detect() attaches contentProvenance and does NOT persist raw content; parity.
t("detect attaches contentProvenance, strips raw content; parity", () => {
  const NOW2 = Date.parse("2026-10-20T00:00:00Z");
  const content = "TMA CRM budget 250000";
  const raw = [{ ref: "R", buyer: "B", subject: "s", sourceType: "official-tender", url: "u", httpStatus: 200, budgetEur: 250000, lastCheckedAt: "2026-10-20", content, expectedHash: TS.sha256(content) }];
  const out = TS.detect(raw, { nowMs: NOW2 });
  const o = out.shortlist[0];
  assert.strictEqual(o.contentProvenance.verdict, "PROVEN");
  assert.ok(!("content" in o) && !("expectedHash" in o), "raw content/expectedHash not persisted in shortlist");
  assert.ok(o.contentProvenance.computedHash, "hash retained as next baseline");
  assert.deepStrictEqual(TS.detect(raw, { nowMs: NOW2 }), JS.detect(raw, { nowMs: NOW2 }));
});

console.log(`\nALL PASS — opportunity-detector (${n} tests)`);
