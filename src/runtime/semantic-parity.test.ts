#!/usr/bin/env node
/*
 * SEMANTIC_PARITY contract — deterministic unit test (§U Phase-1 #2).
 *
 * Positive: artifacts equivalent after a DECLARED normalizer (+ inherited ISO). Negatives: a BUSINESS
 * divergence is detected; a FORBIDDEN real-repo write during the compared run fails the check AND never
 * reaches the repo. Allowed-contained temp-dir writes are NOT confused with forbidden effects. Coverage is
 * reported honestly (no universal-effect-absence claim). Offline, pure, deterministic.
 *
 * Run:  node_modules/.bin/tsx src/runtime/semantic-parity.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const sp = require("./semantic-parity");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("SEMANTIC_PARITY contract — deterministic unit test");

const ISO = () => "2026-01-01T00:00:00.000Z";
const createdAtNorm = { name: "createdAt", pattern: /"createdAt":"[^"]*"/g, placeholder: '"createdAt":"<createdAt>"' };

// 1. POSITIVE — a declared normalizer makes two business-identical artifacts parity-equal (recorded count).
{
  const jsRaw = JSON.stringify({ id: "A", createdAt: "2026-01-01T10:00:00.000Z", n: 1 });
  const tsRaw = JSON.stringify({ id: "A", createdAt: "2026-02-02T20:00:00.000Z", n: 1 });
  const r = sp.compareUnderContract("rec", jsRaw, tsRaw, [createdAtNorm]);
  check(r.parity === true, "positive: business-identical under declared createdAt normalizer ⇒ parity");
  check(r.normalizersApplied.some((a: any) => a.name === "createdAt" && a.count === 1), "positive: declared normalizer RECORDED (createdAt×1, not silent)");
}

// 1b. POSITIVE — inherited ISO-timestamp normalization (no declared normalizer needed).
{
  const jsRaw = "built at 2026-01-01T10:00:00.000Z ok";
  const tsRaw = "built at 2026-09-09T09:09:09.000Z ok";
  const r = sp.compareUnderContract("iso", jsRaw, tsRaw, []);
  check(r.parity === true && /timestamp normalization/.test(r.reason), "positive: inherited ISO timestamp normalization ⇒ parity (reused compareArtifact)");
}

// 2. NEGATIVE — a BUSINESS divergence is detected (not normalized away).
{
  const r = sp.compareUnderContract("biz", JSON.stringify({ v: 1 }), JSON.stringify({ v: 2 }), [createdAtNorm]);
  check(r.parity === false && /BUSINESS DIVERGENCE/.test(r.reason), "negative: business divergence detected (never normalized away)");
}

// 2b. NON-GLOBAL normalizer rejected (declared-only, explicit contract).
{
  let threw = false;
  try { sp.compareUnderContract("x", "a", "a", [{ name: "bad", pattern: /x/, placeholder: "y" }]); } catch { threw = true; }
  check(threw, "contract: a non-global normalizer pattern is REJECTED (explicit, no silent misuse)");
}

const temps: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "sparity-")); temps.push(d); return d; };
try {
  // 3. ALLOWED-CONTAINED — producers writing under the injected tempDir are NOT flagged; parity computed.
  {
    const td = tmp();
    const produce = (val: number) => () => {
      const f = path.join(td, "out.json"); const body = JSON.stringify({ val, createdAt: ISO() });
      fs.writeFileSync(f, body); // allowed: inside injected tempDir
      return fs.readFileSync(f, "utf8");
    };
    const r = sp.proveParity({ name: "contained", tempDir: td, jsProduce: produce(1), tsProduce: produce(1), normalizers: [createdAtNorm] });
    check(r.effect.forbiddenDetected === false && r.parity === true, "allowed-contained: temp-dir writes NOT confused with forbidden effects; parity computed");
    check(fs.existsSync(path.join(td, "out.json")), "allowed-contained: the temp write actually happened (guard delegated to real fs)");
  }

  // 4. NEGATIVE — a FORBIDDEN real-repo write during the compared run fails the check and never reaches the repo.
  {
    const td = tmp();
    const probe = path.join(REPO, "runtime", "generated", "__semantic_parity_probe__.json");
    const before = fs.existsSync(probe);
    const r = sp.proveParity({
      name: "forbidden",
      tempDir: td,
      jsProduce: () => { fs.writeFileSync(probe, "SHOULD-NOT-PERSIST"); return "x"; }, // forbidden: real repo
      tsProduce: () => "x",
    });
    check(r.parity === false && r.effect.forbiddenDetected === true && /FORBIDDEN/.test(r.reason), "negative: forbidden real-repo write ⇒ parity:false, forbiddenDetected");
    check(fs.existsSync(probe) === before, "negative: the forbidden write NEVER reached the repo (probe not created by the contract)");
    if (!before && fs.existsSync(probe)) { fs.rmSync(probe, { force: true }); /* defensive cleanup — indicates a leak */ }
  }

  // 5. COVERAGE HONESTY — the contract states bounded coverage and never claims universal effect-absence.
  {
    const td = tmp();
    const r = sp.proveParity({ name: "cov", tempDir: td, jsProduce: () => "a", tsProduce: () => "a" });
    check(/does NOT cover/.test(r.effect.coverage) && /NOT universal effect-absence/.test(r.effect.coverage), "coverage honesty: bounded coverage stated; no universal-absence claim");
  }

  // 6. missing tempDir ⇒ rejected (explicit injection required).
  {
    let threw = false;
    try { sp.proveParity({ name: "z", jsProduce: () => "a", tsProduce: () => "a" } as any); } catch { threw = true; }
    check(threw, "contract: proveParity REQUIRES an explicitly-injected tempDir");
  }
} finally {
  for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — SEMANTIC_PARITY contract" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
