#!/usr/bin/env node
"use strict";

const BC = require("./benchmark-contamination");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// fingerprint: deterministic + normalization (case + whitespace) collapses trivial reformatting.
check(BC.fingerprint("Hello World") === BC.fingerprint("hello   world"), "fingerprint: case + whitespace normalized to the same hash");
check(BC.fingerprint("a") !== BC.fingerprint("b"), "fingerprint: different content ⇒ different hash");
check(/^[0-9a-f]{64}$/.test(BC.fingerprint("x")), "fingerprint: sha256 hex");

// detectContamination: leaked case flagged, duplicate flagged, clean case kept.
const c = BC.detectContamination({
  hiddenSet: [{ id: "h1", content: "What is 2+2?" }, { id: "h2", content: "Capital of France" }, { id: "h3", content: "WHAT  IS  2+2?" }, { id: "h4", content: "unique case" }],
  knownCorpus: ["Capital of France"],
});
check(c.verdict === "CONTAMINATED", "detect: a leaked/duplicate hidden set is CONTAMINATED");
check(c.contaminated.some((x: any) => x.id === "h2"), "detect: h2 (in known corpus) flagged leaked");
check(c.duplicates.some((x: any) => x.id === "h3" && x.duplicateOf === "h1"), "detect: h3 flagged duplicate of h1 (after normalization)");
check(c.clean.includes("h4") && c.clean.includes("h1"), "detect: h1 + h4 kept as clean");
check(c.total === 4 && c.contaminationRate === 0.5, "detect: contaminationRate = 2/4 = 0.5");

// a fully clean hidden set ⇒ CLEAN.
const clean = BC.detectContamination({ hiddenSet: [{ id: "a", content: "alpha" }, { id: "b", content: "beta" }], knownCorpus: ["gamma"] });
check(clean.verdict === "CLEAN" && clean.contaminationRate === 0, "detect: unique, non-leaked set is CLEAN");

// knownFingerprints path (pre-hashed corpus) also works.
const fpB = BC.fingerprint("beta");
const kf = BC.detectContamination({ hiddenSet: [{ id: "x", content: "beta" }], knownFingerprints: [fpB] });
check(kf.verdict === "CONTAMINATED", "detect: knownFingerprints (pre-hashed) catches the leak");

// certifyBenchmark: contamination ⇒ INVALID even with a strongly significant, high score (fail-closed).
const sigStrong = { before: { successes: 50, n: 100 }, after: { successes: 95, n: 100 } }; // large, significant improvement
const dirty = BC.certifyBenchmark({ hiddenSet: [{ id: "h", content: "leaked" }], knownCorpus: ["leaked"], significance: sigStrong });
check(dirty.certified === false, "certify: CONTAMINATED hidden set ⇒ NOT certified despite a high significant score");
check(dirty.reasons.some((r: any) => /CONTAMINATED|leaked/i.test(r)), "certify: reason cites contamination");

// certifyBenchmark: clean + significant ⇒ CERTIFIED.
const good = BC.certifyBenchmark({ hiddenSet: [{ id: "h", content: "fresh unique case" }], knownCorpus: ["something else"], significance: sigStrong });
check(good.certified === true, "certify: CLEAN hidden set + significant result ⇒ CERTIFIED");

// certifyBenchmark: clean but NOT significant ⇒ not certified.
const noisy = BC.certifyBenchmark({ hiddenSet: [{ id: "h", content: "fresh" }], knownCorpus: [], significance: { before: { successes: 50, n: 100 }, after: { successes: 52, n: 100 } } });
check(noisy.certified === false && noisy.reasons.some((r: any) => /significant/i.test(r)), "certify: clean but insignificant ⇒ not certified");

// contract invariants.
check(/contamination ⇒ INVALID|regardless of score|not evidence/i.test(JSON.stringify(BC.BENCHMARK_CONTAMINATION_CONTRACT.invariants)), "contract: contamination invalidates regardless of score");

if (failures === 0) process.stdout.write("ALL PASS — V5 M-BENCH-01 BENCHMARK CONTAMINATION\n");
process.exit(failures === 0 ? 0 : 1);

export {};
