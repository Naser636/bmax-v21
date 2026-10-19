/*
 * compassProseDivergence (§7 Lot C) — the human prose compass must not be presented as "current" when the evidence
 * no longer matches. CONSISTENT / BEHIND (ancestor; mild) / DIVERGENT (not on HEAD history; concerning) / UNKNOWN
 * (fail-closed, never a false CONSISTENT). Includes the interruption case: machine checkpoint advanced but prose not
 * updated ⇒ the detector flags it. Injected fs/head/isAncestor — no real git/fs.
 *
 * Run: node_modules/.bin/tsx scripts/compass-prose-divergence.test.ts
 */
export {};
const { compassProseDivergence } = require("./compass-update.js");

let failures = 0;
function check(c: boolean, label: string): void { if (c) { console.log(`  PASS ${label}`); } else { failures++; console.log(`  FAIL ${label}`); } }
const fakeFs = (text: string) => ({ readFileSync: () => text });

console.log("compassProseDivergence — prose/HEAD coherence");

// 1. prose HEAD prefix-matches real HEAD ⇒ CONSISTENT.
let r = compassProseDivergence("/repo", { fs: fakeFs("… HEAD `4e48acf`+code …"), head: "4e48acf12345" });
check(r.status === "CONSISTENT" && r.proseHead === "4e48acf", "prose HEAD matches real HEAD ⇒ CONSISTENT");

// 2. INTERRUPTION case: machine advanced, prose still claims an older (ancestor) commit ⇒ BEHIND (mild/expected).
r = compassProseDivergence("/repo", { fs: fakeFs("HEAD `490789e` …"), head: "4e48acf12345", isAncestor: true });
check(r.status === "BEHIND" && r.proseHead === "490789e", "prose ancestor of HEAD ⇒ BEHIND (interruption between checkpoint + prose update, surfaced)");

// 3. prose HEAD NOT on HEAD history ⇒ DIVERGENT (concerning — wrong branch / rewritten).
r = compassProseDivergence("/repo", { fs: fakeFs("HEAD `deadbeef` …"), head: "4e48acf12345", isAncestor: false });
check(r.status === "DIVERGENT" && r.proseHead === "deadbeef", "prose not on HEAD history ⇒ DIVERGENT");

// 4. no HEAD token in prose ⇒ UNKNOWN (never false CONSISTENT).
r = compassProseDivergence("/repo", { fs: fakeFs("no commit tokens here"), head: "4e48acf12345" });
check(r.status === "UNKNOWN" && r.proseHead === null, "no token ⇒ UNKNOWN (fail-closed)");

// 5. git HEAD unavailable ⇒ UNKNOWN.
r = compassProseDivergence("/repo", { fs: fakeFs("HEAD `4e48acf`"), head: null });
check(r.status === "UNKNOWN", "HEAD unavailable ⇒ UNKNOWN");

// 6. unreadable prose ⇒ UNKNOWN (no throw).
r = compassProseDivergence("/repo", { fs: { readFileSync: () => { throw new Error("ENOENT"); } }, head: "abc1234" });
check(r.status === "UNKNOWN", "unreadable prose ⇒ UNKNOWN (no throw)");

// 7. takes the FIRST (top = latest) HEAD token when several entries exist.
r = compassProseDivergence("/repo", { fs: fakeFs("top HEAD `aaaaaaa`\nolder HEAD `bbbbbbb`"), head: "aaaaaaa99", });
check(r.proseHead === "aaaaaaa", "uses the first/top HEAD token (latest entry)");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS — compassProseDivergence");
if (failures) process.exit(1);
