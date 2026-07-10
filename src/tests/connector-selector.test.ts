import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { selectHealthyConnector } from "@/core/connector-selector";

const api = new ApiConnector();
const web = new WebConnector();

const connector = selectHealthyConnector(
  [api, web],
  [false, true]
);

console.assert(connector === web);

console.log("Connector Selector OK");
