#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V41 LOT N — COMPLEX calibration corpus. 8 DISTINCT 4-file projects, each a real interdependent DAG:
 *   parse.js  (string -> structured data)
 *   a.js, b.js (two DIFFERENT metrics, each dependsOn parse.js — a shared interface)
 *   report.js (combines a + b, dependsOn both)
 * The computations differ substantially across tasks (numbers / words / chars; sum/max/min/count/mean/range/parity/sign);
 * each test includes an edge case. They share the DAG SHAPE (reported honestly as a structural family), not a repeated
 * function. Exported for both the duel runner and the corpus-soundness validator.
 */

function numParse(): string { return "module.exports = (s) => String(s).split(',').map((x) => Number(x));  // comma string -> array of numbers"; }

const COMPLEX_TASKS: any[] = [
  { id: "sum-max",
    parse: numParse(),
    a: "const parse = require('./parse.js'); module.exports = (s) => parse(s).reduce((x, y) => x + y, 0);  // sum",
    b: "const parse = require('./parse.js'); module.exports = (s) => parse(s).reduce((x, y) => (x > y ? x : y));  // max of a non-empty list",
    report: "const a = require('./a.js'); const b = require('./b.js'); module.exports = (s) => ({ sum: a(s), max: b(s) });",
    test: (f: any) => { const r = f("1,2,3"); const e = f("5"); return r && r.sum === 6 && r.max === 3 && e.sum === 5 && e.max === 5; } },
  { id: "min-count",
    parse: numParse(),
    a: "const parse = require('./parse.js'); module.exports = (s) => parse(s).reduce((x, y) => (x < y ? x : y));  // min of a non-empty list",
    b: "const parse = require('./parse.js'); module.exports = (s) => parse(s).length;  // how many numbers",
    report: "const a = require('./a.js'); const b = require('./b.js'); module.exports = (s) => ({ min: a(s), count: b(s) });",
    test: (f: any) => { const r = f("3,1,2"); const e = f("7"); return r && r.min === 1 && r.count === 3 && e.min === 7 && e.count === 1; } },
  { id: "mean-range",
    parse: numParse(),
    a: "const parse = require('./parse.js'); module.exports = (s) => { const xs = parse(s); return xs.reduce((p, q) => p + q, 0) / xs.length; };  // arithmetic mean",
    b: "const parse = require('./parse.js'); module.exports = (s) => { const xs = parse(s); return Math.max.apply(null, xs) - Math.min.apply(null, xs); };  // range = max - min",
    report: "const a = require('./a.js'); const b = require('./b.js'); module.exports = (s) => ({ mean: a(s), range: b(s) });",
    test: (f: any) => { const r = f("2,4,6"); const e = f("5"); return r && r.mean === 4 && r.range === 4 && e.mean === 5 && e.range === 0; } },
  { id: "evensum-oddsum",
    parse: numParse(),
    a: "const parse = require('./parse.js'); module.exports = (s) => parse(s).filter((n) => n % 2 === 0).reduce((x, y) => x + y, 0);  // sum of even numbers",
    b: "const parse = require('./parse.js'); module.exports = (s) => parse(s).filter((n) => n % 2 !== 0).reduce((x, y) => x + y, 0);  // sum of odd numbers",
    report: "const a = require('./a.js'); const b = require('./b.js'); module.exports = (s) => ({ evenSum: a(s), oddSum: b(s) });",
    test: (f: any) => { const r = f("1,2,3,4"); const e = f("2,4"); return r && r.evenSum === 6 && r.oddSum === 4 && e.evenSum === 6 && e.oddSum === 0; } },
  { id: "pos-neg",
    parse: numParse(),
    a: "const parse = require('./parse.js'); module.exports = (s) => parse(s).filter((n) => n > 0).length;  // count of positive numbers",
    b: "const parse = require('./parse.js'); module.exports = (s) => parse(s).filter((n) => n < 0).length;  // count of negative numbers",
    report: "const a = require('./a.js'); const b = require('./b.js'); module.exports = (s) => ({ positives: a(s), negatives: b(s) });",
    test: (f: any) => { const r = f("-1,2,-3,4"); const e = f("0,0"); return r && r.positives === 2 && r.negatives === 2 && e.positives === 0 && e.negatives === 0; } },
  { id: "first-last",
    parse: numParse(),
    a: "const parse = require('./parse.js'); module.exports = (s) => { const xs = parse(s); return xs[0]; };  // first element",
    b: "const parse = require('./parse.js'); module.exports = (s) => { const xs = parse(s); return xs[xs.length - 1]; };  // last element",
    report: "const a = require('./a.js'); const b = require('./b.js'); module.exports = (s) => ({ first: a(s), last: b(s) });",
    test: (f: any) => { const r = f("5,6,7"); const e = f("9"); return r && r.first === 5 && r.last === 7 && e.first === 9 && e.last === 9; } },
  { id: "word-count-longest",
    parse: "module.exports = (s) => String(s).split(' ').filter((w) => w.length > 0);  // split a sentence into words",
    a: "const parse = require('./parse.js'); module.exports = (s) => parse(s).length;  // number of words",
    b: "const parse = require('./parse.js'); module.exports = (s) => parse(s).reduce((x, y) => (y.length > x.length ? y : x));  // the longest word",
    report: "const a = require('./a.js'); const b = require('./b.js'); module.exports = (s) => ({ words: a(s), longest: b(s) });",
    test: (f: any) => { const r = f("ab c def"); const e = f("hello"); return r && r.words === 3 && r.longest === "def" && e.words === 1 && e.longest === "hello"; } },
  { id: "vowel-consonant",
    parse: "module.exports = (s) => String(s).toLowerCase().split('').filter((c) => c >= 'a' && c <= 'z');  // letters of a string (lowercased)",
    a: "const parse = require('./parse.js'); module.exports = (s) => parse(s).filter((c) => 'aeiou'.indexOf(c) >= 0).length;  // number of vowels",
    b: "const parse = require('./parse.js'); module.exports = (s) => parse(s).filter((c) => 'aeiou'.indexOf(c) < 0).length;  // number of consonants",
    report: "const a = require('./a.js'); const b = require('./b.js'); module.exports = (s) => ({ vowels: a(s), consonants: b(s) });",
    test: (f: any) => { const r = f("Hello"); const e = f("xyz"); return r && r.vowels === 2 && r.consonants === 3 && e.vowels === 0 && e.consonants === 3; } },
];

module.exports = { COMPLEX_TASKS };

export {};
