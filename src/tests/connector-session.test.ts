import { ApiConnector } from "@/core/api-connector";
import { ConnectorSession } from "@/core/connector-session";

const session = new ConnectorSession(new ApiConnector());

console.assert(session.state === "INIT");

console.log("Connector Session OK");
