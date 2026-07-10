import { ApiConnector } from "@/core/api-connector";

async function main() {
  const connector = new ApiConnector();

  console.assert(await connector.connect() === true);
  console.assert(await connector.health() === true);

  await connector.disconnect();

  console.log("API Connector OK");
}

void main();
