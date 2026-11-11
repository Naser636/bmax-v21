#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V82 §3 — SEMANTIC EVIDENCE QUALIFIER. V81 declared ALREADY_DONE on mere file EXISTENCE. This upgrades the
 * check: a pointer is VALID only when it (a) resolves, (b) is non-empty, (c) contains ALL expected semantic markers tying
 * it to the requirement, and (d) if it is a .test.ts, is actually wired into the gate suite. Otherwise it is INSUFFICIENT
 * (⇒ NOT_MEASURED / LOCAL_REMAINING), and absent ⇒ ABSENT. A non-measured evidence is NEVER upgraded to VALID. The
 * qualifier reads files via injected readers (pure-at-the-core, I/O injected) so it is testable offline. Dual export.
 */

const STATUS = Object.freeze(["VALID", "INSUFFICIENT", "ABSENT"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/*
 * qualify(ref, opts) -> { status, basis, checks }. opts:
 *   { exists(ref)->bool, read(ref)->string|null, expectMarkers:[string], gateSuites:[string] (for .test.ts) }
 * Deterministic given the injected readers. Fail-closed: any failed check downgrades the status.
 */
function qualify(ref: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const exists = typeof o.exists === "function" ? o.exists : (() => false);
  const read = typeof o.read === "function" ? o.read : (() => null);
  const markers = arr(o.expectMarkers).map(String);
  const gate = arr(o.gateSuites).map(String);
  const checks: any = {};
  if (typeof ref !== "string" || !ref) return Object.freeze({ status: "ABSENT", basis: "no reference supplied", checks });

  checks.resolves = exists(ref) === true;
  if (!checks.resolves) return Object.freeze({ status: "ABSENT", basis: "evidence pointer does not resolve", checks });

  const content = read(ref);
  checks.nonEmpty = typeof content === "string" && content.trim().length > 0;
  if (!checks.nonEmpty) return Object.freeze({ status: "INSUFFICIENT", basis: "evidence resolves but is empty/unreadable ⇒ NOT_MEASURED (not fabricated as done)", checks });

  // (c) semantic match: every expected marker must be present in the content.
  const missing = markers.filter((m) => !String(content).includes(m));
  checks.markersPresent = missing.length === 0;
  checks.missingMarkers = missing;
  if (!checks.markersPresent) return Object.freeze({ status: "INSUFFICIENT", basis: `evidence resolves but is missing expected markers [${missing.join(", ")}] ⇒ not tied to the requirement`, checks });

  // (d) if it is a test file, it must be wired into the gate (otherwise it is not a running proof).
  if (/\.test\.ts$/.test(ref)) {
    const base = (s: string) => String(s).split("/").pop();   // exact basename match — avoids 'unwired' ⊃ 'wired' false-positives
    checks.wiredInGate = gate.some((g) => g === ref || base(g) === base(ref));
    if (!checks.wiredInGate) return Object.freeze({ status: "INSUFFICIENT", basis: "test file resolves but is NOT wired into the gate ⇒ not a running proof", checks });
  }

  return Object.freeze({ status: "VALID", basis: "resolves + non-empty + all expected markers present" + (/\.test\.ts$/.test(ref) ? " + gate-wired" : ""), checks });
}

const EVIDENCE_QUALIFIER_CONTRACT = Object.freeze({
  id: "V82-EVIDENCE-QUALIFIER", source: "CTO V82 §3 — semantic evidence qualification (beyond file existence)",
  statuses: STATUS,
  notAuthority: "qualifies evidence; it decides no closure; ODG decides; readers are injected (testable offline)",
  invariants: Object.freeze([
    "VALID requires resolve + non-empty + ALL expected markers (+ gate-wired for a .test.ts); else INSUFFICIENT/ABSENT",
    "a non-measured/insufficient evidence is NEVER upgraded to VALID (no fabrication)",
    "mere file existence is NOT sufficient — the content must semantically match the requirement",
    "deterministic given injected exists/read; fail-closed on any failed check",
  ]),
});

module.exports = { STATUS, qualify, EVIDENCE_QUALIFIER_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(EVIDENCE_QUALIFIER_CONTRACT, null, 2) + "\n"); }
export {};
