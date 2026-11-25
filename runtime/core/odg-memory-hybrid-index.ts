#!/usr/bin/env node
"use strict";

/*
 * V17.8 P4 — HYBRID MEMORY INDEX (Radar V178-P4: E-03/A-09 Qwen3-Embedding-0.6B, E-06 sqlite-vec, E-10 FTS5 BM25 + vector KNN
 * fused by Reciprocal Rank Fusion). NOT a second memory system: the source of truth stays the caller's memory records and the
 * canonical access layer memory-architecture.accessMemory (trust gate + 5-family classifier). This module only maintains a
 * DERIVED, rebuildable, per-tenant SQLite index over the records accessMemory returned as TRUSTED, and answers ranked queries.
 *   - trust first: a record that accessMemory EXCLUDES is never indexed (and is removed if it was indexed before);
 *   - per tenant: one SQLite file per tenant id (validated [A-Za-z0-9_-]{1,64}); no cross-tenant table;
 *   - embeddings: an INJECTED embed(texts) → number[][] (live: Ollama /api/embed on loopback; tests: a fake) — no network here;
 *   - vector leg: sqlite-vec vec0 (loaded as a SQLite extension from the installed npm package); FTS5 leg: SQLite built-in;
 *   - fusion: RRF score = Σ 1/(k + rank), k = 60 (scale-free: BM25 and cosine scores are not comparable).
 * Provenance: PROVIDER (Claude Code) code, V17.8 P4. Authorizes nothing; stores only the derived index file it is given.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const MEM = require("./memory-architecture");

const TENANT = /^[A-Za-z0-9_-]{1,64}$/;
const RRF_K = 60;
const QUERY_INSTRUCTION = "Instruct: Given a question, retrieve the stored ODG memory records that answer it\nQuery: ";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function sha(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }
function textOf(rec: any): string | null { const t = [rec.text, rec.summary, rec.content].find((x: any) => typeof x === "string" && x.trim()); return t ? String(t) : null; }

/* vecExtensionPath() — the vec0 loadable from the installed sqlite-vec npm package (platform optional dependency). */
function vecExtensionPath(): string | null {
  try { const sv = require("sqlite-vec"); if (sv && typeof sv.getLoadablePath === "function") return sv.getLoadablePath(); } catch { /* not installed */ }
  return null;
}

/* openIndex({ dir, tenant, dims }) — per-tenant DB with docs / FTS5 / vec0 tables. Fail-closed on a bad tenant id. */
function openIndex(o: any): any {
  if (!isObj(o) || !TENANT.test(String(o.tenant || ""))) throw new Error("P4: tenant id must match [A-Za-z0-9_-]{1,64}");
  const dims = Number(o.dims);
  if (!Number.isInteger(dims) || dims < 1 || dims > 8192) throw new Error("P4: dims must be an integer in [1, 8192]");
  const ext = o.vecExtension || vecExtensionPath();
  if (!ext) throw new Error("P4: sqlite-vec extension not available (npm package sqlite-vec)");
  const { DatabaseSync } = require("node:sqlite");
  fs.mkdirSync(o.dir, { recursive: true });
  const file = path.join(o.dir, `memory-${o.tenant}.sqlite`);
  const db = new DatabaseSync(file, { allowExtension: true });
  db.loadExtension(ext);
  db.exec(`create table if not exists docs(rid integer primary key, id text unique not null, family text, sha text not null);
           create virtual table if not exists fts using fts5(body);
           create virtual table if not exists vec using vec0(e float[${dims}]);
           create table if not exists meta(k text primary key, v text);`);
  const prev = db.prepare("select v from meta where k = 'dims'").get();
  if (prev && Number(prev.v) !== dims) { db.close(); throw new Error(`P4: index dims ${prev.v} ≠ requested ${dims} (rebuild the derived index)`); }
  db.prepare("insert or replace into meta(k, v) values ('dims', ?)").run(String(dims));
  return { db, file, dims };
}

function f32(v: number[]): Uint8Array { return new Uint8Array(new Float32Array(v).buffer); }

/* syncIndex(ix, records, accessOpts, embed) — index exactly the TRUSTED records with text; drop the rest. Returns counts. */
async function syncIndex(ix: any, records: any, accessOpts: any, embed: any): Promise<any> {
  const access = MEM.accessMemory(records, accessOpts);
  const byId: Record<string, any> = {}; for (const r of arr(records)) if (isObj(r) && r.id != null) byId[String(r.id)] = r;
  const want: any[] = [];
  for (const t of access.trusted) { const rec = byId[String(t.id)]; const text = rec ? textOf(rec) : null; if (text) want.push({ id: String(t.id), family: t.family, text, sha: sha(text) }); }
  const wantIds = new Set(want.map((w) => w.id));
  const db = ix.db;
  let removed = 0;
  for (const row of db.prepare("select rid, id from docs").all()) if (!wantIds.has(row.id)) { db.prepare("delete from docs where rid = ?").run(row.rid); db.prepare("delete from fts where rowid = ?").run(row.rid); db.prepare("delete from vec where rowid = ?").run(BigInt(row.rid)); removed++; }
  const todo = want.filter((w) => { const cur = db.prepare("select sha from docs where id = ?").get(w.id); return !cur || cur.sha !== w.sha; });
  const vecs = todo.length ? await embed(todo.map((w) => w.text)) : [];
  if (vecs.length !== todo.length || vecs.some((v: any) => !Array.isArray(v) || v.length !== ix.dims)) throw new Error("P4: embed() returned a wrong number/size of vectors");
  todo.forEach((w, i) => {
    const cur = db.prepare("select rid from docs where id = ?").get(w.id);
    if (cur) { db.prepare("delete from fts where rowid = ?").run(cur.rid); db.prepare("delete from vec where rowid = ?").run(BigInt(cur.rid)); db.prepare("update docs set family = ?, sha = ? where rid = ?").run(w.family, w.sha, cur.rid); }
    else db.prepare("insert into docs(id, family, sha) values (?, ?, ?)").run(w.id, w.family, w.sha);
    const rid = db.prepare("select rid from docs where id = ?").get(w.id).rid;
    db.prepare("insert into fts(rowid, body) values (?, ?)").run(rid, w.text);
    db.prepare("insert into vec(rowid, e) values (?, ?)").run(BigInt(rid), f32(vecs[i]));
  });
  return { trusted: access.trustedCount, excluded: access.excludedCount, indexed: want.length, embedded: todo.length, removed, withoutText: access.trustedCount - want.length };
}

/* ftsQuery(q) — terms of ≥ 2 letters, quoted (no FTS5 operator injection), OR-ed. */
function ftsQuery(q: string): string | null {
  const terms = String(q || "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const uniq = [...new Set(terms)].slice(0, 32);
  return uniq.length ? uniq.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ") : null;
}

/* query(ix, q, embed, { k }) — RRF of the FTS5 and vec0 rankings. Returns [{ id, family, score, ranks: { fts, vec } }]. */
async function query(ix: any, q: string, embed: any, opts: any = {}): Promise<any[]> {
  const k = Number.isInteger(opts.k) && opts.k > 0 ? opts.k : 5;
  const depth = Math.max(k * 4, 20);
  const db = ix.db;
  const fq = ftsQuery(q);
  const fts = fq ? db.prepare("select rowid as rid from fts where fts match ? order by rank limit ?").all(fq, depth) : [];
  const [qv] = await embed([QUERY_INSTRUCTION + q]);
  if (!Array.isArray(qv) || qv.length !== ix.dims) throw new Error("P4: query embedding of wrong size");
  const vec = db.prepare("select rowid as rid, distance from vec where e match ? and k = ? order by distance").all(f32(qv), depth);
  const acc: Record<string, any> = {};
  fts.forEach((r: any, i: number) => { const a = acc[r.rid] = acc[r.rid] || { score: 0, ranks: {} }; a.score += 1 / (RRF_K + i + 1); a.ranks.fts = i + 1; });
  vec.forEach((r: any, i: number) => { const a = acc[r.rid] = acc[r.rid] || { score: 0, ranks: {} }; a.score += 1 / (RRF_K + i + 1); a.ranks.vec = i + 1; });
  return Object.entries(acc).map(([rid, a]: any) => { const d = db.prepare("select id, family from docs where rid = ?").get(Number(rid)); return { id: d.id, family: d.family, score: a.score, ranks: a.ranks }; })
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1)).slice(0, k);
}

/* ollamaEmbed(model) — live embed seam over loopback Ollama /api/embed (callers inject it; tests never use it). */
function ollamaEmbed(model = "qwen3-embedding:0.6b", host = "http://127.0.0.1:11434"): any {
  return async (texts: string[]) => {
    const r = await fetch(`${host}/api/embed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, input: texts }), signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`P4: embed HTTP ${r.status}`);
    const j: any = await r.json(); return j.embeddings;
  };
}

const MEMORY_HYBRID_INDEX_CONTRACT = Object.freeze({
  id: "V178-P4-MEMORY-HYBRID-INDEX",
  reuses: Object.freeze(["memory-architecture.accessMemory (trust gate + family classifier) — composes, does NOT reimplement", "node:sqlite (FTS5 built-in)", "sqlite-vec vec0 (npm)", "Ollama /api/embed (qwen3-embedding:0.6b) via an injected seam"]),
  notAuthority: "a DERIVED, rebuildable per-tenant index over TRUSTED records; the records stay the source of truth; grants nothing",
  invariants: Object.freeze([
    "only records accessMemory returns as TRUSTED are indexed; an untrusted/stale record is never indexed and is removed if present",
    "one SQLite file per validated tenant id; no cross-tenant table",
    "fusion = RRF (k = 60), deterministic tie-break by id; FTS5 terms are quoted (no operator injection)",
    "no network in this module except the optional ollamaEmbed seam the caller injects",
  ]),
});

module.exports = { openIndex, syncIndex, query, ftsQuery, ollamaEmbed, vecExtensionPath, QUERY_INSTRUCTION, RRF_K, MEMORY_HYBRID_INDEX_CONTRACT };
export {};
