import { isBoampHealthy } from "@/core/boamp-health";
import { runBoampSearch } from "@/core/boamp-runner";
import { DataQualificationEngine } from "@/core/data-qualification-engine";
import { DataRecord } from "@/contracts/data-record";

export async function integrationService(query: string) {
  if (!isBoampHealthy()) {
    throw new Error("BOAMP unavailable");
  }

  const raw = await runBoampSearch(query);

  const records: DataRecord[] = [{
    source: "BOAMP",
    payload: raw,
  }];

  const qualification = new DataQualificationEngine();

  return {
    healthy: true,
    results: qualification.execute(records),
  };
}
