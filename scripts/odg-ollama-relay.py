#!/usr/bin/env python3
"""ODG Ollama relay — restricted, local-only, two modes (host | bridge).

Security model (unchanged from the owner design):
  * host mode   : binds a Unix socket (SOCK) and relays ONLY an allowlisted set of
                  Ollama routes to the real local daemon at 127.0.0.1:11434.
                  No model pulls/management, no streaming, local target only.
  * bridge mode : runs INSIDE the sandbox, listens on 127.0.0.1:11434 and tunnels
                  to the bind-mounted Unix socket. Preserves netns isolation.

V197 hardening applied to the host relay:
  FIX 1 — streaming enforcement: POST bodies are JSON-parsed (malformed → 400),
          stream is FORCED to False, and the NORMALIZED JSON is re-serialized before
          forwarding. No string matching is used for stream detection. 16 MiB cap kept.
  FIX 2 — path normalization: the request target is parsed; absolute URLs, authority
          components, query strings, fragments, and encoded/ambiguous path separators
          are rejected. Only the validated normalized route is forwarded — the raw
          untrusted self.path is never concatenated into the upstream URL.
"""
import os, sys, json, socket, socketserver, select, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit

SOCK = os.environ.get("ODG_OLLAMA_SOCK", "/run/odg-ollama.sock")
TARGET = ("127.0.0.1", 11434)
MAX_BODY = 16 * 1024 * 1024  # 16 MiB
ALLOWED = {"/api/generate", "/api/chat", "/api/embed",
           "/api/embeddings", "/api/tags", "/api/show"}


class Relay(BaseHTTPRequestHandler):
    def _validated_route(self):
        """FIX 2 — return the validated normalized path, or None if the target is
        unsafe/not allowed. Never derive the upstream URL from the raw self.path."""
        raw = self.path
        # Reject encoded or ambiguous separators outright (%2f, %2F, %5c, any percent).
        if "%" in raw:
            return None
        parts = urlsplit(raw)
        # Reject absolute URLs (scheme), authority (netloc), query strings, fragments.
        if parts.scheme or parts.netloc or parts.query or parts.fragment:
            return None
        path = parts.path
        # Reject ambiguous path separators.
        if "//" in path or "\\" in path:
            return None
        if path not in ALLOWED:
            return None
        return path

    def handle_request(self):
        route = self._validated_route()
        if route is None:
            self.send_error(403); return
        if self.command not in ({"GET"} if route == "/api/tags" else {"POST"}):
            self.send_error(405); return

        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > MAX_BODY:
            self.send_error(413); return
        raw_body = self.rfile.read(length) if length else b""

        forward_body = None
        if self.command == "POST":
            # FIX 1 — parse JSON, reject malformed, force stream=False, re-serialize.
            try:
                obj = json.loads(raw_body.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                self.send_error(400, "Malformed JSON"); return
            if not isinstance(obj, dict):
                self.send_error(400, "JSON object required"); return
            obj["stream"] = False
            forward_body = json.dumps(obj).encode("utf-8")
            if len(forward_body) > MAX_BODY:
                self.send_error(413); return

        req = urllib.request.Request(
            "http://127.0.0.1:11434" + route,          # validated route only
            data=forward_body, method=self.command,
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data, status = r.read(), r.status
                ctype = r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            data, status, ctype = e.read(), e.code, "application/json"
        except Exception:
            self.send_error(502); return

        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = do_POST = handle_request

    def log_message(self, *args):
        pass


class UnixServer(socketserver.ThreadingUnixStreamServer):
    allow_reuse_address = True


class Bridge(socketserver.BaseRequestHandler):
    def handle(self):
        with socket.socket(socket.AF_UNIX) as u:
            u.connect(SOCK)
            client = self.request
            peer = {id(client): u, id(u): client}
            # V313 FIX — half-close aware pumping. The previous loop returned on the FIRST EOF from
            # EITHER side, which DROPPED an in-flight response in the opposite direction. HTTP clients
            # (e.g. curl) half-close their write side right after sending the request; that EOF would
            # tear the tunnel down before the upstream response was relayed. We now treat an EOF as a
            # one-directional half-close: signal it downstream with SHUT_WR, stop reading that side, and
            # keep pumping the other direction until it, too, reaches EOF. No behavioural change for
            # peers that keep both directions open until completion.
            readers = [client, u]
            while readers:
                ready, _, _ = select.select(readers, [], [], 300)
                if not ready:
                    break
                for src in ready:
                    try:
                        data = src.recv(65536)
                    except OSError:
                        data = b""
                    dst = peer[id(src)]
                    if not data:
                        try:
                            dst.shutdown(socket.SHUT_WR)
                        except OSError:
                            pass
                        readers.remove(src)
                        continue
                    try:
                        dst.sendall(data)
                    except OSError:
                        readers = []
                        break


def _unlink_sock():
    # Remove our own socket file on shutdown. The pre-existence guard below still protects against a
    # concurrent/second relay; this only cleans up OUR socket so a non-clean exit (SIGTERM from the
    # launcher's stop_host_relay) does not leave an ORPHANED socket that blocks the next launch.
    try:
        os.unlink(SOCK)
    except OSError:
        pass


if __name__ == "__main__":
    if sys.argv[1:] == ["host"]:
        if os.path.lexists(SOCK):
            raise RuntimeError("Socket already exists; inspect before removal")
        os.makedirs(os.path.dirname(SOCK), exist_ok=True)
        import signal

        def _on_signal(_signum, _frame):
            _unlink_sock()
            raise SystemExit(0)

        signal.signal(signal.SIGTERM, _on_signal)
        signal.signal(signal.SIGINT, _on_signal)
        try:
            with UnixServer(SOCK, Relay) as s:
                os.chmod(SOCK, 0o660)
                s.serve_forever()
        finally:
            _unlink_sock()
    elif sys.argv[1:] == ["bridge"]:
        # Port is configurable only for in-process testing; the sandbox default stays 127.0.0.1:11434.
        bridge_port = int(os.environ.get("ODG_BRIDGE_PORT", "11434"))
        class Server(socketserver.ThreadingTCPServer):
            allow_reuse_address = False
        with Server(("127.0.0.1", bridge_port), Bridge) as s:
            s.serve_forever()
    else:
        raise SystemExit("Usage: relay.py host|bridge")
