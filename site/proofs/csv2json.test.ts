import assert from "node:assert";
import { parseCsv } from "./csv2json";
let n = 0; const ok = (c: boolean, m: string) => { assert.ok(c, m); console.log("  ok -", m); n++; };

// 1. basic
let r = parseCsv("name,age\nAda,36\nGrace,45");
ok(r.length === 2 && r[0].name === "Ada" && r[1].age === "45", "basic rows + header mapping");
// 2. quoted field with embedded comma
r = parseCsv('name,note\n"Lovelace, Ada","first, programmer"');
ok(r[0].name === "Lovelace, Ada" && r[0].note === "first, programmer", "quoted embedded commas");
// 3. escaped quotes + embedded newline
r = parseCsv('q\n"she said ""hi""\nline2"');
ok(r[0].q === 'she said "hi"\nline2', "escaped quotes + embedded newline");
// 4. CRLF + BOM + trailing newline
r = parseCsv("﻿a,b\r\n1,2\r\n");
ok(r.length === 1 && r[0].a === "1" && r[0].b === "2", "CRLF + BOM + trailing newline");
// 5. ragged row ⇒ missing cells become ""
r = parseCsv("a,b,c\n1,2");
ok(r[0].c === "", "ragged row fills missing cell with empty string");
// 6. custom delimiter
r = parseCsv("a;b\n1;2", { delimiter: ";" });
ok(r[0].a === "1" && r[0].b === "2", "custom delimiter");
// 7. empty input
ok(parseCsv("").length === 0 && parseCsv("only,header").length === 0, "empty / header-only ⇒ []");

console.log(`\nCSV2JSON prototype — ${n} assertions passed.`);
