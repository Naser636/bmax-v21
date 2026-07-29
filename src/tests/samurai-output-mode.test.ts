/*
 * Samurai / summary output-mode test (IMPLEMENT_SAMURAI_OUTPUT_MODE / IMPLEMENT_SUMMARY_OUTPUT_MODE).
 *
 * The pipeline driver runtime/bin/odg-run.js must, BY DEFAULT, print a compact one-line-per-stage
 * summary and tee every stage's full stdout/stderr to an artifact log under runtime/generated/logs/
 * — so the console stays a ~20-30 line summary while the full transcript is always preserved. Setting
 * ODG_VERBOSE=1 restores the historical behaviour (every stage streamed live via stdio:"inherit"),
 * matching the runtime's existing ODG_FLEET / ODG_CONTRACT_ON_DEMAND env-flag convention.
 *
 * This parses the real driver script and asserts:
 *   1. it gates on the ODG_VERBOSE env flag;
 *   2. summary mode captures each stage's transcript (encoding:"utf8") and appends it to a run-log
 *      artifact under runtime/generated/logs/;
 *   3. summary mode prints one compact result line per stage plus a pointer to the full log;
 *   4. verbose mode still streams every stage live via stdio:"inherit".
 */
import * as fs from "node:fs";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const driver = fs.readFileSync("runtime/bin/odg-run.js", "utf8");

// 1. Output mode is gated on the ODG_VERBOSE env flag (same convention as ODG_FLEET etc.).
check(
  /process\.env\.ODG_VERBOSE/.test(driver),
  "odg-run.js gates output mode on the ODG_VERBOSE env flag",
);

// 2. Summary mode captures each stage transcript and tees it to a run-log artifact.
check(
  /spawnSync\([^)]*encoding:\s*["']utf8["']/.test(driver),
  "summary mode captures stage output (spawnSync encoding:utf8) instead of only stdio:inherit",
);
check(
  /runtime\/generated\/logs/.test(driver) && /appendFileSync\(\s*RUN_LOG/.test(driver),
  "summary mode appends stage transcripts to a run-log under runtime/generated/logs/",
);

// 3. Summary mode prints a compact per-stage result line and a full-log pointer.
check(
  /OK\s+\(\$\{fmtDuration/.test(driver) || /padEnd\(\d+\)\)\s+OK/.test(driver),
  "summary mode prints a compact one-line-per-stage result",
);
check(
  /Full log/.test(driver),
  "summary mode points the operator at the full log artifact",
);

// 4. Verbose mode preserves the historical live-stream behaviour.
check(
  /if\s*\(\s*VERBOSE\s*\)[\s\S]*stdio:\s*["']inherit["']/.test(driver),
  "ODG_VERBOSE=1 restores stdio:inherit live streaming",
);

if (failures > 0) { console.error(`\nSamurai output mode: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nSamurai output mode OK");
