#!/usr/bin/env node
// @ts-nocheck — runs under tsx. canon-deep (V17.5 security fix): sorted keys at EVERY depth, nothing silently dropped,
// JSON primitive semantics, fail-closed on cycles/BigInt. Also pins the DEFECT of the legacy shallow canon.
"use strict";
const assert = require("assert");
const C = require("./canon-deep.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

ok("DEFECT pinned: legacy shallow canon DROPS nested keys absent at top level", C.canonLegacyShallow({ a: { secret: 1 } }) === '{"a":{}}');
ok("deep canon keeps nested keys", C.canonDeep({ a: { secret: 1 } }) === '{"a":{"secret":1}}');
ok("keys sorted at every depth", C.canonDeep({ b: { y: 1, x: [{ d: 1, c: 2 }] }, a: 0 }) === '{"a":0,"b":{"x":[{"c":2,"d":1}],"y":1}}');
ok("array order preserved", C.canonDeep([3, 1, 2]) === "[3,1,2]");
ok("output is valid JSON equal (deep) to the input data", JSON.stringify(JSON.parse(C.canonDeep({ z: [1, { q: "s" }], a: null }))) === JSON.stringify({ a: null, z: [1, { q: "s" }] }));
ok("primitives as JSON.stringify (string escaping, NaN⇒null)", C.canonDeep("a\"b") === JSON.stringify("a\"b") && C.canonDeep(NaN) === "null" && C.canonDeep(true) === "true" && C.canonDeep(null) === "null");
ok("undefined object members omitted; array undefined ⇒ null (JSON semantics)", C.canonDeep({ a: undefined, b: 1 }) === '{"b":1}' && C.canonDeep([undefined]) === "[null]");
ok("toJSON honoured (Date ⇒ ISO string)", C.canonDeep({ d: new Date(0) }) === '{"d":"1970-01-01T00:00:00.000Z"}');
ok("cycle ⇒ throws (fail-closed)", (() => { const o = {}; o.o = o; try { C.canonDeep(o); return false; } catch { return true; } })());
ok("BigInt ⇒ throws (fail-closed)", (() => { try { C.canonDeep({ n: 1n }); return false; } catch { return true; } })());
ok("shared (non-cyclic) sub-object serialized twice, not mistaken for a cycle", C.canonDeep((() => { const s = { k: 1 }; return { a: s, b: s }; })()) === '{"a":{"k":1},"b":{"k":1}}');
ok("legacy shallow canon matches the historical audit-log serializer on flat objects", C.canonLegacyShallow({ b: 1, a: 2 }) === '{"a":2,"b":1}' && C.canonLegacyShallow(42) === "42");

console.log(`\nCANON-DEEP suite — ${pass} assertions passed.`);
