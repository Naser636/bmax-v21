/**
 * exposure-audit — P3 private-exposure drift detector (read-only, NEVER changes network/firewall state).
 *
 * The non-negotiable invariant: ODG/BMAX's OWN listeners must bind loopback only (127.0.0.1 / ::1). This module
 * PARSES `ss -ltnp` output and classifies every LISTEN socket; it fabricates nothing and changes nothing.
 *
 * Ownership is honest: without privilege, `ss` prints a pid ONLY for sockets owned by the current user. So a
 * public (non-loopback) listener WITH a visible pid under our user is an ODG-owned exposure ⇒ **DRIFT** (the thing
 * we forbid). A public listener with NO visible pid belongs to another tenant/root ⇒ **FOREIGN** (informational —
 * we neither control nor touch co-tenant services). A loopback ODG listener is OK. If NO socket shows a pid at all
 * (ran without the needed privilege) ownership can't be proven ⇒ public ones are reported UNKNOWN, never a false OK.
 *
 * Verdict: DRIFT if any ODG-owned public listener exists; else UNKNOWN if any public listener's ownership is
 * unprovable; else LOOPBACK_OK. DRIFT/UNKNOWN are actionable signals, not auto-remediations (fixing a bind or a
 * firewall is a reserved, human/authorized action — this module only observes and reports).
 */

function isLoopbackHost(host: any): boolean {
  if (typeof host !== "string" || !host) return false;
  const h = host.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "127.0.0.1" || /^127\./.test(h)) return true;
  if (h === "::1") return true;
  if (/^::ffff:127\./i.test(h)) return true;
  return false;
}

// Split a "host:port" local-address field, IPv6-aware ([::]:8080, [::1]:3000, 0.0.0.0:22, 127.0.0.1:3000).
function splitHostPort(addr: any): { host: string; port: string } {
  if (typeof addr !== "string") return { host: "", port: "" };
  const m = addr.match(/^\[(.+)\]:(\d+|\*)$/); // [ipv6]:port
  if (m) return { host: `[${m[1]}]`, port: m[2] };
  const i = addr.lastIndexOf(":");
  if (i < 0) return { host: addr, port: "" };
  return { host: addr.slice(0, i), port: addr.slice(i + 1) };
}

/**
 * Parse `ss -ltnp` text into LISTEN socket records: { raw, localAddr, host, port, owned, pid }.
 * `owned` = a pid is visible (users:((...pid=N...))) ⇒ a socket in our own user namespace.
 */
function parseListeners(ssText: any): any[] {
  const out: any[] = [];
  const lines = String(ssText || "").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!/^LISTEN\b/.test(t)) continue;
    const cols = t.split(/\s+/);
    // State Recv-Q Send-Q Local:Port Peer:Port [users:((...))]
    const localAddr = cols[3] || "";
    const { host, port } = splitHostPort(localAddr);
    const pidM = t.match(/pid=(\d+)/);
    out.push({ raw: t, localAddr, host, port, owned: !!pidM, pid: pidM ? Number(pidM[1]) : null });
  }
  return out;
}

/**
 * Classify parsed listeners into odgLoopback / drift (ODG-owned public) / foreign (not ours, public) and an
 * honest verdict. Pure: input records in, structured result out.
 */
function classifyExposure(ssText: any): any {
  const listeners = Array.isArray(ssText) ? ssText : parseListeners(ssText);
  const odgLoopback: any[] = [];
  const drift: any[] = [];
  const foreign: any[] = [];
  const unknownPublic: any[] = [];
  for (const l of listeners) {
    const loop = isLoopbackHost(l.host);
    if (loop) { if (l.owned) odgLoopback.push(l); /* foreign loopback is harmless, ignored */ continue; }
    // non-loopback (public) listener
    if (l.owned) drift.push(l);
    else { foreign.push(l); unknownPublic.push(l); }
  }
  let verdict: string;
  if (drift.length > 0) verdict = "DRIFT";
  else if (unknownPublic.length > 0) verdict = "UNKNOWN"; // can't prove the public ones aren't ODG without privilege
  else verdict = "LOOPBACK_OK";
  return { verdict, odgLoopback, drift, foreign, counts: { total: listeners.length, odgLoopback: odgLoopback.length, drift: drift.length, foreign: foreign.length } };
}

module.exports = { isLoopbackHost, splitHostPort, parseListeners, classifyExposure };
export {};
