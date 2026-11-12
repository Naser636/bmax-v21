#!/usr/bin/env node
"use strict";
/*
 * V153 — ODG CLOSED DETERMINISTIC EXECUTOR. PURE, deterministic, fail-closed. Replaces the V151 `new Function` surface in the
 * native engineering cycle with a CLOSED, deny-by-default REGISTRY of pre-registered native operations. It accepts an opId +
 * TYPED args — NEVER a code string, never eval/new Function/dynamic import. Radar V153: "extensions containing eval()/new
 * Function()/dynamic import should be REJECTED"; deny-by-default registries are the correct design.
 *
 * Security properties (demonstrated by the executor's behaviour, not by comments):
 *   - deny-by-default: an unregistered opId ⇒ UNREGISTERED_OP (no execution).
 *   - no code strings: executeOp takes (opId, args[]); a string op body cannot be injected.
 *   - strict typing + arity: each arg validated against the op's declared argKinds + arity.
 *   - size limits: numeric magnitude bounded ⇒ VALUE_TOO_LARGE (no resource blow-up); ops are O(1) (no loops/recursion).
 *   - reproducible + traceable: same (opId,args) ⇒ same result; every call returns a trace; no clock/random.
 *   - it is NOT a sandbox: it provides a CLOSED operation surface, not process/VM isolation. We never call it a sandbox.
 */
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function isInt(v: any): boolean { return typeof v === "number" && Number.isInteger(v); }

const MAX_MAGNITUDE = 1e15;   // bounds numeric args/results (no resource blow-up); explicit, versioned.

// CLOSED registry: opId → { version, arity, argKinds, fn (pre-registered NATIVE function), repr (evidence string, NEVER executed) }.
// Both canonical ops and explicit `.faulty` siblings are REGISTERED native functions — a repair fixture never injects code.
const OPS: Record<string, any> = {
  "sum@1": { arity: 2, argKinds: ["number", "number"], fn: (a: number, b: number) => a + b, repr: "(a, b) => a + b" },
  "sum.faulty@1": { arity: 2, argKinds: ["number", "number"], fn: (a: number, b: number) => a - b, repr: "(a, b) => a - b" },
  "max@1": { arity: 2, argKinds: ["number", "number"], fn: (a: number, b: number) => (a > b ? a : b), repr: "(a, b) => (a > b ? a : b)" },
  "max.faulty@1": { arity: 2, argKinds: ["number", "number"], fn: (a: number, b: number) => (a < b ? a : b), repr: "(a, b) => (a < b ? a : b)" },
  "clampNonNegative@1": { arity: 1, argKinds: ["number"], fn: (x: number) => (x < 0 ? 0 : x), repr: "(x) => (x < 0 ? 0 : x)" },
  "clampNonNegative.faulty@1": { arity: 1, argKinds: ["number"], fn: (x: number) => x, repr: "(x) => x" },
  "isEven@1": { arity: 1, argKinds: ["integer"], fn: (n: number) => n % 2 === 0, repr: "(n) => n % 2 === 0" },
  "isEven.faulty@1": { arity: 1, argKinds: ["integer"], fn: (n: number) => n % 2 === 1, repr: "(n) => n % 2 === 1" },
  "absMinor@1": { arity: 1, argKinds: ["integer"], fn: (x: number) => (x < 0 ? -x : x), repr: "(x) => (x < 0 ? -x : x)" },
  "absMinor.faulty@1": { arity: 1, argKinds: ["integer"], fn: (x: number) => x, repr: "(x) => x" },
};
const OP_IDS = Object.freeze(Object.keys(OPS));

function kindOk(kind: string, v: any): boolean { return kind === "integer" ? isInt(v) : kind === "number" ? isNum(v) : false; }

/** executeOp(opId, args, opts?) — the ONLY execution entry point. Deny-by-default; no code strings ever. */
function executeOp(opId: any, args: any, opts?: any): any {
  const trace: any = { opId, requestedArgs: Array.isArray(args) ? args.length : null };
  if (!isStr(opId)) return Object.freeze({ ok: false, code: "INVALID_OP_ID", trace: Object.freeze(trace) });
  // explicit rejection if someone tries to pass code instead of an opId (defense-in-depth, deny-by-default).
  if (/[(){}=;]|=>|function|eval|require|import/.test(opId)) return Object.freeze({ ok: false, code: "CODE_STRING_REJECTED", detail: "executeOp accepts a registered opId, never a code string", trace: Object.freeze(trace) });
  const op = OPS[opId];
  if (!op) return Object.freeze({ ok: false, code: "UNREGISTERED_OP", detail: `op '${opId}' is not in the closed registry (deny-by-default)`, trace: Object.freeze(trace) });
  if (!Array.isArray(args)) return Object.freeze({ ok: false, code: "ARGS_NOT_ARRAY", trace: Object.freeze(trace) });
  if (args.length !== op.arity) return Object.freeze({ ok: false, code: "ARITY_MISMATCH", detail: `op '${opId}' expects ${op.arity} arg(s), got ${args.length}`, trace: Object.freeze(trace) });
  for (let i = 0; i < op.arity; i++) {
    if (!kindOk(op.argKinds[i], args[i])) return Object.freeze({ ok: false, code: "TYPE_MISMATCH", detail: `arg ${i} must be ${op.argKinds[i]}`, trace: Object.freeze(trace) });
    if (Math.abs(args[i]) > MAX_MAGNITUDE) return Object.freeze({ ok: false, code: "VALUE_TOO_LARGE", detail: `arg ${i} magnitude exceeds ${MAX_MAGNITUDE}`, trace: Object.freeze(trace) });
  }
  let result: any;
  try { result = op.fn.apply(null, args); } catch (e: any) { return Object.freeze({ ok: false, code: "OP_THREW", detail: (e && e.message) || String(e), trace: Object.freeze(trace) }); }
  if (isNum(result) && Math.abs(result) > MAX_MAGNITUDE) return Object.freeze({ ok: false, code: "RESULT_TOO_LARGE", trace: Object.freeze(trace) });
  trace.executed = true; trace.version = opId;
  return Object.freeze({ ok: true, result, opId, repr: op.repr, deterministic: true, trace: Object.freeze(trace), note: "executed a pre-registered native op from the closed registry; no code string, no eval/new Function." });
}

/** getRepr(opId) — the op's source representation for EVIDENCE/display only. It is NEVER executed. */
function getRepr(opId: any): string | null { const op = isStr(opId) ? OPS[opId] : null; return op ? op.repr : null; }
function isRegistered(opId: any): boolean { return isStr(opId) && Object.prototype.hasOwnProperty.call(OPS, opId); }

const CLOSED_EXECUTOR_CONTRACT = Object.freeze({
  id: "V153-ODG-CLOSED-EXECUTOR",
  purpose: "replace the V151 new Function surface with a CLOSED deny-by-default native operation registry (no eval, no code strings)",
  reuses: ["deny-by-default policy doctrine (bash-command-governor)", "V151 catalog op semantics"],
  maxMagnitude: MAX_MAGNITUDE, registeredOps: OP_IDS,
  invariants: Object.freeze([
    "NO eval / new Function / dynamic import / vm; executeOp takes (opId, typed args[]) — never a code string",
    "deny-by-default: an unregistered opId or a code-string-shaped opId ⇒ rejected (UNREGISTERED_OP / CODE_STRING_REJECTED)",
    "strict arity + type (number/integer) validation; numeric magnitude bounded (VALUE_TOO_LARGE / RESULT_TOO_LARGE)",
    "ops are pre-registered native functions, O(1), no loops/recursion/side effects/network/fs/secrets; reproducible + traced",
    "this is a CLOSED OPERATION SURFACE, NOT process/VM isolation — never called a sandbox; no new primitive",
  ]),
});
module.exports = { executeOp, getRepr, isRegistered, OP_IDS, MAX_MAGNITUDE, CLOSED_EXECUTOR_CONTRACT };
export {};
