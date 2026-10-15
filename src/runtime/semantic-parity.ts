#!/usr/bin/env node
"use strict";

/*
 * SEMANTIC_PARITY contract (§U Phase-1 #2) — a reusable, declarative parity harness.
 *
 * Purpose. Equivalence benches today each hand-roll check()/EQ/ad-hoc normalization and only a few assert
 * the forbidden-real-effect invariant (V39 Gate A: 47 benches, 47 inline check(), 31 ad-hoc normalizers,
 * 2 effect assertions). This contract makes the four needs uniform and explicit:
 *   (1) DECLARED normalizers — applied explicitly and RECORDED (count per normalizer); never silent.
 *   (2) Deterministic semantic comparison + a readable verdict — REUSES cross-runtime-parity.compareArtifact
 *       (the existing comparison engine; ISO-timestamp normalization + business-divergence offset). NO second
 *       comparison engine is created.
 *   (3) Allowed-contained vs forbidden-real effects — the compared producers run under an fs-write GUARD:
 *       a write whose resolved path is under the EXPLICITLY-INJECTED tempDir is ALLOWED and delegated to real
 *       fs; a write anywhere else (the real repo or elsewhere) THROWS and fails the parity check.
 *   (4) A structured parity proof.
 *
 * HONESTY — coverage is bounded and stated, NEVER overclaimed. The effect guard covers ONLY the four fs
 * mutators it wraps (writeFileSync / appendFileSync / mkdirSync / rmSync) by resolved target path. It does
 * NOT cover child processes, network, raw file descriptors, or any other side-effect path. This contract
 * therefore proves "no forbidden fs write via the wrapped methods during the compared run" — it does NOT
 * prove the universal absence of all effects.
 *
 * Read-only w.r.t. the repo: this module writes nothing itself; it only installs/restores the guard and
 * delegates allowed writes to the caller's injected tempDir.
 */

import fs from "node:fs";
import path from "node:path";

// REUSE the existing comparison engine (no second comparator). Requiring it has no import-time effect
// (its spawnSync lives only inside run()/the require.main CLI, neither of which runs on import).
const parity = require("../../scripts/cross-runtime-parity");

export interface Normalizer {
  name: string; // human-readable (e.g. "createdAt")
  pattern: RegExp; // MUST be a global regex so replace counts every occurrence
  placeholder: string; // e.g. "<createdAt>"
}

export interface AppliedNormalizer { name: string; count: number }

export interface EffectReport {
  forbiddenDetected: boolean;
  detail: string;
  coverage: string; // explicit statement of what the guard does and does NOT cover
}

export interface ParityResult {
  name: string;
  parity: boolean;
  reason: string;
  normalizersApplied: AppliedNormalizer[];
  effect: EffectReport;
}

const EFFECT_COVERAGE =
  "guard covers fs.writeFileSync/appendFileSync/mkdirSync/rmSync by resolved target path; " +
  "does NOT cover child processes, network, raw file descriptors, or other side-effect paths — " +
  "a PASS proves no forbidden fs write via these methods, NOT universal effect-absence";

// Apply the DECLARED normalizers explicitly, recording each substitution count (transparent — a 0-count
// normalizer is still reported). Returns the normalized text + the per-normalizer counts.
function applyDeclared(text: string, normalizers: Normalizer[]): { text: string; applied: AppliedNormalizer[] } {
  const applied: AppliedNormalizer[] = [];
  let out = typeof text === "string" ? text : String(text);
  for (const n of normalizers || []) {
    if (!n || !(n.pattern instanceof RegExp) || !n.pattern.global) {
      throw new Error(`semantic-parity: normalizer "${n && n.name}" must declare a GLOBAL RegExp pattern`);
    }
    let count = 0;
    out = out.replace(n.pattern, () => { count += 1; return n.placeholder; });
    applied.push({ name: n.name, count });
  }
  return { text: out, applied };
}

/**
 * Compare two ALREADY-PRODUCED artifact strings under DECLARED normalizers. Pure (no fs, no guard).
 * The declared normalizers are applied first (recorded); then cross-runtime-parity.compareArtifact adds
 * its ISO-timestamp normalization and the business-divergence verdict. parity === compareArtifact.identical.
 */
export function compareUnderContract(name: string, jsRaw: string, tsRaw: string, normalizers: Normalizer[] = []): ParityResult {
  const nj = applyDeclared(jsRaw, normalizers);
  const nt = applyDeclared(tsRaw, normalizers);
  const cmp = parity.compareArtifact(name, { present: true, raw: nj.text }, { present: true, raw: nt.text });
  const declaredSummary = nj.applied.length ? ` | declared normalizers: ${nj.applied.map((a) => `${a.name}×${a.count}`).join(", ")}` : "";
  return {
    name,
    parity: cmp.identical === true,
    reason: cmp.reason + declaredSummary,
    normalizersApplied: nj.applied,
    effect: { forbiddenDetected: false, detail: "no compared execution (string comparison only)", coverage: EFFECT_COVERAGE },
  };
}

export interface ProveParityInput {
  name: string;
  tempDir: string; // the ONLY directory in which writes are allowed during the compared run
  jsProduce: () => string; // returns the JS artifact text; may write ONLY under tempDir
  tsProduce: () => string; // returns the TS artifact text; may write ONLY under tempDir
  normalizers?: Normalizer[];
}

/**
 * Run both producers under the fs-write guard (allowed = tempDir, forbidden = anywhere else), then compare
 * their returned artifact texts under the declared normalizers. A forbidden write ⇒ parity:false with
 * effect.forbiddenDetected:true (and the write never reaches the real repo — the guard throws before fs).
 */
export function proveParity(input: ProveParityInput): ParityResult {
  const { name, tempDir, jsProduce, tsProduce, normalizers = [] } = input;
  if (typeof tempDir !== "string" || !tempDir) throw new Error("semantic-parity: an explicit tempDir must be injected");
  const allowRoot = path.resolve(tempDir);
  const real: any = {
    writeFileSync: fs.writeFileSync, appendFileSync: fs.appendFileSync, mkdirSync: fs.mkdirSync, rmSync: fs.rmSync,
  };
  let forbidden: string | null = null;
  const isAllowed = (p: any): boolean => {
    const abs = path.resolve(String(p));
    return abs === allowRoot || abs.startsWith(allowRoot + path.sep);
  };
  const wrap = (methodName: string) => (p: any, ...rest: any[]) => {
    if (isAllowed(p)) return (real[methodName] as any)(p, ...rest); // allowed-contained write
    forbidden = forbidden || `fs.${methodName} → ${path.resolve(String(p))}`;
    throw new Error(`semantic-parity: FORBIDDEN real write via fs.${methodName}(${path.resolve(String(p))}) outside injected tempDir`);
  };
  let jsRaw = "", tsRaw = "", runError: string | null = null;
  try {
    (fs as any).writeFileSync = wrap("writeFileSync");
    (fs as any).appendFileSync = wrap("appendFileSync");
    (fs as any).mkdirSync = wrap("mkdirSync");
    (fs as any).rmSync = wrap("rmSync");
    try {
      jsRaw = jsProduce();
      tsRaw = tsProduce();
    } catch (e) {
      runError = (e as Error).message;
    }
  } finally {
    fs.writeFileSync = real.writeFileSync; fs.appendFileSync = real.appendFileSync;
    fs.mkdirSync = real.mkdirSync; fs.rmSync = real.rmSync;
  }
  if (forbidden) {
    return {
      name, parity: false, reason: `FORBIDDEN real effect during compared run: ${forbidden}`,
      normalizersApplied: [],
      effect: { forbiddenDetected: true, detail: forbidden, coverage: EFFECT_COVERAGE },
    };
  }
  if (runError) {
    return {
      name, parity: false, reason: `producer threw (non-effect): ${runError}`,
      normalizersApplied: [],
      effect: { forbiddenDetected: false, detail: "producer error unrelated to the write guard", coverage: EFFECT_COVERAGE },
    };
  }
  const res = compareUnderContract(name, jsRaw, tsRaw, normalizers);
  // Carry the (clean) effect coverage from the guarded run.
  res.effect = { forbiddenDetected: false, detail: "no forbidden fs write via the wrapped methods during the compared run", coverage: EFFECT_COVERAGE };
  return res;
}

module.exports = { compareUnderContract, proveParity, EFFECT_COVERAGE };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
