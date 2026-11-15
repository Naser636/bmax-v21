#!/usr/bin/env node
"use strict";
/* IMP-P12-STREAM-REF — streaming reference; idempotent dedup testable; runtime REJECTED. */
const S = require("./odg-streaming-reference.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const ref = S.reference();
  check("patterns present (exactly-once/idempotent/event-time/backpressure)", ref.patterns.length === 4 && ref.patterns.some((p: any) => p.key === "exactly-once") && ref.patterns.some((p: any) => p.key === "event-time"));
  check("runtime REJECTED/OWNER_GATED (ODG not a stream processor)", ref.runtime.status === "REJECTED" && /not a stream processor/i.test(ref.runtime.reason));

  const seen = new Set();
  const r1 = S.dedupByKey([{ key: "a" }, { key: "b" }, { key: "a" }], seen);
  check("idempotent-sink pattern: repeated key dropped (a,b kept; dup a)", r1.keptCount === 2 && r1.duplicateCount === 1);
  const r2 = S.dedupByKey([{ key: "a" }], seen);
  check("idempotency across window: already-seen key dropped", r2.keptCount === 0 && r2.duplicateCount === 1);
  check("no idempotency key ⇒ dropped (never silently kept)", S.dedupByKey([{ val: 1 }], new Set()).duplicateCount === 1);

  check("contract + honesty (reference only; runtime rejected)", S.STREAMING_REFERENCE_CONTRACT.invariants.some((i: string) => /reference\/method ONLY/.test(i)) && /REJECTED\/OWNER_GATED/.test(ref.honesty));
  check("deterministic", JSON.stringify(S.dedupByKey([{ key: "x" }], new Set())) === JSON.stringify(S.dedupByKey([{ key: "x" }], new Set())));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — streaming-reference (IMP-P12: patterns + testable idempotent dedup; real streaming runtime REJECTED/OWNER_GATED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
