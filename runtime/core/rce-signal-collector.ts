#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 3 / M-CH3-01 (Root-Cause Engineering — program §4.3 RCE-01 Signal Collector + RCE-02 Defect Detection).
 * PURE, deterministic. Normalizes heterogeneous DEFECT signals (from code / build / tsc / tests / contracts /
 * dependencies / traces / incidents) into one canonical typed stream with provenance, and classifies each into the
 * RCE-02 defect-kind taxonomy. This is the DEFECT-signal collector for the RCE domain — distinct from the existing
 * frontier-radar signal collector (which gathers external TECHNOLOGY signals). Feeds rce-root-cause-intelligence
 * (the causal-layer classifier already built). Fail-closed: a signal WITHOUT provenance is UNATTRIBUTED (never
 * counted as a confirmed defect); an unrecognized kind is UNKNOWN_DEFECT (never silently dropped). It detects/
 * normalizes; it repairs nothing and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

// RCE-02 defect taxonomy (program §4.3).
const DEFECT_KINDS = Object.freeze(["SYNTAX", "TYPE", "IMPORT", "DEPENDENCY", "LOGIC", "CONTRACT_VIOLATION", "VULNERABILITY", "DATA", "RESOURCE_LEAK", "PERFORMANCE", "ARCHITECTURAL", "RUNTIME", "REGRESSION", "BEHAVIOR_ANOMALY", "WORKFLOW_FAILURE", "UNKNOWN_DEFECT"]);
const SEVERITIES = Object.freeze(["HIGH", "MEDIUM", "LOW", "INFO"]);
// source/marker → defect kind (ordered; first match wins). Matched against `${source} ${detail} ${markers}`.
const KIND_RULES: Array<[RegExp, string]> = [
  [/\bsyntax|parse error|unexpected token\b/i, "SYNTAX"],
  [/\btsc|typescript|type error|ts\d{3,}|type mismatch\b/i, "TYPE"],
  [/\bimport|require|module not found|cannot find module\b/i, "IMPORT"],
  [/\bdependency|peer dep|npm|version conflict|incompatible\b/i, "DEPENDENCY"],
  [/\bcontract|api-contract|schema incompatib|breaking change\b/i, "CONTRACT_VIOLATION"],
  [/\bvuln|cve-|security|secret|injection|exploit\b/i, "VULNERABILITY"],
  [/\bdata quality|schema drift|lineage|dataset\b/i, "DATA"],
  [/\bleak|resource exhaust|fd leak|unclosed\b/i, "RESOURCE_LEAK"],
  [/\bperf|latency|slow|p99|saturation|timeout\b/i, "PERFORMANCE"],
  [/\barchitect|fitness|invariant breach|boundary\b/i, "ARCHITECTURAL"],
  [/\bregression|previously passing|fail-to-pass\b/i, "REGRESSION"],
  [/\bflaky|non-determinis|behavior anomaly\b/i, "BEHAVIOR_ANOMALY"],
  [/\bworkflow|saga|compensation|state machine\b/i, "WORKFLOW_FAILURE"],
  [/\bruntime|exception|crash|unhandled|segfault\b/i, "RUNTIME"],
  [/\btest fail|assertion|logic error\b/i, "LOGIC"],
];

/** classifyDefect(signal) -> one DEFECT_KIND. An explicit valid signal.kind wins; else source/detail markers; else UNKNOWN_DEFECT. */
function classifyDefect(signal: any): string {
  const s = isObj(signal) ? signal : {};
  if (isStr(s.kind) && DEFECT_KINDS.includes(s.kind)) return s.kind;
  const hay = [s.source, s.detail].concat(arr(s.markers)).filter(isStr).join(" ");
  for (const [re, kind] of KIND_RULES) if (re.test(hay)) return kind;
  return "UNKNOWN_DEFECT";
}

/** normalizeSignal(raw) -> canonical {id, source, kind, severity, detail, provenance, attributed}. */
function normalizeSignal(raw: any, i: number): any {
  const r = isObj(raw) ? raw : {};
  const provenance = isStr(r.provenance) ? r.provenance : null;   // source-of-truth tag (file/commit/run); required
  const severity = SEVERITIES.includes(r.severity) ? r.severity : "MEDIUM";
  return Object.freeze({
    id: isStr(r.id) ? r.id : `sig-${i}`,
    source: isStr(r.source) ? r.source : "unknown",
    kind: classifyDefect(r),
    severity,
    detail: isStr(r.detail) ? r.detail : "",
    provenance,
    attributed: provenance !== null,
  });
}

/**
 * collect({ signals }) -> { normalized, byKind, bySeverity, unattributed, counts }.
 * Fail-closed: a signal without provenance is UNATTRIBUTED (listed, but NOT counted among confirmed defects);
 * an unrecognized kind is UNKNOWN_DEFECT (never silently dropped).
 */
function collect(input: any): any {
  const o = isObj(input) ? input : {};
  const normalized = arr(o.signals).map(normalizeSignal);
  const confirmed = normalized.filter((s) => s.attributed === true);
  const unattributed = normalized.filter((s) => s.attributed === false);
  const byKind: any = {}; const bySeverity: any = {};
  for (const s of confirmed) { byKind[s.kind] = (byKind[s.kind] || 0) + 1; bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1; }
  return Object.freeze({
    normalized: Object.freeze(normalized),
    confirmed: Object.freeze(confirmed),
    unattributed: Object.freeze(unattributed),
    byKind: Object.freeze(byKind), bySeverity: Object.freeze(bySeverity),
    counts: Object.freeze({ total: normalized.length, confirmed: confirmed.length, unattributed: unattributed.length, unknownKind: confirmed.filter((s) => s.kind === "UNKNOWN_DEFECT").length }),
    note: unattributed.length > 0 ? `${unattributed.length} signal(s) without provenance ⇒ UNATTRIBUTED, not counted as confirmed defects (fail-closed)` : "all signals attributed",
  });
}

const RCE_SIGNAL_COLLECTOR_CONTRACT = Object.freeze({
  id: "V5-RCE-SIGNAL-COLLECTOR",
  source: "ODG Master program §4.3 RCE-01 Signal Collector + RCE-02 Defect Detection",
  defectKinds: DEFECT_KINDS,
  reuses: Object.freeze(["normalizes signals from codebase-diagnostic / tsc / tests / api-contract / dependency checks / incidents", "feeds rce-root-cause-intelligence (causal-layer classifier)"]),
  notAuthority: "a read-only defect-signal normalizer/classifier; it repairs nothing and grants no authority",
  invariants: Object.freeze([
    "every signal is normalized to a canonical typed record and classified into the RCE-02 defect taxonomy",
    "fail-closed: a signal without provenance is UNATTRIBUTED — never counted among confirmed defects",
    "an unrecognized defect kind is UNKNOWN_DEFECT — never silently dropped",
    "an explicit valid signal.kind wins; else source/detail markers decide; deterministic first-match",
    "pure/deterministic: signals in → normalized stream out; no clock/random/network; distinct from the radar's technology-signal collector",
  ]),
});

module.exports = { DEFECT_KINDS, classifyDefect, normalizeSignal, collect, RCE_SIGNAL_COLLECTOR_CONTRACT };

if (require.main === module) {
  const demo = collect({ signals: [
    { id: "s1", source: "tsc", detail: "TS2339 type mismatch", severity: "HIGH", provenance: "runtime/core/x.ts@abc" },
    { id: "s2", source: "test", detail: "regression: previously passing", provenance: "ci-run-42" },
    { id: "s3", source: "mystery", detail: "weird", severity: "LOW" },
  ] });
  process.stdout.write(JSON.stringify({ ...RCE_SIGNAL_COLLECTOR_CONTRACT, demo: { counts: demo.counts, byKind: demo.byKind } }, null, 2) + "\n");
}

export {};
