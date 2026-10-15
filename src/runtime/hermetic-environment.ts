#!/usr/bin/env node
"use strict";

/*
 * HERMETIC_ENVIRONMENT contract (§U Phase-1 #5) — a read-only, declarative verify contract.
 *
 * It COMPOSES existing mechanisms (no second sandbox / build engine / verdict authority):
 *   - toolchain fingerprint   : deterministic read of process.version + resolved typescript/tsx versions +
 *                               a sha256 of the lockfile; compared to an EXPECTED fingerprint when provided.
 *   - cache state             : a STALE tsconfig.tsbuildinfo (or an incompatible runtime/dist precondition)
 *                               ⇒ BLOCKED, never PASS. READ-ONLY: this contract NEVER deletes a cache or
 *                               touches the build (fixing/cleaning is a separate authorized mission).
 *   - write confinement       : REUSES the V40 semantic-parity write-guard (proveParity) via an injected probe.
 *   - network policy          : ENFORCED only when an OBSERVED isolation record reports network:false (from
 *                               the existing bwrap substrate); otherwise UNVERIFIED. NEVER claims "network
 *                               off" on intent/config alone. detectSandbox() only reports substrate
 *                               AVAILABILITY — availability is NOT a proof of an isolated run.
 *   - reproducibility         : two artifacts compared via semantic-parity.compareUnderContract (declared
 *                               normalizers; a business divergence is rejected).
 *   - verdicts                : composed through runGates (V42) — PASS/FAIL/BLOCKED/SKIPPED/NOT-EXECUTED,
 *                               stop-on-first-non-PASS, no false DONE. No second verdict authority.
 *
 * HONESTY: every result carries its evidence + limits; a check never claims to have run if it did not, and
 * network is reported UNVERIFIED rather than fabricated when isolation was not observed.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runGates } from "./validation-orchestrator";
import type { GateSeamResult } from "./validation-orchestrator";
import { compareUnderContract } from "./semantic-parity";
import type { Normalizer } from "./semantic-parity";

const { detectSandbox } = require("../../runtime/core/bash-command-governor");

export interface ToolchainFingerprint {
  node: string;
  typescript: string | null;
  tsx: string | null;
  lockfileSha256: string | null;
}

function pkgVersion(mod: string): string | null {
  try { return require(`${mod}/package.json`).version; } catch { return null; }
}

/** Deterministic toolchain fingerprint from the REALLY-observed versions (no claim, just captured). */
export function toolchainFingerprint(root: string = process.cwd()): ToolchainFingerprint {
  let lockfileSha256: string | null = null;
  try {
    const lock = fs.readFileSync(path.join(root, "package-lock.json"));
    lockfileSha256 = crypto.createHash("sha256").update(lock).digest("hex");
  } catch { lockfileSha256 = null; }
  return { node: process.version, typescript: pkgVersion("typescript"), tsx: pkgVersion("tsx"), lockfileSha256 };
}

/** READ-ONLY cache precondition check. A present tsconfig.tsbuildinfo is a STALE-cache risk ⇒ BLOCKED. */
export function checkCaches(root: string = process.cwd()): GateSeamResult {
  const tsbuild = path.join(root, "tsconfig.tsbuildinfo");
  if (fs.existsSync(tsbuild)) {
    return { status: "BLOCKED", detail: "stale incremental cache present (tsconfig.tsbuildinfo) — a clean hermetic run requires it absent; this contract does NOT delete it (separate authorized mission)" };
  }
  return { status: "PASS", detail: "no tsconfig.tsbuildinfo present (clean incremental-cache precondition)" };
}

export interface NetworkPolicyResult {
  policy: "ENFORCED" | "UNVERIFIED";
  detail: string;
  substrateAvailable: boolean;
}

/**
 * ENFORCED only when an OBSERVED isolation record reports network:false (from the existing substrate).
 * Otherwise UNVERIFIED — NEVER "off" on intent. substrateAvailable (detectSandbox) is reported for context
 * but is NOT sufficient for ENFORCED (availability ≠ an observed isolated run).
 */
export function networkPolicy(observedIsolation: any): NetworkPolicyResult {
  let substrateAvailable = false;
  try { substrateAvailable = !!(detectSandbox({}) || {}).available; } catch { substrateAvailable = false; }
  const enforced = !!(observedIsolation && observedIsolation.network === false);
  return enforced
    ? { policy: "ENFORCED", detail: "observed isolation reports network:false (bwrap substrate) — enforced, not intended", substrateAvailable }
    : { policy: "UNVERIFIED", detail: `network isolation NOT observed ⇒ UNVERIFIED (never claimed off); substrate available=${substrateAvailable}`, substrateAvailable };
}

export interface HermeticSpec {
  root?: string;
  expectedFingerprint?: Partial<ToolchainFingerprint>; // compared when provided; divergence ⇒ FAIL
  normalizers?: Normalizer[];
}

export interface HermeticSeams {
  observedIsolation?(): any; // the isolation record from an actual bwrap run ({network:false,...}) or null
  reproduce?(): { a: string; b: string }; // two artifacts to compare for reproducibility
  confinementProbe?(): { status: "PASS" | "FAIL" | "BLOCKED"; detail: string }; // delegates to a V40 proveParity run
  log?(msg: string): void;
}

function fingerprintGate(spec: HermeticSpec): GateSeamResult {
  const fp = toolchainFingerprint(spec.root);
  const exp = spec.expectedFingerprint;
  if (exp) {
    const diffs = (Object.keys(exp) as Array<keyof ToolchainFingerprint>)
      .filter((k) => exp[k] !== undefined && exp[k] !== (fp as any)[k])
      .map((k) => `${k}: expected ${exp[k]} got ${(fp as any)[k]}`);
    if (diffs.length) return { status: "FAIL", detail: `toolchain fingerprint divergence — ${diffs.join("; ")}` };
    return { status: "PASS", detail: `toolchain fingerprint matches expected (node ${fp.node}, ts ${fp.typescript}, tsx ${fp.tsx})` };
  }
  return { status: "PASS", detail: `toolchain fingerprint captured (node ${fp.node}, ts ${fp.typescript}, tsx ${fp.tsx}, lock ${fp.lockfileSha256 ? fp.lockfileSha256.slice(0, 12) : "none"})` };
}

export interface HermeticResult {
  ok: boolean;
  exitCode: number;
  gates: any[];
  fingerprint: ToolchainFingerprint;
  network: NetworkPolicyResult;
}

/**
 * verifyHermetic(spec, seams) — compose the declared gates through runGates. Order:
 *   toolchain → caches → write-confinement → network → reproducibility.
 * A required gate that is SKIPPED (e.g. UNVERIFIED network, or an absent probe) keeps the environment
 * NOT fully-hermetic (ok=false) — honestly, never a false PASS.
 */
export function verifyHermetic(spec: HermeticSpec = {}, seams: HermeticSeams = {}): HermeticResult {
  const root = spec.root ?? process.cwd();
  const net = networkPolicy(seams.observedIsolation ? seams.observedIsolation() : null);

  const gate = (name: string): GateSeamResult => {
    switch (name) {
      case "toolchain":
        return fingerprintGate(spec);
      case "caches":
        return checkCaches(root);
      case "write-confinement":
        return seams.confinementProbe
          ? seams.confinementProbe()
          : { status: "SKIPPED", detail: "no write-confinement probe injected (not verified this run)" };
      case "network":
        return net.policy === "ENFORCED"
          ? { status: "PASS", detail: net.detail }
          : { status: "SKIPPED", detail: net.detail }; // UNVERIFIED ⇒ SKIPPED (required ⇒ not fully hermetic)
      case "reproducibility": {
        if (!seams.reproduce) return { status: "SKIPPED", detail: "no reproduce() injected (not verified this run)" };
        const { a, b } = seams.reproduce();
        const r = compareUnderContract("hermetic-reproducibility", a, b, spec.normalizers || []);
        return r.parity ? { status: "PASS", detail: r.reason } : { status: "FAIL", detail: r.reason };
      }
      default:
        return { status: "BLOCKED", detail: `unknown gate ${name}` };
    }
  };

  const res = runGates(
    { gates: ["toolchain", "caches", "write-confinement", "network", "reproducibility"].map((name) => ({ name, required: true })) },
    { gate, log: seams.log },
  );
  return { ok: res.ok, exitCode: res.exitCode, gates: res.gates, fingerprint: toolchainFingerprint(root), network: net };
}

module.exports = { toolchainFingerprint, checkCaches, networkPolicy, verifyHermetic };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
