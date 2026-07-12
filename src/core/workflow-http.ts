import { MissionContext } from "@/core/mission-context";

export async function executeHttp(
  context: MissionContext
): Promise<void> {
  // Sprint 10 : adaptation minimale.
  // Le moteur HTTP existant sera branché ici.

  const http = {
    status: 200,
    headers: {},
    data: {
      success: true,
    },
  };

  context.http = http;

  context.logs.push(
    `HTTP request completed (${http.status})`
  );

  context.results.push(http);
}
