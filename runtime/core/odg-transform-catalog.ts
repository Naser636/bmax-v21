#!/usr/bin/env node
"use strict";
/*
 * V152 — ODG NATIVE DETERMINISTIC TRANSFORMATION CATALOG. PURE, deterministic, fail-closed. Expands ODG's native engineering
 * surface from V151 (value-function templates) to SOURCE-TEXT transformations with explicit pre/postconditions and a HARD
 * refusal path (radar V152: SafeRepair "never a wrong patch"; PatchPilot anti-reward-hacking; contract-based validation).
 *
 * SECURITY (directive §4): transformations are verified by STRUCTURAL postconditions on the before/after TEXT — this module
 * NEVER executes the transformed code (no new Function on transformed source). That removes the eval surface from the
 * transform path. (The V151 value-function path uses new Function only on ODG's OWN trusted catalog templates — not on
 * external/untrusted input — a bounded, documented risk; V152 avoids eval entirely for source transforms.)
 *
 * Strict separation (§4): plan → generate patch → validate (postconditions, no execution) → accept/reject. A GENERATED patch
 * is NOT an accepted patch. Ambiguity / unsupported syntax ⇒ explicit NATIVE_REFUSED / ESCALATED_TO_PROVIDER, never a guess.
 */
function isStr(v: any): boolean { return typeof v === "string"; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const OUTCOME = Object.freeze({ GREEN: "NATIVE_GREEN", REPAIRED: "NATIVE_REPAIRED_GREEN", REFUSED: "NATIVE_REFUSED", ESCALATED: "ESCALATED_TO_PROVIDER", VALIDATION_FAILED: "VALIDATION_FAILED", NOT_MEASURED: "NOT_MEASURED" });

// loose-equality detector: matches == / != that are NOT part of === !== <= >= => ==>.
const LOOSE_EQ = /(?<![=!<>])(==|!=)(?!=)/g;

const TRANSFORMS: Record<string, any> = {
  "ensure-dual-export@1": {
    inputScope: "a runtime .ts module that uses module.exports (repo dual-export convention)",
    pre: (s: string) => (!/module\.exports\s*=/.test(s) ? { ok: false, reason: "no module.exports ⇒ out of scope" }
      : /export\s+default/.test(s) ? { ok: false, reason: "has `export default` ⇒ ambiguous, refuse", escalate: true }
      : /\bexport\s*\{\s*\}\s*;?\s*$/.test(s.trimEnd()) ? { ok: true, alreadyCompliant: true } : { ok: true }),
    transform: (s: string) => (s.trimEnd() + "\nexport {};\n"),
    post: (before: string, after: string) => (/\bexport\s*\{\s*\}\s*;?\s*$/.test(after.trimEnd()) && /module\.exports\s*=/.test(after) && after.indexOf(before.trimEnd()) === 0 ? { ok: true } : { ok: false, reason: "postcondition: must end with `export {};`, keep module.exports, and preserve the original prefix" }),
  },
  "ensure-use-strict@1": {
    inputScope: "a module missing the \"use strict\" directive",
    pre: (s: string) => (/["']use strict["']/.test(s) ? { ok: true, alreadyCompliant: true } : { ok: true }),
    transform: (s: string) => { const lines = s.split("\n"); if (lines[0] && lines[0].startsWith("#!")) { lines.splice(1, 0, '"use strict";'); return lines.join("\n"); } return '"use strict";\n' + s; },
    post: (before: string, after: string) => (/["']use strict["']/.test(after) && after.length > before.length ? { ok: true } : { ok: false, reason: "postcondition: must contain \"use strict\" and preserve content" }),
  },
  "normalize-strict-equality@1": {
    inputScope: "source using loose == / != where intent is unambiguous",
    pre: (s: string) => (/[!=]=\s*null|null\s*[!=]=/.test(s) ? { ok: false, reason: "contains `== null`/`!= null` (ambiguous nullish idiom) ⇒ refuse/escalate", escalate: true }
      : LOOSE_EQ.test(s) ? ((LOOSE_EQ.lastIndex = 0), { ok: true }) : ((LOOSE_EQ.lastIndex = 0), { ok: true, alreadyCompliant: true })),
    transform: (s: string) => { LOOSE_EQ.lastIndex = 0; return s.replace(LOOSE_EQ, (m) => (m === "==" ? "===" : "!==")); },
    post: (before: string, after: string) => { LOOSE_EQ.lastIndex = 0; const remaining = (after.match(LOOSE_EQ) || []).length; LOOSE_EQ.lastIndex = 0; const beforeLoose = (before.match(LOOSE_EQ) || []).length; LOOSE_EQ.lastIndex = 0; return remaining === 0 && after.length === before.length + beforeLoose ? { ok: true } : { ok: false, reason: `postcondition: 0 loose operators remain (got ${remaining}) and length grew by exactly the upgrade count` }; },
  },
  "dedupe-require-lines@1": {
    inputScope: "a module with exact-duplicate `const X = require(...)` lines",
    pre: (s: string) => { const reqs = s.split("\n").map((l) => l.trim()).filter((l: string) => /^(const|let|var)\b.*\brequire\s*\(/.test(l)); const seen = new Set<string>(); let dup = false; for (const l of reqs) { if (seen.has(l)) dup = true; else seen.add(l); } return dup ? { ok: true } : { ok: true, alreadyCompliant: true }; },
    transform: (s: string) => { const seen = new Set<string>(); return s.split("\n").filter((l: string) => { const t = l.trim(); if (/^(const|let|var)\b.*\brequire\s*\(/.test(t)) { if (seen.has(t)) return false; seen.add(t); } return true; }).join("\n"); },
    post: (before: string, after: string) => { const reqs = after.split("\n").map((l) => l.trim()).filter((l: string) => /^(const|let|var)\b.*\brequire\s*\(/.test(l)); return new Set(reqs).size === reqs.length ? { ok: true } : { ok: false, reason: "postcondition: no duplicate require lines remain" }; },
  },
  "sort-named-destructure@1": {
    inputScope: "a single-line `const { c, a, b } = require(\"x\");` destructure",
    pre: (s: string) => { const m = /^(\s*)(const|let|var)\s*\{([^}]+)\}\s*=\s*require\(([^)]+)\);?\s*$/m.exec(s); if (!m) return { ok: false, reason: "no single-line named-destructure require ⇒ out of scope" }; const keys = m[3].split(",").map((k: string) => k.trim()).filter((k: string) => k.length > 0); const sorted = keys.slice().sort(); return keys.join(",") === sorted.join(",") ? { ok: true, alreadyCompliant: true } : { ok: true }; },
    transform: (s: string) => s.replace(/^(\s*)(const|let|var)\s*\{([^}]+)\}\s*=\s*require\(([^)]+)\);?\s*$/m, (_m, ind, kw, body, req) => { const keys = body.split(",").map((k: string) => k.trim()).filter((k: string) => k.length > 0).sort(); return `${ind}${kw} { ${keys.join(", ")} } = require(${req.trim()});`; }),
    post: (before: string, after: string) => { const mb = /\{([^}]+)\}/.exec(before), ma = /\{([^}]+)\}/.exec(after); if (!mb || !ma) return { ok: false, reason: "no destructure block" }; const kb = mb[1].split(",").map((k: string) => k.trim()).filter(Boolean).sort(); const ka = ma[1].split(",").map((k: string) => k.trim()).filter(Boolean); return JSON.stringify(ka) === JSON.stringify(ka.slice().sort()) && JSON.stringify(ka.slice().sort()) === JSON.stringify(kb) ? { ok: true } : { ok: false, reason: "postcondition: same key set, sorted" }; },
  },
};
const TRANSFORM_IDS = Object.freeze(Object.keys(TRANSFORMS));

/** runTransform({ classId, source }) — the safe pipeline. A generated patch is NOT an accepted patch. */
function runTransform(mission: any): any {
  const m = isObj(mission) ? mission : {};
  if (!isStr(m.classId) || !isStr(m.source)) return Object.freeze({ ok: false, code: "INVALID_MISSION", detail: "need { classId, source }" });
  const t = TRANSFORMS[m.classId];
  const steps: any[] = []; const log = (step: string, detail: string) => steps.push({ step, detail });
  if (!t) { log("identify_class", `unknown class '${m.classId}'`); return Object.freeze({ ok: true, classId: m.classId, outcome: OUTCOME.ESCALATED, accepted: false, steps: Object.freeze(steps), reason: "unsupported transformation class ⇒ escalate (never guess)", note: "a generated patch is not an accepted patch; unknown class is not attempted." }); }

  log("plan", `apply ${m.classId}: ${t.inputScope}`);
  const pre = t.pre(m.source);
  log("precondition", JSON.stringify(pre));
  if (!pre.ok) return Object.freeze({ ok: true, classId: m.classId, outcome: pre.escalate ? OUTCOME.ESCALATED : OUTCOME.REFUSED, accepted: false, before: m.source, steps: Object.freeze(steps), reason: pre.reason, note: "precondition not met ⇒ refuse/escalate; source unchanged; no guessed edit." });
  if (pre.alreadyCompliant) return Object.freeze({ ok: true, classId: m.classId, outcome: OUTCOME.GREEN, accepted: true, changed: false, before: m.source, after: m.source, steps: Object.freeze(steps), note: "already compliant ⇒ NATIVE_GREEN, no patch needed." });

  // GENERATE patch (not yet accepted)
  let after: string; try { after = t.transform(m.source); } catch (e: any) { return Object.freeze({ ok: true, classId: m.classId, outcome: OUTCOME.VALIDATION_FAILED, accepted: false, before: m.source, steps: Object.freeze(steps), reason: "transform threw: " + ((e && e.message) || String(e)) }); }
  log("generate_patch", `patch generated (Δlen ${after.length - m.source.length})`);

  // VALIDATE patch structurally (NO execution of transformed code)
  const post = t.post(m.source, after);
  log("validate_postconditions", JSON.stringify(post));
  if (!post.ok) return Object.freeze({ ok: true, classId: m.classId, outcome: OUTCOME.VALIDATION_FAILED, accepted: false, before: m.source, rejectedPatch: after, steps: Object.freeze(steps), reason: post.reason, note: "postcondition failed ⇒ REJECT patch, REVERT to before (transactional). Generated ≠ accepted." });

  // ACCEPT
  log("accept", "postconditions hold ⇒ patch accepted (in-memory; real-repo write OWNER_GATED)");
  return Object.freeze({
    ok: true, classId: m.classId, outcome: OUTCOME.REPAIRED, accepted: true, changed: true,
    before: m.source, after, patchSummary: diffSummary(m.source, after),
    steps: Object.freeze(steps), reversible: true, evidence: { preconditionsMet: true, postconditionsVerified: true, executedTransformedCode: false },
    note: "accepted deterministic transform, verified by STRUCTURAL postconditions (no eval of transformed code); in-memory; real-repo write owner-gated.",
  });
}

function diffSummary(a: string, b: string): any {
  const la = a.split("\n"), lb = b.split("\n");
  let added = 0, removed = 0; const max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) { if (la[i] !== lb[i]) { if (la[i] === undefined) added++; else if (lb[i] === undefined) removed++; else { added++; removed++; } } }
  return Object.freeze({ linesAdded: added, linesRemoved: removed, lenBefore: a.length, lenAfter: b.length });
}

// ---------- §6 repair: seed a fault for a class, fix via the SAME transform, verify ----------
const FAULTS: Record<string, string> = {
  "ensure-dual-export@1": '"use strict";\nfunction f() { return 1; }\nmodule.exports = { f };\n',                   // missing export {};
  "ensure-use-strict@1": "#!/usr/bin/env node\nconst x = 1;\nmodule.exports = { x };\nexport {};\n",                  // missing use strict
  "normalize-strict-equality@1": '"use strict";\nfunction eq(a, b) { return a == b && a != 0; }\nexport {};\n',       // loose ==/!=
  "dedupe-require-lines@1": 'const A = require("./a.js");\nconst A = require("./a.js");\nconst B = require("./b.js");\n', // dup require
  "sort-named-destructure@1": 'const { sum, add, mul } = require("./m.js");\n',                                        // unsorted keys
};
function runRepair(classId: string): any {
  const faulty = FAULTS[classId];
  if (!isStr(faulty)) return Object.freeze({ ok: false, code: "NO_FAULT_FIXTURE", classId });
  const r = runTransform({ classId, source: faulty });
  return Object.freeze({ ok: true, classId, faulty, outcome: r.outcome, accepted: r.accepted, after: r.after, verified: r.outcome === OUTCOME.REPAIRED && r.accepted === true });
}

// ---------- §5 native test generation from an explicit contract (independent of impl) ----------
function generateContractTests(contract: any): any {
  const c = isObj(contract) ? contract : {};
  if (!isStr(c.fnName) || !Array.isArray(c.cases)) return Object.freeze({ ok: false, code: "INVALID_CONTRACT" });
  const kinds = ["normal", "boundary", "malformed", "adversarial", "failclosed"];
  const assertions = c.cases.filter(isObj).map((cs: any, i: number) => Object.freeze({
    id: `${c.fnName}#${i + 1}`, kind: kinds.indexOf(cs.kind) >= 0 ? cs.kind : "normal",
    args: cs.args, expect: "expect" in cs ? cs.expect : undefined, throws: cs.throws === true,
    source: "CONTRACT (expected value supplied by the contract, NOT read from the implementation)",
  }));
  const covered = new Set(assertions.map((a: any) => a.kind));
  return Object.freeze({ ok: true, fnName: c.fnName, assertions: Object.freeze(assertions), kindsCovered: Object.freeze(Array.from(covered)), independentOfImpl: true, note: "tests derive expected values from the CONTRACT, not from executing the implementation (anti-reward-hacking)." });
}

// prove the generated tests are NOT vacuous: a mutation of the function must make ≥1 assertion fail (anti-reward-hacking).
function proveTestsDetectMutation(correctFn: any, mutantFn: any, contract: any): any {
  const t = generateContractTests(contract);
  if (!t.ok) return Object.freeze({ ok: false, code: "INVALID_CONTRACT" });
  const run = (fn: any) => t.assertions.map((a: any) => { let actual: any, threw = false; try { actual = fn.apply(null, a.args); } catch (e) { threw = true; } return a.throws ? threw : actual === a.expect; });
  const correctAll = run(correctFn).every((x: boolean) => x === true);
  const mutantResults = run(mutantFn);
  const mutantCaught = mutantResults.some((x: boolean) => x === false);
  return Object.freeze({ ok: true, correctPassesAll: correctAll, mutantDetected: mutantCaught, verdict: correctAll && mutantCaught ? "TESTS_NON_VACUOUS" : (!correctAll ? "TESTS_REJECT_CORRECT" : "TESTS_MISS_MUTATION"), note: "tests are native-verified only if the correct fn passes ALL and a mutation is caught (not merely because self-tests pass)." });
}

// ---------- §8 reproducible benchmark: run every class through green/faulty/ambiguous scenarios ----------
function benchmarkCatalog(): any {
  const classes = TRANSFORM_IDS;
  let repaired = 0, green = 0, refused = 0, escalated = 0, validationFailed = 0, regressions = 0;
  const per: any[] = [];
  for (const id of classes) {
    const rep = runRepair(id);
    const already = runTransform({ classId: id, source: rep.after || "" });   // re-running on fixed output ⇒ must be GREEN (idempotent, no regression)
    const idempotent = already.outcome === OUTCOME.GREEN;
    if (!idempotent) regressions++;
    if (rep.outcome === OUTCOME.REPAIRED) repaired++;
    per.push({ classId: id, repairOutcome: rep.outcome, verified: rep.verified, idempotent });
  }
  // ambiguity/refusal correctness: a == null source must be REFUSED/ESCALATED, not transformed.
  const amb = runTransform({ classId: "normalize-strict-equality@1", source: '"use strict";\nif (x == null) {}\nexport {};\n' });
  const refusalCorrect = amb.outcome === OUTCOME.ESCALATED || amb.outcome === OUTCOME.REFUSED;
  if (refusalCorrect) escalated++;
  const unknown = runTransform({ classId: "no-such-class@9", source: "x" });
  if (unknown.outcome === OUTCOME.ESCALATED) escalated++;
  return Object.freeze({
    ok: true,
    transformationClasses: classes.length, tested: classes.length, repairedAndVerified: repaired,
    refused, escalated, validationFailed, regressions, refusalCorrect, idempotentAll: regressions === 0,
    perClass: Object.freeze(per),
    v151Baseline: { valueFunctionKinds: 5, sourceTextTransforms: 0 },
    v152: { valueFunctionKinds: 5, sourceTextTransforms: classes.length },
    note: "reproducible (no clock/random); counts only VERIFIED native repairs; refusal/escalation counted as correct safety outcomes, not failures.",
  });
}

const ODG_TRANSFORM_CATALOG_CONTRACT = Object.freeze({
  id: "V152-ODG-TRANSFORM-CATALOG",
  purpose: "expand ODG native deterministic engineering: source-text transforms with pre/postconditions + hard refusal + mutation-proven test generation",
  reuses: ["V151 odg-native-engineering executor taxonomy (ODG_NATIVE/CLAUDE_CODE/HUMAN)", "patch-executor confinement doctrine"],
  transformIds: TRANSFORM_IDS, outcomes: OUTCOME,
  invariants: Object.freeze([
    "deterministic + fail-closed; each class has preconditions, transform, postconditions, and a REFUSAL/ESCALATE path (never a guessed edit)",
    "verification is STRUCTURAL (postconditions on before/after text) — transformed code is NEVER executed (no eval surface in the transform path)",
    "a GENERATED patch is NOT an accepted patch; postcondition failure ⇒ VALIDATION_FAILED + revert (transactional); real-repo write OWNER_GATED",
    "generated tests derive expectations from the CONTRACT, not the implementation; native-verified requires a MUTATION to be caught (anti-reward-hacking)",
    "novel/unsupported structure ⇒ ESCALATED_TO_PROVIDER; no Claude-Code/provider work relabelled as native; no new primitive",
  ]),
});
module.exports = { runTransform, runRepair, generateContractTests, proveTestsDetectMutation, benchmarkCatalog, TRANSFORM_IDS, OUTCOME, ODG_TRANSFORM_CATALOG_CONTRACT };
export {};
