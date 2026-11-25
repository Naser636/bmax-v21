#!/usr/bin/env node
"use strict";
/* V17.8 P4 — hybrid memory index: hermetic (fake deterministic embed, temp dirs, real node:sqlite + sqlite-vec vec0). */
const fs = require("fs"), os = require("os"), path = require("path");
const H = require("./odg-memory-hybrid-index");
let failures = 0;
function check(c: any, l: string): void { if (!c) { failures++; process.stdout.write("NOT OK - " + l + "\n"); } else process.stdout.write("ok - " + l + "\n"); }

const DIMS = 16;
let embedCalls = 0;
// deterministic bag-of-trigrams embedding (lexical similarity ⇒ closer vectors); NOT a semantic model — enough to test the plumbing
const fakeEmbed = async (texts: string[]) => { embedCalls += texts.length; return texts.map((t) => { const v = new Array(DIMS).fill(0); const s = t.toLowerCase().replace(/^instruct:[\s\S]*?\nquery: /, ""); for (let i = 0; i + 3 <= s.length; i++) { let h = 0; for (const ch of s.slice(i, i + 3)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; v[h % DIMS] += 1; } const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map((x) => x / n); }); };
const T = (id: string, text: string, extra: any = {}) => ({ id, text, provenance: "mission:M1", validUntil: 200, status: "ACTIVE", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "semantic", ...extra });
const ACCESS = { asOf: 100, trustedAuthors: ["ODG"] };

(async () => {
  check(!!H.vecExtensionPath(), "sqlite-vec loadable is resolvable from the installed npm package");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p4-"));
  let threw = ""; try { H.openIndex({ dir, tenant: "../x", dims: DIMS }); } catch (e: any) { threw = e.message; }
  check(/tenant id/.test(threw), "a tenant id with path characters is refused (fail-closed)");
  const ix = H.openIndex({ dir, tenant: "acme", dims: DIMS });
  const recs = [T("r1", "Révision de prix selon l'index BT01 pour un marché de travaux"), T("r2", "Retenue de garantie de 5 % sur un marché public"), T("r3", "Planning de coulage du béton armé"),
    { id: "r4", text: "secret record from an unknown author", provenance: "x", authoredBy: "MYSTERY", family: "working" }, T("r5", "", {})];
  const s1 = await H.syncIndex(ix, recs, ACCESS, fakeEmbed);
  check(s1.trusted === 4 && s1.excluded === 1 && s1.indexed === 3 && s1.withoutText === 1 && s1.embedded === 3, "sync: only TRUSTED records with text are indexed (untrusted r4 excluded, empty r5 skipped)");
  const before = embedCalls; const s2 = await H.syncIndex(ix, recs, ACCESS, fakeEmbed);
  check(s2.embedded === 0 && embedCalls === before, "sync is idempotent: unchanged records are not re-embedded");
  const res = await H.query(ix, "révision de prix marché", fakeEmbed, { k: 3 });
  check(res.length > 0 && res[0].id === "r1" && res[0].ranks.fts && res[0].ranks.vec, "query: the record matched by BOTH legs ranks first (RRF)");
  check(!res.some((r: any) => r.id === "r4"), "query never returns an untrusted record");
  const inj = await H.query(ix, 'prix" OR body:* NEAR(', fakeEmbed, { k: 3 });
  check(Array.isArray(inj), "FTS5 operator characters in the query are neutralised (no syntax error)");
  const changed = recs.map((r: any) => r.id === "r3" ? { ...r, text: "Planning de coulage du béton armé — semaine 48" } : r);
  const s3 = await H.syncIndex(ix, changed, ACCESS, fakeEmbed);
  check(s3.embedded === 1, "a changed record text is re-embedded (sha-tracked)");
  const revoked = changed.map((r: any) => r.id === "r2" ? { ...r, status: "INVALIDATED" } : r);
  const s4 = await H.syncIndex(ix, revoked, ACCESS, fakeEmbed);
  const after = await H.query(ix, "retenue de garantie", fakeEmbed, { k: 5 });
  check(s4.removed === 1 && !after.some((r: any) => r.id === "r2"), "a record that becomes untrusted (INVALIDATED) is REMOVED from the index");
  ix.db.close();
  const ix2 = H.openIndex({ dir, tenant: "acme", dims: DIMS });
  const persisted = await H.query(ix2, "révision de prix", fakeEmbed, { k: 1 });
  check(persisted.length === 1 && persisted[0].id === "r1", "persistence: the index survives close/reopen");
  ix2.db.close();
  const other = H.openIndex({ dir, tenant: "beta", dims: DIMS });
  check((await H.query(other, "révision de prix", fakeEmbed, { k: 3 })).length === 0, "per-tenant isolation: another tenant's file sees nothing");
  other.db.close();
  threw = ""; try { H.openIndex({ dir, tenant: "acme", dims: DIMS * 2 }); } catch (e: any) { threw = e.message; }
  check(/dims/.test(threw), "reopening with different dims is refused (rebuild required)");
  check(H.ftsQuery("a") === null && H.ftsQuery("Prix prix") === '"prix"', "ftsQuery: short/duplicate terms dropped, terms quoted");
  if (failures) { process.stdout.write(failures + " failure(s)\n"); process.exit(1); }
  process.stdout.write("all odg-memory-hybrid-index tests pass\n");
})();
export {};
