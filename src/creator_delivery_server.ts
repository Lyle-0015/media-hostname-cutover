import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, dnsClientFromEnvironment } from "./infrai_dns.js";
import {
  cutOverCreatorDelivery,
  cutoverRequestSchema,
} from "./media_cutover.js";

const port = Number(process.env.PORT ?? 3000);
const dns = dnsClientFromEnvironment();

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/cutovers") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = cutoverRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    send(response, 200, await cutOverCreatorDelivery(dns, input));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid cutover request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, details: error.details });
      return;
    }
    send(response, 502, { error: "Cutover could not be completed" });
  }
}).listen(port, () => {
  console.log(`Creator delivery cutover service listening on http://localhost:${port}`);
});
