/*
 * health faultInjected() — DEFAULT INACTIVE, local-file only, auto-expiring, release-scoped. Proves the live-test
 * trigger is safe: no flag ⇒ healthy; future-expiry ⇒ fault; expired/malformed ⇒ healthy (self-heals). cwd-scoped.
 * Run: node_modules/.bin/tsx src/runtime/health-fault-injection.test.ts
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { faultInjected } from "../app/api/health/route";

let failures = 0;
function check(c: boolean, label: string): void { if (c) { console.log(`  PASS ${label}`); } else { failures++; console.log(`  FAIL ${label}`); } }

const prevCwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "health-fault-"));
process.chdir(dir);
try {
  console.log("health faultInjected — default-inactive + expiry");
  check(faultInjected() === false, "no flag file ⇒ NOT injected (default inactive)");
  writeFileSync(join(dir, ".health-fault"), String(Date.now() + 60000)); // 60s in the future
  check(faultInjected() === true, "future-expiry flag ⇒ injected (fault active)");
  check(faultInjected(Date.now() + 120000) === false, "past the expiry ⇒ NOT injected (auto-heals)");
  writeFileSync(join(dir, ".health-fault"), "not-a-number");
  check(faultInjected() === false, "malformed flag ⇒ NOT injected (never a fabricated fault)");
  rmSync(join(dir, ".health-fault"));
  check(faultInjected() === false, "flag removed ⇒ NOT injected (cleanup effective)");
} finally {
  process.chdir(prevCwd);
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS — health faultInjected");
if (failures) process.exit(1);
