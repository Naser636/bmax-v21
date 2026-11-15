#!/usr/bin/env python3
"""V197 — executed tests for the hardened ODG Ollama relay (host mode).

Starts the host relay on a scratchpad Unix socket (NOT /run — no host change, no sudo)
and drives raw HTTP requests over that socket so the exact request-target is controlled.
Requires the real local Ollama daemon (127.0.0.1:11434) with qwen2.5-coder:7b for the
generation tests. Local-only; no network egress beyond localhost.
"""
import os, sys, socket, subprocess, time, json, tempfile

HERE = os.path.dirname(os.path.realpath(__file__))
RELAY = os.path.join(HERE, "odg-ollama-relay.py")
SOCK = os.path.join(tempfile.gettempdir(), "odg-ollama-test-%d.sock" % os.getpid())
MODEL = "qwen2.5-coder:7b"

failures = 0
def check(name, cond):
    global failures
    print(("ok" if cond else "NOT OK") + " - " + name)
    if not cond:
        failures += 1

def req(method, target, body=b"", override_cl=None):
    s = socket.socket(socket.AF_UNIX); s.settimeout(130); s.connect(SOCK)
    cl = override_cl if override_cl is not None else len(body)
    head = ("%s %s HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\nConnection: close\r\n\r\n"
            % (method, target, cl)).encode()
    s.sendall(head + body)
    resp = b""
    while True:
        try:
            d = s.recv(65536)
        except socket.timeout:
            break
        if not d:
            break
        resp += d
    s.close()
    status = int(resp.split(b" ", 2)[1]) if resp else 0
    _, _, payload = resp.partition(b"\r\n\r\n")
    return status, payload

def gen_body(extra):
    return ('{"model":"%s","prompt":"Reply with exactly: OK","options":{"num_predict":8}%s}'
            % (MODEL, extra)).encode()

def is_single_json_done(payload):
    """Non-streamed response = ONE JSON object with done=true. Streamed would be NDJSON
    (multiple objects) and json.loads would fail — so this proves stream was forced False."""
    try:
        obj = json.loads(payload.decode("utf-8"))
        return isinstance(obj, dict) and obj.get("done") is True
    except Exception:
        return False

def main():
    if os.path.lexists(SOCK):
        os.remove(SOCK)
    env = dict(os.environ, ODG_OLLAMA_SOCK=SOCK)
    proc = subprocess.Popen([sys.executable, RELAY, "host"], env=env)
    try:
        for _ in range(50):
            if os.path.lexists(SOCK):
                break
            time.sleep(0.1)
        time.sleep(0.3)

        # 1. stream omitted -> forwarded with stream=False (single JSON, done=true)
        st, pl = req("POST", "/api/generate", gen_body(""))
        check("1 stream omitted -> forwarded stream=False (non-streamed single JSON)", st == 200 and is_single_json_done(pl))
        # 2. stream=true (with space) -> forced False
        st, pl = req("POST", "/api/generate", gen_body(',"stream": true'))
        check("2 stream:true (space) -> forced False", st == 200 and is_single_json_done(pl))
        # 3. stream:true without whitespace -> forced False (defeats string matching)
        st, pl = req("POST", "/api/generate", gen_body(',"stream":true'))
        check("3 stream:true (no space) -> forced False", st == 200 and is_single_json_done(pl))
        # 4. malformed JSON -> 400
        st, _ = req("POST", "/api/generate", b'{"model":"x"')
        check("4 malformed JSON -> 400", st == 400)
        # 5. /api/pull -> 403
        st, _ = req("POST", "/api/pull", b'{}')
        check("5 /api/pull -> 403", st == 403)
        # 6. unsupported method (GET on POST route) -> 405
        st, _ = req("GET", "/api/generate")
        check("6 GET /api/generate -> 405", st == 405)
        # 7a. authority injection via // -> rejected (403)
        st_a, _ = req("GET", "//evil.com/api/tags")
        # 7b. absolute URL -> rejected (403)
        st_b, _ = req("GET", "http://evil/api/tags")
        # 7c. encoded separator -> rejected (403)
        st_c, _ = req("POST", "/api/%2e%2e/generate", b'{}')
        check("7 absolute/authority/encoded injection -> 403", st_a == 403 and st_b == 403 and st_c == 403)
        # 8. valid /api/generate -> successful local generation
        st, pl = req("POST", "/api/generate", gen_body(',"stream":false'))
        ok8 = st == 200 and is_single_json_done(pl) and b"OK" in pl
        check("8 valid /api/generate -> real local generation (resp contains OK)", ok8)
        # 9. request exceeding 16 MiB (declared Content-Length) -> 413
        st, _ = req("POST", "/api/generate", b'{}', override_cl=17 * 1024 * 1024)
        check("9 >16 MiB -> 413", st == 413)

        print()
        if failures == 0:
            print("ALL PASS — odg-ollama-relay (V197: FIX1 stream forced False via JSON "
                  "normalization [omitted/space/no-space all non-streamed]; malformed->400; "
                  "FIX2 path normalization rejects absolute/authority/encoded; pull->403; "
                  "method->405; >16MiB->413; real qwen2.5-coder:7b generation OK)")
        else:
            print("%d FAIL" % failures)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        if os.path.lexists(SOCK):
            os.remove(SOCK)
    sys.exit(1 if failures else 0)

main()
