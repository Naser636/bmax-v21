#!/usr/bin/env node
"use strict";
/* V137 seed — scripts/odg-recover.sh EXHAUSTION battery (locks the mitigations behind the HIGH P7-SRE FMEA residual
 * "recovery loop cannot recover"). Runs the REAL bash script hermetically against stubs (curl / systemctl / odg-release.sh
 * all injected; a private ODG_RELEASE_ROOT) and proves the recovery path is BOUNDED and FAIL-CLOSED on every terminal state:
 *   RECOVERED(health 200)=exit 0 · ROLLBACK_REFUSED=exit 2 · RECOVERY_UNHEALTHY=exit 2 · CAP_EXCEEDED=exit 3 (STOP, no loop,
 *   and NO rollback attempted once capped) · the loop is bounded (the MAX+1-th invocation in-window is capped).
 * This is the regression that prevents a future edit from silently removing the attempt-cap (which would re-open the loop). */
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "odg-recover.sh");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function sandbox(): any {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-recover-sh-"));
  fs.mkdirSync(path.join(sb, "bin")); fs.mkdirSync(path.join(sb, "repo", "scripts"), { recursive: true }); fs.mkdirSync(path.join(sb, "releases"));
  fs.writeFileSync(path.join(sb, "bin", "curl"), '#!/bin/bash\necho "${ODG_TEST_HTTP_CODE:-200}"\n'); fs.chmodSync(path.join(sb, "bin", "curl"), 0o755);
  fs.writeFileSync(path.join(sb, "repo", "scripts", "odg-release.sh"), '#!/bin/bash\nexit "${ODG_TEST_ROLLBACK_EXIT:-0}"\n'); fs.chmodSync(path.join(sb, "repo", "scripts", "odg-release.sh"), 0o755);
  return sb;
}
function run(sb: string, extra: any): any {
  const env = Object.assign({}, process.env, { PATH: path.join(sb, "bin") + ":" + process.env.PATH, ODG_REPO: path.join(sb, "repo"), ODG_RELEASE_ROOT: path.join(sb, "releases"), ODG_SYSTEMCTL: "true" }, extra);
  let code = 0, stderr = "";
  try { cp.execFileSync("bash", [SCRIPT], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }); }
  catch (e: any) { code = typeof e.status === "number" ? e.status : 1; stderr = String(e.stderr || ""); }
  const incFile = path.join(sb, "releases", "incidents.jsonl");
  const incidents = fs.existsSync(incFile) ? fs.readFileSync(incFile, "utf8").trim().split("\n").filter(Boolean).map((l: string) => JSON.parse(l)) : [];
  const lastResult = incidents.length ? incidents[incidents.length - 1].result : null;
  const rollbackCalled = fs.existsSync(path.join(sb, "releases", ".recover-attempts")); // an attempt is logged only AFTER the cap check passes
  return { code, incidents, lastResult, stderr };
}

function main() {
  if (!fs.existsSync(SCRIPT)) { check("scripts/odg-recover.sh present", false); process.stdout.write("\n1 FAIL\n"); process.exit(1); }

  // 1 — RECOVERED: rollback ok + health 200 ⇒ exit 0, incident RECOVERED
  { const sb = sandbox(); const r = run(sb, { ODG_TEST_ROLLBACK_EXIT: "0", ODG_TEST_HTTP_CODE: "200" });
    check("RECOVERED (rollback ok + health 200) ⇒ exit 0 + incident RECOVERED", r.code === 0 && r.lastResult === "RECOVERED"); }

  // 2 — ROLLBACK_REFUSED: rollback fails ⇒ exit 2 (fail-closed STOP), incident ROLLBACK_REFUSED, never a false success
  { const sb = sandbox(); const r = run(sb, { ODG_TEST_ROLLBACK_EXIT: "1", ODG_TEST_HTTP_CODE: "200" });
    check("ROLLBACK_REFUSED (no valid previous) ⇒ exit 2 + incident ROLLBACK_REFUSED (fail-closed, not RECOVERED)", r.code === 2 && r.lastResult === "ROLLBACK_REFUSED"); }

  // 3 — RECOVERY_UNHEALTHY: rollback ok but post-restart health != 200 ⇒ exit 2 (STOP, no loop), incident RECOVERY_UNHEALTHY
  { const sb = sandbox(); const r = run(sb, { ODG_TEST_ROLLBACK_EXIT: "0", ODG_TEST_HTTP_CODE: "503" });
    check("RECOVERY_UNHEALTHY (post-restart health 503) ⇒ exit 2 + incident RECOVERY_UNHEALTHY (no loop)", r.code === 2 && r.lastResult === "RECOVERY_UNHEALTHY"); }

  // 4 — CAP_EXCEEDED: MAX recent attempts already in-window ⇒ exit 3 STOP, incident CAP_EXCEEDED, and NO rollback attempted
  //     (the cap check short-circuits BEFORE the rollback — this is what makes "recovery loop cannot recover" bounded).
  { const sb = sandbox(); const now = Math.floor(Date.now() / 1000);
    fs.writeFileSync(path.join(sb, "releases", ".recover-attempts"), now + "\n" + now + "\n");
    const r = run(sb, { ODG_RECOVER_MAX: "2", ODG_TEST_ROLLBACK_EXIT: "1" /* would fail IF reached */, ODG_TEST_HTTP_CODE: "200" });
    check("CAP_EXCEEDED (≥MAX recoveries in window) ⇒ exit 3 + incident CAP_EXCEEDED (STOP, manual intervention)", r.code === 3 && r.lastResult === "CAP_EXCEEDED");
    check("CAP_EXCEEDED short-circuits BEFORE rollback (recovery cannot loop) — only the CAP incident, no ROLLBACK/RECOVERED", r.incidents.length === 1 && r.incidents[0].result === "CAP_EXCEEDED"); }

  // 5 — the loop is BOUNDED end-to-end: with MAX=2, invocations 1&2 proceed, the 3rd in-window is CAP_EXCEEDED (exit 3).
  { const sb = sandbox();
    const a = run(sb, { ODG_RECOVER_MAX: "2", ODG_TEST_ROLLBACK_EXIT: "0", ODG_TEST_HTTP_CODE: "200" });
    const b = run(sb, { ODG_RECOVER_MAX: "2", ODG_TEST_ROLLBACK_EXIT: "0", ODG_TEST_HTTP_CODE: "200" });
    const c = run(sb, { ODG_RECOVER_MAX: "2", ODG_TEST_ROLLBACK_EXIT: "0", ODG_TEST_HTTP_CODE: "200" });
    check("loop BOUNDED: invocations 1&2 RECOVER (exit 0), the 3rd in-window is CAP_EXCEEDED (exit 3) — cannot run unbounded", a.code === 0 && b.code === 0 && c.code === 3 && c.lastResult === "CAP_EXCEEDED"); }

  // 6 — every terminal state records an incident (failure is NEVER masked / silently accepted)
  { const sb = sandbox(); const r = run(sb, { ODG_TEST_ROLLBACK_EXIT: "1" });
    check("failure NEVER masked: a terminal incident is always recorded (even on STOP)", r.incidents.length >= 1 && typeof r.lastResult === "string"); }

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-recover.sh exhaustion (bounded + fail-closed: CAP_EXCEEDED/ROLLBACK_REFUSED/RECOVERY_UNHEALTHY all STOP, loop bounded, no failure masked)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
