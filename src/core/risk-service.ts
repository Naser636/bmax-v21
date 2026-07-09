import { getRisks } from "@/core/risk-registry";
import { Risk } from "@/contracts/risk";

export function getRiskStore(): Risk[] {
  return getRisks();
}

export function getHighRisks(): Risk[] {
  return getRisks().filter(risk => risk.level === "HIGH");
}
