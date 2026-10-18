/*
 * logSlug (TS port — compiles to runtime/dist/core/log-slug.js, the sibling the compiled
 * dist/bin/odg-run.js requires). Byte-for-byte behavioural parity with runtime/core/log-slug.js (the JS
 * rollback port). Turns an arbitrary mission identifier (free-text with spaces, '/', parentheses,
 * punctuation, accents, newlines, or very long) into a SINGLE filesystem- and shell-safe path component,
 * so it can never create a nested path, escape its directory, or corrupt a shell command.
 *
 * Root cause it guards (reproduced 2026-10-18): odg-run built the run-log path as
 *   path.join("runtime/generated/logs", mission + ".run.log")
 * from the RAW mission string; a free-text mission containing '/' made the target a non-existent nested
 * directory ⇒ ENOENT, crashing the launcher. Pure (no clock/network); self-contained (no imports).
 */

const MAX_LEN = 120;

function logSlug(name: unknown): string {
  let s = String(name == null ? "" : name);
  // Any character that is not a safe single-component token char becomes '_' (maps '/' and '\' too).
  s = s.replace(/[^A-Za-z0-9_.-]/g, "_");
  s = s.replace(/_{2,}/g, "_");
  s = s.replace(/^[._-]+/, "");
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN);
  if (s.length === 0) s = "mission";
  return s;
}

module.exports = { logSlug, MAX_LEN };

// Module-scope marker (adds NO runtime export): forces TypeScript MODULE scope so `logSlug`/`MAX_LEN`
// are module-local and do NOT collide with the JS rollback port (runtime/core/log-slug.js) under the
// repo-wide tsc program (TS2451). Same discipline as runtime-model.ts / the other dual-port core files.
export {};
