#!/usr/bin/env node
"use strict";
const R = require("./repair-retry");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const wrap = (content: string) => "```json\n" + JSON.stringify({ edits: [{ path: "src/x.js", content }] }) + "\n```";
(async () => {
  // (1) feedback-retry recovers a near-miss: attempt 1 references an undefined name (verify throws), attempt 2 (after
  // feedback) defines it correctly ⇒ ACCEPTED on attempt 2.
  let n = 0;
  const genWrongThenRight = async (_p: string) => { n++; return { ok: true, text: n === 1 ? wrap("module.exports=(x)=>x*helper(x);") : wrap("function helper(x){return 1;} module.exports=(x)=>x*helper(x);") }; };
  const verify = async (content: string) => { try { const m = new (module as any).constructor(); m._compile(content, "/x.js"); return m.exports(5) === 5 ? { ok: true } : { ok: false, reason: "wrong result" }; } catch (e: any) { return { ok: false, error: String(e.message) }; } };
  const r1 = await R.repairWithRetry({ basePrompt: "fix", writeSet: ["src/x.js"], allowedPath: "src/x.js", maxAttempts: 3, generate: genWrongThenRight, verify });
  check(r1.accepted === true && r1.attempts === 2, "feedback-retry recovers a near-miss on attempt 2 (undefined-name error fed back)");

  // (2) always-wrong generator ⇒ never accepted, budget not exceeded (fail-closed).
  const genAlwaysWrong = async (_p: string) => ({ ok: true, text: wrap("module.exports=(x)=>x*nope(x);") });
  const r2 = await R.repairWithRetry({ basePrompt: "fix", writeSet: ["src/x.js"], allowedPath: "src/x.js", maxAttempts: 3, generate: genAlwaysWrong, verify });
  check(r2.accepted === false && r2.attempts === 3, "always-wrong ⇒ never accepted, budget (3) not exceeded");

  // (3) an out-of-write-set edit is rejected (and fed back), never accepted.
  const genOutOfSet = async (_p: string) => ({ ok: true, text: "```json\n" + JSON.stringify({ edits: [{ path: "src/secrets.js", content: "module.exports=(x)=>x;" }] }) + "\n```" });
  const r3 = await R.repairWithRetry({ basePrompt: "fix", writeSet: ["src/x.js"], allowedPath: "src/x.js", maxAttempts: 2, generate: genOutOfSet, verify });
  check(r3.accepted === false && r3.history.some((h: any) => h.stage === "WRITE_SET_VIOLATION"), "out-of-write-set edit ⇒ rejected (write-set guard), never accepted");

  // (4) a fix accepted ONLY on the independent verifier — a generator claim is never trusted (verify is the arbiter).
  const genClaimsButWrong = async (_p: string) => ({ ok: true, text: wrap("module.exports=(x)=>x+1;") });   // wrong: verify wants *helper==x
  const r4 = await R.repairWithRetry({ basePrompt: "fix", writeSet: ["src/x.js"], allowedPath: "src/x.js", maxAttempts: 2, generate: genClaimsButWrong, verify });
  check(r4.accepted === false, "a fix that fails the INDEPENDENT verifier is never accepted (no generator self-trust)");

  check(/accepted only if .* INDEPENDENT verifier/i.test(JSON.stringify(R.REPAIR_RETRY_CONTRACT.invariants)), "contract: independent verifier is the arbiter");
  if (failures === 0) process.stdout.write("ALL PASS — V12.4 REPAIR-RETRY\n");
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
