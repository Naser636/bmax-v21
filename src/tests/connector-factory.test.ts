import { createConnector } from "@/core/connector-factory";

async function main() {
  const api = createConnector("API");
  const web = createConnector("WEB");

  console.assert(await api.connect());
  console.assert(await web.connect());

  console.log("Connector Factory OK");
}

void main();
