/*
 * MSE canonical-verification test (UNIFY_RUNTIME_VERIFICATION_PIPELINE).
 *
 * Regression guard for the duplicate verification logic that BLOCKED SELF_ENGINEERING_RUNTIME_KERNEL:
 * the MSE pre-flight used to run its own build/tsc via a mission-name `case` and write a SECOND,
 * diverging runtime/generated/runtime-verify.json. Its `S*` branch classified engineering missions
 * (SELF_ENGINEERING_*) as read-only and recorded build=false, silently overriding the canonical
 * verifier that the Validation Engine then read → build gate red → mission BLOCKED.
 *
 * The unified pipeline has ONE canonical verifier — runtime/bin/odg-verify.js — as the single source
 * of truth and the ONLY writer of runtime-verify.json. This test parses the real scripts and asserts:
 *   1. the MSE pre-flight INVOKES the canonical verifier;
 *   2. the MSE script no longer writes runtime-verify.json itself (no printf/redirect, no
 *      "mse pre-flight" source stamp, no build/tsc mission `case`);
 *   3. runtime/bin/odg-verify.js is still the writer of runtime-verify.json.
 */
import * as fs from "node:fs";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const mse = fs.readFileSync("runtime/bin/odg-local-pipeline.sh", "utf8");
const verifier = fs.readFileSync("runtime/bin/odg-verify.js", "utf8");

// 1. The pre-flight delegates to the canonical verifier.
check(
  /node\s+runtime\/bin\/odg-verify\.js/.test(mse),
  "mse pre-flight invokes the canonical verifier (node runtime/bin/odg-verify.js)",
);

// 2. The MSE script no longer produces its own verification file / logic.
check(
  !mse.includes("mse pre-flight"),
  'mse no longer stamps its own "mse pre-flight" source into runtime-verify.json',
);
check(
  !/>\s*runtime\/generated\/runtime-verify\.json/.test(mse),
  "mse no longer redirects/writes runtime-verify.json itself",
);
check(
  !/case\s+"\$MISSION"[\s\S]*(npm run build|tsc --noEmit)/.test(mse),
  "mse no longer re-implements build/tsc via a mission-name case",
);

// 3. The canonical verifier remains the writer of the evidence file.
check(
  /writeFileSync\(\s*["']runtime\/generated\/runtime-verify\.json/.test(verifier),
  "runtime/bin/odg-verify.js writes runtime/generated/runtime-verify.json",
);
check(
  verifier.includes("npm run build") && verifier.includes("tsc --noEmit"),
  "canonical verifier owns the build + typescript checks",
);

if (failures > 0) { console.error(`\nMSE canonical verify: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nMSE canonical verify OK");
