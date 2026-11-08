#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 17 (new-language-families — native alternative) — DOCKERFILE SECURITY LINTER. PURE, deterministic. Adds
 * Dockerfile as a checked "language family" via ODG's OWN linter (a subset of the security-critical hadolint rules)
 * WITHOUT downloading or executing a 3rd-party binary and WITHOUT sudo — the directive's endorsed alternative when an
 * external resource (hadolint binary install to /usr/local/bin) is owner-gated. Rules (security-first): DL3007 no
 * :latest base, DL3002 don't end as root USER, no `sudo` in RUN, DL3015 apt --no-install-recommends, DL3008 pin apt
 * versions, DL3020 prefer COPY over ADD for local files, and a hardcoded-secret-in-ENV/ARG check. Fail-closed:
 * findings are surfaced; HIGH findings ⇒ not clean. (Full hadolint parity still needs the owner-gated binary.) Dual export.
 */

function isStr(v: any): boolean { return typeof v === "string"; }
function lines(src: any): string[] { return isStr(src) ? src.split(/\r?\n/) : []; }

const SECRET_IN_ENV = /(?:API[_-]?KEY|SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE[_-]?KEY|AWS_SECRET|ghp_[0-9A-Za-z]{20,})/i;

/** lintDockerfile(src) -> { clean, highFindings, findings }. Each finding: {rule, severity, line, message}. */
function lintDockerfile(src: any): any {
  const ls = lines(src);
  const findings: any[] = [];
  const add = (rule: string, severity: string, line: number, message: string) => findings.push({ rule, severity, line, message });
  let lastUser: string | null = null; let lastUserLine = 0;
  let sawInstruction = false;

  for (let i = 0; i < ls.length; i++) {
    const raw = ls[i]; const line = i + 1;
    const t = raw.trim(); if (t === "" || t.startsWith("#")) continue;
    sawInstruction = true;
    const up = t.toUpperCase();

    if (up.startsWith("FROM ")) {
      const img = t.slice(5).trim().split(/\s+/)[0];
      if (/:latest$/i.test(img) || !/[:@]/.test(img)) add("DL3007", "HIGH", line, `base image '${img}' is unpinned (:latest or no tag) — pin a specific version/digest`);
    }
    if (up.startsWith("USER ")) { lastUser = t.slice(5).trim(); lastUserLine = line; }
    if (/\bsudo\b/.test(t) && up.startsWith("RUN")) add("NO-SUDO", "HIGH", line, "do not use `sudo` in a Dockerfile RUN (the build runs as root; sudo adds risk)");
    if (/\bapt-get\s+install\b/.test(t) && !/--no-install-recommends/.test(t)) add("DL3015", "MEDIUM", line, "apt-get install without --no-install-recommends (bloats image / extra surface)");
    if (/\bapt-get\s+install\b/.test(t) && !/=[\w.\-+~:]+/.test(t)) add("DL3008", "MEDIUM", line, "apt-get install without pinned versions (package=version) — unreproducible");
    if (up.startsWith("ADD ") && !/^ADD\s+https?:\/\//i.test(t)) add("DL3020", "MEDIUM", line, "use COPY instead of ADD for local files (ADD has surprising extract/remote semantics)");
    if ((up.startsWith("ENV ") || up.startsWith("ARG ")) && SECRET_IN_ENV.test(t)) add("SECRET-IN-ENV", "HIGH", line, "a secret-like name in ENV/ARG — do not bake secrets into image layers (use build secrets / runtime injection)");
  }
  // DL3002: the final USER should not be root (drop privileges).
  if (sawInstruction && (lastUser === null || lastUser.toLowerCase() === "root" || lastUser === "0")) {
    add("DL3002", "HIGH", lastUserLine || 0, lastUser === null ? "no USER instruction — container runs as root; add a non-root USER" : "the last USER is root — drop to a non-root user");
  }
  const highFindings = findings.filter((f) => f.severity === "HIGH").length;
  return Object.freeze({ clean: highFindings === 0, highFindings, findingCount: findings.length, findings: Object.freeze(findings), note: "native Dockerfile security lint (subset of hadolint); HIGH findings ⇒ not clean; full hadolint parity needs the owner-gated binary" });
}

const DOCKERFILE_LINT_CONTRACT = Object.freeze({
  id: "V124-DOCKERFILE-LINT",
  source: "SÉRIE 17 — native Dockerfile security linter (new-language-families alternative; no external binary, no sudo)",
  rules: Object.freeze(["DL3007 pin base", "DL3002 non-root USER", "NO-SUDO", "DL3015 --no-install-recommends", "DL3008 pin apt versions", "DL3020 COPY over ADD", "SECRET-IN-ENV"]),
  notAuthority: "a native security-first Dockerfile lint; NOT full hadolint parity (which needs the owner-gated 3rd-party binary)",
  invariants: Object.freeze([
    "pure/deterministic; no 3rd-party binary downloaded or executed; no sudo (the directive's alternative when the external resource is owner-gated)",
    "HIGH findings (unpinned base / root USER / sudo / secret-in-ENV) ⇒ not clean (fail-closed security-first)",
    "surfaces findings with rule + severity + line; a clean Dockerfile passes",
    "full hadolint parity remains owner-gated (binary install); this is the native security subset",
  ]),
});

module.exports = { lintDockerfile, DOCKERFILE_LINT_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...DOCKERFILE_LINT_CONTRACT, demo: lintDockerfile("FROM node:22.22.1\nRUN apt-get install -y --no-install-recommends curl=7.88.1-10\nCOPY . /app\nUSER app\n") }, null, 2) + "\n"); }

export {};
