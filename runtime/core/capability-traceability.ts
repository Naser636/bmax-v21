#!/usr/bin/env node
"use strict";

/*
 * capability-traceability (V135 seed A) — PURE, deterministic validator of a NEED→…→MAINTENANCE requirement-traceability
 * chain for a capability. It is a cross-cutting VALIDATION LAYER (in the style of capability-attribution), NOT a parallel
 * registry: it validates a caller-supplied chain against the REAL repo (file references must resolve) and FAILS CLOSED on
 * any missing link or broken reference. It reuses the existing capability model (capability-attribution) and evidence
 * mechanisms by referencing their real files; it does not duplicate them. The generic ISO-control view lives in
 * certification-traceability — this is the general requirement-lifecycle chain, a different concern. No network, no clock.
 *
 * validateTrace(trace, opts?) → frozen { ok, capability, missingLinks[], brokenRefs[], resolvedRefs, links }.
 *   trace.links MUST contain all REQUIRED_LINKS (non-empty). FILE_LINKS values are repo-relative path(s) that MUST exist
 *   (checked via opts.exists, default fs.existsSync under opts.root). A missing link OR an unresolvable file ⇒ ok=false.
 */

const fs = require("fs");
const path = require("path");

const REQUIRED_LINKS = Object.freeze(["need", "requirement", "acceptance", "component", "contract", "implementation", "test", "evidence", "incidents", "observation", "maintenance"]);
const FILE_LINKS = Object.freeze(["component", "contract", "implementation", "test", "incidents"]); // must resolve on disk

function isNonEmpty(v: any): boolean { return (typeof v === "string" && v.trim().length > 0) || (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim().length > 0)); }
function asPaths(v: any): string[] { return Array.isArray(v) ? v : (typeof v === "string" ? [v] : []); }

function validateTrace(trace: any, opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const root = typeof o.root === "string" ? o.root : process.cwd();
  const exists = typeof o.exists === "function" ? o.exists : (p: string) => { try { return fs.existsSync(path.isAbsolute(p) ? p : path.join(root, p)); } catch { return false; } };
  const t = trace && typeof trace === "object" ? trace : {};
  const links = t.links && typeof t.links === "object" ? t.links : {};
  const missingLinks = REQUIRED_LINKS.filter((l) => !isNonEmpty(links[l]));
  const brokenRefs: Array<{ link: string; path: string }> = [];
  let resolvedRefs = 0;
  for (const l of FILE_LINKS) {
    for (const p of asPaths(links[l])) {
      if (exists(p)) resolvedRefs++; else brokenRefs.push({ link: l, path: p });
    }
  }
  const ok = missingLinks.length === 0 && brokenRefs.length === 0;
  return Object.freeze({
    ok, capability: typeof t.capability === "string" ? t.capability : "(unnamed)",
    missingLinks: Object.freeze(missingLinks), brokenRefs: Object.freeze(brokenRefs.map((b) => Object.freeze(b))),
    resolvedRefs, requiredLinks: REQUIRED_LINKS, fileLinks: FILE_LINKS, links: Object.freeze({ ...links }),
  });
}

module.exports = { validateTrace, REQUIRED_LINKS, FILE_LINKS };
export {};
