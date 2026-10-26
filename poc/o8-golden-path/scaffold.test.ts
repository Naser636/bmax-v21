#!/usr/bin/env node
"use strict";
/* O8 PoC test — deterministic scaffold, write-set fidelity, provenance manifest, rerun determinism,
 * fail-closed on invalid input / missing authorization. Isolated temp dirs; no runtime mutation. */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const { scaffold } = require(path.resolve(__dirname, "scaffold.ts"));

let passed = 0;
function ok(name: string, cond: any): void { assert.ok(cond, name); console.log("  ok -", name); passed++; }
function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "o8-")); }

const GRANT = { template: "node-service", name: "demo-svc", owner: "ops@example.test", authorization: { grantTemplate: "node-service" } };

// 1 — scaffold generates exactly the write-set.
const d1 = tmp();
const r1 = scaffold(GRANT, d1);
ok("generates exactly the declared write-set", JSON.stringify(r1.written) === JSON.stringify(["README.md", "index.js", "package.json", "test.js"]));
ok("all files exist on disk", r1.written.every((f: string) => fs.existsSync(path.join(d1, f))));

// 2 — contract carries authorized write-set + deny-by-default gate + provenance manifest with sha256.
ok("contract authorizedWriteSet scoped to project", r1.contract.authorizedWriteSet.every((p: string) => p.startsWith("demo-svc/")));
ok("gate is deny-by-default", /deny-by-default/.test(r1.contract.gates.authorization));
ok("provenance manifest has sha256 per file", r1.contract.provenance.manifest.length === 4 && r1.contract.provenance.manifest.every((m: any) => /^[0-9a-f]{64}$/.test(m.sha256)));

// 3 — the generated project's own test passes (real artifact works).
{
  const res = cp.spawnSync("node", ["test.js"], { cwd: d1, encoding: "utf8" });
  ok("generated project `node test.js` exits 0", res.status === 0 && /ok/.test(res.stdout));
}

// 4 — rerun determinism: a second scaffold into a fresh dir is byte-identical (manifest shas equal).
const d2 = tmp();
const r2 = scaffold(GRANT, d2);
ok("rerun byte-identical (manifest shas equal)", JSON.stringify(r1.contract.provenance.manifest) === JSON.stringify(r2.contract.provenance.manifest));

// 5 — fail-closed: missing authorization ⇒ DENY (no files written).
{
  const d3 = tmp();
  let threw = false;
  try { scaffold({ template: "node-service", name: "x", owner: "o" }, d3); } catch { threw = true; }
  ok("missing authorization ⇒ DENY (throws)", threw);
  ok("DENY wrote nothing", fs.readdirSync(d3).length === 0);
}

// 6 — fail-closed: unknown template, bad name, malformed input.
for (const [label, inp] of [
  ["unknown template", { template: "nope", name: "x", owner: "o", authorization: { grantTemplate: "nope" } }],
  ["invalid name", { template: "node-service", name: "BAD NAME", owner: "o", authorization: { grantTemplate: "node-service" } }],
  ["malformed input", null],
  ["authorization mismatch", { template: "node-service", name: "x", owner: "o", authorization: { grantTemplate: "other" } }],
] as any[]) {
  let threw = false;
  try { scaffold(inp, tmp()); } catch { threw = true; }
  ok(`fail-closed: ${label} ⇒ throws`, threw);
}

console.log(`\nO8 golden-path PoC — ${passed} assertions passed.`);
export {};
