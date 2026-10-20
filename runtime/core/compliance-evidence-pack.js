/**
 * compliance-evidence-pack — COMPLIANCE_EVIDENCE_PACK_RUNNER_V1 (Lot F). PURE composer that assembles a
 * re-verifiable CRA + AI-Act TECHNICAL-EVIDENCE pack from EXISTING, tested modules — NO new evidence engine,
 * NO network, NO client data. The caller (thin CLI) reads the target repo's files and passes them in; this
 * module composes and fabricates nothing. Honest-scope: EVIDENCE + readiness, NOT certification/conformity.
 *
 * Reuses: supply-chain-attest (SBOM CycloneDX + in-toto attestation + ed25519 sign/verify + sha256),
 * autonomy-eval-harness (robustness / anti-false-success golden set). AI-Act readiness + exposure/maintenance
 * signals are OPTIONAL inputs — absent ⇒ NOT_ASSESSED (never a silent PASS). Sections are tagged FACT / RESULT /
 * RECOMMENDATION. A tampered artifact, empty inputs or missing evidence are surfaced, never hidden.
 */
const ATT = require("./supply-chain-attest.js");
const EVAL = require("./autonomy-eval-harness.js");

/**
 * input: {
 *   repoName, sourceCommit,
 *   lockPackages (object, CRA SBOM source), artifactName, artifactBytes (Buffer|string),
 *   signer?: {privateKeyPem, publicKeyPem}, finishedAt?,
 *   aiAct?: {assessed:int, partial:int, blocked:int, gap:int, notAssessed:int} (O3 matrix summary; else NOT_ASSESSED),
 *   robustnessCases?: [{name,expected,observed}] (fed to the golden set; else NOT_ASSESSED),
 * }
 */
function buildEvidencePack(input) {
  const i = input && typeof input === "object" ? input : {};
  const facts = [], results = [], recommendations = [], gaps = [];

  // ---- CRA: SBOM + attestation (+ optional signature) ----
  const sbom = ATT.buildSbom(i.lockPackages || {}, { name: i.repoName || "target", version: "0.0.0" });
  facts.push("CRA (Reg. (EU) 2024/2847): SBOM + technical documentation obligations; machine-readable SBOM needed for the 24h/72h/14d vuln reporting (verify current text per engagement).");
  results.push(`SBOM: CycloneDX, ${sbom.components.length} npm components (lockfile-derived; OS/system packages NOT covered).`);
  if (sbom.components.length === 0) gaps.push("SBOM empty — no lockfile components found (is this an npm project? other ecosystems not covered).");

  const artifactBytes = i.artifactBytes !== undefined ? i.artifactBytes : "";
  const att = ATT.buildAttestation({ name: i.artifactName || "artifact", sha256: ATT.sha256(artifactBytes) }, sbom, { commit: i.sourceCommit || null, builderId: "local", finishedAt: i.finishedAt || null });
  let signature = null, publicKeyPem = null;
  if (i.signer && i.signer.privateKeyPem) { signature = ATT.signStatement(att, i.signer.privateKeyPem); publicKeyPem = i.signer.publicKeyPem || null; }
  results.push(signature ? "Provenance: in-toto attestation ed25519-signed (tamper-evident, re-verifiable)." : "Provenance: in-toto attestation built (UNSIGNED — provide a signer for a verifiable signature).");
  gaps.push("SLSA: L1 provenance + signing MECHANISM; true SLSA L2 requires a hosted build platform + managed/keyless keys — NOT provided here.");

  // ---- AI Act (optional readiness matrix summary) ----
  if (i.aiAct && typeof i.aiAct === "object") {
    facts.push("EU AI Act: Art 11 technical doc (Annex IV), Art 12 automatic logging CAPABILITY, Art 19 provider log retention (≥6 months), Art 15 accuracy/robustness.");
    results.push(`AI-Act readiness matrix: ${JSON.stringify(i.aiAct)} (readiness ≠ conformity).`);
  } else { results.push("AI-Act readiness: NOT_ASSESSED (no matrix supplied)."); }

  // ---- Robustness / anti-false-success (optional golden set) ----
  if (Array.isArray(i.robustnessCases) && i.robustnessCases.length) {
    const gs = EVAL.runGoldenSet(i.robustnessCases);
    results.push(`Robustness golden-set: ${JSON.stringify(gs.summary)} (false-success caught: ${gs.summary.falseSuccessCaught}).`);
  } else { results.push("Robustness: NOT_ASSESSED (no golden-set cases supplied)."); }

  recommendations.push("Technical EVIDENCE + readiness only — NOT a certification/conformity assessment (notified body) nor legal advice.");
  recommendations.push("Close gaps above; confirm current regulatory text per engagement; a competent body/auditor finalises conformity.");

  return {
    _type: "odg/compliance-evidence-pack/v1",
    repoName: i.repoName || null, sourceCommit: i.sourceCommit || null,
    disclaimer: "Technical evidence/readiness, NOT certification/conformity/legal advice. FACTs are sourced; RESULTs are this run's outputs; RECOMMENDATIONs are advisory.",
    sbom, attestation: att, signature, publicKeyPem,
    facts, results, recommendations, gaps,
  };
}

/** Re-verify the pack's artifact↔attestation binding (tamper-evident) + signature if present. */
function verifyPack(pack, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  if (!pack || !pack.attestation) return { ok: false, reason: "no attestation in pack" };
  if (!pack.signature || !(o.publicKeyPem || pack.publicKeyPem)) {
    // no signature ⇒ can still check the subject digest if artifactBytes given
    if (o.artifactBytes === undefined) return { ok: false, reason: "unsigned pack + no artifactBytes ⇒ not verifiable" };
    const recomputed = ATT.sha256(o.artifactBytes);
    const claimed = pack.attestation.subject && pack.attestation.subject[0] && pack.attestation.subject[0].digest && pack.attestation.subject[0].digest.sha256;
    return recomputed === claimed ? { ok: true, reason: "artifact digest matches (unsigned)" } : { ok: false, reason: "artifact digest mismatch (tampered)" };
  }
  return ATT.verifyStatement(pack.attestation, pack.signature, o.publicKeyPem || pack.publicKeyPem, { artifactBytes: o.artifactBytes, sbom: pack.sbom });
}

module.exports = { buildEvidencePack, verifyPack };
