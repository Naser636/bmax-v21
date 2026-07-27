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
 */

"use strict";

const { spawnSync } = require("child_process");

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

// Run the configured local model as an executor. Returns { ok, text } or { ok:false, reason }.
function complete(prompt, opts) {
    const cmd = command();
    if (!cmd) return { ok: false, reason: "no local model configured (set ODG_LOCAL_MODEL_CMD)" };
    const r = spawnSync(cmd, {
        shell: true,
        input: String(prompt == null ? "" : prompt),
        encoding: "utf8",
        maxBuffer: (opts && opts.maxBuffer) || 8 * 1024 * 1024,
    });
    if (r.error) return { ok: false, reason: String(r.error.message || r.error) };
    if (typeof r.status === "number" && r.status !== 0) {
        return { ok: false, reason: `local model exited ${r.status}`, stderr: (r.stderr || "").trim() };
    }
    return { ok: true, text: (r.stdout || "").replace(/\n$/, "") };
}

module.exports = { isAvailable, describe, complete, command };
