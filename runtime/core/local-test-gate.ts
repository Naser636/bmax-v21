#!/usr/bin/env node

/*
 * P3 — Local Test Gate (TypeScript port; behavioural parity with runtime/core/local-test-gate.js).
 *
 * Runs the repo's own tests locally and returns a pass/fail verdict, so a mission can prove itself
 * WITHOUT any AI-assisted validation. This is the "Tests locaux" tier of the permanent architecture
 * and a drop-in evidence probe for the Validation Engine (same {ok, detail} contract as its existing
 * build-green / typescript-green probes).
 *
 * Reuses the repo convention: a test file is a plain Node script that exits non-zero on failure
 * (see checkpoint-engine.test.js, build-recovery-engine.test.js). No new test framework is added.
 *
 * Strict TS port: public exports (runTests, gate), signatures, return shapes, ordering and error
 * behaviour are preserved exactly — the JavaScript source remains the behavioural reference.
 */

import { spawnSync } from "node:child_process";

export interface LocalTestResult {
  file: string;
  code: number | null;
  ok: boolean;
  error: string | null;
}
export interface LocalTestRun {
  ok: boolean;
  total: number;
  failed: number;
  results: LocalTestResult[];
}
export interface LocalTestGate {
  ok: boolean;
  detail: string;
}

// Run each test file in its own `node` process. ok === every file exited 0.
export function runTests(files: string | string[]): LocalTestRun {
  const list: string[] = Array.isArray(files) ? files : [files];
  const results: LocalTestResult[] = list.map((f) => {
    const r = spawnSync(process.execPath, [f], { encoding: "utf8" });
    const lastErr = (r.stderr || "").trim().split("\n").pop();
    return { file: f, code: r.status, ok: r.status === 0, error: r.status === 0 ? null : (lastErr ?? "") };
  });
  const failed = results.filter((r) => !r.ok);
  return { ok: failed.length === 0, total: results.length, failed: failed.length, results };
}

// Validation-Engine-style probe. Returns { ok, detail }.
export function gate(files: string | string[]): LocalTestGate {
  const r = runTests(files);
  return {
    ok: r.ok,
    detail: r.ok ? `${r.total} local test file(s) green` : `${r.failed}/${r.total} local test file(s) failed`,
  };
}
