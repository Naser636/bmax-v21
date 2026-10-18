#!/usr/bin/env node
"use strict";
/*
 * logSlug tests — prove no user mission text can corrupt a path (CTO §2: spaces, slashes, parentheses,
 * punctuation, accents, newlines, very long). The slug is always a SINGLE path-safe component.
 */
const assert = require("assert");
const path = require("path");
const { logSlug, MAX_LEN } = require("./log-slug.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

// The core safety invariant: a slug is ONE path component — joining it under a dir never escapes the dir.
function staysInside(dir, name) {
  const joined = path.join(dir, logSlug(name) + ".run.log");
  const rel = path.relative(dir, joined);
  return !rel.startsWith("..") && !path.isAbsolute(rel) && !rel.includes(path.sep);
}

// 1 — the reproduced failure: a '/' must NOT create a nested path.
{
  const s = logSlug("Repro slash ODG/BMAX ENOENT");
  ok("slash '/' is neutralised (no path separator in slug)", !s.includes("/") && !s.includes(path.sep));
  ok("slash case stays inside the logs dir (the exact reproduced ENOENT is prevented)", staysInside("runtime/generated/logs", "Repro slash ODG/BMAX ENOENT"));
}
// 2 — backslash too.
{
  ok("backslash is neutralised", !logSlug("a\\b\\c").includes("\\"));
}
// 3 — spaces.
{
  ok("spaces become safe separators (no whitespace in slug)", !/\s/.test(logSlug("MANDAT CTO court reprise")));
}
// 4 — parentheses + punctuation (the residue shell-syntax hazard) neutralised.
{
  const s = logSlug("do (this) & that; rm -rf / | echo `x` $(y)");
  ok("parentheses/shell metacharacters all neutralised", /^[A-Za-z0-9_.-]+$/.test(s));
}
// 5 — accents / unicode (é, —) neutralised.
{
  const s = logSlug("réparation gouvernée — étape");
  ok("accents/unicode become safe chars only", /^[A-Za-z0-9_.-]+$/.test(s));
}
// 6 — newlines / tabs neutralised.
{
  ok("newlines/tabs neutralised", /^[A-Za-z0-9_.-]+$/.test(logSlug("line1\nline2\tx")));
}
// 7 — very long input is bounded.
{
  const s = logSlug("X".repeat(5000));
  ok("very long input is capped at MAX_LEN", s.length <= MAX_LEN && s.length > 0);
}
// 8 — all-unsafe or empty input still yields a usable, non-empty filename.
{
  ok("all-unsafe input ⇒ non-empty fallback", logSlug("///   ///").length > 0);
  ok("empty input ⇒ non-empty fallback", logSlug("").length > 0 && logSlug(null).length > 0 && logSlug(undefined).length > 0);
}
// 9 — no leading dot/dash/underscore (no hidden file, no '-' option injection).
{
  for (const bad of ["--help", ".hidden", "___x", "-rf"]) {
    ok(`leading separators stripped for '${bad}'`, !/^[._-]/.test(logSlug(bad)));
  }
}
// 10 — a normal mission id is preserved unchanged (no collateral mangling).
{
  ok("valid id preserved verbatim", logSlug("FIX_SELECTION_SKIP_RESERVED") === "FIX_SELECTION_SKIP_RESERVED");
  ok("NL_ id preserved", logSlug("NL_ANALYZE_832A1B05") === "NL_ANALYZE_832A1B05");
  ok("dotted/dashed id preserved", logSlug("M0001") === "M0001" && logSlug("a.b-c_d") === "a.b-c_d");
}
// 11 — deterministic (same input ⇒ same slug).
{
  ok("deterministic", logSlug("a/b c(d)") === logSlug("a/b c(d)"));
}

console.log(`\nlog-slug — ${passed} assertions passed.`);
