import { Verification } from "@/contracts/verification";

const verifications: Verification[] = [];

export function addVerification(item: Verification): void {
  verifications.push(item);
}

export function getVerifications(): readonly Verification[] {
  return verifications;
}
