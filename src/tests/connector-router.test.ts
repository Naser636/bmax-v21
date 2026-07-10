import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { routeConnector } from "@/core/connector-router";

const api = new ApiConnector();
const web = new WebConnector();

console.assert(routeConnector([api, web], 1) === web);

console.log("Connector Router OK");
