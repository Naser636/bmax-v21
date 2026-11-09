#!/usr/bin/env node
"use strict";
const RTR = require("./repair-router");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
// complexity assessment: a recursive/edge-case defect ⇒ COMPLEX; a trivial one ⇒ SIMPLE.
check(RTR.assessComplexity({ code: "module.exports=(a,b)=>a-b;", instruction: "fix add to return a+b" }).complexity === "SIMPLE", "trivial defect ⇒ SIMPLE");
check(RTR.assessComplexity({ code: "module.exports=(n)=>n*factorial(n-1);", instruction: "fix factorial: base case, named recursion" }).complexity === "COMPLEX", "recursive+edge defect ⇒ COMPLEX");

// A deterministic corpus (SYNTHETIC) + model-capability seams: the cheap model fixes SIMPLE only; the quality model fixes all.
const wrap = (c: string) => "```json\n" + JSON.stringify({ edits: [{ path: "src/x.js", content: c }] }) + "\n```";
const CORPUS = [
  { id: "add", code: "module.exports=(a,b)=>a-b;", instruction: "fix add to return a+b", allowedPath: "src/x.js", writeSet: ["src/x.js"], fix: "module.exports=(a,b)=>a+b;", test: (f: any) => f(2, 3) === 5, hard: false },
  { id: "clamp", code: "module.exports=(x,lo,hi)=>x<lo?lo:x;", instruction: "fix clamp to cap at hi", allowedPath: "src/x.js", writeSet: ["src/x.js"], fix: "module.exports=(x,lo,hi)=>x<lo?lo:x>hi?hi:x;", test: (f: any) => f(15, 0, 10) === 10 && f(5, 0, 10) === 5, hard: false },
  { id: "factorial", code: "module.exports=(n)=>n*factorial(n-1);", instruction: "fix factorial: base case n<=1 returns 1, named recursion", allowedPath: "src/x.js", writeSet: ["src/x.js"], fix: "function factorial(n){return n<=1?1:n*factorial(n-1);} module.exports=factorial;", test: (f: any) => f(5) === 120 && f(0) === 1, hard: true },
  { id: "fib", code: "module.exports=(n)=>fib(n-1)+fib(n-2);", instruction: "fix fib: base cases, named recursion", allowedPath: "src/x.js", writeSet: ["src/x.js"], fix: "function fib(n){return n<2?n:fib(n-1)+fib(n-2);} module.exports=fib;", test: (f: any) => f(7) === 13 && f(0) === 0, hard: true },
];
function verifier(test: any) { return async (content: string) => { try { const m = new (module as any).constructor(); m._compile(content, "/x.js"); return test(m.exports) === true ? { ok: true } : { ok: false, reason: "wrong" }; } catch (e: any) { return { ok: false, error: String(e.message) }; } }; }
// model seams: "3b" fixes a defect ONLY if not hard; "7b" fixes all. (A malformed output for a hard defect on 3b.)
function genFor(d: any) { return (model: string) => async (_p: string) => { const canFix = model.includes("7b") || !d.hard; return { ok: true, text: wrap(canFix ? d.fix : "module.exports=(n)=>n*missing(n-1);") }; }; }

(async () => {
  // Measure 4 modes.
  async function mode(useRouter: boolean, forceModel?: string, maxAttempts = 3) {
    let accepted = 0, escalations = 0, attempts = 0;
    for (const d of CORPUS) {
      if (useRouter) {
        const r = await RTR.routeRepair(d, { generateFor: genFor(d), verify: verifier(d.test), buildPrompt: () => d.instruction, maxAttempts });
        if (r.accepted) accepted++; if (r.escalated) escalations++; attempts += r.attempts;
      } else {
        const RR = require("./repair-retry.js");
        const r = await RR.repairWithRetry({ basePrompt: d.instruction, writeSet: d.writeSet, allowedPath: d.allowedPath, maxAttempts, generate: genFor(d)(forceModel!), verify: verifier(d.test) });
        if (r.accepted) accepted++; attempts += r.attempts;
      }
    }
    return { accepted, total: CORPUS.length, escalations, attempts };
  }
  const m3single = await mode(false, "qwen2.5-coder:3b", 1);
  const m3retry = await mode(false, "qwen2.5-coder:3b", 3);
  const m7retry = await mode(false, "qwen2.5-coder:7b", 3);
  const mRoute = await mode(true);
  console.log("MEASURED: 3B-single", m3single.accepted + "/" + m3single.total, "| 3B-retry", m3retry.accepted + "/4", "| 7B-retry", m7retry.accepted + "/4", "| auto-route", mRoute.accepted + "/4 escalations=" + mRoute.escalations);
  // 3B (any) fixes only the 2 easy ⇒ 2/4; 7B fixes all ⇒ 4/4; auto-route fixes all with escalation only on the 2 hard.
  check(m3single.accepted === 2 && m3retry.accepted === 2, "3B (single & retry) fixes only the 2 SIMPLE defects (2/4)");
  check(m7retry.accepted === 4, "7B fixes all 4");
  check(mRoute.accepted === 4, "auto-route fixes all 4 (COMPLEX defects routed to 7B upfront — optimal, no wasted 3B attempt)");
  // dedicated ESCALATION case: a defect CLASSIFIED simple but which the 3B seam cannot fix ⇒ must escalate to 7B.
  const tricky = { id: "tricky", code: "module.exports=(s)=>s.split(',').map(Number);", instruction: "return the list", allowedPath: "src/x.js", writeSet: ["src/x.js"], fix: "module.exports=(s)=>s?s.split(',').map(Number):[];", test: (f: any) => JSON.stringify(f("")) === "[]" && JSON.stringify(f("1")) === "[1]", hard: true };
  check(RTR.assessComplexity({ code: tricky.code, instruction: tricky.instruction }).complexity === "SIMPLE", "the tricky defect is CLASSIFIED simple");
  const er = await RTR.routeRepair(tricky, { generateFor: genFor(tricky), verify: verifier(tricky.test), buildPrompt: () => tricky.instruction, maxAttempts: 2 });
  check(er.accepted === true && er.escalated === true && er.model.includes("7b"), "a SIMPLE-classified defect the 3B cannot fix ⇒ ESCALATES to 7B and is accepted (the V26 discovered need)");
  check(/escalates a FAILED cheaper attempt/i.test(JSON.stringify(RTR.REPAIR_ROUTER_CONTRACT.notAuthority)), "contract: escalate-on-failure");
  if (failures === 0) process.stdout.write("ALL PASS — V12.4 REPAIR ROUTER\n");
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
