#!/usr/bin/env node
"use strict";
/*
 * V327 §2/§3/§4 — EXECUTION-FEEDBACK REPAIR HINT (world-reference technique: Self-Debugging / Reflexion). PURE,
 * deterministic, fail-closed. Benchmarked against the world reference for LLM code repair: Chen et al. "Teaching Large
 * Language Models to Self-Debug" and Shinn et al. "Reflexion" show that feeding the SPECIFIC execution result of a
 * failing case (input → expected vs actual) repairs code far better than a GENERIC "it fails, fix it" message; 2024–2025
 * work confirms prompt-based execution-feedback self-repair helps even at ~8B scale.
 *
 * GAP in ODG: native-project-builder's repair hint is GENERIC ("the project BUILDS but FAILS the independent functional
 * test — fix the logic") because the independentTest is an opaque boolean. This produces the SPECIFIC execution feedback
 * from STRUCTURED examples (args → expect): it runs the candidate fn, finds the FIRST failing case, and emits a precise
 * self-debugging message in the SAME `{ verifyError }` seam the builder already feeds to the generator — a drop-in upgrade.
 *
 * Honesty: it reports the REAL observed (args, expected, actual|error) — never invents a trace. All-pass ⇒ no failure.
 * No network/clock/randomness; executes only the supplied fn on the supplied examples (caller controls trust).
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function show(v: any): string { try { return JSON.stringify(v); } catch { return String(v); } }

/**
 * buildExecutionFeedback(examples, fn) -> { hasFailure, failing, verifyError, checked }.
 *   examples: [{ args:[...], expect }]. fn: the candidate function.
 * Runs each example in order; the FIRST (args→expect) mismatch (or thrown error) becomes a specific self-debugging
 * message (world-reference technique). All pass ⇒ hasFailure:false. A non-function / malformed examples ⇒ fail-closed
 * (a generic verifyError, so the caller still gets a usable hint — never a false "all pass").
 */
function buildExecutionFeedback(examples: any, fn: any): any {
  const GENERIC = "the project BUILDS but FAILS the independent functional test — the logic does not satisfy the contract; fix the logic";
  if (typeof fn !== "function") return freeze({ hasFailure: true, failing: null, verifyError: GENERIC, checked: 0, reason: "candidate is not a function" });
  const exs = Array.isArray(examples) ? examples.filter((e: any) => isObj(e) && Array.isArray(e.args)) : [];
  if (exs.length === 0) return freeze({ hasFailure: true, failing: null, verifyError: GENERIC, checked: 0, reason: "no structured examples ⇒ generic feedback (no execution trace available)" });

  for (const ex of exs) {
    let actual: any, threw: any = null;
    try { actual = fn(...ex.args); } catch (e: any) { threw = String((e && e.message) || e); }
    const ok = threw === null && actual === ex.expect;
    if (!ok) {
      const argsStr = ex.args.map(show).join(", ");
      const verifyError = threw !== null
        ? `EXECUTION FEEDBACK: calling the function with (${argsStr}) THREW an error: "${threw}". The code must not throw on this input; expected ${show(ex.expect)}. Fix the logic so this exact case returns ${show(ex.expect)}.`
        : `EXECUTION FEEDBACK: calling the function with (${argsStr}) returned ${show(actual)} but the expected result is ${show(ex.expect)}. The code builds but is logically wrong for this case. Fix the logic so this exact case returns ${show(ex.expect)}.`;
      return freeze({ hasFailure: true, failing: freeze({ args: freeze(ex.args.slice()), expect: ex.expect, actual: threw === null ? actual : null, threw }), verifyError, checked: exs.length });
    }
  }
  return freeze({ hasFailure: false, failing: null, verifyError: null, checked: exs.length });
}

const REPAIR_FEEDBACK_CONTRACT = Object.freeze({
  id: "V327-EXECUTION-FEEDBACK-REPAIR",
  purpose: "§3 — upgrade native code repair from a GENERIC hint to SPECIFIC execution feedback (first failing input → expected vs actual), the world-reference Self-Debugging/Reflexion technique, in the SAME {verifyError} seam the builder already uses",
  reference: Object.freeze(["Chen et al. 2023 'Teaching LLMs to Self-Debug' (arXiv:2304.05128)", "Shinn et al. 2023 'Reflexion' (arXiv:2303.11366)", "2024–2025 execution-feedback self-repair confirmed at ~8B scale (arXiv:2501.12793)"]),
  invariants: Object.freeze([
    "reports the REAL observed (args, expected, actual|threw) of the FIRST failing example — never invents a trace",
    "all examples pass ⇒ hasFailure:false (no fabricated failure); a non-function / no-structured-examples ⇒ fail-closed GENERIC verifyError (never a false all-pass)",
    "emits in the SAME `{ verifyError }` seam native-project-builder feeds the generator ⇒ a drop-in upgrade, no parallel repair engine",
    "executes ONLY the supplied fn on the supplied examples (caller controls trust); PURE/deterministic/frozen",
  ]),
});

module.exports = { buildExecutionFeedback, REPAIR_FEEDBACK_CONTRACT };
export {};
