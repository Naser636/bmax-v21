#!/usr/bin/env node

"use strict";

/*
 * Scope Observer (TypeScript port; parity with runtime/core/scope-observer.js).
 *
 * SINGLE shared implementation of the working-tree scope primitives + evidence-integrity predicate the
 * Validation Engine delegates to. Strict TS port: the seven public exports (gitChangedPaths,
 * changedPathsInScope, trackedFilesInScope, artifactNonEmpty, scopeClean, fileCount, configEq), their
 * signatures, injectable seams, {ok, detail} shapes + detail strings, git/fs (cwd-relative) behaviour,
 * strict no-coercion equality and default-deny semantics are preserved EXACTLY. The .js is the reference.
 */

import * as fs from "fs";
import { execFileSync } from "child_process";

// Raw working-tree changes via git porcelain (status code stripped), same parse as the gate used.
function gitChangedPaths(): string[] {
  let porcelain = "";
  try {
    porcelain = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }) as string;
  } catch {
    return [];
  }
  return porcelain
    .split(/\r?\n/)
    .map((l) => l.slice(3).trim()) // strip the 2-char status + space
    .filter(Boolean);
}

// Normalize authorized paths (drop glob tails like /** or *) to a prefix set.
function normalizePrefixes(authorizedPaths: any): string[] {
  return (Array.isArray(authorizedPaths) ? authorizedPaths : [])
    .map((p: string) => p.replace(/[*].*$/, "").replace(/\/+$/, ""))
    .filter((p: string) => p.length > 0);
}

// A changed path is IN SCOPE of an authorized prefix only on a PATH BOUNDARY: an exact match (concrete
// file or dir entry) or a true descendant (pre + "/"). Plain startsWith() let sibling paths escape the
// write-set (e.g. authorized "runtime/core" wrongly admitted "runtime/coreEVIL/x", and "src/app.js"
// admitted "src/app.js.bak") — a defect in the primary scope guard used by delegate conformance + the
// human acceptance gate. Boundary-aware matching closes that escape without widening any legitimate glob.
function inScopeOf(f: string, pre: string): boolean {
  return f === pre || f.startsWith(pre + "/");
}

// Verbatim semantics of the Validation Engine's former private changedPathsInScope() closure.
function changedPathsInScope(authorizedPaths: any, changedPaths?: any): string[] {
  const changed = Array.isArray(changedPaths) ? changedPaths : gitChangedPaths();
  const prefixes = normalizePrefixes(authorizedPaths);
  return changed.filter((f: string) => prefixes.some((pre) => inScopeOf(f, pre)));
}

// Verbatim semantics of the Validation Engine's former private trackedFilesInScope() closure.
function trackedFilesInScope(authorizedPaths: any): string[] {
  const prefixes = normalizePrefixes(authorizedPaths);
  if (prefixes.length === 0) return [];
  let tracked = "";
  try {
    tracked = execFileSync("git", ["ls-files", "--", ...prefixes], { encoding: "utf8" }) as string;
  } catch {
    return [];
  }
  return tracked.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// ARTIFACT-NONEMPTY: existence + non-emptiness of the declared artifact ONLY. Never asserts correctness.
function artifactNonEmpty(p: any, statFn?: any): { ok: boolean; detail: string } {
  const stat = typeof statFn === "function" ? statFn : (x: string) => fs.statSync(x);
  if (typeof p !== "string" || !p) return { ok: false, detail: "no artifact path declared" };
  try {
    const size = stat(p).size;
    return size > 0
      ? { ok: true, detail: `artifact present and non-empty (${p}, ${size} bytes)` }
      : { ok: false, detail: `artifact is empty (${p})` };
  } catch {
    return { ok: false, detail: `artifact absent (${p})` };
  }
}

// SCOPE-CLEAN: no working-tree change lies OUTSIDE the authorized scope.
function scopeClean(authorizedPaths: any, changedPaths?: any): { ok: boolean; detail: string } {
  const changed = Array.isArray(changedPaths) ? changedPaths : gitChangedPaths();
  const inScope = new Set(changedPathsInScope(authorizedPaths, changed));
  const outOfScope = changed.filter((f: string) => !inScope.has(f));
  return outOfScope.length === 0
    ? { ok: true, detail: `no change outside authorized scope (${changed.length} changed, all in scope)` }
    : { ok: false, detail: `change(s) outside authorized scope: ${outOfScope.join(", ")}` };
}

// FILE-COUNT / FILE-EXISTENCE (source FIXED to git-tracked). trackedProvider is injectable for tests.
function fileCount(p: any, count?: any, trackedProvider?: any): { ok: boolean; detail: string } {
  if (typeof p !== "string" || !p) return { ok: false, detail: "no path declared" };
  if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 0)) {
    return { ok: false, detail: `invalid count parameter: ${JSON.stringify(count)}` };
  }
  const provider = typeof trackedProvider === "function" ? trackedProvider : (x: string) => trackedFilesInScope([x]);
  const tracked = provider(p);
  const n = Array.isArray(tracked) ? tracked.length : 0;
  if (count === undefined) {
    return n >= 1
      ? { ok: true, detail: `${n} tracked file(s) under ${p}` }
      : { ok: false, detail: `no tracked file under ${p}` };
  }
  return n === count
    ? { ok: true, detail: `exactly ${count} tracked file(s) under ${p}` }
    : { ok: false, detail: `expected exactly ${count} tracked file(s) under ${p}, found ${n}` };
}

// Tolerant JSON reader — same idiom used elsewhere (no neutral shared util to import from).
function readJsonSafe(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Dotted-path lookup over PLAIN OBJECT nodes only. Intermediate arrays / non-objects ⇒ not found.
function getByPath(obj: any, dottedKey: any): { found: boolean; value: any } {
  const parts = String(dottedKey).split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur) ||
        !Object.prototype.hasOwnProperty.call(cur, part)) {
      return { found: false, value: undefined };
    }
    cur = cur[part];
  }
  return { found: true, value: cur };
}

// Strictly-typed equality, NO coercion (true !== "true", 1 !== "1"). Arrays: order-sensitive. Objects:
// same key set AND strict-equal values.
function strictEqual(a: any, b: any): boolean {
  if (typeof a !== typeof b) return false;
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x: any, i: number) => strictEqual(x, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && strictEqual(a[k], b[k]));
  }
  return false;
}

// CONFIG-EQ — A-TYPE, FILE-BACKED OBSERVATION ONLY. Reads ONLY the given file (NEVER process.env),
// compares strictly (no coercion), default-deny. A PASS means "declared == observed at file:key" and
// NOTHING MORE (never evidence of behaviour).
function configEq(file: any, key: any, equals?: any): { ok: boolean; detail: string } {
  if (typeof file !== "string" || !file) return { ok: false, detail: "no config file declared" };
  if (typeof key !== "string" || !key) return { ok: false, detail: "no config key declared" };
  if (equals === undefined) return { ok: false, detail: "no expected value declared" };
  const cfg = readJsonSafe(file);
  if (cfg === null || typeof cfg !== "object") return { ok: false, detail: `config file absent or invalid (${file})` };
  const { found, value } = getByPath(cfg, key);
  if (!found) return { ok: false, detail: `key not found: ${key} in ${file}` };
  return strictEqual(value, equals)
    ? { ok: true, detail: `observed value at ${file}:${key} equals the declared value (${JSON.stringify(value)})` }
    : { ok: false, detail: `observed ${JSON.stringify(value)} != declared ${JSON.stringify(equals)} at ${file}:${key}` };
}

module.exports = {
  gitChangedPaths,
  changedPathsInScope,
  trackedFilesInScope,
  artifactNonEmpty,
  scopeClean,
  fileCount,
  configEq,
};
