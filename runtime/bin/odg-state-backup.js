#!/usr/bin/env node
"use strict";
/*
 * odg state-backup (historical .js twin = ODG_RUNTIME=js rollback; TS port is the default via dist).
 *
 * Durable, integrity-verified export + verify + ISOLATED restore for ODG's gitignored OPERATIONAL STATE
 * (incident ledger + autonomy outcomes + local mission contracts). REUSES runtime/core/client-store-backup.js
 * verify/restore (NO duplicated integrity/restore logic; no new primitive). Manifest shape + manifestHash
 * algorithm are IDENTICAL to that engine. READ-ONLY on source; fail-closed; secrets never embedded. See the .ts.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const B = require("../core/client-store-backup.js");

const DEFAULT_INCLUDE = ["runtime/generated/autonomy", "runtime/missions"];
const DEFAULT_OUT = path.join("runtime", "generated", "operational-backup");
const FORBIDDEN_TARGET_SUFFIXES = ["runtime/generated/autonomy", "runtime/missions", "/var/lib/odg/clients"];
const SECRET_RE = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{36}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/;

function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function manifestHashOf(files) { return sha256(JSON.stringify(files.map((f) => [f.path, f.sha256]))); }

function isDangerousRel(rel) {
  return typeof rel !== "string" || rel.length === 0 || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..");
}

function listUnder(root, relDir) {
  const out = [];
  const walk = (abs, rel) => {
    let ents;
    try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), childRel);
      else if (e.isFile()) out.push(childRel);
    }
  };
  const start = path.join(root, relDir);
  if (fs.existsSync(start) && fs.statSync(start).isFile()) out.push(relDir);
  else walk(start, relDir);
  return out.sort();
}

function exportState(opts = {}) {
  const root = opts.root || process.cwd();
  const include = Array.isArray(opts.include) && opts.include.length ? opts.include : DEFAULT_INCLUDE;
  const rels = [];
  for (const inc of include) for (const r of listUnder(root, inc)) if (!rels.includes(r)) rels.push(r);
  rels.sort();
  const files = [];
  for (const rel of rels) {
    if (isDangerousRel(rel)) return { ok: false, code: "DANGEROUS_PATH", at: rel };
    let content;
    try { content = fs.readFileSync(path.join(root, rel), "utf8"); }
    catch (e) { return { ok: false, code: "READ_FAILED", at: rel, detail: String((e && e.code) || e) }; }
    if (SECRET_RE.test(content)) return { ok: false, code: "SECRET_DETECTED", at: rel };
    files.push({ path: rel, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8"), content });
  }
  const manifest = {
    version: B.MANIFEST_VERSION, createdAtMs: Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now(),
    base: root, files, manifestHash: manifestHashOf(files),
  };
  return { ok: true, manifest, count: files.length };
}

function summaryOf(manifest, include, exclusions) {
  return {
    schema: "operational-state-backup/summary/1", version: manifest.version, createdAtMs: manifest.createdAtMs,
    components: include, fileCount: manifest.files.length,
    totalBytes: manifest.files.reduce((n, f) => n + f.bytes, 0),
    manifestHash: manifest.manifestHash,
    perComponent: include.map((c) => ({ component: c, files: manifest.files.filter((f) => f.path === c || f.path.startsWith(c + "/")).length })),
    exclusions: exclusions || ["runtime/generated/** except autonomy (reconstructible per-run artifacts/dist/logs/scans)", "client store /var/lib/odg/clients (separate sensitive backup)", "node_modules + .git (versioned/reconstructible)", "secrets/.env/keys (policy; scanned)"],
  };
}

function emit(o) { process.stdout.write(JSON.stringify(o) + "\n"); }

function writeAtomic(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// Immutable timestamped snapshot (parity twin): <out>/snapshots/<createdAtMs>-<hash8>/ ; never overwrites a
// differing prior snapshot (SNAPSHOT_COLLISION); idempotent on identical content; atomic writes; latest.json pointer.
function doExport(flags) {
  const out = flags.out && flags.out !== true ? flags.out : DEFAULT_OUT;
  const res = exportState({ root: process.cwd(), include: DEFAULT_INCLUDE, nowMs: Number(flags.now) || undefined });
  if (!res.ok) { emit(res); return 2; }
  const v = B.verify(res.manifest);
  if (!v.ok) { emit({ ok: false, code: "SELF_VERIFY_FAILED", detail: v }); return 2; }
  const hash8 = String(res.manifest.manifestHash).slice(0, 8);
  const snapId = `${res.manifest.createdAtMs}-${hash8}`;
  const snapDir = path.join(out, "snapshots", snapId);
  const manPath = path.join(snapDir, "manifest.json");
  if (fs.existsSync(manPath)) {
    let prior = null; try { prior = JSON.parse(fs.readFileSync(manPath, "utf8")); } catch { /* corrupt prior */ }
    if (!prior || prior.manifestHash !== res.manifest.manifestHash) { emit({ ok: false, code: "SNAPSHOT_COLLISION", snapshot: snapId, message: "a different snapshot already exists at this id — refusing to overwrite (immutable history)" }); return 2; }
  }
  fs.mkdirSync(snapDir, { recursive: true });
  writeAtomic(manPath, JSON.stringify(res.manifest));
  const summary = summaryOf(res.manifest, DEFAULT_INCLUDE, null);
  writeAtomic(path.join(snapDir, "summary.json"), JSON.stringify(summary, null, 2));
  const relSnap = path.join("snapshots", snapId);
  writeAtomic(path.join(out, "latest.json"), JSON.stringify({ snapshot: relSnap, manifest: path.join(relSnap, "manifest.json"), manifestHash: res.manifest.manifestHash, createdAtMs: res.manifest.createdAtMs }, null, 2));
  emit({ ok: true, out, snapshot: relSnap, manifest: manPath, count: res.count, manifestHash: res.manifest.manifestHash, summary });
  return 0;
}

function forbiddenTarget(target) {
  const abs = path.resolve(target);
  return FORBIDDEN_TARGET_SUFFIXES.some((s) => abs === path.resolve(s) || abs.endsWith("/" + s) || abs === path.resolve(process.cwd(), s));
}

function doVerify(flags) {
  if (!flags.manifest || flags.manifest === true) { emit({ ok: false, code: "MANIFEST_REQUIRED" }); return 2; }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(flags.manifest, "utf8")); } catch (e) { emit({ ok: false, code: "MANIFEST_UNREADABLE", detail: String((e && e.code) || e) }); return 2; }
  const v = B.verify(manifest);
  emit(v); return v.ok ? 0 : 2;
}

function doRestore(flags) {
  if (!flags.manifest || flags.manifest === true) { emit({ ok: false, code: "MANIFEST_REQUIRED" }); return 2; }
  const target = flags.target;
  if (!target || target === true) { emit({ ok: false, code: "TARGET_REQUIRED", message: "restore needs an explicit --target <dir>" }); return 2; }
  if (forbiddenTarget(target)) { emit({ ok: false, code: "FORBIDDEN_TARGET", message: "refusing to restore over the live source/client store — human-authorized, isolated target only" }); return 2; }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(flags.manifest, "utf8")); } catch (e) { emit({ ok: false, code: "MANIFEST_UNREADABLE", detail: String((e && e.code) || e) }); return 2; }
  if (Array.isArray(manifest.files)) for (const f of manifest.files) if (isDangerousRel(f && f.path)) { emit({ ok: false, code: "DANGEROUS_PATH", at: f && f.path }); return 2; }
  const res = B.restore({ manifest, target, force: flags.force === true });
  emit(res); return res.ok ? 0 : 2;
}

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

function main(argv) {
  const flags = parseFlags(argv);
  const sub = flags._[0];
  if (sub === "export") return doExport(flags);
  if (sub === "verify") return doVerify(flags);
  if (sub === "restore") return doRestore(flags);
  process.stderr.write("usage:\n  odg-state-backup export [--out <dir>] [--now <ms>]\n  odg-state-backup verify --manifest <file>\n  odg-state-backup restore --manifest <file> --target <dir> [--force]\n");
  return 2;
}

module.exports = { DEFAULT_INCLUDE, DEFAULT_OUT, SECRET_RE, sha256, manifestHashOf, isDangerousRel, listUnder, exportState, summaryOf, writeAtomic, forbiddenTarget, parseFlags, doExport, doVerify, doRestore, main };

if (require.main === module) { process.exit(main(process.argv.slice(2))); }
