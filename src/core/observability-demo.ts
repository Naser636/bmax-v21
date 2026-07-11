import { ObservabilityEngine } from "@/core/observability-engine";

export async function observabilityDemo() {
  return new ObservabilityEngine().execute();
}
