#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V40 LOT L — SIMPLE calibration corpus. 20 DISTINCT functional tasks (distinct contracts + tests) sharing one
 * structural TEMPLATE (a helper primitive + a consumer that composes it) — a correlated FAMILY, reported honestly. The
 * difficulty rises so real failures arise from task difficulty (never fabricated). Each `test(mainExport)` is the
 * INDEPENDENT functional check. Exported for both the runner and the corpus-soundness validator.
 */

const SIMPLE_TASKS: any[] = [
  { id: "sum-list", helper: "module.exports = (a, b) => a + b;  // add two numbers", main: "const add = require('./helper.js'); module.exports = (arr) => arr.reduce((acc, x) => add(acc, x), 0);  // sum of an array", test: (f: any) => f([1,2,3,4]) === 10 && f([]) === 0 },
  { id: "product-list", helper: "module.exports = (a, b) => a * b;  // multiply two numbers", main: "const mul = require('./helper.js'); module.exports = (arr) => arr.reduce((acc, x) => mul(acc, x), 1);  // product of an array", test: (f: any) => f([1,2,3,4]) === 24 && f([5]) === 5 },
  { id: "max-list", helper: "module.exports = (a, b) => (a > b ? a : b);  // the larger of two numbers", main: "const max2 = require('./helper.js'); module.exports = (arr) => arr.reduce((acc, x) => max2(acc, x));  // the maximum of a non-empty array", test: (f: any) => f([3,7,2,9,1]) === 9 && f([4]) === 4 },
  { id: "min-list", helper: "module.exports = (a, b) => (a < b ? a : b);  // the smaller of two numbers", main: "const min2 = require('./helper.js'); module.exports = (arr) => arr.reduce((acc, x) => min2(acc, x));  // the minimum of a non-empty array", test: (f: any) => f([3,7,2,9,1]) === 1 && f([4]) === 4 },
  { id: "count-even", helper: "module.exports = (n) => n % 2 === 0;  // true if n is even", main: "const isEven = require('./helper.js'); module.exports = (arr) => arr.filter(isEven).length;  // how many elements are even", test: (f: any) => f([1,2,3,4,5,6]) === 3 && f([1,3,5]) === 0 },
  { id: "sum-squares", helper: "module.exports = (n) => n * n;  // the square of n", main: "const sq = require('./helper.js'); module.exports = (arr) => arr.map(sq).reduce((a, b) => a + b, 0);  // sum of squares", test: (f: any) => f([1,2,3]) === 14 && f([]) === 0 },
  { id: "average", helper: "module.exports = (arr) => arr.reduce((a, b) => a + b, 0);  // the sum of an array", main: "const sum = require('./helper.js'); module.exports = (arr) => sum(arr) / arr.length;  // arithmetic mean of a non-empty array", test: (f: any) => f([2,4,6]) === 4 && f([10]) === 10 },
  { id: "celsius-to-f", helper: "module.exports = (c) => c * 9 / 5;  // scale celsius", main: "const scale = require('./helper.js'); module.exports = (c) => scale(c) + 32;  // celsius to fahrenheit", test: (f: any) => f(0) === 32 && f(100) === 212 },
  { id: "clamp", helper: "module.exports = (x, lo, hi) => Math.min(Math.max(x, lo), hi);  // clamp x into [lo,hi]", main: "const clamp = require('./helper.js'); module.exports = (x) => clamp(x, 0, 10);  // clamp into [0,10]", test: (f: any) => f(-5) === 0 && f(5) === 5 && f(15) === 10 },
  { id: "digit-sum", helper: "module.exports = (n) => n % 10;  // the last decimal digit of n", main: "const lastDigit = require('./helper.js'); module.exports = (n) => { let s = 0; n = Math.abs(n); while (n > 0) { s += lastDigit(n); n = Math.floor(n / 10); } return s; };  // sum of decimal digits", test: (f: any) => f(123) === 6 && f(9999) === 36 && f(0) === 0 },
  { id: "factorial", helper: "module.exports = (a, b) => a * b;  // multiply two numbers", main: "const mul = require('./helper.js'); module.exports = (n) => { let r = 1; for (let i = 2; i <= n; i++) r = mul(r, i); return r; };  // n! (0! = 1)", test: (f: any) => f(0) === 1 && f(5) === 120 && f(1) === 1 },
  { id: "nth-fibonacci", helper: "module.exports = (a, b) => a + b;  // add two numbers", main: "const add = require('./helper.js'); module.exports = (n) => { let a = 0, b = 1; for (let i = 0; i < n; i++) { const t = add(a, b); a = b; b = t; } return a; };  // the nth Fibonacci number, fib(0)=0, fib(1)=1", test: (f: any) => f(0) === 0 && f(1) === 1 && f(7) === 13 },
  { id: "gcd", helper: "module.exports = (a, b) => a % b;  // remainder of a divided by b", main: "const mod = require('./helper.js'); module.exports = (a, b) => { while (b !== 0) { const r = mod(a, b); a = b; b = r; } return a; };  // greatest common divisor (Euclid)", test: (f: any) => f(12, 8) === 4 && f(17, 5) === 1 && f(100, 10) === 10 },
  { id: "is-prime", helper: "module.exports = (n, d) => n % d === 0;  // true if n is divisible by d", main: "const divisible = require('./helper.js'); module.exports = (n) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (divisible(n, d)) return false; return true; };  // true if n is prime", test: (f: any) => f(2) === true && f(17) === true && f(18) === false && f(1) === false },
  { id: "reverse-string", helper: "module.exports = (s) => s.split('');  // split a string into an array of characters", main: "const chars = require('./helper.js'); module.exports = (s) => chars(s).reverse().join('');  // the reversed string", test: (f: any) => f("abc") === "cba" && f("") === "" },
  { id: "count-vowels", helper: "module.exports = (c) => 'aeiou'.indexOf(c.toLowerCase()) >= 0;  // true if c is a vowel", main: "const isVowel = require('./helper.js'); module.exports = (s) => s.split('').filter(isVowel).length;  // how many vowels in the string", test: (f: any) => f("hello") === 2 && f("xyz") === 0 && f("AEIOU") === 5 },
  { id: "is-palindrome", helper: "module.exports = (s) => s.split('').reverse().join('');  // the reversed string", main: "const rev = require('./helper.js'); module.exports = (s) => s === rev(s);  // true if s reads the same backwards", test: (f: any) => f("level") === true && f("abc") === false && f("") === true },
  { id: "title-case", helper: "module.exports = (w) => w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;  // capitalise one word", main: "const cap = require('./helper.js'); module.exports = (s) => s.split(' ').map(cap).join(' ');  // Title Case each word", test: (f: any) => f("hello world") === "Hello World" && f("ABC def") === "Abc Def" },
  { id: "decimal-to-binary", helper: "module.exports = (n) => n % 2;  // the least-significant bit of n", main: "const bit = require('./helper.js'); module.exports = (n) => { if (n === 0) return '0'; let s = ''; while (n > 0) { s = bit(n) + s; n = Math.floor(n / 2); } return s; };  // binary string of a non-negative integer", test: (f: any) => f(0) === "0" && f(5) === "101" && f(10) === "1010" },
  { id: "run-length-encode", helper: "module.exports = (ch, count) => ch + count;  // a char followed by its run length", main: "const enc = require('./helper.js'); module.exports = (s) => { let out = '', i = 0; while (i < s.length) { let j = i; while (j < s.length && s[j] === s[i]) j++; out += enc(s[i], j - i); i = j; } return out; };  // run-length encode, e.g. 'aaab' -> 'a3b1'", test: (f: any) => f("aaab") === "a3b1" && f("abc") === "a1b1c1" && f("") === "" },
];

module.exports = { SIMPLE_TASKS };

export {};
