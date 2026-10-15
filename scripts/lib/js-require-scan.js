"use strict";
//
// Pure JS require-scanning helpers for the dist-closure tracer (scripts/build-dist-closure.js).
//
// ROOT-CAUSE FIX (B141): the former stripComments used a naive block-comment regex that treated a
// block-comment opener appearing INSIDE A STRING LITERAL as a real comment start. A scope string such as
// the one that denotes "the whole runtime subtree" (slash + double-star) thus opened a phantom block
// comment that the non-greedy match closed at the next real block-comment terminator, SWALLOWING any
// require() in between — so a genuinely-required module was omitted from runtime/dist and the compiled
// runtime failed at run time with "Cannot find module".
//
// stripComments below is a context-aware single-pass scanner: it removes line and block comments found in
// CODE context only, and preserves string and template literals VERBATIM (so a block-comment-opener inside
// a string is never a comment). It handles escaped quotes, single/double/backtick strings, end-of-line and
// multi-line block comments. (A block-comment opener in CODE is unambiguous — it is never a valid
// regex-literal start — so no division/regex ambiguity arises.) Strings are preserved exactly as the OLD
// stripper left them, so require-finding behaviour over code and strings is otherwise unchanged.
//

const fs = require("fs");

// states: CODE, LINE comment, BLOCK comment, DQ (double-quote), SQ (single-quote), TMPL (backtick)
function stripComments(src) {
  let out = "";
  const n = src.length;
  let state = 0; // 0=CODE 1=LINE 2=BLOCK 3=DQ 4=SQ 5=TMPL
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = i + 1 < n ? src[i + 1] : "";
    switch (state) {
      case 0: // CODE
        if (c === "/" && d === "/") { state = 1; i += 2; continue; }
        if (c === "/" && d === "*") { state = 2; i += 2; continue; }
        if (c === '"') { out += c; state = 3; i += 1; continue; }
        if (c === "'") { out += c; state = 4; i += 1; continue; }
        if (c === "`") { out += c; state = 5; i += 1; continue; }
        out += c; i += 1; continue;
      case 1: // LINE COMMENT — drop to end of line, keep the newline
        if (c === "\n") { out += c; state = 0; }
        i += 1; continue;
      case 2: // BLOCK COMMENT — drop to the closing */
        if (c === "*" && d === "/") { state = 0; i += 2; continue; }
        i += 1; continue;
      case 3: // DOUBLE-QUOTED STRING — preserve verbatim
        if (c === "\\") { out += c + d; i += 2; continue; }
        out += c; if (c === '"') state = 0; i += 1; continue;
      case 4: // SINGLE-QUOTED STRING
        if (c === "\\") { out += c + d; i += 2; continue; }
        out += c; if (c === "'") state = 0; i += 1; continue;
      case 5: // TEMPLATE LITERAL — preserve verbatim (requires inside ${} stay visible)
        if (c === "\\") { out += c + d; i += 2; continue; }
        out += c; if (c === "`") state = 0; i += 1; continue;
    }
  }
  return out;
}

// Extract the literal relative/package require targets from SOURCE text + whether any dynamic require
// (non-string-literal argument) is present. Pure (string in → result out).
function parseRequiresFromSource(src) {
  const stripped = stripComments(src);
  const literal = [];
  const re = /require\(\s*("([^"]*)"|'([^']*)')\s*\)/g;
  let m;
  while ((m = re.exec(stripped))) literal.push(m[2] !== undefined ? m[2] : m[3]);
  const dyn = /require\(\s*[^"')\s]/.test(stripped);
  return { literal, dyn };
}

// File-reading convenience (used by the tracer).
function parseRequires(file) {
  return parseRequiresFromSource(fs.readFileSync(file, "utf8"));
}

module.exports = { stripComments, parseRequiresFromSource, parseRequires };
