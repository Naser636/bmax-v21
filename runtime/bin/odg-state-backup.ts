#!/usr/bin/env node
"use strict";
/*
 * odg state-backup (TS port → runtime/dist/bin/odg-state-backup.js, DEFAULT; this .js twin = ODG_RUNTIME=js rollback).
 *
 * Durable, integrity-verified export + verify + ISOLATED restore for ODG's gitignored OPERATIONAL STATE
 * (incident ledger + autonomy outcomes + local mission contracts). REUSES runtime/core/client-store-backup.js
 * verify/restore (NO duplicated integrity/restore logic; no new primitive). The manifest shape + manifestHash
 * algorithm are IDENTICAL to that engine, so its verify accepts this tool's manifest.
 *
 * Fail-closed safety at the command boundary:
 *   - export (backup) is READ-ONLY on the source (pure read + hash); it NEVER mutates the ledger/contracts.
 *   - a credential-pattern match in any file ⇒ export REFUSES (secrets are never embedded).
 *   - restore requires an EXPLICIT --target; REFUSES the repo root / known source dirs / a non-empty target
 *     (unless --force); REFUSES dangerous manifest paths (absolute or containing ".."); engine fail-closes on
 *     any integrity mismatch / invalid manifest / version mismatch.
 * No network, no provider, no deployment. Full content archive stays OUT of git (gitignored --out dir).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const B = require("../core/client-store-backup.js");

// Operational-state scope (relative to the repo root). INCLUDE only authoritative, non-reconstructible state.
const DEFAULT_INCLUDE = ["runtime/generated/autonomy", "runtime/missions"];
const DEFAULT_OUT = path.join("runtime", "generated", "operational-backup"); // gitignored (under runtime/generated)
// Targets that must NEVER be a restore destination (would clobber live source).
const FORBIDDEN_TARGET_SUFFIXES = ["runtime/generated/autonomy", "runtime/missions", "/var/lib/odg/clients"];
// Credential-pattern guard — never embed secrets in a backup.
const SECRET_RE = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{36}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/;

function sha256(s: any): string { return crypto.createHash("sha256").update(s).digest("hex"); }
// IDENTICAL to client-store-backup.manifestHashOf so engine.verify recomputes the same hash.
function manifestHashOf(files: any[]): string { return sha256(JSON.stringify(files.map((f) => [f.path, f.sha256]))); }

function isDangerousRel(rel: any): boolean {
  return typeof rel !== "string" || rel.length === 0 || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..");
}

// Deterministically list files under a dir (repo-relative paths), sorted.
function listUnder(root: any, relDir: any): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string) => {
    let ents: any[];
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

// Build a content-embedded manifest over the scope. READ-ONLY. Fail-closed on a secret match.
function exportState(opts: any = {}): any {
  const root = opts.root || process.cwd();
  const include = Array.isArray(opts.include) && opts.include.length ? opts.include : DEFAULT_INCLUDE;
  const rels: string[] = [];
  for (const inc of include) for (const r of listUnder(root, inc)) if (!rels.includes(r)) rels.push(r);
  rels.sort();
  const files: any[] = [];
  for (const rel of rels) {
    if (isDangerousRel(rel)) return { ok: false, code: "DANGEROUS_PATH", at: rel };
    let content: string;
    try { content = fs.readFileSync(path.join(root, rel), "utf8"); }
    catch (e: any) { return { ok: false, code: "READ_FAILED", at: rel, detail: String((e && e.code) || e) }; }
    if (SECRET_RE.test(content)) return { ok: false, code: "SECRET_DETECTED", at: rel }; // never embed secrets
    files.push({ path: rel, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8"), content });
  }
  const manifest = {
    version: B.MANIFEST_VERSION, createdAtMs: Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now(),
    base: root, files, manifestHash: manifestHashOf(files),
  };
  return { ok: true, manifest, count: files.length };
}

// Non-sensitive summary (NO content) — safe to commit as an example.
function summaryOf(manifest: any, include: any, exclusions: any): any {
  return {
    schema: "operational-state-backup/summary/1", version: manifest.version, createdAtMs: manifest.createdAtMs,
    components: include, fileCount: manifest.files.length,
    totalBytes: manifest.files.reduce((n: number, f: any) => n + f.bytes, 0),
    manifestHash: manifest.manifestHash,
    perComponent: include.map((c: any) => ({ component: c, files: manifest.files.filter((f: any) => f.path === c || f.path.startsWith(c + "/")).length })),
    exclusions: exclusions || ["runtime/generated/** except autonomy (reconstructible per-run artifacts/dist/logs/scans)", "client store /var/lib/odg/clients (separate sensitive backup)", "node_modules + .git (versioned/reconstructible)", "secrets/.env/keys (policy; scanned)"],
  };
}

function emit(o: any): void { process.stdout.write(JSON.stringify(o) + "\n"); }

// Atomic write: tmp in the same dir then rename — never leaves a partially-written file claimed as good.
function writeAtomic(file: any, data: any): void {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// Immutable, timestamped snapshot: <out>/snapshots/<createdAtMs>-<hash8>/ . A new export NEVER overwrites a
// prior snapshot whose content differs (SNAPSHOT_COLLISION); identical content ⇒ idempotent. `latest.json`
// (atomic) points at the newest. Preserves history; a crash mid-write cannot destroy a prior good snapshot.
function doExport(flags: any): number {
  const out = flags.out && flags.out !== true ? flags.out : DEFAULT_OUT;
  const res = exportState({ root: process.cwd(), include: DEFAULT_INCLUDE, nowMs: Number(flags.now) || undefined });
  if (!res.ok) { emit(res); return 2; }
  const v = B.verify(res.manifest);
  if (!v.ok) { emit({ ok: false, code: "SELF_VERIFY_FAILED", detail: v }); return 2; }
  const hash8 = String(res.manifest.manifestHash).slice(0, 8);
  const snapId = `${res.manifest.createdAtMs}-${hash8}`;
  const snapDir = path.join(out, "snapshots", snapId);
  const manPath = path.join(snapDir, "manifest.json");
  // IMMUTABILITY GUARD: an existing snapshot with DIFFERING content ⇒ refuse (never clobber history).
  if (fs.existsSync(manPath)) {
    let prior: any = null; try { prior = JSON.parse(fs.readFileSync(manPath, "utf8")); } catch { /* corrupt prior */ }
    if (!prior || prior.manifestHash !== res.manifest.manifestHash) { emit({ ok: false, code: "SNAPSHOT_COLLISION", snapshot: snapId, message: "a different snapshot already exists at this id — refusing to overwrite (immutable history)" }); return 2; }
    // identical content ⇒ idempotent (fall through to refresh latest pointer)
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

function forbiddenTarget(target: any): boolean {
  const abs = path.resolve(target);
  return FORBIDDEN_TARGET_SUFFIXES.some((s) => abs === path.resolve(s) || abs.endsWith("/" + s) || abs === path.resolve(process.cwd(), s));
}

function doVerify(flags: any): number {
  if (!flags.manifest || flags.manifest === true) { emit({ ok: false, code: "MANIFEST_REQUIRED" }); return 2; }
  let manifest: any;
  try { manifest = JSON.parse(fs.readFileSync(flags.manifest, "utf8")); } catch (e: any) { emit({ ok: false, code: "MANIFEST_UNREADABLE", detail: String((e && e.code) || e) }); return 2; }
  const v = B.verify(manifest);
  emit(v); return v.ok ? 0 : 2;
}

function doRestore(flags: any): number {
  if (!flags.manifest || flags.manifest === true) { emit({ ok: false, code: "MANIFEST_REQUIRED" }); return 2; }
  const target = flags.target;
  if (!target || target === true) { emit({ ok: false, code: "TARGET_REQUIRED", message: "restore needs an explicit --target <dir>" }); return 2; }
  if (forbiddenTarget(target)) { emit({ ok: false, code: "FORBIDDEN_TARGET", message: "refusing to restore over the live source/client store — human-authorized, isolated target only" }); return 2; }
  let manifest: any;
  try { manifest = JSON.parse(fs.readFileSync(flags.manifest, "utf8")); } catch (e: any) { emit({ ok: false, code: "MANIFEST_UNREADABLE", detail: String((e && e.code) || e) }); return 2; }
  if (Array.isArray(manifest.files)) for (const f of manifest.files) if (isDangerousRel(f && f.path)) { emit({ ok: false, code: "DANGEROUS_PATH", at: f && f.path }); return 2; }
  const res = B.restore({ manifest, target, force: flags.force === true });
  emit(res); return res.ok ? 0 : 2;
}

function parseFlags(argv: any): any {
  const f: any = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") f.force = true;
    else if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) f[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) f[a.slice(2)] = true;
    else f._.push(a);
  }
  return f;
}

function main(argv: any): number {
  const flags = parseFlags(argv);
  const sub = flags._[0];
  if (sub === "export") return doExport(flags);
  if (sub === "verify") return doVerify(flags);
  if (sub === "restore") return doRestore(flags);
  process.stderr.write("usage:\n  odg-state-backup export [--out <dir>] [--now <ms>]\n  odg-state-backup verify --manifest <file>\n  odg-state-backup restore --manifest <file> --target <dir> [--force]\n");
  return 2;
}

export {};
module.exports = { DEFAULT_INCLUDE, DEFAULT_OUT, SECRET_RE, sha256, manifestHashOf, isDangerousRel, listUnder, exportState, summaryOf, writeAtomic, forbiddenTarget, parseFlags, doExport, doVerify, doRestore, main };

if (require.main === module) { process.exit(main(process.argv.slice(2))); }
