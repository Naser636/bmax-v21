#!/usr/bin/env node
"use strict";
/*
 * V317 e2e autonomy mission driver — runs INSIDE the certified C6 sandbox child.
 * HONEST DIVISION OF LABOUR (measured, not assumed):
 *   - Claude Code (host): wrote THIS harness + the mission batch spec, staged the compiled engine, launched the sandbox.
 *   - ODG's OWN engine (odg-native-engineering.runNativeCycle): routes/selects, generates, tests, diagnoses, repairs.
 *   - Ollama (qwen2.5-coder, via the in-sandbox relay): INDEPENDENT EVALUATOR of ODG's output (NOT a generator here).
 * The driver NEVER implements a fix; it only confies missions to ODG's engine and asks Ollama to judge the results.
 */
const http = require("http");
const fs = require("fs");
const NE = require("./odg-native-engineering.js");

const OUT = "/work/mission/mission-evidence.json";
const MODEL = "qwen2.5-coder:7b";

// --- Ollama INDEPENDENT EVALUATOR: ask it to judge a given implementation of `kind` as CORRECT/INCORRECT. ---
function ollamaJudge(kind, codeRepr, cb) {
  const prompt =
    "You are an INDEPENDENT code reviewer. Do NOT write code. Decide if this JavaScript implementation of the " +
    "function '" + kind + "' is correct for ALL inputs.\n" +
    "Implementation: " + codeRepr + "\n" +
    "Reply with a single line: VERDICT=CORRECT or VERDICT=INCORRECT, then ' because <short reason referencing the operator/logic>'.";
  const body = JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0, num_predict: 80 } });
  const req = http.request(
    { host: "127.0.0.1", port: 11434, path: "/api/generate", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 120000 },
    (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => {
      try { const j = JSON.parse(d); cb(null, (j.response || "").trim()); } catch (e) { cb(e); } }); }
  );
  req.on("error", (e) => cb(e));
  req.on("timeout", () => { req.destroy(new Error("ollama timeout")); });
  req.write(body); req.end();
}
function verdictOf(text) { return /VERDICT\s*=\s*CORRECT/i.test(text) && !/VERDICT\s*=\s*INCORRECT/i.test(text) ? "CORRECT" : /INCORRECT/i.test(text) ? "INCORRECT" : "UNCLEAR"; }

// --- the CONFIED mission batch (ODG decides how to handle each) ---
const BATCH = [
  { id: "m-sum-01",  injectFault: true,  spec: { fnName: "sum", kind: "sum", examples: [ { args: [2, 3], expect: 5 }, { args: [10, 7], expect: 17 }, { args: [-4, 4], expect: 0 } ] } },
  { id: "m-even-02", injectFault: true,  spec: { fnName: "isEven", kind: "isEven", examples: [ { args: [4], expect: true }, { args: [7], expect: false }, { args: [0], expect: true } ] } },
  { id: "m-max-03",  injectFault: false, spec: { fnName: "max", kind: "max", examples: [ { args: [3, 9], expect: 9 }, { args: [12, 5], expect: 12 } ] } },
  { id: "m-fib-04",  injectFault: false, spec: { fnName: "fibonacci", kind: "fibonacci", examples: [ { args: [7], expect: 13 } ] } }, // OUT of catalog ⇒ ODG must honestly escalate
];

const faultyRepr = { sum: "(a, b) => a - b", isEven: "(n) => n % 2 === 1" }; // the seeded-fault siblings (for the discrimination control)

async function main() {
  const results = [];
  for (const m of BATCH) {
    const cyc = NE.runNativeCycle(m);   // <-- ODG's OWN engine does the engineering
    results.push({ mission: m.id, kind: m.spec.kind, injectedFault: m.injectFault === true, odg: cyc });
  }

  // Ollama INDEPENDENT review — discrimination test on the two repaired missions: it must judge the FAULTY code
  // INCORRECT and the REPAIRED code CORRECT. Agreeing on both (and discriminating) proves it examined the content.
  const reviews = [];
  for (const r of results) {
    if (!r.odg || r.odg.nativeCycle !== true || !r.odg.corrected) continue; // only the actually-repaired ones
    const kind = r.kind;
    const repaired = r.odg.finalCode;
    const faulty = faultyRepr[kind];
    const judgeRepaired = await new Promise((res) => ollamaJudge(kind, repaired, (e, t) => res(e ? "ERROR:" + e.message : t)));
    const judgeFaulty = faulty ? await new Promise((res) => ollamaJudge(kind, faulty, (e, t) => res(e ? "ERROR:" + e.message : t))) : "N/A";
    reviews.push({
      mission: r.mission, kind,
      repairedCode: repaired, faultyCode: faulty || null,
      ollamaOnRepaired: { raw: judgeRepaired, verdict: verdictOf(judgeRepaired) },
      ollamaOnFaulty: { raw: judgeFaulty, verdict: faulty ? verdictOf(judgeFaulty) : "N/A" },
      discriminated: verdictOf(judgeRepaired) === "CORRECT" && (!faulty || verdictOf(judgeFaulty) === "INCORRECT"),
    });
  }

  const summary = {
    missionsTotal: results.length,
    nativeRepairedGreen: results.filter((r) => r.odg && r.odg.verdict === "NATIVE_REPAIRED_GREEN").length,
    nativeGreen: results.filter((r) => r.odg && r.odg.verdict === "NATIVE_GREEN").length,
    escalatedHonestly: results.filter((r) => r.odg && r.odg.verdict === "ESCALATED_TO_PROVIDER").length,
    ollamaReviews: reviews.length,
    ollamaDiscriminatedAll: reviews.length > 0 && reviews.every((r) => r.discriminated),
  };
  const evidence = { schemaVersion: "v317-mission-1", generatedInside: "C6 sandbox child (/work)", batch: results, ollamaIndependentReview: reviews, summary };
  fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2) + "\n");
  console.log("MISSION_DONE wrote " + OUT);
  console.log(JSON.stringify(summary));
}
main().catch((e) => { console.error("MISSION_ERROR", e && e.message); process.exit(1); });
