import { Policy } from "@/contracts/policy";

export function getDefaultPolicy(): Policy {
  return {
    id: crypto.randomUUID(),
    name: "Default Policy",
    version: "1.0.0",
    enabled: true,
  };
}

export function isPolicyEnabled(policy: Policy): boolean {
  return policy.enabled;
}
