import { Risk } from "@/contracts/risk";

const risks: Risk[] = [];

export function addRisk(risk: Risk): void {
  risks.push(risk);
}

export function getRisks(): Risk[] {
  return [...risks];
}
