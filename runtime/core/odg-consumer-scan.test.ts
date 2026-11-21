#!/usr/bin/env node
"use strict";
/* Tests for odg-consumer-scan — the shared IMPORT-reference scan. Proves it matches real require forms (path / path.join /
 * call-arg indirection) and REJECTS bare data-string mentions, so coverage/cycle neither inflate CONNECTED nor false-flag
 * a real r("name") consumer. Deterministic, zero fs. */
const M = require("./odg-consumer-scan.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const ref = M.referencesModule;
  // real import forms ⇒ match
  check("path form with .js", ref('require("../core/frontier-radar.js")', "frontier-radar"));
  check("path form without ext", ref('require("../core/frontier-radar")', "frontier-radar"));
  check("path.join segment", ref('require(path.join(ROOT,"runtime","core","odg-v360-compass.js"))', "odg-v360-compass"));
  check("call-arg indirection r(\"name\")", ref('const x = r("odg-native-learning-pass");', "odg-native-learning-pass"));
  check("call-arg require(\"name\")", ref('require("odg-system-coverage")', "odg-system-coverage"));

  // bare data-string mentions ⇒ NO match (would inflate CONNECTED / hide orphans)
  check("data array element (bracket) rejected", ref('P2: ["agent-governance-harness", "intelligence-loop"]', "agent-governance-harness") === false);
  check("data array second element (comma) rejected", ref('P2: ["agent-governance-harness", "intelligence-loop"]', "intelligence-loop") === false);
  check("bare quoted id rejected", ref('const id = "campaign-engine";', "campaign-engine") === false);
  // a NON-require data-registry CALL (path-string builder) ⇒ NO match (independent-inspection fix: callee must be a require alias)
  check("non-require call M(\"name\") rejected (path-builder, not a consumer)", ref('const M=(p)=>"runtime/core/"+p+".ts"; M("capability-attribution")', "capability-attribution") === false);
  check("arbitrary call foo(\"name\") rejected", ref('foo("market-intelligence")', "market-intelligence") === false);
  check("require-alias import(\"name\") accepted", ref('const x = import("engineering-executor")', "engineering-executor") === true);

  // substring safety ⇒ NO match
  check("substring path not matched (frontier-radar vs frontier-radar-store)", ref('require("../core/frontier-radar-store.js")', "frontier-radar") === false);
  check("substring call-arg not matched", ref('r("frontier-radar-store")', "frontier-radar") === false);

  // mergeConsumers: core graph + scanned import refs; test consumers ignored by hasConsumer
  const graph = { modules: ["a", "b", "c"], consumers: { a: ["b"], b: [], c: [] } };
  const scanned = [
    { consumer: "bin:run", src: 'require("../core/b.js")' },         // b now consumed by a bin
    { consumer: "bin:demo", src: 'const x = r("c");' },              // c consumed via indirection
    { consumer: "app:page", src: 'const ids = ["a"];' },             // bare mention of a ⇒ NOT a consumer
  ];
  const mm = M.mergeConsumers(graph, scanned);
  check("merge: a CONNECTED (core consumer b)", mm.hasConsumer("a") === true);
  check("merge: b CONNECTED (bin import)", mm.hasConsumer("b") === true && mm.merged.b.indexOf("bin:run") >= 0);
  check("merge: c CONNECTED (r() indirection caught)", mm.hasConsumer("c") === true && mm.merged.c.indexOf("bin:demo") >= 0);
  check("merge: bare mention of a in app did NOT add app:page as consumer", mm.merged.a.indexOf("app:page") < 0);
  const mm2 = M.mergeConsumers({ modules: ["z"], consumers: { z: ["z.test"] } }, []);
  check("hasConsumer ignores a test-only consumer", mm2.hasConsumer("z") === false);
  // a REAL module whose name ends in -test (odg-ks-test, a statistical test) must NOT be treated as a test consumer.
  const mm3 = M.mergeConsumers({ modules: ["m", "odg-ks-test"], consumers: { m: ["odg-ks-test"], "odg-ks-test": [] } }, []);
  check("a -test-named real module counts as a consumer (odg-ks-test not dropped)", mm3.hasConsumer("m") === true);

  check("contract: matches real require forms, rejects bare mention + non-require call, catches r() indirection",
    /require-alias call/.test(JSON.stringify(M.CONSUMER_SCAN_CONTRACT.invariants)) &&
    /rejects a bare data-string/.test(JSON.stringify(M.CONSUMER_SCAN_CONTRACT.invariants)) &&
    /non-require data-registry call/.test(JSON.stringify(M.CONSUMER_SCAN_CONTRACT.invariants)) &&
    /r\(\\"name\\"\) indirection/.test(JSON.stringify(M.CONSUMER_SCAN_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-consumer-scan (shared IMPORT scan: matches path / path.join / r(\"name\") call-arg; REJECTS bare data-string mentions; merge ignores test consumers; the one place coverage + cycle share)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
