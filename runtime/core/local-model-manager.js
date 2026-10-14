#!/usr/bin/env node

/*
 * P9 — Local Model Manager.
 *
 * The "LLM local" tier: a thin, provider-agnostic abstraction over a locally-runnable model, so the
 * Router (P8) can use a local LLM before ever reaching external AI. The model itself is configured
 * out-of-band via the ODG_LOCAL_MODEL_CMD env var (a command that reads a prompt on stdin and writes
 * the completion to stdout) — e.g. a llama.cpp / ollama wrapper. No model binary is bundled.
 *
 * When nothing is configured, isAvailable() is false and complete() reports why, so the Router
 * cleanly falls through to external AI. This keeps the LLM strictly an EXECUTOR — the Runtime
 * decides whether/when to call it.
 *
 * SECURITY (η3-B124, HARDEN-LOCAL-MODEL-SANDBOX): complete() NEVER runs ODG_LOCAL_MODEL_CMD through a
 * shell. The configured command is parsed into argv (no shell interpretation) and executed inside a
 * provider-confined bubblewrap sandbox (no network, cleared env, minimal read-only filesystem,
 * controlled tmpfs work dir) via runtime/core/provider-sandbox.js. If the sandbox cannot be
 * established the call is REFUSED — there is no unsandboxed fallback. Optional isolation config is
 * read from the environment (model-files / extra ro-binds / env-allowlist) or passed via opts.
 */

"use strict";

const providerSandbox = require("./provider-sandbox");

// Read config fresh each call so the environment (and tests) can toggle availability at runtime.
function command() {
    const cmd = process.env.ODG_LOCAL_MODEL_CMD;
    return typeof cmd === "string" && cmd.trim() ? cmd.trim() : null;
}

function isAvailable() {
    return command() !== null;
}

function describe() {
    return { available: isAvailable(), command: command() };
}

// Parse a ':'-separated absolute-path allowlist from an env var (empty => []).
function pathListFromEnv(name) {
    const raw = process.env[name];
    if (typeof raw !== "string" || !raw.trim()) return [];
    return raw.split(":").map((s) => s.trim()).filter(Boolean);
}

// Parse a ','-separated env-var-name allowlist (empty => []). Default: NONE (no parent secret
// crosses into the sandbox). Only names listed here are re-injected, and only if present.
function envAllowFromEnv() {
    const raw = process.env.ODG_LOCAL_MODEL_ENV_ALLOW;
    if (typeof raw !== "string" || !raw.trim()) return [];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// Run the configured local model as an executor, strictly inside the provider sandbox.
// Returns { ok, text } or { ok:false, reason, refused }.
function complete(prompt, opts) {
    const cmd = command();
    if (!cmd) return { ok: false, reason: "no local model configured (set ODG_LOCAL_MODEL_CMD)" };
    const options = opts || {};
    const res = providerSandbox.runProvider(prompt, {
        command: cmd,
        modelFiles: options.modelFiles || pathListFromEnv("ODG_LOCAL_MODEL_FILES"),
        roBinds: options.roBinds, // undefined => provider-sandbox default (system code dirs only)
        envAllowlist: options.envAllowlist || envAllowFromEnv(),
        timeoutMs: options.timeoutMs,
        maxBuffer: options.maxBuffer,
        // test-injection seams (no real binary / network / secret during tests):
        sandboxRunner: options.sandboxRunner,
        spawn: options.spawn,
    });
    if (res.ok) return { ok: true, text: res.text };
    return { ok: false, reason: res.reason, refused: res.refused === true, stderr: res.stderr };
}

module.exports = { isAvailable, describe, complete, command };
