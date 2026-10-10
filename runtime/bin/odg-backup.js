#!/usr/bin/env node
"use strict";

/*
 * odg backup | restore — governed CLI surface over runtime/core/client-store-backup.js (RWL-B4).
 *
 * Reuses the module's integrity-verified backup/verify/restore — NO backup/restore logic is duplicated
 * here; this file only parses arguments and enforces fail-closed safety at the command boundary:
 *   - backup  is READ-ONLY on the source store (guaranteed by the module).
 *   - restore requires an EXPLICIT --target; it NEVER defaults to a store, and REFUSES the real
 *     production/preprod store (/var/lib/odg/clients or $ODG_CLIENT_STORE) as a target — a
 *     restore-to-production policy is NOT defined, so it is reported as a BLOCK, never invented.
 *   - restore REFUSES a non-empty target unless --force is given EXPLICITLY (never implicit).
 *   - restore fails closed on an unreadable manifest and on any integrity mismatch (module-enforced).
 * No network, no provider, no deployment.
 */

const fs = require("fs");
const path = require("path");
const B = require("../core/client-store-backup.js");

// Known real store(s) that must NEVER be an implicit or casual restore target.
const PROD_STORES = ["/var/lib/odg/clients"];

function parseFlags(argv) {
  const f = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") f.force = true;
    else if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) f[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) f[a.slice(2)] = true;
    else f._.push(a);
  }
  return f;
}

function emit(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }
function fail(code, message) { emit({ ok: false, code, message }); return 2; }

// A target is forbidden if it IS, or is INSIDE, any known production store or the configured $ODG_CLIENT_STORE.
function isProdTarget(target) {
  const resolved = path.resolve(target);
  const candidates = PROD_STORES.slice();
  if (process.env.ODG_CLIENT_STORE) candidates.push(process.env.ODG_CLIENT_STORE);
  return candidates.some((c) => {
    const rc = path.resolve(c);
    return resolved === rc || resolved.startsWith(rc + path.sep);
  });
}

function doBackup(flags) {
  const res = B.backup({ cwd: flags.cwd });
  if (!res.ok) { emit(res); return 1; } // STORE_NOT_READY / READ_FAILED → fail-closed
  if (flags.out) {
    const abs = path.resolve(flags.out);
    try { fs.writeFileSync(abs, JSON.stringify(res.manifest, null, 2)); }
    catch (e) { return fail("WRITE_FAILED", String((e && e.code) || e)); }
    emit({ ok: true, count: res.count, manifestHash: res.manifest.manifestHash, out: abs });
  } else {
    emit({ ok: true, count: res.count, manifestHash: res.manifest.manifestHash });
  }
  return 0;
}

function doRestore(flags) {
  if (!flags.manifest || flags.manifest === true) return fail("MANIFEST_REQUIRED", "pass --manifest <file>");
  if (!flags.target || flags.target === true) return fail("TARGET_REQUIRED", "pass --target <dir>; a target is never implicit (safety)");
  const tabs = path.resolve(flags.target);
  if (isProdTarget(tabs)) {
    return fail("TARGET_FORBIDDEN_PRODUCTION",
      "refusing to restore into the real production/preprod store; a restore-to-production policy is NOT defined — human authorization required (stopped, not overridden)");
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.resolve(flags.manifest), "utf8")); }
  catch (e) { return fail("MANIFEST_UNREADABLE", String((e && e.code) || e)); }
  const res = B.restore({ manifest, target: tabs, force: flags.force === true });
  emit(res); // ok | INTEGRITY_MISMATCH | TARGET_NOT_EMPTY | INVALID_MANIFEST | WRITE_FAILED
  return res.ok ? 0 : 1;
}

function main(argv) {
  const sub = argv[0];
  const flags = parseFlags(argv.slice(1));
  if (sub === "backup") return doBackup(flags);
  if (sub === "restore") return doRestore(flags);
  process.stdout.write(
    "usage:\n  odg backup  [--out <file>] [--cwd <dir>]\n" +
    "  odg restore --manifest <file> --target <dir> [--force]\n");
  return 2;
}

module.exports = { parseFlags, isProdTarget, doBackup, doRestore, main, PROD_STORES };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
