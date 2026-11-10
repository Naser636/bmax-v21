#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V42 LOT O — HARD COMPLEX corpus (SPEC-ONLY contracts). 12 DISTINCT tasks across 4 structural families:
 *   A large DAGs (6 files), B deep algorithmic logic, C shared state & consistency, D contracts & validation.
 * CRITICAL DESIGN (honest hard benchmark): each file's `contract` is a BEHAVIOURAL SPEC (what to export + 1 example) that
 * does NOT contain the implementation — the model must REASON/IMPLEMENT it, not transcribe. `ref` holds a correct
 * implementation used ONLY by the harness soundness validator (never shown to the model). Edge cases live in `test` and are
 * NOT revealed in the contract. The last file is always the entry (report). Exported for the duel runner + validator.
 */

function jeq(a: any, b: any): boolean { return JSON.stringify(a) === JSON.stringify(b); }

const PARSE_NUMS_SPEC = "Export a function (s) that splits the comma-separated string into an array of numbers. Example: '1,2,3' -> [1,2,3].";
const PARSE_NUMS_REF = "module.exports = (s) => String(s).split(',').map((x) => Number(x));";

const HARD_TASKS: any[] = [
  // ---- Family A: large DAGs (6 files) ----
  { id: "number-stats-suite", family: "A-large-dag",
    files: [
      { path: "parse.js", contract: PARSE_NUMS_SPEC, ref: PARSE_NUMS_REF },
      { path: "mean.js", dependsOn: ["parse.js"], contract: "Require ./parse.js (string -> number[]). Export (s) = the arithmetic mean of the parsed numbers.", ref: "const p = require('./parse.js'); module.exports = (s) => { const xs = p(s); return xs.reduce((a, b) => a + b, 0) / xs.length; };" },
      { path: "median.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the median of the parsed numbers. Sort numerically first; for an EVEN count return the average of the two middle values. Example: '1,2,3,4' -> 2.5.", ref: "const p = require('./parse.js'); module.exports = (s) => { const xs = p(s).slice().sort((a, b) => a - b); const n = xs.length; return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2; };" },
      { path: "lo.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the minimum of the parsed numbers.", ref: "const p = require('./parse.js'); module.exports = (s) => Math.min.apply(null, p(s));" },
      { path: "hi.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the maximum of the parsed numbers.", ref: "const p = require('./parse.js'); module.exports = (s) => Math.max.apply(null, p(s));" },
      { path: "report.js", dependsOn: ["mean.js", "median.js", "lo.js", "hi.js"], contract: "Require ./mean.js, ./median.js, ./lo.js, ./hi.js (each string -> number). Export (s) = { mean, median, min, max } computed via them.", ref: "const mean = require('./mean.js'); const median = require('./median.js'); const lo = require('./lo.js'); const hi = require('./hi.js'); module.exports = (s) => ({ mean: mean(s), median: median(s), min: lo(s), max: hi(s) });" },
    ],
    test: (f: any) => jeq(f("1,2,3,4"), { mean: 2.5, median: 2.5, min: 1, max: 4 }) && jeq(f("5,3,1,2,4"), { mean: 3, median: 3, min: 1, max: 5 }) && jeq(f("10"), { mean: 10, median: 10, min: 10, max: 10 }) },
  { id: "word-metrics", family: "A-large-dag",
    files: [
      { path: "parse.js", contract: "Export (s) that splits a sentence on spaces into words, dropping empty strings. Example: 'a  b' -> ['a','b'].", ref: "module.exports = (s) => String(s).split(' ').filter((w) => w.length > 0);" },
      { path: "count.js", dependsOn: ["parse.js"], contract: "Require ./parse.js (string -> string[]). Export (s) = the number of words.", ref: "const p = require('./parse.js'); module.exports = (s) => p(s).length;" },
      { path: "unique.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the number of DISTINCT words.", ref: "const p = require('./parse.js'); module.exports = (s) => new Set(p(s)).size;" },
      { path: "longest.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the longest word; on a tie return the FIRST such word.", ref: "const p = require('./parse.js'); module.exports = (s) => p(s).reduce((a, b) => (b.length > a.length ? b : a));" },
      { path: "chars.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the total number of characters across all words (sum of word lengths).", ref: "const p = require('./parse.js'); module.exports = (s) => p(s).reduce((a, w) => a + w.length, 0);" },
      { path: "report.js", dependsOn: ["count.js", "unique.js", "longest.js", "chars.js"], contract: "Require ./count.js, ./unique.js, ./longest.js, ./chars.js. Export (s) = { count, unique, longest, totalChars }.", ref: "const c = require('./count.js'); const u = require('./unique.js'); const l = require('./longest.js'); const ch = require('./chars.js'); module.exports = (s) => ({ count: c(s), unique: u(s), longest: l(s), totalChars: ch(s) });" },
    ],
    test: (f: any) => jeq(f("the cat the dog"), { count: 4, unique: 3, longest: "the", totalChars: 12 }) && jeq(f("a bb ccc"), { count: 3, unique: 3, longest: "ccc", totalChars: 6 }) },
  { id: "grade-report", family: "A-large-dag",
    files: [
      { path: "parse.js", contract: PARSE_NUMS_SPEC, ref: PARSE_NUMS_REF },
      { path: "average.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the average score.", ref: "const p = require('./parse.js'); module.exports = (s) => { const xs = p(s); return xs.reduce((a, b) => a + b, 0) / xs.length; };" },
      { path: "hi.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the highest score.", ref: "const p = require('./parse.js'); module.exports = (s) => Math.max.apply(null, p(s));" },
      { path: "lo.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the lowest score.", ref: "const p = require('./parse.js'); module.exports = (s) => Math.min.apply(null, p(s));" },
      { path: "pass.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the count of PASSING scores, where passing means >= 50 (inclusive).", ref: "const p = require('./parse.js'); module.exports = (s) => p(s).filter((n) => n >= 50).length;" },
      { path: "report.js", dependsOn: ["average.js", "hi.js", "lo.js", "pass.js"], contract: "Require ./average.js, ./hi.js, ./lo.js, ./pass.js. Export (s) = { average, highest, lowest, passCount }.", ref: "const avg = require('./average.js'); const hi = require('./hi.js'); const lo = require('./lo.js'); const pass = require('./pass.js'); module.exports = (s) => ({ average: avg(s), highest: hi(s), lowest: lo(s), passCount: pass(s) });" },
    ],
    test: (f: any) => jeq(f("50,60,40,90"), { average: 60, highest: 90, lowest: 40, passCount: 3 }) && jeq(f("30"), { average: 30, highest: 30, lowest: 30, passCount: 0 }) && jeq(f("50"), { average: 50, highest: 50, lowest: 50, passCount: 1 }) },

  // ---- Family B: deep algorithmic logic (spec only — the algorithm must be reasoned, not given) ----
  { id: "roman-codec", family: "B-deep-logic",
    files: [
      { path: "parse.js", contract: "Export (s) = the input string trimmed and converted to an integer. Example: ' 42 ' -> 42.", ref: "module.exports = (s) => Number(String(s).trim());" },
      { path: "toroman.js", dependsOn: ["parse.js"], contract: "Require ./parse.js (string -> integer). Export (s) = the Roman numeral for the parsed integer (1..3999), using standard SUBTRACTIVE notation (4=IV, 9=IX, 40=XL, 90=XC, 400=CD, 900=CM). Example input '1994' -> 'MCMXCIV'.", ref: "const p = require('./parse.js'); const T = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; module.exports = (s) => { let n = p(s), r = ''; for (const pair of T) { while (n >= pair[0]) { r += pair[1]; n -= pair[0]; } } return r; };" },
      { path: "fromroman.js", contract: "Export (roman) = the integer value of a Roman numeral STRING (inverse of standard subtractive notation). Example 'MCMXCIV' -> 1994.", ref: "module.exports = (roman) => { const V = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 }; let t = 0; for (let i = 0; i < roman.length; i++) { const cur = V[roman[i]], nxt = V[roman[i+1]]; if (nxt > cur) t -= cur; else t += cur; } return t; };" },
      { path: "report.js", dependsOn: ["toroman.js", "fromroman.js"], contract: "Require ./toroman.js (string -> roman string) and ./fromroman.js (roman string -> integer). Export (s) = { roman: toroman(s), back: fromroman(that roman) }.", ref: "const tr = require('./toroman.js'); const fr = require('./fromroman.js'); module.exports = (s) => { const roman = tr(s); return { roman: roman, back: fr(roman) }; };" },
    ],
    test: (f: any) => jeq(f("4"), { roman: "IV", back: 4 }) && jeq(f("1994"), { roman: "MCMXCIV", back: 1994 }) && jeq(f("40"), { roman: "XL", back: 40 }) && jeq(f("3888"), { roman: "MMMDCCCLXXXVIII", back: 3888 }) },
  { id: "rle-codec", family: "B-deep-logic",
    files: [
      { path: "parse.js", contract: "Export (s) = the raw input string unchanged.", ref: "module.exports = (s) => String(s);" },
      { path: "encode.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the run-length encoding: each maximal run of one character becomes that character followed by the run length (single digit). Example 'aaab' -> 'a3b1'.", ref: "const p = require('./parse.js'); module.exports = (s) => { const str = p(s); let out = '', i = 0; while (i < str.length) { let j = i; while (j < str.length && str[j] === str[i]) j++; out += str[i] + (j - i); i = j; } return out; };" },
      { path: "decode.js", contract: "Export (enc) = the inverse of the run-length encoding (character then single-digit count repeated). Example 'a3b1' -> 'aaab'.", ref: "module.exports = (enc) => { let out = ''; for (let i = 0; i < enc.length; i += 2) { out += enc[i].repeat(Number(enc[i+1])); } return out; };" },
      { path: "report.js", dependsOn: ["encode.js", "decode.js"], contract: "Require ./encode.js and ./decode.js. Export (s) = { encoded: encode(s), roundtrip: decode(encode(s)) === s }.", ref: "const e = require('./encode.js'); const d = require('./decode.js'); module.exports = (s) => { const enc = e(s); return { encoded: enc, roundtrip: d(enc) === s }; };" },
    ],
    test: (f: any) => jeq(f("aaab"), { encoded: "a3b1", roundtrip: true }) && jeq(f("abc"), { encoded: "a1b1c1", roundtrip: true }) && jeq(f("wwwwwwwww"), { encoded: "w9", roundtrip: true }) },
  { id: "bracket-balance", family: "B-deep-logic",
    files: [
      { path: "parse.js", contract: "Export (s) = the array of characters of the string.", ref: "module.exports = (s) => String(s).split('');" },
      { path: "normalize.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = only the bracket characters, i.e. characters in the set ()[]{} in order (drop everything else).", ref: "const p = require('./parse.js'); module.exports = (s) => p(s).filter((c) => '()[]{}'.indexOf(c) >= 0);" },
      { path: "check.js", dependsOn: ["normalize.js"], contract: "Require ./normalize.js. Export (s) = true iff the brackets are balanced AND correctly nested with matching TYPES, e.g. '([)]' is false, '(())' is true, '' is true.", ref: "const norm = require('./normalize.js'); const pair = { ')':'(', ']':'[', '}':'{' }; module.exports = (s) => { const cs = norm(s); const st = []; for (const c of cs) { if (c === '(' || c === '[' || c === '{') st.push(c); else if (st.pop() !== pair[c]) return false; } return st.length === 0; };" },
      { path: "report.js", dependsOn: ["check.js"], contract: "Require ./check.js. Export (s) = { balanced: check(s) }.", ref: "const c = require('./check.js'); module.exports = (s) => ({ balanced: c(s) });" },
    ],
    test: (f: any) => jeq(f("(())"), { balanced: true }) && jeq(f("([)]"), { balanced: false }) && jeq(f(""), { balanced: true }) && jeq(f("(a[b]c)"), { balanced: true }) && jeq(f("((("), { balanced: false }) },

  // ---- Family C: shared state & consistency ----
  { id: "bank-ledger", family: "C-shared-state",
    files: [
      { path: "parse.js", contract: "Export (s) = parse comma-separated operations of the form 'type:amount' into objects { type, amount:Number }. Example 'dep:100,wd:50' -> [{type:'dep',amount:100},{type:'wd',amount:50}].", ref: "module.exports = (s) => String(s).split(',').map((op) => { const kv = op.split(':'); return { type: kv[0].trim(), amount: Number(kv[1]) }; });" },
      { path: "apply.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = { balance, rejected } starting from balance 0: a 'dep' adds its amount; a 'wd' subtracts ONLY if it does not overdraw (amount <= current balance), otherwise it is REJECTED (balance unchanged, rejected incremented).", ref: "const p = require('./parse.js'); module.exports = (s) => { let bal = 0, rejected = 0; for (const op of p(s)) { if (op.type === 'dep') bal += op.amount; else if (op.type === 'wd') { if (op.amount <= bal) bal -= op.amount; else rejected++; } } return { balance: bal, rejected: rejected }; };" },
      { path: "validate.js", dependsOn: ["apply.js"], contract: "Require ./apply.js. Export (s) = true iff the resulting balance is never negative (balance >= 0).", ref: "const a = require('./apply.js'); module.exports = (s) => a(s).balance >= 0;" },
      { path: "report.js", dependsOn: ["apply.js", "validate.js"], contract: "Require ./apply.js and ./validate.js. Export (s) = { balance, rejected, valid }.", ref: "const a = require('./apply.js'); const v = require('./validate.js'); module.exports = (s) => { const r = a(s); return { balance: r.balance, rejected: r.rejected, valid: v(s) }; };" },
    ],
    test: (f: any) => jeq(f("dep:100,wd:30,wd:200"), { balance: 70, rejected: 1, valid: true }) && jeq(f("dep:50,wd:50"), { balance: 0, rejected: 0, valid: true }) && jeq(f("wd:10"), { balance: 0, rejected: 1, valid: true }) },
  { id: "stack-machine", family: "C-shared-state",
    files: [
      { path: "parse.js", contract: "Export (s) = the comma-separated tokens, each trimmed. Example 'push 3, add' -> ['push 3','add'].", ref: "module.exports = (s) => String(s).split(',').map((t) => t.trim());" },
      { path: "exec.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the final stack (array) after running the program: 'push N' pushes N; 'add'/'sub'/'mul' pop the top two (b = top, a = next) and push a OP b (so 'push 10,push 3,sub' yields 7). Return the whole stack.", ref: "const p = require('./parse.js'); module.exports = (s) => { const st = []; for (const tok of p(s)) { const parts = tok.split(' '); if (parts[0] === 'push') st.push(Number(parts[1])); else { const b = st.pop(), a = st.pop(); if (parts[0] === 'add') st.push(a + b); else if (parts[0] === 'sub') st.push(a - b); else if (parts[0] === 'mul') st.push(a * b); } } return st; };" },
      { path: "top.js", dependsOn: ["exec.js"], contract: "Require ./exec.js (string -> stack array). Export (s) = the top (last element) of the final stack.", ref: "const e = require('./exec.js'); module.exports = (s) => { const st = e(s); return st[st.length - 1]; };" },
      { path: "report.js", dependsOn: ["top.js", "exec.js"], contract: "Require ./top.js and ./exec.js. Export (s) = { result: top(s), depth: exec(s).length }.", ref: "const t = require('./top.js'); const e = require('./exec.js'); module.exports = (s) => ({ result: t(s), depth: e(s).length });" },
    ],
    test: (f: any) => jeq(f("push 3,push 4,add"), { result: 7, depth: 1 }) && jeq(f("push 10,push 3,sub"), { result: 7, depth: 1 }) && jeq(f("push 2,push 3,mul,push 4,add"), { result: 10, depth: 1 }) },
  { id: "voting-tally", family: "C-shared-state",
    files: [
      { path: "parse.js", contract: "Export (s) = the comma-separated votes, each trimmed. Example 'A, B, A' -> ['A','B','A'].", ref: "module.exports = (s) => String(s).split(',').map((v) => v.trim());" },
      { path: "tally.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = an object mapping each candidate to their vote count.", ref: "const p = require('./parse.js'); module.exports = (s) => { const t = {}; for (const v of p(s)) t[v] = (t[v] || 0) + 1; return t; };" },
      { path: "winner.js", dependsOn: ["tally.js"], contract: "Require ./tally.js. Export (s) = the candidate with the most votes; on a tie return the FIRST one encountered.", ref: "const ty = require('./tally.js'); module.exports = (s) => { const t = ty(s); let best = null, bc = -1; for (const k of Object.keys(t)) { if (t[k] > bc) { bc = t[k]; best = k; } } return best; };" },
      { path: "report.js", dependsOn: ["tally.js", "winner.js"], contract: "Require ./tally.js and ./winner.js. Export (s) = { winner, majority } where majority is true iff the winner has STRICTLY more than half of all votes.", ref: "const ty = require('./tally.js'); const w = require('./winner.js'); module.exports = (s) => { const t = ty(s); const win = w(s); const total = Object.keys(t).reduce((a, k) => a + t[k], 0); return { winner: win, majority: t[win] * 2 > total }; };" },
    ],
    test: (f: any) => jeq(f("A,B,A"), { winner: "A", majority: true }) && jeq(f("A,B,C"), { winner: "A", majority: false }) && jeq(f("A,A,B,B,A"), { winner: "A", majority: true }) },

  // ---- Family D: contracts & validation ----
  { id: "csv-typed-validator", family: "D-contracts",
    files: [
      { path: "parse.js", contract: "Export (s) = split on ';' into rows, each row split on ',' into cells. Example '1,2;3,4' -> [['1','2'],['3','4']].", ref: "module.exports = (s) => String(s).split(';').map((row) => row.split(','));" },
      { path: "validate.js", dependsOn: ["parse.js"], contract: "Require ./parse.js (string -> rows of cells). Export (s) = an array of booleans, one per row: a row is valid iff it has EXACTLY 3 cells and ALL are numeric (non-empty and parse to a number).", ref: "const p = require('./parse.js'); const num = (x) => x.trim() !== '' && !isNaN(Number(x)); module.exports = (s) => p(s).map((r) => r.length === 3 && r.every(num));" },
      { path: "collect.js", dependsOn: ["validate.js"], contract: "Require ./validate.js (string -> boolean[]). Export (s) = { validCount, invalidCount } counting the true/false flags.", ref: "const v = require('./validate.js'); module.exports = (s) => { const flags = v(s); return { validCount: flags.filter(Boolean).length, invalidCount: flags.filter((x) => !x).length }; };" },
      { path: "report.js", dependsOn: ["collect.js"], contract: "Require ./collect.js. Export (s) = collect(s).", ref: "const c = require('./collect.js'); module.exports = (s) => c(s);" },
    ],
    test: (f: any) => jeq(f("1,2,3;4,x,6"), { validCount: 1, invalidCount: 1 }) && jeq(f("1,2;1,2,3"), { validCount: 1, invalidCount: 1 }) && jeq(f("1,2,3"), { validCount: 1, invalidCount: 0 }) },
  { id: "range-clamp-pipeline", family: "D-contracts",
    files: [
      { path: "parse.js", contract: PARSE_NUMS_SPEC, ref: PARSE_NUMS_REF },
      { path: "clamp.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the array where each value is clamped into [0,100] (below 0 -> 0, above 100 -> 100).", ref: "const p = require('./parse.js'); module.exports = (s) => p(s).map((n) => Math.max(0, Math.min(100, n)));" },
      { path: "flagged.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the count of values that were OUT of [0,100] (strictly < 0 or strictly > 100; the boundaries 0 and 100 are NOT flagged).", ref: "const p = require('./parse.js'); module.exports = (s) => p(s).filter((n) => n < 0 || n > 100).length;" },
      { path: "report.js", dependsOn: ["clamp.js", "flagged.js"], contract: "Require ./clamp.js and ./flagged.js. Export (s) = { clamped, flaggedCount }.", ref: "const c = require('./clamp.js'); const f = require('./flagged.js'); module.exports = (s) => ({ clamped: c(s), flaggedCount: f(s) });" },
    ],
    test: (f: any) => jeq(f("-5,50,150"), { clamped: [0, 50, 100], flaggedCount: 2 }) && jeq(f("10,20"), { clamped: [10, 20], flaggedCount: 0 }) && jeq(f("0,100"), { clamped: [0, 100], flaggedCount: 0 }) },
  { id: "temperature-pipeline", family: "D-contracts",
    files: [
      { path: "parse.js", contract: PARSE_NUMS_SPEC + " (these are Celsius temperatures)", ref: PARSE_NUMS_REF },
      { path: "tof.js", dependsOn: ["parse.js"], contract: "Require ./parse.js. Export (s) = the array of Fahrenheit values (each Celsius c -> c*9/5+32).", ref: "const p = require('./parse.js'); module.exports = (s) => p(s).map((c) => c * 9 / 5 + 32);" },
      { path: "hot.js", dependsOn: ["tof.js"], contract: "Require ./tof.js (string -> Fahrenheit[]). Export (s) = the count of values STRICTLY above 90 (Fahrenheit).", ref: "const f = require('./tof.js'); module.exports = (s) => f(s).filter((t) => t > 90).length;" },
      { path: "report.js", dependsOn: ["tof.js", "hot.js"], contract: "Require ./tof.js and ./hot.js. Export (s) = { fahrenheit, hotCount }.", ref: "const f = require('./tof.js'); const h = require('./hot.js'); module.exports = (s) => ({ fahrenheit: f(s), hotCount: h(s) });" },
    ],
    test: (f: any) => jeq(f("0,10,35,40"), { fahrenheit: [32, 50, 95, 104], hotCount: 2 }) && jeq(f("20"), { fahrenheit: [68], hotCount: 0 }) },
];

module.exports = { HARD_TASKS };

export {};
