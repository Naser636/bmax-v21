#!/usr/bin/env node
"use strict";
/*
 * logSlug — turn an arbitrary mission identifier (which may be free-text with spaces, '/', parentheses,
 * punctuation, accents, newlines, or be very long) into a SINGLE filesystem- and shell-safe path
 * component, so it can never create a nested path, escape its directory, or corrupt a shell command.
 *
 * Root cause it guards (reproduced 2026-10-18): odg-run.js built the run-log path as
 *   path.join("runtime/generated/logs", mission + ".run.log")
 * from the RAW mission string. A free-text mission containing '/' (e.g. "...ODG/BMAX...") made the write
 * target a non-existent nested directory ⇒ ENOENT, crashing the launcher.
 *
 * Rules (deterministic, no clock/network): keep only [A-Za-z0-9_.-]; every other character (incl. '/',
 * whitespace, '(', ')', ':', quotes, newlines, unicode) becomes '_'; collapse runs of '_'; strip leading
 * dots/dashes/underscores (no hidden files, no leading '-' option-injection); cap length; never empty.
 */

const MAX_LEN = 120;

function logSlug(name) {
  let s = String(name == null ? "" : name);
  // Any character that is not a safe, single-component token char becomes '_'. Crucially this maps '/'
  // and '\' to '_', so the result is always ONE path component.
  s = s.replace(/[^A-Za-z0-9_.-]/g, "_");
  // Collapse repeated separators for readability.
  s = s.replace(/_{2,}/g, "_");
  // Never a hidden/relative/option-like leading char.
  s = s.replace(/^[._-]+/, "");
  // Bound the length (leave room for suffixes the caller appends).
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN);
  // Never return empty (an all-unsafe or empty input still needs a usable filename).
  if (s.length === 0) s = "mission";
  return s;
}

module.exports = { logSlug, MAX_LEN };

if (require.main === module) {
  for (const a of process.argv.slice(2)) console.log(logSlug(a));
}
