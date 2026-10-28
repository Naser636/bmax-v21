#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Validates the generative-repair eval's CLASSIFICATION with INJECTED generators +
// real `node --test` acceptance (deterministic): a generator that only fixes 'sum' ⇒ 1 correctAccept + 4 abstain
// (wrong edits rolled back, 0 false-success — harness-guaranteed); a down generator ⇒ all providerDown; a junk
// generator ⇒ all rejected. Also checks provenance + the honesty caveat. (The REAL-model accept rate is the live run.)
"use strict";
const assert = require("assert");
const E = require("./generative-repair-eval.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

(async () => {
  // Generator that always proposes the SUM fix (correct only for the 'sum' case).
  const sumOnly = async () => ({ ok: true, model: "fake", text: '{"edits":[{"path":"src/f.js","content":"module.exports = (a, b) => a + b;\\n"}]}' });
  const r1 = await E.evaluate({ generate: sumOnly });
  ok("sum-only generator ⇒ exactly 1 correctAccept (the sum case)", r1.overall.correctAccept === 1 && r1.results.find(x => x.id === "sum").outcome === "correctAccept");
  ok("the other 4 cases ⇒ abstain (wrong edit rolled back)", r1.overall.abstain === 4);
  ok("false-success is 0 by construction (real test gates acceptance)", r1.overall.falseSuccess === 0 && r1.overall.falseSuccessRate === 0);

  // Provider down ⇒ all providerDown; acceptRate null (nothing reachable).
  const down = async () => ({ ok: false, reason: "daemon down" });
  const r2 = await E.evaluate({ generate: down });
  ok("provider down ⇒ all providerDown, acceptRate null", r2.overall.providerDown === 5 && r2.overall.acceptRate === null);

  // Junk output ⇒ all rejected (strict parse).
  const junk = async () => ({ ok: true, model: "fake", text: "I cannot do that." });
  const r3 = await E.evaluate({ generate: junk });
  ok("junk output ⇒ all rejected (strict parse, nothing applied)", r3.overall.rejected === 5 && r3.overall.correctAccept === 0);

  // Provenance + caveat.
  const p1 = E.corpusProvenance(), p2 = E.corpusProvenance();
  ok("provenance sha256 stable + version + total 5", p1.sha256 === p2.sha256 && /^[0-9a-f]{64}$/.test(p1.sha256) && p1.version === E.CORPUS_VERSION && p1.total === 5);
  ok("caveat: falseSuccess 0 by construction + NOT broad-IT", /falseSuccess is 0 BY CONSTRUCTION/.test(r1.caveat) && /NOT a broad-IT success rate/.test(r1.caveat));

  console.log(`\nGENERATIVE-REPAIR-EVAL suite — ${pass} assertions passed. (classification correct; false-success 0 by construction; provider-down/junk fail-closed; narrow, not broad-IT)`);
})();
