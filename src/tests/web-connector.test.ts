import { WebConnector } from "@/core/web-connector";

async function main() {
  const connector = new WebConnector();

  console.assert(await connector.connect() === true);
  console.assert(await connector.health() === true);

  await connector.disconnect();

  console.log("Web Connector OK");
}

void main();
