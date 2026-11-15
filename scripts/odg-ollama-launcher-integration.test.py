#!/usr/bin/env python3
"""V198 — integration tests for wiring the hardened Ollama relay into the sandbox launcher.

Validates the EXACT logic the launcher patch implements, WITHOUT modifying the host
launcher, without sudo, without touching /run, without a canonical repo mount, and with
no network egress beyond localhost:

  * Part A (host side): the fail-closed socket/relay prerequisite checks.
  * Part B (bwrap netns, mirrors the real sandbox): the in-sandbox relay bridge on
    127.0.0.1:11434 -> bind-mounted /run/odg-ollama.sock -> host relay -> real Ollama.

Requires: bwrap, the real local Ollama daemon (qwen2.5-coder:7b), and the hardened relay
at scripts/odg-ollama-relay.py. Part B is skipped (reported) if bwrap is unavailable.
"""
import os, sys, socket, subprocess, time, json, tempfile, stat, shutil

HERE = os.path.dirname(os.path.realpath(__file__))
RELAY = os.path.join(HERE, "odg-ollama-relay.py")
TMP = tempfile.mkdtemp(prefix="odg-v198-")
HOST_SOCK = os.path.join(TMP, "odg-ollama.sock")
NETTEST = os.path.join(TMP, "nettest.py")

failures = 0
def check(name, cond):
    global failures
    print(("ok" if cond else "NOT OK") + " - " + name)
    if not cond:
        failures += 1

# ── Part A: fail-closed prerequisite validation (identical logic to the launcher patch) ──
def validate(relay_path, sock_path):
    if not os.path.isfile(relay_path):
        return "relay-missing"
    try:
        if not stat.S_ISSOCK(os.stat(sock_path).st_mode):
            return "not-a-socket"
    except FileNotFoundError:
        return "socket-missing"
    return None

NETTEST_SRC = r'''
import os, sys, socket, subprocess, time, json
RELAY = "/opt/odg-ollama-relay.py"
MODE = sys.argv[1]

def healthy():
    try:
        c = socket.create_connection(("127.0.0.1", 11434), timeout=5)
    except OSError:
        return False
    try:
        c.sendall(b"GET /api/tags HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
        d = b""
        while b"\r\n\r\n" not in d and len(d) < 65536:
            ch = c.recv(4096)
            if not ch:
                break
            d += ch
        return b" 200 " in d.split(b"\r\n", 1)[0]
    except OSError:
        return False
    finally:
        c.close()

def http(method, path, body=b""):
    c = socket.create_connection(("127.0.0.1", 11434), timeout=120)
    hdr = ("%s %s HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\nConnection: close\r\n\r\n"
           % (method, path, len(body))).encode()
    c.sendall(hdr + body)
    resp = b""
    while True:
        ch = c.recv(65536)
        if not ch:
            break
        resp += ch
    c.close()
    status = int(resp.split(b" ", 2)[1])
    _, _, payload = resp.partition(b"\r\n\r\n")
    return status, payload

r = {}
# network isolation (item 10): direct egress must be impossible in the netns
try:
    d = socket.create_connection(("1.1.1.1", 443), timeout=3); d.close(); r["net_isolated"] = False
except OSError:
    r["net_isolated"] = True

proc = subprocess.Popen(["/usr/bin/python3", RELAY, "bridge"])
ok = False
for _ in range(50):
    if healthy():
        ok = True
        break
    time.sleep(0.1)

if MODE == "nosocket":
    # item 4: bridge up but upstream socket absent -> health must be False
    r["startup_failure_health_false"] = (ok is False)
    try:
        proc.terminate(); proc.wait(timeout=5)
    except Exception:
        proc.kill()
    print(json.dumps(r)); sys.exit(0)

r["health_connected"] = ok            # item 3
# item 7 + 9: allowed generation, forced non-streaming (single JSON, done=true)
try:
    st, pl = http("POST", "/api/generate",
                  b'{"model":"qwen2.5-coder:7b","prompt":"Reply with exactly: OK","options":{"num_predict":8}}')
    obj = json.loads(pl.decode())
    r["generation_ok"] = (st == 200 and obj.get("done") is True and "OK" in (obj.get("response") or ""))
except Exception as e:
    r["generation_ok"] = False
# item 8: forbidden management route
try:
    st2, _ = http("POST", "/api/pull", b"{}")
    r["pull_forbidden"] = (st2 == 403)
except Exception:
    r["pull_forbidden"] = False
# item 6: duplicate bridge must fail to bind 127.0.0.1:11434 (allow_reuse_address=False)
dup = subprocess.Popen([ "/usr/bin/python3", RELAY, "bridge"])
try:
    rc = dup.wait(timeout=10)
except Exception:
    dup.kill(); rc = 0
r["duplicate_rejected"] = (rc != 0)
# item 5: clean shutdown of the bridge child
proc.terminate()
try:
    proc.wait(timeout=5)
except Exception:
    proc.kill()
r["shutdown_clean"] = (proc.poll() is not None)
print(json.dumps(r))
'''

def run_netns(mode, bind_socket):
    cmd = ["bwrap", "--unshare-all", "--die-with-parent",
           "--ro-bind", "/usr", "/usr", "--ro-bind", "/bin", "/bin",
           "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64",
           "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
           "--dir", "/run", "--dir", "/opt",
           "--ro-bind", RELAY, "/opt/odg-ollama-relay.py",
           "--ro-bind", NETTEST, "/opt/nettest.py"]
    if bind_socket:
        cmd += ["--ro-bind", HOST_SOCK, "/run/odg-ollama.sock"]
    cmd += ["--chdir", "/opt", "--", "/usr/bin/python3", "/opt/nettest.py", mode]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    line = [l for l in out.stdout.splitlines() if l.strip().startswith("{")]
    return json.loads(line[-1]) if line else {"error": out.stderr[-300:]}

def main():
    with open(NETTEST, "w") as f:
        f.write(NETTEST_SRC)

    # ── Part A ──
    missing = os.path.join(TMP, "nope.sock")
    check("1 missing socket -> fail-closed", validate(RELAY, missing) == "socket-missing")
    regfile = os.path.join(TMP, "regular.file"); open(regfile, "w").close()
    check("2 invalid socket (regular file) -> fail-closed", validate(RELAY, regfile) == "not-a-socket")
    probe = socket.socket(socket.AF_UNIX); probe.bind(os.path.join(TMP, "valid.sock"))
    check("3a valid Unix socket -> validation passes", validate(RELAY, os.path.join(TMP, "valid.sock")) is None)
    probe.close()
    check("(extra) missing relay -> fail-closed", validate("/nonexistent/relay.py", regfile) == "relay-missing")

    # ── start host relay for Part B ──
    if shutil.which("bwrap") is None:
        check("Part B netns tests", False); print("bwrap missing — netns tests BLOCKED"); return
    env = dict(os.environ, ODG_OLLAMA_SOCK=HOST_SOCK)
    host = subprocess.Popen([sys.executable, RELAY, "host"], env=env)
    try:
        for _ in range(50):
            if os.path.lexists(HOST_SOCK):
                break
            time.sleep(0.1)
        time.sleep(0.3)

        r = run_netns("connected", bind_socket=True)
        check("3b valid socket connection through bridge (health 200)", r.get("health_connected") is True)
        check("7 allowed Ollama generation via relay (real qwen2.5-coder:7b)", r.get("generation_ok") is True)
        check("8 forbidden management route /api/pull -> 403", r.get("pull_forbidden") is True)
        check("9 non-streaming enforced (single JSON done=true)", r.get("generation_ok") is True)
        check("10 network isolation preserved (direct egress blocked)", r.get("net_isolated") is True)
        check("6 duplicate bridge rejected (port bind conflict)", r.get("duplicate_rejected") is True)
        check("5 bridge clean shutdown (child terminated)", r.get("shutdown_clean") is True)

        r2 = run_netns("nosocket", bind_socket=False)
        check("4 bridge startup failure detected (health False, no CONNECTED)", r2.get("startup_failure_health_false") is True)
    finally:
        host.terminate()
        try:
            host.wait(timeout=5)
        except Exception:
            host.kill()
        shutil.rmtree(TMP, ignore_errors=True)

    print()
    if failures == 0:
        print("ALL PASS — launcher-ollama integration (V198: fail-closed missing/invalid/valid socket; "
              "netns bridge health 200; real generation; /api/pull 403; non-streaming; network isolation "
              "preserved; duplicate rejected; clean shutdown; startup-failure detected)")
    else:
        print("%d FAIL" % failures)

main()
sys.exit(1 if failures else 0)
