import { getPolicies } from "@/core/policy-registry";

export function getPolicyStore() {
  return getPolicies();
}
