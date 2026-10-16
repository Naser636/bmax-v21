#!/usr/bin/env node
"use strict";

/*
 * CLIENT STORE BACKUP (RWL-B4) — READ-ONLY, integrity-verified backup/restore for the governed client store
 * (`runtime/generated/clients/**`: requests, invoices, quotes, payments, seen-messages).
 * TypeScript port; parity with runtime/core/client-store-backup.js.
 *
 * Boundaries: `backup` NEVER mutates the source (pure read + hash). `restore` writes only into an explicit
 * TARGET and refuses a non-empty target unless `force`; every restored file is re-hashed and a mismatch fails
 * closed (INTEGRITY_MISMATCH) — a corrupt/tampered backup never silently restores wrong bytes. NO retention or
 * deletion is implemented (no existing contract authorizes it — that is a human policy, RWL-D2). No network.
 * The store holds NO secrets by construction (client-intake whitelists non-secret fields; email-gateway never
 * persists credentials), so the backup carries none. Reuses client-intake.storeState for the base path.
 *
 * Strict TS port: the public exports (CODE, MANIFEST_VERSION, backup, verify, restore), signatures, return
 * shapes, the frozen CODE object, deterministic file ordering + manifest-hash algorithm, the fail-closed
 * integrity checks and the read-only/explicit-target boundaries are preserved EXACTLY. The historical .js
 * remains the behavioural reference.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
const intake = require("./client-intake");

const MANIFEST_VERSION = 1;
const CODE = Object.freeze({
  STORE_NOT_READY: "STORE_NOT_READY", INVALID_MANIFEST: "INVALID_MANIFEST", TARGET_NOT_EMPTY: "TARGET_NOT_EMPTY",
  INTEGRITY_MISMATCH: "INTEGRITY_MISMATCH", WRITE_FAILED: "WRITE_FAILED", READ_FAILED: "READ_FAILED",
});

function sha256(s: crypto.BinaryLike): string { return crypto.createHash("sha256").update(s).digest("hex"); }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Recursively list files under dir as sorted repo-relative-to-dir paths (deterministic order).
function listFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  let entries;
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

// Deterministic manifest hash over (path, sha256) pairs only — independent of createdAt/content ordering.
function manifestHashOf(files: any[]): string {
  return sha256(JSON.stringify(files.map((f) => [f.path, f.sha256])));
}

/*
 * backup({cwd, nowMs}) → a frozen manifest { version, createdAtMs, base, files:[{path,sha256,bytes,content}],
 * manifestHash } or a fail-closed rejection. READ-ONLY on the source.
 */
function backup(opts: any = {}): any {
  const st = intake.storeState(opts.cwd);
  if (st.state !== "READY") return Object.freeze({ ok: false, code: CODE.STORE_NOT_READY, state: st.state });
  const base = st.base;
  const rels = listFiles(base);
  const files: any[] = [];
  for (const rel of rels) {
    let content;
    try { content = fs.readFileSync(path.join(base, rel), "utf8"); } catch (e: any) { return Object.freeze({ ok: false, code: CODE.READ_FAILED, detail: rel + ": " + String(e && e.code || e) }); }
    files.push({ path: rel, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8"), content });
  }
  return Object.freeze({
    ok: true, manifest: Object.freeze({
      version: MANIFEST_VERSION, createdAtMs: Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now(),
      base, files, manifestHash: manifestHashOf(files),
    }),
    count: files.length,
  });
}

/*
 * verify(manifest) → recompute the manifest hash and per-file content hashes; detects tampering/corruption.
 */
function verify(manifest: any): any {
  if (!isObj(manifest) || !Array.isArray(manifest.files)) return Object.freeze({ ok: false, code: CODE.INVALID_MANIFEST });
  for (const f of manifest.files) {
    if (!isObj(f) || typeof f.path !== "string" || typeof f.content !== "string" || typeof f.sha256 !== "string") return Object.freeze({ ok: false, code: CODE.INVALID_MANIFEST });
    if (sha256(f.content) !== f.sha256) return Object.freeze({ ok: false, code: CODE.INTEGRITY_MISMATCH, at: f.path });
  }
  const recomputed = manifestHashOf(manifest.files);
  return Object.freeze({ ok: recomputed === manifest.manifestHash, code: recomputed === manifest.manifestHash ? null : CODE.INTEGRITY_MISMATCH, manifestHash: recomputed });
}

/*
 * restore({manifest, target, force}) → write the manifest's files under `target` (an explicit absolute/rel
 * directory), re-hashing each after write. Refuses a non-empty target unless force. Fail-closed on any
 * integrity mismatch (never leaves wrong bytes claimed as restored).
 */
function restore(opts: any = {}): any {
  const manifest = opts.manifest, target = opts.target;
  const v = verify(manifest);
  if (!v.ok) return Object.freeze({ ok: false, code: v.code || CODE.INVALID_MANIFEST });
  if (typeof target !== "string" || !target) return Object.freeze({ ok: false, code: CODE.INVALID_MANIFEST, detail: "target required" });
  let existing: string[] = [];
  try { existing = listFiles(target); } catch { /* absent ⇒ empty */ }
  if (existing.length > 0 && opts.force !== true) return Object.freeze({ ok: false, code: CODE.TARGET_NOT_EMPTY, existing: existing.length });
  const restored: string[] = [];
  for (const f of manifest.files) {
    const abs = path.join(target, f.path);
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.content);
      const back = fs.readFileSync(abs, "utf8");
      if (sha256(back) !== f.sha256) return Object.freeze({ ok: false, code: CODE.INTEGRITY_MISMATCH, at: f.path });
      restored.push(f.path);
    } catch (e: any) { return Object.freeze({ ok: false, code: CODE.WRITE_FAILED, detail: f.path + ": " + String(e && e.code || e) }); }
  }
  return Object.freeze({ ok: true, restored: restored.length, target });
}

module.exports = { CODE, MANIFEST_VERSION, backup, verify, restore };

if (require.main === module) {
  const r = backup({});
  process.stdout.write(JSON.stringify(r.ok ? { ok: true, count: r.count, manifestHash: r.manifest.manifestHash } : r, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so this file's internal helpers
// (sha256 / isObj / listFiles / manifestHashOf) are MODULE-scoped rather than polluting the global script
// scope and colliding with same-named helpers in sibling lots compiled into the same tsconfig program
// (TS2393). The CommonJS API above (module.exports = { … }) is unchanged, as is parity with the .js.
export {};
