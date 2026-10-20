/**
 * compliance-evidence-pack — COMPLIANCE_EVIDENCE_PACK_RUNNER_V1 (Lot F). PURE composer that assembles a
 * re-verifiable CRA + AI-Act TECHNICAL-EVIDENCE pack from EXISTING, tested modules — NO new evidence engine,
 * NO network, NO client data. The caller reads the target repo's files and passes them in; fabricates nothing.
 * Honest-scope: EVIDENCE + readiness, NOT certification/conformity. Reuses supply-chain-attest + autonomy-eval-harness.
 * Optional AI-Act readiness + robustness inputs; absent ⇒ NOT_ASSESSED (never a silent PASS). Tagged FACT/RESULT/REC.
 */
const ATT = require("./supply-chain-attest.js");
const EVAL = require("./autonomy-eval-harness.js");

function buildEvidencePack(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  const facts: string[] = [], results: string[] = [], recommendations: string[] = [], gaps: string[] = [];

  const sbom = ATT.buildSbom(i.lockPackages || {}, { name: i.repoName || "target", version: "0.0.0" });
  facts.push("CRA (Reg. (EU) 2024/2847): SBOM + technical documentation obligations; machine-readable SBOM needed for the 24h/72h/14d vuln reporting (verify current text per engagement).");
  results.push(`SBOM: CycloneDX, ${sbom.components.length} npm components (lockfile-derived; OS/system packages NOT covered).`);
  if (sbom.components.length === 0) gaps.push("SBOM empty — no lockfile components found (is this an npm project? other ecosystems not covered).");

  const artifactBytes = i.artifactBytes !== undefined ? i.artifactBytes : "";
  const att = ATT.buildAttestation({ name: i.artifactName || "artifact", sha256: ATT.sha256(artifactBytes) }, sbom, { commit: i.sourceCommit || null, builderId: "local", finishedAt: i.finishedAt || null });
  let signature: any = null, publicKeyPem: any = null;
  if (i.signer && i.signer.privateKeyPem) { signature = ATT.signStatement(att, i.signer.privateKeyPem); publicKeyPem = i.signer.publicKeyPem || null; }
  results.push(signature ? "Provenance: in-toto attestation ed25519-signed (tamper-evident, re-verifiable)." : "Provenance: in-toto attestation built (UNSIGNED — provide a signer for a verifiable signature).");
  gaps.push("SLSA: L1 provenance + signing MECHANISM; true SLSA L2 requires a hosted build platform + managed/keyless keys — NOT provided here.");

  if (i.aiAct && typeof i.aiAct === "object") {
    facts.push("EU AI Act: Art 11 technical doc (Annex IV), Art 12 automatic logging CAPABILITY, Art 19 provider log retention (≥6 months), Art 15 accuracy/robustness.");
    results.push(`AI-Act readiness matrix: ${JSON.stringify(i.aiAct)} (readiness ≠ conformity).`);
  } else { results.push("AI-Act readiness: NOT_ASSESSED (no matrix supplied)."); }

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

function verifyPack(pack: any, opts: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  if (!pack || !pack.attestation) return { ok: false, reason: "no attestation in pack" };
  if (!pack.signature || !(o.publicKeyPem || pack.publicKeyPem)) {
    if (o.artifactBytes === undefined) return { ok: false, reason: "unsigned pack + no artifactBytes ⇒ not verifiable" };
    const recomputed = ATT.sha256(o.artifactBytes);
    const claimed = pack.attestation.subject && pack.attestation.subject[0] && pack.attestation.subject[0].digest && pack.attestation.subject[0].digest.sha256;
    return recomputed === claimed ? { ok: true, reason: "artifact digest matches (unsigned)" } : { ok: false, reason: "artifact digest mismatch (tampered)" };
  }
  return ATT.verifyStatement(pack.attestation, pack.signature, o.publicKeyPem || pack.publicKeyPem, { artifactBytes: o.artifactBytes, sbom: pack.sbom });
}

module.exports = { buildEvidencePack, verifyPack };
export {};
