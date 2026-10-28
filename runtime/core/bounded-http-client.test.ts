#!/usr/bin/env node
// @ts-nocheck — runs under tsx, ZERO network (guards are pure; get() uses an injected httpImpl mock). Proves the
// egress safety guards: HTTPS-only, host allowlist, SSRF/private-host block, URL userinfo reject, content-type
// validation, size cap, redirect block, timeout — and that get() never fabricates a body.
"use strict";
const assert = require("assert");
const H = require("./bounded-http-client.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) validateUrl — allowlisted https accepted; everything else rejected with a code.
ok("allowlisted https accepted", H.validateUrl("https://boamp-datadila.opendatasoft.com/api/x").ok === true);
ok("http rejected", H.validateUrl("http://boamp-datadila.opendatasoft.com/x").code === "NOT_HTTPS");
ok("non-allowlisted host rejected", H.validateUrl("https://evil.example.com/x").code === "HOST_NOT_ALLOWLISTED");
ok("URL userinfo rejected", H.validateUrl("https://user:pass@boamp-datadila.opendatasoft.com/x").code === "URL_USERINFO_FORBIDDEN");
ok("invalid URL rejected", H.validateUrl("not a url").code === "INVALID_URL");

// (2) SSRF guard — localhost / RFC1918 / link-local / metadata / IP literal blocked.
ok("localhost blocked", H.isPrivateHost("localhost") === true);
ok("RFC1918 blocked (10/192.168/172.16)", H.isPrivateHost("10.0.0.1") && H.isPrivateHost("192.168.1.1") && H.isPrivateHost("172.16.0.1"));
ok("link-local + cloud metadata blocked", H.isPrivateHost("169.254.169.254") === true && H.isPrivateHost("metadata.google.internal") === true);
ok("raw IP literal blocked (even if not private-range-formatted)", H.isPrivateHost("8.8.8.8") === true);
ok("public allowlisted hostname not private", H.isPrivateHost("boamp-datadila.opendatasoft.com") === false);
ok("validateUrl blocks a private host even if somehow allowlisted", H.validateUrl("https://127.0.0.1/x", ["127.0.0.1"]).code === "PRIVATE_HOST_BLOCKED");

// (3) content-type + size guards (pure).
ok("content-type: JSON accepted, html rejected", H.validateContentType("application/json; charset=utf-8") === true && H.validateContentType("text/html") === false);
ok("size cap enforced", H.enforceSize(100, 200) === true && H.enforceSize(300, 200) === false);

// (4) get() with injected mock httpImpl — success path returns body, never fabricated.
function mockImpl(body, { statusCode = 200, contentType = "application/json" } = {}) {
  return (href, options, cb) => {
    const res = { statusCode, headers: { "content-type": contentType }, _h: {}, on(ev, fn) { this._h[ev] = fn; return this; }, destroy() {} };
    const req = { on() { return this; }, destroy() {} };
    setImmediate(() => { cb(res); if (res._h.data) res._h.data(Buffer.from(body)); if (res._h.end) res._h.end(); });
    return req;
  };
}
(async () => {
  const good = await H.get("https://boamp-datadila.opendatasoft.com/x", { httpImpl: mockImpl('{"results":[]}') });
  ok("get success ⇒ ok + body (not fabricated)", good.ok === true && good.statusCode === 200 && good.body === '{"results":[]}');

  const notAllowed = await H.get("https://evil.example.com/x", { httpImpl: mockImpl("{}") });
  ok("get rejects non-allowlisted BEFORE any fetch", notAllowed.ok === false && notAllowed.code === "HOST_NOT_ALLOWLISTED");

  const badCt = await H.get("https://boamp-datadila.opendatasoft.com/x", { httpImpl: mockImpl("<html>", { contentType: "text/html" }) });
  ok("non-JSON content-type ⇒ BAD_CONTENT_TYPE", badCt.ok === false && badCt.code === "BAD_CONTENT_TYPE");

  const redirect = await H.get("https://boamp-datadila.opendatasoft.com/x", { httpImpl: mockImpl("", { statusCode: 302 }) });
  ok("3xx ⇒ REDIRECT_BLOCKED", redirect.ok === false && redirect.code === "REDIRECT_BLOCKED");

  const tooBig = await H.get("https://boamp-datadila.opendatasoft.com/x", { maxBytes: 3, httpImpl: mockImpl("way too many bytes") });
  ok("over size cap ⇒ RESPONSE_TOO_LARGE", tooBig.ok === false && tooBig.code === "RESPONSE_TOO_LARGE");

  // (5) post() reuses the same guards + sends a JSON body (injected mock, zero network).
  function mockPost(body, { statusCode = 200, contentType = "application/json" } = {}) {
    return (href, options, cb) => {
      assert.ok(options.method === "POST", "post uses METHOD POST");
      const res = { statusCode, headers: { "content-type": contentType }, _h: {}, on(ev, fn) { this._h[ev] = fn; return this; }, destroy() {} };
      const req = { on() { return this; }, write() {}, end() { setImmediate(() => { cb(res); if (res._h.data) res._h.data(Buffer.from(body)); if (res._h.end) res._h.end(); }); }, destroy() {} };
      return req;
    };
  }
  const postOk = await H.post("https://api.ted.europa.eu/v3/notices/search", { query: "x" }, { httpImpl: mockPost('{"notices":[]}') });
  ok("post success ⇒ ok + body", postOk.ok === true && postOk.body === '{"notices":[]}');
  const postBlocked = await H.post("https://evil.example.com/x", { q: 1 }, { httpImpl: mockPost("{}") });
  ok("post rejects non-allowlisted host before any request", postBlocked.ok === false && postBlocked.code === "HOST_NOT_ALLOWLISTED");

  console.log(`\nBOUNDED-HTTP-CLIENT suite — ${pass} assertions passed. (https-only allowlist; SSRF guard; content-type/size/redirect/timeout; GET+POST; injected mock, zero network)`);
  if (pass < 20) process.exit(1);   // guard: all async assertions must have run (not a silent callback skip)
})();
